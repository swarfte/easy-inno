import fs from "node:fs";
import path from "node:path";
import { packageRoot } from "./utils/paths.js";

export function toolVersion(): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8")) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}
