import fs from "node:fs";
import { RUNTIME_VERSION } from "../constants.js";
import { resolveConfig } from "../config/resolver.js";
import { collectFiles } from "../build/collector.js";
import { installDependencies } from "../build/dependencies.js";
import { writeManifest } from "../build/manifest.js";
import { runProjectBuild, verifyEntryExists, verifyLockfile } from "../build/project-builder.js";
import { copyRuntime, verifyRuntime } from "../build/runtime.js";
import { createStaging, installLauncher, workPaths } from "../build/staging.js";
import { compileInstaller, verifyInnoCompiler, verifyOutputWritable } from "../inno/compiler.js";
import { generateIss, validateIcon } from "../inno/generator.js";
import { assertSafeToDelete, removeDir } from "../utils/filesystem.js";
import { log, step } from "../utils/logger.js";
import { assertSupportedHost } from "../utils/platform.js";
import { toolVersion } from "../version.js";

export interface BuildResult {
  installer: string;
  sizeBytes: number;
  durationSeconds: number;
}

export async function buildCommand(options: { cwd?: string } = {}): Promise<BuildResult> {
  const started = Date.now();
  const version = toolVersion();

  assertSupportedHost();
  const config = resolveConfig(options.cwd ?? process.cwd());
  const paths = workPaths(config);

  log.info(`easy-inno v${version}\n`);
  log.info(`${log.bold("Application")}\n${config.displayName} ${config.version}\n`);
  log.info(`${log.bold("Runtime")}\nNode.js ${RUNTIME_VERSION} LTS x64\n`);

  await step("Configuration validated", async () => {
    assertSafeToDelete(config.installer.outputDirectory, config.projectRoot);
    verifyRuntime();
    verifyInnoCompiler();
    validateIcon(config);
    verifyLockfile(config);
    await verifyOutputWritable(config);
    await fs.promises.mkdir(paths.logsDir, { recursive: true });
  });

  if (config.build.command) {
    await step("Project build completed", () => runProjectBuild(config, paths));
  } else {
    log.ok("Project build skipped (no build command)");
  }
  verifyEntryExists(config);

  const collected = await step("Application files collected", async () => {
    const result = await collectFiles(config);
    await createStaging(config, result.files, paths);
    return result;
  });
  for (const warning of collected.warnings) log.warn(`WARNING: ${warning}`);

  await step("Production dependencies installed", () => installDependencies(config, paths));
  await step("Node.js runtime copied", () => copyRuntime(paths));
  await step("Launcher configured", async () => {
    await installLauncher(config, paths);
    await writeManifest(config, paths);
  });
  await step("Inno Setup script generated", () => generateIss(config, paths, version));
  await step("Installer compiled", () => compileInstaller(config, paths));

  const sizeBytes = fs.statSync(config.installer.outputFile).size;
  const durationSeconds = (Date.now() - started) / 1000;

  await fs.promises.writeFile(
    paths.reportFile,
    JSON.stringify(
      {
        easyInno: version,
        application: { name: config.displayName, version: config.version },
        runtime: RUNTIME_VERSION,
        installer: config.installer.outputFile,
        sizeBytes,
        durationSeconds,
        warnings: collected.warnings,
      },
      null,
      2,
    ) + "\n",
  );

  if (!config.advanced.keepStaging) await removeDir(paths.staging);
  if (!config.advanced.keepIss) await removeDir(paths.generatedDir);

  log.info(`\nInstaller created:\n\n${config.installer.outputFile}\n`);
  log.info(`Size: ${(sizeBytes / 1024 / 1024).toFixed(1)} MB`);
  log.info(`Duration: ${durationSeconds.toFixed(1)} seconds`);
  return { installer: config.installer.outputFile, sizeBytes, durationSeconds };
}
