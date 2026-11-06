import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {digestBytes,writeJsonAtomic} from './exui-evidence-io.mjs';
import {deriveComplexEmailFixture,validateComplexEmailMetadata} from './exui-complex-email-text.mjs';
import {validateComplexEmailDefinition} from './exui-complex-email-import.mjs';
import {validateComplexEmailStoredClassification,validateComplexEmailRecipientIds,validateComplexEmailObserver} from './exui-complex-email-classification.mjs';
import {validateComplexEmailMapping,compareComplexEmailMappings} from './exui-complex-email-mapping.mjs';
import {assertOwnedContainerAuthority,candidateArchiveProcess,assertRequestedImageShutdown} from './exui-oci-runtime.mjs';
import {assertCandidateWriteDenial} from './exui-host-invocation.mjs';
import {ccdImagePins,verifyCcdContainerIdentity} from './exui-ccd-runtime.mjs';
import {validateComplexTransport} from './exui-complex-email-transport.mjs';
import {nativeIdentity} from './exui-native-contract.mjs';

export const COMPLEX_FLAGS=Object.freeze({sourceComplete:false,runtimeAcceptance:false,catalogueCredit:false,releaseCredit:false});
export const COMPLEX_CONTEXTS=Object.freeze(['browser-baseline','browser-email-type','mapping-baseline','mapping-searchable']);
const fail='COMPLEX_COHORT';
export function complexJson(directory,name) {
 const file=path.join(directory,name);assert.equal(fs.realpathSync(file),file,fail);assert(fs.lstatSync(file).isFile(),fail);
 assert(fs.statSync(file).size<16*1024*1024,fail);return JSON.parse(fs.readFileSync(file,'utf8'));
}
export function complexPin(directory,name) {
 const file=path.join(directory,name);assert.equal(fs.realpathSync(file),file,fail);assert(fs.lstatSync(file).isFile(),fail);
 return digestBytes(fs.readFileSync(file));
}
export function complexPins(directory,names){return Object.fromEntries(names.map(n=>[n,complexPin(directory,n)]));}
const clone=value=>JSON.parse(JSON.stringify(value));
const browserPrepared=['input.json','fixture/binding.json','fixture/definition.json','fixture/definition.xlsx','runtime/complex-email-import/receipt.json','runtime/runtime.json','runtime/recovery.json','runtime/creation-attempts.json'];
const browserCompleted=['baseline/report.json','baseline/complex-email-text-observation.json','baseline/ccd-requests.jsonl','baseline/complex-email-transport.jsonl','baseline/complex-email-observer.jsonl','baseline/candidate-lifecycle.json','baseline/framework-terminal.json','baseline/runtime-identity.json','baseline/candidate-write-denial.json','baseline/manifest.json','owned-resources.json','runtime/complex-email-import/stored-classification.json','runtime/complex-email-import/stored-classification-rows.json'];
const mappingPrepared=['fixture/binding.json','fixture/definition.json','fixture/definition.xlsx','import.json','before.json','runtime/runtime.json','runtime/recovery.json','runtime/creation-attempts.json'];
const browserClosed=['owned-resources.json','runtime/recovery.json','runtime/creation-attempts.json','runtime/runtime.json','receipt.json'];
const mappingClosed=['cleanup.json','runtime/recovery.json','runtime/creation-attempts.json','runtime/runtime.json'];
export const COMPLEX_FILES=Object.freeze({browserPrepared,browserCompleted,browserClosed,mappingPrepared,mappingCompleted:['mapping.json'],mappingClosed});
export function captureComplexCcd(state,inspect) {
 assert.equal(state.platform??'linux/arm64','linux/arm64',fail);
 const pins=ccdImagePins('linux/arm64',{elasticsearch:state.elasticsearch===true});
 assert.deepEqual(Object.keys(state.images).sort(),Object.keys(pins).sort(),fail);
 for(const [service,pin]of Object.entries(pins)){assert(state.images[service].id===pin.manifestDigest||pin.configDigest&&state.images[service].id===pin.configDigest,fail);assert.equal(state.images[service].architecture,'arm64',fail);assert(state.images[service].repoDigests.some(ref=>ref.endsWith('@'+pin.manifestDigest)),fail);}
 const observed={};
 verifyCcdContainerIdentity(state,id=>{
  const info=inspect(id);assert(info&&info.Id===id,fail);
  const service=Object.keys(state.containers).find(name=>state.containers[name]===id);assert.equal(info.Name,'/'+state.owner+'-'+service,fail);
  if(service==='definition'){assert.deepEqual(info.Config.Entrypoint,['/usr/bin/java','-jar'],fail);assert.deepEqual(info.Config.Cmd,['case-definition-store-api.jar'],fail);assert.equal(info.Config.WorkingDir,'/opt/app',fail);}
  assert.equal(info.RestartCount,0,fail);assert.equal(info.State.OOMKilled,false,fail);
  observed[id]={Id:info.Id,Name:info.Name,Image:info.Image,Config:{Labels:info.Config.Labels,User:info.Config.User,Entrypoint:info.Config.Entrypoint,Cmd:info.Config.Cmd,WorkingDir:info.Config.WorkingDir},
   HostConfig:{Privileged:info.HostConfig.Privileged,PidMode:info.HostConfig.PidMode,NetworkMode:info.HostConfig.NetworkMode,Binds:info.HostConfig.Binds,PortBindings:info.HostConfig.PortBindings},
   Mounts:info.Mounts,State:info.State,RestartCount:info.RestartCount};return info;
 });
 return clone(observed);
}
export function createComplexCapture(kind,expected,{active,inspect,ownerEmpty}) {
 assert(['browser','mapping'].includes(kind),fail);
 let key;
 return {
  creationStarted({variant,runtimeDirectory}){active();key=kind+'-'+variant;assert(COMPLEX_CONTEXTS.includes(key)&&!expected.contexts[key],fail);expected.contexts[key]={key,variant,directory:path.dirname(runtimeDirectory),creationStarted:true};},
  prepared(value){active();const context=expected.contexts[key];assert(context&&!context.prepared,fail);
   const state=kind==='browser'?value.ccd:value.state;assert.equal(value.imported.observations.import.status,201,fail);
   for(const other of Object.values(expected.contexts)){if(other!==context&&other.prepared){assert.notEqual(state.owner,other.prepared.state.owner,fail);assert.notEqual(state.namespace,other.prepared.state.namespace,fail);if(kind==='browser'&&other.prepared.input)assert.notEqual(value.input.runId,other.prepared.input.runId,fail);}}
   const directory=kind==='browser'?value.handoff.output:value.directory;assert.equal(context.directory,directory,fail);assert.equal(state.output,path.join(directory,'runtime'),fail);
   const prepared=kind==='browser'?{input:value.input,handoff:value.handoff,plan:value.plan,manifest:value.manifest,privateWorkspace:value.privateWorkspace,actorId:value.actorId}:{};
   if(kind==='browser'){const common={browserRoot:value.input.browserRoot,browserDigest:value.input.browserDigest,harnessDependencies:value.input.harnessDependencies,nativeRuntime:value.input.nativeRuntime,browserRuntimeImage:value.input.browserRuntimeImage};if(!expected.commonBrowser)expected.commonBrowser=clone(common);else assert.deepEqual(common,expected.commonBrowser,fail);assert.deepEqual(value.input.artifact,expected.candidate,fail);assert.equal(value.input.harnessSourceDigest,digestBytes(JSON.stringify(value.input.harnessSources.map(name=>{const entry=expected.producer.files.find(([p])=>p===name);assert(entry,fail);return entry;}))),fail);}
   context.prepared=clone({...prepared,state,imported:value.imported,files:complexPins(directory,kind==='browser'?browserPrepared:mappingPrepared),ccdInspection:captureComplexCcd(state,inspect)});
   assert.equal(state.platform??'linux/arm64','linux/arm64',fail);assert.equal(state.images.definition.id,'sha256:4c6b17b06d347d650fb8d26542716e1d723b7c8b8d44eee69908299cc8f4af52',fail);
   if(!expected.commonImages)expected.commonImages=clone(state.images);
   for(const service of Object.keys(expected.commonImages)){if(service!=='elasticsearch')assert.deepEqual(state.images[service],expected.commonImages[service],fail);}
  },
  completed(value){active();const context=expected.contexts[key];assert(context?.prepared&&!context.completed,fail);
   const state=kind==='browser'?value.ccd:value.state;assert.deepEqual(state,context.prepared.state,fail);
   const completed=clone({...(kind==='browser'?{execution:value.execution}:{observed:value.observed}),files:complexPins(context.directory,kind==='browser'?browserCompleted:['mapping.json']),ccdInspection:captureComplexCcd(state,inspect)});
   for(const id of Object.values(state.containers))assert.equal(completed.ccdInspection[id].State.StartedAt,context.prepared.ccdInspection[id].State.StartedAt,fail);
   if(kind==='browser'){validateComplexObservation(value.observed,context.variant);verifyNative({...context,completed});}
   context.completed=completed;
  },
  closed(value){const context=expected.contexts[key];assert(context,fail);
   assert.equal(value.cancelled,false,fail);assert(context.prepared&&context.completed,fail);
   if(kind==='browser')assert(value.nativeCleanupComplete===true&&value.workspaceCleanupComplete===true&&value.cleanup?.cleanupComplete===true&&value.creationUncertain===false,fail);
   else assert(value.cleanupComplete===true&&value.cleanupUncertain===false,fail);
   const state=context.prepared.state,names=Object.keys(state.containers).map(s=>state.owner+'-'+s),ids=Object.values(state.containers);
   if(kind==='browser'){
    const registry=complexJson(context.directory,'owned-resources.json');
    for(const item of registry){assert(item.removed===true&&/^[a-f0-9]{64}$/.test(item.id),fail);names.push(item.name);ids.push(item.id);}
    assert(!fs.existsSync(context.prepared.privateWorkspace),fail);
   }
   for(const item of [...names,...ids])assert.equal(inspect(item),null,fail);
   assert.equal(ownerEmpty(state.owner),true,fail);if(kind==='browser')assert.equal(ownerEmpty(context.prepared.input.runId),true,fail);
   context.closed={names,ids,observedAbsent:true,files:complexPins(context.directory,kind==='browser'?browserClosed:mappingClosed)};writeJsonAtomic(path.join(context.directory,'complex-parent-capture.json'),clone(context));
  },
 };
}
function verifyNative(context) {
 const {prepared:p,completed:c}=context,{input,plan}=p,execution=c.execution;
 assert.equal(execution.terminal.signal,null,fail);assert.equal(execution.runtime.platform,'linux',fail);assert.equal(execution.runtime.architecture,'arm64',fail);assert.equal(execution.runtime.nodeVersion,input.artifact.provenance.runtimeNodeVersion,fail);assertRequestedImageShutdown(execution.lifecycle.before,execution.lifecycle.after,execution.lifecycle.requestedStop);
 const report=complexJson(context.directory,'baseline/report.json'),specs=[];const visit=suite=>{specs.push(...(suite.specs??[]));for(const child of suite.suites??[])visit(child);};for(const suite of report.suites??[])visit(suite);
 assert.equal(report.errors?.length??0,0,fail);assert.equal(specs.length,1,fail);assert.equal(specs[0].tests.length,1,fail);const results=specs[0].tests[0].results;assert.equal(results.length,1,fail);assert.equal(results[0].retry,0,fail);
 assert.equal(results[0].status,context.variant==='baseline'?'passed':'failed',fail);assert.equal(report.stats.skipped,0,fail);
 if(context.variant==='email-type'){assert.equal(results[0].errors?.length??1,1,fail);assert(results[0].error?.message?.includes('COMPLEX_EMAIL_SOURCE_TYPE_TIGHTENED'),fail);}
assert.equal(execution.terminal.code,context.variant==='baseline'?0:1,fail);
 const registry=complexJson(context.directory,'owned-resources.json');assert.equal(registry.length,2,fail);
 const {config}=nativeIdentity(input,{invocationId:'baseline',mutation:null},input.artifact.candidateRoot);
 for(const [service,resource]of [['candidate',plan.candidate],['browser-provider',plan.tools]]){
  const rows=registry.filter(r=>r.name===resource.name);assert.equal(rows.length,1,fail);const row=rows[0];
  assert.deepEqual([row.owner,row.service,row.image,row.namespace,row.mounts,row.removed],[input.runId,service,resource.image,input.ccd.namespace,resource.mounts,true],fail);
  if(service==='candidate')for(const info of [execution.lifecycle.before,execution.lifecycle.after]){
   assert.equal(info.Id,row.id,fail);assert.equal(info.Name,'/'+resource.name,fail);
   assertOwnedContainerAuthority(info,{owner:input.runId,service,image:resource.image,namespace:input.ccd.namespace,mounts:resource.mounts,launchProcess:candidateArchiveProcess(config,input.releaseScopeId)});
  }
 }
 const denial=complexJson(context.directory,'baseline/candidate-write-denial.json');assertCandidateWriteDenial(denial);assert.equal(denial.candidateId,execution.lifecycle.before.Id,fail);
 assert.deepEqual(complexJson(context.directory,'baseline/manifest.json'),{...p.manifest,runtimeMetadata:{...p.manifest.runtimeMetadata,candidateAuthorityIsolation:'separate-container-no-evidence-mount',candidateRuntimeNodeVersion:input.artifact.provenance.runtimeNodeVersion,candidateObservedImageId:plan.candidate.image}},fail);
 const runtime=complexJson(context.directory,'baseline/runtime-identity.json');assert.deepEqual(runtime.identity,p.manifest.identity,fail);assert.equal(runtime.payloadDigest,input.artifact.payloadDigest,fail);assert.equal(runtime.candidateContainerId,execution.lifecycle.before.Id,fail);assert.equal(runtime.observedImageId,plan.candidate.image,fail);assert.deepEqual(runtime.runtime,execution.runtime,fail);
 assert.deepEqual(complexJson(context.directory,'baseline/framework-terminal.json'),execution.terminal,fail);
 assert.equal(execution.lifecycle.requestedStop,true,fail);assert.equal(execution.lifecycle.after.State.Running,false,fail);assert.equal(execution.lifecycle.after.State.OOMKilled,false,fail);
 assert.deepEqual(complexJson(context.directory,'baseline/candidate-lifecycle.json'),execution.lifecycle,fail);
}
export function validateComplexObservation(observed,variant) {
 assert.equal(observed.kind,'complex-email-text-observation',fail);assert.equal(observed.variant,variant,fail);
 for(const flag of Object.keys(COMPLEX_FLAGS))assert.equal(observed[flag],false,fail);
 assert.equal(new Set([observed.healthy.caseId,observed.probe.caseId]).size,2,fail);
 const allIds=[];
 for(const [kind,j]of [['control',observed.healthy],['probe',observed.probe]]){
  assert(/^\d{16}$/.test(j.caseId),fail);const rejected=kind==='probe'&&variant==='email-type';
  const addresses=kind==='control'?['alpha@harness.example.com','beta@harness.example.com']:['Synthetic recipient contact alpha','control@harness.example.com'];
  const names=addresses.map((_,i)=>`Synthetic contact ${rejected?'probe':'control'} ${i+1}`);
  const controls=values=>{assert.equal(values.length,2,fail);for(const [i,c]of values.entries()){
   assert.equal(c.type,variant==='baseline'?'text':'email',fail);assert.equal(c.label,'Email address',fail);assert.equal(c.value,addresses[i],fail);assert.equal(c.visible,true,fail);
   assert.equal(c.emailName.value,names[i],fail);assert(c.emailName.visible&&c.emailName.domIndex<c.domIndex,fail);
   assert(c.channel.emailSelected&&!c.channel.postSelected&&c.channel.emailId!==c.channel.postId,fail);assert.equal(c.postal.hidden,true,fail);
   assert(typeof c.id==='string'&&c.id.length>0&&Number.isInteger(c.domIndex),fail);
  }assert.equal(new Set(values.map(c=>c.id)).size,2,fail);};
  controls(j.controls);validateComplexEmailObserver(j.before.state);validateComplexEmailObserver(j.after.state);
  assert.deepEqual(j.before.state.case_data.sodAdditionalRecipientsList,[],fail);
  assert.equal(j.validationResponses.length,rejected?1:2,fail);assert.deepEqual(j.validationResponses[0],j.validation,fail);
  for(const v of j.validationResponses){assert.equal(v.status,rejected?422:200,fail);assert.equal(v.request.path,'/data/case-types/HarnessNestedPRL/validate',fail);assert.equal(v.request.event.id,'update',fail);
   const values=v.request.data.sodAdditionalRecipientsList;assert.equal(values.length,2,fail);for(const [i,r]of values.entries())assert.deepEqual(r.value.emailInformation,{emailName:names[i],emailAddress:addresses[i]},fail);
  }
  if(rejected){
   const errors=j.validation.body.details.field_errors;assert.equal(errors.length,1,fail);assert.equal(errors[0].id,'sodAdditionalRecipientsList.0.emailInformation.emailAddress',fail);
   assert.equal(j.cya.visible,false,fail);assert.deepEqual(j.cya.rows,[],fail);assert.deepEqual(j.submissions,[],fail);assert.deepEqual(j.after,j.before,fail);
   assert.equal(j.sent,null,fail);assert.equal(j.outgoing,null,fail);assert.equal(j.status,null,fail);assert.equal(j.secondCya,null,fail);assert.deepEqual(j.restoredControls,[],fail);
   controls(j.rejectedControls);assert(j.rejectedControls[0].classes.includes('govuk-input--error'),fail);
  }else{
   for(const cya of [j.cya,j.secondCya]){assert.equal(cya.visible,true,fail);assert.equal(cya.rows.length,2,fail);for(const [i,row]of cya.rows.entries()){assert(row.includes(names[i])&&row.includes(addresses[i])&&row.includes('Email address'),fail);}}
   assert.deepEqual(j.cyaRows,j.cya.rows,fail);controls(j.restoredControls);assert.deepEqual(j.restored,names.map((name,i)=>({name,address:addresses[i]})),fail);
   assert.deepEqual(j.outgoing,{method:'POST',path:`/data/cases/${j.caseId}/events`,classificationPresent:false,dataClassificationPresent:false},fail);
   assert.deepEqual(j.submissions,[`/data/cases/${j.caseId}/events`],fail);assert.equal(j.status,201,fail);assert.equal(j.sent.event.id,'update',fail);assert(!Object.hasOwn(j.sent.data,'data_classification'),fail);
   assert.equal(j.after.state.version,j.before.state.version+1,fail);assert.equal(j.after.state.case_data.protectedValue,j.before.state.case_data.protectedValue,fail);
   const saved=j.after.state.case_data.sodAdditionalRecipientsList,sent=j.sent.data.sodAdditionalRecipientsList;validateComplexEmailRecipientIds(saved,sent);
   for(const [i,row]of saved.entries()){assert.deepEqual(row.value.emailInformation,{emailName:names[i],emailAddress:addresses[i]},fail);allIds.push(row.id);}
   const sibling=structuredClone(j.sent.data);delete sibling.sodAdditionalRecipientsList;const before=structuredClone(j.before.state.case_data);delete before.sodAdditionalRecipientsList;assert.deepEqual(sibling,before,fail);
   assert.deepEqual(j.after.history.filter(r=>r.id!=='update'),j.before.history,fail);const updates=j.after.history.filter(r=>r.id==='update');assert.equal(updates.length,1,fail);assert.equal(updates[0].user_id,observed.actorId,fail);
  }
 }
 assert.equal(new Set(allIds).size,allIds.length,fail);return true;
}
export function readComplexCohort(directory,expected,{active=()=>{},inspect,ownerEmpty}={}) {
 assert(expected&&Object.keys(expected.contexts).length===4,fail);assert.equal(expected.directory,directory,fail);active();
 const states=Object.values(expected.contexts).map(c=>c.prepared?.state);assert(states.every(Boolean)&&new Set(states.map(s=>s.owner)).size===4&&new Set(states.map(s=>s.namespace)).size===4,fail);
 const mappings=[];
 for(const key of COMPLEX_CONTEXTS){active();const c=expected.contexts[key];assert.equal(c.directory,key.startsWith('browser')?path.join(directory,key):path.join(directory,'mapping',key.slice(8)),fail);assert.equal(c.key,key,fail);assert.equal(c.variant,key.slice(8),fail);assert(c?.prepared&&c.completed&&c.closed?.observedAbsent===true,fail);
  const kind=key.startsWith('browser')?'browser':'mapping';for(const stage of ['prepared','completed','closed'])assert.deepEqual(Object.keys(c[stage].files).sort(),COMPLEX_FILES[kind+stage[0].toUpperCase()+stage.slice(1)].slice().sort(),fail);
  for(const [name,pin]of Object.entries({...c.prepared.files,...c.completed.files,...c.closed.files}))assert.equal(complexPin(c.directory,name),pin,fail);
  captureComplexCcd(c.prepared.state,id=>c.prepared.ccdInspection[id]);captureComplexCcd(c.prepared.state,id=>c.completed.ccdInspection[id]);
  for(const id of Object.values(c.prepared.state.containers))assert.equal(c.completed.ccdInspection[id].State.StartedAt,c.prepared.ccdInspection[id].State.StartedAt,fail);
  const attempts=complexJson(c.directory,'runtime/creation-attempts.json');assert.deepEqual(attempts,Object.entries(c.prepared.state.containers).map(([service,containerId])=>({service,name:c.prepared.state.owner+'-'+service,state:'settled',containerId})),fail);
  const recovery=complexJson(c.directory,'runtime/recovery.json');assert.equal(recovery.owner,c.prepared.state.owner,fail);assert.equal(recovery.output,path.join(c.directory,'runtime'),fail);assert.deepEqual(Object.keys(recovery.resources).sort(),Object.keys(c.prepared.state.containers).sort(),fail);
  for(const [service,resource]of Object.entries(recovery.resources)){assert.equal(resource.name,c.prepared.state.owner+'-'+service,fail);assert.equal(resource.image,c.prepared.state.images[service].id,fail);}
  const finalState=complexJson(c.directory,'runtime/runtime.json');assert.equal(finalState.ready,false,fail);assert.equal(typeof finalState.stoppedAt,'string',fail);const comparable=structuredClone(finalState);delete comparable.stoppedAt;comparable.ready=c.prepared.state.ready;assert.deepEqual(comparable,c.prepared.state,fail);
  const derived=deriveComplexEmailFixture(c.variant);assert.deepEqual(complexJson(c.directory,'fixture/definition.json'),derived.fixture,fail);
  assert.deepEqual(complexJson(c.directory,'fixture/binding.json').binding,derived.binding,fail);
  const imported=c.prepared.imported;assert.deepEqual(imported.seal.binding,derived.binding,fail);assert.equal(imported.seal.workbookDigest,complexPin(c.directory,'fixture/definition.xlsx'),fail);assert.equal(imported.seal.definitionDigest,complexPin(c.directory,'fixture/definition.json'),fail);assert.equal(imported.status,'import-and-complex-metadata-observed',fail);assert.equal(imported.observations.import.status,201,fail);
  validateComplexEmailDefinition(imported.observations.definition.body,c.variant);
  const metadata=validateComplexEmailMetadata(imported.metadata.rows,{owner:c.prepared.state.owner,namespace:c.prepared.state.namespace,version:imported.descriptor.version},c.variant);assert.deepEqual(imported.metadata,metadata,fail);
  assert.deepEqual(complexJson(c.directory,key.startsWith('browser')?'runtime/complex-email-import/receipt.json':'import.json'),imported,fail);
  assert.equal(c.prepared.state.elasticsearch===true,key.startsWith('mapping'),fail);
  if(key.startsWith('browser')){
   assert.deepEqual({browserRoot:c.prepared.input.browserRoot,browserDigest:c.prepared.input.browserDigest,harnessDependencies:c.prepared.input.harnessDependencies,nativeRuntime:c.prepared.input.nativeRuntime,browserRuntimeImage:c.prepared.input.browserRuntimeImage},expected.commonBrowser,fail);verifyNative(c);const observed=complexJson(c.directory,'baseline/complex-email-text-observation.json');
   assert.equal(observed.actorId,c.prepared.actorId,fail);validateComplexObservation(observed,c.variant);
   const lines=name=>fs.readFileSync(path.join(c.directory,'baseline/'+name),'utf8').trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));
   validateComplexTransport(lines('complex-email-transport.jsonl'),observed,{actorId:c.prepared.actorId,observerId:c.prepared.input.credentials.observer.userId,observerRecords:lines('complex-email-observer.jsonl')});
   const journal=lines('ccd-requests.jsonl');
   const validations=journal.filter(r=>r.method==='POST'&&r.upstreamPath==='/case-types/HarnessNestedPRL/validate');
   assert.deepEqual(validations.map(r=>r.status),c.variant==='baseline'?[200,200,200,200]:[200,200,422],fail);assert(validations.every(r=>r.actorId===c.prepared.actorId),fail);
   for(const journey of [observed.healthy,observed.probe]){const submitted=journal.filter(r=>r.method==='POST'&&r.upstreamPath===`/cases/${journey.caseId}/events`);assert.equal(submitted.length,journey.status===201?1:0,fail);assert(submitted.every(r=>r.status===201&&r.actorId===c.prepared.actorId),fail);}
   const rows=complexJson(c.directory,'runtime/complex-email-import/stored-classification-rows.json');
   validateComplexEmailStoredClassification(rows,observed,{owner:c.prepared.state.owner,namespace:c.prepared.state.namespace,version:c.prepared.imported.descriptor.version});
  }else {assert.deepEqual(complexJson(c.directory,'mapping.json'),c.completed.observed,fail);const before=complexJson(c.directory,'before.json');assert.equal(before.cluster.status,200,fail);assert.equal(before.cluster.body.cluster_name,c.prepared.state.owner,fail);assert.equal(before.alias.status,404,fail);assert.equal(before.indices.status,200,fail);assert.deepEqual(before.indices.body,{},fail);mappings.push(validateComplexEmailMapping(complexJson(c.directory,'mapping.json'),c.variant));}
  for(const item of [...c.closed.names,...c.closed.ids])assert.equal(inspect(item),null,fail);
  assert(ownerEmpty(c.prepared.state.owner),fail);
 }
 compareComplexEmailMappings(...mappings);active();
 const proof=expected.sourceProof;assert.equal(proof?.directory,path.join(directory,'source-proof'),fail);assert(proof&&proof.terminal.started===true&&Number.isSafeInteger(proof.terminal.pid)&&proof.terminal.pid>0&&proof.terminal.observed===true&&proof.terminal.code===0&&proof.terminal.signal===null&&!proof.terminal.cancelled&&!proof.terminal.forced,fail);
 for(const [name,pin]of Object.entries(proof.files))assert.equal(complexPin(proof.directory,name),pin,fail);
 const association=complexJson(proof.directory,'definition-image-binding.json'),result=complexJson(proof.directory,'class-proof/result.json'),compiler=complexJson(proof.directory,'class-proof/compiler-shutdown.json');
 assert.equal(association.imageIndexDigest,expected.commonImages.definition.id,fail);assert.equal(association.platform,'linux/arm64',fail);
 assert.equal(association.sourceCommit,'120b9a232f7b617d03faf68ad2d8e63a0afb0442',fail);assert.equal(association.status,'APPLICATION_CLASS_BYTES_IDENTICAL',fail);
 assert.equal(association.jarDigest,'sha256:8c4d4e13a61a7d2486e45631fc81d542a3ee8cc02689ae460b45ba9d7d768432',fail);
 assert.equal(result.status,'APPLICATION_CLASS_BYTES_IDENTICAL',fail);assert.equal(result.matches,635,fail);assert.equal(result.sourceFiles,560,fail);assert.equal(result.expectedClasses,635,fail);assert.equal(result.compilerExitCode,0,fail);assert.equal(result.inputsUnchanged,true,fail);assert.deepEqual([result.missing,result.extra,result.mismatches],[[],[],[]],fail);
 const version=complexJson(proof.directory,'class-proof/compiler-version-shutdown.json');assert(version.observed===true&&version.code===0&&version.signal===null&&!version.cancelled&&!version.forced,fail);
 assert(compiler.started===true&&compiler.observed===true&&compiler.code===0&&compiler.signal===null&&compiler.cancelled===false&&!compiler.forced,fail);
 assert.equal(association.classProofPreexecutionDigest,complexPin(proof.directory,'class-proof/preexecution.json'),fail);assert.equal(association.classProofResultDigest,complexPin(proof.directory,'class-proof/result.json'),fail);
 assert.deepEqual(Object.keys(proof.prepared).sort(),['python','sourceArchive','definitionArchive','javaHome','lombok','mapstruct'].sort(),fail);
 for(const item of [...Object.values(proof.prepared),...proof.tools]){if(item.digest!==null)assert.equal(digestBytes(fs.readFileSync(item.path)),item.digest,fail);}
 for(const flag of Object.keys(COMPLEX_FLAGS)){assert.equal(association[flag],false,fail);assert.equal(result[flag],false,fail);}active();
 return {kind:'complex-email-noncredit-cohort',status:'OBSERVATIONS_VERIFIED',contexts:4,sourceClasses:635,...COMPLEX_FLAGS};
}
