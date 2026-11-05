import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {digestBytes} from './exui-evidence-io.mjs';
import {DIVORCE_PROFILE_FACETS,divorceProfileContract,divorceProfileContractDigest} from './exui-divorce-profile-contract.mjs';
import {PROFILE_SOURCE_FILES} from './exui-source-profile-sources.mjs';
import {facetSettings,validateProfileInvocationResult} from '../run-harness-source-profile-jurisdictions.mjs';
import {validateNativeInvocationFinalization} from './exui-native-ci-ownership.mjs';
import {assertOwnedContainer,candidateArchiveProcess} from './exui-oci-runtime.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)).replace(/\/$/,'');
const read=file=>JSON.parse(fs.readFileSync(file));
const hash=/^sha256:[a-f0-9]{64}$/;
// Telemetry only: never derive execution authority or elapsed time from file metadata.
export const startDivorceClock=()=>({startedAt:new Date().toISOString(),monotonic:performance.now()});
export const finishDivorceClock=start=>({startedAt:start.startedAt,endedAt:new Date().toISOString(),durationMs:Math.round(performance.now()-start.monotonic)});
export const DIVORCE_COHORT_FILES=Object.freeze([...PROFILE_SOURCE_FILES,'scripts/lib/exui-divorce-profile-cohort.mjs','scripts/run-harness-divorce-profile.mjs','scripts/run-harness-divorce-profile-admission.mjs','scripts/lib/exui-divorce-profile-admission.mjs']);
export function divorceProducerBinding(sourceRoot=root){
 const git=args=>execFileSync('git',args,{cwd:sourceRoot,encoding:'utf8'}).trim();
 assert.equal(git(['status','--porcelain','--untracked-files=all','--',...DIVORCE_COHORT_FILES]),'','DIVORCE_COHORT_COMMITTED_SOURCE');
 const files=Object.fromEntries(DIVORCE_COHORT_FILES.map(name=>[name,digestBytes(fs.readFileSync(path.join(sourceRoot,name)))]));
 return {commit:git(['rev-parse','HEAD']),files,digest:digestBytes(JSON.stringify(files))};
}
export function divorceFallbackWitness(candidateRoot){
 const relative='node_modules/@hmcts/rpx-xui-common-lib/fesm2022/hmcts-rpx-xui-common-lib.mjs',bytes=fs.readFileSync(path.join(candidateRoot,relative)),source=bytes.toString();
 assert(source.includes('initialize(this.clientId, this.context, { useReport: true })')&&source.includes('this.featureToggleService.getValueOnce(feature, true)')&&source.includes('return this.ready.pipe(filter((ready) => ready), map(() => this.client.variation(feature, defaultValue)));'),'DIVORCE_COHORT_FLAG_FALLBACK');
 const mainPath='dist/rpx-exui/browser/main-HYPXLXEP.js',guardPath='dist/rpx-exui/browser/chunk-LZSBXBQ2.js';
 const main=fs.readFileSync(path.join(candidateRoot,mainPath)),guard=fs.readFileSync(path.join(candidateRoot,guardPath));
 const route='{path:"search",canActivate:[H,Z,Xt],loadChildren:()=>import("./chunk-DILEIFDO.js").then(o=>o.SearchModule),data:{title:"Search cases",needsFeaturesEnabled:["feature-global-search"],featureDisabledRedirect:"/"}}';
 assert(main.toString().includes(route)&&/import\{[^}]*Bd as Xt[^}]*\}from"\.\/chunk-LZSBXBQ2\.js"/.test(main.toString()),'DIVORCE_COHORT_FLAG_ROUTE');
 assert(guard.toString().includes('baseUrl:{default:"https://app.launchdarkly.com"}')&&guard.toString().includes('h=[i,"/sdk/evalx/",e,"/context"].join("")'),'DIVORCE_COHORT_FLAG_ENDPOINT');
 assert(guard.toString().includes('ugi as Bd')&&guard.toString().includes('ugi=(()=>{class t{constructor(e,i){this.featureToggleService=e,this.router=i}canActivate(e){return vs([...e.data.needsFeaturesEnabled.map(i=>this.featureToggleService.getValueOnce(i,!0))])'),'DIVORCE_COHORT_FLAG_ROUTE');
 return {path:relative,digest:digestBytes(bytes),flag:'feature-global-search',guardDefault:true,evaluationRequest:{origin:'https://app.launchdarkly.com',method:'REPORT',path:'/sdk/evalx/synthetic-flags/context'},evaluationFlags:{},liveProvider:false,route:{path:'/search',main:{path:mainPath,digest:digestBytes(main)},guard:{path:guardPath,digest:digestBytes(guard)},localAlias:'Xt',moduleExport:'Bd',guardSymbol:'ugi'}};
}
const candidateConfiguration=(candidateRoot,facet,mutation=null)=>facetSettings(facet).configuration(candidateRoot,mutation);
export function divorceConfigurationBindings(candidateRoot,configurationFor=candidateConfiguration){
 const result={};let baseline;
 for(const {facet,fault} of DIVORCE_PROFILE_FACETS){
  const base=configurationFor(candidateRoot,facet,null),mutant=configurationFor(candidateRoot,facet,fault);
  baseline??=base.config;assert.deepEqual(base.config,baseline,'DIVORCE_COHORT_BASELINE_CONFIG');assert.equal(base.config.feature.workAllocationEnabled,false,'DIVORCE_COHORT_BASELINE_CONFIG');
  // Independent, finite mutation reconstruction: no production mutation helper supplies the oracle.
  const expected=structuredClone(baseline);
  if(facet==='divorce-jurisdiction')expected.jurisdictions=expected.jurisdictions.split(',').filter(id=>id!=='DIVORCE').join(',');
  if(facet==='divorce-global-search')expected.globalSearchServices=expected.globalSearchServices.split(',').filter(id=>id!=='DIVORCE').join(',');
  if(facet==='divorce-staff')expected.staffSupportedJurisdictions=expected.staffSupportedJurisdictions.split(',').filter(id=>id!=='DIVORCE').join(',');
  if(facet==='divorce-mapping')expected.serviceRefDataMapping=expected.serviceRefDataMapping.map(row=>row.service==='DIVORCE'?{...row,serviceCodes:['ZZZ1']}:row);
  if(facet==='divorce-wa')expected.waSupportedJurisdictions+=',DIVORCE';
  if(facet==='wa-health')expected.feature.workAllocationEnabled=true;
  assert.deepEqual(mutant.config,expected,'DIVORCE_COHORT_FOREIGN_CONFIG');
  result[facet]={baseline:base.digest,[fault]:mutant.digest};
 }
 return result;
}
export function validateDivorceCohortBinding(binding,{artifact,producer,runtime,browser,owners},configurationFor=candidateConfiguration){
 assert.deepEqual(Object.keys(binding).sort(),['artifact','browser','configurations','contract','contractDigest','fallback','owners','producer','runtime','schemaVersion'],'DIVORCE_COHORT_BINDING');
 assert.equal(artifact.provenance.webappCommit,divorceProfileContract().consumerRevision,'DIVORCE_COHORT_CONSUMER');
 assert.deepEqual(binding.owners,owners,'DIVORCE_COHORT_OWNERS');assert.deepEqual(Object.keys(owners),DIVORCE_PROFILE_FACETS.map(x=>x.facet),'DIVORCE_COHORT_OWNERS');
 assert(new Set(Object.values(owners)).size===6&&Object.values(owners).every(owner=>/^candidate-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(owner)),'DIVORCE_COHORT_OWNERS');
 assert.equal(binding.schemaVersion,1,'DIVORCE_COHORT_BINDING');assert.deepEqual(binding.artifact,artifact,'DIVORCE_COHORT_ARTIFACT');assert.deepEqual(binding.producer,producer,'DIVORCE_COHORT_PRODUCER');assert.deepEqual(binding.browser,browser,'DIVORCE_COHORT_BROWSER');assert.deepEqual(binding.runtime,runtime,'DIVORCE_COHORT_RUNTIME');
 assert.deepEqual(binding.contract,divorceProfileContract(),'DIVORCE_COHORT_CONTRACT');assert.equal(binding.contractDigest,divorceProfileContractDigest(),'DIVORCE_COHORT_CONTRACT');
 assert.deepEqual(binding.configurations,divorceConfigurationBindings(artifact.candidateRoot,configurationFor),'DIVORCE_COHORT_FOREIGN_CONFIG');
 assert.deepEqual(binding.fallback,divorceFallbackWitness(artifact.candidateRoot),'DIVORCE_COHORT_FLAG_FALLBACK');
}
function sealedFiles(directory){
 const files={};const visit=relative=>{for(const name of fs.readdirSync(path.join(directory,relative)).sort()){
  const key=relative?relative+'/'+name:name,file=path.join(directory,key),stat=fs.lstatSync(file);assert(!stat.isSymbolicLink(),'DIVORCE_COHORT_EVIDENCE_ALIAS');
  if(stat.isDirectory())visit(key);else if(stat.isFile())files[key]=digestBytes(fs.readFileSync(file));else assert.fail('DIVORCE_COHORT_EVIDENCE_ALIAS');
 }};visit('');return files;
}
export function readDivorceCohort(directory,expected,{configurationFor=candidateConfiguration}={}){
 const binding=read(path.join(directory,'cohort-input.json'));validateDivorceCohortBinding(binding,expected,configurationFor);
 const candidates=new Set(),owners=new Set(),proofs=[];
 for(const {facet,fault,browser} of DIVORCE_PROFILE_FACETS){
  const folder=path.join(directory,facet),receipt=read(path.join(folder,'profile-feasibility.json')),input=read(path.join(folder,'profile-input.json'));
  assert.deepEqual(receipt.runtime,binding.runtime,'DIVORCE_COHORT_RUNTIME');
  assert.equal(receipt.facet,facet,'DIVORCE_COHORT_FACET');assert.equal(receipt.status,'feasibility-observed','DIVORCE_COHORT_INCOMPLETE');
  for(const flag of ['runtimeAcceptance','catalogueCredit','wholeProfileSatisfied','releaseCredit'])assert.equal(receipt[flag],false,'DIVORCE_COHORT_PREMATURE_CREDIT');
  assert.equal(receipt.harnessSourceState,'committed','DIVORCE_COHORT_PRODUCER');assert.equal(receipt.harnessCommit,binding.producer.commit,'DIVORCE_COHORT_PRODUCER');
  const sources=Object.fromEntries(PROFILE_SOURCE_FILES.map(name=>[name,binding.producer.files[name]]));assert.deepEqual(receipt.sources,{files:sources,digest:digestBytes(JSON.stringify(sources))},'DIVORCE_COHORT_PRODUCER');
  assert.deepEqual(input.artifact,binding.artifact,'DIVORCE_COHORT_ARTIFACT');assert.deepEqual(receipt.artifact,binding.artifact.identity,'DIVORCE_COHORT_ARTIFACT');assert.deepEqual(input.sources,receipt.sources,'DIVORCE_COHORT_PRODUCER');
  assert.deepEqual(receipt.browser??null,browser?binding.browser:null,'DIVORCE_COHORT_BROWSER');assert.deepEqual(input.browser,browser?binding.browser:null,'DIVORCE_COHORT_BROWSER');
  assert.equal(receipt.owner,binding.owners[facet],'DIVORCE_COHORT_OWNER_BINDING');
  assert(!owners.has(receipt.owner),'DIVORCE_COHORT_OWNER_REUSE');owners.add(receipt.owner);
  const resources=read(path.join(folder,'owned-resources.json'));assert.equal(resources.length,4,'DIVORCE_COHORT_CLEANUP');assert.equal(receipt.cleanup.complete,true,'DIVORCE_COHORT_CLEANUP');assert.equal(receipt.privateStateRemoved,true,'DIVORCE_COHORT_CLEANUP');assert.deepEqual(receipt.cleanup.failureCodes,[],'DIVORCE_COHORT_CLEANUP');
  const results=[];
  for(const invocationId of ['baseline',fault]){
   const mutation=invocationId==='baseline'?null:fault,current=path.join(folder,invocationId),config=configurationFor(binding.artifact.candidateRoot,facet,mutation),configDigest=binding.configurations[facet][invocationId];
   assert.equal(config.digest,configDigest,'DIVORCE_COHORT_FOREIGN_CONFIG');assert.deepEqual(receipt.configuration[invocationId],{digest:configDigest,contract:config.contract},'DIVORCE_COHORT_FOREIGN_CONFIG');assert.deepEqual(input.configurations,receipt.configuration,'DIVORCE_COHORT_FOREIGN_CONFIG');
   const terminal=read(path.join(current,'framework-terminal.json')),captured=read(path.join(current,'cohort-host-terminal.json'));assert.deepEqual(terminal,captured,'DIVORCE_COHORT_TERMINAL');
   const proof=validateProfileInvocationResult({directory:current,invocationId,mutation,identity:binding.artifact.identity,configDigest,sourceDigest:receipt.sources.digest,terminal,facet});results.push(proof);
   const {lifecycle}=validateNativeInvocationFinalization(folder,{invocationId});
   const candidate=resources.find(x=>x.name===`${receipt.owner}-${invocationId}-candidate`),tools=resources.find(x=>x.name===`${receipt.owner}-${invocationId}-tools`);
   assert(candidate&&tools&&candidate.id!==tools.id,'DIVORCE_COHORT_RESOURCE');
   for(const resource of [candidate,tools]){assert.equal(resource.kind,'container','DIVORCE_COHORT_RESOURCE');assert.equal(resource.owner,receipt.owner,'DIVORCE_COHORT_RESOURCE');assert.equal(resource.removed,true,'DIVORCE_COHORT_CLEANUP');assert(/^[a-f0-9]{64}$/.test(resource.id)&&!candidates.has(resource.id),'DIVORCE_COHORT_RESOURCE');candidates.add(resource.id);}
   assert.equal(candidate.image,receipt.runtime.imageId,'DIVORCE_COHORT_RUNTIME');assert.equal(tools.image,browser?binding.browser.image:receipt.runtime.imageId,'DIVORCE_COHORT_RUNTIME');assert.equal(candidate.namespace,tools.id,'DIVORCE_COHORT_RUNTIME');
   const launchProcess=candidateArchiveProcess(config.config,facetSettings(facet).scope);assert.deepEqual(candidate.launchProcess,launchProcess,'DIVORCE_COHORT_FOREIGN_CONFIG');
   const plan=read(path.join(current,'cohort-host-plan.json'));
   assert.deepEqual(plan.candidate,{image:candidate.image,mounts:candidate.mounts,launchProcess},'DIVORCE_COHORT_PLAN');
   assert.equal(plan.tools.image,tools.image,'DIVORCE_COHORT_PLAN');assert.deepEqual(plan.tools.mounts,tools.mounts,'DIVORCE_COHORT_PLAN');
   assert.deepEqual(plan.tools.launchProcess,{entrypoint:['/usr/bin/env'],command:['-i','PATH=/usr/local/bin:/usr/bin:/bin','HOME=/tmp','node','scripts/source-profile-jurisdictions-worker.mjs','--inside-providers','--invocation',invocationId]},'DIVORCE_COHORT_PLAN');
   const targets=candidate.mounts.map(x=>x.target).sort();assert.deepEqual(targets,['/candidate','/diagnostics','/harness-network-guard.cjs','/tmp/.sessions'],'DIVORCE_COHORT_PLAN');
   const mounted=(items,target)=>items.find(x=>x.target===target);
   assert.deepEqual(mounted(candidate.mounts,'/candidate'),{source:binding.artifact.candidateRoot,target:'/candidate',writable:false},'DIVORCE_COHORT_PLAN');
   assert.deepEqual(mounted(tools.mounts,'/candidate'),mounted(candidate.mounts,'/candidate'),'DIVORCE_COHORT_PLAN');
   assert.deepEqual(mounted(tools.mounts,'/output'),{source:folder,target:'/output',writable:true},'DIVORCE_COHORT_PLAN');
   assert.deepEqual(mounted(tools.mounts,'/tmp/.sessions'),mounted(candidate.mounts,'/tmp/.sessions'),'DIVORCE_COHORT_PLAN');
   const sourceMount=mounted(tools.mounts,'/harness');assert(sourceMount&&!sourceMount.writable,'DIVORCE_COHORT_PLAN');
   assert.deepEqual(mounted(candidate.mounts,'/harness-network-guard.cjs'),{source:path.join(sourceMount.source,'scripts/lib/exui-runtime-network-guard.cjs'),target:'/harness-network-guard.cjs',writable:false},'DIVORCE_COHORT_PLAN');
   assert.equal(path.basename(sourceMount.source),'sources','DIVORCE_COHORT_PRIVATE_STATE');const privateState=path.dirname(sourceMount.source);assert(/^profile-native-state-/.test(path.basename(privateState))&&!fs.existsSync(privateState),'DIVORCE_COHORT_PRIVATE_STATE');
   for(const [target,name] of [['/tmp/.sessions','sessions'],['/diagnostics','diagnostics']])assert.deepEqual(mounted(candidate.mounts,target),{source:path.join(privateState,invocationId,name),target,writable:true},'DIVORCE_COHORT_PLAN');
   assert.deepEqual(tools.mounts.map(x=>x.target).sort(),(browser?['/browser','/harness/node_modules','/harness','/candidate','/output','/tmp/.sessions']:['/harness','/candidate','/output','/tmp/.sessions']).sort(),'DIVORCE_COHORT_PLAN');
   if(browser)for(const [target,source] of [['/browser',binding.browser.root],['/harness/node_modules',binding.browser.dependenciesRoot]])assert.deepEqual(mounted(tools.mounts,target),{source,target,writable:false},'DIVORCE_COHORT_PLAN');
   assert.equal(lifecycle.before.Id,candidate.id,'DIVORCE_COHORT_RUNTIME');assert.equal(lifecycle.after.Id,candidate.id,'DIVORCE_COHORT_RUNTIME');
   assertOwnedContainer(lifecycle.before,{...candidate,launchProcess,running:true});assertOwnedContainer(lifecycle.after,{...candidate,launchProcess,running:false});
   const runtime=read(path.join(current,'runtime-identity.json'));assert.deepEqual(runtime.identity,binding.artifact.identity,'DIVORCE_COHORT_ARTIFACT');assert.equal(runtime.payloadDigest,binding.artifact.payloadDigest,'DIVORCE_COHORT_ARTIFACT');assert.equal(runtime.candidateContainerId,candidate.id,'DIVORCE_COHORT_RUNTIME');assert.equal(runtime.observedImageId,candidate.image,'DIVORCE_COHORT_RUNTIME');
   assert.deepEqual(read(path.join(current,'provider-stopped.json')),{closed:true,requestedSignal:'SIGTERM'},'DIVORCE_COHORT_PROVIDER_SHUTDOWN');
   const rejected=path.join(current,'provider-rejections.jsonl');assert(!fs.existsSync(rejected)||fs.readFileSync(rejected,'utf8').trim()==='','DIVORCE_COHORT_PROVIDER_REJECTION');
   if(facet==='wa-health')assert.deepEqual(read(path.join(current,'profile-health-observations.json')).journal,read(path.join(current,'profile-health-destinations.json')),'DIVORCE_COHORT_LATE_JOURNAL');
   if(browser){
    const assetRoot=fs.realpathSync(path.join(binding.artifact.candidateRoot,'dist/rpx-exui/browser'));
    const assets=read(path.join(current,'profile-browser-assets.json'));
    for(const witness of [binding.fallback.route.main,binding.fallback.route.guard])assert(assets.some(asset=>asset.path==='/'+path.basename(witness.path)&&asset.digest===witness.digest),'DIVORCE_COHORT_ROUTE_ASSETS');
    for(const asset of assets){const file=path.resolve(assetRoot,'.'+asset.path);assert(file.startsWith(assetRoot+path.sep)&&fs.realpathSync(file).startsWith(assetRoot+path.sep),'DIVORCE_COHORT_ASSET_PATH');assert.equal(digestBytes(fs.readFileSync(file)),asset.digest,'DIVORCE_COHORT_ASSET_BYTES');}
   }
  }
  assert.deepEqual(receipt.invocations,results,'DIVORCE_COHORT_RESULT');
  assert.deepEqual(receipt.cleanup.containers,resources.map(x=>({name:x.name,id:x.id,removed:true})),'DIVORCE_COHORT_CLEANUP');
  proofs.push({facet,invocations:results,evidence:sealedFiles(folder)});
 }
 assert.equal(candidates.size,24,'DIVORCE_COHORT_RESOURCE');
 return {schemaVersion:1,status:'validated-for-independent-review',obligationId:binding.contract.obligationId,contractDigest:binding.contractDigest,bindingDigest:digestBytes(JSON.stringify(binding)),proofs,catalogueCredit:false,wholeProfileSatisfied:false,releaseCredit:false,releaseApproval:false};
}
export function validateDivorceCohortSeal(directory,receipt,expected){
 assert(hash.test(receipt.bindingDigest),'DIVORCE_COHORT_BINDING');const observed=readDivorceCohort(directory,expected);assert.deepEqual(receipt,observed,'DIVORCE_COHORT_SEAL');return observed;
}
