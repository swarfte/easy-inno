import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { RUNTIME_ARCH, RUNTIME_VERSION } from "../constants.js";
import { EasyInnoError } from "../utils/errors.js";
import { assertSafePattern } from "../utils/filesystem.js";
import { defaults } from "./defaults.js";
import { easyInnoSchema, type EasyInnoUserConfig } from "./schema.js";

export interface PackageJson {
  name?: string;
  productName?: string;
  version?: string;
  description?: string;
  author?: string | { name?: string };
  license?: string;
  main?: string;
  bin?: string | Record<string, string>;
  scripts?: Record<string, string>;
  easyInno?: unknown;
  [key: string]: unknown;
}

export interface ResolvedConfig {
  projectRoot: string;
  packageJson: PackageJson;
  name: string;
  displayName: string;
  /** File-system friendly name used for the exe, install folder and output name. */
  safeName: string;
  version: string;
  publisher: string;
  description: string;
  license: string;
  entry: string;
  entrySource: string;
  applicationType: "console" | "windowed";
  build: {
    command: string | null;
    dependencyCommand: string;
    include: string[];
    exclude: string[];
  };
  runtime: {
    version: string;
    architecture: string;
    nodeArguments: string[];
    applicationArguments: string[];
    environment: Record<string, string>;
  };
  launcher: {
    workingDirectory: string;
    forwardArguments: boolean;
    waitForExit: boolean;
    showConsole: boolean;
  };
  installer: {
    appId: string;
    appIdIsGenerated: boolean;
    outputDirectory: string;
    outputName: string;
    outputFile: string;
    installMode: "perUser" | "perMachine";
    icon: string | null;
    startMenuShortcut: boolean;
    desktopShortcut: boolean;
    launchAfterInstall: boolean;
    allowChangeInstallDirectory: boolean;
    compression: string;
    solidCompression: boolean;
  };
  advanced: {
    keepStaging: boolean;
    keepIss: boolean;
    additionalInnoDirectives: Record<string, string>;
  };
}

