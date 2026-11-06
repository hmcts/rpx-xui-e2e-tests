import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { NATIVE_HARNESS_SOURCE_FILES } from "./exui-native-sources.mjs";
import { writePublicSummary } from "./exui-evidence-io.mjs";
function canonicalProspective(file) {
  const missing = [];
  let ancestor = path.resolve(file);
  for (;;) {
    try {
      fs.lstatSync(ancestor);
      break;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      missing.unshift(path.basename(ancestor));
      const parent = path.dirname(ancestor);
      assert.notEqual(parent, ancestor, "CI_OUTPUT_PARENT_REQUIRED");
      ancestor = parent;
    }
  }
  return path.join(fs.realpathSync(ancestor), ...missing);
}
export function writeHarnessPublicSummary(
  output,
  verdict,
  receiptAvailable = false,
) {
  const canonical = fs.realpathSync(output);
  assert.equal(path.resolve(output), canonical, "CI_PUBLIC_ROOT_ALIAS");
  const directory = path.join(canonical, "public");
  try {
    fs.mkdirSync(directory, { mode: 0o700 });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
  const info = fs.lstatSync(directory);
  assert(
    info.isDirectory() &&
      !info.isSymbolicLink() &&
      fs.realpathSync(directory) === directory,
    "CI_PUBLIC_DIRECTORY_ESCAPE",
  );
  const file = path.join(directory, "release-assurance-summary.json");
  try {
    const existing = fs.lstatSync(file);
    assert(
      existing.isFile() && !existing.isSymbolicLink(),
      "CI_PUBLIC_FILE_ESCAPE",
    );
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  writePublicSummary(file, verdict, receiptAvailable);
}
export function createFreshHarnessOutput(output, readonlyRoots = []) {
  const canonical = canonicalProspective(output);
  for (const root of readonlyRoots.map(canonicalProspective))
    assert(
      canonical !== root &&
        !canonical.startsWith(root + path.sep) &&
        !root.startsWith(canonical + path.sep),
      "CI_OUTPUT_IMMUTABLE_INPUT_OVERLAP",
    );
  fs.mkdirSync(path.dirname(canonical), { recursive: true });
  try {
    fs.mkdirSync(canonical, { mode: 0o700 });
  } catch (error) {
    if (error.code === "EEXIST") throw Error("FRESH_CI_OUTPUT_REQUIRED");
    throw error;
  }
  fs.mkdirSync(path.join(canonical, "private"), { mode: 0o700 });
  writeHarnessPublicSummary(canonical, { status: "BLOCKED", exitCode: 2 });
  return canonical;
}

// Native controllers stage sealed source files separately; Jenkins keeps owned
// runtime evidence in the checkout's private subtree, outside every source root.
export function createFreshHarnessRuntimeOutput(output, harnessRoot, readonlyInputs = []) {
  const canonical = canonicalProspective(output), harness = fs.realpathSync(harnessRoot);
  assert(output === path.resolve(output) && output === canonical && path.resolve(harnessRoot) === harness,
    "CI_RUNTIME_OUTPUT_ALIAS");
  if (canonical === harness || canonical.startsWith(harness + path.sep)) {
    const privateRoot = path.join(harness, "functional-output/tests/harness/private");
    assert(canonical.startsWith(privateRoot + path.sep), "CI_RUNTIME_OUTPUT_PRIVATE_REQUIRED");
    for (let parent = path.dirname(canonical); parent !== path.dirname(privateRoot); parent = path.dirname(parent)) {
      let info;
      try { info = fs.lstatSync(parent); } catch (error) { if (error.code !== "ENOENT") throw error; }
      assert(info?.isDirectory() && !info.isSymbolicLink() &&
        info.uid === process.getuid() && (info.mode & 0o077) === 0, "CI_RUNTIME_OUTPUT_PRIVATE_REQUIRED");
    }
  }
  // Protect complete source directories (including future siblings), root files,
  // and the complete dependency tree; do not replace them with leaf-only checks.
  const sourceRoots = [...new Set([...NATIVE_HARNESS_SOURCE_FILES.map(file => file.split("/")[0]), "package.json", "yarn.lock", "node_modules"])];
  return createFreshHarnessOutput(canonical, [...readonlyInputs, ...sourceRoots.map(file => path.join(harness, file))]);
}

export function createPrivateSourceDiagnosticOutput(
  output,
  harnessRoot,
  readonlyInputs,
) {
  const resolved = path.resolve(output);
  const canonical = canonicalProspective(resolved);
  assert.equal(resolved, canonical, "SOURCE_DIAGNOSTIC_OUTPUT_ALIAS");
  const harness = fs.realpathSync(harnessRoot);
  assert.equal(
    path.resolve(harnessRoot),
    harness,
    "SOURCE_DIAGNOSTIC_OUTPUT_ALIAS",
  );
  const contains = (parent, child) => {
    const relative = path.relative(parent, child);
    return (
      !path.isAbsolute(relative) &&
      relative !== ".." &&
      !relative.startsWith(".." + path.sep)
    );
  };
  const overlaps = (left, right) =>
    contains(left, right) || contains(right, left);
  for (const relative of [
    "functional-output/tests/harness/public",
    "playwright-report",
    "test-results/odhin-report",
  ]) {
    assert(
      !overlaps(canonical, canonicalProspective(path.join(harness, relative))),
      "SOURCE_DIAGNOSTIC_PUBLIC_OUTPUT_FORBIDDEN",
    );
  }
  for (const input of readonlyInputs) {
    assert(
      !overlaps(canonical, canonicalProspective(input)),
      "SOURCE_DIAGNOSTIC_OUTPUT_IMMUTABLE_INPUT_OVERLAP",
    );
  }
  const parent = path.dirname(canonical);
  let info;
  try {
    info = fs.lstatSync(parent);
  } catch {
    /* Missing parents must not be created. */
  }
  assert(
    info?.isDirectory() &&
      !info.isSymbolicLink() &&
      typeof process.getuid === "function" &&
      info.uid === process.getuid() &&
      (info.mode & 0o077) === 0,
    "SOURCE_DIAGNOSTIC_OUTPUT_PRIVATE_PARENT_REQUIRED",
  );
  try {
    fs.mkdirSync(canonical, { mode: 0o700 });
  } catch (error) {
    if (error.code === "EEXIST")
      throw Error("FRESH_SOURCE_DIAGNOSTIC_OUTPUT_REQUIRED");
    throw error;
  }
  fs.chmodSync(canonical, 0o700);
  return canonical;
}
