#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { writeConfigurationCoverage } from "./lib/exui-configuration-runtime-coverage.mjs";
import { effectiveCandidateConfiguration } from "./lib/exui-candidate-runtime.mjs";
import { verifyCandidateArtifact } from "./lib/exui-candidate-artifact.mjs";
import { deriveScopeMutant } from "./prepare-harness-scope-mutant.mjs";
import {
  startCcdRuntime,
  importCcdDefinition,
  verifyCcdRuntimeIdentity,
  ccdRequest,
  ccdCredentials,
  docker,
} from "./lib/exui-ccd-runtime.mjs";
import { digestBytes, writeJsonAtomic, loadRunEvidence } from "./lib/exui-evidence-io.mjs";
import { getReleasePolicy } from "./lib/exui-release-policy.mjs";
import { nativeIdentity } from "./lib/exui-native-contract.mjs";
import { EVENT_CAPABILITY_SCOPE, EVENT_CAPABILITY_MUTATION } from "./lib/exui-ccd-event-capability.mjs";
import { selectEventCapabilityRuntime, publishEventCapabilityRuntime } from "./lib/exui-ccd-event-transition.mjs";
import { readEventBaselineCheckpoint, isKnownPostalBlock } from "./lib/exui-native-proof-validation.mjs";
import { assertEventBaselineRemoved } from "./lib/exui-native-ci-ownership.mjs";
import { inspectHostContainer } from "./lib/exui-host-invocation.mjs";
import {
  validateCiJob,
  createCiOutput,
  prepareCiJob,
  writeCiPublicSummary,
} from "./lib/exui-candidate-ci-inputs.mjs";
import {
  validateCiPhase,
  captureCiPhaseExpectation,
  captureCiOwnership,
  captureCiEventFaultOwnership,
} from "./lib/exui-candidate-ci-evidence.mjs";
import {
  executeCiProcess,
  cleanupCiPhase,
  cleanupCiCcd,
  installCiCancellation,
} from "./lib/exui-candidate-ci-process.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const blocked = () => ({ status: "BLOCKED", exitCode: 2 });
const scopes = {
  family: "exui-wa-family-pilot",
  scope: "exui-wa-scope-pilot",
  ccd: "exui-ccd-pilot",
  eventCapability: EVENT_CAPABILITY_SCOPE,
  routing: "exui-decentralised-routing-pilot",
};
async function reportProgress(label, operation) {
  const started = performance.now();
  const log = (state) => console.log(
    `[harness-native] ${label}: ${state} (${Math.floor((performance.now() - started) / 1000)}s elapsed).`,
  );
  log("started");
  const heartbeat = setInterval(() => log("still running; awaiting operation completion"), 60_000);
  heartbeat.unref();
  try {
    const result = await operation();
    log(["PASS", "FAIL", "BLOCKED"].includes(result?.status) ? result.status : "completed");
    return result;
  } catch (error) {
    log("stopped; details remain private");
    throw error;
  } finally {
    clearInterval(heartbeat);
  }
}

export async function runFixedCiPilots(operations) {
  const results = [];
  const checkCancellation = () =>
    assert(!operations.isCancelled?.(), "CI_JOB_CANCELLED");
  const phase = async (name) => {
    checkCancellation();
    const labels = { family: "WA family", scope: "WA organisation scope", ccd: "CCD configuration and access", eventCapability: "CCD source event permissions", routing: "Application routing" };
    const result = await reportProgress(labels[name], () => operations.phase(name));
    checkCancellation();
    results.push({ phase: name, ...result });
    return result;
  };
  const outcome = () => {
    const exitCode = Math.max(...results.map((item) => item.exitCode));
    return { status: ["PASS", "FAIL", "BLOCKED"][exitCode], exitCode, results };
  };
  let result = await phase("family");
  if (result.exitCode !== 0) return { ...result, results };
  checkCancellation();
  await reportProgress("Scope fault candidate preparation", () => operations.derive());
  checkCancellation();
  result = await phase("scope");
  if (result.exitCode !== 0) return { ...result, results };
  try {
    checkCancellation();
    await reportProgress("CCD runtime startup", () => operations.start());
    checkCancellation();
    result = await phase("ccd");
  } finally {
    await reportProgress("CCD runtime cleanup", () => operations.stop());
  }
  if (result.exitCode !== 0 && operations.canContinueAfterCcd?.() !== true)
    return { ...result, results };
  let eventResult;
  try {
    checkCancellation();
    await reportProgress("Source event CCD runtime startup", () => operations.startEvent());
    checkCancellation();
    eventResult = await phase("eventCapability");
  } finally {
    await reportProgress("Source event CCD runtime cleanup", () => operations.stopEvent());
  }
  if (eventResult.exitCode !== 0) return outcome();
  checkCancellation();
  await phase("routing");
  return outcome();
}

