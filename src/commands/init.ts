import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { applyEdits, modify, type JSONPath } from "jsonc-parser";
import { RUNTIME_VERSION, WORK_DIR_NAME } from "../constants.js";
import {
  findEntryCandidates,
  inferEntry,
  parseUserConfig,
  readPackageJson,
  type PackageJson,
} from "../config/resolver.js";
import { defaults } from "../config/defaults.js";
import { EasyInnoError } from "../utils/errors.js";
import { log } from "../utils/logger.js";
import { assertSupportedHost } from "../utils/platform.js";
import { run } from "../utils/process.js";

export interface InitOptions {
  yes?: boolean;
  dryRun?: boolean;
  force?: boolean;
  cwd?: string;
}

export interface InitAnswers {
  entry: string;
  applicationType: "console" | "windowed";
  installMode: "perUser" | "perMachine";
  startMenuShortcut: boolean;
  desktopShortcut: boolean;
  launchAfterInstall: boolean;
  outputDirectory: string;
  icon: string;
  appId: string;
}

export interface PlannedEdit {
  path: JSONPath;
  value: unknown;
}

type Obj = Record<string, unknown>;

function getPath(root: unknown, p: JSONPath): unknown {
  let cur: unknown = root;
  for (const key of p) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Obj)[key as string];
  }
  return cur;
}

export function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/^@[^/]+\//, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function defaultAppId(pkg: PackageJson): string {
  const author = typeof pkg.author === "string" ? pkg.author : pkg.author?.name;
  const authorSlug = author ? slug(author.replace(/\s*[<(].*$/, "")) : "";
  const nameSlug = slug(pkg.name ?? "");
  return authorSlug && nameSlug ? `com.${authorSlug}.${nameSlug}` : randomUUID();
}

/** Only fields that are absent get planned, so init never overwrites existing settings. */
export function planEdits(pkg: PackageJson, answers: InitAnswers): PlannedEdit[] {
  const edits: PlannedEdit[] = [];
  const add = (p: JSONPath, value: unknown) => {
    if (getPath(pkg, p) === undefined) edits.push({ path: p, value });
  };
  add(["scripts", "package:win"], "easy-inno build");
  add(["easyInno", "entry"], answers.entry);
  add(["easyInno", "applicationType"], answers.applicationType);
  add(["easyInno", "installer", "outputDirectory"], answers.outputDirectory);
  add(["easyInno", "installer", "installMode"], answers.installMode);
  add(["easyInno", "installer", "startMenuShortcut"], answers.startMenuShortcut);
  add(["easyInno", "installer", "desktopShortcut"], answers.desktopShortcut);
  add(["easyInno", "installer", "launchAfterInstall"], answers.launchAfterInstall);
  add(["easyInno", "installer", "appId"], answers.appId);
  if (answers.icon) add(["easyInno", "installer", "icon"], answers.icon);
  return edits;
}

function detectFormatting(text: string): { insertSpaces: boolean; tabSize: number; eol: string } {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const indent = /^([ \t]+)"/m.exec(text)?.[1] ?? "  ";
  return indent.startsWith("\t")
    ? { insertSpaces: false, tabSize: 1, eol }
    : { insertSpaces: true, tabSize: indent.length, eol };
}

export function applyPlannedEdits(text: string, edits: PlannedEdit[]): string {
  const formattingOptions = detectFormatting(text);
  let result = text;
  for (const edit of edits) {
    result = applyEdits(result, modify(result, edit.path, edit.value, { formattingOptions }));
  }
  return result;
}

