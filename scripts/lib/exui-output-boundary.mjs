import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
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
