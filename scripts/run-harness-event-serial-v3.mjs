#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import {
  validateCiJob,
  createCiOutput,
  prepareCiJob,
} from "./lib/exui-candidate-ci-inputs.mjs";
import {
  executeCiProcess,
  cleanupCiCcd,
  cleanupCiPhase,
} from "./lib/exui-candidate-ci-process.mjs";
import {
  captureCiPhaseExpectation,
  captureCiOwnership,
  captureCiEventFaultOwnership,
} from "./lib/exui-candidate-ci-evidence.mjs";
import {
  startCcdRuntime,
  importCcdDefinition,
  verifyCcdRuntimeIdentity,
  ccdCredentials,
  ccdRequest,
  docker,
} from "./lib/exui-ccd-runtime.mjs";
import {
  EVENT_CAPABILITY_SCOPE,
  eventCapabilityFaultVariant,
} from "./lib/exui-ccd-event-capability.mjs";
import {
  publishEventCapabilityRuntime,
  selectEventCapabilityRuntime,
  validateEventCapabilityTransitionRequest,
} from "./lib/exui-ccd-event-transition.mjs";
import { readEventBaselineCheckpoint } from "./lib/exui-native-proof-validation.mjs";
import {
  readEventSerialV3RetiredPrefix,
  readEventSerialV3Chain,
  publishEventSerialV3Ack,
} from "./lib/exui-ccd-event-transition-v3.mjs";
import {
  readEventSerialV3RoleSemantics,
  readEventSerialV3JudgeSemantics,
} from "./lib/exui-event-v3-fault-semantics.mjs";
import { readEventSerialV3SourceShapeSemantics } from "./lib/exui-event-v3-source-shape-semantics.mjs";
import { inspectHostContainer } from "./lib/exui-host-invocation.mjs";
import { terminateOwnedChild } from "./lib/exui-candidate-runtime.mjs";
import { digestBytes } from "./lib/exui-evidence-io.mjs";
import { nativeIdentity } from "./lib/exui-native-contract.mjs";
import {
  EVENT_V3_IDS,
  writeV3File,
  pinV3File,
  readV3File,
  readV3Completion,
  waitV3File,
  writeV3Retirement,
} from "./lib/exui-event-v3-host-writer.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const authority = {
  experimental: true,
  sourceComplete: false,
  semanticReplay: false,
  nativeAuthority: false,
  nativeRuntimeAcceptance: false,
  runtimeAcceptance: false,
  catalogueCredit: false,
  releaseCredit: false,
  releaseApproval: false,
  promotionAllowed: false,
};
const baseKeys = [
  "nativeAuthority",
  "runId",
  "releaseScopeId",
  "harnessCommit",
  "policyDigest",
  "identity",
  "harnessSourceDigest",
  "harnessDependencyDigest",
  "browserDigest",
];
const successfulCreate = () => ({
  started: true,
  observed: true,
  forced: false,
  cancelled: false,
  code: 0,
  signal: null,
});