/** Returns the new .gitignore text, or null when nothing needs to change. */
export function planGitignore(
  existing: string | null,
  outputDirectory: string,
  ignoreOutput: boolean,
): string | null {
  const lines = new Set((existing ?? "").split(/\r?\n/).map((l) => l.trim().replace(/^\//, "")));
  const has = (entry: string) => lines.has(entry) || lines.has(entry.replace(/\/$/, ""));
  const wanted = [`${WORK_DIR_NAME}/`];
  if (ignoreOutput) wanted.push(`${outputDirectory.replace(/\\/g, "/").replace(/\/?$/, "/")}`);
  const toAdd = wanted.filter((w) => !has(w));
  if (toAdd.length === 0) return null;
  const base = existing ?? "";
  const separator = base.length === 0 || base.endsWith("\n") ? "" : "\n";
  const header = lines.has("# easy-inno") ? "" : "\n# easy-inno\n";
  return `${base}${separator}${base.length === 0 ? header.trimStart() : header}${toAdd.join("\n")}\n`;
}

async function isTrackedByGit(cwd: string, dir: string): Promise<boolean> {
  try {
    const result = await run("git", ["ls-files", "--", dir], { cwd });
    return result.exitCode === 0 && result.tail.trim().length > 0;
  } catch {
    return false;
  }
}

async function collectAnswers(
  pkg: PackageJson,
  cwd: string,
  options: InitOptions,
  existing: ReturnType<typeof parseUserConfig>,
): Promise<InitAnswers> {
  const inferred = inferEntry(pkg, existing);
  const candidates = inferred ? [] : findEntryCandidates(cwd);
  const interactive = !options.yes && Boolean(process.stdin.isTTY);

  let entry = inferred?.entry ?? candidates[0] ?? "";
  const iconDefault = fs.existsSync(path.join(cwd, "assets", "app.ico")) ? "assets/app.ico" : "";
  const answers: InitAnswers = {
    entry,
    applicationType: existing.applicationType ?? defaults.applicationType,
    installMode: existing.installer?.installMode ?? defaults.installer.installMode,
    startMenuShortcut: existing.installer?.startMenuShortcut ?? defaults.installer.startMenuShortcut,
    desktopShortcut: existing.installer?.desktopShortcut ?? defaults.installer.desktopShortcut,
    launchAfterInstall: existing.installer?.launchAfterInstall ?? defaults.installer.launchAfterInstall,
    outputDirectory: existing.installer?.outputDirectory ?? defaults.installer.outputDirectory,
    icon: existing.installer?.icon ?? iconDefault,
    appId: existing.installer?.appId ?? defaultAppId(pkg),
  };

  if (!interactive) {
    if (!entry) {
      throw new EasyInnoError("EASY_INNO_ENTRY_REQUIRED", "No production entry could be determined.", {
        source: "package.json",
        hint: 'Set "main" or "easyInno.entry" (for example "dist/index.js") and run init again.',
      });
    }
    return answers;
  }

  const { select, confirm, input } = await import("@inquirer/prompts");
  log.info(
    `easy-inno initialization\n\nProject: ${pkg.name}\nVersion: ${pkg.version}\n` +
      `Build command: ${pkg.scripts?.build ? "npm run build" : "(none)"}\nRuntime: Node.js ${RUNTIME_VERSION} LTS x64\n`,
  );

  if (!entry) {
    entry = candidates.length > 1
      ? await select({ message: "Select the production entry:", choices: candidates.map((c) => ({ value: c })) })
      : await input({ message: "Enter the production entry:", default: "dist/index.js" });
    answers.entry = entry;
  } else if (!inferred && candidates.length > 1) {
    answers.entry = await select({ message: "Select the production entry:", choices: candidates.map((c) => ({ value: c })) });
  }
  log.info(`Entry: ${answers.entry}\n`);

  if (existing.installer?.installMode === undefined) {
    answers.installMode = await select<"perUser" | "perMachine">({
      message: "Installation mode:",
      choices: [
        { name: "Current user", value: "perUser" },
        { name: "All users", value: "perMachine" },
      ],
    });
  }
  if (existing.applicationType === undefined) {
    answers.applicationType = await select<"console" | "windowed">({
      message: "Application type:",
      choices: [
        { name: "Console", value: "console" },
        { name: "Background/windowed", value: "windowed" },
      ],
    });
  }
  if (existing.installer?.startMenuShortcut === undefined) {
    answers.startMenuShortcut = await confirm({ message: "Create Start Menu shortcut?", default: true });
  }
  if (existing.installer?.desktopShortcut === undefined) {
    answers.desktopShortcut = await confirm({ message: "Create Desktop shortcut?", default: false });
  }
  if (existing.installer?.launchAfterInstall === undefined) {
    answers.launchAfterInstall = await confirm({ message: "Launch application after installation?", default: true });
  }
  if (existing.installer?.outputDirectory === undefined) {
    answers.outputDirectory = await input({ message: "Installer output directory:", default: "release" });
  }
  if (existing.installer?.icon === undefined) {
    answers.icon = (await input({ message: "Application icon (.ico, empty for none):", default: iconDefault })).trim();
  }
  return answers;
}

export async function initCommand(options: InitOptions = {}): Promise<void> {
  assertSupportedHost();
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const packageFile = path.join(cwd, "package.json");
  const { pkg, text } = readPackageJson(cwd);

  if (!pkg.name || !pkg.version) {
    throw new EasyInnoError("EASY_INNO_INVALID_PACKAGE_JSON", 'package.json must contain "name" and "version".', {
      source: packageFile,
    });
  }
  if (pkg.scripts !== undefined && (typeof pkg.scripts !== "object" || pkg.scripts === null || Array.isArray(pkg.scripts))) {
    throw new EasyInnoError("EASY_INNO_INVALID_PACKAGE_JSON", '"scripts" must be an object.', { source: packageFile });
  }

  const existing = parseUserConfig(pkg);
  const answers = await collectAnswers(pkg, cwd, options, existing);

  const edits = planEdits(pkg, answers);
  const configExists = pkg.easyInno !== undefined;
  if (configExists && edits.length > 0 && !options.force) {
    throw new EasyInnoError(
      "EASY_INNO_ALREADY_INITIALIZED",
      `easyInno configuration already exists but is missing: ${edits.map((e) => e.path.join(".")).join(", ")}`,
      { source: "package.json > easyInno", hint: "Run `easy-inno init --force` to add the missing fields (existing values are kept)." },
    );
  }

  const gitignoreFile = path.join(cwd, ".gitignore");
  const gitignoreText = fs.existsSync(gitignoreFile) ? fs.readFileSync(gitignoreFile, "utf8") : null;
  const outputDirectory = existing.installer?.outputDirectory ?? answers.outputDirectory;
  const outputTracked = await isTrackedByGit(cwd, outputDirectory);
  const newGitignore = planGitignore(gitignoreText, outputDirectory, !outputTracked);

  if (edits.length === 0 && newGitignore === null) {
    log.info("easy-inno is already initialized.\n");
    log.ok("package:win script exists");
    log.ok("easyInno configuration exists");
    log.ok(`${WORK_DIR_NAME}/ is ignored`);
    log.info("\nNo changes were made.");
    return;
  }

  if (pkg.scripts?.["package:win"] && pkg.scripts["package:win"] !== "easy-inno build") {
    log.warn(`Existing "package:win" script was kept: ${pkg.scripts["package:win"]}`);
  }
  if (outputTracked) {
    log.warn(`${outputDirectory}/ contains tracked files, so it was not added to .gitignore.`);
  }

  if (options.dryRun) {
    log.info("Dry run: no files were written.\n");
    for (const e of edits) log.info(`+ package.json  ${e.path.join(".")} = ${JSON.stringify(e.value)}`);
    if (newGitignore !== null) log.info(`+ .gitignore    (adds ${WORK_DIR_NAME}/${outputTracked ? "" : `, ${outputDirectory}/`})`);
    return;
  }

  if (edits.length > 0) {
    fs.writeFileSync(packageFile, applyPlannedEdits(text, edits));
    log.info("Updated package.json");
  }
  if (newGitignore !== null) {
    fs.writeFileSync(gitignoreFile, newGitignore);
    log.info("Updated .gitignore");
  }
  log.info("\nRun:\nnpm run package:win");
}
