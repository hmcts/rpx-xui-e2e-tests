import assert from 'node:assert/strict';
import {sourceShapeBaselineExtraNames,readSourceShapeArtifacts} from './exui-event-v3-source-shape-artifacts.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { digestBytes, loadRunEvidence } from './exui-evidence-io.mjs';
import { replaySharedRoleEventObservation } from './exui-shared-role-event-observations.mjs';
import { sharedRoleArtifactNames, readSharedRoleArtifact } from './exui-shared-role-artifacts.mjs';
import { seedAppCcdSessions } from './exui-native-contract.mjs';
import { getReleasePolicy } from './exui-release-policy.mjs';
import { validateCompleteNativeProofs, validateNativeOutcome, readEventBaselineCheckpoint } from './exui-native-proof-validation.mjs';
import { readEventSerialV3Chain, EVENT_SERIAL_V3_FAULTS } from './exui-ccd-event-transition-v3.mjs';
import { selectEventCapabilityRuntime } from './exui-ccd-event-transition.mjs';
import { readEventCapabilityImportMetadata } from './exui-event-capability-import-validation.mjs';
import { EVENT_CAPABILITY_SCOPE, eventCapabilityFaultVariant, eventCapabilityFaultContract } from './exui-ccd-event-capability.mjs';

const requireFact = (value, code) => { if (!value) throw Error('EVENT_V3_SEMANTIC_' + code); };
const same = (actual, expected, code) => requireFact(isDeepStrictEqual(actual, expected), code);
const fields = (value, keys, code) => same(Object.keys(value ?? {}).sort(), keys.slice().sort(), code);

