import {CALLBACK_UI_SOURCES} from '../run-harness-recipient-callback-ui.mjs';
import {readMandatoryEmailRunContext} from './exui-mandatory-email-event-contract.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {personalFile,personalFiles,personalJson,personalDigest,personalProducer,personalPlan,capturePersonalCcdInspection,validatePersonalNativeFinalization} from './exui-personal-service-invocation-binding.mjs';
import {deriveMandatoryEmailEventRows,MANDATORY_EMAIL_EVENT_VARIANTS} from './exui-mandatory-email-event-rows.mjs';
import {validateMandatoryEmailEventDerivation,validateMandatoryEmailEventDates} from './exui-mandatory-email-event-validation.mjs';
import {validateMandatoryEmailDescriptors} from './exui-mandatory-email-event-facets.mjs';
import {captureMandatoryEmailPrepared,mandatoryEmailRawFiles,readMandatoryEmailEvidence} from './exui-mandatory-email-event-evidence.mjs';
import {nativeIdentity} from './exui-native-contract.mjs';
import {candidateArchiveProcess} from './exui-oci-runtime.mjs';
import {inspectHostContainer} from './exui-host-invocation.mjs';
import {canonicalRecipientCallbackPages} from './exui-recipient-callback-fixture.mjs';
import {browserExecutable} from './exui-oci-runtime.mjs';
export const MANDATORY_EMAIL_ROOT=fileURLToPath(new URL('../../',import.meta.url)).replace(/\/$/,'');
export const MANDATORY_EMAIL_NO_CREDIT=Object.freeze({sourceComplete:false,nativeRuntimeAcceptance:false,catalogueCredit:false,releaseCredit:false});
export const mandatoryEmailProducer=personalProducer;
export const mandatoryEmailDigest=personalDigest;
export {personalFile as mandatoryEmailFile,personalJson as mandatoryEmailJson};
export function mandatoryEmailChildCommand(expectedFile,expectedDigest){
  assert(path.isAbsolute(expectedFile)&&path.resolve(expectedFile)===expectedFile&&/^(baseline|name-optional|address-optional)-expected\.json$/.test(path.basename(expectedFile))&&/^sha256:[a-f0-9]{64}$/.test(expectedDigest),'MANDATORY_EMAIL_CHILD_ARGUMENT');
  return{executable:process.execPath,cwd:MANDATORY_EMAIL_ROOT,script:path.join(MANDATORY_EMAIL_ROOT,'scripts/run-harness-mandatory-email-event-invocation.mjs'),args:['--expected',expectedFile,'--digest',expectedDigest],environmentKeys:['HOME','PATH','TMPDIR']};
}
export function validateMandatoryEmailCreation(packet,cohort,directory,variant,{inspect=inspectHostContainer}={}){
  assert(MANDATORY_EMAIL_EVENT_VARIANTS.includes(variant),'MANDATORY_EMAIL_CREATION_VARIANT');
  const {runId,ccd}=packet;
  assert(/^ccd-[a-f0-9-]{36}$/.test(runId),'MANDATORY_EMAIL_CREATION_RUN');
  assert.deepEqual(Object.keys(packet).sort(),['schemaVersion','kind','runId','variant','runtimeDirectory','ccd','nativeNames'].sort(),'MANDATORY_EMAIL_CREATION_SCHEMA');
  assert.deepEqual([packet.schemaVersion,packet.kind,packet.variant,packet.runtimeDirectory],[1,'mandatory-email-creation-intent',variant,path.join(directory,'runtime')],'MANDATORY_EMAIL_CREATION_CONTEXT');
  assert.deepEqual(Object.keys(ccd).sort(),['schemaVersion','kind','owner','output','platform','resources'].sort(),'MANDATORY_EMAIL_CREATION_SCHEMA');
  assert(/^harness-[a-f0-9]{16}$/.test(ccd.owner),'MANDATORY_EMAIL_CREATION_OWNER');
  assert.deepEqual([ccd.schemaVersion,ccd.kind,ccd.output,ccd.platform],[1,'ccd-before-create',packet.runtimeDirectory,cohort.artifact.provenance.platform],'MANDATORY_EMAIL_CREATION_RUNTIME');
  assert.deepEqual(ccd.resources,Object.fromEntries(Object.entries(cohort.ccdImages).map(([service,image])=>[service,{name:ccd.owner+'-'+service,image:image.id}])),'MANDATORY_EMAIL_CREATION_IMAGES');
  assert.deepEqual(packet.nativeNames,[runId+'-baseline-candidate',runId+'-baseline-tools'],'MANDATORY_EMAIL_CREATION_NAMES');
  for(const name of [...Object.values(ccd.resources).map(r=>r.name),...packet.nativeNames])assert.equal(inspect(name),null,'MANDATORY_EMAIL_CREATION_NOT_FRESH');
  return structuredClone(packet);
}
const extraPrepared=['runtime/recipient-callback-import/runtime-verification.json','runtime/recovery.json','runtime/creation-attempts.json'];
export function captureMandatoryEmailBinding(prepared,cohort,creation,{inspect=inspectHostContainer}={}){
  readMandatoryEmailRunContext(cohort);
  const p=structuredClone(prepared),{input,handoff,privateWorkspace}=p,directory=handoff.output;
  for(const name of [...mandatoryEmailRawFiles(input.variant).filter(name=>name.startsWith('baseline/')),'owned-resources.json','baseline/manifest.json','baseline/runtime-identity.json'])assert(!fs.existsSync(path.join(directory,name)),'MANDATORY_EMAIL_PROOF_STARTED_BEFORE_HOLD');
  assert.equal(input.variant,creation.variant,'MANDATORY_EMAIL_PREPARED_VARIANT');
  assert.equal(input.kind,'mandatory-email-event-ui-feasibility','MANDATORY_EMAIL_PREPARED_KIND');assert.equal(input.scenario,'mandatory-email-event','MANDATORY_EMAIL_PREPARED_KIND');
  assert.equal(input.runId,creation.runId,'MANDATORY_EMAIL_PREPARED_RUN');assert.equal(input.releaseScopeId,'exui-ccd-event-capability-pilot','MANDATORY_EMAIL_PREPARED_SCOPE');
  assert.deepEqual(input,personalJson(directory,'input.json'),'MANDATORY_EMAIL_PREPARED_INPUT');
  assert.deepEqual(input.mandatoryEmailEventBinding,deriveMandatoryEmailEventRows(input.variant).binding,'MANDATORY_EMAIL_PREPARED_SOURCE');
  for(const [key,want]of Object.entries({artifact:cohort.artifact,browserRoot:cohort.browser.root,browserDigest:cohort.browser.digest,harnessDependencies:cohort.dependencies,nativeRuntime:cohort.nativeRuntime,browserRuntimeImage:cohort.browser.image,harnessSources:cohort.producer.files.map(([name])=>name),harnessSourceDigest:cohort.producer.digest}))assert.deepEqual(input[key],want,'MANDATORY_EMAIL_PREPARED_IMMUTABLE');
  assert.equal(input.ccd.owner,creation.ccd.owner,'MANDATORY_EMAIL_PREPARED_OWNER');assert.equal(input.ccd.output,creation.ccd.output,'MANDATORY_EMAIL_PREPARED_DIRECTORY');assert.deepEqual(input.ccd.images,cohort.ccdImages,'MANDATORY_EMAIL_PREPARED_IMAGES');
  assert.equal(input.ccd.ready,true,'MANDATORY_EMAIL_PREPARED_READY');assert.equal(input.ccd.elasticsearch??false,false,'MANDATORY_EMAIL_PREPARED_PROFILE');assert.equal(input.ccd.localCcdProfile,undefined,'MANDATORY_EMAIL_PREPARED_PROFILE');
  assert.equal(handoff.output,path.dirname(creation.runtimeDirectory),'MANDATORY_EMAIL_PREPARED_DIRECTORY');
  assert.equal(path.dirname(privateWorkspace),fs.realpathSync(os.tmpdir()),'MANDATORY_EMAIL_PREPARED_WORKSPACE');assert(/^exui-callback-native-[A-Za-z0-9]+$/.test(path.basename(privateWorkspace)),'MANDATORY_EMAIL_PREPARED_WORKSPACE');
  assert.deepEqual(handoff,{output:directory,stagedHarness:path.join(privateWorkspace,'sources'),stateRoot:path.join(privateWorkspace,'state')},'MANDATORY_EMAIL_PREPARED_HANDOFF');
  assert.deepEqual(p.plan,JSON.parse(JSON.stringify(personalPlan(input,handoff))),'MANDATORY_EMAIL_PREPARED_PLAN');
  assert.deepEqual([p.plan.candidate.name,p.plan.tools.name],creation.nativeNames,'MANDATORY_EMAIL_PREPARED_NAMES');
  for(const name of creation.nativeNames)assert.equal(inspect(name),null,'MANDATORY_EMAIL_PREPARED_NOT_FRESH');
  assert.deepEqual(captureMandatoryEmailPrepared(directory),p.held,'MANDATORY_EMAIL_PREPARED_FILES');
  assert.deepEqual(p.imported,personalJson(directory,'runtime/recipient-callback-import/receipt.json'),'MANDATORY_EMAIL_PREPARED_IMPORT');
  const derivative=deriveMandatoryEmailEventRows(input.variant);validateMandatoryEmailEventDerivation(derivative,input.variant);
  assert.deepEqual(personalJson(directory,'fixture/definition.json'),derivative.fixture,'MANDATORY_EMAIL_PREPROOF_DERIVATION');
  assert.deepEqual(p.imported.seal.mandatoryEmailEventBinding,derivative.binding,'MANDATORY_EMAIL_PREPROOF_SOURCE');
  assert.equal(p.imported.observations.import.status,201,'MANDATORY_EMAIL_PREPROOF_IMPORT');
  for(const name of ['definition','pages'])assert.equal(p.imported.observations[name].status,200,'MANDATORY_EMAIL_PREPROOF_DESCRIPTOR');
  assert.equal(personalFile(directory,'fixture/definition.xlsx').digest,p.imported.seal.workbookDigest,'MANDATORY_EMAIL_PREPROOF_WORKBOOK');
  assert.deepEqual(input.definition,{fixtureDigest:p.imported.seal.definitionDigest,observedDefinitionDigest:personalDigest(p.imported.observations.definition.body),definitionVersion:p.imported.observations.definition.body.version.number},'MANDATORY_EMAIL_PREPROOF_DEFINITION');
  assert.deepEqual(input.callbackObservedDigests,{definition:personalDigest(p.imported.observations.definition.body),pages:personalDigest(canonicalRecipientCallbackPages(p.imported.observations.pages.body))},'MANDATORY_EMAIL_PREPROOF_DESCRIPTOR_DIGESTS');
  const facets=validateMandatoryEmailDescriptors(p.imported.observations.definition.body,p.imported.observations.pages.body,derivative);
  assert.deepEqual(facets,input.mandatoryEmailEventFacets.descriptor,'MANDATORY_EMAIL_PREPROOF_FACETS');
  const date=personalJson(directory,'runtime/recipient-callback-import/mandatory-email-stored-dates.json');validateMandatoryEmailEventDates(date.rows,input.definition.definitionVersion);
  assert.deepEqual(date,input.mandatoryEmailEventFacets.date,'MANDATORY_EMAIL_PREPROOF_DATES');
  assert.deepEqual([date.owner,date.namespace,date.images],[input.ccd.owner,input.ccd.namespace,input.ccd.images],'MANDATORY_EMAIL_PREPROOF_DATE_OWNER');
  const chromium=JSON.parse(fs.readFileSync(path.join(MANDATORY_EMAIL_ROOT,'node_modules/playwright-core/browsers.json'),'utf8')).browsers.find(item=>item.name==='chromium-headless-shell');
  assert.equal(input.browserExecutable,'/browser/'+browserExecutable({browsers:[chromium]},cohort.artifact.provenance.platform),'MANDATORY_EMAIL_PREPROOF_BROWSER_PATH');
  assert.equal(input.gatewayDigest,cohort.producer.files.find(([name])=>name==='scripts/lib/exui-ccd-browser-runtime.mjs')?.[1],'MANDATORY_EMAIL_PREPROOF_GATEWAY_SOURCE');
  const identity=nativeIdentity(input,{invocationId:'baseline',mutation:null},cohort.artifact.candidateRoot).identity;
  assert.deepEqual(p.manifest,{schemaVersion:1,kind:'mandatory-email-event-ui-feasibility',identity,runId:input.runId,variant:input.variant,catalogueCredit:false,releaseCredit:false,runtimeMetadata:{rowFacetDigest:personalDigest(input.mandatoryEmailEventFacets),callbackImportDigest:personalFile(directory,'runtime/recipient-callback-import/receipt.json').digest,harnessSourceDigest:cohort.producer.digest,browserDigest:cohort.browser.digest}},'MANDATORY_EMAIL_PREPROOF_MANIFEST');
  for(const [name,digest]of cohort.producer.files)assert.equal(personalFile(handoff.stagedHarness,name).digest,digest,'MANDATORY_EMAIL_STAGED_SOURCE');
  const ccdInspection=capturePersonalCcdInspection(input.ccd,inspect);
  const candidateProcess=candidateArchiveProcess(nativeIdentity(input,{invocationId:'baseline',mutation:null},cohort.artifact.candidateRoot).config,input.releaseScopeId);
  return{schemaVersion:1,kind:'mandatory-email-parent-held-invocation',cohortDigest:personalDigest(cohort),variant:input.variant,runId:input.runId,directory,privateWorkspace,handoff,plan:p.plan,manifest:p.manifest,candidateProcess,ccd:input.ccd,ccdInspection,creation:structuredClone(creation),inputDigest:personalFile(directory,'input.json').digest,files:{...p.held,...personalFiles(directory,extraPrepared)},noCredit:MANDATORY_EMAIL_NO_CREDIT};
}
export function replayMandatoryEmailInvocation(binding,cohort,childTerminal,expectedDigest){
  readMandatoryEmailRunContext(cohort);
  assert.deepEqual(childTerminal,{started:true,observed:true,closed:true,forced:false,cancelled:false,code:0,signal:null,protocolComplete:true},'MANDATORY_EMAIL_CHILD_TERMINAL');
  assert.equal(binding.cohortDigest,personalDigest(cohort),'MANDATORY_EMAIL_COHORT_DRIFT');
  assert.deepEqual(binding.noCredit,MANDATORY_EMAIL_NO_CREDIT,'MANDATORY_EMAIL_NO_CREDIT');
  assert.deepEqual(personalFiles(binding.directory,Object.keys(binding.files)),binding.files,'MANDATORY_EMAIL_PREPROOF_DRIFT');
  const input=personalJson(binding.directory,'input.json');assert.equal(personalFile(binding.directory,'input.json').digest,binding.inputDigest,'MANDATORY_EMAIL_INPUT_DRIFT');
  assert.deepEqual(input.artifact,cohort.artifact,'MANDATORY_EMAIL_CANDIDATE_DRIFT');assert.deepEqual(input.ccd,binding.ccd,'MANDATORY_EMAIL_CCD_DRIFT');
  const registry=validatePersonalNativeFinalization(binding);
  assert.deepEqual(personalJson(binding.directory,'baseline/manifest.json'),{...binding.manifest,runtimeMetadata:{...binding.manifest.runtimeMetadata,candidateAuthorityIsolation:'separate-container-no-evidence-mount',candidateRuntimeNodeVersion:cohort.artifact.provenance.runtimeNodeVersion,candidateObservedImageId:cohort.nativeRuntime.imageId}},'MANDATORY_EMAIL_FINAL_MANIFEST');
  const runtime=personalJson(binding.directory,'baseline/runtime-identity.json');assert.deepEqual(runtime.identity,binding.manifest.identity,'MANDATORY_EMAIL_RUNTIME_IDENTITY');assert.equal(runtime.payloadDigest,cohort.artifact.payloadDigest,'MANDATORY_EMAIL_RUNTIME_PAYLOAD');assert.equal(runtime.observedImageId,cohort.nativeRuntime.imageId,'MANDATORY_EMAIL_RUNTIME_IMAGE');assert.equal(runtime.runtime.nodeVersion,cohort.artifact.provenance.runtimeNodeVersion,'MANDATORY_EMAIL_RUNTIME_NODE');assert.equal(runtime.candidateContainerId,registry.find(r=>r.service==='candidate').id,'MANDATORY_EMAIL_RUNTIME_CID');
  assert.equal(runtime.runtime.platform,'linux','MANDATORY_EMAIL_RUNTIME_PLATFORM');assert.equal(runtime.runtime.architecture,{'linux/arm64':'arm64','linux/amd64':'x64'}[cohort.artifact.provenance.platform],'MANDATORY_EMAIL_RUNTIME_ARCH');assert(/^ID=debian$/m.test(runtime.runtime.osRelease)&&/^VERSION_CODENAME=bookworm$/m.test(runtime.runtime.osRelease),'MANDATORY_EMAIL_RUNTIME_OS');
  const framework=personalJson(binding.directory,'baseline/framework-terminal.json');
  const result=readMandatoryEmailEvidence(binding.directory,{variant:binding.variant,derivation:deriveMandatoryEmailEventRows(binding.variant),actorId:input.credentials.courtadmin.userId,owner:binding.ccd.owner,namespace:binding.ccd.namespace,images:binding.ccd.images,definitionVersion:input.definition.definitionVersion,terminal:framework,held:Object.fromEntries(Object.keys(captureMandatoryEmailPrepared(binding.directory)).map(name=>[name,binding.files[name]])),files:personalFiles(binding.directory,mandatoryEmailRawFiles(binding.variant))});
  const receipt=personalJson(binding.directory,'receipt.json');assert.equal(receipt.status,result.status,'MANDATORY_EMAIL_INVOCATION_STATUS');assert.deepEqual([receipt.nativeCleanupComplete,receipt.cleanup?.cleanupComplete,receipt.workspaceCleanupComplete],[true,true,true],'MANDATORY_EMAIL_INVOCATION_CLEANUP');
  assert.deepEqual([receipt.kind,receipt.scenario,receipt.variant,receipt.runnerExitCode],['mandatory-email-event-ui-feasibility','mandatory-email-event',binding.variant,framework.code],'MANDATORY_EMAIL_INVOCATION_RECEIPT');assert.deepEqual([receipt.runtimeAcceptance,receipt.catalogueCredit,receipt.releaseCredit],[false,false,false],'MANDATORY_EMAIL_INVOCATION_CREDIT');
  assert.deepEqual(personalJson(binding.directory,'mandatory-email-child-completion.json'),{schemaVersion:1,kind:'mandatory-email-child-completion',variant:binding.variant,expectedDigest,receiptDigest:personalFile(binding.directory,'receipt.json').digest,frameworkTerminal:framework,cancelled:false,cleanupComplete:true},'MANDATORY_EMAIL_CHILD_COMPLETION');
  const finalFiles=[...new Set([...Object.keys(binding.files),...mandatoryEmailRawFiles(binding.variant),'baseline/candidate-write-denial.json','baseline/candidate-lifecycle.json','baseline/manifest.json','baseline/runtime-identity.json','owned-resources.json','receipt.json','mandatory-email-child-completion.json'])];
  return{result,frameworkTerminal:framework,registry,files:personalFiles(binding.directory,finalFiles)};
}

