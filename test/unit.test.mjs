import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { resolveConfig, interpolate, toSafeName, inferEntry } from "../dist/config/resolver.js";
import { escapeConstants, quoteParam } from "../dist/inno/escape.js";
import { assertSafePattern, assertSafeToDelete, isInside } from "../dist/utils/filesystem.js";
import { formatError, EasyInnoError } from "../dist/utils/errors.js";
import { applyPlannedEdits, planEdits, planGitignore, defaultAppId } from "../dist/commands/init.js";
import { buildIssContext } from "../dist/inno/generator.js";
import { workPaths } from "../dist/build/staging.js";
import { redact } from "../dist/utils/logger.js";
import { splitCommand } from "../dist/utils/platform.js";

function project(pkg, files = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "easy-inno-test-"));
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify(pkg, null, 2));
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), content);
  }
  return dir;
}

test("entry inference order: easyInno.entry, main, single bin", () => {
  assert.equal(inferEntry({ main: "a.js" }, { entry: "b.js" }).entry, "b.js");
  assert.equal(inferEntry({ main: "a.js" }, {}).entry, "a.js");
  assert.equal(inferEntry({ bin: "cli.js" }, {}).entry, "cli.js");
  assert.equal(inferEntry({ bin: { a: "a.js", b: "b.js" } }, {}), null);
});

test("defaults are applied and package metadata is resolved", () => {
  const dir = project({ name: "my-node-app", productName: "My Node App", version: "1.2.3", author: { name: "Ben" }, main: "dist/index.js", scripts: { build: "tsc" } });
  const c = resolveConfig(dir);
  assert.equal(c.displayName, "My Node App");
  assert.equal(c.safeName, "MyNodeApp");
  assert.equal(c.publisher, "Ben");
  assert.equal(c.build.command, "npm run build");
  assert.equal(c.build.dependencyCommand, "npm ci --omit=dev");
  assert.equal(c.runtime.environment.NODE_ENV, "production");
  assert.equal(c.installer.installMode, "perUser");
  assert.equal(path.basename(c.installer.outputFile), "MyNodeApp-Setup-1.2.3.exe");
});

test("build.command null disables the build; user env merges with NODE_ENV", () => {
  const dir = project({
    name: "a", version: "1.0.0", main: "index.js", scripts: { build: "tsc" },
    easyInno: { build: { command: null }, runtime: { environment: { FOO: "bar" } } },
  });
  const c = resolveConfig(dir);
  assert.equal(c.build.command, null);
  assert.deepEqual(c.runtime.environment, { NODE_ENV: "production", FOO: "bar" });
});

test("unsupported runtime version is rejected", () => {
  const dir = project({ name: "a", version: "1.0.0", main: "i.js", easyInno: { runtime: { version: "24.0.0" } } });
  assert.throws(() => resolveConfig(dir), (e) => e.code === "EASY_INNO_UNSUPPORTED_RUNTIME" && /24\.0\.0/.test(e.message));
});

test("unknown config keys and missing entry are rejected", () => {
  const bad = project({ name: "a", version: "1.0.0", main: "i.js", easyInno: { bogus: 1 } });
  assert.throws(() => resolveConfig(bad), (e) => e.code === "EASY_INNO_INVALID_CONFIG");
  const noEntry = project({ name: "a", version: "1.0.0" });
  assert.throws(() => resolveConfig(noEntry), (e) => e.code === "EASY_INNO_ENTRY_REQUIRED");
});

test("windowed applications never show a console", () => {
  const dir = project({ name: "a", version: "1.0.0", main: "i.js", easyInno: { applicationType: "windowed" } });
  assert.equal(resolveConfig(dir).launcher.showConsole, false);
});

test("appId is stable: stored value wins, derived value is deterministic", () => {
  const stored = project({ name: "a", version: "1.0.0", main: "i.js", easyInno: { installer: { appId: "com.x.a" } } });
  assert.equal(resolveConfig(stored).installer.appId, "com.x.a");
  const d1 = resolveConfig(project({ name: "a", version: "1.0.0", main: "i.js" })).installer.appId;
  const d2 = resolveConfig(project({ name: "a", version: "2.0.0", main: "i.js" })).installer.appId;
  assert.equal(d1, d2);
});

test("output name interpolation and safe names (unicode kept)", () => {
  assert.equal(interpolate("${name}-Setup-${version}", { name: "App", version: "1.0.0" }), "App-Setup-1.0.0");
  assert.equal(toSafeName("我的 應用"), "我的應用");
  assert.equal(toSafeName("@scope/pkg"), "pkg");
});