// Full lifecycle chain; structured proof/import/derivation replay selects one fixed fault.
// Actual domain observation journals remain a separate required qualification gate.
export function readEventSerialV3FaultSemantics(directory, heldChain, selection) {
  fields(selection, ['runPin','invocationId'], 'SELECTION');
  const invocationId = selection.invocationId;
  requireFact(EVENT_SERIAL_V3_FAULTS.includes(invocationId), 'SELECTION');
  const chain = readEventSerialV3Chain(directory, heldChain);
  requireFact(chain.semanticReplay === false && chain.promotionAllowed === false, 'CHAIN_AUTHORITY');
  const read = relative => {
    requireFact(relative.split('/').every(part => /^[a-z0-9][a-z0-9.-]*$/i.test(part) && part !== '..'), 'RAW_PATH');
    const file = path.join(directory, relative);
    requireFact(fs.lstatSync(file).isFile() && fs.realpathSync(file) === file, 'RAW_ALIAS');
    const bytes = fs.readFileSync(file);
    let value; try { value = JSON.parse(bytes); } catch { throw Error('EVENT_V3_SEMANTIC_JSON'); }
    return { value, digest: digestBytes(bytes) };
  };
  const referenced = (pin, relative) => {
    fields(pin, ['path','digest'], 'RAW_PIN'); same(pin.path, relative, 'RAW_PATH');
    const actual = read(relative); same(actual.digest, pin.digest, 'RAW_DIGEST'); return actual.value;
  };
  const run = referenced(selection.runPin, 'run.json'), pins = heldChain.baselineExpected;
  const policy = getReleasePolicy(EVENT_CAPABILITY_SCOPE), loaded = loadRunEvidence(path.join(directory,'run.json'), policy);
  validateCompleteNativeProofs(loaded.input, policy); validateNativeOutcome(loaded.input, loaded.receipt.verdict);
  const checkpoint = readEventBaselineCheckpoint(directory, pins);
  same(loaded.input.manifest, checkpoint.input.manifest, 'BASELINE_MANIFEST');
  const definition = policy.mutationDefinitions.find(row => row.mutationId === invocationId);
  const witness = loaded.input.mutations.find(row => row.mutationId === invocationId);
  requireFact(witness.baselineResult.outcome === 'passed' && witness.baselineResult.proofId === definition.baselineProofId, 'HEALTHY_BASELINE');
  requireFact(witness.mutantResult.outcome === 'failed' && witness.mutantResult.proofId === definition.mutantProofId && witness.mutantResult.failureId === definition.expectedFailureId, 'EXPECTED_FAILURE');
  requireFact(loaded.receipt.verdict.status === 'PASS', 'COMPLETE_PROOF_OUTCOME');
  const input = referenced(heldChain.input,'input.json'), entry = heldChain.faults.find(row => row.invocationId === invocationId);
  const capture = referenced(entry.capture,'v3/' + invocationId + '/capture.json');
  const runtimeRecord = referenced(capture.runtimeRecord,invocationId + '/runtime-input.json');
  const selected = selectEventCapabilityRuntime(input, invocationId, runtimeRecord);
  const variant = eventCapabilityFaultVariant(invocationId);
  for (const [current, name] of [[input,'baseline'],[selected,variant]]) {
    requireFact(typeof current.ccd.output === 'string' && path.isAbsolute(current.ccd.output) && path.normalize(current.ccd.output) === current.ccd.output && path.basename(current.ccd.output) === `event-${name}-runtime`, 'IMPORT_ORIGINAL_PATH');
  }
  same(path.dirname(input.ccd.output),path.dirname(selected.ccd.output),'IMPORT_ORIGINAL_PARENT');
  const baselineMetadata = readEventCapabilityImportMetadata(directory,input,'baseline');
  const mutantMetadata = readEventCapabilityImportMetadata(directory,selected,variant);
  const contract = JSON.parse(fs.readFileSync(new URL('../fixtures/ccd/event-capability/binding.json',import.meta.url),'utf8'));
  const identity = {...pins.identity,definitionDigests:{HarnessNestedPRL:contract[variant].workbookDigest}};
  same(witness.baselineIdentity,pins.identity,'BASELINE_IDENTITY'); same(witness.mutantIdentity,identity,'FAULT_IDENTITY');
  const execution = loaded.input.executions.find(row => row.invocationId === invocationId);
  same(execution.identity,identity,'EXECUTION_IDENTITY'); same(execution.kind,'mutation','EXECUTION_KIND');
  const manifest = read(invocationId + '/manifest.json').value;
  for (const key of ['schemaVersion','runId','harnessCommit','releaseScopeId','policyDigest','requiredObligationIds']) same(manifest[key],checkpoint.input.manifest[key],'MANIFEST');
  same(manifest.identity,identity,'MANIFEST_IDENTITY');
  for (const [current, metadata, state] of [[checkpoint.input.manifest,baselineMetadata,input],[manifest,mutantMetadata,selected]]) {
    for (const key of ['harnessSourceDigest','harnessDependencyDigest','browserDigest']) same(current.runtimeMetadata[key],pins[key],'RUNTIME_METADATA');
    for (const [key,value] of Object.entries({...metadata,harnessSourceState:'clean',isolation:'native-separate-api-owned-network-none',gatewayDigest:input.gatewayDigest,idamSimulatorImage:state.ccd.images.idam.id})) same(current.runtimeMetadata[key],value,'RUNTIME_METADATA');
  }
  const mutation = run.mutations.find(row => row.mutationId === invocationId);
  same(mutation.baselineInvocationId,'baseline','MUTATION_BASELINE'); same(mutation.mutantInvocationId,invocationId,'MUTATION_INVOCATION');
  const derivation = referenced(mutation.derivationArtifact,invocationId + '/derivation.json');
  same(derivation.mutationDefinitionDigest,definition.definitionDigest,'DERIVATION_POLICY');
  same(derivation.baselineIdentity,pins.identity,'DERIVATION_IDENTITY'); same(derivation.mutantIdentity,identity,'DERIVATION_IDENTITY');
  same(derivation.transformation,invocationId,'DERIVATION_MUTATION');
  const fault = eventCapabilityFaultContract(invocationId);
  same(derivation.target,fault.target,'DERIVATION_TARGET'); same(derivation.transformationRecord,contract[fault.transformationKey],'DERIVATION_CELL');
  same(derivation.beforeDigest,contract.baseline.workbookDigest,'DERIVATION_WORKBOOK'); same(derivation.afterDigest,contract[variant].workbookDigest,'DERIVATION_WORKBOOK');
  same(derivation.baselineRuntimeMetadata,baselineMetadata,'DERIVATION_RUNTIME'); same(derivation.mutantRuntimeMetadata,mutantMetadata,'DERIVATION_RUNTIME');
  same(derivation.runtimeRecord,capture.runtimeRecord,'DERIVATION_RECORD');
  return {schemaVersion:1,status:'experimental-one-fault-replayed',replayScope:'structured-proof-import-derivation',lifecycleFaults:chain.faults,semanticFaults:1,semanticInvocationId:invocationId,baselineProofId:definition.baselineProofId,expectedFailureId:definition.expectedFailureId,experimental:true,semanticReplay:false,nativeAuthority:false,sourceComplete:false,nativeRuntimeAcceptance:false,runtimeAcceptance:false,catalogueCredit:false,releaseCredit:false,releaseApproval:false,promotionAllowed:false};
}

