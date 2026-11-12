import fs from "node:fs";
import path from "node:path";
import Handlebars from "handlebars";
import type { ResolvedConfig } from "../config/resolver.js";
import { EasyInnoError } from "../utils/errors.js";
import { vendorPaths } from "../utils/paths.js";
import { launcherExeName, type WorkPaths } from "../build/staging.js";
import {
  assertDirectiveKey,
  directiveValue,
  escapeConstants,
  quoteConstantParam,
  quoteParam,
} from "./escape.js";

export function validateIcon(config: ResolvedConfig): string | null {
  if (!config.installer.icon) return null;
  const iconPath = path.resolve(config.projectRoot, config.installer.icon);
  const fail = (message: string) =>
    new EasyInnoError("EASY_INNO_ICON_INVALID", message, {
      source: "package.json > easyInno.installer.icon",
      hint: "Provide a valid .ico file path relative to the project root.",
    });
  if (path.extname(iconPath).toLowerCase() !== ".ico") throw fail(`Icon must be a .ico file:\n\n${iconPath}`);
  if (!fs.existsSync(iconPath)) throw fail(`Icon file does not exist:\n\n${iconPath}`);
  const header = Buffer.alloc(4);
  const fd = fs.openSync(iconPath, "r");
  try {
    fs.readSync(fd, header, 0, 4, 0);
  } finally {
    fs.closeSync(fd);
  }
  // ICONDIR: reserved = 0, type = 1
  if (header.readUInt16LE(0) !== 0 || header.readUInt16LE(2) !== 1) {
    throw fail(`File is not a valid .ico:\n\n${iconPath}`);
  }
  return iconPath;
}

export function buildIssContext(
  config: ResolvedConfig,
  paths: WorkPaths,
  toolVersion: string,
): Record<string, unknown> {
  const exeName = launcherExeName(config);
  const perMachine = config.installer.installMode === "perMachine";
  const iconFile = validateIcon(config);
  const workingDir = `{app}\\${escapeConstants(config.launcher.workingDirectory.replace(/\//g, "\\"))}`;
  const exeFile = quoteConstantParam("{app}\\", exeName);
  const folder = escapeConstants(config.safeName);

  const extraDirectives = Object.entries(config.advanced.additionalInnoDirectives).map(([key, value]) => {
    assertDirectiveKey(key);
    return { key, value: directiveValue(value) };
  });

  return {
    toolVersion,
    appId: escapeConstants(config.installer.appId),
    appName: escapeConstants(config.displayName),
    appVersion: escapeConstants(config.version),
    publisher: escapeConstants(config.publisher),
    defaultDirName: perMachine ? `{autopf}\\${folder}` : `{localappdata}\\Programs\\${folder}`,
    disableDirPage: config.installer.allowChangeInstallDirectory ? "no" : "yes",
    outputDir: directiveValue(config.installer.outputDirectory),
    outputBaseFilename: directiveValue(path.basename(config.installer.outputFile, ".exe")),
    privileges: perMachine ? "admin" : "lowest",
    compression: directiveValue(config.installer.compression),
    solidCompression: config.installer.solidCompression ? "yes" : "no",
    uninstallIcon: `{app}\\${escapeConstants(exeName)}`,
    iconFile: iconFile ? directiveValue(iconFile) : null,
    extraDirectives,
    stagingSource: quoteParam(path.join(paths.staging, "*")),
    desktopTaskFlags: config.installer.desktopShortcut ? "" : "; Flags: unchecked",
    startMenuShortcut: config.installer.startMenuShortcut,
    groupIconName: quoteConstantParam("{group}\\", config.displayName),
    desktopIconName: quoteConstantParam("{autodesktop}\\", config.displayName),
    exeFile,
    workingDir: quoteParam(workingDir),
    launchAfterInstall: config.installer.launchAfterInstall,
    runDescription: quoteParam(`Launch ${escapeConstants(config.displayName)}`),
  };
}

export async function generateIss(
  config: ResolvedConfig,
  paths: WorkPaths,
  toolVersion: string,
): Promise<string> {
  const templateSource = await fs.promises.readFile(vendorPaths.template(), "utf8");
  const template = Handlebars.compile(templateSource, { noEscape: true });
  const script = template(buildIssContext(config, paths, toolVersion)).replace(/\r?\n/g, "\r\n");
  await fs.promises.mkdir(paths.generatedDir, { recursive: true });
  // BOM so ISCC reads non-ASCII names (e.g. Chinese product names) as UTF-8.
  await fs.promises.writeFile(paths.issFile, "\uFEFF" + script, "utf8");
  return script;
}