test("Inno escaping", () => {
  assert.equal(escapeConstants("{abc}"), "{{abc}");
  assert.equal(escapeConstants("a\nb"), "a b");
  assert.equal(quoteParam('C:\\a "b"\\x'), '"C:\\a ""b""\\x"');
});

test("path traversal prevention", () => {
  for (const bad of ["../x", "C:\\x", "\\\\server\\share", "/etc/passwd", "a/../../b"]) {
    assert.throws(() => assertSafePattern(bad, "test"), (e) => e.code === "EASY_INNO_PATH_OUTSIDE_PROJECT", bad);
  }
  assertSafePattern("dist/**/*", "test");
  assert.equal(isInside("C:\\proj", "C:\\proj\\a"), true);
  assert.equal(isInside("C:\\proj", "C:\\other"), false);
});

test("refuses to delete project root, home, drive root or their parents", () => {
  const root = path.join(os.tmpdir(), "proj");
  assert.throws(() => assertSafeToDelete(root, root));
  assert.throws(() => assertSafeToDelete(os.tmpdir(), root));
  assert.throws(() => assertSafeToDelete(os.homedir(), root));
  assert.throws(() => assertSafeToDelete(path.parse(root).root, root));
  assertSafeToDelete(path.join(root, "release"), root);
});

test("errors include code, message, source and hint", () => {
  const text = formatError(new EasyInnoError("EASY_INNO_ENTRY_NOT_FOUND", "missing", { source: "package.json > main", hint: "fix it" }));
  for (const part of ["EASY_INNO_ENTRY_NOT_FOUND", "missing", "package.json > main", "fix it"]) assert.ok(text.includes(part));
});

test("init edits are minimal, idempotent and preserve formatting", () => {
  const answers = { entry: "dist/index.js", applicationType: "console", installMode: "perUser", startMenuShortcut: true, desktopShortcut: false, launchAfterInstall: true, outputDirectory: "release", icon: "", appId: "com.x.a" };
  const original = '{\n\t"name": "a",\n\t"version": "1.0.0",\n\t"scripts": {\n\t\t"build": "tsc"\n\t}\n}\n';
  const pkg = JSON.parse(original);
  const next = applyPlannedEdits(original, planEdits(pkg, answers));
  const parsed = JSON.parse(next);
  assert.equal(parsed.scripts["package:win"], "easy-inno build");
  assert.equal(parsed.easyInno.installer.appId, "com.x.a");
  assert.ok(next.includes('\t"easyInno"'), "keeps tab indentation");
  assert.deepEqual(planEdits(parsed, answers), []);
  // existing values are never overwritten
  parsed.easyInno.installer.installMode = "perMachine";
  assert.ok(!planEdits(parsed, answers).some((e) => e.path.includes("installMode")));
});

test("gitignore planning is idempotent", () => {
  const first = planGitignore("node_modules/\n", "release", true);
  assert.equal(first, "node_modules/\n\n# easy-inno\n.easy-inno/\nrelease/\n");
  assert.equal(planGitignore(first, "release", true), null);
  assert.equal(planGitignore("", "release", false), "# easy-inno\n.easy-inno/\n");
});

test("default AppId is reverse-domain from author, UUID otherwise", () => {
  assert.equal(defaultAppId({ name: "my-app", author: "Benjamin <b@x.com>" }), "com.benjamin.my-app");
  assert.match(defaultAppId({ name: "my-app" }), /^[0-9a-f-]{36}$/);
});

test("generated ISS context: per-user vs per-machine, escaping, tasks", () => {
  const dir = project({ name: "a", version: "1.0.0", productName: "My {App}", main: "i.js", easyInno: { installer: { installMode: "perMachine", desktopShortcut: true } } });
  const config = resolveConfig(dir);
  const ctx = buildIssContext(config, workPaths(config), "0.1.0");
  assert.equal(ctx.privileges, "admin");
  assert.equal(ctx.defaultDirName, "{autopf}\\My{{App}".replace("My{{App}", "MyApp"));
  assert.equal(ctx.appName, "My {{App}");
  assert.equal(ctx.desktopTaskFlags, "");
  assert.equal(ctx.exeFile, '"{app}\\MyApp.exe"');
});

test("secrets are redacted from logs; commands split without a shell", () => {
  assert.ok(!redact("//registry.npmjs.org/:_authToken=abc123").includes("abc123"));
  assert.deepEqual(splitCommand('npm run "build prod" --x'), ["npm", "run", "build prod", "--x"]);
});
