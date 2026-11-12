import path from "node:path";
import { run, type RunResult } from "../utils/process.js";
import { splitCommand } from "../utils/platform.js";
import { vendorPaths } from "../utils/paths.js";

/** Environment with the bundled Node.js first on PATH, so scripts see the packaged runtime. */
export function bundledEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, ...extra };
  const pathKey = Object.keys(env).find((k) => k.toLowerCase() === "path") ?? "PATH";
  env[pathKey] = `${vendorPaths.nodeDir()}${path.delimiter}${env[pathKey] ?? ""}`;
  return env;
}

/**
 * Run a configured command line. `npm ...` commands use the bundled node + npm-cli.js
 * (shell-free, fixed Node ABI); anything else runs through the shell as the project
 * owner wrote it in package.json.
 */
export function runCommandLine(command: string, cwd: string, logFile: string): Promise<RunResult> {
  const env = bundledEnv();
  const [program, ...args] = splitCommand(command);
  if (program?.toLowerCase() === "npm") {
    return run(vendorPaths.nodeExe(), [vendorPaths.npmCli(), ...args], { cwd, env, logFile });
  }
  return run(command, [], { cwd, env, logFile, shell: true });
}

export function isNpmCommand(command: string): boolean {
  return splitCommand(command)[0]?.toLowerCase() === "npm";
}
