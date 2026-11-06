#!/usr/bin/env node
import {runSelectorEventPhase} from './run-harness-selector-event-row.mjs';
import {SELECTOR_EVENT_SCOPE} from './lib/exui-selector-event-row-contract.mjs';
import {readSelectorPhaseAuthority} from './lib/exui-selector-event-row-evidence.mjs';
import {CALLBACK_SCOPE,CALLBACK_MUTATION} from './lib/exui-recipient-callback-contract.mjs';
import {importNativeCallbackDefinition,verifyNativeCallbackRuntime} from './lib/exui-recipient-callback-native-import.mjs';
import {selectCallbackRuntime,publishCallbackRuntime} from './lib/exui-recipient-callback-transition.mjs';
import {readCallbackBaselineCheckpoint} from './lib/exui-native-proof-validation.mjs';
import {captureCiCallbackFaultOwnership} from './lib/exui-candidate-ci-evidence.mjs';
import { SOURCE_SHAPE_MUTATIONS } from './lib/exui-source-shape-contract.mjs';
import { importWorkbasketInputs } from './lib/exui-workbasket-input-import.mjs';
import { nativePhaseFailure, readChildFailure } from "./lib/exui-native-failure-diagnostics.mjs";
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
import { EVENT_CAPABILITY_SCOPE, EVENT_CAPABILITY_MUTATION, COURTADMIN_READ_MUTATION, READONLY_READ_MUTATION, READONLY_UPDATE_MUTATION, COURTADMIN_UPDATE_MUTATION, eventCapabilityFaultVariant } from "./lib/exui-ccd-event-capability.mjs";
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
  recipientCallback: CALLBACK_SCOPE,
  selectorEventRow: SELECTOR_EVENT_SCOPE,
};
export async function reportNativeProgress(label, operation) {
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

export function fixedCiPhasesPassed(results) {
  const phases = ['family', 'scope', 'ccd', 'eventCapability', 'routing', 'recipientCallback', 'selectorEventRow'];
  return results.length === phases.length && results.every((result, index) => result.phase === phases[index] && result.status === 'PASS');
}

export async function runFixedCiPilots(operations) {
  const progress = operations.progress ?? ((_label, operation) => operation());
  const results = [];
  const timings = [];
  const timed = async (label, operation) => {
    const startedAt = new Date().toISOString();
    const started = performance.now();
    let status = "stopped", nested;
    try {
      const result = await progress(label, operation);
      status = ["PASS", "FAIL", "BLOCKED"].includes(result?.status) ? result.status : "completed";
      if(label === "Selector Page2 preparation, proofs and cleanup") nested=result.phaseTimings;
      return result;
    } finally {
      const selectorFallback = label === "Selector Page2 preparation, proofs and cleanup" && nested == null;
      const item = { label: selectorFallback ? "Selector CCD baseline preparation" : label,
        status: selectorFallback ? "stopped" : status, startedAt, durationMs: Math.round(performance.now() - started) };
      for(const row of nested ?? [item]) {timings.push(row);operations.onTiming?.(row);}
    }
  };
  const checkCancellation = () =>
    assert(!operations.isCancelled?.(), "CI_JOB_CANCELLED");
  const phase = async (name) => {
    checkCancellation();
    const labels = { family: "WA family", scope: "WA organisation scope", ccd: "CCD configuration and access", eventCapability: "CCD source event permissions", routing: "Application routing", recipientCallback: "Recipient callback validation and persistence", selectorEventRow: "Selector Page2 preparation, proofs and cleanup" };
    const result = await timed(labels[name], () => operations.phase(name));
    checkCancellation();
    results.push({ phase: name, ...result });
    return result;
  };
  const outcome = () => {
    const exitCode = Math.max(...results.map((item) => item.exitCode));
    return { status: ["PASS", "FAIL", "BLOCKED"][exitCode], exitCode, results, timings };
  };
  let result = await phase("family");
  if (result.exitCode !== 0) return { ...result, results, timings };
  checkCancellation();
  await timed("Scope fault candidate preparation", () => operations.derive());
  checkCancellation();
  result = await phase("scope");
  if (result.exitCode !== 0) return { ...result, results, timings };
  try {
    checkCancellation();
    await timed("CCD runtime startup", () => operations.start());
    checkCancellation();
    result = await phase("ccd");
  } finally {
    await timed("CCD runtime cleanup", () => operations.stop());
  }
  if (result.exitCode !== 0 && operations.canContinueAfterCcd?.() !== true)
    return { ...result, results, timings };
  let eventResult;
  try {
    checkCancellation();
    await timed("Source event CCD runtime startup", () => operations.startEvent());
    checkCancellation();
    eventResult = await phase("eventCapability");
  } finally {
    await timed("Source event CCD runtime cleanup", () => operations.stopEvent());
  }
  if (eventResult.exitCode !== 0) return outcome();
  checkCancellation();
  const routingResult = await phase("routing");
  if (routingResult.exitCode !== 0) return outcome();
  try {
    checkCancellation();
    await timed("Recipient callback CCD runtime startup", () => operations.startCallback());
    checkCancellation();
    await phase("recipientCallback");
  } finally {
    await timed("Recipient callback CCD runtime cleanup", () => operations.stopCallback());
  }
  if (results.at(-1).exitCode !== 0) return outcome();
  await phase("selectorEventRow");
  return outcome();
}

export async function stopSelectorCiResource(resource) {
 resource.controller.abort();
 assert(resource.completion,'CI_SELECTOR_COMPLETION_REQUIRED');
 const result=await resource.completion;
 assert.equal(result.cleanupComplete,true,'CI_SELECTOR_CLEANUP_INCOMPLETE');
}
export async function runSelectorCiPhase(job,context,directory,resource,{run=runSelectorEventPhase,readAuthority=readSelectorPhaseAuthority,validate=validateCiPhase}={}) {
 resource.completion=Promise.resolve().then(()=>run({candidate:job.candidateManifest,browser:context.browserRoot,output:directory},{signal:resource.controller.signal}));
 const result=await resource.completion;
 resource.summary=result;
 resource.admissionStarted={startedAt:new Date().toISOString(),start:performance.now()};
 assert.equal(result.cleanupComplete,true,'CI_SELECTOR_CLEANUP_INCOMPLETE');
 assert.equal(result.status,'PASS','CI_SELECTOR_NATIVE_PHASE_REQUIRED');
 assert.equal(result.nativeRuntimeAcceptance,true,'CI_SELECTOR_NATIVE_PHASE_REQUIRED');
 const selected=readAuthority(directory);
 for(const [field,value] of Object.entries({harnessCommit:context.commit,harnessSourceDigest:context.sourceDigests.selectorEventRow,harnessDependencyDigest:context.dependencies.digest,browserDigest:context.browserDigest}))
  assert.equal(selected.expected[field],value,'CI_SELECTOR_JOB_IDENTITY');
 assert.equal(selected.expected.identity.artifactDigest,job.expectedArtifactDigest,'CI_SELECTOR_JOB_CANDIDATE');
 const validated=validate(directory,selected.expected,selected.terminal);
 assert.equal(validated.receiptArtifactDigest,result.receiptArtifactDigest,'CI_SELECTOR_RECEIPT_CHANGED');
 resource.validated=validated;
 return {directory,...selected,expected:{...selected.expected,receiptArtifactDigest:validated.receiptArtifactDigest}};
}

export async function runHarnessCi(jobPath, {captureNativeCohort,capturePersonalNative} = {}) {
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
    phaseResults = [],
    phaseTimings = [];
  let failedPhase, phaseTerminal, phaseFailure;
  let context,
    verdict = blocked(),
    cleanupComplete = true,
    cancelled = false;
  const privateRoot = path.join(job.output, "private");
  const remove = async (_id, resource) => {
    let evidence;
    if (resource.kind === "selector") {
      await stopSelectorCiResource(resource);
    } else if (resource.kind === "ccd") {
      await resource.pendingStart?.catch(() => {});
      evidence = cleanupCiCcd(resource.directory);
      if (evidence)
        writeJsonAtomic(path.join(resource.directory, "cleanup-verification.json"), evidence);
    } else await cleanupCiPhase(resource, resource.context ?? context);
    resources.delete(_id);
    return evidence;
  };
  const startOwnedCcd = async (key, fixtureSelection, alive = () => true, phaseResource, callbackVariant) => {
    assert(callbackVariant === undefined || ["baseline","binding-omitted"].includes(callbackVariant),"CI_CALLBACK_VARIANT_REQUIRED");
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
    if (callbackVariant === undefined) {
      importCcdDefinition(ccd);
      verifyCcdRuntimeIdentity(ccd);
    } else {
      await importNativeCallbackDefinition(ccd,callbackVariant);
      verifyNativeCallbackRuntime(ccd,callbackVariant);
    }
    assert(!cancelled && alive(), "CI_EVENT_IMPORT_CANCELLED");
    return ccd;
  };
  const eventRuntimeData = (ccd, scope = EVENT_CAPABILITY_SCOPE) => {
    assert([EVENT_CAPABILITY_SCOPE,CALLBACK_SCOPE].includes(scope),"CI_SOURCE_RUNTIME_SCOPE_REQUIRED");
    const definitionFile = path.join(ccd.output, scope === CALLBACK_SCOPE ? "recipient-callback-native-import.json" : "definition-import.json");
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
      credentials: Object.fromEntries(["allowed", "courtadmin", "judge", "observer", "readonly"].map((actor) => [actor, ccdCredentials(ccd, actor)])),
    };
  };
  const eventIdentity = (data, releaseScopeId = EVENT_CAPABILITY_SCOPE) => nativeIdentity({
    ...data, artifact: context.artifact, releaseScopeId,
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
    captureNativeCohort?.(structuredClone(context.nativeCohortCapture));
    capturePersonalNative?.(structuredClone(context.personalNativeCapture));
    assert(!cancelled, "CI_JOB_CANCELLED");
    writeConfigurationCoverage({
      harnessRoot: ROOT,
      output: path.join(privateRoot, "configuration"),
    });
    writeJsonAtomic(path.join(privateRoot, "job-input.json"), job);
    const operations = {
      progress: reportNativeProgress,
      onTiming: (item) => phaseTimings.push(item),
      isCancelled: () => cancelled,
      phase: async (name) => {
        failedPhase = name;
        phaseTerminal = undefined;
        assert(!cancelled, "CI_JOB_CANCELLED");
        if(name === "selectorEventRow") {
          const directory=path.join(privateRoot,name),resource={kind:"selector",controller:new AbortController()};
          resources.set(name,resource);
          try {
            const selected=await runSelectorCiPhase(job,context,directory,resource);
            context.selectorResult=selected;
            const validated=resource.validated;
            writeConfigurationCoverage({harnessRoot:ROOT,output:path.join(privateRoot,"configuration"),phaseDirectory:context.ccdResult.directory,expected:context.ccdResult.expected,terminal:context.ccdResult.terminal,eventPhase:context.eventResult,routingPhase:context.routingResult,callbackPhase:context.callbackResult,selectorPhase:selected});
            phaseResults.push({phase:name,...validated});failedPhase=undefined;return {...validated,phaseTimings:[...(await resource.completion).phaseTimings,{label:'Selector cohort admission',status:validated.status,startedAt:resource.admissionStarted.startedAt,durationMs:Math.round(performance.now()-resource.admissionStarted.start)}]};
          } catch(error) {
            phaseFailure=nativePhaseFailure(error,name,undefined,{run:fs.existsSync(path.join(directory,'run.json')),gate:fs.existsSync(path.join(directory,'gate.json')),baselineReport:fs.existsSync(path.join(directory,'baseline/report.json'))},resource.summary?.diagnostic);
            throw error;
          } finally { await remove(name,resource); }
        }
        const directory = path.join(privateRoot, name),
          phaseContext = name === "eventCapability" ? { ...context, ...context.eventBaseline } : name === "recipientCallback" ? {...context,...context.callbackBaseline} : context,
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
        if (["ccd", "eventCapability", "recipientCallback"].includes(name))
          args.push(
            "--ccd-state",
            path.join(privateRoot, name === "recipientCallback" ? "callback-baseline-runtime/runtime.json" : name === "eventCapability" ? "event-baseline-runtime/runtime.json" : "ccd-runtime/runtime.json"),
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
              ["ccd", "eventCapability", "recipientCallback"].includes(name)
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
                const records = [], faults = [], states = [handoff.input.ccd];
                for (const invocationId of [EVENT_CAPABILITY_MUTATION, COURTADMIN_READ_MUTATION, READONLY_READ_MUTATION, READONLY_UPDATE_MUTATION, COURTADMIN_UPDATE_MUTATION, ...SOURCE_SHAPE_MUTATIONS]) {
                  assert(!cancelled && alive(), "CI_EVENT_TRANSITION_CANCELLED");
                  const variant = eventCapabilityFaultVariant(invocationId);
                  const fault = eventRuntimeData(await startOwnedCcd(`event-${variant}-runtime`, `event-capability-${variant}`, alive, resource));
                  const record = { schemaVersion: 1, runId: handoff.input.runId, invocationId,
                    requestDigest: digestBytes(JSON.stringify(request)), ...fault };
                  const selected = selectEventCapabilityRuntime(handoff.input, invocationId, record);
                  for (const state of states) {
                    assert.notEqual(fault.ccd.owner, state.owner, "CI_EVENT_FAULT_OWNER_REUSE");
                    assert.notEqual(fault.ccd.namespace, state.namespace, "CI_EVENT_FAULT_NAMESPACE_REUSE");
                    assert(Object.values(fault.ccd.containers).every(id => !Object.values(state.containers).includes(id)), "CI_EVENT_FAULT_CID_REUSE");
                  }
                  states.push(fault.ccd);
                  const faultOwnership = captureCiEventFaultOwnership(selected, handoff.handoff, { ...context, ccd: fault.ccd }, directory, invocationId);
                  resource.expectedContainer.invocations.push(...faultOwnership.invocations);
                  records.push(record);
                  faults.push({ invocationId, identity: eventIdentity(fault),
                    runtimeRecord: { path: `${invocationId}/runtime-input.json`, digest: digestBytes(JSON.stringify(record, null, 2) + "\n") } });
                }
                const transition = {
                  schemaVersion: 2, runId: handoff.input.runId, releaseScopeId: EVENT_CAPABILITY_SCOPE,
                  harnessCommit: handoff.expected.harnessCommit, harnessSourceDigest: handoff.expected.harnessSourceDigest,
                  capturedBeforeFault: true, capturedAt: new Date().toISOString(),
                  baselineInputDigest: digestBytes(fs.readFileSync(path.join(directory, "input.json"))),
                  requestDigest: digestBytes(JSON.stringify(request)), baselineCheckpointDigest: checkpoint.checkpointDigest,
                  baselineRemoval: { path: "baseline-removal.json", digest: digestBytes(fs.readFileSync(removalFile)) },
                  faults,
                };
                assert(!cancelled && alive(), "CI_EVENT_TRANSITION_CANCELLED");
                const transitionFile = path.join(directory, "independent-transition.json");
                assert(!fs.existsSync(transitionFile), "CI_EVENT_TRANSITION_ALREADY_CAPTURED");
                writeJsonAtomic(transitionFile, transition);
                resource.eventTransition = { path: "independent-transition.json", digest: digestBytes(fs.readFileSync(transitionFile)) };
                assert(!cancelled && alive(), "CI_EVENT_TRANSITION_CANCELLED");
                for (const [index, record] of records.entries()) {
                  assert(!cancelled && alive(), "CI_EVENT_TRANSITION_CANCELLED");
                  assert.deepEqual(publishEventCapabilityRuntime(directory, record), transition.faults[index].runtimeRecord, "CI_EVENT_ACK_CHANGED");
                }
              },
            } : {}),
            ...(name === "recipientCallback" ? {
              onCallbackTransition: async (request,handoff) => {
                const alive=()=>!handoff.isTerminated();
                assert(!cancelled&&alive(),"CI_CALLBACK_TRANSITION_CANCELLED");
                const checkpoint=readCallbackBaselineCheckpoint(directory,handoff.expected);
                const native=assertEventBaselineRemoved(resource.expectedContainer,{inspect:inspectHostContainer});
                const ccd=await remove("callback-baseline-runtime",resources.get("callback-baseline-runtime"));
                assert(ccd?.cleanupComplete===true,"CI_CALLBACK_BASELINE_CLEANUP_REQUIRED");
                const removal={schemaVersion:1,runId:handoff.input.runId,native,ccd,baselineNamespace:handoff.input.ccd.namespace,baselineOwner:handoff.input.ccd.owner};
                const removalFile=path.join(directory,"baseline-removal.json");writeJsonAtomic(removalFile,removal);
                const fault=eventRuntimeData(await startOwnedCcd("callback-binding-omitted-runtime","event-capability-baseline",alive,resource,"binding-omitted"),CALLBACK_SCOPE);
                assert(!cancelled&&alive(),"CI_CALLBACK_TRANSITION_CANCELLED");
                const record={schemaVersion:1,runId:handoff.input.runId,invocationId:CALLBACK_MUTATION,requestDigest:digestBytes(JSON.stringify(request)),...fault};
                const selected=selectCallbackRuntime(handoff.input,CALLBACK_MUTATION,record);
                assert(Object.values(fault.ccd.containers).every(id=>!Object.values(handoff.input.ccd.containers).includes(id)),"CI_CALLBACK_FAULT_CID_REUSE");
                const ownership=captureCiCallbackFaultOwnership(selected,handoff.handoff,{...context,ccd:fault.ccd},directory);
                resource.expectedContainer.invocations.push(...ownership.invocations);
                const transition={schemaVersion:1,runId:handoff.input.runId,releaseScopeId:CALLBACK_SCOPE,harnessCommit:handoff.expected.harnessCommit,harnessSourceDigest:handoff.expected.harnessSourceDigest,capturedBeforeFault:true,capturedAt:new Date().toISOString(),baselineInputDigest:digestBytes(fs.readFileSync(path.join(directory,"input.json"))),requestDigest:digestBytes(JSON.stringify(request)),baselineCheckpointDigest:checkpoint.checkpointDigest,baselineRemoval:{path:"baseline-removal.json",digest:digestBytes(fs.readFileSync(removalFile))},faults:[{invocationId:CALLBACK_MUTATION,identity:eventIdentity(fault,CALLBACK_SCOPE),runtimeRecord:{path:`${CALLBACK_MUTATION}/runtime-input.json`,digest:digestBytes(JSON.stringify(record,null,2)+"\n")}}]};
                assert(!cancelled&&alive(),"CI_CALLBACK_TRANSITION_CANCELLED");
                const transitionFile=path.join(directory,"independent-callback-transition.json");assert(!fs.existsSync(transitionFile),"CI_CALLBACK_TRANSITION_ALREADY_CAPTURED");writeJsonAtomic(transitionFile,transition);
                resource.callbackTransition={path:"independent-callback-transition.json",digest:digestBytes(fs.readFileSync(transitionFile))};
                assert(!cancelled&&alive(),"CI_CALLBACK_TRANSITION_CANCELLED");
                assert.deepEqual(publishCallbackRuntime(directory,record),transition.faults[0].runtimeRecord,"CI_CALLBACK_ACK_CHANGED");
              },
            } : {}),
          });
          phaseTerminal = result.terminal;
          assert(!cancelled, "CI_JOB_CANCELLED");
          if (name === "recipientCallback") result.expected = {...result.expected,callbackTransition:resource.callbackTransition};
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
          if (name === "routing") context.routingResult={directory,expected:{...result.expected,receiptArtifactDigest:validated.receiptArtifactDigest},terminal:result.terminal};
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
          if (name === "recipientCallback") {
            context.callbackResult={directory,expected:{...result.expected,receiptArtifactDigest:validated.receiptArtifactDigest},terminal:result.terminal};
            writeConfigurationCoverage({harnessRoot:ROOT,output:path.join(privateRoot,"configuration"),phaseDirectory:context.ccdResult.directory,expected:context.ccdResult.expected,terminal:context.ccdResult.terminal,eventPhase:context.eventResult,routingPhase:context.routingResult,callbackPhase:context.callbackResult});
          }
          phaseResults.push({ phase: name, ...validated });
          failedPhase = undefined;
          return validated;
        } catch (error) {
          let child;
          try { child = readChildFailure(fs.readFileSync(`${directory}-supervisor.log`, "utf8")); } catch { /* No child diagnostic was available. */ }
          phaseFailure = nativePhaseFailure(error, name, phaseTerminal ?? (resource.child ? {code: resource.child.exitCode, signal: resource.child.signalCode} : undefined), {
            run: fs.existsSync(path.join(directory, "run.json")),
            gate: fs.existsSync(path.join(directory, "gate.json")),
            baselineReport: fs.existsSync(path.join(directory, "baseline/report.json")),
          }, child);
          throw error;
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
        const workbasketReceipt = await importWorkbasketInputs(context.ccd);
        const observed = verifyCcdRuntimeIdentity(context.ccd),
          config = effectiveCandidateConfiguration(
            context.artifact.candidateRoot,
          ).config;
        config.now = false;
        config.jurisdictions = `${config.jurisdictions},HARNESS`;
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
          definitionDigests: { HarnessNestedPRL: observed.fixtureDigest,
            HarnessResultsPRL: workbasketReceipt.binding.workbookDigest },
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
      startCallback: async () => {
        const data=eventRuntimeData(await startOwnedCcd("callback-baseline-runtime","event-capability-baseline",()=>true,undefined,"baseline"),CALLBACK_SCOPE);
        context.callbackBaseline={...data,ccdIdentity:eventIdentity(data,CALLBACK_SCOPE)};
      },
      stopCallback: async () => {
        for(const key of ["callback-binding-omitted-runtime","callback-baseline-runtime"]){const resource=resources.get(key);if(resource)await remove(key,resource);}
      },
      startEvent: async () => {
        const data = eventRuntimeData(await startOwnedCcd("event-baseline-runtime", "event-capability-baseline"));
        context.eventBaseline = { ...data, ccdIdentity: eventIdentity(data) };
      },
      stopEvent: async () => {
        for (const key of [...SOURCE_SHAPE_MUTATIONS.map(id => `event-shape-${id.slice("ccd-shape-".length)}-mutant-runtime`).reverse(), "event-courtadmin-update-mutant-runtime", "event-readonly-update-mutant-runtime", "event-readonly-read-mutant-runtime", "event-read-mutant-runtime", "event-mutant-runtime", "event-baseline-runtime"]) {
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
      diagnostic: phaseFailure ?? nativePhaseFailure(error, failedPhase),
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
      fixedCiPhasesPassed(phaseResults),
    );
  }
  return { ...verdict, phaseTimings };
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
