import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import {
  digestBytes,
  loadRunEvidence,
  readEvidenceArtifact,
} from "./exui-evidence-io.mjs";
import { getReleasePolicy } from "./exui-release-policy.mjs";
import { validatePromotionReceipt } from "./exui-release-evidence.mjs";
import { validateNativePhaseFinalization } from "./exui-native-ci-ownership.mjs";

const read = (file) => JSON.parse(fs.readFileSync(file));
const sha = (value) =>
  typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value);
const within = (a, b) => {
  const relative = path.relative(a, b);
  return (
    relative === "" ||
    (!path.isAbsolute(relative) &&
      relative !== ".." &&
      !relative.startsWith(".." + path.sep))
  );
};
const safeRelative = (value) =>
  typeof value === "string" &&
  value.length > 0 &&
  !path.isAbsolute(value) &&
  !/[\\\x00-\x1f\x7f]/.test(value) &&
  value.split("/").every((part) => part && part !== "." && part !== "..");

function canonical(file, exists = true) {
  assert(
    typeof file === "string" &&
      path.isAbsolute(file) &&
      path.resolve(file) === file &&
      !/[\x00-\x1f\x7f]/.test(file),
    "PRIVATE_PATH_REQUIRED",
  );
  const parts = file.split(path.sep).filter(Boolean);
  let current = path.parse(file).root;
  for (let index = 0; index < parts.length; index++) {
    current = path.join(current, parts[index]);
    if (!exists && index === parts.length - 1) break;
    const info = fs.lstatSync(current);
    assert(!info.isSymbolicLink(), "PRIVATE_PATH_ALIAS");
    if (index !== parts.length - 1)
      assert(info.isDirectory(), "PRIVATE_PARENT_REQUIRED");
  }
  if (exists) assert.equal(fs.realpathSync(file), file, "PRIVATE_PATH_ALIAS");
  return file;
}
function inventory(root, omitManifest = false, privateModes = false) {
  const rows = [],
    names = new Set();
  assert(fs.lstatSync(root).isDirectory(), "PRIVATE_DIRECTORY_REQUIRED");
  if (privateModes)
    assert.equal(
      fs.statSync(root).mode & 0o777,
      0o700,
      "PRIVATE_MODE_REQUIRED",
    );
  function visit(directory, prefix = "") {
    for (const name of fs.readdirSync(directory).sort()) {
      const relative = prefix ? `${prefix}/${name}` : name;
      if (omitManifest && relative === "manifest.json") continue;
      assert(safeRelative(relative), "PRIVATE_RELATIVE_PATH_REQUIRED");
      assert(!names.has(relative.toLowerCase()), "PRIVATE_PATH_COLLISION");
      names.add(relative.toLowerCase());
      const file = path.join(root, relative),
        info = fs.lstatSync(file);
      assert(
        !info.isSymbolicLink() && (info.isFile() || info.isDirectory()),
        "PRIVATE_REGULAR_ENTRIES_REQUIRED",
      );
      if (privateModes)
        assert.equal(
          info.mode & 0o777,
          info.isDirectory() ? 0o700 : 0o600,
          "PRIVATE_MODE_REQUIRED",
        );
      if (info.isDirectory()) {
        rows.push({ path: relative, kind: "directory" });
        visit(file, relative);
      } else {
        const fd = fs.openSync(
          file,
          fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
        );
        try {
          const opened = fs.fstatSync(fd);
          assert(
            opened.isFile() &&
              opened.ino === info.ino &&
              opened.dev === info.dev,
            "PRIVATE_SOURCE_CHANGED",
          );
          const bytes = fs.readFileSync(fd);
          rows.push({
            path: relative,
            kind: "file",
            byteLength: bytes.length,
            digest: digestBytes(bytes),
          });
        } finally {
          fs.closeSync(fd);
        }
      }
    }
  }
  visit(root);
  return rows.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}
