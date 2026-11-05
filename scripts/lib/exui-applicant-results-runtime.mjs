import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {startCcdRuntime,ccdCredentials,ccdRequest,docker,verifyCcdContainerIdentity} from './exui-ccd-runtime.mjs';
import {verifyLocalCcdRuntimeProfile} from './exui-local-ccd-runtime-profile.mjs';
import {importResultColumns,validateResultDescriptors} from './exui-result-columns-import.mjs';
import {seedResultRows,readResultSeedRows,validateResultSeedRows} from './exui-result-row-seed.mjs';
import {proveResultCcdSearch,validateResultCcdSearch} from './exui-result-ccd-search.mjs';
import {prepareResultColumnDefinition} from '../prepare-harness-result-columns.mjs';
import {readApplicantResultDates,assertApplicantResultDates} from './exui-applicant-result-dates.mjs';
import {applicantResultDefinition} from './exui-applicant-results.mjs';
import {APPLICANT_RESULTS_SCOPE,applicantResultsContract,applicantResultWorkbookDigest} from './exui-applicant-results-contract.mjs';
import {resultsSupportingScaffold,resultsSupportingScaffoldDigest} from './exui-results-ui-contract.mjs';
import {digestBytes,writeJsonAtomic} from './exui-evidence-io.mjs';
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
export async function prepareApplicantResultRuntime(output,{profile,variant='baseline',platform='linux/arm64',isCancelled=()=>false}) {
 const alive=()=>assert(!isCancelled(),'RESULT_TRANSITION_CANCELLED');alive();
 const state=await startCcdRuntime(output,{fixtureSelection:'nested-prl',platform,elasticsearch:true,localCcdProfile:profile,isCancelled});
 alive();const fixtureDirectory=path.join(output,'applicant-definition');await prepareResultColumnDefinition(fixtureDirectory,{variant});
 const imported=await importResultColumns(state,{fixtureDirectory,variant});alive();
 const version=imported.observations.definition.body.version.number;
 const stored=readApplicantResultDates(state,version,{variant,workbookDigest:imported.binding.workbookDigest,runDocker:docker,inspect:verifyCcdContainerIdentity});
 writeJsonAtomic(path.join(output,'applicant-result-dates.json'),stored);alive();
 await seedResultRows(state);alive();await proveResultCcdSearch(state);alive();
 const definition={kind:'native-applicant-result-definition',variant,owner:state.owner,namespace:state.namespace,images:state.images,fixtureDigest:imported.binding.workbookDigest,definitionVersion:version,observedDefinitionDigest:digestBytes(JSON.stringify(imported.observations.definition.body)),sourceContract:applicantResultsContract()};
 writeJsonAtomic(path.join(output,'applicant-result-native-import.json'),definition);
 return readApplicantResultRuntime(output,{profile,variant});
}
export function readApplicantResultRuntime(output,{profile,variant='baseline',live=true}) {
 assert(path.isAbsolute(output)&&fs.realpathSync(output)===output,'RESULT_RUNTIME_PATH');
 const state=read(path.join(output,'runtime.json'));
 assert.equal(state.output,output,'RESULT_RUNTIME_OUTPUT');assert.equal(state.localCcdProfile,profile,'RESULT_RUNTIME_PROFILE');
 const local=verifyLocalCcdRuntimeProfile(profile);assert.equal(state.images.data.id,local.imageId,'RESULT_RUNTIME_DEPENDENCY');
 if(live)verifyCcdContainerIdentity(state);
 const imported=read(path.join(output,'result-columns-import/receipt.json'));
 const backend=read(path.join(output,'result-ccd-search/receipt.json'));
 const seed=read(path.join(output,'result-row-seed/receipt.json'));
 for(const receipt of [imported,backend,seed]){assert.equal(receipt.owner,state.owner,'RESULT_RUNTIME_OWNER');assert.equal(receipt.namespace,state.namespace,'RESULT_RUNTIME_NAMESPACE');}
 assert.equal(imported.variant,variant,'RESULT_RUNTIME_VARIANT');assert.equal(imported.status,'import-and-readback-observed','RESULT_RUNTIME_IMPORT');
 assert.equal(imported.binding.workbookDigest,applicantResultWorkbookDigest(variant),'RESULT_RUNTIME_WORKBOOK');
 assert.equal(digestBytes(fs.readFileSync(path.join(output,'applicant-definition/definition.xlsx'))),applicantResultWorkbookDigest(variant),'RESULT_RUNTIME_WORKBOOK');
 assert.deepEqual(read(path.join(output,'applicant-definition/definition.json')),applicantResultDefinition(variant),'RESULT_RUNTIME_DEFINITION');
 const observations=Object.fromEntries(Object.entries(imported.observations).map(([key,value])=>[key,value.body]));
 validateResultDescriptors(applicantResultDefinition(variant),observations);
 const definition=read(path.join(output,'applicant-result-native-import.json'));
 assert.deepEqual(definition,{kind:'native-applicant-result-definition',variant,owner:state.owner,namespace:state.namespace,images:state.images,fixtureDigest:applicantResultWorkbookDigest(variant),definitionVersion:observations.definition.version.number,observedDefinitionDigest:digestBytes(JSON.stringify(observations.definition)),sourceContract:applicantResultsContract()},'RESULT_RUNTIME_NATIVE_IMPORT');
 const storedResultDates=read(path.join(output,'applicant-result-dates.json'));
 assertApplicantResultDates(storedResultDates,state,definition.definitionVersion,{variant,workbookDigest:definition.fixtureDigest});
 assert.equal(seed.status,'persisted-rows-indexed','RESULT_RUNTIME_SEED');assert.equal(backend.status,'both-use-cases-observed','RESULT_RUNTIME_BACKEND');
 let actor,apiContracts;
 if(live){
  actor=ccdCredentials(state,'observer');
  const rows=validateResultSeedRows(readResultSeedRows(state,seed.references),seed.references);
  for(const [view,name] of [['SEARCH','search'],['WORKBASKET','workbasket']])validateResultCcdSearch(backend.observations[view].body,observations[name],observations.definition,rows,view);
  assert.deepEqual(readApplicantResultDates(state,definition.definitionVersion,{variant,workbookDigest:definition.fixtureDigest,runDocker:docker,inspect:verifyCcdContainerIdentity}),storedResultDates,'RESULT_RUNTIME_DATE_DRIFT');
  for(const [name,route] of [['definition','/api/data/case-type/HarnessResultsPRL'],['search','/api/display/search-result-definition/HarnessResultsPRL'],['workbasket','/api/display/work-basket-definition/HarnessResultsPRL']]){
   const response=ccdRequest(state,4451,route,{headers:actor.headers});assert.equal(response.status,200,'RESULT_RUNTIME_DESCRIPTOR_READ');assert.deepEqual(response.body,observations[name],'RESULT_RUNTIME_DESCRIPTOR_DRIFT');
  }
  apiContracts=Object.fromEntries([['data',4452],['definition',4451]].map(([name,port])=>{const response=ccdRequest(state,port,'/v3/api-docs');assert.equal(response.status,200,'RESULT_RUNTIME_API');return[name,digestBytes(JSON.stringify(response.body))];}));
 }
 const resultExpected=Object.fromEntries(Object.entries(backend.observations).map(([view,value])=>[view,value.body]));
 return {releaseScopeId:APPLICANT_RESULTS_SCOPE,variant,ccd:state,definition,definitionImportDigest:digestBytes(fs.readFileSync(path.join(output,'applicant-result-native-import.json'))),
  storedResultDates,resultDatesDigest:digestBytes(fs.readFileSync(path.join(output,'applicant-result-dates.json'))),resultExpected,resultExpectedDigest:digestBytes(JSON.stringify(resultExpected)),
  resultDescriptorDigests:Object.fromEntries(['definition','search','workbasket'].map(name=>[name,digestBytes(JSON.stringify(observations[name]))])),
  supportingScaffold:resultsSupportingScaffold(),supportingScaffoldDigest:resultsSupportingScaffoldDigest(),
  correctedDependency:{profileDigest:digestBytes(fs.readFileSync(profile)),imageId:local.imageId,verification:local.verification,claim:'explicit corrected local ARM64 CCD; no deployed CCD or class-specific source witness claim'},
  ...(live?{credentials:{allowed:actor,observer:actor},apiContracts}:{})};
}
export function copyApplicantBackendReceipt(output,input,invocationId) {
 const source=path.join(input.ccd.output,'result-ccd-search/receipt.json'),relative=`${invocationId}/backend-search.json`,file=path.join(output,relative);
 fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});fs.copyFileSync(source,file,fs.constants.COPYFILE_EXCL);fs.chmodSync(file,0o600);
 return {path:relative,digest:digestBytes(fs.readFileSync(file))};
}
export function copyApplicantRuntimeEvidence(output,input,invocationId) {
 const refs={resultBackendReceipt:copyApplicantBackendReceipt(output,input,invocationId)};
 for(const [key,sourceName,targetName] of [
  ['resultImportReceipt','result-columns-import/receipt.json','import-readback.json'],
  ['resultDatesReceipt','applicant-result-dates.json','stored-dates.json'],
  ['resultSeedReceipt','result-row-seed/receipt.json','seed-receipt.json'],
  ['resultNativeImportReceipt','applicant-result-native-import.json','native-import.json'],
  ['resultDefinitionReceipt','applicant-definition/definition.json','definition.json'],
  ['resultWorkbookReceipt','applicant-definition/definition.xlsx','definition.xlsx'],
 ]){
  const source=path.join(input.ccd.output,sourceName),relative=`${invocationId}/${targetName}`,file=path.join(output,relative);
  assert(fs.lstatSync(source).isFile()&&fs.realpathSync(source)===source,'RESULT_RUNTIME_EVIDENCE_ALIAS');fs.copyFileSync(source,file,fs.constants.COPYFILE_EXCL);fs.chmodSync(file,0o600);refs[key]={path:relative,digest:digestBytes(fs.readFileSync(file))};
 }
 return refs;
}
export function assertCopiedApplicantRuntimeEvidence(output,input,invocationId) {
 for(const [key,sourceName,targetName] of [
  ['resultBackendReceipt','result-ccd-search/receipt.json','backend-search.json'],
  ['resultImportReceipt','result-columns-import/receipt.json','import-readback.json'],
  ['resultDatesReceipt','applicant-result-dates.json','stored-dates.json'],
  ['resultSeedReceipt','result-row-seed/receipt.json','seed-receipt.json'],
  ['resultNativeImportReceipt','applicant-result-native-import.json','native-import.json'],
  ['resultDefinitionReceipt','applicant-definition/definition.json','definition.json'],
  ['resultWorkbookReceipt','applicant-definition/definition.xlsx','definition.xlsx'],
 ]){
  const reference=input[key],relative=`${invocationId}/${targetName}`,source=path.join(input.ccd.output,sourceName),copied=path.join(output,relative);
  assert.deepEqual(Object.keys(reference??{}).sort(),['digest','path'],'RESULT_RUNTIME_CAPTURE_REFERENCE');assert.equal(reference.path,relative,'RESULT_RUNTIME_CAPTURE_PATH');
  for(const file of [source,copied])assert(fs.lstatSync(file).isFile()&&fs.realpathSync(file)===file,'RESULT_RUNTIME_CAPTURE_ALIAS');
  const bytes=fs.readFileSync(source);assert.deepEqual(fs.readFileSync(copied),bytes,'RESULT_RUNTIME_CAPTURE_BYTES');assert.equal(reference.digest,digestBytes(bytes),'RESULT_RUNTIME_CAPTURE_DIGEST');
 }
}
