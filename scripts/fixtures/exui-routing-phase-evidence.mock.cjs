const fs = require("node:fs");
const path = require("node:path");
const { createHash, randomUUID } = require("node:crypto");
const { completeRun } = require("./exui-release-evidence.mock.cjs");

const digest = (value) =>
  "sha256:" + createHash("sha256").update(value).digest("hex");
const write = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const bytes = JSON.stringify(value);
  fs.writeFileSync(file, bytes);
  return digest(bytes);
};

async function createRoutingPhaseFixture({
  root,
  harnessCommit = "b".repeat(40),
  sourceDigest = digest("4"),
  dependencyDigest = digest("a"),
  browserDigest = digest("b"),
  failedProofId,
} = {}) {
  const { getReleasePolicy } = await import("../lib/exui-release-policy.mjs");
  const { nativeInvocations, nativeIdentity } = await import(
    "../lib/exui-native-contract.mjs"
  );
  const { assertRoutingInterpreter } = await import(
    "../lib/exui-routing-contract.mjs"
  );
  const { loadRunEvidence } = await import("../lib/exui-evidence-io.mjs");
  const scope = "exui-decentralised-routing-pilot";
  const policy = getReleasePolicy(scope);
  const directory = path.join(root, "routing");
  const candidateRoot = path.join(root, "candidate");
  const bundle = path.join(candidateRoot, "dist/rpx-exui/api/server.bundle.js");
  fs.mkdirSync(path.dirname(bundle), { recursive: true });
  fs.writeFileSync(bundle, "synthetic PCS routing API bundle");
  fs.mkdirSync(path.join(candidateRoot, "config"), { recursive: true });
  fs.writeFileSync(
    path.join(candidateRoot, "config/default.json"),
    JSON.stringify({
      services: { idam: {}, ccd: { caseAssignmentApi: "http://127.0.0.1:3101" } },
      feature: {},
      decentralisedCaseTypeConfig: {
        PCS: { webUrl: "https://pcs.invalid", nocBaseUrl: "https://pcs-api.invalid" },
      },
      decentralisedServiceMap: {},
    }),
  );
  const identity = completeRun().manifest.identity;
  const artifact = {
    candidateRoot,
    identity,
    provenance: {
      webappCommit: identity.webappCommit,
      sourceTree: "d".repeat(40),
    },
  };
  const review = JSON.parse(
    fs.readFileSync(path.join(__dirname, "exui-configuration-review.json")),
  );
  const routingInterpreter = assertRoutingInterpreter(
    artifact,
    review,
    identity,
    candidateRoot,
  );
  const runId = "candidate-" + randomUUID();
  const input = { runId, releaseScopeId: scope, artifact, routingInterpreter };
  const invocations = nativeInvocations(scope);
  const manifest = {
    schemaVersion: 1,
    runId,
    harnessCommit,
    releaseScopeId: scope,
    policyDigest: policy.policyDigest,
    identity: nativeIdentity(input, invocations[0], candidateRoot).identity,
    requiredObligationIds: policy.requiredObligationIds,
    runtimeMetadata: {
      isolation: "native-separate-api-owned-network-none",
      harnessSourceState: "clean",
      harnessSourceDigest: sourceDigest,
      harnessDependencyDigest: dependencyDigest,
      browserDigest,
      routingInterpreter: JSON.stringify(routingInterpreter),
      routingConfigurationMode:
        "complete NODE_CONFIG in a fresh API-owned tmpfs directory; no deployed overlay/merge coverage",
    },
  };
  const executionArtifacts = [];
  const mutations = [];
  for (const invocation of invocations) {
    const current = nativeIdentity(input, invocation, candidateRoot).identity;
    const mutation = policy.mutationDefinitions.find(
      (item) => item.mutationId === invocation.mutation,
    );
    const proofIds = mutation
      ? [mutation.mutantProofId]
      : policy.obligations.flatMap((item) => item.requiredProofIds);
    const tests = proofIds.map((proofId) => ({
      proofId,
      expectedStatus: "passed",
      status: mutation || proofId === failedProofId ? "failed" : "passed",
      retry: 0,
      failureId: mutation?.expectedFailureId ?? (proofId === failedProofId ? "routing-assertion-failed" : null),
      unattributedErrors: 0,
    }));
    const execution = {
      invocationId: invocation.invocationId,
      runId,
      identity: current,
      kind: invocation.kind,
      terminalState: "completed",
      runnerExitCode: mutation || proofIds.includes(failedProofId) ? 1 : 0,
      unexpectedGlobalErrors: [],
    };
    const report = {
      schemaVersion: 1,
      context: {
        runId,
        invocationId: invocation.invocationId,
        identity: current,
        harnessCommit,
        releaseScopeId: scope,
        policyDigest: policy.policyDigest,
        harnessSourceState: "clean",
        harnessSourceDigest: sourceDigest,
      },
      complete: true,
      status: mutation || proofIds.includes(failedProofId) ? "failed" : "passed",
      tests,
      globalErrors: [],
    };
    const invDir = path.join(directory, invocation.invocationId);
    const reportPath = path.join(invDir, "report.json");
    execution.resultArtifact = {
      path: `${invocation.invocationId}/report.json`,
      digest: write(reportPath, report),
    };
    executionArtifacts.push({
      path: `${invocation.invocationId}/execution.json`,
      digest: write(path.join(invDir, "execution.json"), execution),
    });
    write(path.join(invDir, "candidate-write-denial.json"), {
      attempts: ["/output/report.json", "/harness/controller.mjs"].map(
        (file) => ({ path: file, denied: true }),
      ),
      controllerSourceVisible: false,
    });
    write(path.join(invDir, "candidate-lifecycle.json"), {
      requestedStop: true,
      before: { State: { Running: true } },
      after: { State: { Running: false, ExitCode: 143 } },
    });
    if (mutation)
      mutations.push({
        mutationId: mutation.mutationId,
        baselineInvocationId: "baseline",
        mutantInvocationId: invocation.invocationId,
        derivationArtifact: {
          path: `${invocation.invocationId}/derivation.json`,
          digest: write(path.join(invDir, "derivation.json"), {
            mutationDefinitionDigest: mutation.definitionDigest,
            baselineIdentity: manifest.identity,
            mutantIdentity: current,
          }),
        },
      });
  }
  write(path.join(directory, "input.json"), input);
  write(path.join(directory, "run.json"), {
    schemaVersion: 1,
    manifest,
    executionArtifacts,
    mutations,
  });
  const loaded = loadRunEvidence(path.join(directory, "run.json"), policy);
  const receiptArtifactDigest = write(
    path.join(directory, "gate.json"),
    loaded.receipt,
  );
  write(path.join(directory, "controller-terminal.json"), {
    status: "completed",
    cleanupComplete: true,
    exitCode: loaded.receipt.verdict.exitCode,
  });
  return {
    directory,
    policy,
    input,
    manifest,
    expected: {
      runId,
      harnessCommit,
      releaseScopeId: scope,
      policyDigest: policy.policyDigest,
      identity: manifest.identity,
      harnessSourceDigest: sourceDigest,
      harnessDependencyDigest: dependencyDigest,
      browserDigest,
      nativeAuthority: true,
      routingInterpreter,
      evidenceManifestDigest: loaded.evidenceManifestDigest,
      receiptArtifactDigest,
    },
    terminal: { code: loaded.receipt.verdict.exitCode, signal: null },
    result: {
      phase: "routing",
      status: loaded.receipt.verdict.status,
      exitCode: loaded.receipt.verdict.exitCode,
      receiptArtifactDigest,
    },
  };
}

module.exports = { createRoutingPhaseFixture };
