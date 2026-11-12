import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { redact } from "./logger.js";

export interface RunOptions {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  /** Log file receiving redacted stdout/stderr. */
  logFile?: string;
  /** Only for user-configured command lines (e.g. build.command). */
  shell?: boolean;
}

export interface RunResult {
  exitCode: number;
  /** Last part of combined output, for error messages. */
  tail: string;
}

/** Run a process with shell:false by default. Never rejects on non-zero exit. */
export function run(executable: string, args: string[], options: RunOptions): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    if (options.logFile) {
      fs.mkdirSync(path.dirname(options.logFile), { recursive: true });
      fs.appendFileSync(options.logFile, `\n> ${executable} ${args.join(" ")}\n`);
    }
    const child = spawn(executable, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      shell: options.shell ?? false,
      windowsHide: true,
    });
    let tail = "";
    const onData = (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      if (options.logFile) fs.appendFileSync(options.logFile, redact(text));
      tail = (tail + text).slice(-4000);
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.on("error", reject);
    child.on("close", (code) => resolve({ exitCode: code ?? 1, tail: redact(tail) }));
  });
}
