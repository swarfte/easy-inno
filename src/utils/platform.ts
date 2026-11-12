import { EasyInnoError } from "./errors.js";

export function assertSupportedHost(): void {
  if (process.platform !== "win32") {
    throw new EasyInnoError("EASY_INNO_NOT_WINDOWS", `easy-inno only runs on Windows (detected: ${process.platform}).`, {
      hint: "Run easy-inno on a Windows 10/11 x64 machine or a windows-latest CI runner.",
    });
  }
  if (process.arch !== "x64") {
    throw new EasyInnoError("EASY_INNO_UNSUPPORTED_ARCH", `easy-inno only supports x64 (detected: ${process.arch}).`, {
      hint: "Use a Windows x64 machine and an x64 build of Node.js.",
    });
  }
}

/** Split a command line on whitespace, honouring double quotes. No shell semantics. */
export function splitCommand(command: string): string[] {
  const parts: string[] = [];
  const re = /"([^"]*)"|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(command))) parts.push(m[1] ?? m[2]!);
  return parts;
}
