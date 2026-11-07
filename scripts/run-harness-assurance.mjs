#!/usr/bin/env node
import {runMandatoryEmailAdmission} from './run-harness-mandatory-email-event-admission.mjs';
import {verifyMandatoryEmailNativeCapture} from './lib/exui-mandatory-email-event-contract.mjs';
import {runStCicProfileAdmission} from './run-harness-st-cic-profile-admission.mjs';
import {verifyStCicNativeCapture} from './lib/exui-st-cic-profile-admission.mjs';
import {runComplexEmailAdmission} from './run-harness-complex-email-admission.mjs';
import {prepareComplexAdmissionInputs,verifyComplexNativeCapture} from './lib/exui-complex-email-admission.mjs';
import {runPersonalServiceAdmission,isPersonalAdmissionClosedFailure} from './run-harness-personal-service-admission.mjs';
import {verifyPersonalNativeCapture} from './lib/exui-personal-service-admission.mjs';
import {runDivorceProfileAdmission} from './run-harness-divorce-profile-admission.mjs';
import {writeHarnessPublicSummary} from './lib/exui-output-boundary.mjs';
import {verifyDivorceNativeCapture} from './lib/exui-divorce-native-binding.mjs';
import {readSelectorPhaseAuthority} from './lib/exui-selector-event-row-evidence.mjs';
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { runHarnessCi, reportNativeProgress } from "./run-harness-ci.mjs";
import { validateCiJob } from "./lib/exui-candidate-ci-inputs.mjs";
import { getReleasePolicy } from "./lib/exui-release-policy.mjs";
import {assertFreshCandidateDerivationOutput} from "./lib/exui-candidate-artifact.mjs";
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
export async function runAssuranceSequence({ native, prepare, profile, personal, complex, stCic, mandatoryEmail, complexAttempt: configuredComplexAttempt, descriptor, collect, signal, withdraw = () => {}, publish = () => {}, snapshotAssuranceTiming, clock = () => performance.now() }) {
  assert(mandatoryEmail===undefined||typeof mandatoryEmail==='function','ASSURANCE_MANDATORY_CALLBACK_REQUIRED');
  let stCicStarted=false,mandatoryStarted=false;
  const finish=value=>{if(mandatoryEmail&&!Object.hasOwn(value,'mandatoryEmailStatus'))value={...value,mandatoryEmailStatus:mandatoryStarted?'BLOCKED':'NOT_RUN'};publish(value);return value;};
  if(signal?.aborted){withdraw();return finish({nativeStatus:'NOT_RUN',...(profile?{profileStatus:'NOT_RUN'}:{}),...(personal?{personalStatus:'NOT_RUN'}:{}),...(stCic?{stCicStatus:stCicStarted?'BLOCKED':'NOT_RUN'}:{}),diagnosticStatus:'not-run',exitCode:2,releaseApproval:false});}
  const nativeStartedAt = clock(), assuranceStartedAt = new Date().toISOString();
  const verdict = await native();
  assert(["PASS", "FAIL", "BLOCKED"].includes(verdict.status) && { PASS: 0, FAIL: 1, BLOCKED: 2 }[verdict.status] === verdict.exitCode, "ASSURANCE_NATIVE_VERDICT_REQUIRED");
  if (verdict.continuationSafe !== true) {
    withdraw();
    return finish({nativeStatus:verdict.status,...(profile?{profileStatus:'NOT_RUN'}:{}),...(personal?{personalStatus:'NOT_RUN'}:{}),...(stCic?{stCicStatus:stCicStarted?'BLOCKED':'NOT_RUN'}:{}),diagnosticStatus:'not-run',exitCode:2,releaseApproval:false});
  }
  let mandatoryMainRunId,mandatoryRequest,mandatoryEmailTiming,mandatoryCollectedStatus,mandatoryCollectionStarted=false;
  const mandatoryDiagnosticStatus=()=>['passed','failed'].includes(mandatoryCollectedStatus)?mandatoryCollectedStatus:mandatoryCollectionStarted?'incomplete':'not-run';
  let nativeElapsedMs = Math.round(clock() - nativeStartedAt), profileRequest, profileAttempt, profileDurationMs, personalRequest, personalAttempt, personalDurationMs, complexRequest, stCicRequest, complexAttempt=configuredComplexAttempt, eligible = true, descriptorFailed = false;
  const cancelled = () => {
    if (!signal?.aborted) return false;
    withdraw();
  return finish({ nativeStatus: verdict.status, ...(profile ? { profileStatus: "NOT_RUN" } : {}), ...(personal ? { personalStatus: "NOT_RUN" } : {}), ...(stCic?{stCicStatus:stCicStarted?"BLOCKED":"NOT_RUN"}:{}),diagnosticStatus: mandatoryEmail?mandatoryDiagnosticStatus():"not-run", exitCode: 2, releaseApproval: false });
  };
  const blockStCic=status=>{withdraw();return finish({nativeStatus:verdict.status,...(profile?{profileStatus:profileRequest?'PASS':profileAttempt?.status??'NOT_RUN'}:{}),...(personal?{personalStatus:personalRequest?'PASS':personalAttempt?.status??'NOT_RUN'}:{}),...((complex||complexAttempt)?{complexStatus:complexRequest?'PASS':complexAttempt?.status??'NOT_RUN'}:{}),stCicStatus:status,diagnosticStatus:'not-run',exitCode:2,releaseApproval:false});};
  const blockMandatory=()=>{withdraw();return finish({nativeStatus:verdict.status,...(profile?{profileStatus:profileRequest?'PASS':profileAttempt?.status??'NOT_RUN'}:{}),...(personal?{personalStatus:personalRequest?'PASS':personalAttempt?.status??'NOT_RUN'}:{}),...((complex||complexAttempt)?{complexStatus:complexRequest?'PASS':complexAttempt?.status??'NOT_RUN'}:{}),...(stCic?{stCicStatus:stCicRequest?'PASS':stCicStarted?'BLOCKED':'NOT_RUN'}:{}),diagnosticStatus:mandatoryDiagnosticStatus(),exitCode:2,releaseApproval:false});};
  let stopped = cancelled(); if (stopped) return stopped;
  if (prepare) {
    const started = clock();
    try { const prepared=await prepare(verdict);if(mandatoryEmail){assert(typeof prepared?.jobRunId==='string'&&/^ci-[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(prepared?.jobRunId),'ASSURANCE_MANDATORY_MAIN_ID_REQUIRED');mandatoryMainRunId=prepared.jobRunId;} } catch { eligible = false; }
    nativeElapsedMs += Math.round(clock() - started);
  }
  stopped = cancelled(); if (stopped) return stopped;
  if (profile) {
    if (eligible) {
      const started = clock();
      try {
        const result = await profile(signal);
        assert(result && typeof result === 'object' && !Array.isArray(result), 'ASSURANCE_PROFILE_RESULT_REQUIRED');
        assert.equal(result.status, "passed", "ASSURANCE_PROFILE_RESULT_REQUIRED");
        assert(result.reportRequest && typeof result.reportRequest === 'object' && !Array.isArray(result.reportRequest), "ASSURANCE_PROFILE_REQUEST_REQUIRED");
        assert.deepEqual(Object.keys(result.reportRequest).sort(), ['digest','path','runId'], 'ASSURANCE_PROFILE_REQUEST_REQUIRED');
        assert(typeof result.reportRequest.path === 'string' && path.isAbsolute(result.reportRequest.path)
          && typeof result.reportRequest.digest === 'string' && /^sha256:[a-f0-9]{64}$/.test(result.reportRequest.digest)
          && typeof result.reportRequest.runId === 'string' && result.reportRequest.runId.length > 0, 'ASSURANCE_PROFILE_REQUEST_REQUIRED');
        profileRequest = result.reportRequest;
      } catch {
        const stopped = cancelled(); if (stopped) return stopped;
        // The profile API has no trusted failure result proving child termination/cleanup.
        withdraw();
        return finish({nativeStatus:verdict.status,profileStatus:'BLOCKED',...(personal?{personalStatus:'NOT_RUN'}:{}),...(stCic?{stCicStatus:stCicStarted?'BLOCKED':'NOT_RUN'}:{}),diagnosticStatus:'not-run',exitCode:2,releaseApproval:false});
      } finally {
        profileDurationMs = Math.round(clock() - started);
        if(profileAttempt)profileAttempt.durationMs = profileDurationMs;
      }
    } else profileAttempt = { schemaVersion: 1, kind: "divorce-profile-attempt", status: "NOT_RUN", reason: "main-evidence-unavailable" };
  }
  stopped = cancelled(); if (stopped) return stopped;
  if (personal) {
    if (eligible && (!profile || profileRequest)) {
      const started = clock();
      try { const result = await personal(signal); assert.equal(result.status,'passed','ASSURANCE_PERSONAL_RESULT_REQUIRED'); assert(result.reportRequest&&typeof result.reportRequest==='object'&&!Array.isArray(result.reportRequest),'ASSURANCE_PERSONAL_REQUEST_REQUIRED'); assert.deepEqual(Object.keys(result.reportRequest).sort(),['digest','path','runId'],'ASSURANCE_PERSONAL_REQUEST_REQUIRED');assert(typeof result.reportRequest.path==='string'&&path.isAbsolute(result.reportRequest.path)&&typeof result.reportRequest.digest==='string'&&/^sha256:[a-f0-9]{64}$/.test(result.reportRequest.digest)&&typeof result.reportRequest.runId==='string'&&result.reportRequest.runId.length>0,'ASSURANCE_PERSONAL_REQUEST_REQUIRED'); personalRequest=result.reportRequest; }
      catch(error) { if(!isPersonalAdmissionClosedFailure(error)){withdraw();return finish({nativeStatus:verdict.status,...(profile?{profileStatus:profileRequest?'PASS':'NOT_RUN'}:{}),personalStatus:'BLOCKED',...(stCic?{stCicStatus:stCicStarted?'BLOCKED':'NOT_RUN'}:{}),diagnosticStatus:'not-run',exitCode:2,releaseApproval:false});} personalAttempt={schemaVersion:1,kind:'personal-service-attempt',status:'BLOCKED',reason:'personal-service-not-admitted'}; }
      finally {personalDurationMs=Math.round(clock()-started);if(personalAttempt)personalAttempt.durationMs=personalDurationMs;}
    } else personalAttempt={schemaVersion:1,kind:'personal-service-attempt',status:'NOT_RUN',reason:eligible?'preceding-stage-not-admitted':'main-evidence-unavailable'};
  }
  stopped=cancelled();if(stopped)return stopped;
  if(complex){
    if(eligible&&(!profile||profileRequest)&&(!personal||personalRequest)){
      try{const result=await complex(signal);assert.equal(result?.status,'passed','ASSURANCE_COMPLEX_RESULT_REQUIRED');assert.deepEqual(Object.keys(result.reportRequest??{}).sort(),['digest','path','runId'],'ASSURANCE_COMPLEX_REQUEST_REQUIRED');assert(typeof result.reportRequest.path==='string'&&path.isAbsolute(result.reportRequest.path)&&/^sha256:[a-f0-9]{64}$/.test(result.reportRequest.digest)&&/^complex-[a-f0-9-]{36}$/.test(result.reportRequest.runId),'ASSURANCE_COMPLEX_REQUEST_REQUIRED');complexRequest=result.reportRequest;}
      catch{withdraw();return finish({nativeStatus:verdict.status,...(profile?{profileStatus:profileRequest?'PASS':'NOT_RUN'}:{}),...(personal?{personalStatus:personalRequest?'PASS':'NOT_RUN'}:{}),complexStatus:'BLOCKED',...(stCic?{stCicStatus:stCicStarted?'BLOCKED':'NOT_RUN'}:{}),diagnosticStatus:'not-run',exitCode:2,releaseApproval:false});}
    }else complexAttempt={schemaVersion:1,kind:'complex-email-attempt',status:'NOT_RUN',reason:'preceding-stage-not-admitted'};
  }
  stopped=cancelled();if(stopped)return stopped;
  if(stCic){
    if(!eligible||(profile&&!profileRequest)||(personal&&!personalRequest)||(complex&&!complexRequest))return blockStCic('NOT_RUN');
    const started=clock();stCicStarted=true;
    try{
      const result=await stCic(signal);
      assert(result&&typeof result==='object'&&!Array.isArray(result)&&result.status==='passed','ASSURANCE_ST_CIC_RESULT_REQUIRED');
      const request=result.reportRequest;
      assert(request&&typeof request==='object'&&!Array.isArray(request),'ASSURANCE_ST_CIC_REQUEST_REQUIRED');
      assert.deepEqual(Object.keys(request).sort(),['digest','path','runId'],'ASSURANCE_ST_CIC_REQUEST_REQUIRED');
      assert(typeof request.path==='string'&&path.isAbsolute(request.path)&&path.normalize(request.path)===request.path&&typeof request.digest==='string'&&/^sha256:[a-f0-9]{64}$/.test(request.digest)&&typeof request.runId==='string'&&/^st-cic-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(request.runId),'ASSURANCE_ST_CIC_REQUEST_REQUIRED');
      stCicRequest=structuredClone(request);
    }catch{return blockStCic('BLOCKED');}
    finally{nativeElapsedMs+=Math.round(clock()-started);}
  }
  stopped=cancelled();if(stopped)return stopped;
  if(mandatoryEmail){
    if(!eligible||!mandatoryMainRunId||(profile&&!profileRequest)||(personal&&!personalRequest)||(complex&&!complexRequest)||(stCic&&!stCicRequest))return blockMandatory();
    const started=clock(),startedAt=new Date().toISOString();mandatoryStarted=true;
    try{
      const result=await mandatoryEmail(signal),request=result?.reportRequest;
      assert(result?.admission?.status==='passed','ASSURANCE_MANDATORY_RESULT_REQUIRED');
      assert(request&&typeof request==='object'&&!Array.isArray(request),'ASSURANCE_MANDATORY_REQUEST_REQUIRED');
      assert.deepEqual(Object.keys(request).sort(),['digest','path','runId'],'ASSURANCE_MANDATORY_REQUEST_REQUIRED');
      assert(typeof request.path==='string'&&path.isAbsolute(request.path)&&path.normalize(request.path)===request.path&&typeof request.digest==='string'&&/^sha256:[a-f0-9]{64}$/.test(request.digest)&&typeof request.runId==='string'&&/^mandatory-admission-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(request.runId),'ASSURANCE_MANDATORY_REQUEST_REQUIRED');
      assert.equal(result.admission.runId,request.runId,'ASSURANCE_MANDATORY_REQUEST_REQUIRED');
      mandatoryRequest=structuredClone(request);const elapsedMs=Math.round(clock()-started);assert(Number.isSafeInteger(elapsedMs)&&elapsedMs>=0,'ASSURANCE_MANDATORY_TIMING_REQUIRED');
      mandatoryEmailTiming={schemaVersion:1,scope:'mandatory-email-admission-call',clock:'monotonic',startedAt,elapsedMs,mainRunId:mandatoryMainRunId,mandatoryRunId:mandatoryRequest.runId,requestDigest:mandatoryRequest.digest};
    }catch{return blockMandatory();}
  }
  stopped=cancelled();if(stopped)return stopped;
  let nativeEvidencePath;
  const descriptorStarted = clock();
  try { nativeEvidencePath = await descriptor(verdict, profileRequest, personalRequest, complexRequest,...(stCic||mandatoryEmail?[stCicRequest]:[]),...(mandatoryEmail?[structuredClone(mandatoryRequest),structuredClone(mandatoryEmailTiming)]:[])); }
  catch (error) {
    if(mandatoryEmail)return blockMandatory();
    if(stCic)return blockStCic('BLOCKED');
    if(complexRequest){withdraw();return finish({nativeStatus:verdict.status,complexStatus:'BLOCKED',...(stCic?{stCicStatus:stCicStarted?'BLOCKED':'NOT_RUN'}:{}),diagnosticStatus:'not-run',exitCode:2,releaseApproval:false});}
    if (!profile && !personal && verdict.status === "PASS") throw error;
    descriptorFailed = true;
    if (personalRequest) {
      personalRequest=undefined;personalAttempt={schemaVersion:1,kind:'personal-service-attempt',status:'BLOCKED',reason:'personal-service-not-admitted',durationMs:personalDurationMs};
      try {nativeEvidencePath=await descriptor(verdict,profileRequest,undefined);} catch { /* Preserve only independently usable earlier evidence. */ }
    }
    if (!nativeEvidencePath && profileRequest) {
      profileRequest = undefined;
      profileAttempt = { schemaVersion: 1, kind: "divorce-profile-attempt", status: "BLOCKED", reason: "profile-not-admitted", ...(profileDurationMs===undefined?{}:{durationMs:profileDurationMs}) };
      try { nativeEvidencePath = await descriptor(verdict, undefined); } catch { /* Unavailable main evidence receives no credit. */ }
    }
    if (profile && !nativeEvidencePath && profileAttempt?.status!=="NOT_RUN") profileAttempt = { schemaVersion: 1, kind: "divorce-profile-attempt", status: "BLOCKED", reason: "main-evidence-unavailable" };
  }
  if(profile && typeof nativeEvidencePath!=='string'){
    descriptorFailed=true;profileRequest=undefined;
    profileAttempt??={schemaVersion:1,kind:'divorce-profile-attempt',status:'BLOCKED',reason:'main-evidence-unavailable',...(profileDurationMs===undefined?{}:{durationMs:profileDurationMs})};
  }
  if(personal && typeof nativeEvidencePath!=='string'){
    descriptorFailed=true;personalRequest=undefined;personalAttempt={schemaVersion:1,kind:'personal-service-attempt',status:'BLOCKED',reason:'main-evidence-unavailable',...(personalDurationMs===undefined?{}:{durationMs:personalDurationMs})};
  }
  if(mandatoryEmail&&(typeof nativeEvidencePath!=='string'||!path.isAbsolute(nativeEvidencePath)||path.normalize(nativeEvidencePath)!==nativeEvidencePath))return blockMandatory();
  if(stCic&&(typeof nativeEvidencePath!=='string'||!path.isAbsolute(nativeEvidencePath)||path.normalize(nativeEvidencePath)!==nativeEvidencePath))return blockStCic('BLOCKED');
  nativeElapsedMs += Math.round(clock() - descriptorStarted);
  stopped = cancelled(); if (stopped) return stopped;
  let diagnostics;
  try{if(mandatoryEmail)mandatoryCollectionStarted=true;diagnostics = await collect(nativeEvidencePath, {
    snapshotAssuranceTiming: snapshotAssuranceTiming ?? (() => {
      const endedAt = clock(), elapsed = endedAt - nativeStartedAt;
      assert(Number.isFinite(nativeStartedAt) && Number.isFinite(endedAt) && Number.isFinite(elapsed) && elapsed >= 0 && Number.isSafeInteger(Math.round(elapsed)), 'ASSURANCE_TIMING_INVALID');
      return { schemaVersion: 1, scope: 'assurance-start-to-report-snapshot', clock: 'monotonic', startedAt: assuranceStartedAt, elapsedMs: Math.round(elapsed) };
    }),
    ...(nativeEvidencePath ? { nativeElapsedMs, ...(verdict.phaseTimings ? { phaseTimings: verdict.phaseTimings } : {}) } : {}),
    ...(profileAttempt ? { divorceProfileAttempt: profileAttempt } : {}),
    ...(personalAttempt ? { personalServiceAttempt: personalAttempt } : {}),
    ...(complexAttempt ? { complexEmailAttempt: complexAttempt } : {}),
    ...(mandatoryEmailTiming?{mandatoryEmailTiming:structuredClone(mandatoryEmailTiming)}:{}),
  });}catch(error){if(mandatoryEmail)return blockMandatory();if(stCic)return blockStCic('BLOCKED');throw error;}
  if(mandatoryEmail)mandatoryCollectedStatus=diagnostics?.status;
  stopped = cancelled(); if (stopped) return stopped;
  assert(["passed", "failed"].includes(diagnostics.status) && [0, 1, 2].includes(diagnostics.exitCode) && (diagnostics.status !== "failed" || diagnostics.exitCode !== 0), "ASSURANCE_DIAGNOSTIC_VERDICT_REQUIRED");
  const profileStatus = profileRequest && diagnostics.divorceProfileInclusion === "included" ? "PASS" : profileAttempt?.status ?? "BLOCKED";
  const personalStatus=personalRequest&&diagnostics.personalServiceInclusion==='included'?'PASS':personalAttempt?.status??'BLOCKED';
  const complexStatus=complexRequest&&diagnostics.complexEmailInclusion==='included'?'PASS':complexAttempt?.status??'BLOCKED';
  const stCicStatus=stCicRequest&&diagnostics.stCicProfileInclusion==='included'?'PASS':'BLOCKED';
  const mandatoryEmailStatus=mandatoryRequest&&diagnostics.mandatoryEmailInclusion==='included'?'PASS':'BLOCKED';
  if(mandatoryEmail&&mandatoryEmailStatus!=='PASS')withdraw();
  return finish({ nativeStatus: verdict.status, ...(mandatoryEmail?{mandatoryEmailStatus}:{}), ...(profile ? { profileStatus } : {}), ...(personal ? {personalStatus} : {}), ...((complex||complexAttempt)?{complexStatus}:{}), ...(stCic?{stCicStatus}:{}), diagnosticStatus: diagnostics.status, exitCode: Math.max(verdict.exitCode, diagnostics.exitCode, (mandatoryEmail&&mandatoryEmailStatus!=='PASS') || (stCic&&stCicStatus!=='PASS') || (complexRequest&&diagnostics.complexEmailInclusion!=='included') || profileAttempt || personalAttempt || (personalRequest && diagnostics.personalServiceInclusion!=='included') || ((profile || personal) && descriptorFailed) || (profileRequest && diagnostics.divorceProfileInclusion!=='included') ? 2 : 0), releaseApproval: false });
}
export function buildNativeDescriptor(job, captured, verdict, sharedRoleSourceInputs, divorceProfileRequest, personalServiceRequest, complexEmailRequest, stCicProfileRequest, mandatoryEmailRequest) {
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
  // Keep opaque pre-main references identical across stage contexts, but unused
  // optional files are not prerequisites for publishing independently valid main evidence.
  const personalServiceNativeBinding=personalServiceRequest?verifyPersonalNativeCapture(job.output,captured.personalNativeCapture):structuredClone(captured.personalNativeCapture?.reference);
  const complexEmailNativeBinding=complexEmailRequest?verifyComplexNativeCapture(job.output,captured.complexNativeCapture):structuredClone(captured.complexNativeCapture?.reference);
  if(complexEmailRequest){assert.deepEqual(Object.keys(complexEmailRequest).sort(),['digest','path','runId'],'ASSURANCE_COMPLEX_REQUEST_INVALID');const request=read(complexEmailRequest.path);assert.equal(request.digest,complexEmailRequest.digest,'ASSURANCE_COMPLEX_REQUEST_CHANGED');assert.equal(request.value.expected.runId,complexEmailRequest.runId,'ASSURANCE_COMPLEX_REQUEST_CHANGED');assert(complexEmailNativeBinding,'ASSURANCE_COMPLEX_PREFLIGHT_REQUIRED');}
  if(personalServiceRequest){assert.deepEqual(Object.keys(personalServiceRequest).sort(),['digest','path','runId'],'ASSURANCE_PERSONAL_REQUEST_INVALID');const request=read(personalServiceRequest.path);assert.equal(request.digest,personalServiceRequest.digest,'ASSURANCE_PERSONAL_REQUEST_CHANGED');assert.equal(request.value.expected.runId,personalServiceRequest.runId,'ASSURANCE_PERSONAL_REQUEST_CHANGED');assert(personalServiceNativeBinding,'ASSURANCE_PERSONAL_PREFLIGHT_REQUIRED');}
  const stCicNativeBinding=stCicProfileRequest?verifyStCicNativeCapture(job.output,captured.stCicNativeCapture):structuredClone(captured.stCicNativeCapture?.reference);
  if(stCicProfileRequest){assert.deepEqual(Object.keys(stCicProfileRequest).sort(),['digest','path','runId'],'ASSURANCE_ST_CIC_REQUEST_INVALID');const request=read(stCicProfileRequest.path);assert.equal(request.digest,stCicProfileRequest.digest,'ASSURANCE_ST_CIC_REQUEST_CHANGED');assert.equal(request.value.expected.runId,stCicProfileRequest.runId,'ASSURANCE_ST_CIC_REQUEST_CHANGED');assert(stCicNativeBinding,'ASSURANCE_ST_CIC_PREFLIGHT_REQUIRED');}
  const mandatorySelected=captured.mandatoryEmailNativeCapture!==undefined||Object.hasOwn(result.value,'mandatoryEmailNativeBinding')||mandatoryEmailRequest!==undefined;
  let mandatoryEmailNativeBinding;
  if(mandatorySelected){mandatoryEmailNativeBinding=verifyMandatoryEmailNativeCapture(job.output,captured.mandatoryEmailNativeCapture);assert.deepEqual(result.value.mandatoryEmailNativeBinding,mandatoryEmailNativeBinding,'ASSURANCE_MANDATORY_PREFLIGHT_REQUIRED');}
  if(mandatoryEmailRequest!==undefined){assert.deepEqual(Object.keys(mandatoryEmailRequest??{}).sort(),['digest','path','runId'],'ASSURANCE_MANDATORY_REQUEST_INVALID');assert(typeof mandatoryEmailRequest.path==='string'&&path.isAbsolute(mandatoryEmailRequest.path)&&path.normalize(mandatoryEmailRequest.path)===mandatoryEmailRequest.path&&typeof mandatoryEmailRequest.digest==='string'&&/^sha256:[a-f0-9]{64}$/.test(mandatoryEmailRequest.digest)&&typeof mandatoryEmailRequest.runId==='string'&&/^mandatory-admission-[a-f0-9-]{36}$/.test(mandatoryEmailRequest.runId),'ASSURANCE_MANDATORY_REQUEST_INVALID');const request=read(mandatoryEmailRequest.path);assert.equal(request.digest,mandatoryEmailRequest.digest,'ASSURANCE_MANDATORY_REQUEST_CHANGED');assert.equal(request.value.expected.runId,mandatoryEmailRequest.runId,'ASSURANCE_MANDATORY_REQUEST_CHANGED');assert(mandatoryEmailNativeBinding,'ASSURANCE_MANDATORY_PREFLIGHT_REQUIRED');}
  const descriptor = {
    schemaVersion: 1,
    directory: job.output,
    ...(mandatoryEmailRequest===undefined?{}:{mandatoryEmailAdmission:mandatoryEmailRequest.path}),
    ...(stCicProfileRequest?{stCicProfileAdmission:stCicProfileRequest.path}:{}),
    ...(complexEmailRequest?{complexEmailAdmission:complexEmailRequest.path}:{}),
    ...(personalServiceRequest?{personalServiceAdmission:personalServiceRequest.path}:{}),
    ...(divorceProfileRequest ? {divorceProfileAdmission: divorceProfileRequest.path} : {}),
    ...(sharedRoleSourceInputs ? { sharedRoleAdmission: { candidateArtifactPath: job.candidateManifest, sourceImageInputs: sharedRoleSourceInputs } } : {}),
    expected: {
      ...(mandatoryEmailNativeBinding?{mandatoryEmailNativeBinding}:{}),
      ...(mandatoryEmailRequest===undefined?{}:{mandatoryEmailRequest:{runId:mandatoryEmailRequest.runId,digest:mandatoryEmailRequest.digest}}),      ...(stCicNativeBinding?{stCicNativeBinding}:{}),
      ...(stCicProfileRequest?{stCicProfileRequest:{runId:stCicProfileRequest.runId,digest:stCicProfileRequest.digest}}:{}),
      ...(complexEmailNativeBinding?{complexEmailNativeBinding}:{}),
      ...(complexEmailRequest?{complexEmailRequest:{runId:complexEmailRequest.runId,digest:complexEmailRequest.digest}}:{}),
      ...(personalServiceNativeBinding?{personalServiceNativeBinding}:{}),
      ...(personalServiceRequest?{personalServiceRequest:{runId:personalServiceRequest.runId,digest:personalServiceRequest.digest}}:{}),
      ...(nativeCohortBinding ? {nativeCohortBinding} : {}),
      ...(divorceProfileRequest ? {divorceProfileRequest: {runId: divorceProfileRequest.runId, digest: divorceProfileRequest.digest}} : {}),
      jobRunId: result.value.jobRunId,
      ciResultDigest: result.digest,
      harnessCommit: captured.harnessCommit,
      candidateArtifactDigest: job.expectedArtifactDigest,
      phases,
    },
  };
  return descriptor;
}
export function writeNativeDescriptor(job, captured, verdict, sharedRoleSourceInputs, divorceProfileRequest, personalServiceRequest, complexEmailRequest, stCicProfileRequest, mandatoryEmailRequest) {
  const descriptor = buildNativeDescriptor(job, captured, verdict, sharedRoleSourceInputs, divorceProfileRequest, personalServiceRequest, complexEmailRequest, stCicProfileRequest, mandatoryEmailRequest);
  const file = path.join(job.output, "private/native-report-request.json");
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
export function publishAssuranceSummary(job, captured, result) {
  if(!captured.nativeCohortCapture)return;
  verifyDivorceNativeCapture(job.output,captured.nativeCohortCapture);
  if(result.personalStatus==='PASS'||result.complexStatus==='PASS'||result.stCicStatus==='PASS'||result.mandatoryEmailStatus==='PASS'){
    try{if(result.mandatoryEmailStatus==='PASS')verifyMandatoryEmailNativeCapture(job.output,captured.mandatoryEmailNativeCapture);if(result.personalStatus==='PASS')verifyPersonalNativeCapture(job.output,captured.personalNativeCapture);if(result.complexStatus==='PASS')verifyComplexNativeCapture(job.output,captured.complexNativeCapture);if(result.stCicStatus==='PASS')verifyStCicNativeCapture(job.output,captured.stCicNativeCapture);}
    catch(error){try{Reporter.resetPublicReport('harness');}finally{writeHarnessPublicSummary(job.output,{status:'BLOCKED',exitCode:2},false);}throw error;}
  }
  assert([0,1,2].includes(result.exitCode),'ASSURANCE_EXIT_REQUIRED');
  writeHarnessPublicSummary(job.output,{status:['PASS','FAIL','BLOCKED'][result.exitCode],exitCode:result.exitCode},result.exitCode===0);
}
export async function runHarnessAssurance(jobPath, { aat = false, env = process.env, profileOutput, personalOutput, stCicOutput, mandatoryEmailOutput, snapshotAssuranceTiming, buildSelfCheckHeld } = {}) {
  assert.equal(process.cwd(), ROOT, "ASSURANCE_REPOSITORY_CWD_REQUIRED");
  Reporter.resetPublicReport("harness");
  if(buildSelfCheckHeld!==undefined)buildSelfCheckHeld=structuredClone(buildSelfCheckHeld);
  if(buildSelfCheckHeld!==undefined){const{readHeldBuildSelfChecks}=await import('./run-harness-self-check-evidence.mjs');readHeldBuildSelfChecks(buildSelfCheckHeld);}
  assert(profileOutput === undefined || (typeof profileOutput === 'string' && path.isAbsolute(profileOutput)), 'ASSURANCE_PROFILE_OUTPUT_REQUIRED');
  assert(stCicOutput===undefined||(typeof stCicOutput==='string'&&path.isAbsolute(stCicOutput)),'ASSURANCE_ST_CIC_OUTPUT_REQUIRED');
  const job = validateCiJob(read(jobPath).value);
  if(mandatoryEmailOutput!==undefined){
    assert(typeof mandatoryEmailOutput==='string'&&path.isAbsolute(mandatoryEmailOutput)&&path.normalize(mandatoryEmailOutput)===mandatoryEmailOutput,'ASSURANCE_MANDATORY_OUTPUT_REQUIRED');
    assert.equal(fs.realpathSync(path.dirname(mandatoryEmailOutput)),path.dirname(mandatoryEmailOutput),'ASSURANCE_MANDATORY_OUTPUT_ALIAS');
    const candidateRoot=fs.realpathSync(read(job.candidateManifest).value.candidateRoot),siblings=[profileOutput,stCicOutput,personalOutput].filter(value=>value!==undefined);
    for(const sibling of siblings){assert(typeof sibling==='string'&&path.isAbsolute(sibling)&&path.normalize(sibling)===sibling,'ASSURANCE_MANDATORY_OUTPUT_ALIAS');assert.equal(fs.realpathSync(path.dirname(sibling)),path.dirname(sibling),'ASSURANCE_MANDATORY_OUTPUT_ALIAS');}
    for(const other of [ROOT,fs.realpathSync(path.join(ROOT,'node_modules')),fs.realpathSync(job.candidateManifest),candidateRoot,fs.realpathSync(job.browserCache),job.output,...siblings])assert(mandatoryEmailOutput!==other&&!mandatoryEmailOutput.startsWith(other+path.sep)&&!other.startsWith(mandatoryEmailOutput+path.sep),'ASSURANCE_MANDATORY_OUTPUT_OVERLAP');
    await assertFreshCandidateDerivationOutput({baseline:{candidateRoot},manifestPath:job.candidateManifest,output:mandatoryEmailOutput});
  }
  const sharedRoleSourceInputs = env.HARNESS_SHARED_ROLE_SOURCE_INPUTS ? read(env.HARNESS_SHARED_ROLE_SOURCE_INPUTS).value : undefined;
  const complexConfiguration=prepareComplexAdmissionInputs(env.HARNESS_COMPLEX_SOURCE_INPUTS,{host:process.platform,arch:process.arch,runtime:read(job.candidateManifest).value.provenance?.platform});
  const captured = captureAssuranceExpectations(env);
  const { runHarnessCollection } = await import("./run-harness-local-aat.cjs");
  const cancellation = new AbortController(), cancel = () => cancellation.abort();
  process.once('SIGINT', cancel); process.once('SIGTERM', cancel);
  let result, mainDescriptor, published=false;
  try {
    result = await runAssuranceSequence({
      native: () => runHarnessCi(jobPath, { ...(mandatoryEmailOutput===undefined?{}:{captureMandatoryEmailNative:value=>{captured.mandatoryEmailNativeCapture=structuredClone(value);}}), ...(stCicOutput===undefined?{}:{captureStCicNative:value=>{captured.stCicNativeCapture=value;}}), captureNativeCohort: value => { captured.nativeCohortCapture = value; }, capturePersonalNative:value=>{captured.personalNativeCapture=value;}, captureComplexNative:value=>{captured.complexNativeCapture=value;}, complexSourceConfiguration:complexConfiguration }),
      prepare: verdict => { assert(captured.nativeCohortCapture, 'ASSURANCE_PREFLIGHT_REQUIRED'); mainDescriptor = buildNativeDescriptor(job, captured, verdict, sharedRoleSourceInputs);return mandatoryEmailOutput===undefined?undefined:{jobRunId:mainDescriptor.expected.jobRunId}; },
      ...(profileOutput === undefined ? {} : {profile: signal => runDivorceProfileAdmission({ artifactPath: job.candidateManifest, browserRoot: job.browserCache, output: profileOutput, signal, nativeContext: { binding: captured.nativeCohortCapture.binding, expected: mainDescriptor.expected } })}),
      personal: signal => reportNativeProgress("Personal-service preparation, proofs and cleanup", () => runPersonalServiceAdmission({candidate:job.candidateManifest,browser:job.browserCache,output:personalOutput??path.join(job.output,'private/personal-service'),signal,nativeOutput:job.output,nativeContext:{native:captured.nativeCohortCapture.binding,capture:captured.personalNativeCapture,expected:mainDescriptor.expected}})),
      ...(complexConfiguration.attempt?{complexAttempt:complexConfiguration.attempt}:{complex:signal=>reportNativeProgress('Complex email browser, mapping and source proofs',()=>runComplexEmailAdmission({candidate:job.candidateManifest,browser:job.browserCache,output:path.join(job.output,'private/complex-email'),signal,nativeOutput:job.output,sourceConfiguration:complexConfiguration,nativeContext:{native:captured.nativeCohortCapture.binding,capture:captured.complexNativeCapture,expected:mainDescriptor.expected}}))}),
      ...(stCicOutput===undefined?{}:{stCic:signal=>reportNativeProgress('ST_CIC profile configuration proofs',()=>runStCicProfileAdmission({artifactPath:job.candidateManifest,browserRoot:job.browserCache,output:stCicOutput,signal,admissionContext:{native:captured.nativeCohortCapture.binding,capture:captured.stCicNativeCapture,expected:mainDescriptor.expected}}))}),
      ...(mandatoryEmailOutput===undefined?{}:{mandatoryEmail:signal=>reportNativeProgress('Mandatory email source-row proofs and cleanup',()=>runMandatoryEmailAdmission({candidate:job.candidateManifest,browser:job.browserCache,output:mandatoryEmailOutput,signal,admissionContext:{native:captured.nativeCohortCapture.binding,capture:captured.mandatoryEmailNativeCapture,expected:mainDescriptor.expected}}))}),
      descriptor: (verdict, request, personalRequest, complexRequest, stCicRequest, mandatoryRequest, mandatoryTiming) => {
        const file=writeNativeDescriptor(job,captured,verdict,sharedRoleSourceInputs,request,personalRequest,complexRequest,stCicRequest,mandatoryRequest);
        if(mandatoryTiming)fs.writeFileSync(path.join(job.output,'private/mandatory-email-phase-timing.json'),JSON.stringify(mandatoryTiming,null,2)+'\n',{flag:'wx',mode:0o600});
        return file;
      },
      collect: (nativeEvidencePath, timing) => reportNativeProgress("Evidence replay and diagnostic report", () => runHarnessCollection(env, { profile: aat ? "local-aat" : "harness", nativeEvidencePath, ...timing, signal: cancellation.signal, buildSelfCheckHeld })),
      signal: cancellation.signal,
      snapshotAssuranceTiming,
      withdraw: () => Reporter.resetPublicReport('harness'),
      publish: value => {published=true;publishAssuranceSummary(job,captured,value);},
    });
    return result;
  } finally {
    process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel);
    // Only a parent-captured owned output can receive the whole-command summary.
    if(!published)publishAssuranceSummary(job,captured,{exitCode:2});
  }
}

// Only the explicitly owned parent IPC channel supplies preparation timing.
export async function connectPreparationTiming(channel = process, { timeoutMs = 5 * 1000 } = {}) {
  assert(channel.connected && typeof channel.send === 'function', 'ASSURANCE_PARENT_TIMING_UNAVAILABLE');
  let invalid = false, disposed = false;
  const idleViolation = () => { invalid = true; if(channel === process) process.kill(process.pid,'SIGTERM'); };
  const watchIdle = () => channel.on('message',idleViolation);
  function exchange(message, kind, validate, succeeded) {
    return new Promise((resolve, reject) => {
      const cleanup = () => { clearTimeout(timer); channel.removeListener('message', onMessage); channel.removeListener('disconnect', failed); };
      const failed = () => { cleanup(); reject(new Error('ASSURANCE_PARENT_TIMING_UNAVAILABLE')); };
      const onMessage = value => {
        try { assert(value?.kind === kind); const result = validate(value); cleanup(); succeeded(); resolve(result); } catch { failed(); }
      };
      const timer = setTimeout(failed, timeoutMs);
      channel.on('message', onMessage); channel.once('disconnect', failed);
      try { channel.send(message, error => { if (error) failed(); }); } catch { failed(); }
    });
  }
  const token = await exchange({kind:'harness-preparation-ready'}, 'harness-preparation-init', value => {
    assert.deepEqual(Object.keys(value).sort(), ['kind','token']);
    assert(typeof value.token === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value.token)); return value.token;
  }, watchIdle);
  let requested = false;
  const snapshot = async () => {
    assert(!invalid && !disposed && !requested && channel.connected, 'ASSURANCE_PARENT_TIMING_UNAVAILABLE'); requested = true;
    channel.removeListener('message',idleViolation);
    const timing = await exchange({kind:'harness-preparation-snapshot',token}, 'harness-preparation-timing', value => {
      assert.deepEqual(Object.keys(value).sort(), ['kind','timing','token']); assert.equal(value.token, token);
      Reporter.validateAssuranceTiming(value.timing); assert.equal(value.timing?.schemaVersion,2);
      return value.timing;
    }, watchIdle);
    assert(!invalid, 'ASSURANCE_PARENT_TIMING_UNAVAILABLE'); return timing;
  };
  snapshot.dispose = () => { disposed = true; channel.removeListener('message',idleViolation); };
  return snapshot;
}