// Pure post-close replay. Absence authority is the pinned parent observation, never a new Docker query.
export function readMandatoryEmailCohort(directory,held){
 const fail='MANDATORY_EMAIL_COHORT_REPLAY_INVALID';
 const keys=(value,names)=>{assert(value&&typeof value==='object'&&!Array.isArray(value),fail);assert.deepEqual(Object.keys(value).sort(),names.slice().sort(),fail);};
 keys(held,['inputDigest','cohortDigest','receiptDigest','records']);
 const parent=personalFile(directory,'parent-input.json');assert.equal(parent.digest,held.inputDigest,fail);const cohort=JSON.parse(parent.bytes);
 keys(cohort,['schemaVersion','runId','producer','candidateManifest','candidateManifestDigest','artifact','browser','dependencies','nativeRuntime','ccdImages','noCredit',...(Object.hasOwn(cohort,'admissionContext')||Object.hasOwn(cohort,'admissionInput')?['admissionContext','admissionInput']:[])]);
 assert.equal(cohort.schemaVersion,1,fail);assert(/^mandatory-email-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(cohort.runId),fail);assert.equal(personalDigest(cohort),held.cohortDigest,fail);assert.deepEqual(cohort.noCredit,MANDATORY_EMAIL_NO_CREDIT,fail);
 keys(cohort.producer,['commit','files','digest']);assert(/^[a-f0-9]{40}$/.test(cohort.producer.commit),fail);assert.equal(personalDigest(cohort.producer.files),cohort.producer.digest,fail);
 const fileNames=cohort.producer.files.map(([name])=>name);assert.equal(new Set(fileNames).size,fileNames.length,fail);assert.deepEqual(fileNames,CALLBACK_UI_SOURCES,fail);
 for(const[name,digest]of cohort.producer.files)assert.equal(personalFile(MANDATORY_EMAIL_ROOT,name).digest,digest,fail);
 assert.equal(personalFile(path.dirname(cohort.candidateManifest),path.basename(cohort.candidateManifest)).digest,cohort.candidateManifestDigest,fail);
 readMandatoryEmailRunContext(cohort);
 const file=personalFile(directory,'mandatory-email-cohort.json');assert.equal(file.digest,held.receiptDigest,fail);const receipt=JSON.parse(file.bytes);
 keys(receipt,['cohortDigest','inputDigest','schemaVersion','kind','status','records','baselineProofs','effectiveFaults',...Object.keys(MANDATORY_EMAIL_NO_CREDIT)]);
 assert.deepEqual(receipt.records,held.records,fail);assert.deepEqual(receipt.records.map(row=>row.variant),MANDATORY_EMAIL_EVENT_VARIANTS,fail);
 assert.deepEqual({...receipt,records:undefined},{cohortDigest:held.cohortDigest,inputDigest:held.inputDigest,schemaVersion:1,kind:'mandatory-email-three-invocation-cohort',status:'observed-three-invocation-cohort',records:undefined,baselineProofs:2,effectiveFaults:2,...MANDATORY_EMAIL_NO_CREDIT},fail);
 const owners=new Set(),names=new Set(),ids=new Set(),bearers=new Set(),workspaces=[];const snapshots=new Map([['parent-input.json',parent.digest],['mandatory-email-cohort.json',file.digest]]);
 const add=(set,value)=>{assert(typeof value==='string'&&value.length>0&&!set.has(value),fail);set.add(value);};
 const packets=[];
 for(const record of receipt.records){
  const variant=record.variant,folder=path.join(directory,variant);
  keys(record,['variant','baselineProofs','effectiveFaults','files']);assert.deepEqual([record.baselineProofs,record.effectiveFaults],variant==='baseline'?[2,0]:[0,1],fail);
  const fixed=['expected','launch','creation','binding','terminal','completion','absence'].map(kind=>variant+'-'+kind+'.json');keys(record.files,fixed);
  for(const name of fixed){assert.equal(personalFile(directory,name).digest,record.files[name],fail);snapshots.set(name,record.files[name]);}
  const request=personalJson(directory,variant+'-expected.json');keys(request,['schemaVersion','cohort','variant','directory','environment']);assert.equal(request.schemaVersion,1,fail);assert.deepEqual(request.cohort,cohort,fail);assert.equal(request.variant,variant,fail);assert.equal(request.directory,folder,fail);keys(request.environment,['HOME','PATH','TMPDIR']);for(const value of Object.values(request.environment))assert(typeof value==='string'&&value.length>0,fail);
  const launch=personalJson(directory,variant+'-launch.json');keys(launch,['command','environment','requestDigest','source','candidate','browser','dependencies']);assert.deepEqual(launch,{command:mandatoryEmailChildCommand(path.join(directory,variant+'-expected.json'),record.files[variant+'-expected.json']),environment:request.environment,requestDigest:record.files[variant+'-expected.json'],source:cohort.producer,candidate:cohort.artifact,browser:cohort.browser,dependencies:cohort.dependencies},fail);
  const binding=personalJson(directory,variant+'-binding.json'),creation=personalJson(directory,variant+'-creation.json'),terminal=personalJson(directory,variant+'-terminal.json');
  keys(binding,['schemaVersion','kind','cohortDigest','variant','runId','directory','privateWorkspace','handoff','plan','manifest','candidateProcess','ccd','ccdInspection','creation','inputDigest','files','noCredit']);assert.equal(binding.schemaVersion,1,fail);assert.equal(binding.kind,'mandatory-email-parent-held-invocation',fail);keys(binding.files,[...mandatoryEmailRawFiles(variant).filter(name=>!name.startsWith('baseline/')),...extraPrepared]);
  keys(creation,['schemaVersion','kind','runId','variant','runtimeDirectory','ccd','nativeNames']);assert.equal(creation.schemaVersion,1,fail);assert.equal(creation.kind,'mandatory-email-creation-intent',fail);
  assert.equal(binding.variant,variant,fail);assert.equal(binding.directory,folder,fail);assert.equal(binding.ccd.output,path.join(folder,'runtime'),fail);assert.deepEqual(binding.creation,creation,fail);assert.deepEqual(creation.nativeNames,[binding.runId+'-baseline-candidate',binding.runId+'-baseline-tools'],fail);assert.equal(creation.variant,variant,fail);assert.equal(creation.runId,binding.runId,fail);assert.equal(creation.ccd.owner,binding.ccd.owner,fail);
  assert.deepEqual(creation.ccd.resources,Object.fromEntries(Object.entries(cohort.ccdImages).map(([service,image])=>[service,{name:binding.ccd.owner+'-'+service,image:image.id}])),fail);
  assert.equal(path.dirname(binding.privateWorkspace),fs.realpathSync(os.tmpdir()),fail);assert(/^exui-callback-native-[A-Za-z0-9]+$/.test(path.basename(binding.privateWorkspace)),fail);assert.deepEqual(binding.handoff,{output:folder,stagedHarness:path.join(binding.privateWorkspace,'sources'),stateRoot:path.join(binding.privateWorkspace,'state')},fail);assert(!fs.existsSync(binding.privateWorkspace),fail);
  for(const previous of workspaces)assert(previous!==binding.privateWorkspace&&!previous.startsWith(binding.privateWorkspace+path.sep)&&!binding.privateWorkspace.startsWith(previous+path.sep),fail);workspaces.push(binding.privateWorkspace);
  const observed=replayMandatoryEmailInvocation(binding,cohort,terminal,record.files[variant+'-expected.json']);assert.deepEqual(observed,personalJson(directory,variant+'-completion.json'),fail);
  const report=personalJson(folder,'baseline/report.json');assert.equal(report.config?.workers,1,'MANDATORY_EMAIL_CONFIGURED_WORKERS');
  const input=personalJson(folder,'input.json');assert.deepEqual(input.harnessSources,fileNames,fail);assert.equal(input.harnessSourceDigest,cohort.producer.digest,fail);
  assert.deepEqual(Object.keys(input.credentials).sort(),['allowed','courtadmin','judge','observer','readonly'],fail);const actorIds=new Set();
  for(const actor of Object.values(input.credentials)){assert(/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(actor.userId),fail);add(actorIds,actor.userId);assert(/^Bearer \S+$/.test(actor.headers?.Authorization??''),fail);add(bearers,actor.headers.Authorization);}
  const attempts=personalJson(folder,'runtime/creation-attempts.json');assert(Array.isArray(attempts),fail);assert.deepEqual(attempts.map(row=>row.service).sort(),Object.keys(binding.ccd.containers).sort(),fail);for(const row of attempts){assert.equal(row.state,'settled',fail);assert.equal(row.name,binding.ccd.owner+'-'+row.service,fail);assert.equal(row.containerId,binding.ccd.containers[row.service],fail);}
  add(owners,binding.runId);add(owners,binding.ccd.owner);const ccdNames=Object.keys(binding.ccd.containers).map(service=>binding.ccd.owner+'-'+service),nativeNames=[binding.plan.candidate.name,binding.plan.tools.name],cids=[...Object.values(binding.ccd.containers),...observed.registry.map(row=>row.id)];
  for(const name of [...ccdNames,...nativeNames])add(names,name);for(const id of cids){assert(/^[a-f0-9]{64}$/.test(id),fail);add(ids,id);}
  assert.deepEqual(personalJson(directory,variant+'-absence.json'),{names:[...ccdNames,...nativeNames],cids,privateWorkspace:binding.privateWorkspace,afterObservedClose:true,containersAbsent:true,privateWorkspaceAbsent:true},fail);
  for(const[name,digest]of Object.entries(observed.files))snapshots.set(variant+'/'+name,digest);
  packets.push({variant,binding,completion:observed,input});
 }
 // Re-read the parent and all sealed variant bytes after every raw replay has finished.
 for(const[name,digest]of snapshots)assert.equal(personalFile(directory,name).digest,digest,'MANDATORY_EMAIL_LATE_REPLAY_DRIFT');
 readMandatoryEmailRunContext(cohort);assert.deepEqual(personalJson(directory,'parent-input.json'),cohort,fail);assert.deepEqual(personalJson(directory,'mandatory-email-cohort.json'),receipt,fail);
 return{cohort,receipt,packets};
}
