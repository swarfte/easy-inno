import fs from "node:fs";
import path from "node:path";
import { RUNTIME_CONFIG_NAME, WORK_DIR_NAME } from "../constants.js";
import type { ResolvedConfig } from "../config/resolver.js";
import { EasyInnoError } from "../utils/errors.js";
import { ensureDir, removeDir } from "../utils/filesystem.js";
import { vendorPaths } from "../utils/paths.js";

export interface WorkPaths {
  workDir: string;
  staging: string;
  stagingApp: string;
  stagingRuntime: string;
  generatedDir: string;
  issFile: string;
  manifestsDir: string;
  manifestFile: string;
  reportFile: string;
  logsDir: string;
  buildLog: string;
  dependenciesLog: string;
  innoLog: string;
}

export function workPaths(config: ResolvedConfig): WorkPaths {
  const workDir = path.join(config.projectRoot, WORK_DIR_NAME);
  const staging = path.join(workDir, "staging");
  return {
    workDir,
    staging,
    stagingApp: path.join(staging, "app"),
    stagingRuntime: path.join(staging, "runtime"),
    generatedDir: path.join(workDir, "generated"),
    issFile: path.join(workDir, "generated", "setup.iss"),
    manifestsDir: path.join(workDir, "manifests"),
    manifestFile: path.join(workDir, "manifests", "staging-manifest.json"),
    reportFile: path.join(workDir, "manifests", "build-report.json"),
    logsDir: path.join(workDir, "logs"),
    buildLog: path.join(workDir, "logs", "build.log"),
    dependenciesLog: path.join(workDir, "logs", "dependencies.log"),
    innoLog: path.join(workDir, "logs", "inno.log"),
  };
}

/** Root-package lifecycle scripts must not run again inside staging (e.g. husky "prepare"). */
const LIFECYCLE_SCRIPTS = [
  "preinstall",
  "install",
  "postinstall",
  "prepublish",
  "preprepare",
  "prepare",
  "postprepare",
];

export async function createStaging(
  config: ResolvedConfig,
  files: string[],
  paths: WorkPaths,
): Promise<void> {
  await removeDir(paths.staging);
  await ensureDir(paths.stagingApp);
  await ensureDir(paths.logsDir);
  await ensureDir(paths.manifestsDir);

  for (const rel of files) {
    const from = path.join(config.projectRoot, rel);
    const to = path.join(paths.stagingApp, rel);
    await ensureDir(path.dirname(to));
    await fs.promises.copyFile(from, to);
  }

  const stagedPackage = path.join(paths.stagingApp, "package.json");
  const pkg = JSON.parse(await fs.promises.readFile(stagedPackage, "utf8")) as {
    scripts?: Record<string, string>;
  };
  if (pkg.scripts) {
    for (const key of LIFECYCLE_SCRIPTS) delete pkg.scripts[key];
    await fs.promises.writeFile(stagedPackage, JSON.stringify(pkg, null, 2) + "\n");
  }
}

export function launcherExeName(config: ResolvedConfig): string {
  return `${config.safeName}.exe`;
}

export async function installLauncher(config: ResolvedConfig, paths: WorkPaths): Promise<void> {
  const source = vendorPaths.launcher(config.applicationType);
  if (!fs.existsSync(source)) {
    throw new EasyInnoError("EASY_INNO_LAUNCHER_MISSING", `Launcher executable is missing:\n\n${source}`, {
      hint: "Reinstall easy-inno, or run `npm run vendor:launcher` when working from a source checkout.",
    });
  }
  await fs.promises.copyFile(source, path.join(paths.staging, launcherExeName(config)));

  const runtimeConfig = {
    schemaVersion: 1,
    appName: config.displayName,
    appVersion: config.version,
    dataDirName: config.safeName,
    runtime: "runtime/node.exe",
    entry: `app/${config.entry}`,
    workingDirectory: config.launcher.workingDirectory,
    nodeArguments: config.runtime.nodeArguments,
    applicationArguments: config.runtime.applicationArguments,
    forwardArguments: config.launcher.forwardArguments,
    waitForExit: config.launcher.waitForExit,
    showConsole: config.launcher.showConsole,
    environment: config.runtime.environment,
  };
  await fs.promises.writeFile(
    path.join(paths.staging, RUNTIME_CONFIG_NAME),
    JSON.stringify(runtimeConfig, null, 2) + "\n",
  );
}