// CLI-only ownership: the direct API keeps its existing optional output contract.
export function parseAssuranceCli(argv) {
  let args = argv.filter(value => value !== '--');
  let buildSelfCheckHeld;
  const marker = args.indexOf('--build-self-check-held');
  if (marker !== -1) {
    assert(marker === args.length - 4 && args[marker + 2] === '--build-self-check-digest', 'ASSURANCE_SELF_CHECK_ARGUMENTS');
    buildSelfCheckHeld = {path:args[marker + 1],digest:args[marker + 3]};
    assert(typeof buildSelfCheckHeld.path === 'string' && path.isAbsolute(buildSelfCheckHeld.path) && path.normalize(buildSelfCheckHeld.path) === buildSelfCheckHeld.path && /^sha256:[a-f0-9]{64}$/.test(buildSelfCheckHeld.digest), 'ASSURANCE_SELF_CHECK_ARGUMENTS');
    args = args.slice(0, marker);
  }
  assert(args.length >= 2 && args.length <= 6 && args[0] === '--input' && path.isAbsolute(args[1])
    && new Set(args.slice(2)).size === args.length - 2
    && args.slice(2).every(flag => ['--aat','--parent-timing','--st-cic','--mandatory-email'].includes(flag)), 'ASSURANCE_INPUT_REQUIRED');
  return {jobPath:args[1],aat:args.includes('--aat'),parentTiming:args.includes('--parent-timing'),stCic:args.includes('--st-cic'),...(args.includes('--mandatory-email')?{mandatoryEmail:true}:{}),...(buildSelfCheckHeld===undefined?{}:{buildSelfCheckHeld})};
}
export async function createStCicCliOutput(jobPath) {
  const job = validateCiJob(read(jobPath).value);
  const parent = path.dirname(jobPath);
  assert.equal(fs.realpathSync(parent), parent, 'ASSURANCE_ST_CIC_OUTPUT_ALIAS');
  const receipt = path.join(parent, 'st-cic-cli-output.json');
  assert(!fs.existsSync(receipt), 'ASSURANCE_ST_CIC_OUTPUT_ALREADY_OWNED');
  const artifact = read(job.candidateManifest).value;
  assert(typeof artifact.candidateRoot === 'string' && path.isAbsolute(artifact.candidateRoot), 'ASSURANCE_ST_CIC_CANDIDATE_ROOT_REQUIRED');
  const candidateRoot = fs.realpathSync(artifact.candidateRoot);
  const readonly = [ROOT,fs.realpathSync(path.join(ROOT,'node_modules')),fs.realpathSync(jobPath),fs.realpathSync(job.candidateManifest),fs.realpathSync(job.browserCache),candidateRoot];
  assert.equal(path.normalize(job.output), job.output, 'ASSURANCE_ST_CIC_OUTPUT_ALIAS');
  assert.equal(fs.realpathSync(path.dirname(job.output)), path.dirname(job.output), 'ASSURANCE_ST_CIC_OUTPUT_ALIAS');
  const temporaryRoot = fs.realpathSync(os.tmpdir());
  for (const input of [...readonly,job.output])
    assert(temporaryRoot !== input && !temporaryRoot.startsWith(input + path.sep), 'ASSURANCE_ST_CIC_TEMP_INPUT_OVERLAP');
  const directory = fs.mkdtempSync(path.join(temporaryRoot, 'harness-st-cic-cli-'));
  const output = path.join(directory, 'profile');
  try {
    fs.chmodSync(directory, 0o700);
    for (const input of [...readonly,job.output])
      assert(output !== input && !output.startsWith(input + path.sep) && !input.startsWith(output + path.sep), 'ASSURANCE_ST_CIC_OUTPUT_OVERLAP');
    // Metadata-only preflight; normal native/admission paths still fully verify it.
    await assertFreshCandidateDerivationOutput({baseline:{candidateRoot},manifestPath:job.candidateManifest,output});
    // The owning private job retains this path for independent readback/retirement.
    // Never delete executed evidence on return: admission descriptors still refer to it.
    fs.writeFileSync(receipt, JSON.stringify({schemaVersion:1,kind:'st-cic-cli-owned-output',directory,output},null,2)+'\n', {flag:'wx',mode:0o600});
    return output;
  } catch (error) {
    // Only the empty directory just allocated here is eligible for immediate removal.
    try { fs.rmdirSync(directory); } catch { /* preserve unexpected contents */ }
    throw error;
  }
}