// Only owned-start/retirement system boundaries vary in unit tests; raw protocol readers never do.
export async function runV3ParentTransition({
  directory,
  input,
  expected,
  request,
  startFault,
  retire,
  isTerminated = () => false,
  signal,
}) {
  const alive = () => !signal?.aborted && !isTerminated();
  let requestPin;
  const check = () => {
    assert(alive(), "EVENT_V3_PARENT_CANCELLED");
    if (requestPin)
      assert.deepEqual(
        pinV3File(directory, "event-transition-request.json"),
        requestPin,
        "EVENT_V3_REQUEST_CHANGED",
      );
  };
  check();
  assert.equal(input.releaseScopeId, EVENT_CAPABILITY_SCOPE);
  requestPin = pinV3File(directory, "event-transition-request.json");
  assert.deepEqual(readV3File(directory, requestPin), request);
  validateEventCapabilityTransitionRequest(input, request);
  writeV3File(directory, "v3/parent-request.json", {
    schemaVersion: 3,
    runId: input.runId,
    reference: requestPin,
  });
  const held = {
    schemaVersion: 3,
    baselineExpected: Object.fromEntries(
      baseKeys.map((key) => [key, structuredClone(expected[key])]),
    ),
    artifactIdentity: structuredClone(input.artifact.identity),
    input: pinV3File(directory, "input.json"),
    baseline: { completion: null, retirement: null },
    faults: EVENT_V3_IDS.map((invocationId) => ({
      invocationId,
      capture: null,
      ack: null,
      proof: null,
      completion: null,
      retirement: null,
    })),
  };
  readEventBaselineCheckpoint(directory, held.baselineExpected);
  held.baseline.completion = await waitV3File(
    directory,
    "v3/baseline/completion.json",
    { isCancelled: () => !alive() },
  );
  readV3Completion(directory, held.baseline.completion, input, "baseline");
  const close = async (id, state, entry) => {
    check();
    const observed = await retire(id, state, entry.completion);
    check();
    entry.retirement = writeV3Retirement(directory, {
      input: state,
      id,
      completion: entry.completion,
      ...observed,
    });
    readEventSerialV3RetiredPrefix(
      directory,
      held,
      id === "baseline" ? 0 : EVENT_V3_IDS.indexOf(id) + 1,
    );
  };
  await close("baseline", input, held.baseline);
  for (const [index, entry] of held.faults.entries()) {
    check();
    const id = entry.invocationId,
      ordinal = index + 1;
    const runtime = await startFault(id, alive);
    check();
    const selected = selectEventCapabilityRuntime(input, id, runtime);
    const runtimeRecord = publishEventCapabilityRuntime(directory, runtime);
    entry.capture = writeV3File(directory, "v3/" + id + "/capture.json", {
      schemaVersion: 3,
      kind: "capture",
      runId: input.runId,
      invocationId: id,
      ordinal,
      sequence: 2 + index * 5,
      pins: held.baselineExpected,
      previousRetirement: index
        ? held.faults[index - 1].retirement
        : held.baseline.retirement,
      runtimeRecord,
      token: randomUUID(),
    });
    const capture = readV3File(directory, entry.capture);
    const ack = {
      schemaVersion: 3,
      kind: "ack",
      runId: input.runId,
      invocationId: id,
      ordinal,
      sequence: 3 + index * 5,
      capture: entry.capture,
      token: capture.token,
    };
    entry.ack = {
      path: "v3/" + id + "/ack.json",
      digest: digestBytes(JSON.stringify(ack)),
    };
    writeV3File(directory, "v3/held-before-" + ordinal + ".json", held);
    check();
    assert.deepEqual(
      publishEventSerialV3Ack(directory, held, ordinal, { signal }),
      entry.ack,
    );
    entry.completion = await waitV3File(
      directory,
      "v3/" + id + "/completion.json",
      { isCancelled: () => !alive() },
    );
    entry.proof = pinV3File(directory, "v3/" + id + "/proof-start.json");
    const completion = readV3Completion(
      directory,
      entry.completion,
      selected,
      id,
    );
    assert.deepEqual(completion.ack, entry.ack);
    assert.deepEqual(completion.proof, entry.proof);
    await close(id, selected, entry);
  }
  check();
  readEventSerialV3Chain(directory, held);
  // Publish last: no await may separate release from callback resolution/transition guard.
  writeV3File(directory, "v3/held-chain.json", held);
  return held;
}

