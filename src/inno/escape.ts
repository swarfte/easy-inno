import { EasyInnoError } from "../utils/errors.js";

/** Strip control characters / line breaks that could inject extra script lines. */
function singleLine(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
}

/**
 * Escape a value that Inno Setup expands as constants. A literal "{" must be written "{{".
 * Used for AppId, AppName, DefaultDirName, ... (never for already-built constants like {app}).
 */
export function escapeConstants(value: string): string {
  return singleLine(value).replace(/\{/g, "{{");
}

/** Quote a parameter value for [Files]/[Icons]/[Run] sections ("" escapes a quote). */
export function quoteParam(value: string): string {
  return `"${singleLine(value).replace(/"/g, '""')}"`;
}

/** Quote a [Files]/[Icons] parameter that mixes constants ({app}) with a literal fragment. */
export function quoteConstantParam(prefixConstant: string, literal: string): string {
  return quoteParam(`${prefixConstant}${escapeConstants(literal)}`);
}

/** Validate a user supplied key for [Setup] additionalInnoDirectives. */
export function assertDirectiveKey(key: string): void {
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(key)) {
    throw new EasyInnoError("EASY_INNO_INVALID_CONFIG", `Invalid Inno Setup directive name: "${key}"`, {
      source: "package.json > easyInno.advanced.additionalInnoDirectives",
    });
  }
}

/** Make a plain directive value safe (single line). */
export function directiveValue(value: string): string {
  return singleLine(value);
}