// Fixed mandatory-email CLI ownership only; no caller-chosen allocator settings.
export async function createMandatoryEmailCliOutput(jobPath){
  const job=validateCiJob(read(jobPath).value),parent=path.dirname(jobPath),receipt=path.join(parent,'mandatory-email-cli-output.json');
  assert.equal(fs.realpathSync(parent),parent,'ASSURANCE_MANDATORY_OUTPUT_ALIAS');
  assert(fs.lstatSync(receipt,{throwIfNoEntry:false})===undefined,'ASSURANCE_MANDATORY_OUTPUT_ALREADY_OWNED');
  const artifact=read(job.candidateManifest).value;assert(typeof artifact.candidateRoot==='string'&&path.isAbsolute(artifact.candidateRoot),'ASSURANCE_MANDATORY_CANDIDATE_ROOT_REQUIRED');
  const candidateRoot=fs.realpathSync(artifact.candidateRoot),temporaryRoot=fs.realpathSync(os.tmpdir());
  const readonly=[ROOT,fs.realpathSync(path.join(ROOT,'node_modules')),fs.realpathSync(jobPath),fs.realpathSync(job.candidateManifest),fs.realpathSync(job.browserCache),candidateRoot,job.output];
  assert.equal(path.normalize(job.output),job.output,'ASSURANCE_MANDATORY_OUTPUT_ALIAS');assert.equal(fs.realpathSync(path.dirname(job.output)),path.dirname(job.output),'ASSURANCE_MANDATORY_OUTPUT_ALIAS');
  const sibling=path.join(parent,'st-cic-cli-output.json');
  if(fs.lstatSync(sibling,{throwIfNoEntry:false})!==undefined){const owned=read(sibling).value;assert.deepEqual(Object.keys(owned).sort(),['schemaVersion','kind','directory','output'].sort(),'ASSURANCE_MANDATORY_SIBLING_INVALID');assert.equal(owned.schemaVersion,1,'ASSURANCE_MANDATORY_SIBLING_INVALID');assert.equal(owned.kind,'st-cic-cli-owned-output','ASSURANCE_MANDATORY_SIBLING_INVALID');assert(typeof owned.directory==='string'&&path.isAbsolute(owned.directory)&&fs.realpathSync(owned.directory)===owned.directory&&owned.output===path.join(owned.directory,'profile'),'ASSURANCE_MANDATORY_SIBLING_INVALID');readonly.push(owned.directory);}
  for(const input of readonly)assert(temporaryRoot!==input&&!temporaryRoot.startsWith(input+path.sep),'ASSURANCE_MANDATORY_TEMP_INPUT_OVERLAP');
  const directory=fs.mkdtempSync(path.join(temporaryRoot,'harness-mandatory-email-cli-')),output=path.join(directory,'mandatory-email');
  try{
    fs.chmodSync(directory,0o700);
    for(const input of readonly)assert(output!==input&&!output.startsWith(input+path.sep)&&!input.startsWith(output+path.sep),'ASSURANCE_MANDATORY_OUTPUT_OVERLAP');
    await assertFreshCandidateDerivationOutput({baseline:{candidateRoot},manifestPath:job.candidateManifest,output});
    fs.writeFileSync(receipt,JSON.stringify({schemaVersion:1,kind:'mandatory-email-cli-owned-output',directory,output},null,2)+'\n',{flag:'wx',mode:0o600});
    return output;
  }catch(error){try{fs.rmdirSync(directory);}catch{/* Preserve any unexpected contents. */}throw error;}
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  let parentSnapshot, parentDisconnected;
  try {
    Reporter.resetPublicReport('harness');
    const cli = parseAssuranceCli(process.argv.slice(2));
    const stCicOutput = cli.stCic ? await createStCicCliOutput(cli.jobPath) : undefined;
    const mandatoryEmailOutput=cli.mandatoryEmail?await createMandatoryEmailCliOutput(cli.jobPath):undefined;
    if(cli.parentTiming) {
      parentDisconnected = () => process.kill(process.pid,'SIGTERM');
      process.once('disconnect',parentDisconnected);
      parentSnapshot = await connectPreparationTiming();
    }
    const result = await runHarnessAssurance(cli.jobPath, {
      aat: cli.aat,
      ...(stCicOutput === undefined ? {} : {stCicOutput}),
      ...(mandatoryEmailOutput===undefined?{}:{mandatoryEmailOutput}),
      ...(cli.buildSelfCheckHeld === undefined ? {} : {buildSelfCheckHeld:cli.buildSelfCheckHeld}),
      ...(parentSnapshot ? {snapshotAssuranceTiming:parentSnapshot} : {}),
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
  } finally {
    parentSnapshot?.dispose();
    if(parentDisconnected)process.removeListener('disconnect',parentDisconnected);
    if (process.connected) process.disconnect();
  }
}