export async function runEventSerialV3(jobPath, { signal } = {}) {
  assert.equal(process.cwd(), ROOT, "EVENT_V3_REPOSITORY_CWD");
  assert(
    path.isAbsolute(jobPath) &&
      fs.realpathSync(jobPath) === jobPath &&
      fs.lstatSync(jobPath).isFile() &&
      fs.statSync(jobPath).size <= 16 * 1024,
    "EVENT_V3_JOB_FILE",
  );
  const job = validateCiJob(read(jobPath)),
    envelope = read(job.candidateManifest);
  job.output = createCiOutput(job.output, [
    ROOT,
    jobPath,
    envelope.candidateRoot,
    job.candidateManifest,
    job.browserCache,
    path.join(ROOT, "node_modules"),
  ]);
  const resources = new Map(),
    privateRoot = path.join(job.output, "private"),
    directory = path.join(privateRoot, "eventCapability");
  const phase = {
    kind: "phase",
    name: "eventCapability",
    directory,
    child: null,
  };
  let context,
    cancelled = Boolean(signal?.aborted),
    uncertain = false,
    held,
    input,
    preparedExpected;
  const abort = () => {
    cancelled = true;
    if (phase.child && !phase.pendingTermination) {
      phase.pendingTermination = terminateOwnedChild(phase.child, {
        graceMs: 10000,
      });
      phase.pendingTermination.catch(() => {});
    }
  };
  signal?.addEventListener("abort", abort);
  const live = () => !cancelled;
  const removeCcd = async (key, resource) => {
    await resource.pendingStart?.catch(() => {});
    const evidence = cleanupCiCcd(resource.directory);
    if (resource.successfulStart || resource.createAttempted)
      assert(
        evidence?.cleanupComplete === true,
        "EVENT_V3_CCD_CLEANUP_REQUIRED",
      );
    resources.delete(key);
    return evidence;
  };
  const start = async (id, alive = live) => {
    assert(live() && alive(), "CI_EVENT_START_CANCELLED");
    const variant =
        id === "baseline" ? "baseline" : eventCapabilityFaultVariant(id),
      key = "event-" + variant + "-runtime";
    const resource = {
      kind: "ccd",
      directory: path.join(privateRoot, key),
      creators: [],
    };
    assert(
      !fs.existsSync(resource.directory),
      "CI_FRESH_CCD_DIRECTORY_REQUIRED",
    );
    resources.set(key, resource);
    // As in current CI, reverse cleanup must join/stop the phase before its CCD namespace.
    if (phase.child) {
      resources.delete(phase.name);
      resources.set(phase.name, phase);
    }
    resource.pendingStart = Promise.resolve()
      .then(() =>
        startCcdRuntime(resource.directory, {
          fixtureSelection: "event-capability-" + variant,
          platform: context.artifact.provenance.platform,
          onCreateUncertainty: () => {
            uncertain = true;
          },
          isCancelled: () => !live() || !alive(),
          runDocker: (args, body) => {
            assert(live() && alive(), "CI_EVENT_START_CANCELLED");
            if (args[0] === "create") resource.createAttempted = true;
            const result = docker(args, body);
            // docker() rejects any error/nonzero spawnSync result. This is a derived command-contract receipt.
            if (args[0] === "create")
              resource.creators.push({
                name: args[args.indexOf("--name") + 1],
                id: result,
                state: "settled",
                terminal: successfulCreate(),
              });
            return result;
          },
        }),
      )
      .then((ccd) => {
        resource.successfulStart = true;
        return ccd;
      });
    resource.pendingStart = resource.pendingStart.then(async (ccd) => {
      assert(live() && alive(), "CI_EVENT_START_CANCELLED");
      importCcdDefinition(ccd);
      verifyCcdRuntimeIdentity(ccd);
      assert(live() && alive(), "CI_EVENT_IMPORT_CANCELLED");
      return ccd;
    });
    const ccd = await resource.pendingStart;
    const definitionFile = path.join(ccd.output, "definition-import.json");
    const apiContracts = Object.fromEntries(
      [
        ["data", 4452],
        ["definition", 4451],
      ].map(([service, port]) => {
        const response = ccdRequest(ccd, port, "/v3/api-docs");
        assert.equal(response.status, 200);
        return [service, digestBytes(JSON.stringify(response.body))];
      }),
    );
    return {
      ccd,
      definition: read(definitionFile),
      definitionImportDigest: digestBytes(fs.readFileSync(definitionFile)),
      apiContracts,
      credentials: Object.fromEntries(
        ["allowed", "courtadmin", "judge", "observer", "readonly"].map(
          (actor) => [actor, ccdCredentials(ccd, actor)],
        ),
      ),
    };
  };
  let originalError, terminal, result;
  try {
    assert(live(), "EVENT_V3_CANCELLED");
    context = await prepareCiJob(job, job.output);
    const baseline = await start("baseline");
    const phaseContext = {
      ...context,
      ...baseline,
      ccdIdentity: nativeIdentity(
        {
          ...baseline,
          artifact: context.artifact,
          releaseScopeId: EVENT_CAPABILITY_SCOPE,
          gatewayDigest: digestBytes(
            fs.readFileSync(
              path.join(ROOT, "scripts/lib/exui-ccd-browser-runtime.mjs"),
            ),
          ),
        },
        { mutation: null },
        context.artifact.candidateRoot,
      ).identity,
    };
    phase.context = phaseContext;
    resources.set("eventCapability", phase);
    result = await executeCiProcess({
      script: path.join(ROOT, "scripts/run-harness-ccd-candidate.mjs"),
      args: [
        "--candidate",
        job.candidateManifest,
        "--browser",
        context.browserRoot,
        "--output",
        directory,
        "--ccd-state",
        path.join(baseline.ccd.output, "runtime.json"),
        "--scope",
        EVENT_CAPABILITY_SCOPE,
        "--event-serial-v3",
      ],
      output: directory,
      onChild: (child) => {
        phase.child = child;
        if (cancelled) abort();
      },
      onPrepared: (observed, handoff) => {
        assert.deepEqual(
          observed.eventSerialV3,
          { schemaVersion: 3, experimental: true },
          "EVENT_V3_MODE_BINDING",
        );
        input = observed;
        preparedExpected = captureCiPhaseExpectation(
          "eventCapability",
          observed,
          handoff,
          phaseContext,
          directory,
        );
        phase.expectedContainer = captureCiOwnership(
          observed,
          handoff,
          phaseContext,
          directory,
          "eventCapability",
        );
        return preparedExpected;
      },
      onEventTransition: async (request, handoff) => {
        held = await runV3ParentTransition({
          directory,
          input: handoff.input,
          expected: handoff.expected,
          request,
          signal,
          isTerminated: () => cancelled || handoff.isTerminated(),
          startFault: async (id, alive) => {
            const data = await start(id, alive);
            const record = {
              schemaVersion: 1,
              runId: input.runId,
              invocationId: id,
              requestDigest: digestBytes(JSON.stringify(request)),
              ...data,
            };
            const ownership = captureCiEventFaultOwnership(
              selectEventCapabilityRuntime(input, id, record),
              handoff.handoff,
              { ...context, ccd: data.ccd },
              directory,
              id,
            );
            phase.expectedContainer.invocations.push(...ownership.invocations);
            return record;
          },
          retire: async (id, state, completion) => {
            const value = readV3Completion(directory, completion, state, id),
              native = readV3File(directory, value.registry);
            const key =
                "event-" +
                (id === "baseline"
                  ? "baseline"
                  : eventCapabilityFaultVariant(id)) +
                "-runtime",
              resource = resources.get(key);
            assert(resource, "EVENT_V3_CCD_RESOURCE_REQUIRED");
            const creators = [
              ...Object.entries(state.ccd.containers).map(([service, cid]) => {
                const row = resource.creators.find(
                  (item) =>
                    item.name === state.ccd.owner + "-" + service &&
                    item.id === cid,
                );
                assert(row, "EVENT_V3_CREATOR_REQUIRED");
                return row;
              }),
              ...native.map((row) => ({
                name: row.name,
                id: row.id,
                state: "settled",
                terminal: row.creatorTerminal,
              })),
            ];
            await removeCcd(key, resource);
            const absence = creators.map(({ name, id }) => {
              assert.equal(inspectHostContainer(id), null);
              assert.equal(inspectHostContainer(name), null);
              return {
                name,
                id,
                byId: {
                  code: 1,
                  signal: null,
                  classification: "no-such-container",
                },
                byName: {
                  code: 1,
                  signal: null,
                  classification: "no-such-container",
                },
              };
            });
            return { creators, absence };
          },
        });
      },
    });
    terminal = result.terminal;
    assert.deepEqual(terminal, { code: 0, signal: null });
    assert(!uncertain, "EVENT_V3_CREATION_UNCERTAIN");
    assert(held, "EVENT_V3_HELD_CHAIN_REQUIRED");
    const runPin = pinV3File(directory, "run.json");
    for (const id of EVENT_V3_IDS) {
      const selection = { runPin, invocationId: id };
      if (id.startsWith("ccd-shape-"))
        readEventSerialV3SourceShapeSemantics(directory, held, selection);
      else if (id === EVENT_V3_IDS[0])
        readEventSerialV3JudgeSemantics(directory, held, selection);
      else readEventSerialV3RoleSemantics(directory, held, selection);
    }
    assert(
      !fs.existsSync(path.join(directory, "gate.json")),
      "EVENT_V3_ORDINARY_GATE_FORBIDDEN",
    );
  } catch (error) {
    originalError = error;
  } finally {
    const errors = [];
    for (const [key, resource] of [...resources.entries()].reverse())
      try {
        if (resource.kind === "ccd") await removeCcd(key, resource);
        else {
          await cleanupCiPhase(
            resource,
            resource.context ?? context,
            resource.pendingTermination
              ? { terminate: () => resource.pendingTermination }
              : {},
          );
          resources.delete(key);
        }
      } catch (error) {
        errors.push(error);
      }
    signal?.removeEventListener("abort", abort);
    if (errors.length || uncertain)
      originalError ??= Error("EVENT_V3_CLEANUP_UNPROVEN");
  }
  if (originalError)
    throw Error("EVENT_V3_EXPERIMENT_FAILED", { cause: originalError });
  const observed = {
    schemaVersion: 3,
    status: "experimental-chain-complete",
    invocations: 12,
    structuredAndDomainFaults: 11,
    terminal,
    cleanupComplete: resources.size === 0,
    ...authority,
  };
  writeV3File(job.output, "v3-experiment-result.json", observed);
  return observed;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const cancellation = new AbortController(),
    cancel = () => cancellation.abort();
  process.on("SIGINT", cancel);
  process.on("SIGTERM", cancel);
  try {
    assert(
      process.argv.length === 4 && process.argv[2] === "--input",
      "EVENT_V3_ARGUMENTS",
    );
    await runEventSerialV3(process.argv[3], { signal: cancellation.signal });
    console.log(
      "Experimental event chain complete; no admission or release credit.",
    );
  } catch {
    console.error("EVENT_V3_EXPERIMENT_FAILED");
    process.exitCode = 2;
  } finally {
    process.removeListener("SIGINT", cancel);
    process.removeListener("SIGTERM", cancel);
  }
}
