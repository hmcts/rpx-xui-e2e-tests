const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createHash, randomUUID } = require("node:crypto");

const digest = (value) =>
  "sha256:" + createHash("sha256").update(value).digest("hex");
const hash = (letter) => "sha256:" + letter.repeat(64);
const canary = "PRIVATE_cookie_account_case_payload_123456789";
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
function write(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});const bytes=JSON.stringify(value);fs.writeFileSync(file,bytes);return digest(bytes);}
async function fixture(
  t,
  { postalFailure = false, unknownFailure = false, sourceDigest, candidate } = {},
) {
  const root = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), "native-report-"),
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const directory = path.join(root, "run");
  const { getReleasePolicy } = await import("../lib/exui-release-policy.mjs");
  const { nativeInvocations } = await import("../lib/exui-native-contract.mjs");
  const { loadRunEvidence } = await import("../lib/exui-evidence-io.mjs");
  const event =
    await require("./exui-event-transition-evidence.mock.cjs").createEventTransitionFixture(
      t,
      { root: path.join(directory, "private"), sourceDigest, candidate },
    );
  const identity = structuredClone(event.expected.identity);
  if (unknownFailure) {
    event.baseline.report.status = "failed";
    event.baseline.report.tests[0].status = "failed";
    event.baseline.report.tests[0].failureId = canary;
    event.baseline.execution.runnerExitCode = 1;
    event.write();
  }
  const expected = {
    jobRunId: "ci-" + randomUUID(),
    harnessCommit: "b".repeat(40),
    candidateArtifactDigest: identity.artifactDigest,
    phases: [],
  };
  const binding = read(
    path.join(__dirname, "ccd/nested-prl.binding.json"),
  );
  identity.definitionDigests.HarnessNestedPRL = binding.workbookDigest;
  const observed = { id: "HarnessNestedPRL", version: { number: 1 } };
  const imported = {
    status: 201,
    sourceRevision: "694b9951e94369f1394380506960c4f04f25755d",
    binding,
    fixtureDigest: binding.workbookDigest,
    observedDefinitionDigest: digest(JSON.stringify(observed)),
    definitionVersion: 1,
    images: {
      data: { id: identity.dependencyIdentities.ccd.artifactDigest },
      definition: {
        id: identity.dependencyIdentities["ccd-definition"].artifactDigest,
      },
    },
  };
  const importDigest = write(
    path.join(directory, "private/ccd-runtime/definition-import.json"),
    imported,
  );
  write(
    path.join(directory, "private/ccd-runtime/observed-definition.json"),
    observed,
  );
  const phaseResults = [];
  for (const [phase, releaseScopeId] of Object.entries({
    family: "exui-wa-family-pilot",
    scope: "exui-wa-scope-pilot",
    ccd: "exui-ccd-pilot",
  })) {
    const policy = getReleasePolicy(releaseScopeId);
    const dir = path.join(directory, "private", phase);
    const manifest = {
      schemaVersion: 1,
      runId: (phase === "ccd" ? "ccd-" : "candidate-") + randomUUID(),
      harnessCommit: expected.harnessCommit,
      releaseScopeId,
      policyDigest: policy.policyDigest,
      identity,
      requiredObligationIds: policy.requiredObligationIds,
      runtimeMetadata: {
        harnessSourceState: "clean",
        harnessSourceDigest: event.expected.harnessSourceDigest,
        harnessDependencyDigest: event.expected.harnessDependencyDigest,
        browserDigest: event.expected.browserDigest,
        isolation: "native-separate-api-owned-network-none",
        privateCanary: canary,
        ...(phase === "ccd"
          ? {
              definitionImportDigest: importDigest,
              observedDefinitionDigest: imported.observedDefinitionDigest,
              definitionVersion: "1",
            }
          : {}),
      },
    };
    const run = {
      schemaVersion: 1,
      manifest,
      executionArtifacts: [],
      mutations: [],
    };
    const put = (relative, value) => ({
      path: relative,
      digest: write(path.join(dir, relative), value),
    });
    for (const invocation of nativeInvocations(releaseScopeId)) {
      const definition = policy.mutationDefinitions.find(
        (d) => d.mutationId === invocation.mutation,
      );
      const changedIdentity = definition
        ? { ...identity, configurationDigest: digest(definition.mutationId) }
        : identity;
      const proofIds = definition
        ? [definition.mutantProofId]
        : policy.obligations
            .flatMap((o) => o.requiredProofIds)
            .filter((p) => phase !== "scope" || p.endsWith(invocation.persona));
      const tests = proofIds.map((proofId) => {
        const postal =
          postalFailure &&
          ["ccd-postal-two-roundtrip", "ccd-postal-child-loss"].includes(
            proofId,
          );
        const status = definition || postal || false ? "failed" : "passed";
        const failureId = postal
          ? "postal-required-fields"
          : (definition?.expectedFailureId ?? null);
        return {
          proofId,
          expectedStatus: "passed",
          status,
          retry: 0,
          failureId,
          unattributedErrors: 0,
        };
      });
      const status = tests.some((p) => p.status === "failed")
        ? "failed"
        : "passed";
      const execution = {
        invocationId: invocation.invocationId,
        runId: manifest.runId,
        identity: changedIdentity,
        kind: invocation.kind,
        terminalState: "completed",
        runnerExitCode: status === "passed" ? 0 : 1,
        unexpectedGlobalErrors: [],
      };
      execution.resultArtifact = put(invocation.invocationId + "/report.json", {
        schemaVersion: 1,
        context: {
          runId: manifest.runId,
          invocationId: invocation.invocationId,
          identity: changedIdentity,
          harnessCommit: manifest.harnessCommit,
          releaseScopeId,
          policyDigest: policy.policyDigest,
          harnessSourceState: "clean",
          harnessSourceDigest: event.expected.harnessSourceDigest,
        },
        complete: true,
        status,
        tests,
        globalErrors: [],
        privateCanary: canary,
      });
      run.executionArtifacts.push(
        put(invocation.invocationId + "/execution.json", execution),
      );
      put(invocation.invocationId + "/candidate-write-denial.json", {
        attempts: [
          { path: "/output/report.json", denied: true },
          { path: "/harness/controller.mjs", denied: true },
        ],
        controllerSourceVisible: false,
      });
      put(invocation.invocationId + "/candidate-lifecycle.json", {
        requestedStop: true,
        before: { State: { Running: true } },
        after: { State: { Running: false, ExitCode: 143 } },
        privateCanary: canary,
      });
      if (definition)
        run.mutations.push({
          mutationId: definition.mutationId,
          baselineInvocationId: phase === "scope" ? "scope-ia" : "baseline",
          mutantInvocationId: invocation.invocationId,
          derivationArtifact: put(
            invocation.invocationId + "/derivation.json",
            {
              baselineIdentity: identity,
              mutantIdentity: changedIdentity,
              mutationDefinitionDigest: definition.definitionDigest,
            },
          ),
        });
    }
    put("run.json", run);
    const loaded = loadRunEvidence(path.join(dir, "run.json"), policy);
    const receiptArtifactDigest = put("gate.json", loaded.receipt).digest;
    put("controller-terminal.json", {
      status: "completed",
      exitCode: loaded.receipt.verdict.exitCode,
      cleanupComplete: true,
    });
    expected.phases.push({
      phase,
      policy,
      terminal: { code: loaded.receipt.verdict.exitCode, signal: null },
      expected: {
        runId: manifest.runId,
        harnessCommit: manifest.harnessCommit,
        releaseScopeId,
        policyDigest: policy.policyDigest,
        identity,
        harnessSourceDigest: event.expected.harnessSourceDigest,
        harnessDependencyDigest: event.expected.harnessDependencyDigest,
        browserDigest: event.expected.browserDigest,
        nativeAuthority: true,
        evidenceManifestDigest: loaded.evidenceManifestDigest,
        receiptArtifactDigest,
      },
    });
    phaseResults.push({
      phase,
      ...loaded.receipt.verdict,
      receiptArtifactDigest,
    });
    delete phaseResults.at(-1).reasons;
  }
  expected.phases.push({
    phase: "eventCapability",
    policy: event.policy,
    terminal: { code: unknownFailure ? 2 : 0, signal: null },
    expected: event.expected,
  });
  phaseResults.push({
    phase: "eventCapability",
    status: unknownFailure ? "BLOCKED" : "PASS",
    exitCode: unknownFailure ? 2 : 0,
    receiptArtifactDigest: event.expected.receiptArtifactDigest,
    eventTransition: event.expected.eventTransition,
  });
  const { createRoutingPhaseFixture } = require(
    "./exui-routing-phase-evidence.mock.cjs",
  );
  const routing = await createRoutingPhaseFixture({
    root: path.join(directory, "private"), candidate,
    harnessCommit: expected.harnessCommit,
    sourceDigest: event.expected.harnessSourceDigest,
    dependencyDigest: event.expected.harnessDependencyDigest,
    browserDigest: event.expected.browserDigest,
  });
  expected.phases.push({
    phase: "routing",
    policy: routing.policy,
    terminal: routing.terminal,
    expected: routing.expected,
  });
  phaseResults.push(routing.result);
  const {createCallbackPhaseFixture}=require('./exui-recipient-callback-phase-evidence.mock.cjs');
  const callback=await createCallbackPhaseFixture({
    root:path.join(directory,'private'),candidate,harnessCommit:expected.harnessCommit,
    sourceDigest:event.expected.harnessSourceDigest,dependencyDigest:event.expected.harnessDependencyDigest,
    browserDigest:event.expected.browserDigest,
  });
  expected.phases.push({phase:'recipientCallback',policy:callback.policy,terminal:callback.terminal,expected:callback.expected});
  phaseResults.push(callback.result);
  const {createSelectorPhaseFixture}=require('./exui-selector-phase-evidence.mock.cjs');
  const selector=await createSelectorPhaseFixture({
    root:path.join(directory,'private'),candidate,harnessCommit:expected.harnessCommit,
    sourceDigest:event.expected.harnessSourceDigest,dependencyDigest:event.expected.harnessDependencyDigest,
    browserDigest:event.expected.browserDigest,
  });
  expected.phases.push({phase:'selectorEventRow',policy:selector.policy,terminal:selector.terminal,expected:selector.expected});
  phaseResults.push(selector.result);


  const last = phaseResults.reduce((worst, item) =>
    item.exitCode > worst.exitCode ? item : worst,
  );
  expected.ciResultDigest = write(
    path.join(directory, "private/ci-result.json"),
    {
      classification: "fixed-pilot-suite-no-full-release-approval",
      jobRunId: expected.jobRunId,
      status: last.status,
      exitCode: last.exitCode,
      cleanupComplete: true,
      phaseResults,
    },
  );
  const descriptor = { schemaVersion: 1, directory, expected };
  const descriptorPath = path.join(root, "descriptor.json");
  write(descriptorPath, descriptor);
  return {
    root,
    directory,
    event,
    routing,
    callback,
    selector,
    descriptor,
    descriptorPath,
    save: () => write(descriptorPath, descriptor),
  };
}

module.exports={fixture};
