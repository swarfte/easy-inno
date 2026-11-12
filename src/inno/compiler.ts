import fs from "node:fs";
import type { ResolvedConfig } from "../config/resolver.js";
import { EasyInnoError } from "../utils/errors.js";
import { ensureDir, isWritableDir } from "../utils/filesystem.js";
import { vendorPaths } from "../utils/paths.js";
import { run } from "../utils/process.js";
import type { WorkPaths } from "../build/staging.js";

export function verifyInnoCompiler(): void {
  const iscc = vendorPaths.iscc();
  if (!fs.existsSync(iscc)) {
    throw new EasyInnoError("EASY_INNO_INNO_COMPILER_MISSING", `Bundled Inno Setup compiler is missing:\n\n${iscc}`, {
      hint: "Reinstall easy-inno, or run `npm run vendor:inno -- --from <Inno Setup dir>` in a source checkout.",
    });
  }
}

export async function verifyOutputWritable(config: ResolvedConfig): Promise<void> {
  if (!(await isWritableDir(config.installer.outputDirectory))) {
    throw new EasyInnoError(
      "EASY_INNO_OUTPUT_NOT_WRITABLE",
      `Output directory is not writable:\n\n${config.installer.outputDirectory}`,
      {
        source: "package.json > easyInno.installer.outputDirectory",
        hint: "Choose a writable directory or fix its permissions.",
      },
    );
  }
}

/** Run the bundled ISCC.exe only: never PATH, registry or a user-installed Inno Setup. */
export async function compileInstaller(config: ResolvedConfig, paths: WorkPaths): Promise<void> {
  verifyInnoCompiler();
  await ensureDir(config.installer.outputDirectory);
  await fs.promises.rm(config.installer.outputFile, { force: true });

  const result = await run(vendorPaths.iscc(), ["/Qp", paths.issFile], {
    cwd: paths.generatedDir,
    logFile: paths.innoLog,
  });
  if (result.exitCode !== 0) {
    throw new EasyInnoError(
      "EASY_INNO_INNO_COMPILE_FAILED",
      `Inno Setup compiler failed with exit code ${result.exitCode}:\n\n${result.tail.trim()}`,
      { source: paths.issFile, hint: `See ${paths.innoLog}` },
    );
  }
  if (!fs.existsSync(config.installer.outputFile)) {
    throw new EasyInnoError(
      "EASY_INNO_INSTALLER_NOT_CREATED",
      `Installer was not created:\n\n${config.installer.outputFile}`,
      { hint: `See ${paths.innoLog}` },
    );
  }
}