const judgeEventFiles = ['manifest.json','context.json','personas.json','ccd-requests.jsonl','event-capability-observation.json','judge-event-ui-observation.json'];

// Opt-in role-domain replay requires actual source-produced files sealed twice:
// held v3 completion/readbacks and independently pinned run execution references.
// It does not manufacture missing observations or grant whole-chain authority.
export function readEventSerialV3RoleSemantics(directory, heldChain, selection) {
  try {
    const roleNames = {
      'ccd-remove-courtadmin-recipient-read': 'courtadmin-read',
      'ccd-remove-readonly-recipient-read': 'readonly-read',
      'ccd-remove-courtadmin-event-create': 'courtadmin-cell',
      'ccd-enable-readonly-recipient-update': 'readonly-update',
    };
    requireFact(path.isAbsolute(directory) && path.normalize(directory) === directory && fs.realpathSync(directory) === directory, 'ROLE_ROOT');
    fields(selection, ['runPin','invocationId'], 'SELECTION');
    const invocationId = selection.invocationId;
    requireFact(Object.hasOwn(roleNames, invocationId), 'ROLE_SELECTION');
    const pinned = (reference, relative) => {
      fields(reference, ['path','digest'], 'RAW_PIN'); same(reference.path, relative, 'RAW_PATH');
      requireFact(typeof relative === 'string' && relative.split('/').every(part => /^[a-z0-9][a-z0-9.-]*$/i.test(part) && part !== '..'), 'RAW_PATH');
      const file = path.join(directory, relative);
      requireFact(fs.lstatSync(file).isFile() && fs.realpathSync(file) === file && fs.statSync(file).size <= 16 * 1024 * 1024, 'RAW_ALIAS');
      const bytes = fs.readFileSync(file); same(digestBytes(bytes), reference.digest, 'RAW_DIGEST'); return bytes;
    };
    const json = bytes => JSON.parse(bytes.toString());
    const captured = {};
    for (const id of ['baseline', invocationId]) {
      const entry = id === 'baseline' ? heldChain.baseline : heldChain.faults.find(row => row.invocationId === id);
      const completion = json(pinned(entry.completion, 'v3/' + id + '/completion.json'));
      const readbacks = json(pinned(completion.readbacks, id + '/v3-readbacks.json'));
      fields(readbacks, ['schemaVersion','invocationId','files'], 'ROLE_READBACKS');
      same(readbacks.schemaVersion, 3, 'ROLE_READBACKS'); same(readbacks.invocationId, id, 'ROLE_READBACKS');
      const names = sharedRoleArtifactNames(id, EVENT_CAPABILITY_SCOPE);
      const shapeUnion = id === 'baseline' && readbacks.files.length === 22;
      const union = id === 'baseline' && (readbacks.files.length === 10 || shapeUnion);
      const required = union ? [...names, ...judgeEventFiles.slice(4), ...(shapeUnion ? sourceShapeBaselineExtraNames() : [])] : names;
      same(readbacks.files.map(ref => ref.path).sort(), required.map(name => id + '/' + name).sort(), 'ROLE_MEMBERSHIP');
      // Judge extras are one finite all-or-none group, sealed but not replayed here.
      captured[id] = { union, shapeUnion, references: readbacks.files, bytes: Object.fromEntries(required.map(name => [name, pinned(readbacks.files.find(ref => ref.path === id + '/' + name), id + '/' + name)])) };
    }
    const structured = readEventSerialV3FaultSemantics(directory, heldChain, selection);
    const policy = getReleasePolicy(EVENT_CAPABILITY_SCOPE), loaded = loadRunEvidence(path.join(directory, 'run.json'), policy);
    const input = json(pinned(heldChain.input, 'input.json'));
    const entry = heldChain.faults.find(row => row.invocationId === invocationId);
    const capture = json(pinned(entry.capture, 'v3/' + invocationId + '/capture.json'));
    const selected = selectEventCapabilityRuntime(input, invocationId, json(pinned(capture.runtimeRecord, invocationId + '/runtime-input.json')));
    const caseIds = new Set(); let baselineObservations = 0, faultObservations = 0, checkedScenarios = 0;
    for (const [id, runtime] of [['baseline', input], [invocationId, selected]]) {
      const execution = loaded.input.executions.find(row => row.invocationId === id), raw = captured[id];
      const rolePaths = sharedRoleArtifactNames(id, EVENT_CAPABILITY_SCOPE).map(name => id + '/' + name);
      same(execution.sharedRoleArtifacts.slice().sort((a,b) => a.path.localeCompare(b.path)), raw.references.filter(ref => rolePaths.includes(ref.path)).sort((a,b) => a.path.localeCompare(b.path)), 'ROLE_RUN_PINS');
      if (raw.union) {
        const judgePaths = judgeEventFiles.map(name => id + '/' + name);
        same(execution.judgeEventArtifacts?.slice().sort((a,b) => a.path.localeCompare(b.path)), raw.references.filter(ref => judgePaths.includes(ref.path)).sort((a,b) => a.path.localeCompare(b.path)), 'ROLE_JUDGE_RUN_PINS');
      } else requireFact(execution.judgeEventArtifacts === undefined, 'ROLE_JUDGE_UNSEALED');
      if (raw.shapeUnion) readSourceShapeArtifacts(directory,id,raw.references,execution);
      else requireFact(execution.sourceShapeArtifacts === undefined,'ROLE_SHAPE_UNSEALED');
      const read = name => {
        const bytes = readSharedRoleArtifact(directory, execution, name, EVENT_CAPABILITY_SCOPE);
        same(bytes, raw.bytes[name], 'ROLE_BYTES'); return json(bytes);
      };
      const manifest = read('manifest.json'), context = read('context.json'), personas = read('personas.json');
      same(manifest.identity, execution.identity, 'ROLE_IDENTITY');
      const expectedContext = { ...Object.fromEntries(['runId','harnessCommit','releaseScopeId','policyDigest','identity'].map(key => [key, manifest[key]])), invocationId:id, harnessSourceState:'clean', harnessSourceDigest:input.harnessSourceDigest };
      same(context, expectedContext, 'ROLE_CONTEXT');
      fields(personas, ['credentials','sessions'], 'ROLE_PERSONAS');
      same(personas.credentials, runtime.credentials, 'ROLE_CREDENTIALS');
      const sessionNames = Object.keys(seedAppCcdSessions(runtime.credentials, name => name, EVENT_CAPABILITY_SCOPE));
      same(Object.keys(personas.sessions).sort(), sessionNames.sort(), 'ROLE_SESSIONS');
      requireFact(Object.values(personas.sessions).every(value => typeof value === 'string' && value.length > 0) && new Set(Object.values(personas.sessions)).size === sessionNames.length, 'ROLE_SESSIONS');
      const requestBytes = readSharedRoleArtifact(directory, execution, 'ccd-requests.jsonl', EVENT_CAPABILITY_SCOPE);
      same(requestBytes, raw.bytes['ccd-requests.jsonl'], 'ROLE_BYTES');
      const requests = requestBytes.toString().trim().split('\n').map(line => JSON.parse(line));
      const names = id === 'baseline' ? Object.values(roleNames) : [roleNames[id]];
      for (const name of names) {
        let previousWindowEnd = -1;
        const observation = read(name + '-observation.json');
        // Reuse the existing independent literal role/data/history oracle unchanged.
        const result = replaySharedRoleEventObservation(observation, { name, manifest, context, personas, requests });
        for (const item of observation.observations) {
          requireFact(!caseIds.has(item.caseId), 'ROLE_CASE_REUSE'); caseIds.add(item.caseId);
          const matching = requests.flatMap((row,index) => row.upstreamPath === '/internal/cases/' + item.caseId || row.upstreamPath === '/internal/cases/' + item.caseId + '/event-triggers/serviceOfDocuments' || row.upstreamPath === '/cases/' + item.caseId + '/events' ? [{...row,index}] : []);
          requireFact(matching.length > 0 && matching[0].index > previousWindowEnd, 'ROLE_REQUEST_ORDER');
          const view = matching.find(row => row.method === 'GET' && row.upstreamPath === '/internal/cases/' + item.caseId);
          requireFact(view && view.index === matching[0].index, 'ROLE_REQUEST_ORDER');
          if (!name.endsWith('-read')) {
            const start = matching.find(row => row.method === 'GET' && row.upstreamPath.endsWith('/event-triggers/serviceOfDocuments'));
            const submit = matching.find(row => row.method === 'POST');
            requireFact(start && submit && view.index < start.index && start.index < submit.index, 'ROLE_REQUEST_ORDER');
          }
          previousWindowEnd = matching.at(-1).index;
        }
        checkedScenarios += result.checkedShapes;
        if (id === 'baseline') baselineObservations++; else faultObservations++;
      }
    }
    return {...structured,replayScope:'structured-proof-import-derivation-and-role-observations',roleDomain:{name:roleNames[invocationId],baselineObservations,faultObservations,checkedScenarios},incompleteDomainFaults:EVENT_SERIAL_V3_FAULTS.filter(id => !Object.hasOwn(roleNames,id))};
  } catch {
    // Do not expose assertion diffs, credentials, private paths or raw body data.
    throw new Error('EVENT_V3_ROLE_REPLAY_INVALID');
  }
}

