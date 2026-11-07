import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {digestBytes} from './exui-evidence-io.mjs';
import {deriveRecipientCallbackImport} from './exui-recipient-callback-fixture.mjs';
import {validateMandatoryEmailEventDerivation,validateMandatoryEmailEventDates} from './exui-mandatory-email-event-validation.mjs';
import {validateMandatoryEmailDescriptors} from './exui-mandatory-email-event-facets.mjs';
import {validateMandatoryEmailObservation,validateMandatoryEmailFramework} from './exui-mandatory-email-event-observation.mjs';
const preparedFiles=['input.json','fixture/definition.json','fixture/definition.xlsx','fixture/binding.json','runtime/recipient-callback-import/receipt.json','runtime/recipient-callback-import/mandatory-email-stored-dates.json'];
const selectedRows=variant=>{assert(['baseline','name-optional','address-optional'].includes(variant),'MANDATORY_EMAIL_VARIANT');return variant==='baseline'?['name','address']:[variant.split('-')[0]];};
function bytes(root,name){const file=path.join(root,name);assert(fs.lstatSync(file).isFile()&&fs.realpathSync(file)===file,'MANDATORY_EMAIL_RAW_ALIAS');const value=fs.readFileSync(file);assert(value.length<=16*1024*1024,'MANDATORY_EMAIL_RAW_SIZE');return value;}
export function captureMandatoryEmailPrepared(directory){return Object.fromEntries(preparedFiles.map(name=>[name,digestBytes(bytes(directory,name))]));}
export function mandatoryEmailRawFiles(variant){return [...preparedFiles,'baseline/report.json','baseline/framework-terminal.json','baseline/ccd-requests.jsonl',...selectedRows(variant).map(row=>`baseline/mandatory-email-${row}-observation.json`)];}
export function readMandatoryEmailEvidence(directory,expected){
  const {variant,derivation,actorId,owner,namespace,images,definitionVersion,terminal,held,files}=expected;
  validateMandatoryEmailEventDerivation(derivation,variant);
  assert.deepEqual(Object.keys(held).sort(),preparedFiles.slice().sort(),'MANDATORY_EMAIL_HELD_FILES');
  assert.deepEqual(captureMandatoryEmailPrepared(directory),held,'MANDATORY_EMAIL_PREPARED_DRIFT');
  const names=mandatoryEmailRawFiles(variant);assert.deepEqual(Object.keys(files).sort(),names.slice().sort(),'MANDATORY_EMAIL_RAW_FILES');
  const raw=Object.fromEntries(names.map(name=>{const value=bytes(directory,name);assert.equal(digestBytes(value),files[name],'MANDATORY_EMAIL_RAW_DIGEST');return[name,value];}));
  const json=name=>JSON.parse(raw[name].toString());
  const input=json('input.json'),imported=json('runtime/recipient-callback-import/receipt.json'),date=json('runtime/recipient-callback-import/mandatory-email-stored-dates.json');
  assert.equal(input.kind,'mandatory-email-event-ui-feasibility','MANDATORY_EMAIL_INPUT_KIND');assert.equal(input.scenario,'mandatory-email-event','MANDATORY_EMAIL_INPUT_SCENARIO');assert.equal(input.variant,variant,'MANDATORY_EMAIL_INPUT_VARIANT');
  assert.deepEqual(input.mandatoryEmailEventBinding,derivation.binding,'MANDATORY_EMAIL_INPUT_BINDING');
  assert.equal(input.credentials.courtadmin.userId,actorId,'MANDATORY_EMAIL_ACTOR');
  assert.deepEqual(input.credentials.courtadmin.roles.slice().sort(),['caseworker','caseworker-harness','caseworker-privatelaw-courtadmin'],'MANDATORY_EMAIL_ACTOR_ROLES');
  assert.deepEqual([input.ccd.owner,input.ccd.namespace,input.ccd.images],[owner,namespace,images],'MANDATORY_EMAIL_INPUT_OWNER');
  assert.equal(imported.status,'import-and-callback-descriptor-observed','MANDATORY_EMAIL_IMPORT');
  assert.equal(imported.observations.import.status,201,'MANDATORY_EMAIL_IMPORT_HTTP');
  assert.deepEqual([imported.owner,imported.namespace,imported.images],[owner,namespace,images],'MANDATORY_EMAIL_IMPORT_OWNER');
  assert.deepEqual([imported.runtimeAcceptance,imported.catalogueCredit,imported.releaseCredit],[false,false,false],'MANDATORY_EMAIL_IMPORT_CREDIT');
  assert.deepEqual(imported.seal,json('fixture/binding.json'),'MANDATORY_EMAIL_SEAL');
  assert.deepEqual(imported.seal.mandatoryEmailEventBinding,derivation.binding,'MANDATORY_EMAIL_SEAL_SOURCE');
  assert.deepEqual(imported.seal.binding,deriveRecipientCallbackImport('binding-omitted',true).binding,'MANDATORY_EMAIL_CALLBACK_SCAFFOLD');
  assert.equal(imported.seal.variant,'binding-omitted','MANDATORY_EMAIL_CALLBACK_SCAFFOLD');
  assert.deepEqual(json('fixture/definition.json'),derivation.fixture,'MANDATORY_EMAIL_CANONICAL_FIXTURE');
  assert.equal(imported.seal.definitionDigest,digestBytes(raw['fixture/definition.json']),'MANDATORY_EMAIL_IMPORT_FIXTURE_DIGEST');
  assert.equal(imported.seal.workbookDigest,digestBytes(raw['fixture/definition.xlsx']),'MANDATORY_EMAIL_IMPORT_WORKBOOK_DIGEST');
  for(const name of ['definition','pages'])assert.equal(imported.observations[name].status,200,'MANDATORY_EMAIL_DESCRIPTOR_HTTP');
  const facets=validateMandatoryEmailDescriptors(imported.observations.definition.body,imported.observations.pages.body,derivation);
  assert.equal(facets.definitionVersion,definitionVersion,'MANDATORY_EMAIL_EXPECTED_VERSION');
  assert.deepEqual(facets,input.mandatoryEmailEventFacets.descriptor,'MANDATORY_EMAIL_INPUT_DESCRIPTORS');
  assert.deepEqual(date,input.mandatoryEmailEventFacets.date,'MANDATORY_EMAIL_INPUT_DATE');
  assert.deepEqual([date.owner,date.namespace,date.images],[owner,namespace,images],'MANDATORY_EMAIL_DATE_OWNER');validateMandatoryEmailEventDates(date.rows,definitionVersion);
  assert.deepEqual(json('baseline/framework-terminal.json'),terminal,'MANDATORY_EMAIL_OBSERVED_TERMINAL');
  const journal=raw['baseline/ccd-requests.jsonl'].toString().trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));
  const observations=selectedRows(variant).map(row=>json(`baseline/mandatory-email-${row}-observation.json`));
  const ids=[];
  for(const observation of observations){
    assert.equal(observation.variant,variant,'MANDATORY_EMAIL_OBSERVATION_VARIANT');validateMandatoryEmailObservation(observation,derivation,actorId);
    for(const control of [observation.filled,observation.empty]){ids.push(control.caseId);assert.equal(journal.filter(r=>r.method==='GET'&&r.path===`/data/internal/cases/${control.caseId}/event-triggers/serviceOfDocuments`&&r.actorId===actorId&&r.status===200).length,1,'MANDATORY_EMAIL_TRIGGER_JOURNAL');}
    const saved=[observation.filled,...(variant==='baseline'?[]:[observation.empty])];
    for(const c of saved)assert.equal(journal.filter(r=>r.method==='POST'&&r.path===`/data/cases/${c.caseId}/events`&&r.actorId===actorId&&r.status===201).length,1,'MANDATORY_EMAIL_SAVE_JOURNAL');
    if(variant==='baseline')assert(!journal.some(r=>r.method==='POST'&&r.path===`/data/cases/${observation.empty.caseId}/events`),'MANDATORY_EMAIL_REQUIRED_NO_SAVE');
  }
  assert.equal(new Set(ids).size,ids.length,'MANDATORY_EMAIL_CASE_REUSE');
  const saves=observations.flatMap(o=>[o.filled,...(variant==='baseline'?[]:[o.empty])]);
  assert.deepEqual(journal.filter(r=>r.method==='POST'&&/^\/data\/cases\/\d{16}\/events$/.test(r.path)).map(r=>[r.path,r.status,r.actorId]),saves.map(c=>[`/data/cases/${c.caseId}/events`,201,actorId]),'MANDATORY_EMAIL_EXACT_SAVE_JOURNAL');
  assert.deepEqual(journal.filter(r=>r.method==='GET'&&/^\/data\/internal\/cases\/\d{16}\/event-triggers\/serviceOfDocuments$/.test(r.path)).map(r=>[r.path,r.status,r.actorId]),ids.map(id=>[`/data/internal/cases/${id}/event-triggers/serviceOfDocuments`,200,actorId]),'MANDATORY_EMAIL_EXACT_TRIGGER_JOURNAL');
  const expectedOrder=observations.flatMap(o=>[
    ['GET',`/data/internal/cases/${o.filled.caseId}/event-triggers/serviceOfDocuments`,200,actorId],
    ['POST',`/data/cases/${o.filled.caseId}/events`,201,actorId],
    ['GET',`/data/internal/cases/${o.empty.caseId}/event-triggers/serviceOfDocuments`,200,actorId],
    ...(variant==='baseline'?[]:[['POST',`/data/cases/${o.empty.caseId}/events`,201,actorId]]),
  ]);
  const relevant=new Set(expectedOrder.map(([method,route])=>`${method} ${route}`));
  assert.deepEqual(journal.filter(r=>relevant.has(`${r.method} ${r.path}`)).map(r=>[r.method,r.path,r.status,r.actorId]),expectedOrder,'MANDATORY_EMAIL_CAUSAL_JOURNAL_ORDER');
  const outcome=validateMandatoryEmailFramework(json('baseline/report.json'),terminal,variant);
  return{kind:'mandatory-email-event-raw-evidence',status:variant==='baseline'?'mandatory-email-event-feasibility-observed':'mandatory-email-optional-fault-detected',variant,baselineProofs:outcome.baselineTests,effectiveFaults:outcome.effectiveFaultTests,runtimeAcceptance:false,catalogueCredit:false,releaseCredit:false};
}
