import fs from "node:fs";
import path from "node:path";
import type { ResolvedConfig } from "../config/resolver.js";
import { EasyInnoError } from "../utils/errors.js";
import { runCommandLine } from "./npm.js";
import type { WorkPaths } from "./staging.js";

export async function runProjectBuild(config: ResolvedConfig, paths: WorkPaths): Promise<void> {
  if (!config.build.command) return;
  const result = await runCommandLine(config.build.command, config.projectRoot, paths.buildLog);
  if (result.exitCode !== 0) {
    throw new EasyInnoError(
      "EASY_INNO_BUILD_FAILED",
      `Project build failed with exit code ${result.exitCode}:\n\n${config.build.command}\n\n${result.tail.trim()}`,
      { source: "package.json > easyInno.build.command", hint: `See ${paths.buildLog}` },
    );
  }
}

export function verifyEntryExists(config: ResolvedConfig): void {
  const entryPath = path.join(config.projectRoot, config.entry);
  if (!fs.existsSync(entryPath)) {
    throw new EasyInnoError("EASY_INNO_ENTRY_NOT_FOUND", `Production entry does not exist:\n\n${entryPath}`, {
      source: config.entrySource,
      hint: "Run the project build first or correct easyInno.entry.",
    });
  }
}

export function verifyLockfile(config: ResolvedConfig): void {
  if (!fs.existsSync(path.join(config.projectRoot, "package-lock.json"))) {
    throw new EasyInnoError("EASY_INNO_LOCKFILE_REQUIRED", "package-lock.json was not found.", {
      source: path.join(config.projectRoot, "package-lock.json"),
      hint:
        'easy-inno uses "npm ci --omit=dev" to create a reproducible production dependency tree.\n\n' +
        "Run:\nnpm install\n\nThen commit package-lock.json and try again.",
    });
  }
}
