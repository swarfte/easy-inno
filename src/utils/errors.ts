export type ErrorCode =
  | "EASY_INNO_NOT_WINDOWS"
  | "EASY_INNO_UNSUPPORTED_ARCH"
  | "EASY_INNO_PACKAGE_NOT_FOUND"
  | "EASY_INNO_INVALID_PACKAGE_JSON"
  | "EASY_INNO_ALREADY_INITIALIZED"
  | "EASY_INNO_ENTRY_REQUIRED"
  | "EASY_INNO_ENTRY_NOT_FOUND"
  | "EASY_INNO_BUILD_FAILED"
  | "EASY_INNO_LOCKFILE_REQUIRED"
  | "EASY_INNO_DEPENDENCY_INSTALL_FAILED"
  | "EASY_INNO_RUNTIME_MISSING"
  | "EASY_INNO_RUNTIME_MISMATCH"
  | "EASY_INNO_LAUNCHER_MISSING"
  | "EASY_INNO_ICON_INVALID"
  | "EASY_INNO_OUTPUT_NOT_WRITABLE"
  | "EASY_INNO_INNO_COMPILER_MISSING"
  | "EASY_INNO_INNO_COMPILE_FAILED"
  | "EASY_INNO_INSTALLER_NOT_CREATED"
  | "EASY_INNO_PATH_OUTSIDE_PROJECT"
  | "EASY_INNO_UNSUPPORTED_RUNTIME"
  | "EASY_INNO_INVALID_CONFIG";

export interface EasyInnoErrorOptions {
  /** Related path or configuration source, e.g. "package.json > easyInno.entry". */
  source?: string;
  /** Actionable fix suggestion. */
  hint?: string;
  cause?: unknown;
}

export class EasyInnoError extends Error {
  readonly code: ErrorCode;
  readonly source?: string;
  readonly hint?: string;

  constructor(code: ErrorCode, message: string, options: EasyInnoErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = "EasyInnoError";
    this.code = code;
    this.source = options.source;
    this.hint = options.hint;
  }
}

/** Format an error as multi-line text: code, description, source and fix hint. */
export function formatError(error: unknown): string {
  if (error instanceof EasyInnoError) {
    const lines = [error.code, "", error.message];
    if (error.source) lines.push("", "Configured by:", error.source);
    if (error.hint) lines.push("", error.hint);
    return lines.join("\n");
  }
  const message = error instanceof Error ? error.message : String(error);
  return ["EASY_INNO_UNEXPECTED_ERROR", "", message].join("\n");
}