// Independent finite judge oracle from event-capability.spec.ts; no response-derived expectations.
function replayJudgeEventObservation(value, ui, runtime, fault, requests) {
  fields(value, ['actor','sessionUser','caseId','eventId','caseViewStatus','caseTriggers','menuOptions','eventTriggers','eventOptions','startStatus','legacyTokenStatus','eventTokenPresent','submitStatus','intendedData','submittedData','before','after'], 'JUDGE_OBSERVATION');
  const actorId = runtime.credentials.judge.userId;
  const roles = ['caseworker','caseworker-harness','caseworker-privatelaw-judge'];
  same(value.actor, {userId:actorId,roles:runtime.credentials.judge.roles}, 'JUDGE_ACTOR');
  fields(value.sessionUser, ['id','roles'], 'JUDGE_SESSION'); same(value.sessionUser.id, actorId, 'JUDGE_SESSION');
  same(value.sessionUser.roles.slice().sort(), roles, 'JUDGE_ROLES'); same(value.actor.roles.slice().sort(), roles, 'JUDGE_ROLES');
  requireFact(typeof value.caseId === 'string' && /^\d{16}$/.test(value.caseId), 'JUDGE_CASE');
  same(value.eventId, 'serviceOfDocuments', 'JUDGE_EVENT'); same(value.caseViewStatus, 200, 'JUDGE_VIEW');
  requireFact(Array.isArray(value.caseTriggers) && Array.isArray(value.menuOptions) && value.menuOptions.every(row => typeof row === 'string'), 'JUDGE_PROJECTION');
  const triggers = value.caseTriggers.filter(row => row.id === 'serviceOfDocuments');
  same(value.eventTriggers, triggers, 'JUDGE_TRIGGERS');
  same(triggers.map(row => ({id:row.id,name:row.name})), fault ? [{id:'serviceOfDocuments',name:'Service of documents'}] : [], 'JUDGE_PERMISSION');
  same(value.eventOptions, value.menuOptions.map(option => option.trim()).filter(option => option === 'Service of documents'), 'JUDGE_MENU');
  same(value.eventOptions, fault ? ['Service of documents'] : [], 'JUDGE_PERMISSION');
  same(value.startStatus, fault ? 200 : 404, 'JUDGE_START'); same(value.submitStatus, fault ? 201 : 404, 'JUDGE_SUBMIT');
  same(value.legacyTokenStatus, 200, 'JUDGE_TOKEN'); same(value.eventTokenPresent, true, 'JUDGE_TOKEN');
  const original = {protectedValue:'synthetic-judge-readable',sodAdditionalRecipients:['additionalRecipients'],sodAdditionalRecipientsList:[{id:'723a508f-9e84-41a1-b39e-fde9d7e06ed2',value:{serveByPostOrEmail:'email',emailInformation:{emailName:'Synthetic event recipient',emailAddress:'event@harness.example.com'}}}]};
  const intended = structuredClone(original); intended.sodAdditionalRecipientsList[0].value.emailInformation.emailAddress = 'judge-change@harness.example.com';
  for (const view of [value.before,value.after]) {
    fields(view, ['state','history'], 'JUDGE_STATE');
    same(String(view.state.id), value.caseId, 'JUDGE_CASE'); same(view.state.case_type_id, 'HarnessNestedPRL', 'JUDGE_CASE_TYPE'); same(view.state.jurisdiction, 'HARNESS', 'JUDGE_JURISDICTION'); same(view.state.state, 'JUDICIAL_REVIEW', 'JUDGE_STATE');
    requireFact(Number.isSafeInteger(view.state.version) && view.state.version >= 0 && Array.isArray(view.history), 'JUDGE_VERSION');
  }
  same(value.before.state.case_data, original, 'JUDGE_INITIAL_DATA');
  same(value.before.history.map(row => row.id), ['create'], 'JUDGE_INITIAL_HISTORY');
  same(value.before.history[0].user_id, runtime.credentials.allowed.userId, 'JUDGE_CREATE_ACTOR');
  same(value.intendedData, intended, 'JUDGE_INTENDED_DATA');
  same(value.submittedData, {sodAdditionalRecipients:intended.sodAdditionalRecipients,sodAdditionalRecipientsList:intended.sodAdditionalRecipientsList}, 'JUDGE_SUBMITTED_DATA');
  if (fault) {
    same(value.after.state.case_data, intended, 'JUDGE_PERSISTED_DATA'); same(value.after.state.version, value.before.state.version + 1, 'JUDGE_WRITE_VERSION');
    same(value.after.history.length, value.before.history.length + 1, 'JUDGE_WRITE_HISTORY');
    const added = value.after.history.filter(row => row.id === 'serviceOfDocuments'); requireFact(added.length === 1, 'JUDGE_WRITE_EVENT');
    same(added[0].user_id, actorId, 'JUDGE_WRITE_ACTOR'); same(added[0].case_type_id, 'HarnessNestedPRL', 'JUDGE_WRITE_CASE_TYPE');
    same(value.after.history.filter(row => row.id !== 'serviceOfDocuments'), value.before.history, 'JUDGE_PRIOR_HISTORY');
  } else same(value.after, value.before, 'JUDGE_DENIED_WRITE');
  same(ui, {schemaVersion:1,kind:'judge-event-ui-observation',caseId:value.caseId,actorId,userDetailsStatus:200,visibleMarkers:[{text:'event@harness.example.com',visible:true}]}, 'JUDGE_UI');
  const prefix = '/caseworkers/' + runtime.credentials.allowed.userId + '/jurisdictions/HARNESS/case-types/HarnessNestedPRL';
  const required = [
    ['GET','/internal/cases/' + value.caseId,200],
    ['GET','/internal/cases/' + value.caseId + '/event-triggers/serviceOfDocuments',value.startStatus],
    ['GET','/caseworkers/' + actorId + '/jurisdictions/HARNESS/case-types/HarnessNestedPRL/cases/' + value.caseId + '/event-triggers/serviceOfDocuments/token',200],
    ['POST','/cases/' + value.caseId + '/events',value.submitStatus],
  ];
  const indexes = required.map(([method,upstreamPath,status]) => {
    const matching = requests.flatMap((row,index) => row.method === method && row.upstreamPath === upstreamPath ? [{...row,index}] : []);
    requireFact(matching.length > 0 && matching.every(row => row.actorId === actorId && row.status === status && row.mutation === null), 'JUDGE_AUTHENTICATED_REQUEST');
    return matching[0].index;
  });
  requireFact(indexes.every((index,n) => n === 0 || index > indexes[n-1]), 'JUDGE_REQUEST_ORDER');
  const creates = requests.flatMap((row,index) => row.method === 'POST' && row.upstreamPath === prefix + '/cases' && index < indexes[0] ? [{...row,index}] : []);
  requireFact(creates.length > 0 && creates.every(row => row.actorId === runtime.credentials.allowed.userId && row.status === 201 && row.mutation === null), 'JUDGE_BOOTSTRAP');
  const create = creates.at(-1);
  requireFact(requests.some((row,index) => index < create.index && row.method === 'GET' && row.upstreamPath === prefix + '/event-triggers/create/token' && row.actorId === runtime.credentials.allowed.userId && row.status === 200 && row.mutation === null), 'JUDGE_BOOTSTRAP');
}