function parseExpected(bytes) {
  const expected = JSON.parse(bytes);
  const keys = [
    "runId",
    "harnessCommit",
    "releaseScopeId",
    "policyDigest",
    "identity",
    "harnessSourceDigest",
    "harnessDependencyDigest",
    "browserDigest",
    "nativeAuthority",
    "evidenceManifestDigest",
    "receiptArtifactDigest",
  ];
  assert.deepEqual(
    Object.keys(expected).sort(),
    keys.sort(),
    "PRIVATE_EXPECTATION_FIELDS_REQUIRED",
  );
  assert.equal(expected.nativeAuthority, true, "PRIVATE_NATIVE_REQUIRED");
  for (const key of [
    "harnessSourceDigest",
    "harnessDependencyDigest",
    "browserDigest",
    "evidenceManifestDigest",
    "receiptArtifactDigest",
  ])
    assert(sha(expected[key]), "PRIVATE_EXPECTATION_DIGEST_REQUIRED");
  return expected;
}
function validatePhase(directory, expected, observed) {
  const { evidenceManifestDigest, receiptArtifactDigest, ...launch } = expected;
  assert.deepEqual(
    Object.keys(observed).sort(),
    ["expected", "terminal"],
    "PRIVATE_OBSERVED_TERMINAL_REQUIRED",
  );
  assert.deepEqual(
    observed.expected,
    launch,
    "PRIVATE_LAUNCH_EXPECTATION_MISMATCH",
  );
  assert.deepEqual(
    Object.keys(observed.terminal).sort(),
    ["code", "signal"],
    "PRIVATE_OBSERVED_TERMINAL_REQUIRED",
  );
  assert(
    observed.terminal.signal === null &&
      [0, 1, 2].includes(observed.terminal.code),
    "PRIVATE_PRODUCER_COMPLETION_REQUIRED",
  );
  for (const name of [
    "interrupted-run.json",
    "interrupted-gate.json",
    "incomplete-cleanup-run.json",
    "incomplete-cleanup-gate.json",
    "controller-cancelled.json",
    "cancelled.json",
  ])
    assert(
      !fs.existsSync(path.join(directory, name)),
      "PRIVATE_QUARANTINED_PHASE",
    );
  const policy = getReleasePolicy(expected.releaseScopeId);
  const loaded = loadRunEvidence(path.join(directory, "run.json"), policy);
  assert.equal(
    loaded.input.manifest.runtimeMetadata.isolation,
    "native-separate-api-owned-network-none",
    "PRIVATE_NATIVE_REQUIRED",
  );
  assert.equal(
    loaded.input.manifest.runtimeMetadata.candidateAuthorityIsolation,
    "separate-container-no-evidence-mount",
    "PRIVATE_NATIVE_REQUIRED",
  );
  const raw = read(path.join(directory, "run.json"));
  for (const reference of raw.executionArtifacts) {
    const execution = readEvidenceArtifact(directory, reference).value;
    assert(
      execution.terminalState === "completed" &&
        [0, 1].includes(execution.runnerExitCode),
      "PRIVATE_UNFINISHED_EXECUTION",
    );
    const report = readEvidenceArtifact(
      directory,
      execution.resultArtifact,
    ).value;
    assert(
      report.complete === true &&
        ["passed", "failed"].includes(report.status) &&
        report.tests.every(
          (test) => !["timedOut", "interrupted"].includes(test.status),
        ),
      "PRIVATE_UNFINISHED_REPORT",
    );
  }
  const gateBytes = fs.readFileSync(path.join(directory, "gate.json")),
    gate = JSON.parse(gateBytes);
  assert.equal(
    digestBytes(gateBytes),
    receiptArtifactDigest,
    "PRIVATE_RECEIPT_DIGEST_MISMATCH",
  );
  assert.equal(
    loaded.evidenceManifestDigest,
    evidenceManifestDigest,
    "PRIVATE_EVIDENCE_DIGEST_MISMATCH",
  );
  assert.deepEqual(gate, loaded.receipt, "PRIVATE_GATE_RECOMPUTATION_MISMATCH");
  // Compare identity independently of a possibly already-BLOCKED proof verdict.
  for (const key of [
    "runId",
    "harnessCommit",
    "releaseScopeId",
    "policyDigest",
    "identity",
    "evidenceManifestDigest",
  ])
    assert.deepEqual(gate[key], expected[key], "PRIVATE_IDENTITY_MISMATCH");
  const metadata = loaded.input.manifest.runtimeMetadata;
  for (const key of [
    "harnessSourceDigest",
    "harnessDependencyDigest",
    "browserDigest",
  ])
    assert.equal(
      metadata[key],
      expected[key],
      "PRIVATE_IMPLEMENTATION_DIGEST_MISMATCH",
    );
  assert.deepEqual(
    validatePromotionReceipt(gate, expected),
    gate.verdict,
    "PRIVATE_PROMOTION_MISMATCH",
  );
  assert.equal(
    observed.terminal.code,
    gate.verdict.exitCode,
    "PRIVATE_PRODUCER_EXIT_MISMATCH",
  );
  validateNativePhaseFinalization(
    directory,
    loaded.input.executions,
    observed.terminal,
  );
  return {
    runId: gate.runId,
    harnessCommit: gate.harnessCommit,
    releaseScopeId: gate.releaseScopeId,
    policyDigest: gate.policyDigest,
    identity: gate.identity,
    evidenceManifestDigest,
    receiptArtifactDigest,
    originalStatus: gate.verdict.status,
  };
}
function privateWrite(file, bytes) {
  fs.writeFileSync(file, bytes, { flag: "wx", mode: 0o600 });
  fs.chmodSync(file, 0o600);
}
function result(manifestDigest, originalStatus) {
  return {
    kind: "private-evidence-operation",
    manifestDigest,
    originalStatus,
    releaseApproval: false,
  };
}

