const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const api = () => import("./run-harness-assurance.mjs");

test("contradictory native status and missing diagnostic exit cannot become success", async () => {
  const { runAssuranceSequence } = await api();
  let prepared = false;
  await assert.rejects(
    () =>
      runAssuranceSequence({
        native: async () => ({ status: "BLOCKED", exitCode: 0 }),
        descriptor: async () => {
          prepared = true;
        },
        collect: async () => ({ status: "passed", exitCode: 0 }),
      }),
    /NATIVE_VERDICT_REQUIRED/,
  );
  assert.equal(prepared, false);
  await assert.rejects(
    () =>
      runAssuranceSequence({
        native: async () => ({ status: "PASS", exitCode: 0 }),
        descriptor: async () => "/owned/request.json",
        collect: async () => ({ status: "passed" }),
      }),
    /DIAGNOSTIC_VERDICT_REQUIRED/,
  );
});

test("blocked native policy remains blocked despite a passing diagnostic collection", async () => {
  const { runAssuranceSequence } = await api();
  const order = [];
  const result = await runAssuranceSequence({
    native: async () => {
      order.push("native");
      return { status: "BLOCKED", exitCode: 2 };
    },
    descriptor: async (verdict) => {
      assert.equal(verdict.status, "BLOCKED");
      order.push("descriptor");
      return "/owned/request.json";
    },
    collect: async (file) => {
      assert.equal(file, "/owned/request.json");
      order.push("collect");
      return { status: "passed", exitCode: 0 };
    },
  });
  assert.deepEqual(order, ["native", "descriptor", "collect"]);
  assert.deepEqual(result, {
    nativeStatus: "BLOCKED",
    diagnosticStatus: "passed",
    exitCode: 2,
    releaseApproval: false,
  });
});
test("missing validated native evidence cannot proceed to a green report", async () => {
  const { runAssuranceSequence } = await api();
  let collected = false;
  await assert.rejects(
    () =>
      runAssuranceSequence({
        native: async () => ({ status: "BLOCKED", exitCode: 2 }),
        descriptor: async () => {
          throw Error("INCOMPLETE");
        },
        collect: async () => {
          collected = true;
        },
      }),
    /INCOMPLETE/,
  );
  assert.equal(collected, false);
});
test("diagnostic failure also prevents a passing combined command", async () => {
  const { runAssuranceSequence } = await api();
  const result = await runAssuranceSequence({
    native: async () => ({ status: "PASS", exitCode: 0 }),
    descriptor: async () => "/owned/request.json",
    collect: async () => ({ status: "failed", exitCode: 1 }),
  });
  assert.equal(result.exitCode, 1);
  assert.equal(result.releaseApproval, false);
});
test("contradictory diagnostic failure with exit zero is rejected", async () => {
  const { runAssuranceSequence } = await api();
  await assert.rejects(
    () =>
      runAssuranceSequence({
        native: async () => ({ status: "PASS", exitCode: 0 }),
        descriptor: async () => "/owned/request.json",
        collect: async () => ({ status: "failed", exitCode: 0 }),
      }),
    /DIAGNOSTIC_VERDICT_REQUIRED/,
  );
});