// Required future raw capture contract; old producer lacks UI bytes and judgeEventArtifacts.
export function readEventSerialV3JudgeSemantics(directory, heldChain, selection) {
  try {
    fields(selection, ['runPin','invocationId'], 'SELECTION'); same(selection.invocationId, 'ccd-enable-judge-event', 'JUDGE_SELECTION');
    requireFact(path.isAbsolute(directory) && path.normalize(directory) === directory && fs.realpathSync(directory) === directory, 'JUDGE_ROOT');
    const pinned = (ref, relative) => {
      fields(ref, ['path','digest'], 'RAW_PIN'); same(ref.path, relative, 'RAW_PATH');
      requireFact(relative.split('/').every(part => /^[a-z0-9][a-z0-9.-]*$/i.test(part) && part !== '..'), 'RAW_PATH');
      const file = path.join(directory, relative); requireFact(fs.lstatSync(file).isFile() && fs.realpathSync(file) === file && fs.statSync(file).size <= 16 * 1024 * 1024, 'RAW_ALIAS');
      const bytes = fs.readFileSync(file); same(digestBytes(bytes), ref.digest, 'RAW_DIGEST'); return bytes;
    };
    const parse = bytes => JSON.parse(bytes.toString()), raw = {};
    for (const id of ['baseline',selection.invocationId]) {
      const entry = id === 'baseline' ? heldChain.baseline : heldChain.faults.find(row => row.invocationId === id);
      const completion = parse(pinned(entry.completion, 'v3/' + id + '/completion.json')), readbacks = parse(pinned(completion.readbacks, id + '/v3-readbacks.json'));
      fields(readbacks, ['schemaVersion','invocationId','files'], 'JUDGE_MEMBERSHIP'); same(readbacks.schemaVersion, 3, 'JUDGE_MEMBERSHIP'); same(readbacks.invocationId, id, 'JUDGE_MEMBERSHIP');
      const shapeUnion = id === 'baseline' && readbacks.files.length === 22;
      const names = id === 'baseline' ? [...sharedRoleArtifactNames(id, EVENT_CAPABILITY_SCOPE),...judgeEventFiles.slice(4),...(shapeUnion ? sourceShapeBaselineExtraNames() : [])] : judgeEventFiles;
      same(readbacks.files.map(row => row.path).sort(), names.map(name => id + '/' + name).sort(), 'JUDGE_MEMBERSHIP');
      raw[id] = {shapeUnion,refs:readbacks.files,bytes:Object.fromEntries(names.map(name => [name,pinned(readbacks.files.find(ref => ref.path === id + '/' + name),id + '/' + name)]))};
    }
    const structured = readEventSerialV3FaultSemantics(directory, heldChain, selection), loaded = loadRunEvidence(path.join(directory,'run.json'), getReleasePolicy(EVENT_CAPABILITY_SCOPE));
    const input = parse(pinned(heldChain.input,'input.json')), entry = heldChain.faults.find(row => row.invocationId === selection.invocationId), capture = parse(pinned(entry.capture,'v3/' + selection.invocationId + '/capture.json'));
    const selected = selectEventCapabilityRuntime(input, selection.invocationId, parse(pinned(capture.runtimeRecord,selection.invocationId + '/runtime-input.json')));
    const cases = new Set();
    for (const [id,runtime] of [['baseline',input],[selection.invocationId,selected]]) {
      const execution = loaded.input.executions.find(row => row.invocationId === id), captured = raw[id];
      const refs = judgeEventFiles.map(name => captured.refs.find(row => row.path === id + '/' + name));
      same(execution.judgeEventArtifacts?.slice().sort((a,b) => a.path.localeCompare(b.path)), refs.slice().sort((a,b) => a.path.localeCompare(b.path)), 'JUDGE_RUN_PINS');
      if (id === 'baseline') {
        const paths = sharedRoleArtifactNames(id, EVENT_CAPABILITY_SCOPE).map(name => id + '/' + name);
        same(execution.sharedRoleArtifacts?.slice().sort((a,b) => a.path.localeCompare(b.path)), captured.refs.filter(row => paths.includes(row.path)).sort((a,b) => a.path.localeCompare(b.path)), 'JUDGE_ROLE_RUN_PINS');
      }
      if(captured.shapeUnion)readSourceShapeArtifacts(directory,id,captured.refs,execution);
      else requireFact(execution.sourceShapeArtifacts === undefined,'JUDGE_SHAPE_UNSEALED');
      const read = name => parse(captured.bytes[name]);
      const manifest = read('manifest.json'), context = read('context.json'), personas = read('personas.json');
      same(manifest.identity, execution.identity, 'JUDGE_IDENTITY');
      same(context, {...Object.fromEntries(['runId','harnessCommit','releaseScopeId','policyDigest','identity'].map(key => [key,manifest[key]])),invocationId:id,harnessSourceState:'clean',harnessSourceDigest:input.harnessSourceDigest}, 'JUDGE_CONTEXT');
      fields(personas, ['credentials','sessions'], 'JUDGE_PERSONAS'); same(personas.credentials,runtime.credentials,'JUDGE_CREDENTIALS');
      const names = Object.keys(seedAppCcdSessions(runtime.credentials,name => name,EVENT_CAPABILITY_SCOPE)); same(Object.keys(personas.sessions).sort(),names.sort(),'JUDGE_SESSIONS');
      requireFact(Object.values(personas.sessions).every(value => typeof value === 'string' && value.length > 0) && new Set(Object.values(personas.sessions)).size === names.length,'JUDGE_SESSIONS');
      const value = read('event-capability-observation.json'), ui = read('judge-event-ui-observation.json'), requests = captured.bytes['ccd-requests.jsonl'].toString().trim().split('\n').map(line => JSON.parse(line));
      replayJudgeEventObservation(value,ui,runtime,id !== 'baseline',requests);
      requireFact(!cases.has(value.caseId),'JUDGE_CASE_REUSE'); cases.add(value.caseId);
    }
    return {...structured,replayScope:'structured-proof-import-derivation-and-judge-observations',judgeDomain:{baselineObservations:1,faultObservations:1,checkedCases:2,uiObservations:2},incompleteDomainFaults:EVENT_SERIAL_V3_FAULTS.filter(id => id.startsWith('ccd-shape-'))};
  } catch { throw new Error('EVENT_V3_JUDGE_REPLAY_INVALID'); }
}
