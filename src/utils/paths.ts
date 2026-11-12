import path from "node:path";
import { fileURLToPath } from "node:url";
import { RUNTIME_VERSION } from "../constants.js";

/** Root of the easy-inno npm package (works from both src/ and dist/). */
export const packageRoot = fileURLToPath(new URL("../../", import.meta.url));

export function vendorDir(): string {
  return process.env.EASY_INNO_VENDOR_DIR
    ? path.resolve(process.env.EASY_INNO_VENDOR_DIR)
    : path.join(packageRoot, "vendor");
}

export const vendorPaths = {
  nodeDir: () => path.join(vendorDir(), "node", "win-x64", RUNTIME_VERSION),
  nodeExe: () => path.join(vendorPaths.nodeDir(), "node.exe"),
  nodeLicense: () => path.join(vendorPaths.nodeDir(), "LICENSE"),
  npmCli: () => path.join(vendorPaths.nodeDir(), "node_modules", "npm", "bin", "npm-cli.js"),
  innoDir: () => path.join(vendorDir(), "inno-setup"),
  iscc: () => path.join(vendorPaths.innoDir(), "ISCC.exe"),
  innoLicense: () => path.join(vendorPaths.innoDir(), "LICENSE.txt"),
  launcher: (type: "console" | "windowed") =>
    path.join(vendorDir(), "launcher", `launcher-${type}.exe`),
  template: () => path.join(packageRoot, "templates", "setup.iss.hbs"),
};
