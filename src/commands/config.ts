import { RUNTIME_VERSION } from "../constants.js";
import { resolveConfig } from "../config/resolver.js";
import { log } from "../utils/logger.js";

export function configCommand(options: { json?: boolean; cwd?: string } = {}): void {
  const config = resolveConfig(options.cwd ?? process.cwd());

  if (options.json) {
    const { packageJson: _omit, ...rest } = config;
    console.log(JSON.stringify(rest, null, 2));
    return;
  }

  const yesNo = (v: boolean) => (v ? "yes" : "no");
  const lines = [
    ["Application", [
      ["Name", config.displayName],
      ["Version", config.version],
      ["Publisher", config.publisher],
      ["Entry", config.entry],
      ["Type", config.applicationType],
    ]],
    ["Build", [
      ["Command", config.build.command ?? "(none)"],
      ["Dependencies", config.build.dependencyCommand],
    ]],
    ["Runtime", [
      ["Node.js", `${RUNTIME_VERSION} LTS`],
      ["Platform", "Windows"],
      ["Architecture", "x64"],
      ...Object.entries(config.runtime.environment),
    ]],
    ["Installer", [
      ["AppId", config.installer.appId + (config.installer.appIdIsGenerated ? " (derived; run easy-inno init to save it)" : "")],
      ["Mode", config.installer.installMode === "perUser" ? "per-user" : "per-machine"],
      ["Output", config.installer.outputFile],
      ["Start Menu shortcut", yesNo(config.installer.startMenuShortcut)],
      ["Desktop shortcut", yesNo(config.installer.desktopShortcut)],
      ["Launch after install", yesNo(config.installer.launchAfterInstall)],
    ]],
  ] as const;

  for (const [title, rows] of lines) {
    log.info(log.bold(title));
    for (const [key, value] of rows) log.info(`${key}: ${value}`);
    log.info();
  }
}