test("malformed job with valid CLI syntax withdraws the earlier owned report before blocking", async (t) => {
  const { spawnSync } = require("node:child_process");
  const { pathToFileURL } = require("node:url");
  const Reporter = require("./harness-public-odhin-reporter.cjs");
  const overview = require("./harness-public-overview.cjs");
  const previous = process.cwd();
  const root = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), "assurance-invalid-job-"),
  );
  process.chdir(root);
  t.after(() => {
    process.chdir(previous);
    fs.rmSync(root, { recursive: true, force: true });
  });
  // Exercise the actual CLI and owned-report validator in a temporary root.
  // Only the native runner is replaced, so this regression cannot start Docker.
  fs.mkdirSync(path.join(root, "scripts/lib"), { recursive: true });
  fs.copyFileSync(
    path.join(__dirname, "run-harness-assurance.mjs"),
    path.join(root, "scripts/run-harness-assurance.mjs"),
  );
  for (const name of [
    "exui-candidate-ci-inputs.mjs",
    "exui-release-policy.mjs",
    "exui-evidence-io.mjs",
  ])
    fs.writeFileSync(
      path.join(root, "scripts/lib", name),
      `export * from ${JSON.stringify(pathToFileURL(path.join(__dirname, "lib", name)).href)};`,
    );
  fs.writeFileSync(
    path.join(root, "scripts/harness-public-odhin-reporter.cjs"),
    `module.exports = require(${JSON.stringify(path.join(__dirname, "harness-public-odhin-reporter.cjs"))});`,
  );
  fs.writeFileSync(
    path.join(root, "scripts/run-harness-ci.mjs"),
    'import fs from "node:fs"; export async function runHarnessCi() { fs.writeFileSync("native-started", "unexpected"); throw Error("UNEXPECTED_NATIVE_RUN"); }',
  );
  const reporter = new Reporter({ selection: "harness" });
  const tests = overview.entries.map((entry) => ({
    location: { file: path.join(root, entry.file) },
    titlePath: () => entry.titlePath,
    retries: 0,
    expectedStatus: "passed",
  }));
  reporter.onBegin({}, { allTests: () => tests });
  const startTime = new Date("2026-11-03T12:00:00Z");
  for (const testCase of tests)
    reporter.onTestEnd(testCase, {
      status: "passed",
      retry: 0,
      duration: 1,
      startTime,
      workerIndex: 0,
      parallelIndex: 0,
    });
  await reporter.onEnd({ status: "passed", startTime, duration: 1000 });
  assert.equal(Reporter.validatePublicReport("harness").status, "passed");
  const jobPath = path.join(root, "invalid-job.json");
  fs.writeFileSync(jobPath, JSON.stringify({ schemaVersion: 1 }));
  const unrelated = path.join(root, "unrelated-marker");
  fs.writeFileSync(unrelated, "preserve");
  const terminal = spawnSync(
    process.execPath,
    [path.join(root, "scripts/run-harness-assurance.mjs"), "--input", jobPath],
    {
      cwd: root,
      env: { PATH: process.env.PATH },
      encoding: "utf8",
      timeout: 10000,
    },
  );
  assert.equal(terminal.status, 2);
  assert.equal(terminal.signal, null);
  assert.match(terminal.stderr, /\[harness-assurance\] BLOCKED/);
  for (const file of [
    "public/odhin/index.html",
    "private/public-odhin-harness.json",
  ])
    assert.equal(
      fs.existsSync(path.join(root, "functional-output/tests/harness", file)),
      false,
      `Earlier owned ${file} must be withdrawn`,
    );
  assert.equal(fs.existsSync(path.join(root, "native-started")), false);
  assert.equal(fs.readFileSync(unrelated, "utf8"), "preserve");
});
function fixture(t) {
  const root = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), "assurance-descriptor-"),
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "private"));
  const digest = "sha256:" + "a".repeat(64),
    commit = "b".repeat(40);
  const phases = ["family", "scope", "ccd", "eventCapability", "routing"];
  const captured = { harnessCommit: commit, policies: {} };
  const write = (file, value) => {
    const bytes = JSON.stringify(value);
    fs.writeFileSync(path.join(root, "private", file), bytes);
    return (
      "sha256:" +
      require("node:crypto").createHash("sha256").update(bytes).digest("hex")
    );
  };
  for (const phase of phases) {
    fs.mkdirSync(path.join(root, "private", phase));
    captured.policies[phase] = { policyDigest: digest };
    const routingInterpreter =
      phase === "routing"
        ? { contract: { pinDigest: digest }, implementation: { apiBundle: { digest } } }
        : undefined;
    const pre = {
      harnessCommit: commit,
      identity: { artifactDigest: digest },
      policyDigest: digest,
      ...(routingInterpreter ? { routingInterpreter } : {}),
    };
    write(`${phase}/independent-preexecution.json`, {
      ...pre,
      capturedBeforeGate: true,
      capturedAt: "2026-11-03T12:00:00Z",
    });
    const transition =
      phase === "eventCapability"
        ? {
            path: "independent-transition.json",
            digest: write(`${phase}/independent-transition.json`, {
              capturedBeforeFault: true,
            }),
          }
        : undefined;
    write(`${phase}/promotion-expected.json`, {
      ...(transition ? { eventTransition: transition } : {}),
      ...pre,
      receiptArtifactDigest: digest,
      evidenceManifestDigest: digest,
    });
    write(`${phase}/controller-terminal.json`, {
      status: "completed",
      cleanupComplete: true,
      exitCode: phase === "ccd" ? 2 : 0,
    });
  }
  write("ci-result.json", {
    jobRunId: "ci-example",
    status: "BLOCKED",
    exitCode: 2,
    cleanupComplete: true,
    phaseResults: phases.map((phase) => ({
      phase,
      status: phase === "ccd" ? "BLOCKED" : "PASS",
      exitCode: phase === "ccd" ? 2 : 0,
      receiptArtifactDigest: digest,
      ...(phase === "eventCapability"
        ? {
            eventTransition: JSON.parse(
              fs.readFileSync(
                path.join(root, "private", phase, "promotion-expected.json"),
              ),
            ).eventTransition,
          }
        : {}),
    })),
  });
  return {
    root,
    captured,
    job: { output: root, expectedArtifactDigest: digest },
    verdict: { status: "BLOCKED", exitCode: 2 },
    write,
  };
}
test("descriptor binds parent capture before gate and preserves blocked policy for strict raw reader", async (t) => {
  const { writeNativeDescriptor } = await api(),
    f = fixture(t);
  const output = writeNativeDescriptor(f.job, f.captured, f.verdict),
    d = JSON.parse(fs.readFileSync(output));
  assert.equal(d.expected.harnessCommit, f.captured.harnessCommit);
  assert.equal(d.expected.phases[2].terminal.code, 2);
  assert.equal(fs.statSync(output).mode & 0o777, 0o600);
  assert.throws(
    () => writeNativeDescriptor(f.job, f.captured, f.verdict),
    /EEXIST/,
  );
});
test("post-execution identity cannot replace the independently captured expectation", async (t) => {
  const { writeNativeDescriptor } = await api(),
    f = fixture(t);
  const file = path.join(f.root, "private/family/promotion-expected.json"),
    changed = JSON.parse(fs.readFileSync(file));
  changed.harnessCommit = "c".repeat(40);
  fs.writeFileSync(file, JSON.stringify(changed));
  assert.throws(
    () => writeNativeDescriptor(f.job, f.captured, f.verdict),
    /EXPECTATION_CHANGED/,
  );
  assert.equal(
    fs.existsSync(path.join(f.root, "private/native-report-request.json")),
    false,
  );
});
test("missing preexecution capture and incomplete cleanup cannot publish a descriptor", async (t) => {
  const { writeNativeDescriptor } = await api(),
    f = fixture(t);
  const file = path.join(
      f.root,
      "private/family/independent-preexecution.json",
    ),
    pre = JSON.parse(fs.readFileSync(file));
  delete pre.capturedBeforeGate;
  fs.writeFileSync(file, JSON.stringify(pre));
  assert.throws(
    () => writeNativeDescriptor(f.job, f.captured, f.verdict),
    /PREEXECUTION_REQUIRED/,
  );
  fs.writeFileSync(file, JSON.stringify({ ...pre, capturedBeforeGate: true }));
  const terminal = path.join(f.root, "private/family/controller-terminal.json");
  fs.writeFileSync(
    terminal,
    JSON.stringify({
      status: "completed",
      cleanupComplete: false,
      exitCode: 0,
    }),
  );
  assert.throws(
    () => writeNativeDescriptor(f.job, f.captured, f.verdict),
    /CLEANUP_REQUIRED/,
  );
});

