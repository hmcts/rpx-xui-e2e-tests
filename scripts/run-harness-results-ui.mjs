#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {verifyCandidateArtifact,digestCandidateTree} from './lib/exui-candidate-artifact.mjs';
import {verifyHarnessDependencies} from './lib/exui-harness-dependencies.mjs';
import {assertCandidateConfigurationSources} from './lib/exui-configuration-catalogue.mjs';
import {nativeContainerPlan,inspectNativeApiRuntime,inspectNativeBrowserRuntime} from './lib/exui-native-containers.mjs';
import {nativeIdentity} from './lib/exui-native-contract.mjs';
import {runHostInvocation,removeHostResource} from './lib/exui-host-invocation.mjs';
import {startCcdRuntime,ccdCredentials,ccdRequest,docker,verifyCcdContainerIdentity} from './lib/exui-ccd-runtime.mjs';
import {cleanupCiCcd} from './lib/exui-candidate-ci-process.mjs';
import {importResultColumns} from './lib/exui-result-columns-import.mjs';
import {seedResultRows} from './lib/exui-result-row-seed.mjs';
import {proveResultCcdSearch} from './lib/exui-result-ccd-search.mjs';
import {NATIVE_HARNESS_SOURCE_FILES} from './lib/exui-native-sources.mjs';
import {digestBytes,writeJsonAtomic} from './lib/exui-evidence-io.mjs';
import {createFreshHarnessOutput} from './lib/exui-output-boundary.mjs';
import {browserExecutable} from './lib/exui-oci-runtime.mjs';
import {createCallbackNativeWorkspace,callbackUiFailureCode} from './run-harness-recipient-callback-ui.mjs';
import {readApplicantResultDates} from './lib/exui-applicant-result-dates.mjs';
import {APPLICANT_RESULT_VARIANTS,validateApplicantResultOutcome} from './lib/exui-applicant-results.mjs';
import {prepareResultColumnDefinition} from './prepare-harness-result-columns.mjs';
import {resultsSupportingScaffold,resultsSupportingScaffoldDigest} from './lib/exui-results-ui-contract.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
export const RESULTS_UI_SOURCES=Object.freeze([...new Set([...NATIVE_HARNESS_SOURCE_FILES,'scripts/run-harness-results-ui.mjs','scripts/lib/exui-result-columns.mjs','scripts/lib/exui-result-field-types.mjs','scripts/lib/exui-applicant-results.mjs','scripts/lib/exui-applicant-result-dates.mjs','scripts/lib/exui-result-columns-definition.mjs','scripts/lib/exui-result-columns-import.mjs','scripts/lib/exui-result-row-seed.mjs','scripts/lib/exui-result-ccd-search.mjs','scripts/prepare-harness-result-columns.mjs','scripts/fixtures/ccd/result-columns.json','scripts/fixtures/ccd/result-columns.source.json','scripts/fixtures/ccd/result-columns-import/definition.json','scripts/fixtures/ccd/result-columns-import/definition.xlsx','scripts/fixtures/ccd/result-columns-import/binding.json','src/fixtures/harnessCallback.ts','playwright.results-feasibility.config.mjs','scripts/recipient-callback-ui-tools.mjs','src/tests/harness/results-feasibility/result-columns.spec.ts'])]);
export async function runResultsUi({candidate,browser,output,profile,variant='baseline'}) {
 assert(APPLICANT_RESULT_VARIANTS.includes(variant),'RESULT_APPLICANT_VARIANT');assert(path.isAbsolute(output)&&!fs.existsSync(output),'CALLBACK_UI_FRESH_OUTPUT');
 const artifact=await verifyCandidateArtifact(path.resolve(candidate)),browserRoot=fs.realpathSync(browser);
 output=createFreshHarnessOutput(output,[artifact.candidateRoot,path.resolve(candidate),browserRoot,root,path.join(root,'node_modules')]);
 const receipt={kind:'result-columns-ui-feasibility',variant,supportingScaffold:resultsSupportingScaffold(),supportingScaffoldDigest:resultsSupportingScaffoldDigest(),configurationScaffold:'synthetic-results-jurisdictions-HARNESS',sourceProfileClaim:false,status:'in-progress',runtimeAcceptance:false,catalogueCredit:false,releaseCredit:false};
 const save=()=>{writeJsonAtomic(output+'/receipt.json',receipt);fs.chmodSync(output+'/receipt.json',0o600);};save();
 const resources=new Map();let cancelled=false;const cancel=()=>{cancelled=true;for(const resource of resources.values())if(resource.kind==='process')resource.child?.kill('SIGTERM');};process.once('SIGINT',cancel);process.once('SIGTERM',cancel);
 let phase='verify-candidate',privateWorkspace;const runtime=output+'/runtime';
 try {
  const harnessDependencies=await verifyHarnessDependencies(root+'/node_modules',root+'/package.json',root+'/yarn.lock');
  assertCandidateConfigurationSources(artifact.candidateRoot,read(root+'/scripts/fixtures/exui-configuration-review.json'));
  const browserDigest=await digestCandidateTree(browserRoot);
  phase='start-runtime';const ccd=await startCcdRuntime(runtime,{fixtureSelection:'nested-prl',platform:artifact.provenance.platform,elasticsearch:true,localCcdProfile:profile,isCancelled:()=>cancelled});
  assert(!cancelled,'RESULT_UI_CANCELLED');phase='import-results';const fixtureDirectory=output+'/result-definition';await prepareResultColumnDefinition(fixtureDirectory,{variant});const imported=await importResultColumns(ccd,{fixtureDirectory,variant});
  phase='source-date-retention';const storedResultDates=readApplicantResultDates(ccd,imported.observations.definition.body.version.number,{variant,workbookDigest:imported.binding.workbookDigest,runDocker:docker,inspect:verifyCcdContainerIdentity});writeJsonAtomic(output+'/result-date-observation.json',storedResultDates);
  assert(!cancelled,'RESULT_UI_CANCELLED');phase='seed-results';await seedResultRows(ccd);
  assert(!cancelled,'RESULT_UI_CANCELLED');phase='prove-backend';await proveResultCcdSearch(ccd);
  const backend=read(runtime+'/result-ccd-search/receipt.json');const resultExpected=Object.fromEntries(Object.entries(backend.observations).map(([view,value])=>[view,value.body]));
  assert(!cancelled,'RESULT_UI_CANCELLED');phase='prepare-actor';const observer=ccdCredentials(ccd,'observer');const credentials={allowed:observer,observer};
  phase='prepare-api-contracts';const apiContracts=Object.fromEntries([['data',4452],['definition',4451]].map(([name,port])=>{const response=ccdRequest(ccd,port,'/v3/api-docs');assert.equal(response.status,200);return[name,digestBytes(JSON.stringify(response.body))];}));
  const definition={fixtureDigest:digestBytes(fs.readFileSync(fixtureDirectory+'/definition.xlsx')),observedDefinitionDigest:digestBytes(JSON.stringify(imported.observations.definition.body)),definitionVersion:imported.observations.definition.body.version.number};
  phase='stage-native-sources';const runId='ccd-'+randomUUID();const {workspace,stagedHarness,stateRoot}=createCallbackNativeWorkspace();privateWorkspace=workspace;receipt.privateWorkspace=workspace;save();
  for(const file of RESULTS_UI_SOURCES){const source=path.join(root,file);assert.equal(fs.realpathSync(source),source);assert(fs.lstatSync(source).isFile());const target=path.join(stagedHarness,file);fs.mkdirSync(path.dirname(target),{recursive:true,mode:0o755});fs.copyFileSync(source,target);fs.chmodSync(target,0o444);}
  const harnessSourceDigest=digestBytes(JSON.stringify(RESULTS_UI_SOURCES.map(file=>[file,digestBytes(fs.readFileSync(path.join(stagedHarness,file)))])));
  const chromium=read(root+'/node_modules/playwright-core/browsers.json').browsers.find(item=>item.name==='chromium-headless-shell');
  phase='inspect-native-images';const input={storedResultDates,kind:receipt.kind,supportingScaffold:receipt.supportingScaffold,supportingScaffoldDigest:receipt.supportingScaffoldDigest,variant,runId,artifact,releaseScopeId:'exui-ccd-event-capability-pilot',ccd,credentials,definition,apiContracts,browserRoot,browserDigest,browserExecutable:'/browser/'+browserExecutable({browsers:[chromium]},artifact.provenance.platform),harnessDependencies,harnessSources:RESULTS_UI_SOURCES,harnessSourceDigest,gatewayDigest:digestBytes(fs.readFileSync(root+'/scripts/lib/exui-ccd-browser-runtime.mjs')),resultExpected,resultExpectedDigest:digestBytes(JSON.stringify(resultExpected)),resultDescriptorDigests:Object.fromEntries(['definition','search','workbasket'].map(name=>[name,digestBytes(JSON.stringify(imported.observations[name].body))])),nativeRuntime:inspectNativeApiRuntime(artifact.provenance.platform),browserRuntimeImage:inspectNativeBrowserRuntime(artifact.provenance.platform)};
  writeJsonAtomic(output+'/input.json',input);fs.chmodSync(output+'/input.json',0o600);
  const directory=output+'/baseline';fs.mkdirSync(directory,{mode:0o700});
  phase='plan-native-containers';const handoff={output,stagedHarness,stateRoot};const plan=nativeContainerPlan(input,handoff,'baseline');
  // Reuse only the existing immutable candidate/container transport. No release-policy execution or verdict adapter.
  const toolIndex=plan.tools.args.indexOf('scripts/run-harness-native-tools.mjs');assert(toolIndex>=0,'CALLBACK_UI_TOOLS_ENTRYPOINT');plan.tools.args[toolIndex]='scripts/recipient-callback-ui-tools.mjs';
  plan.proofArguments=['scripts/recipient-callback-ui-tools.mjs','--inside-proof'];
  const {identity}=nativeIdentity(input,{invocationId:'baseline',mutation:null},artifact.candidateRoot);
  const manifest={schemaVersion:1,kind:receipt.kind,identity,runId,variant,catalogueCredit:false,releaseCredit:false,runtimeMetadata:{supportingScaffold:input.supportingScaffold,supportingScaffoldDigest:input.supportingScaffoldDigest,resultsImportDigest:digestBytes(fs.readFileSync(runtime+'/result-columns-import/receipt.json')),resultStoredDatesDigest:digestBytes(fs.readFileSync(output+'/result-date-observation.json')),configurationScaffold:'synthetic-results-jurisdictions-HARNESS',resultExpectedDigest:input.resultExpectedDigest,harnessSourceDigest,browserDigest}};
  phase='execute-candidate';const result=await runHostInvocation({...plan,manifest,payloadDigest:artifact.payloadDigest},{resources,isCancelled:()=>cancelled});receipt.runnerExitCode=result.terminal.code;
  const report=read(directory+'/report.json');
  const observations=Object.fromEntries(['SEARCH','WORKBASKET'].map(view=>[view,read(directory+'/results-ui-'+view+'.json')]));
  receipt.status=validateApplicantResultOutcome({variant,terminal:result.terminal,report,observations});
 } catch(error){receipt.status=cancelled?'cancelled':'failed';receipt.phase=phase;receipt.failure=['RESULT_UI_CANCELLED','RESULT_UI_RUN_FAILED'].includes(error?.message)?error.message:callbackUiFailureCode(error);}
 finally {
  const cleanup=[];for(const key of [...resources.keys()].reverse()){try{await removeHostResource(resources,key,output);}catch{cleanup.push(key);}}
  try{receipt.cleanup=fs.existsSync(runtime+'/recovery.json')?cleanupCiCcd(runtime,{localCcdProfile:profile}):{cleanupComplete:true};}catch{receipt.cleanup={cleanupComplete:false};}
  receipt.nativeCleanupComplete=cleanup.length===0;
  receipt.workspaceCleanupComplete=!privateWorkspace;
  if(privateWorkspace&&receipt.nativeCleanupComplete&&receipt.cleanup?.cleanupComplete===true){try{fs.rmSync(privateWorkspace,{recursive:true,force:true});receipt.workspaceCleanupComplete=true;}catch{receipt.workspaceCleanupComplete=false;}}
  if(cleanup.length||receipt.cleanup?.cleanupComplete!==true||!receipt.workspaceCleanupComplete)receipt.status='cleanup-uncertain';
  process.off('SIGINT',cancel);process.off('SIGTERM',cancel);save();
 }
 return receipt;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);try{assert([8,10].includes(args.length));assert.deepEqual(args.filter((_,i)=>i%2===0),['--candidate','--browser','--output','--profile',...(args.length===10?['--variant']:[])]);const result=await runResultsUi({candidate:args[1],browser:args[3],output:args[5],profile:args[7],variant:args[9]});console.log(JSON.stringify({status:result.status,cleanupComplete:result.cleanup?.cleanupComplete===true&&result.nativeCleanupComplete,catalogueCredit:false}));if(!['two-candidate-result-tables-observed','applicant-result-fault-observed'].includes(result.status))process.exitCode=2;}catch{console.error('Results UI feasibility arguments rejected.');process.exitCode=2;}
}