export async function runHarnessCi(jobPath) {
  const job = validateCiJob(read(jobPath));
  const envelope = read(job.candidateManifest);
  assert(
    typeof envelope.candidateRoot === "string" &&
      path.isAbsolute(envelope.candidateRoot),
    "CI_ARTIFACT_ROOT_REQUIRED",
  );
  job.output = createCiOutput(job.output, [
    envelope.candidateRoot,
    job.candidateManifest,
    job.browserCache,
    path.join(ROOT, "node_modules"),
  ]);
  const resources = new Map(),
    phaseResults = [];
  let context,
    verdict = blocked(),
    cleanupComplete = true,
    cancelled = false;
  const privateRoot = path.join(job.output, "private");
  const remove = async (_id, resource) => {
    let evidence;
    if (resource.kind === "ccd") {
      await resource.pendingStart?.catch(() => {});
      evidence = cleanupCiCcd(resource.directory);
      if (evidence)
        writeJsonAtomic(path.join(resource.directory, "cleanup-verification.json"), evidence);
    } else await cleanupCiPhase(resource, resource.context ?? context);
    resources.delete(_id);
    return evidence;
  };
  const startOwnedCcd = async (key, fixtureSelection, alive = () => true, phaseResource) => {
    assert(!cancelled && alive(), "CI_EVENT_START_CANCELLED");
    const directory = path.join(privateRoot, key);
    assert(!fs.existsSync(directory), "CI_FRESH_CCD_DIRECTORY_REQUIRED");
    const resource = { kind: "ccd", directory };
    resources.set(key, resource);
    if (phaseResource) {
      resources.delete(phaseResource.name);
      resources.set(phaseResource.name, phaseResource);
    }
    resource.pendingStart = Promise.resolve().then(() => startCcdRuntime(directory, {
      fixtureSelection,
      platform: context.artifact.provenance.platform,
      isCancelled: () => cancelled || !alive(),
      runDocker: (args, input) => {
        assert(!cancelled && alive(), "CI_EVENT_START_CANCELLED");
        return docker(args, input);
      },
    }));
    const ccd = await resource.pendingStart;
    assert(!cancelled && alive(), "CI_EVENT_START_CANCELLED");
    importCcdDefinition(ccd);
    verifyCcdRuntimeIdentity(ccd);
    assert(!cancelled && alive(), "CI_EVENT_IMPORT_CANCELLED");
    return ccd;
  };
  const eventRuntimeData = (ccd) => {
    const definitionFile = path.join(ccd.output, "definition-import.json");
    const apiContracts = Object.fromEntries([["data", 4452], ["definition", 4451]].map(([service, port]) => {
      const response = ccdRequest(ccd, port, "/v3/api-docs");
      assert.equal(response.status, 200, "CI_CCD_API_REQUIRED");
      return [service, digestBytes(JSON.stringify(response.body))];
    }));
    return {
      ccd,
      definition: read(definitionFile),
      definitionImportDigest: digestBytes(fs.readFileSync(definitionFile)),
      apiContracts,
      credentials: Object.fromEntries(["allowed", "courtadmin", "judge", "observer"].map((actor) => [actor, ccdCredentials(ccd, actor)])),
    };
  };
  const eventIdentity = (data) => nativeIdentity({
    ...data, artifact: context.artifact, releaseScopeId: EVENT_CAPABILITY_SCOPE,
    gatewayDigest: digestBytes(fs.readFileSync(path.join(ROOT, "scripts/lib/exui-ccd-browser-runtime.mjs"))),
  }, { mutation: null }, context.artifact.candidateRoot).identity;
  const uninstall = installCiCancellation({
    resources,
    remove,
    output: job.output,
    phaseResults,
    onCancel: () => {
      cancelled = true;
    },
  });
  try {
    context = await prepareCiJob(job, job.output);
    assert(!cancelled, "CI_JOB_CANCELLED");
    writeConfigurationCoverage({
      harnessRoot: ROOT,
      output: path.join(privateRoot, "configuration"),
    });
    writeJsonAtomic(path.join(privateRoot, "job-input.json"), job);
    const operations = {
      isCancelled: () => cancelled,
      phase: async (name) => {
        assert(!cancelled, "CI_JOB_CANCELLED");
        const directory = path.join(privateRoot, name),
          phaseContext = name === "eventCapability" ? { ...context, ...context.eventBaseline } : context,
          resource = { kind: "phase", name, directory, child: null, context: phaseContext };
        resources.set(name, resource);
        const args = [
          "--candidate",
          job.candidateManifest,
          "--browser",
          context.browserRoot,
          "--output",
          directory,
        ];
        if (["ccd", "eventCapability"].includes(name))
          args.push(
            "--ccd-state",
            path.join(privateRoot, name === "eventCapability" ? "event-baseline-runtime/runtime.json" : "ccd-runtime/runtime.json"),
            "--scope", scopes[name],
          );
        else args.push("--scope", scopes[name]);
        if (name === "scope")
          args.push(
            "--mutant",
            path.join(privateRoot, "scope-mutant/candidate-artifact.json"),
          );
        try {
          const result = await executeCiProcess({
            script: path.join(
              ROOT,
              ["ccd", "eventCapability"].includes(name)
                ? "scripts/run-harness-ccd-candidate.mjs"
                : "scripts/run-harness-candidate.mjs",
            ),
            args,
            output: directory,
            onChild: (child) => {
              resource.child = child;
            },
            onPrepared: (input, handoff) => {
              assert.equal(
                handoff.mode,
                "native-separate-api",
                "CI_NATIVE_AUTHORITY_HANDOFF_REQUIRED",
              );
              const expected = captureCiPhaseExpectation(
                name,
                input,
                handoff,
                phaseContext,
                directory,
              );
              resource.expectedContainer = captureCiOwnership(
                input,
                handoff,
                phaseContext,
                directory,
                name,
              );
              return expected;
            },
            ...(name === "eventCapability" ? {
              onEventTransition: async (request, handoff) => {
                const alive = () => !handoff.isTerminated();
                assert(!cancelled && alive(), "CI_EVENT_TRANSITION_CANCELLED");
                const checkpoint = readEventBaselineCheckpoint(directory, handoff.expected);
                const native = assertEventBaselineRemoved(resource.expectedContainer, { inspect: inspectHostContainer });
                const ccd = await remove("event-baseline-runtime", resources.get("event-baseline-runtime"));
                assert(ccd?.cleanupComplete === true, "CI_EVENT_BASELINE_CLEANUP_REQUIRED");
                const removal = { schemaVersion: 1, runId: handoff.input.runId, native, ccd,
                  baselineNamespace: handoff.input.ccd.namespace, baselineOwner: handoff.input.ccd.owner };
                const removalFile = path.join(directory, "baseline-removal.json");
                writeJsonAtomic(removalFile, removal);
                assert(!cancelled && alive(), "CI_EVENT_TRANSITION_CANCELLED");
                const fault = eventRuntimeData(await startOwnedCcd("event-mutant-runtime", "event-capability-mutant", alive, resource));
                const record = { schemaVersion: 1, runId: handoff.input.runId, invocationId: EVENT_CAPABILITY_MUTATION,
                  requestDigest: digestBytes(JSON.stringify(request)), ...fault };
                const selected = selectEventCapabilityRuntime(handoff.input, EVENT_CAPABILITY_MUTATION, record);
                const identity = eventIdentity(fault);
                const faultOwnership = captureCiEventFaultOwnership(selected, handoff.handoff, { ...context, ccd: fault.ccd }, directory);
                resource.expectedContainer.invocations.push(...faultOwnership.invocations);
                const transition = {
                  schemaVersion: 1, runId: handoff.input.runId, releaseScopeId: EVENT_CAPABILITY_SCOPE,
                  harnessCommit: handoff.expected.harnessCommit, harnessSourceDigest: handoff.expected.harnessSourceDigest,
                  capturedBeforeFault: true, capturedAt: new Date().toISOString(),
                  baselineInputDigest: digestBytes(fs.readFileSync(path.join(directory, "input.json"))),
                  requestDigest: record.requestDigest, baselineCheckpointDigest: checkpoint.checkpointDigest,
                  baselineRemoval: { path: "baseline-removal.json", digest: digestBytes(fs.readFileSync(removalFile)) },
                  runtimeRecord: { path: `${EVENT_CAPABILITY_MUTATION}/runtime-input.json`, digest: digestBytes(JSON.stringify(record, null, 2) + "\n") },
                  identity,
                };
                assert(!cancelled && alive(), "CI_EVENT_TRANSITION_CANCELLED");
                const transitionFile = path.join(directory, "independent-transition.json");
                assert(!fs.existsSync(transitionFile), "CI_EVENT_TRANSITION_ALREADY_CAPTURED");
                writeJsonAtomic(transitionFile, transition);
                resource.eventTransition = { path: "independent-transition.json", digest: digestBytes(fs.readFileSync(transitionFile)) };
                assert(!cancelled && alive(), "CI_EVENT_TRANSITION_CANCELLED");
                assert.deepEqual(publishEventCapabilityRuntime(directory, record), transition.runtimeRecord, "CI_EVENT_ACK_CHANGED");
              },
            } : {}),
          });
          assert(!cancelled, "CI_JOB_CANCELLED");
          if (name === "eventCapability")
            result.expected = { ...result.expected, eventTransition: resource.eventTransition };
          const validated = validateCiPhase(
            directory,
            result.expected,
            result.terminal,
          );
          if (name === "ccd")
            writeConfigurationCoverage({
              harnessRoot: ROOT,
              output: path.join(privateRoot, "configuration"),
              phaseDirectory: directory,
              expected: {
                ...result.expected,
                receiptArtifactDigest: validated.receiptArtifactDigest,
              },
              terminal: result.terminal,
            });
          if (name === "ccd") context.ccdResult = { directory, expected: { ...result.expected, receiptArtifactDigest: validated.receiptArtifactDigest }, terminal: result.terminal };
          if (name === "eventCapability") {
            context.eventResult = {
              directory,
              expected: {
                ...result.expected,
                receiptArtifactDigest: validated.receiptArtifactDigest,
              },
              terminal: result.terminal,
            };
            writeConfigurationCoverage({
              harnessRoot: ROOT,
              output: path.join(privateRoot, "configuration"),
              phaseDirectory: context.ccdResult.directory,
              expected: context.ccdResult.expected,
              terminal: context.ccdResult.terminal,
              eventPhase: context.eventResult,
            });
          }
          if (name === "routing")
            writeConfigurationCoverage({
              harnessRoot: ROOT,
              output: path.join(privateRoot, "configuration"),
              phaseDirectory: context.ccdResult.directory,
              expected: context.ccdResult.expected,
              terminal: context.ccdResult.terminal,
              eventPhase: context.eventResult,
              routingPhase: {
                directory,
                expected: {
                  ...result.expected,
                  receiptArtifactDigest: validated.receiptArtifactDigest,
                },
                terminal: result.terminal,
              },
            });
          phaseResults.push({ phase: name, ...validated });
          return validated;
        } finally {
          await remove(name, resource);
        }
      },
      derive: async () => {
        await deriveScopeMutant(
          job.candidateManifest,
          path.join(privateRoot, "scope-mutant"),
        );
        context.mutantArtifact = await verifyCandidateArtifact(
          path.join(privateRoot, "scope-mutant/candidate-artifact.json"),
        );
      },
      start: async () => {
        const directory = path.join(privateRoot, "ccd-runtime");
        resources.set("ccd-runtime", { kind: "ccd", directory });
        context.ccd = await startCcdRuntime(directory, { platform: context.artifact.provenance.platform });
        importCcdDefinition(context.ccd);
        const observed = verifyCcdRuntimeIdentity(context.ccd),
          config = effectiveCandidateConfiguration(
            context.artifact.candidateRoot,
          ).config;
        config.now = false;
        const apiContracts = Object.fromEntries(
          [
            ["data", 4452],
            ["definition", 4451],
          ].map(([service, port]) => {
            const response = ccdRequest(context.ccd, port, "/v3/api-docs");
            assert.equal(response.status, 200, "CI_CCD_API_REQUIRED");
            return [service, digestBytes(JSON.stringify(response.body))];
          }),
        );
        context.ccdIdentity = {
          ...context.artifact.identity,
          configurationDigest: digestBytes(
            JSON.stringify({
              config,
              gatewayDigest: digestBytes(
                fs.readFileSync(
                  path.join(ROOT, "scripts/lib/exui-ccd-browser-runtime.mjs"),
                ),
              ),
              mutation: null,
            }),
          ),
          definitionDigests: { HarnessNestedPRL: observed.fixtureDigest },
          dependencyIdentities: Object.fromEntries(
            ["data", "definition"].map((service) => [
              service === "data" ? "ccd" : "ccd-definition",
              {
                artifactDigest: context.ccd.images[service].id,
                apiContractDigest: apiContracts[service],
              },
            ]),
          ),
        };
      },
      stop: () => {
        const resource = resources.get("ccd-runtime");
        if (resource) return remove("ccd-runtime", resource);
      },
      canContinueAfterCcd: () => {
        const loaded = loadRunEvidence(path.join(privateRoot, "ccd/run.json"), getReleasePolicy("exui-ccd-pilot"));
        return isKnownPostalBlock(loaded.input, loaded.receipt.verdict);
      },
      startEvent: async () => {
        const data = eventRuntimeData(await startOwnedCcd("event-baseline-runtime", "event-capability-baseline"));
        context.eventBaseline = { ...data, ccdIdentity: eventIdentity(data) };
      },
      stopEvent: async () => {
        for (const key of ["event-mutant-runtime", "event-baseline-runtime"]) {
          const resource = resources.get(key);
          if (resource) await remove(key, resource);
        }
      },
    };
    const result = await runFixedCiPilots(operations);
    verdict = { status: result.status, exitCode: result.exitCode };
  } catch (error) {
    writeJsonAtomic(path.join(privateRoot, "orchestration-error.json"), {
      message:
        error instanceof Error ? error.message : "CI_ORCHESTRATION_FAILED",
    });
    verdict = blocked();
  } finally {
    for (const [id, resource] of [...resources].reverse())
      try {
        await remove(id, resource);
      } catch {
        cleanupComplete = false;
        verdict = blocked();
      }
    uninstall();
    if (cancelled) verdict = blocked();
    writeJsonAtomic(path.join(privateRoot, "ci-result.json"), {
      classification: "fixed-pilot-suite-no-full-release-approval",
      jobRunId: `ci-${randomUUID()}`,
      status: verdict.status,
      exitCode: verdict.exitCode,
      cleanupComplete,
      phaseResults,
    });
    writeCiPublicSummary(
      job.output,
      verdict,
      phaseResults.length === 5 &&
        phaseResults.every((result) => result.status === "PASS"),
    );
  }
  return verdict;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  let verdict = blocked();
  try {
    assert(
      process.argv.length === 4 && process.argv[2] === "--input",
      "CI_INPUT_FILE_REQUIRED",
    );
    verdict = await runHarnessCi(path.resolve(process.argv[3]));
  } catch {
    /* Job diagnostics remain private. */
  }
  console.log(
    `[harness-candidate-ci] ${verdict.status}; full EXUI release approval unavailable`,
  );
  process.exitCode = verdict.exitCode;
}
