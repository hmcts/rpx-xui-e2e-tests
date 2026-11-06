#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {isDeepStrictEqual} from 'node:util';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {verifyCandidateArtifact,digestCandidateTree} from './lib/exui-candidate-artifact.mjs';
import {verifyHarnessDependencies} from './lib/exui-harness-dependencies.mjs';
import {assertCandidateConfigurationSources} from './lib/exui-configuration-catalogue.mjs';
import {nativeContainerPlan,inspectNativeApiRuntime,inspectNativeBrowserRuntime} from './lib/exui-native-containers.mjs';
import {nativeIdentity} from './lib/exui-native-contract.mjs';
import {runHostInvocation,removeHostResource} from './lib/exui-host-invocation.mjs';
import {startCcdRuntime,docker,ccdCredentials,ccdRequest,verifyCcdContainerIdentity} from './lib/exui-ccd-runtime.mjs';
import {cleanupCiCcd} from './lib/exui-candidate-ci-process.mjs';
import {prepareRecipientCallbackImport,importRecipientCallback,validateObservedRecipientCallback} from './lib/exui-recipient-callback-import.mjs';
import {NATIVE_HARNESS_SOURCE_FILES} from './lib/exui-native-sources.mjs';
import {digestBytes,writeJsonAtomic} from './lib/exui-evidence-io.mjs';
import {validateCallbackRowDescriptors,readCallbackStoredDate} from './lib/exui-recipient-callback-facets.mjs';
import {canonicalRecipientCallbackPages} from './lib/exui-recipient-callback-fixture.mjs';
import {createFreshHarnessRuntimeOutput} from './lib/exui-output-boundary.mjs';
import {callbackFailureCode} from './lib/exui-recipient-callback-diagnostics.mjs';
import {SELECTOR_EVENT_VARIANTS} from './lib/exui-selector-event-row-contract.mjs';
import {validateSelectorRowDescriptors,readSelectorStoredDate,assertSelectorUiOutcome} from './lib/exui-selector-event-row-facets.mjs';
import {classifyNativeFailure} from './lib/exui-native-failure-diagnostics.mjs';
import {prepareComplexEmailImport,importComplexEmail,validateComplexEmailDefinition} from './lib/exui-complex-email-import.mjs';
import {readComplexEmailStoredClassification} from './lib/exui-complex-email-classification.mjs';
import {browserExecutable} from './lib/exui-oci-runtime.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
export const CALLBACK_UI_SOURCES=Object.freeze([...new Set([...NATIVE_HARNESS_SOURCE_FILES,'scripts/lib/exui-recipient-callback-facets.mjs','scripts/run-harness-recipient-callback-ui.mjs','scripts/lib/exui-recipient-callback-import.mjs','src/fixtures/harnessCallback.ts','playwright.callback-feasibility.config.mjs','scripts/recipient-callback-ui-tools.mjs','src/tests/harness/callback-feasibility/recipient-callback.spec.ts','src/tests/harness/callback-feasibility/selector-event-row.spec.ts','src/fixtures/harnessSelectorEventRow.ts','scripts/lib/exui-selector-event-row-contract.mjs','scripts/lib/exui-selector-event-row-facets.mjs','scripts/lib/exui-personal-service-contract.mjs','scripts/lib/exui-personal-service-facets.mjs','scripts/lib/exui-personal-service-evidence.mjs','scripts/fixtures/ccd/personal-service.source.json','src/fixtures/harnessPersonalService.ts','src/tests/harness/callback-feasibility/personal-service.spec.ts','scripts/run-harness-personal-service-cohort.mjs','scripts/run-harness-personal-service-invocation.mjs','scripts/lib/exui-personal-service-invocation-binding.mjs','scripts/lib/exui-feasibility-gateway.mjs','scripts/lib/exui-complex-email-classification.mjs','scripts/lib/exui-complex-email-transport.mjs','scripts/lib/exui-complex-email-text.mjs','scripts/lib/exui-complex-email-import.mjs','src/fixtures/harnessComplexEmail.ts','src/tests/harness/callback-feasibility/complex-email-text.spec.ts'])]);
export function callbackUiFailureCode(error) {
 const known=new Set(['CALLBACK_UI_BROWSER_ASSERTION_FAILED','OWNED_OCI_CONTAINER_REQUIRED','OCI_READONLY_MOUNT_WRITABLE_ALIAS','NATIVE_CANDIDATE_PLATFORM_MISMATCH','NATIVE_SEALED_NODE_VERSION_REQUIRED','PINNED_BROWSER_RUNTIME_REQUIRED','OWNED_TOOLS_NAMESPACE_REQUIRED','UNSUPPORTED_OCI_INVOCATION','CALLBACK_UI_TOOLS_ENTRYPOINT','CALLBACK_UI_CANCELLED','CALLBACK_UI_VARIANT','CALLBACK_UI_FRESH_OUTPUT','CALLBACK_UI_IMPORT_RECEIPT_MISMATCH','CALLBACK_UI_IMPORT_IDENTITY_MISMATCH','CALLBACK_UI_IMPORT_STATUS','CALLBACK_UI_IMPORT_READBACK_FAILED','CALLBACK_UI_IMPORT_DRIFT','HOST_INVOCATION_CANCELLED','HOST_NAMESPACE_EGRESS_AVAILABLE','HOST_CANDIDATE_RUNTIME_OS','HOST_CANDIDATE_RUNTIME_ARCH','HOST_CANDIDATE_SEALED_NODE_VERSION','HOST_PROVIDER_SHUTDOWN_FAILED','HOST_UNDECLARED_DESTINATION','HOST_FRAMEWORK_TERMINATION_MISMATCH','CCD_RUNTIME_OWNER_MISMATCH','CCD_RUNTIME_NAMESPACE_MISMATCH']);
 const first=typeof error?.message==='string'?error.message.split('\n',1)[0]:'';
 if(known.has(first))return first;
 const callback=callbackFailureCode(error);if(callback!=='CALLBACK_PROBE_UNCLASSIFIED_FAILURE')return callback;
 if(error?.code==='ENOENT')return 'CALLBACK_UI_REQUIRED_FILE_MISSING';
 if(error?.code==='EACCES')return 'CALLBACK_UI_FILE_PERMISSION';
 return 'CALLBACK_UI_PHASE_FAILED';
}
export function verifyCallbackUiRuntime(state, imported, {request=ccdRequest, inspect=verifyCcdContainerIdentity,writeReceipt=true}={}) {
 assert.equal(typeof writeReceipt,'boolean','CALLBACK_UI_VERIFICATION_WRITE_MODE');
 inspect(state);
 // The callback derivative has its own sealed receipt; never read baseline definition-import.json.
 const retained=read(path.join(state.output,'recipient-callback-import/receipt.json'));
 assert.deepEqual(retained,imported,'CALLBACK_UI_IMPORT_RECEIPT_MISMATCH');
 assert.equal(imported.status,'import-and-callback-descriptor-observed','CALLBACK_UI_IMPORT_STATUS');
 assert.equal(imported.kind,'recipient-callback-import-feasibility','CALLBACK_UI_IMPORT_STATUS');
 assert.deepEqual([imported.owner,imported.namespace,imported.images],[state.owner,state.namespace,state.images],'CALLBACK_UI_IMPORT_IDENTITY_MISMATCH');
 assert.deepEqual([imported.runtimeAcceptance,imported.catalogueCredit,imported.releaseCredit],[false,false,false],'CALLBACK_UI_IMPORT_STATUS');
 const observer=ccdCredentials(state,'observer',{request});const observed={};
 const verification={kind:'recipient-callback-runtime-verification',status:'in-progress',runtimeAcceptance:false,catalogueCredit:false,observations:{}};
 const verificationPath=path.join(state.output,'recipient-callback-import/runtime-verification.json');
 const saveVerification=()=>{if(writeReceipt)fs.writeFileSync(verificationPath,JSON.stringify(verification,null,2)+'\n',{mode:0o600});};
 for(const [name,route] of [['definition','/api/data/case-type/HarnessNestedPRL'],['pages','/api/display/wizard-page-structure/case-types/HarnessNestedPRL/event-triggers/serviceOfDocuments']]){
  const response=request(state,4451,route,{headers:observer.headers});verification.observations[name]=response;saveVerification();
  if(response.status!==200){verification.status='readback-failed';verification.failedDescriptor=name;saveVerification();throw Error('CALLBACK_UI_IMPORT_READBACK_FAILED');}
  const current=name==='pages'?canonicalRecipientCallbackPages(response.body):response.body,expected=name==='pages'?canonicalRecipientCallbackPages(imported.observations[name].body):imported.observations[name].body;
  if(!isDeepStrictEqual(current,expected)){verification.status='descriptor-drift';verification.failedDescriptor=name;saveVerification();throw Error('CALLBACK_UI_IMPORT_DRIFT');}
  observed[name]=current;
 }
 validateObservedRecipientCallback(observed.definition,observed.pages,imported.seal.binding,imported.seal.variant??'baseline');
 verification.status='verified';saveVerification();
 return Object.fromEntries(Object.entries(observed).map(([name,body])=>[name,digestBytes(JSON.stringify(body))]));
}
export function assertCallbackUiOutcome(variant, terminal, observed, report) {
 assert.equal(observed.catalogueCredit,false);assert.equal(report.errors?.length??0,0);
 const specs=[];const visit=suite=>{specs.push(...(suite.specs??[]));for(const child of suite.suites??[])visit(child);};for(const suite of report.suites??[])visit(suite);
 assert.equal(specs.length,1);const tests=specs[0].tests;assert.equal(tests.length,1);assert.equal(tests[0].results.length,1);const result=tests[0].results[0];
 assert.equal(terminal.signal,null);assert.equal(report.stats.skipped,0);
 if(variant==='baseline'){assert.equal(observed.completed,true);assert.equal(terminal.code,0);assert.equal(result.status,'passed');assert.equal(report.stats.expected,1);assert.equal(report.stats.unexpected,0);return 'candidate-ui-feasibility-observed';}
 assert.equal(variant,'binding-omitted');assert.equal(terminal.code,1);assert.equal(result.status,'failed');assert.equal(report.stats.unexpected,1);assert.equal(observed.faultEffective,true);assert.equal(observed.witness,'valid-CYA-without-callback');assert(result.error?.message?.includes('CALLBACK_BINDING_OMISSION_DETECTED'));return 'callback-binding-omission-detected';
}
export function assertComplexEmailUiOutcome(variant,terminal,observed,report) {
 assert(['baseline','email-type'].includes(variant),'COMPLEX_EMAIL_UI_VARIANT');
 assert.equal(observed.kind,'complex-email-text-observation');assert.equal(observed.variant,variant);
 assert.deepEqual([observed.runtimeAcceptance,observed.catalogueCredit,observed.releaseCredit],[false,false,false]);
 const specs=[];const visit=s=>{specs.push(...(s.specs??[]));for(const child of s.suites??[])visit(child);};for(const suite of report.suites??[])visit(suite);
 assert.equal(report.errors?.length??0,0);assert.equal(specs.length,1);assert.equal(specs[0].tests.length,1);
 const results=specs[0].tests[0].results;assert.equal(results.length,1);assert.equal(results[0].retry,0);assert.equal(terminal.signal,null);
 assert.equal(observed.healthy.status,201);assert.equal(observed.probe.validation.status,variant==='baseline'?200:422);
 assert.equal(report.stats.skipped,0);assert.equal(terminal.code,variant==='baseline'?0:1);
 assert.equal(results[0].status,variant==='baseline'?'passed':'failed');
 if(variant==='email-type')assert(results[0].error?.message?.includes('COMPLEX_EMAIL_SOURCE_TYPE_TIGHTENED'));
 return variant==='baseline'?'complex-email-text-feasibility-observed':'complex-email-type-tightening-observed';
}
export function createCallbackNativeWorkspace() {
 const workspace=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'exui-callback-native-'));fs.chmodSync(workspace,0o700);
 const stagedHarness=workspace+'/sources',stateRoot=workspace+'/state';fs.mkdirSync(stagedHarness,{mode:0o755});fs.mkdirSync(stagedHarness+'/node_modules',{mode:0o755});
 for(const kind of ['sessions','diagnostics']){const directory=stateRoot+'/baseline/'+kind;fs.mkdirSync(directory,{recursive:true,mode:0o777});fs.chmodSync(directory,0o777);}
 return {workspace,stagedHarness,stateRoot};
}
export async function runCallbackUi({candidate,browser,output,variant='baseline',scenario='recipient-callback',preparePersonal=false,signal,personalLifecycle,complexLifecycle}) {
 let cancelled=false;const isCancelled=()=>cancelled||Boolean(signal?.aborted),assertActive=()=>assert(!isCancelled(),'CALLBACK_UI_CANCELLED');assertActive();
 const invocationClock={startedAt:new Date().toISOString(),start:performance.now()};
 assert(['recipient-callback','selector-event-row','personal-service','complex-email-text'].includes(scenario),'CALLBACK_UI_SCENARIO');
 const selector=scenario==='selector-event-row',personal=scenario==='personal-service',complexEmail=scenario==='complex-email-text';
 assert(typeof preparePersonal==='boolean'&&(!preparePersonal||personal),'PERSONAL_SERVICE_PREPARATION_SCOPE');
 assert(personalLifecycle===undefined||preparePersonal&&typeof personalLifecycle.creationStarted==='function'&&typeof personalLifecycle.closed==='function','PERSONAL_SERVICE_LIFECYCLE');
 assert(complexLifecycle===undefined||complexEmail&&['creationStarted','prepared','completed','closed'].every(key=>typeof complexLifecycle[key]==='function'),'COMPLEX_COHORT_LIFECYCLE');
 const personalContract=personal?await import('./lib/exui-personal-service-contract.mjs'):undefined;
 const personalFacets=personal?await import('./lib/exui-personal-service-facets.mjs'):undefined;
 const personalEvidence=personal?await import('./lib/exui-personal-service-evidence.mjs'):undefined;
 assert((complexEmail?['baseline','email-type']:selector?SELECTOR_EVENT_VARIANTS:personal?personalContract.PERSONAL_SERVICE_VARIANTS:['baseline','binding-omitted']).includes(variant),'CALLBACK_UI_VARIANT');assert(path.isAbsolute(output)&&!fs.existsSync(output),'CALLBACK_UI_FRESH_OUTPUT');
 assertActive();const artifact=await verifyCandidateArtifact(path.resolve(candidate));assertActive();const browserRoot=fs.realpathSync(browser);
 output=createFreshHarnessRuntimeOutput(output,root,[artifact.candidateRoot,path.resolve(candidate),browserRoot,path.join(root,'node_modules')]);
 const receipt={kind:complexEmail?'complex-email-text-ui-feasibility':personal?'personal-service-ui-feasibility':selector?'selector-event-row-ui-feasibility':'recipient-callback-ui-feasibility',scenario,variant,status:'in-progress',runtimeAcceptance:false,catalogueCredit:false,releaseCredit:false};
 const save=()=>{writeJsonAtomic(output+'/receipt.json',receipt);fs.chmodSync(output+'/receipt.json',0o600);};save();
 const resources=new Map();const cancel=()=>{cancelled=true;for(const resource of resources.values())if(resource.kind==='process')resource.child?.kill('SIGTERM');};process.once('SIGINT',cancel);process.once('SIGTERM',cancel);signal?.addEventListener('abort',cancel,{once:true});
 let complexPrepared;
 let phase='verify-candidate',privateWorkspace,personalPreexecution,preparedPersonal,creationUncertain=false,successfulStart=false,createAttempted=false,nativeCleanupUncertain=false;const runtime=output+'/runtime';
 try {
  assertActive();const harnessDependencies=await verifyHarnessDependencies(root+'/node_modules',root+'/package.json',root+'/yarn.lock');assertActive();
  assertCandidateConfigurationSources(artifact.candidateRoot,read(root+'/scripts/fixtures/exui-configuration-review.json'));
  const browserDigest=await digestCandidateTree(browserRoot);assertActive();
  if(personal){
   const git=args=>{const r=spawnSync('git',args,{cwd:root,encoding:'utf8'});assert.equal(r.status,0,'PERSONAL_SERVICE_GIT');return r.stdout.trim();};
   assert.equal(git(['status','--porcelain']),'','PERSONAL_SERVICE_CLEAN_PRODUCER_REQUIRED');
   const files=CALLBACK_UI_SOURCES.map(file=>[file,digestBytes(fs.readFileSync(path.join(root,file)))]);
   personalPreexecution={schemaVersion:1,kind:'personal-service-preexecution',capturedBeforeCcd:true,producerCommit:git(['rev-parse','HEAD']),files,harnessSourceDigest:digestBytes(JSON.stringify(files)),candidate:artifact,browser:{root:browserRoot,digest:browserDigest},harnessDependencyDigest:harnessDependencies.digest,variant,catalogueCredit:false,releaseCredit:false};
   writeJsonAtomic(output+'/personal-service-preexecution.json',personalPreexecution);
  }
  assertActive();phase='start-runtime';personalLifecycle?.creationStarted();complexLifecycle?.creationStarted({variant,runtimeDirectory:runtime});
  const ccd=await startCcdRuntime(runtime,{
   fixtureSelection:'event-capability-baseline',platform:artifact.provenance.platform,isCancelled,
   onCreateUncertainty:()=>{creationUncertain=true;},
   runDocker:(args,input)=>{
    assertActive();const creating=args[0]==='create';if(creating)createAttempted=true;
    try{
     const result=docker(args,input);
     if(creating)assert(typeof result==='string'&&/^[a-f0-9]{64}$/.test(result),'CALLBACK_UI_CREATE_CID_REQUIRED');
     return result;
    }catch(error){if(creating)creationUncertain=true;throw error;}
   },
  });successfulStart=true;assertActive();
  let imported,callbackObservedDigests;
  if(complexEmail){
   phase='import-complex-email';assertActive();await prepareComplexEmailImport(output+'/fixture',variant);assertActive();
   imported=await importComplexEmail(ccd,{fixtureDirectory:output+'/fixture',variant});assertActive();
   callbackObservedDigests={definition:digestBytes(JSON.stringify(imported.observations.definition.body))};
   receipt.facets={descriptor:validateComplexEmailDefinition(imported.observations.definition.body,variant),metadata:imported.metadata};
  }else{
  phase='import-callback';const importOptions={variant:(selector||personal)?'binding-omitted':variant,rowFacets:true,...(selector?{selectorEventVariant:variant}:personal?{personalServiceVariant:variant}:{})};assertActive();await prepareRecipientCallbackImport(output+'/fixture',importOptions);assertActive();
  imported=await importRecipientCallback(ccd,{fixtureDirectory:output+'/fixture',...importOptions});assertActive();receipt.import=imported;save();callbackObservedDigests=verifyCallbackUiRuntime(ccd,imported);
  phase='verify-row-facets';receipt.facets=personal?{descriptor:personalFacets.validatePersonalServiceDescriptors(imported.observations.definition.body,imported.observations.pages.body,variant),date:personalFacets.readPersonalServiceDate(ccd,imported.observations.definition.body.version.number)}:selector?{descriptor:validateSelectorRowDescriptors(imported.observations.definition.body,imported.observations.pages.body,variant),date:readSelectorStoredDate(ccd,imported.observations.definition.body.version.number)}:{descriptor:validateCallbackRowDescriptors(imported.observations.definition.body,imported.observations.pages.body),date:readCallbackStoredDate(ccd,imported.observations.definition.body.version.number)};save();
  }
  receipt.import=imported;save();
  assert(!cancelled,'CALLBACK_UI_CANCELLED');
  phase='prepare-actors';const credentials=Object.fromEntries(['allowed','courtadmin','judge','readonly','observer'].map(actor=>[actor,ccdCredentials(ccd,actor)]));
  phase='prepare-api-contracts';const apiContracts=Object.fromEntries([['data',4452],['definition',4451]].map(([name,port])=>{const response=ccdRequest(ccd,port,'/v3/api-docs');assert.equal(response.status,200);return[name,digestBytes(JSON.stringify(response.body))];}));
  const definition={fixtureDigest:imported.seal.definitionDigest,observedDefinitionDigest:digestBytes(JSON.stringify(imported.observations.definition.body)),definitionVersion:imported.observations.definition.body.version.number};
  phase='stage-native-sources';const runId='ccd-'+randomUUID();const {workspace,stagedHarness,stateRoot}=createCallbackNativeWorkspace();privateWorkspace=workspace;receipt.privateWorkspace=workspace;save();
  for(const file of CALLBACK_UI_SOURCES){const source=path.join(root,file);assert.equal(fs.realpathSync(source),source);assert(fs.lstatSync(source).isFile());const target=path.join(stagedHarness,file);fs.mkdirSync(path.dirname(target),{recursive:true,mode:0o755});fs.copyFileSync(source,target);fs.chmodSync(target,0o444);}
  const harnessSourceDigest=digestBytes(JSON.stringify(CALLBACK_UI_SOURCES.map(file=>[file,digestBytes(fs.readFileSync(path.join(stagedHarness,file)))])));
  if(personal)assert.equal(harnessSourceDigest,personalPreexecution.harnessSourceDigest,'PERSONAL_SERVICE_PREEXECUTION_SOURCE_DRIFT');
  const chromium=read(root+'/node_modules/playwright-core/browsers.json').browsers.find(item=>item.name==='chromium-headless-shell');
  phase='inspect-native-images';const input={kind:receipt.kind,scenario,variant,...(complexEmail?{complexEmailBinding:imported.seal.binding,complexEmailFacets:receipt.facets}:{}),...(selector?{selectorEventBinding:imported.seal.selectorEventBinding,selectorFacets:receipt.facets}:personal?{personalServiceBinding:imported.seal.personalServiceBinding,personalServiceFacets:receipt.facets}:{}),runId,artifact,releaseScopeId:'exui-ccd-event-capability-pilot',ccd,credentials,definition,apiContracts,browserRoot,browserDigest,browserExecutable:'/browser/'+browserExecutable({browsers:[chromium]},artifact.provenance.platform),harnessDependencies,harnessSources:CALLBACK_UI_SOURCES,harnessSourceDigest,gatewayDigest:digestBytes(fs.readFileSync(root+'/scripts/lib/exui-ccd-browser-runtime.mjs')),callbackObservedDigests,nativeRuntime:inspectNativeApiRuntime(artifact.provenance.platform),browserRuntimeImage:inspectNativeBrowserRuntime(artifact.provenance.platform)};
  writeJsonAtomic(output+'/input.json',input);fs.chmodSync(output+'/input.json',0o600);
  const heldInputDigest=digestBytes(fs.readFileSync(output+'/input.json'));
  const directory=output+'/baseline';fs.mkdirSync(directory,{mode:0o700});
  phase='plan-native-containers';const handoff={output,stagedHarness,stateRoot};const plan=nativeContainerPlan(input,handoff,'baseline');
  // Reuse only the existing immutable candidate/container transport. No release-policy execution or verdict adapter.
  const toolIndex=plan.tools.args.indexOf('scripts/run-harness-native-tools.mjs');assert(toolIndex>=0,'CALLBACK_UI_TOOLS_ENTRYPOINT');plan.tools.args[toolIndex]='scripts/recipient-callback-ui-tools.mjs';
  plan.proofArguments=['scripts/recipient-callback-ui-tools.mjs','--inside-proof'];
  const {identity}=nativeIdentity(input,{invocationId:'baseline',mutation:null},artifact.candidateRoot);
  const manifest={schemaVersion:1,kind:receipt.kind,identity,runId,variant,catalogueCredit:false,releaseCredit:false,runtimeMetadata:{rowFacetDigest:digestBytes(JSON.stringify(receipt.facets)),callbackImportDigest:digestBytes(fs.readFileSync(runtime+(complexEmail?'/complex-email-import/receipt.json':'/recipient-callback-import/receipt.json'))),harnessSourceDigest,browserDigest}};
  if(complexLifecycle){complexPrepared={input,handoff,plan,manifest,privateWorkspace,ccd,imported,actorId:credentials.allowed.userId};complexLifecycle.prepared(complexPrepared);}
  if(preparePersonal){assertActive();preparedPersonal={input,handoff,plan,manifest,privateWorkspace,preexecution:personalPreexecution};return preparedPersonal;}
  assertActive();phase='execute-candidate';const result=await runHostInvocation({...plan,manifest,payloadDigest:artifact.payloadDigest},{resources,isCancelled});receipt.runnerExitCode=result.terminal.code;
  if(personal)writeJsonAtomic(output+'/personal-service-observed-terminal.json',{runId,terminal:result.terminal});
  phase='evaluate-browser-proof';const report=read(directory+'/report.json');
  assert.equal(result.terminal.code,variant==='baseline'?0:1,'CALLBACK_UI_BROWSER_ASSERTION_FAILED');
  const observed=read(directory+(complexEmail?'/complex-email-text-observation.json':personal?'/personal-service-observation.json':selector?'/selector-event-row-observation.json':'/callback-ui-observation.json'));
  if(complexEmail){phase='verify-generated-classification';receipt.classification=readComplexEmailStoredClassification(ccd,imported,observed);if(complexLifecycle)complexLifecycle.completed({...complexPrepared,execution:result,classification:receipt.classification,observed});}
  if(personal){
   const names=['input.json','baseline/personal-service-observation.json','baseline/ccd-requests.jsonl','baseline/report.json','runtime/recipient-callback-import/receipt.json','runtime/recipient-callback-import/personal-service-stored-row-date.json'];
   const expected={variant,actorId:credentials.courtadmin.userId,terminal:result.terminal,files:Object.fromEntries(names.map(name=>[name,name==='input.json'?heldInputDigest:digestBytes(fs.readFileSync(path.join(output,name)))])),sourceBinding:input.personalServiceBinding,definitionVersion:definition.definitionVersion,owner:ccd.owner,namespace:ccd.namespace,images:ccd.images};
   writeJsonAtomic(output+'/personal-service-reader-input.json',expected);
   receipt.personalService=personalEvidence.readPersonalServiceEvidence(output,expected);receipt.status=receipt.personalService.status;
  }else receipt.status=(complexEmail?assertComplexEmailUiOutcome:selector?assertSelectorUiOutcome:assertCallbackUiOutcome)(variant,result.terminal,observed,report);
 } catch(error){if(error?.message==='HOST_OWNED_RESOURCE_CLEANUP_FAILED')nativeCleanupUncertain=true;receipt.status=isCancelled()?'cancelled':'failed';receipt.phase=phase;receipt.failure=callbackUiFailureCode(error);receipt.diagnostic=classifyNativeFailure(error);}
 finally {
  if(!preparedPersonal){
  const cleanup=[];for(const key of [...resources.keys()].reverse()){try{await removeHostResource(resources,key,output);}catch{cleanup.push(key);nativeCleanupUncertain=true;break;}}
  try{assert(cleanup.length===0&&(!complexLifecycle||!nativeCleanupUncertain),'CALLBACK_UI_NATIVE_CLEANUP_REQUIRED');const removed=cleanupCiCcd(runtime);if(successfulStart||createAttempted||removed!==undefined)assert.equal(removed?.cleanupComplete,true,'CALLBACK_UI_CCD_CLEANUP_RECEIPT_REQUIRED');assert(!creationUncertain,'CALLBACK_UI_CCD_CLEANUP_UNCERTAIN');receipt.cleanup=removed??{cleanupComplete:true};}catch{creationUncertain=true;receipt.cleanup={cleanupComplete:false};}
  receipt.nativeCleanupComplete=cleanup.length===0&&!nativeCleanupUncertain;
  receipt.workspaceCleanupComplete=!privateWorkspace;
  if(privateWorkspace&&receipt.nativeCleanupComplete&&receipt.cleanup?.cleanupComplete===true){try{fs.rmSync(privateWorkspace,{recursive:true,force:true});receipt.workspaceCleanupComplete=true;}catch{receipt.workspaceCleanupComplete=false;}}
  if(!receipt.nativeCleanupComplete||receipt.cleanup?.cleanupComplete!==true||!receipt.workspaceCleanupComplete)receipt.status='cleanup-uncertain';
  if(personal)receipt.timing={startedAt:invocationClock.startedAt,endedAt:new Date().toISOString(),durationMs:Math.round(performance.now()-invocationClock.start),scope:'standalone-invocation-including-preparation-proof-reader-and-cleanup',telemetryOnly:true};
  save();
  if(complexLifecycle)complexLifecycle.closed({prepared:complexPrepared,cleanup:receipt.cleanup,nativeCleanupComplete:receipt.nativeCleanupComplete,workspaceCleanupComplete:receipt.workspaceCleanupComplete,cancelled:isCancelled(),creationUncertain});
  if(preparePersonal&&!creationUncertain&&!isCancelled()&&receipt.nativeCleanupComplete&&receipt.cleanup?.cleanupComplete===true&&receipt.workspaceCleanupComplete&&fs.existsSync(runtime+'/creation-attempts.json')){const attempts=read(runtime+'/creation-attempts.json');if(Array.isArray(attempts)&&attempts.length>0&&attempts.every(item=>item.state==='settled'&&/^[a-f0-9]{64}$/.test(item.containerId)))personalLifecycle?.closed();}
  }
  process.off('SIGINT',cancel);process.off('SIGTERM',cancel);signal?.removeEventListener('abort',cancel);
 }
 return receipt;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);try{assert([8,10].includes(args.length));assert.deepEqual(args.filter((_,i)=>i%2===0),['--candidate','--browser','--output','--variant',...(args.length===10?['--scenario']:[])]);const result=await runCallbackUi({candidate:args[1],browser:args[3],output:args[5],variant:args[7],scenario:args[9]});console.log(JSON.stringify({status:result.status,cleanupComplete:result.cleanup?.cleanupComplete===true&&result.nativeCleanupComplete}));if(!['candidate-ui-feasibility-observed','callback-binding-omission-detected','selector-event-row-feasibility-observed','selector-summary-omission-detected','personal-service-feasibility-observed','personal-service-required-fault-detected','complex-email-text-feasibility-observed','complex-email-type-tightening-observed'].includes(result.status))process.exitCode=2;}catch{console.error('Callback UI feasibility arguments rejected.');process.exitCode=2;}
}