export function exportPrivateEvidence({
  phase,
  expected: expectedFile,
  terminal,
  destination,
}) {
  for (const file of [phase, expectedFile, terminal]) canonical(file);
  canonical(destination, false);
  const parent = fs.statSync(path.dirname(destination));
  assert(
    parent.isDirectory() &&
      (parent.mode & 0o777) === 0o700 &&
      parent.uid === process.getuid(),
    "PRIVATE_PARENT_PERMISSIONS_REQUIRED",
  );
  assert(
    !/(?:^|\/)functional-output\/tests\/harness\/public(?:\/|$)/.test(
      destination,
    ),
    "PRIVATE_DESTINATION_REQUIRED",
  );
  assert(
    !within(phase, expectedFile) &&
      !within(phase, terminal) &&
      expectedFile !== terminal,
    "PRIVATE_SEPARATE_INPUT_REQUIRED",
  );
  for (const file of [phase, expectedFile, terminal])
    assert(
      !within(file, destination) && !within(destination, file),
      "PRIVATE_INPUT_OUTPUT_OVERLAP",
    );
  assert(
    fs.lstatSync(expectedFile).isFile() && fs.lstatSync(terminal).isFile(),
    "PRIVATE_REGULAR_INPUT_REQUIRED",
  );
  const expectedBytes = fs.readFileSync(expectedFile),
    terminalBytes = fs.readFileSync(terminal);
  const expected = parseExpected(expectedBytes),
    observed = JSON.parse(terminalBytes);
  const initial = inventory(phase);
  const validation = validatePhase(phase, expected, observed);
  // Exclusive root reservation never replaces an existing directory, even an empty one.
  fs.mkdirSync(destination, { mode: 0o700 });
  fs.chmodSync(destination, 0o700);
  fs.mkdirSync(path.join(destination, "phase"), { mode: 0o700 });
  fs.chmodSync(path.join(destination, "phase"), 0o700);
  for (const entry of initial) {
    const to = path.join(destination, "phase", entry.path);
    if (entry.kind === "directory") {
      fs.mkdirSync(to, { mode: 0o700 });
      fs.chmodSync(to, 0o700);
    } else {
      const fd = fs.openSync(
        path.join(phase, entry.path),
        fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
      );
      try {
        const bytes = fs.readFileSync(fd);
        assert.equal(
          digestBytes(bytes),
          entry.digest,
          "PRIVATE_SOURCE_CHANGED",
        );
        privateWrite(to, bytes);
      } finally {
        fs.closeSync(fd);
      }
    }
  }
  fs.mkdirSync(path.join(destination, "transport"), { mode: 0o700 });
  fs.chmodSync(path.join(destination, "transport"), 0o700);
  privateWrite(
    path.join(destination, "transport/expected.json"),
    expectedBytes,
  );
  privateWrite(
    path.join(destination, "transport/producer-terminal.json"),
    terminalBytes,
  );
  assert.deepEqual(inventory(phase), initial, "PRIVATE_SOURCE_CHANGED");
  assert(
    fs.readFileSync(expectedFile).equals(expectedBytes) &&
      fs.readFileSync(terminal).equals(terminalBytes),
    "PRIVATE_SOURCE_CHANGED",
  );
  assert.deepEqual(
    inventory(path.join(destination, "phase")),
    initial,
    "PRIVATE_COPY_MISMATCH",
  );
  assert.deepEqual(
    validatePhase(path.join(destination, "phase"), expected, observed),
    validation,
    "PRIVATE_COPY_VALIDATION_MISMATCH",
  );
  const manifest = {
    schemaVersion: 1,
    kind: "native-phase-evidence",
    validation,
    inventory: inventory(destination, false, true),
  };
  const bytes = Buffer.from(JSON.stringify(manifest, null, 2) + "\n");
  const temporary = path.join(destination, `.manifest-${randomUUID()}.tmp`);
  let completionIdentity;
  try {
    privateWrite(temporary, bytes);
    completionIdentity = fs.lstatSync(temporary);
    fs.linkSync(temporary, path.join(destination, "manifest.json"));
    fs.rmSync(temporary, { force: true });
  } catch (error) {
    // The fresh private root belongs to this operation. Never leave its completion marker after failed finalization.
    try {
      const marker = path.join(destination, "manifest.json"),
        info = fs.lstatSync(marker);
      if (
        completionIdentity &&
        info.isFile() &&
        info.ino === completionIdentity.ino &&
        info.dev === completionIdentity.dev
      )
        fs.unlinkSync(marker);
    } catch {
      /* Never remove a foreign marker or replace the original publication failure. */
    }
    try {
      fs.rmSync(temporary, { force: true });
    } catch {
      /* Preserve the original publication error. */
    }
    throw error;
  }
  return result(digestBytes(bytes), validation.originalStatus);
}

