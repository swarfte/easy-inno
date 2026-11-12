import type { ResolvedConfig } from "../config/resolver.js";
import { EasyInnoError } from "../utils/errors.js";
import { isNpmCommand, runCommandLine } from "./npm.js";
import type { WorkPaths } from "./staging.js";

/** Install production dependencies inside staging/app using the bundled Node/npm (fixed ABI). */
export async function installDependencies(config: ResolvedConfig, paths: WorkPaths): Promise<void> {
  const command = config.build.dependencyCommand;
  if (!isNpmCommand(command)) {
    throw new EasyInnoError(
      "EASY_INNO_INVALID_CONFIG",
      `easyInno.build.dependencyCommand must be an npm command, got: ${command}`,
      { source: "package.json > easyInno.build.dependencyCommand" },
    );
  }
  const result = await runCommandLine(command, paths.stagingApp, paths.dependenciesLog);
  if (result.exitCode !== 0) {
    throw new EasyInnoError(
      "EASY_INNO_DEPENDENCY_INSTALL_FAILED",
      `Production dependency installation failed (exit code ${result.exitCode}):\n\n${command}\n\n${result.tail.trim()}`,
      {
        source: "package.json > easyInno.build.dependencyCommand",
        hint: `See ${paths.dependenciesLog}. Native modules must provide Windows x64 binaries for Node.js 26.13.0.`,
      },
    );
  }
}