export function readPackageJson(projectRoot: string): { pkg: PackageJson; text: string } {
  const file = path.join(projectRoot, "package.json");
  if (!fs.existsSync(file)) {
    throw new EasyInnoError("EASY_INNO_PACKAGE_NOT_FOUND", "package.json was not found.", {
      source: file,
      hint: "Run easy-inno from the root directory of your Node.js project.",
    });
  }
  const text = fs.readFileSync(file, "utf8");
  let pkg: unknown;
  try {
    pkg = JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch (cause) {
    throw new EasyInnoError("EASY_INNO_INVALID_PACKAGE_JSON", "package.json is not valid JSON.", {
      source: file,
      hint: (cause as Error).message,
      cause,
    });
  }
  if (typeof pkg !== "object" || pkg === null || Array.isArray(pkg)) {
    throw new EasyInnoError("EASY_INNO_INVALID_PACKAGE_JSON", "package.json must be a JSON object.", {
      source: file,
    });
  }
  return { pkg: pkg as PackageJson, text };
}

export function parseUserConfig(pkg: PackageJson): EasyInnoUserConfig {
  if (pkg.easyInno === undefined) return {};
  const parsed = easyInnoSchema.safeParse(pkg.easyInno);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - easyInno.${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new EasyInnoError("EASY_INNO_INVALID_CONFIG", `Invalid easyInno configuration:\n${issues}`, {
      source: "package.json > easyInno",
      hint: "Fix the listed fields and try again.",
    });
  }
  return parsed.data;
}

/** Strip characters that are unsafe for file names while keeping unicode letters. */
export function toSafeName(value: string): string {
  const cleaned = value.replace(/^@[^/]+\//, "").replace(/[^\p{L}\p{N}._-]+/gu, "");
  return cleaned.replace(/^[.-]+/, "") || "app";
}

export function inferEntry(pkg: PackageJson, user: EasyInnoUserConfig): { entry: string; source: string } | null {
  if (user.entry) return { entry: user.entry, source: "package.json > easyInno.entry" };
  if (typeof pkg.main === "string" && pkg.main) return { entry: pkg.main, source: "package.json > main" };
  if (typeof pkg.bin === "string") return { entry: pkg.bin, source: "package.json > bin" };
  if (pkg.bin && typeof pkg.bin === "object") {
    const values = Object.values(pkg.bin);
    if (values.length === 1) return { entry: values[0]!, source: "package.json > bin" };
  }
  return null;
}

export const ENTRY_CANDIDATES = [
  "dist/index.js",
  "dist/main.js",
  "dist/server.js",
  "build/index.js",
  "build/main.js",
  "lib/index.js",
  "index.js",
];

export function findEntryCandidates(projectRoot: string): string[] {
  return ENTRY_CANDIDATES.filter((c) => fs.existsSync(path.join(projectRoot, c)));
}

/** Deterministic GUID so the AppId stays stable even when never written by init. */
export function deriveAppId(name: string): string {
  const h = createHash("sha1").update(`easy-inno:${name}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

export function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\$\{(\w+)\}/g, (m, key: string) => vars[key] ?? m);
}

function sanitizeFileName(value: string): string {
  return value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/[. ]+$/, "") || "setup";
}

export function resolveConfig(projectRoot: string): ResolvedConfig {
  const root = path.resolve(projectRoot);
  const { pkg } = readPackageJson(root);
  const user = parseUserConfig(pkg);

  if (!pkg.name || typeof pkg.name !== "string") {
    throw new EasyInnoError("EASY_INNO_INVALID_PACKAGE_JSON", 'package.json is missing "name".', {
      source: "package.json > name",
    });
  }
  if (!pkg.version || typeof pkg.version !== "string") {
    throw new EasyInnoError("EASY_INNO_INVALID_PACKAGE_JSON", 'package.json is missing "version".', {
      source: "package.json > version",
    });
  }

  const runtimeVersion = user.runtime?.version ?? RUNTIME_VERSION;
  const runtimeArch = user.runtime?.architecture ?? RUNTIME_ARCH;
  if (runtimeVersion !== RUNTIME_VERSION || runtimeArch !== RUNTIME_ARCH) {
    throw new EasyInnoError(
      "EASY_INNO_UNSUPPORTED_RUNTIME",
      `easy-inno v1 only includes Node.js ${RUNTIME_VERSION} ${RUNTIME_ARCH}.\n\n` +
        `Configured:\nNode.js ${runtimeVersion} ${runtimeArch}\n\n` +
        `Supported:\nNode.js ${RUNTIME_VERSION} ${RUNTIME_ARCH}`,
      {
        source: "package.json > easyInno.runtime",
        hint: "Remove easyInno.runtime.version / architecture or set them to the supported values.",
      },
    );
  }

  const inferred = inferEntry(pkg, user);
  if (!inferred) {
    throw new EasyInnoError("EASY_INNO_ENTRY_REQUIRED", "No production entry could be determined.", {
      source: "package.json",
      hint: 'Set "main" or "easyInno.entry" (for example "dist/index.js"), or run "easy-inno init".',
    });
  }
  const entry = inferred.entry.replace(/\\/g, "/").replace(/^\.\//, "");
  assertSafePattern(entry, inferred.source);

  const displayName = (typeof pkg.productName === "string" && pkg.productName) || pkg.name;
  const safeName = toSafeName(displayName);
  const author = typeof pkg.author === "string" ? pkg.author : pkg.author?.name;
  const publisher = (author ?? "").replace(/\s*[<(].*$/, "").trim() || displayName;

  const applicationType = user.applicationType ?? defaults.applicationType;
  const installerUser = user.installer ?? {};
  const include = user.build?.include ?? defaults.build.include;
  const exclude = user.build?.exclude ?? defaults.build.exclude;
  include.forEach((p) => assertSafePattern(p, "package.json > easyInno.build.include"));

  const outputDirectory = path.resolve(root, installerUser.outputDirectory ?? defaults.installer.outputDirectory);
  const outputName = installerUser.outputName ?? defaults.installer.outputName;
  const outputBase = sanitizeFileName(
    interpolate(outputName, { name: safeName, version: pkg.version, arch: RUNTIME_ARCH }),
  );

  const appId = installerUser.appId;
  const workingDirectory = user.launcher?.workingDirectory ?? defaults.launcher.workingDirectory;
  assertSafePattern(workingDirectory, "package.json > easyInno.launcher.workingDirectory");

  return {
    projectRoot: root,
    packageJson: pkg,
    name: pkg.name,
    displayName,
    safeName,
    version: pkg.version,
    publisher,
    description: pkg.description ?? "",
    license: pkg.license ?? "",
    entry,
    entrySource: inferred.source,
    applicationType,
    build: {
      command:
        user.build && "command" in user.build
          ? (user.build.command ?? null)
          : pkg.scripts?.build
            ? "npm run build"
            : null,
      dependencyCommand: user.build?.dependencyCommand ?? defaults.build.dependencyCommand,
      include,
      exclude,
    },
    runtime: {
      version: RUNTIME_VERSION,
      architecture: RUNTIME_ARCH,
      nodeArguments: user.runtime?.nodeArguments ?? defaults.runtime.nodeArguments,
      applicationArguments: user.runtime?.applicationArguments ?? defaults.runtime.applicationArguments,
      environment: { ...defaults.runtime.environment, ...user.runtime?.environment },
    },
    launcher: {
      workingDirectory,
      forwardArguments: user.launcher?.forwardArguments ?? defaults.launcher.forwardArguments,
      waitForExit: user.launcher?.waitForExit ?? defaults.launcher.waitForExit,
      showConsole:
        applicationType === "windowed" ? false : (user.launcher?.showConsole ?? defaults.launcher.showConsole),
    },
    installer: {
      appId: appId ?? deriveAppId(pkg.name),
      appIdIsGenerated: !appId,
      outputDirectory,
      outputName,
      outputFile: path.join(outputDirectory, `${outputBase}.exe`),
      installMode: installerUser.installMode ?? defaults.installer.installMode,
      icon: installerUser.icon ? installerUser.icon : null,
      startMenuShortcut: installerUser.startMenuShortcut ?? defaults.installer.startMenuShortcut,
      desktopShortcut: installerUser.desktopShortcut ?? defaults.installer.desktopShortcut,
      launchAfterInstall: installerUser.launchAfterInstall ?? defaults.installer.launchAfterInstall,
      allowChangeInstallDirectory:
        installerUser.allowChangeInstallDirectory ?? defaults.installer.allowChangeInstallDirectory,
      compression: installerUser.compression ?? defaults.installer.compression,
      solidCompression: installerUser.solidCompression ?? defaults.installer.solidCompression,
    },
    advanced: {
      keepStaging: user.advanced?.keepStaging ?? defaults.advanced.keepStaging,
      keepIss: user.advanced?.keepIss ?? defaults.advanced.keepIss,
      additionalInnoDirectives: user.advanced?.additionalInnoDirectives ?? {},
    },
  };
}