export function verifyPrivateEvidence({
  bundle,
  expected: expectedFile,
  manifestDigest,
}) {
  canonical(bundle);
  canonical(expectedFile);
  assert(fs.lstatSync(expectedFile).isFile(), "PRIVATE_REGULAR_INPUT_REQUIRED");
  assert(sha(manifestDigest), "PRIVATE_MANIFEST_DIGEST_REQUIRED");
  assert(
    !within(bundle, expectedFile),
    "PRIVATE_SEPARATE_EXPECTATION_REQUIRED",
  );
  const manifestFile = path.join(bundle, "manifest.json");
  canonical(manifestFile);
  assert(fs.lstatSync(manifestFile).isFile(), "PRIVATE_MANIFEST_REQUIRED");
  assert.equal(
    fs.statSync(manifestFile).mode & 0o777,
    0o600,
    "PRIVATE_MODE_REQUIRED",
  );
  const bytes = fs.readFileSync(manifestFile);
  assert.equal(
    digestBytes(bytes),
    manifestDigest,
    "PRIVATE_MANIFEST_DIGEST_MISMATCH",
  );
  const manifest = JSON.parse(bytes);
  assert(
    manifest.schemaVersion === 1 && manifest.kind === "native-phase-evidence",
    "PRIVATE_MANIFEST_REQUIRED",
  );
  assert.deepEqual(
    Object.keys(manifest).sort(),
    ["inventory", "kind", "schemaVersion", "validation"],
    "PRIVATE_MANIFEST_REQUIRED",
  );
  assert(
    Array.isArray(manifest.inventory) &&
      manifest.inventory.every((entry) => safeRelative(entry.path)),
    "PRIVATE_INVENTORY_REQUIRED",
  );
  assert(
    isDeepStrictEqual(inventory(bundle, true, true), manifest.inventory),
    "PRIVATE_INVENTORY_MISMATCH",
  );
  const expected = parseExpected(fs.readFileSync(expectedFile));
  assert.deepEqual(
    read(path.join(bundle, "transport/expected.json")),
    expected,
    "PRIVATE_EXTERNAL_EXPECTATION_MISMATCH",
  );
  const observed = read(path.join(bundle, "transport/producer-terminal.json"));
  const validation = validatePhase(
    path.join(bundle, "phase"),
    expected,
    observed,
  );
  assert.deepEqual(
    validation,
    manifest.validation,
    "PRIVATE_VALIDATION_MISMATCH",
  );
  return result(manifestDigest, validation.originalStatus);
}
