#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {isDeepStrictEqual} from 'node:util';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {verifyCandidateArtifact,digestCandidateTree} from './lib/exui-candidate-artifact.mjs';
import {verifyHarnessDependencies} from './lib/exui-harness-dependencies.mjs';
import {assertCandidateConfigurationSources} from './lib/exui-configuration-catalogue.mjs';
import {nativeContainerPlan,inspectNativeApiRuntime,inspectNativeBrowserRuntime} from './lib/exui-native-containers.mjs';
import {nativeIdentity} from './lib/exui-native-contract.mjs';
import {runHostInvocation,removeHostResource} from './lib/exui-host-invocation.mjs';
import {startCcdRuntime,ccdCredentials,ccdRequest,verifyCcdContainerIdentity} from './lib/exui-ccd-runtime.mjs';
import {cleanupCiCcd} from './lib/exui-candidate-ci-process.mjs';
import {prepareRecipientCallbackImport,importRecipientCallback,validateObservedRecipientCallback} from './lib/exui-recipient-callback-import.mjs';
import {NATIVE_HARNESS_SOURCE_FILES} from './lib/exui-native-sources.mjs';
import {digestBytes,writeJsonAtomic} from './lib/exui-evidence-io.mjs';
import {canonicalRecipientCallbackPages} from './lib/exui-recipient-callback-fixture.mjs';
import {createFreshHarnessOutput} from './lib/exui-output-boundary.mjs';
import {callbackFailureCode} from './lib/exui-recipient-callback-diagnostics.mjs';
import {browserExecutable} from './lib/exui-oci-runtime.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
export const CALLBACK_UI_SOURCES=Object.freeze([...new Set([...NATIVE_HARNESS_SOURCE_FILES,'scripts/run-harness-recipient-callback-ui.mjs','scripts/lib/exui-recipient-callback-import.mjs','src/fixtures/harnessCallback.ts','playwright.callback-feasibility.config.mjs','scripts/recipient-callback-ui-tools.mjs','src/tests/harness/callback-feasibility/recipient-callback.spec.ts'])]);
export function callbackUiFailureCode(error) {
 const known=new Set(['CALLBACK_UI_BROWSER_ASSERTION_FAILED','OWNED_OCI_CONTAINER_REQUIRED','OCI_READONLY_MOUNT_WRITABLE_ALIAS','NATIVE_CANDIDATE_PLATFORM_MISMATCH','NATIVE_SEALED_NODE_VERSION_REQUIRED','PINNED_BROWSER_RUNTIME_REQUIRED','OWNED_TOOLS_NAMESPACE_REQUIRED','UNSUPPORTED_OCI_INVOCATION','CALLBACK_UI_TOOLS_ENTRYPOINT','CALLBACK_UI_CANCELLED','CALLBACK_UI_VARIANT','CALLBACK_UI_FRESH_OUTPUT','CALLBACK_UI_IMPORT_RECEIPT_MISMATCH','CALLBACK_UI_IMPORT_IDENTITY_MISMATCH','CALLBACK_UI_IMPORT_STATUS','CALLBACK_UI_IMPORT_READBACK_FAILED','CALLBACK_UI_IMPORT_DRIFT','HOST_INVOCATION_CANCELLED','HOST_NAMESPACE_EGRESS_AVAILABLE','HOST_CANDIDATE_RUNTIME_OS','HOST_CANDIDATE_RUNTIME_ARCH','HOST_CANDIDATE_SEALED_NODE_VERSION','HOST_PROVIDER_SHUTDOWN_FAILED','HOST_UNDECLARED_DESTINATION','HOST_FRAMEWORK_TERMINATION_MISMATCH','CCD_RUNTIME_OWNER_MISMATCH','CCD_RUNTIME_NAMESPACE_MISMATCH']);
 const first=typeof error?.message==='string'?error.message.split('\n',1)[0]:'';
 if(known.has(first))return first;
 const callback=callbackFailureCode(error);if(callback!=='CALLBACK_PROBE_UNCLASSIFIED_FAILURE')return callback;
 if(error?.code==='ENOENT')return 'CALLBACK_UI_REQUIRED_FILE_MISSING';
 if(error?.code==='EACCES')return 'CALLBACK_UI_FILE_PERMISSION';
 return 'CALLBACK_UI_PHASE_FAILED';
}
export function verifyCallbackUiRuntime(state, imported, {request=ccdRequest, inspect=verifyCcdContainerIdentity}={}) {
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
 const saveVerification=()=>fs.writeFileSync(verificationPath,JSON.stringify(verification,null,2)+'\n',{mode:0o600});
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
export function createCallbackNativeWorkspace() {
 const workspace=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'exui-callback-native-'));fs.chmodSync(workspace,0o700);
 const stagedHarness=workspace+'/sources',stateRoot=workspace+'/state';fs.mkdirSync(stagedHarness,{mode:0o755});fs.mkdirSync(stagedHarness+'/node_modules',{mode:0o755});
 for(const kind of ['sessions','diagnostics']){const directory=stateRoot+'/baseline/'+kind;fs.mkdirSync(directory,{recursive:true,mode:0o777});fs.chmodSync(directory,0o777);}
 return {workspace,stagedHarness,stateRoot};
}
export async function runCallbackUi({candidate,browser,output,variant='baseline'}) {
 assert(['baseline','binding-omitted'].includes(variant),'CALLBACK_UI_VARIANT');assert(path.isAbsolute(output)&&!fs.existsSync(output),'CALLBACK_UI_FRESH_OUTPUT');
 const artifact=await verifyCandidateArtifact(path.resolve(candidate)),browserRoot=fs.realpathSync(browser);
 output=createFreshHarnessOutput(output,[artifact.candidateRoot,path.resolve(candidate),browserRoot,root,path.join(root,'node_modules')]);
 const receipt={kind:'recipient-callback-ui-feasibility',variant,status:'in-progress',runtimeAcceptance:false,catalogueCredit:false,releaseCredit:false};
 const save=()=>{writeJsonAtomic(output+'/receipt.json',receipt);fs.chmodSync(output+'/receipt.json',0o600);};save();
 const resources=new Map();let cancelled=false;const cancel=()=>{cancelled=true;for(const resource of resources.values())if(resource.kind==='process')resource.child?.kill('SIGTERM');};process.once('SIGINT',cancel);process.once('SIGTERM',cancel);
 let phase='verify-candidate',privateWorkspace;const runtime=output+'/runtime';
 try {
  const harnessDependencies=await verifyHarnessDependencies(root+'/node_modules',root+'/package.json',root+'/yarn.lock');
  assertCandidateConfigurationSources(artifact.candidateRoot,read(root+'/scripts/fixtures/exui-configuration-review.json'));
  const browserDigest=await digestCandidateTree(browserRoot);
  phase='start-runtime';const ccd=await startCcdRuntime(runtime,{fixtureSelection:'event-capability-baseline',platform:artifact.provenance.platform,isCancelled:()=>cancelled});
  phase='import-callback';await prepareRecipientCallbackImport(output+'/fixture',{variant});
  const imported=await importRecipientCallback(ccd,{fixtureDirectory:output+'/fixture',variant});receipt.import=imported;save();const callbackObservedDigests=verifyCallbackUiRuntime(ccd,imported);
  assert(!cancelled,'CALLBACK_UI_CANCELLED');
  phase='prepare-actors';const credentials=Object.fromEntries(['allowed','courtadmin','judge','readonly','observer'].map(actor=>[actor,ccdCredentials(ccd,actor)]));
  phase='prepare-api-contracts';const apiContracts=Object.fromEntries([['data',4452],['definition',4451]].map(([name,port])=>{const response=ccdRequest(ccd,port,'/v3/api-docs');assert.equal(response.status,200);return[name,digestBytes(JSON.stringify(response.body))];}));
  const definition={fixtureDigest:imported.seal.definitionDigest,observedDefinitionDigest:digestBytes(JSON.stringify(imported.observations.definition.body)),definitionVersion:imported.observations.definition.body.version.number};
  phase='stage-native-sources';const runId='ccd-'+randomUUID();const {workspace,stagedHarness,stateRoot}=createCallbackNativeWorkspace();privateWorkspace=workspace;receipt.privateWorkspace=workspace;save();
  for(const file of CALLBACK_UI_SOURCES){const source=path.join(root,file);assert.equal(fs.realpathSync(source),source);assert(fs.lstatSync(source).isFile());const target=path.join(stagedHarness,file);fs.mkdirSync(path.dirname(target),{recursive:true,mode:0o755});fs.copyFileSync(source,target);fs.chmodSync(target,0o444);}
  const harnessSourceDigest=digestBytes(JSON.stringify(CALLBACK_UI_SOURCES.map(file=>[file,digestBytes(fs.readFileSync(path.join(stagedHarness,file)))])));
  const chromium=read(root+'/node_modules/playwright-core/browsers.json').browsers.find(item=>item.name==='chromium-headless-shell');
  phase='inspect-native-images';const input={kind:receipt.kind,variant,runId,artifact,releaseScopeId:'exui-ccd-event-capability-pilot',ccd,credentials,definition,apiContracts,browserRoot,browserDigest,browserExecutable:'/browser/'+browserExecutable({browsers:[chromium]},artifact.provenance.platform),harnessDependencies,harnessSources:CALLBACK_UI_SOURCES,harnessSourceDigest,gatewayDigest:digestBytes(fs.readFileSync(root+'/scripts/lib/exui-ccd-browser-runtime.mjs')),callbackObservedDigests,nativeRuntime:inspectNativeApiRuntime(artifact.provenance.platform),browserRuntimeImage:inspectNativeBrowserRuntime(artifact.provenance.platform)};
  writeJsonAtomic(output+'/input.json',input);fs.chmodSync(output+'/input.json',0o600);
  const directory=output+'/baseline';fs.mkdirSync(directory,{mode:0o700});
  phase='plan-native-containers';const handoff={output,stagedHarness,stateRoot};const plan=nativeContainerPlan(input,handoff,'baseline');
  // Reuse only the existing immutable candidate/container transport. No release-policy execution or verdict adapter.
  const toolIndex=plan.tools.args.indexOf('scripts/run-harness-native-tools.mjs');assert(toolIndex>=0,'CALLBACK_UI_TOOLS_ENTRYPOINT');plan.tools.args[toolIndex]='scripts/recipient-callback-ui-tools.mjs';
  plan.proofArguments=['scripts/recipient-callback-ui-tools.mjs','--inside-proof'];
  const {identity}=nativeIdentity(input,{invocationId:'baseline',mutation:null},artifact.candidateRoot);
  const manifest={schemaVersion:1,kind:receipt.kind,identity,runId,variant,catalogueCredit:false,releaseCredit:false,runtimeMetadata:{callbackImportDigest:digestBytes(fs.readFileSync(runtime+'/recipient-callback-import/receipt.json')),harnessSourceDigest,browserDigest}};
  phase='execute-candidate';const result=await runHostInvocation({...plan,manifest,payloadDigest:artifact.payloadDigest},{resources,isCancelled:()=>cancelled});receipt.runnerExitCode=result.terminal.code;
  phase='evaluate-browser-proof';const report=read(directory+'/report.json');
  assert.equal(result.terminal.code,variant==='baseline'?0:1,'CALLBACK_UI_BROWSER_ASSERTION_FAILED');
  const observed=read(directory+'/callback-ui-observation.json');
  receipt.status=assertCallbackUiOutcome(variant,result.terminal,observed,report);
 } catch(error){receipt.status=cancelled?'cancelled':'failed';receipt.phase=phase;receipt.failure=callbackUiFailureCode(error);}
 finally {
  const cleanup=[];for(const key of [...resources.keys()].reverse()){try{await removeHostResource(resources,key,output);}catch{cleanup.push(key);}}
  try{receipt.cleanup=fs.existsSync(runtime+'/recovery.json')?cleanupCiCcd(runtime):{cleanupComplete:true};}catch{receipt.cleanup={cleanupComplete:false};}
  receipt.nativeCleanupComplete=cleanup.length===0;
  receipt.workspaceCleanupComplete=!privateWorkspace;
  if(privateWorkspace&&receipt.nativeCleanupComplete&&receipt.cleanup?.cleanupComplete===true){try{fs.rmSync(privateWorkspace,{recursive:true,force:true});receipt.workspaceCleanupComplete=true;}catch{receipt.workspaceCleanupComplete=false;}}
  if(cleanup.length||receipt.cleanup?.cleanupComplete!==true||!receipt.workspaceCleanupComplete)receipt.status='cleanup-uncertain';
  process.off('SIGINT',cancel);process.off('SIGTERM',cancel);save();
 }
 return receipt;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);try{assert.equal(args.length,8);assert.deepEqual(args.filter((_,i)=>i%2===0),['--candidate','--browser','--output','--variant']);const result=await runCallbackUi({candidate:args[1],browser:args[3],output:args[5],variant:args[7]});console.log(JSON.stringify({status:result.status,cleanupComplete:result.cleanup?.cleanupComplete===true&&result.nativeCleanupComplete}));if(!['candidate-ui-feasibility-observed','callback-binding-omission-detected'].includes(result.status))process.exitCode=2;}catch{console.error('Callback UI feasibility arguments rejected.');process.exitCode=2;}
}
