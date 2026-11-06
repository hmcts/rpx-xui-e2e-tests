import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {digestBytes} from './exui-evidence-io.mjs';
import {derivePersonalServiceFixture,PERSONAL_SERVICE_ID,PERSONAL_SERVICE_VARIANTS} from './exui-personal-service-contract.mjs';
import {readPersonalServiceEvidence} from './exui-personal-service-evidence.mjs';
import {validateNativeInvocationFinalization} from './exui-native-ci-ownership.mjs';
import {assertOwnedContainerAuthority,candidateArchiveProcess} from './exui-oci-runtime.mjs';
import {verifyCcdContainerIdentity} from './exui-ccd-runtime.mjs';
import {inspectHostContainer} from './exui-host-invocation.mjs';
import {nativeIdentity} from './exui-native-contract.mjs';
import {nativeContainerPlan} from './exui-native-containers.mjs';
import {CALLBACK_UI_SOURCES} from '../run-harness-recipient-callback-ui.mjs';
export const PERSONAL_ROOT=fileURLToPath(new URL('../../',import.meta.url)).replace(/\/$/,'');
export const PERSONAL_NO_CREDIT=Object.freeze({sourceComplete:false,nativeRuntimeAcceptance:false,catalogueCredit:false,releaseCredit:false});
export const PERSONAL_POLICY='personal-service-parent-bound-pair-v1';
export const personalDigest=value=>digestBytes(JSON.stringify(value));
export const serialPlan=plan=>JSON.parse(JSON.stringify(plan));
export const PERSONAL_RAW_FILES=Object.freeze(['input.json','baseline/personal-service-observation.json','baseline/ccd-requests.jsonl','baseline/report.json','runtime/recipient-callback-import/receipt.json','runtime/recipient-callback-import/personal-service-stored-row-date.json']);
export const PERSONAL_PRE_FILES=Object.freeze(['input.json','fixture/definition.json','fixture/definition.xlsx','fixture/binding.json','runtime/recipient-callback-import/receipt.json','runtime/recipient-callback-import/personal-service-stored-row-date.json','runtime/recipient-callback-import/runtime-verification.json','runtime/recovery.json','runtime/creation-attempts.json']);
export const PERSONAL_FINAL_FILES=Object.freeze([...new Set([...PERSONAL_RAW_FILES,...PERSONAL_PRE_FILES,'personal-service-observed-terminal.json','baseline/framework-terminal.json','baseline/candidate-write-denial.json','baseline/candidate-lifecycle.json','baseline/manifest.json','baseline/runtime-identity.json','owned-resources.json','personal-service-child-finalization.json'])]);
const fail='PERSONAL_SERVICE_PARENT_BINDING';
export function personalFile(directory,name) {
 assert(path.isAbsolute(directory)&&path.resolve(directory)===directory&&!path.isAbsolute(name)&&!name.split('/').some(p=>p==='..'||p==='.'||p===''),'PERSONAL_SERVICE_PATH');
 const file=path.join(directory,name);assert(fs.lstatSync(file).isFile()&&fs.realpathSync(file)===file,'PERSONAL_SERVICE_FILE_ALIAS');
 const bytes=fs.readFileSync(file);assert(bytes.length<=16*1024*1024,'PERSONAL_SERVICE_FILE_SIZE');return {bytes,digest:digestBytes(bytes)};
}
export const personalJson=(directory,name)=>JSON.parse(personalFile(directory,name).bytes);
export const personalFiles=(directory,names)=>Object.fromEntries(names.map(name=>[name,personalFile(directory,name).digest]));
export function personalProducer() {
 const git=args=>{const p=spawnSync('git',args,{cwd:PERSONAL_ROOT,encoding:'utf8'});assert.equal(p.status,0,fail);return p.stdout.trim();};
 assert.equal(git(['status','--porcelain']),'','PERSONAL_SERVICE_CLEAN_PRODUCER');
 const files=CALLBACK_UI_SOURCES.map(name=>[name,personalFile(PERSONAL_ROOT,name).digest]);
 return {commit:git(['rev-parse','HEAD']),files,digest:personalDigest(files)};
}
export function personalPolicyDigest() {return personalDigest({policy:PERSONAL_POLICY,id:PERSONAL_SERVICE_ID,variants:PERSONAL_SERVICE_VARIANTS,bindings:PERSONAL_SERVICE_VARIANTS.map(v=>derivePersonalServiceFixture(v).binding),limits:PERSONAL_NO_CREDIT});}
export function personalPlan(input,handoff) {
 const plan=nativeContainerPlan(input,handoff,'baseline');const index=plan.tools.args.indexOf('scripts/run-harness-native-tools.mjs');assert(index>=0,fail);
 plan.tools.args[index]='scripts/recipient-callback-ui-tools.mjs';plan.proofArguments=['scripts/recipient-callback-ui-tools.mjs','--inside-proof'];return plan;
}
export function validatePersonalInput(input,binding,cohort) {
 assert.equal(binding.schemaVersion,1,fail);assert.equal(binding.cohortDigest,personalDigest(cohort),fail);assert.equal(binding.policyDigest,personalPolicyDigest(),fail);
 assert(PERSONAL_SERVICE_VARIANTS.includes(binding.variant),fail);assert.deepEqual(binding.noCredit,PERSONAL_NO_CREDIT,fail);
 assert.equal(input.variant,binding.variant,fail);assert.equal(input.scenario,'personal-service',fail);assert.equal(input.kind,'personal-service-ui-feasibility',fail);assert.equal(input.releaseScopeId,'exui-ccd-event-capability-pilot',fail);
 assert(/^ccd-[a-f0-9-]{36}$/.test(input.runId),fail);assert.equal(input.runId,binding.runId,fail);
 assert.deepEqual(input.personalServiceBinding,derivePersonalServiceFixture(binding.variant).binding,fail);
 assert.deepEqual(input.artifact,cohort.artifact,fail);assert.equal(input.browserRoot,cohort.browser.root,fail);assert.equal(input.browserDigest,cohort.browser.digest,fail);
 assert.deepEqual(input.harnessDependencies,cohort.dependencies,fail);assert.deepEqual(input.nativeRuntime,cohort.nativeRuntime,fail);assert.equal(input.browserRuntimeImage,cohort.browser.image,fail);
 assert.deepEqual(input.harnessSources,cohort.producer.files.map(([name])=>name),fail);assert.equal(input.harnessSourceDigest,cohort.producer.digest,fail);
 assert.deepEqual(input.ccd,binding.ccd,fail);assert.deepEqual(Object.keys(binding.ccdInspection).sort(),Object.keys(input.ccd.containers).sort(),fail);
 for(const [service,id]of Object.entries(input.ccd.containers)){assert.equal(binding.ccdInspection[service].Id,id,fail);assert.equal(binding.ccdInspection[service].Name,'/'+input.ccd.owner+'-'+service,fail);}
 verifyCcdContainerIdentity(input.ccd,id=>Object.values(binding.ccdInspection).find(info=>info.Id===id));assert.deepEqual(input.definition,binding.definition,fail);assert.deepEqual(input.apiContracts,binding.apiContracts,fail);assert.deepEqual(input.callbackObservedDigests,binding.callbackObservedDigests,fail);
 assert.equal(input.ccd.output,path.join(binding.directory,'runtime'),fail);assert.equal(input.ccd.ready,true,fail);assert.equal(input.ccd.localCcdProfile,undefined,fail);assert.equal(input.ccd.elasticsearch??false,false,fail);
 assert(/^harness-[a-f0-9]{16}$/.test(input.ccd.owner)&&/^[a-f0-9]{64}$/.test(input.ccd.namespace),fail);
 assert.deepEqual(Object.keys(input.ccd.images).sort(),Object.keys(cohort.ccdImages).sort(),fail);
 for(const [service,image]of Object.entries(input.ccd.images))assert.deepEqual(image,cohort.ccdImages[service],fail);
 const actors=Object.fromEntries(Object.entries(input.credentials).map(([role,actor])=>[role,{userId:actor.userId,roles:actor.roles??[]}]));assert.deepEqual(actors,binding.actors,fail);
 assert.equal(binding.handoff.output,binding.directory,fail);assert.equal(binding.handoff.stagedHarness,path.join(binding.privateWorkspace,'sources'),fail);assert.equal(binding.handoff.stateRoot,path.join(binding.privateWorkspace,'state'),fail);
 assert.equal(path.dirname(binding.privateWorkspace),fs.realpathSync(os.tmpdir()),fail);assert(/^exui-callback-native-[A-Za-z0-9]+$/.test(path.basename(binding.privateWorkspace)),fail);
 assert.equal(binding.plan.output,binding.directory,fail);assert.equal(binding.plan.owner,input.runId,fail);assert.equal(binding.plan.namespace,input.ccd.namespace,fail);
 return input;
}
export function capturePersonalCcdInspection(ccd,inspect=inspectHostContainer) {
 const observed=Object.fromEntries(Object.entries(ccd.containers).map(([service,id])=>{const info=inspect(id);assert(info,fail);assert.equal(info.Id,id,fail);assert.equal(info.Name,'/'+ccd.owner+'-'+service,fail);return [service,{Id:info.Id,Name:info.Name,Image:info.Image,Config:{User:info.Config.User??'',Labels:info.Config.Labels},HostConfig:{NetworkMode:info.HostConfig.NetworkMode,Privileged:info.HostConfig.Privileged??false,PidMode:info.HostConfig.PidMode??'',Binds:info.HostConfig.Binds??[],PortBindings:info.HostConfig.PortBindings??{}},Mounts:info.Mounts??[],State:{Running:info.State.Running}}];}));
 verifyCcdContainerIdentity(ccd,id=>Object.values(observed).find(info=>info.Id===id));return observed;
}
export function capturePersonalPrepared(prepared,cohort) {
 const {input,handoff,plan,manifest,privateWorkspace}=prepared,directory=handoff.output;
 const candidateProcess=candidateArchiveProcess(nativeIdentity(input,{invocationId:'baseline',mutation:null},input.artifact.candidateRoot).config,input.releaseScopeId);
 const binding={schemaVersion:1,cohortDigest:personalDigest(cohort),policyDigest:personalPolicyDigest(),variant:input.variant,runId:input.runId,directory,privateWorkspace,handoff,plan:serialPlan(plan),candidateProcess,manifest,ccd:input.ccd,ccdInspection:capturePersonalCcdInspection(input.ccd),definition:input.definition,apiContracts:input.apiContracts,callbackObservedDigests:input.callbackObservedDigests,actors:Object.fromEntries(Object.entries(input.credentials).map(([role,actor])=>[role,{userId:actor.userId,roles:actor.roles??[]}])),files:personalFiles(directory,PERSONAL_PRE_FILES),noCredit:PERSONAL_NO_CREDIT};
 validatePersonalInput(input,binding,cohort);assert.deepEqual(serialPlan(personalPlan(input,handoff)),binding.plan,fail);assert.equal(personalFile(directory,'input.json').digest,binding.files['input.json'],fail);
 return binding;
}
export function readPersonalPrepared(binding,cohort,{live=false}={}) {
 assert.deepEqual(Object.keys(binding.files).sort(),PERSONAL_PRE_FILES.slice().sort(),fail);
 assert.deepEqual(personalFiles(binding.directory,PERSONAL_PRE_FILES),binding.files,fail);
 const input=validatePersonalInput(personalJson(binding.directory,'input.json'),binding,cohort);
 const imported=personalJson(binding.directory,'runtime/recipient-callback-import/receipt.json');assert.deepEqual(personalJson(binding.directory,'fixture/definition.json'),derivePersonalServiceFixture(binding.variant).fixture,fail);assert.equal(personalFile(binding.directory,'fixture/definition.xlsx').digest,imported.seal.workbookDigest,fail);assert.deepEqual(personalJson(binding.directory,'fixture/binding.json'),imported.seal,fail);assert.equal(input.definition.fixtureDigest,imported.seal.definitionDigest,fail);
 if(live){assert.deepEqual(binding.candidateProcess,candidateArchiveProcess(nativeIdentity(input,{invocationId:'baseline',mutation:null},input.artifact.candidateRoot).config,input.releaseScopeId),fail);assert.equal(fs.realpathSync(binding.privateWorkspace),binding.privateWorkspace,fail);assert.deepEqual(serialPlan(personalPlan(input,binding.handoff)),binding.plan,fail);for(const [name,hash]of cohort.producer.files)assert.equal(personalFile(binding.handoff.stagedHarness,name).digest,hash,fail);}
 return input;
}
export function validatePersonalNativeFinalization(binding) {
 assert(Array.isArray(binding.candidateProcess?.entrypoint)&&binding.candidateProcess.entrypoint.length>0&&Array.isArray(binding.candidateProcess.command)&&binding.candidateProcess.command.length>0,fail);
 const directory=binding.directory,registry=personalJson(directory,'owned-resources.json');
 assert(Array.isArray(registry)&&registry.length===2,fail);
 const {denial,lifecycle}=validateNativeInvocationFinalization(directory,{invocationId:'baseline'});
 for(const [service,plan]of [['candidate',binding.plan.candidate],['browser-provider',binding.plan.tools]]){
 const rows=registry.filter(r=>r.name===plan.name);assert.equal(rows.length,1,fail);const row=rows[0];
 assert(/^[a-f0-9]{64}$/.test(row.id),fail);assert.deepEqual([row.owner,row.service,row.image,row.namespace,row.mounts,row.removed],[binding.runId,service,plan.image,binding.ccd.namespace,plan.mounts,true],fail);
 if(service==='candidate'){assert.equal(denial.candidateId,row.id,fail);for(const info of [lifecycle.before,lifecycle.after]){assert.equal(info.Id,row.id,fail);assert.equal(info.Name,'/'+plan.name,fail);assertOwnedContainerAuthority(info,{owner:binding.runId,service,image:plan.image,namespace:binding.ccd.namespace,mounts:plan.mounts,launchProcess:binding.candidateProcess});}assert.equal(lifecycle.after.State.OOMKilled,false,fail);}
 }
 return registry;
}
// A normally observed parent child plus exact creation/finalization records, never absence alone.
export function validatePersonalChildClosure(binding,terminal) {
 assert(terminal?.started===true&&terminal.observed===true&&terminal.forced===false&&terminal.cancelled===false&&terminal.signal===null&&Number.isInteger(terminal.code),'PERSONAL_SERVICE_CLOSURE_TERMINAL');
 const value=personalJson(binding.directory,'personal-service-child-finalization.json');
 assert.equal(personalFile(binding.directory,'runtime/creation-attempts.json').digest,binding.files['runtime/creation-attempts.json'],'PERSONAL_SERVICE_CLOSURE_CCD_CHANGED');
 assert.deepEqual(personalJson(binding.directory,'runtime/creation-attempts.json'),Object.entries(binding.ccd.containers).map(([service,containerId])=>({service,name:binding.ccd.owner+'-'+service,state:'settled',containerId})),'PERSONAL_SERVICE_CLOSURE_CCD_UNSETTLED');
 const registry=validatePersonalNativeFinalization(binding);
 const expected=registry.map(row=>({name:row.name,state:'settled',id:row.id}));
 assert.deepEqual(value,{schemaVersion:1,runId:binding.runId,bindingDigest:personalDigest(binding),cleanupComplete:true,cancelled:false,creationSafe:true,creationAttempts:expected,frameworkTerminal:personalJson(binding.directory,'baseline/framework-terminal.json'),processesSettled:true},'PERSONAL_SERVICE_CLOSURE_UNSETTLED');
 assert(value.frameworkTerminal.signal===null&&Number.isInteger(value.frameworkTerminal.code),'PERSONAL_SERVICE_CLOSURE_FRAMEWORK');
 return registry;
}
export function validatePersonalInvocation(binding,cohort,completion) {
 const input=readPersonalPrepared(binding,cohort);
 assert.deepEqual(completion.childTerminal,{started:true,observed:true,forced:false,cancelled:false,code:0,signal:null},fail);
 assert.deepEqual(Object.keys(completion.files).sort(),PERSONAL_FINAL_FILES.slice().sort(),fail);assert.deepEqual(personalFiles(binding.directory,PERSONAL_FINAL_FILES),completion.files,fail);
 const framework=personalJson(binding.directory,'personal-service-observed-terminal.json');assert.equal(framework.runId,binding.runId,fail);assert.deepEqual(framework.terminal,personalJson(binding.directory,'baseline/framework-terminal.json'),fail);
 validatePersonalChildClosure(binding,completion.childTerminal);
 const result=readPersonalServiceEvidence(binding.directory,{variant:binding.variant,actorId:input.credentials.courtadmin.userId,terminal:framework.terminal,files:Object.fromEntries(PERSONAL_RAW_FILES.map(name=>[name,completion.files[name]])),sourceBinding:input.personalServiceBinding,definitionVersion:input.definition.definitionVersion,owner:input.ccd.owner,namespace:input.ccd.namespace,images:input.ccd.images});
 const registry=validatePersonalNativeFinalization(binding),runtime=personalJson(binding.directory,'baseline/runtime-identity.json'),manifest=personalJson(binding.directory,'baseline/manifest.json');
 assert.deepEqual(manifest,{...binding.manifest,runtimeMetadata:{...binding.manifest.runtimeMetadata,candidateAuthorityIsolation:'separate-container-no-evidence-mount',candidateRuntimeNodeVersion:cohort.artifact.provenance.runtimeNodeVersion,candidateObservedImageId:cohort.nativeRuntime.imageId}},fail);
 const expectedArchitecture={'linux/arm64':'arm64','linux/amd64':'x64'}[cohort.artifact.provenance.platform];
 assert(expectedArchitecture,fail);
 assert.deepEqual(runtime.identity,binding.manifest.identity,fail);assert.equal(runtime.payloadDigest,cohort.artifact.payloadDigest,fail);assert.equal(runtime.observedImageId,cohort.nativeRuntime.imageId,fail);assert.equal(runtime.candidateContainerId,registry.find(r=>r.service==='candidate').id,fail);assert.equal(runtime.runtime.nodeVersion,cohort.artifact.provenance.runtimeNodeVersion,fail);assert.equal(runtime.runtime.platform,'linux',fail);assert.equal(runtime.runtime.architecture,expectedArchitecture,fail);assert(/^ID=debian$/m.test(runtime.runtime.osRelease)&&/^VERSION_CODENAME=bookworm$/m.test(runtime.runtime.osRelease),fail);return result;
}
export function readPersonalCohort(directory,expected) {
 const root=personalJson(directory,'parent-input.json');
 assert.deepEqual(root.producer.files.map(([name])=>name),CALLBACK_UI_SOURCES,fail);assert.equal(root.producer.digest,personalDigest(root.producer.files),fail);assert.equal(personalFile(directory,'parent-input.json').digest,expected.inputDigest,fail);assert.equal(personalDigest(root),expected.bindingDigest,fail);assert.equal(root.policyDigest,personalPolicyDigest(),fail);
 assert.deepEqual(root.noCredit,PERSONAL_NO_CREDIT,fail);assert.equal(root.runId,expected.runId,fail);assert.deepEqual(root.producer,expected.producer,fail);assert.deepEqual(root.artifact,expected.artifact,fail);
 assert.deepEqual(Object.keys(expected.invocations).sort(),['baseline','optional'],fail);const owners=new Set(),ids=new Set();let apiContracts;
 for(const variant of PERSONAL_SERVICE_VARIANTS){
 const held=expected.invocations[variant],record=personalJson(directory,variant+'-expected.json');assert.equal(personalFile(directory,variant+'-expected.json').digest,held.bindingDigest,fail);assert.deepEqual(record.cohort,root,fail);const binding=record.binding;
 assert.equal(binding.variant,variant,fail);if(apiContracts)assert.deepEqual(binding.apiContracts,apiContracts,fail);else apiContracts=binding.apiContracts;assert.equal(binding.directory,path.join(directory,variant),fail);
 const launch=personalJson(directory,variant+'-launch.json');assert.equal(personalFile(directory,variant+'-launch.json').digest,held.launchDigest,fail);assert.equal(launch.runId,binding.runId,fail);assert.equal(launch.bindingDigest,held.bindingDigest,fail);
 const command=launch.command;assert.equal(command.script,path.join(command.cwd,'scripts/run-harness-personal-service-invocation.mjs'),fail);assert.equal(path.basename(command.executable),'node',fail);assert(path.isAbsolute(command.cwd)&&path.isAbsolute(command.executable),fail);assert.deepEqual(command.args,['--expected',path.join(directory,variant+'-expected.json'),'--digest',held.bindingDigest],fail);assert.deepEqual(command.environmentKeys,['HOME','PATH','TMPDIR'],fail);
 assert.deepEqual(personalJson(directory,variant+'-terminal.json'),held.observedTerminal,fail);
 for(const owner of [binding.runId,binding.ccd.owner]){assert(!owners.has(owner),fail);owners.add(owner);}for(const id of Object.values(binding.ccd.containers)){assert(!ids.has(id),fail);ids.add(id);}
 const completion=personalJson(directory,variant+'-completion.json');assert.equal(personalFile(directory,variant+'-completion.json').digest,held.completionDigest,fail);assert.deepEqual(completion.childTerminal,held.observedTerminal,fail);
 validatePersonalInvocation(binding,root,completion);
 const removal=personalJson(directory,variant+'-removal.json');assert.equal(personalFile(directory,variant+'-removal.json').digest,held.removalDigest,fail);
 const registry=personalJson(binding.directory,'owned-resources.json');const names=[...Object.keys(binding.ccd.containers).map(s=>binding.ccd.owner+'-'+s),...registry.map(r=>r.name)];const cids=[...Object.values(binding.ccd.containers),...registry.map(r=>r.id)];
 assert.deepEqual(removal,{schemaVersion:1,runId:binding.runId,bindingDigest:personalDigest(binding),afterObservedTerminal:true,names,cids,containersAbsent:true,privateWorkspace:binding.privateWorkspace,privateWorkspaceAbsent:true},fail);assert(!fs.existsSync(binding.privateWorkspace),fail);
 }
 return {schemaVersion:1,status:'fresh-cohort-ready-for-independent-review',obligationId:PERSONAL_SERVICE_ID,runId:root.runId,producerCommit:root.producer.commit,baselineProofs:1,effectiveFaults:1,...PERSONAL_NO_CREDIT};
}
export function personalChildCommand(expectedFile,expectedDigest) {
 assert(path.isAbsolute(expectedFile)&&/^(baseline|optional)-expected\.json$/.test(path.basename(expectedFile))&&/^sha256:[a-f0-9]{64}$/.test(expectedDigest),fail);
 return {executable:process.execPath,cwd:PERSONAL_ROOT,script:path.join(PERSONAL_ROOT,'scripts/run-harness-personal-service-invocation.mjs'),args:['--expected',expectedFile,'--digest',expectedDigest],environmentKeys:['HOME','PATH','TMPDIR']};
}
