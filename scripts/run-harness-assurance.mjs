#!/usr/bin/env node
import {verifyDivorceNativeCapture} from './lib/exui-divorce-native-binding.mjs';
import {readSelectorPhaseAuthority} from './lib/exui-selector-event-row-evidence.mjs';
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { runHarnessCi } from "./run-harness-ci.mjs";
import { validateCiJob } from "./lib/exui-candidate-ci-inputs.mjs";
import { getReleasePolicy } from "./lib/exui-release-policy.mjs";
import { digestBytes } from "./lib/exui-evidence-io.mjs";
import Reporter from "./harness-public-odhin-reporter.cjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scopes = {
  family: "exui-wa-family-pilot",
  scope: "exui-wa-scope-pilot",
  ccd: "exui-ccd-pilot",
  eventCapability: "exui-ccd-event-capability-pilot",
  routing: "exui-decentralised-routing-pilot",
  recipientCallback: "exui-ccd-recipient-callback-pilot",
  selectorEventRow: "exui-ccd-selector-event-row-pilot",
};
function read(file) {
  assert(
    fs.lstatSync(file).isFile() && fs.realpathSync(file) === file,
    "ASSURANCE_REGULAR_INPUT_REQUIRED",
  );
  const bytes = fs.readFileSync(file);
  return { value: JSON.parse(bytes), digest: digestBytes(bytes) };
}
export async function runAssuranceSequence({ native, descriptor, collect }) {
  const nativeStartedAt = performance.now();
  const verdict = await native();
  assert(
    ["PASS", "FAIL", "BLOCKED"].includes(verdict.status) &&
      { PASS: 0, FAIL: 1, BLOCKED: 2 }[verdict.status] === verdict.exitCode,
    "ASSURANCE_NATIVE_VERDICT_REQUIRED",
  );
  let nativeEvidencePath;
  try {
    nativeEvidencePath = await descriptor(verdict);
  } catch (error) {
    if (verdict.status === "PASS") throw error;
  }
  const diagnostics = await collect(nativeEvidencePath, nativeEvidencePath ? {
    nativeElapsedMs: Math.round(performance.now() - nativeStartedAt),
    ...(verdict.phaseTimings ? { phaseTimings: verdict.phaseTimings } : {}),
  } : {});
  assert(
    ["passed", "failed"].includes(diagnostics.status) &&
      [0, 1, 2].includes(diagnostics.exitCode) &&
      (diagnostics.status !== "failed" || diagnostics.exitCode !== 0),
    "ASSURANCE_DIAGNOSTIC_VERDICT_REQUIRED",
  );
  return {
    nativeStatus: verdict.status,
    diagnosticStatus: diagnostics.status,
    exitCode: Math.max(verdict.exitCode, diagnostics.exitCode),
    releaseApproval: false,
  };
}
export function writeNativeDescriptor(job, captured, verdict, sharedRoleSourceInputs, divorceProfileRequest) {
  const root = path.join(job.output, "private");
  assert(fs.realpathSync(root) === root, "ASSURANCE_PRIVATE_ROOT_REQUIRED");
  const result = read(path.join(root, "ci-result.json"));
  assert.equal(
    result.value.cleanupComplete,
    true,
    "ASSURANCE_CLEANUP_REQUIRED",
  );
  assert.equal(
    result.value.status,
    verdict.status,
    "ASSURANCE_TERMINAL_MISMATCH",
  );
  assert.equal(
    result.value.exitCode,
    verdict.exitCode,
    "ASSURANCE_TERMINAL_MISMATCH",
  );
  assert.deepEqual(
    result.value.phaseResults.map((item) => item.phase),
    Object.keys(scopes),
    "ASSURANCE_COMPLETE_NATIVE_RUN_REQUIRED",
  );
  const phases = result.value.phaseResults.map((phase) => {
    const dir = path.join(root, phase.phase);
    const pre = read(path.join(dir, "independent-preexecution.json")).value;
    assert.equal(
      pre.capturedBeforeGate,
      true,
      "ASSURANCE_PREEXECUTION_REQUIRED",
    );
    const { capturedAt, capturedBeforeGate, ...expected } = pre;
    assert(
      Number.isFinite(Date.parse(capturedAt)),
      "ASSURANCE_PREEXECUTION_REQUIRED",
    );
    assert.equal(
      expected.harnessCommit,
      captured.harnessCommit,
      "ASSURANCE_SOURCE_CHANGED",
    );
    assert.equal(
      expected.identity.artifactDigest,
      job.expectedArtifactDigest,
      "ASSURANCE_CANDIDATE_CHANGED",
    );
    const policy = captured.policies[phase.phase];
    assert.equal(
      expected.policyDigest,
      policy.policyDigest,
      "ASSURANCE_POLICY_CHANGED",
    );
    const promotion = read(path.join(dir, "promotion-expected.json")).value;
    const {
      receiptArtifactDigest,
      evidenceManifestDigest,
      eventTransition,
      callbackTransition,
      selectorEventCapture,
      selectorControllerTerminal,
      ...promoted
    } = promotion;
    assert.deepEqual(promoted, expected, "ASSURANCE_EXPECTATION_CHANGED");
    if(phase.phase==='selectorEventRow'){
      const authority=readSelectorPhaseAuthority(dir);
      assert.deepEqual(authority.expected,{...expected,selectorEventCapture,selectorControllerTerminal},'ASSURANCE_SELECTOR_EXPECTATION_CHANGED');
      assert.deepEqual(authority.terminal,{code:phase.exitCode,signal:null},'ASSURANCE_SELECTOR_TERMINAL_CHANGED');
    }else{
      assert.equal(selectorEventCapture,undefined,'ASSURANCE_UNEXPECTED_SELECTOR_CAPTURE');
      assert.equal(selectorControllerTerminal,undefined,'ASSURANCE_UNEXPECTED_SELECTOR_TERMINAL');
    }
    if (phase.phase === "eventCapability") {
      const transition = read(path.join(dir, "independent-transition.json"));
      assert.equal(
        transition.value.capturedBeforeFault,
        true,
        "ASSURANCE_TRANSITION_CAPTURE_REQUIRED",
      );
      const reference = {
        path: "independent-transition.json",
        digest: transition.digest,
      };
      assert.deepEqual(
        eventTransition,
        reference,
        "ASSURANCE_TRANSITION_CHANGED",
      );
      assert.deepEqual(
        phase.eventTransition,
        reference,
        "ASSURANCE_TRANSITION_CHANGED",
      );
    } else {
      assert.equal(
        eventTransition,
        undefined,
        "ASSURANCE_UNEXPECTED_TRANSITION",
      );
      assert.equal(
        phase.eventTransition,
        undefined,
        "ASSURANCE_UNEXPECTED_TRANSITION",
      );
    }
    if (phase.phase === "recipientCallback") {
      const transition = read(path.join(dir, "independent-callback-transition.json"));
      assert.equal(transition.value.capturedBeforeFault, true, "ASSURANCE_CALLBACK_TRANSITION_CAPTURE_REQUIRED");
      const reference = { path: "independent-callback-transition.json", digest: transition.digest };
      assert.deepEqual(callbackTransition, reference, "ASSURANCE_CALLBACK_TRANSITION_CHANGED");
      assert.deepEqual(phase.callbackTransition, reference, "ASSURANCE_CALLBACK_TRANSITION_CHANGED");
    } else {
      assert.equal(callbackTransition, undefined, "ASSURANCE_UNEXPECTED_CALLBACK_TRANSITION");
      assert.equal(phase.callbackTransition, undefined, "ASSURANCE_UNEXPECTED_CALLBACK_TRANSITION");
    }
    assert.equal(
      receiptArtifactDigest,
      phase.receiptArtifactDigest,
      "ASSURANCE_RECEIPT_CHANGED",
    );
    for (const digest of [receiptArtifactDigest, evidenceManifestDigest])
      assert(/^sha256:[a-f0-9]{64}$/.test(digest), "ASSURANCE_DIGEST_REQUIRED");
    const terminal = read(path.join(dir, "controller-terminal.json")).value;
    assert.equal(
      terminal.status,
      "completed",
      "ASSURANCE_CONTROLLER_INCOMPLETE",
    );
    assert.equal(terminal.cleanupComplete, true, "ASSURANCE_CLEANUP_REQUIRED");
    assert.equal(
      terminal.exitCode,
      phase.exitCode,
      "ASSURANCE_TERMINAL_MISMATCH",
    );
    return {
      phase: phase.phase,
      expected: promotion,
      policy,
      terminal: { code: phase.exitCode, signal: null },
    };
  });
  const nativeCohortBinding = captured.nativeCohortCapture ? verifyDivorceNativeCapture(job.output, captured.nativeCohortCapture) : undefined;
  if (divorceProfileRequest) {
    assert.deepEqual(Object.keys(divorceProfileRequest).sort(), ["digest", "path", "runId"], "ASSURANCE_PROFILE_REQUEST_INVALID");
    const request = read(divorceProfileRequest.path);
    assert.equal(request.digest, divorceProfileRequest.digest, "ASSURANCE_PROFILE_REQUEST_CHANGED");
    assert.equal(request.value.expected.runId, divorceProfileRequest.runId, "ASSURANCE_PROFILE_REQUEST_CHANGED");
  }
  const descriptor = {
    schemaVersion: 1,
    directory: job.output,
    ...(divorceProfileRequest ? {divorceProfileAdmission: divorceProfileRequest.path} : {}),
    ...(sharedRoleSourceInputs ? { sharedRoleAdmission: { candidateArtifactPath: job.candidateManifest, sourceImageInputs: sharedRoleSourceInputs } } : {}),
    expected: {
      ...(nativeCohortBinding ? {nativeCohortBinding} : {}),
      ...(divorceProfileRequest ? {divorceProfileRequest: {runId: divorceProfileRequest.runId, digest: divorceProfileRequest.digest}} : {}),
      jobRunId: result.value.jobRunId,
      ciResultDigest: result.digest,
      harnessCommit: captured.harnessCommit,
      candidateArtifactDigest: job.expectedArtifactDigest,
      phases,
    },
  };
  const file = path.join(root, "native-report-request.json");
  fs.writeFileSync(file, JSON.stringify(descriptor, null, 2) + "\n", {
    flag: "wx",
    mode: 0o600,
  });
  return file;
}
export function captureAssuranceExpectations(env = process.env) {
  return {
    harnessCommit: execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: ROOT,
      env: { PATH: env.PATH },
      encoding: "utf8",
    }).trim(),
    policies: Object.fromEntries(
      Object.entries(scopes).map(([phase, scope]) => [
        phase,
        getReleasePolicy(scope),
      ]),
    ),
  };
}
export async function runHarnessAssurance(
  jobPath,
  { aat = false, env = process.env } = {},
) {
  assert.equal(process.cwd(), ROOT, "ASSURANCE_REPOSITORY_CWD_REQUIRED");
  // Invalid job input must also withdraw the earlier owned public report.
  Reporter.resetPublicReport("harness");
  const job = validateCiJob(read(jobPath).value);
  const sharedRoleSourceInputs = env.HARNESS_SHARED_ROLE_SOURCE_INPUTS
    ? read(env.HARNESS_SHARED_ROLE_SOURCE_INPUTS).value : undefined;
  const captured = captureAssuranceExpectations(env);
  const { runHarnessCollection } = await import("./run-harness-local-aat.cjs");
  return runAssuranceSequence({
    native: () => runHarnessCi(jobPath, {captureNativeCohort: value => {captured.nativeCohortCapture = value;}}),
    descriptor: (verdict) => writeNativeDescriptor(job, captured, verdict, sharedRoleSourceInputs),
    collect: (nativeEvidencePath, timing) =>
      runHarnessCollection(env, {
        profile: aat ? "local-aat" : "harness",
        nativeEvidencePath,
        ...timing,
      }),
  });
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const args = process.argv.slice(2).filter((value) => value !== "--");
    assert(
      (args.length === 2 || (args.length === 3 && args[2] === "--aat")) &&
        args[0] === "--input" &&
        path.isAbsolute(args[1]),
      "ASSURANCE_INPUT_REQUIRED",
    );
    const result = await runHarnessAssurance(args[1], {
      aat: args.includes("--aat"),
    });
    console.log(
      `[harness-assurance] Native ${result.nativeStatus}; diagnostics ${result.diagnosticStatus}; full release approval unavailable.`,
    );
    process.exitCode = result.exitCode;
  } catch {
    console.error(
      "[harness-assurance] BLOCKED: native execution or evidence incomplete; inspect private diagnostics.",
    );
    process.exitCode = 2;
  }
}
