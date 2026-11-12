import { Command } from "commander";
import { buildCommand } from "./commands/build.js";
import { cleanCommand } from "./commands/clean.js";
import { configCommand } from "./commands/config.js";
import { doctorCommand } from "./commands/doctor.js";
import { initCommand } from "./commands/init.js";
import { formatError } from "./utils/errors.js";
import { log } from "./utils/logger.js";
import { toolVersion } from "./version.js";

export function createProgram(): Command {
  const program = new Command();
  program
    .name("easy-inno")
    .description("Zero-setup Windows installer builder for Node.js applications")
    .version(toolVersion(), "-v, --version")
    .showHelpAfterError();

  program
    .command("init")
    .description("Add easy-inno settings to package.json")
    .option("-y, --yes", "accept defaults without prompting")
    .option("--dry-run", "show planned changes without writing files")
    .option("--force", "add missing fields to an existing easyInno configuration")
    .action((opts) => initCommand(opts));

  program
    .command("build")
    .description("Build a Windows Setup .exe")
    .action(async () => {
      await buildCommand();
    });

  program
    .command("doctor")
    .description("Check the environment, project and bundled tools")
    .action(async () => {
      const result = await doctorCommand();
      if (result.failures > 0) process.exitCode = 1;
    });

  program
    .command("config")
    .description("Show the effective configuration")
    .option("--json", "print as JSON")
    .action((opts) => configCommand(opts));

  program
    .command("clean")
    .description("Remove the .easy-inno working directory")
    .option("--all", "also remove the installer output directory")
    .action((opts) => cleanCommand(opts));

  program
    .command("version")
    .description("Print the easy-inno version")
    .action(() => console.log(toolVersion()));

  return program;
}

export async function run(argv: string[]): Promise<void> {
  try {
    await createProgram().parseAsync(argv);
  } catch (error) {
    if (process.argv.includes("build")) log.error("easy-inno build failed\n");
    log.error(formatError(error));
    process.exitCode = 1;
  }
}