test("transition capture must match the separate parent pin and cannot relabel a four-phase job", async (t) => {
  const { writeNativeDescriptor } = await api();
  const f = fixture(t);
  const file = path.join(
    f.root,
    "private/eventCapability/independent-transition.json",
  );
  fs.writeFileSync(file, JSON.stringify({ capturedBeforeFault: false }));
  assert.throws(
    () => writeNativeDescriptor(f.job, f.captured, f.verdict),
    /TRANSITION/,
  );
  const g = fixture(t);
  const ci = JSON.parse(
    fs.readFileSync(path.join(g.root, "private/ci-result.json")),
  );
  ci.phaseResults.pop();
  g.write("ci-result.json", ci);
  assert.throws(
    () => writeNativeDescriptor(g.job, g.captured, g.verdict),
    /COMPLETE_NATIVE_RUN/,
  );
});

test("promotion cannot substitute a transition pin from a different parent capture", async (t) => {
  const { writeNativeDescriptor } = await api();
  const f = fixture(t);
  const file = path.join(
    f.root,
    "private/eventCapability/promotion-expected.json",
  );
  const promotion = JSON.parse(fs.readFileSync(file));
  promotion.eventTransition.digest = "sha256:" + "0".repeat(64);
  fs.writeFileSync(file, JSON.stringify(promotion));
  assert.throws(
    () => writeNativeDescriptor(f.job, f.captured, f.verdict),
    /TRANSITION_CHANGED/,
  );
});
