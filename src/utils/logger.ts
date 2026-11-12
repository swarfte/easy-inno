import fs from "node:fs";
import ora from "ora";
import pc from "picocolors";

export const log = {
  info: (msg = "") => console.log(msg),
  ok: (msg: string) => console.log(`${pc.green("✓")} ${msg}`),
  warn: (msg: string) => console.log(`${pc.yellow("!")} ${msg}`),
  fail: (msg: string) => console.log(`${pc.red("✗")} ${msg}`),
  error: (msg: string) => console.error(pc.red(msg)),
  bold: (msg: string) => pc.bold(msg),
  dim: (msg: string) => pc.dim(msg),
};

/** Run an async task with a spinner that resolves to a ✓ line. */
export async function step<T>(label: string, task: () => Promise<T>): Promise<T> {
  const spinner = ora({ text: label }).start();
  try {
    const result = await task();
    spinner.stopAndPersist({ symbol: pc.green("✓"), text: label });
    return result;
  } catch (error) {
    spinner.stopAndPersist({ symbol: pc.red("✗"), text: label });
    throw error;
  }
}

/** Remove well-known secret shapes from text destined for logs. */
export function redact(text: string): string {
  return text
    .replace(/(_authToken\s*=\s*)\S+/gi, "$1[REDACTED]")
    .replace(/(_password\s*=\s*)\S+/gi, "$1[REDACTED]")
    .replace(/\bnpm_[A-Za-z0-9]{20,}\b/g, "[REDACTED]")
    .replace(/(\/\/[^:\s/]+:)[^@\s/]+@/g, "$1[REDACTED]@");
}

export function appendLog(file: string, text: string): void {
  fs.appendFileSync(file, redact(text));
}
