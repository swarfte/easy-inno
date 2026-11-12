import fs from "node:fs";
import path from "node:path";
import fg from "fast-glob";
import type { ResolvedConfig } from "../config/resolver.js";
import { EasyInnoError } from "../utils/errors.js";
import { assertInside, isInside } from "../utils/filesystem.js";

/** Always excluded, no matter what the user includes. */
const HARD_IGNORE = [".git/**", "**/.git/**", ".easy-inno/**", "**/node_modules/**", "**/.npmrc"];

/** Excluded by default; an include pattern that explicitly targets them re-enables them. */
const SOFT_IGNORE = [
  ".github/**",
  ".vscode/**",
  ".idea/**",
  "coverage/**",
  "tests/**",
  "test/**",
  "**/*.log",
  ".env",
  ".env.*",
];

export interface CollectResult {
  files: string[];
  warnings: string[];
}

function softIgnoresFor(include: string[]): string[] {
  const norm = include.map((p) => p.replace(/\\/g, "/").replace(/^\.\//, ""));
  return SOFT_IGNORE.filter((ignore) => {
    const base = ignore.replace(/\/\*\*$/, "").replace(/^\*\*\//, "");
    const targeted = norm.some((p) => p === ignore || p === base || p.startsWith(`${base}/`) || p.startsWith(base));
    return !targeted;
  });
}

export async function collectFiles(config: ResolvedConfig): Promise<CollectResult> {
  const root = config.projectRoot;
  const include = [...new Set([...config.build.include, "package.json", "package-lock.json"])];

  const ignore = [...HARD_IGNORE, ...softIgnoresFor(include), ...config.build.exclude];
  if (isInside(root, config.installer.outputDirectory)) {
    const rel = path.relative(root, config.installer.outputDirectory).replace(/\\/g, "/");
    if (rel) ignore.push(`${rel}/**`);
  }

  const matched = await fg(include, {
    cwd: root,
    dot: true,
    onlyFiles: true,
    followSymbolicLinks: false,
    unique: true,
    ignore,
  });

  const files: string[] = [];
  const warnings: string[] = [];
  for (const rel of matched.sort()) {
    const abs = path.join(root, rel);
    const stat = await fs.promises.lstat(abs);
    if (stat.isSymbolicLink()) {
      assertInside(root, await fs.promises.realpath(abs), `Symlink target of ${rel}`);
    }
    files.push(path.normalize(rel));
    if (/^\.env(\.|$)/i.test(path.basename(rel))) {
      warnings.push(
        `Environment file included: ${rel}\n` +
          "  It will be stored inside the installer and may be read by anyone who can access or extract it.\n" +
          "  Do not include passwords, private API keys or access tokens.",
      );
    }
  }

  const entryRel = path.normalize(config.entry);
  if (!files.some((f) => f.toLowerCase() === entryRel.toLowerCase())) {
    throw new EasyInnoError(
      "EASY_INNO_ENTRY_NOT_FOUND",
      `Production entry is not part of the collected files:\n\n${path.join(root, config.entry)}`,
      {
        source: config.entrySource,
        hint: 'Add the entry to "easyInno.build.include" (for example its directory) or correct the entry path.',
      },
    );
  }
  return { files, warnings };
}
