import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {digestBytes} from './exui-evidence-io.mjs';
import {ST_CIC_PROFILE_FACETS,stCicProfileContract,stCicProfileContractDigest} from './exui-st-cic-profile-contract.mjs';
import {PROFILE_SOURCE_FILES} from './exui-source-profile-sources.mjs';
import {facetSettings,validateProfileInvocationResult} from '../run-harness-source-profile-jurisdictions.mjs';
import {validateNativeInvocationFinalization} from './exui-native-ci-ownership.mjs';
import {assertOwnedContainer,candidateArchiveProcess} from './exui-oci-runtime.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)).replace(/\/$/,'');
const read=file=>{assert(fs.lstatSync(file).isFile()&&fs.realpathSync(file)===file,'ST_CIC_COHORT_EVIDENCE_ALIAS');return JSON.parse(fs.readFileSync(file));};
const hash=/^sha256:[a-f0-9]{64}$/;
export const ST_CIC_COHORT_FILES=Object.freeze([...new Set([...PROFILE_SOURCE_FILES,'scripts/lib/exui-st-cic-profile-cohort.mjs','scripts/lib/exui-st-cic-profile-admission.mjs','scripts/run-harness-st-cic-profile.mjs','scripts/run-harness-st-cic-profile-admission.mjs'])]);
export function stCicProducerBinding(sourceRoot=root){
 const git=args=>execFileSync('git',args,{cwd:sourceRoot,encoding:'utf8'}).trim();
 assert.equal(git(['status','--porcelain','--untracked-files=all','--',...ST_CIC_COHORT_FILES]),'','ST_CIC_COHORT_COMMITTED_SOURCE');
 const files=Object.fromEntries(ST_CIC_COHORT_FILES.map(name=>{const file=path.join(sourceRoot,name);assert(fs.lstatSync(file).isFile()&&fs.realpathSync(file)===file,'ST_CIC_COHORT_SOURCE_ALIAS');return [name,digestBytes(fs.readFileSync(file))];}));
 return {commit:git(['rev-parse','HEAD']),files,digest:digestBytes(JSON.stringify(files))};
}
export function stCicFallbackWitness(candidateRoot){
 const relative='node_modules/@hmcts/rpx-xui-common-lib/fesm2022/hmcts-rpx-xui-common-lib.mjs',bytes=fs.readFileSync(path.join(candidateRoot,relative)),source=bytes.toString();
 assert(source.includes('initialize(this.clientId, this.context, { useReport: true })')&&source.includes('this.featureToggleService.getValueOnce(feature, true)')&&source.includes('return this.ready.pipe(filter((ready) => ready), map(() => this.client.variation(feature, defaultValue)));'),'ST_CIC_COHORT_FLAG_FALLBACK');
 const mainPath='dist/rpx-exui/browser/main-HYPXLXEP.js',guardPath='dist/rpx-exui/browser/chunk-LZSBXBQ2.js';
 const main=fs.readFileSync(path.join(candidateRoot,mainPath)),guard=fs.readFileSync(path.join(candidateRoot,guardPath));
 const route='{path:"search",canActivate:[H,Z,Xt],loadChildren:()=>import("./chunk-DILEIFDO.js").then(o=>o.SearchModule),data:{title:"Search cases",needsFeaturesEnabled:["feature-global-search"],featureDisabledRedirect:"/"}}';
 assert(main.toString().includes(route)&&/import\{[^}]*Bd as Xt[^}]*\}from"\.\/chunk-LZSBXBQ2\.js"/.test(main.toString()),'ST_CIC_COHORT_FLAG_ROUTE');
 assert(guard.toString().includes('baseUrl:{default:"https://app.launchdarkly.com"}')&&guard.toString().includes('h=[i,"/sdk/evalx/",e,"/context"].join("")'),'ST_CIC_COHORT_FLAG_ENDPOINT');
 assert(guard.toString().includes('ugi as Bd')&&guard.toString().includes('ugi=(()=>{class t{constructor(e,i){this.featureToggleService=e,this.router=i}canActivate(e){return vs([...e.data.needsFeaturesEnabled.map(i=>this.featureToggleService.getValueOnce(i,!0))])'),'ST_CIC_COHORT_FLAG_ROUTE');
 return {path:relative,digest:digestBytes(bytes),flag:'feature-global-search',guardDefault:true,evaluationRequest:{origin:'https://app.launchdarkly.com',method:'REPORT',path:'/sdk/evalx/synthetic-flags/context'},evaluationFlags:{},liveProvider:false,route:{path:'/search',main:{path:mainPath,digest:digestBytes(main)},guard:{path:guardPath,digest:digestBytes(guard)},localAlias:'Xt',moduleExport:'Bd',guardSymbol:'ugi'}};
}
const candidateConfiguration=(candidateRoot,facet,mutation=null)=>facetSettings(facet).configuration(candidateRoot,mutation);
export function stCicConfigurationBindings(candidateRoot){
 const result={};let baseline;
 for(const {facet,fault} of ST_CIC_PROFILE_FACETS){
  const base=candidateConfiguration(candidateRoot,facet,null),mutant=candidateConfiguration(candidateRoot,facet,fault);
  baseline??=base.config;assert.deepEqual(base.config,baseline,'ST_CIC_COHORT_BASELINE_CONFIG');assert.equal(base.config.feature.workAllocationEnabled,false,'ST_CIC_COHORT_BASELINE_CONFIG');
  // Independent, finite mutation reconstruction: no production mutation helper supplies the oracle.
  const expected=structuredClone(baseline);
  if(facet==='st-cic-global-search')expected.globalSearchServices=expected.globalSearchServices.split(',').filter(id=>id!=='ST_CIC').join(',');
  if(facet==='st-cic-staff')expected.staffSupportedJurisdictions=expected.staffSupportedJurisdictions.split(',').filter(id=>id!=='ST_CIC').join(',');
  if(facet==='st-cic-mapping')expected.serviceRefDataMapping=expected.serviceRefDataMapping.map(row=>row.service==='ST_CIC'?{...row,serviceCodes:['ZZZ1']}:row);
  if(facet==='st-cic-wa')expected.waSupportedJurisdictions=expected.waSupportedJurisdictions.split(',').filter(id=>id!=='ST_CIC').join(',');
  if(facet==='st-cic-wa-health')expected.feature.workAllocationEnabled=true;
  assert.deepEqual(mutant.config,expected,'ST_CIC_COHORT_FOREIGN_CONFIG');
  result[facet]={baseline:base.digest,[fault]:mutant.digest};
 }
 return result;
}
export function validateStCicCohortBinding(binding,{artifact,producer,runtime,browser,owners}){
 assert.deepEqual(Object.keys(binding).sort(),['artifact','browser','configurations','contract','contractDigest','fallback','owners','producer','runtime','schemaVersion'],'ST_CIC_COHORT_BINDING');
 assert.equal(artifact.provenance.webappCommit,stCicProfileContract().consumerRevision,'ST_CIC_COHORT_CONSUMER');assert.equal(artifact.provenance.sourceMethod,'git-archive','ST_CIC_COHORT_CONSUMER');assert.equal(artifact.identity.webappCommit,artifact.provenance.webappCommit,'ST_CIC_COHORT_CONSUMER');
 assert(['linux/arm64','linux/amd64'].includes(runtime.platform)&&runtime.platform===artifact.provenance.platform,'ST_CIC_COHORT_RUNTIME');
 assert.deepEqual(binding.owners,owners,'ST_CIC_COHORT_OWNERS');assert.deepEqual(Object.keys(owners),ST_CIC_PROFILE_FACETS.map(x=>x.facet),'ST_CIC_COHORT_OWNERS');
 assert(new Set(Object.values(owners)).size===5&&Object.values(owners).every(owner=>/^candidate-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(owner)),'ST_CIC_COHORT_OWNERS');
 assert(/^[a-f0-9]{40}$/.test(producer.commit)&&Object.values(producer.files).every(value=>hash.test(value)),'ST_CIC_COHORT_PRODUCER');
 assert.deepEqual(Object.keys(producer.files).sort(),[...ST_CIC_COHORT_FILES].sort(),'ST_CIC_COHORT_PRODUCER');assert.equal(producer.digest,digestBytes(JSON.stringify(producer.files)),'ST_CIC_COHORT_PRODUCER');
 assert.equal(binding.schemaVersion,1,'ST_CIC_COHORT_BINDING');assert.deepEqual(binding.artifact,artifact,'ST_CIC_COHORT_ARTIFACT');assert.deepEqual(binding.producer,producer,'ST_CIC_COHORT_PRODUCER');assert.deepEqual(binding.browser,browser,'ST_CIC_COHORT_BROWSER');assert.deepEqual(binding.runtime,runtime,'ST_CIC_COHORT_RUNTIME');
 assert.deepEqual(binding.contract,stCicProfileContract(),'ST_CIC_COHORT_CONTRACT');assert.equal(binding.contractDigest,stCicProfileContractDigest(),'ST_CIC_COHORT_CONTRACT');
 assert.deepEqual(binding.configurations,stCicConfigurationBindings(artifact.candidateRoot),'ST_CIC_COHORT_FOREIGN_CONFIG');
 assert.deepEqual(binding.fallback,stCicFallbackWitness(artifact.candidateRoot),'ST_CIC_COHORT_FLAG_FALLBACK');
}
function sealedFiles(directory){
 assert(fs.realpathSync(directory)===directory&&fs.lstatSync(directory).isDirectory(),'ST_CIC_COHORT_EVIDENCE_ALIAS');
 const files={};const visit=relative=>{for(const name of fs.readdirSync(path.join(directory,relative)).sort()){
  const key=relative?relative+'/'+name:name,file=path.join(directory,key),stat=fs.lstatSync(file);assert(!stat.isSymbolicLink(),'ST_CIC_COHORT_EVIDENCE_ALIAS');
  if(stat.isDirectory()){files[key+'/']='directory';visit(key);}else if(stat.isFile())files[key]=digestBytes(fs.readFileSync(file));else assert.fail('ST_CIC_COHORT_EVIDENCE_ALIAS');
 }};visit('');return files;
}
function invocationInventory(current,facet){
 const allowed=new Set(['cohort-host-plan.json','cohort-host-terminal.json','cohort-host-tools.json','framework-terminal.json','profile-worker-result.json','provider-ready.json','provider-stopped.json','manifest.json','runtime-identity.json','candidate-lifecycle.json','candidate-write-denial.json','resources.json','profile-st-cic-destinations.json','profile-st-cic-support.json','provider-requests.jsonl','playwright.log','candidate-container.log','browser-provider-container.log']);
 if(facet==='st-cic-global-search')for(const name of ['profile-browser-flags.json','profile-browser-report.json','profile-browser-terminal.json','profile-browser-observation.json','profile-browser-assets.json','profile-browser-rejections.json','profile-st-cic-selection.json','browser-output'])allowed.add(name);
 else allowed.add(facet==='st-cic-wa-health'?'profile-st-cic-health.json':'profile-st-cic-observations.json');
 for(const name of fs.readdirSync(current)){const file=path.join(current,name),info=fs.lstatSync(file);assert(!info.isSymbolicLink(),'ST_CIC_COHORT_EVIDENCE_ALIAS');if(info.isDirectory())assert(facet==='st-cic-global-search'&&name==='browser-output','ST_CIC_COHORT_INVENTORY');else assert(info.isFile()&&allowed.has(name),'ST_CIC_COHORT_INVENTORY');}
}
export function readStCicCohort(directory,expected){
 assert(fs.realpathSync(directory)===directory&&fs.lstatSync(directory).isDirectory(),'ST_CIC_COHORT_EVIDENCE_ALIAS');
 assert.deepEqual(fs.readdirSync(directory).filter(name=>name!=='st-cic-profile-cohort.json').sort(),['cohort-input.json',...ST_CIC_PROFILE_FACETS.map(x=>x.facet)].sort(),'ST_CIC_COHORT_INVENTORY');
 for(const {facet} of ST_CIC_PROFILE_FACETS)sealedFiles(path.join(directory,facet));
 const binding=read(path.join(directory,'cohort-input.json'));validateStCicCohortBinding(binding,expected);
 const candidates=new Set(),owners=new Set(),privateStates=new Set(),proofs=[];
 for(const {facet,fault,browser} of ST_CIC_PROFILE_FACETS){
  const folder=path.join(directory,facet);assert.deepEqual(fs.readdirSync(folder).sort(),['baseline',fault,'profile-input.json','profile-feasibility.json','owned-resources.json'].sort(),'ST_CIC_COHORT_INVENTORY');
  const receipt=read(path.join(folder,'profile-feasibility.json')),input=read(path.join(folder,'profile-input.json'));
  assert.deepEqual(receipt.runtime,binding.runtime,'ST_CIC_COHORT_RUNTIME');
  assert.equal(receipt.facet,facet,'ST_CIC_COHORT_FACET');assert.equal(receipt.status,'feasibility-observed','ST_CIC_COHORT_INCOMPLETE');
  for(const flag of ['runtimeAcceptance','catalogueCredit','wholeProfileSatisfied','releaseCredit'])assert.equal(receipt[flag],false,'ST_CIC_COHORT_PREMATURE_CREDIT');
  assert.equal(receipt.harnessSourceState,'committed','ST_CIC_COHORT_PRODUCER');assert.equal(receipt.harnessCommit,binding.producer.commit,'ST_CIC_COHORT_PRODUCER');
  const sources=Object.fromEntries(PROFILE_SOURCE_FILES.map(name=>[name,binding.producer.files[name]]));assert.deepEqual(receipt.sources,{files:sources,digest:digestBytes(JSON.stringify(sources))},'ST_CIC_COHORT_PRODUCER');
  assert.deepEqual(input,{scope:facetSettings(facet).scope,facet,artifact:binding.artifact,browser:browser?binding.browser:null,sources:receipt.sources,configurations:receipt.configuration,runtimeAcceptance:false,catalogueCredit:false,wholeProfileSatisfied:false,releaseCredit:false},'ST_CIC_COHORT_INPUT');
  assert.deepEqual(input.artifact,binding.artifact,'ST_CIC_COHORT_ARTIFACT');assert.deepEqual(receipt.artifact,binding.artifact.identity,'ST_CIC_COHORT_ARTIFACT');assert.deepEqual(input.sources,receipt.sources,'ST_CIC_COHORT_PRODUCER');
  assert.deepEqual(receipt.browser??null,browser?binding.browser:null,'ST_CIC_COHORT_BROWSER');assert.deepEqual(input.browser,browser?binding.browser:null,'ST_CIC_COHORT_BROWSER');
  assert.equal(receipt.owner,binding.owners[facet],'ST_CIC_COHORT_OWNER_BINDING');
  assert(!owners.has(receipt.owner),'ST_CIC_COHORT_OWNER_REUSE');owners.add(receipt.owner);
  const resources=read(path.join(folder,'owned-resources.json'));assert.equal(resources.length,4,'ST_CIC_COHORT_CLEANUP');assert.equal(receipt.cleanup.complete,true,'ST_CIC_COHORT_CLEANUP');assert.equal(receipt.privateStateRemoved,true,'ST_CIC_COHORT_CLEANUP');assert.deepEqual(receipt.cleanup.failureCodes,[],'ST_CIC_COHORT_CLEANUP');
  const results=[];let facetState;
  for(const invocationId of ['baseline',fault]){
   const mutation=invocationId==='baseline'?null:fault,current=path.join(folder,invocationId),config=candidateConfiguration(binding.artifact.candidateRoot,facet,mutation),configDigest=binding.configurations[facet][invocationId];
   invocationInventory(current,facet);
   assert.equal(config.digest,configDigest,'ST_CIC_COHORT_FOREIGN_CONFIG');assert.deepEqual(receipt.configuration[invocationId],{digest:configDigest,contract:config.contract},'ST_CIC_COHORT_FOREIGN_CONFIG');assert.deepEqual(input.configurations,receipt.configuration,'ST_CIC_COHORT_FOREIGN_CONFIG');
   const terminal=read(path.join(current,'framework-terminal.json')),captured=read(path.join(current,'cohort-host-terminal.json'));assert.deepEqual(terminal,captured,'ST_CIC_COHORT_TERMINAL');
   const proof=validateProfileInvocationResult({directory:current,invocationId,mutation,identity:binding.artifact.identity,configDigest,sourceDigest:receipt.sources.digest,terminal,facet,candidateRoot:binding.artifact.candidateRoot});results.push(proof);
   const {lifecycle,denial}=validateNativeInvocationFinalization(folder,{invocationId});
   const candidate=resources.find(x=>x.name===`${receipt.owner}-${invocationId}-candidate`),tools=resources.find(x=>x.name===`${receipt.owner}-${invocationId}-tools`);
   assert.equal(candidate?.service,'candidate','ST_CIC_COHORT_RESOURCE');assert.equal(tools?.service,'browser-provider','ST_CIC_COHORT_RESOURCE');
   assert(candidate&&tools&&candidate.id!==tools.id,'ST_CIC_COHORT_RESOURCE');assert.equal(denial.candidateId,candidate.id,'ST_CIC_COHORT_WRITE_DENIAL');
   for(const resource of [candidate,tools]){assert.equal(resource.kind,'container','ST_CIC_COHORT_RESOURCE');assert.equal(resource.owner,receipt.owner,'ST_CIC_COHORT_RESOURCE');assert.equal(resource.removed,true,'ST_CIC_COHORT_CLEANUP');assert(/^[a-f0-9]{64}$/.test(resource.id)&&!candidates.has(resource.id),'ST_CIC_COHORT_RESOURCE');candidates.add(resource.id);}
   assert.equal(candidate.image,receipt.runtime.imageId,'ST_CIC_COHORT_RUNTIME');assert.equal(tools.image,browser?binding.browser.image:receipt.runtime.imageId,'ST_CIC_COHORT_RUNTIME');assert.equal(candidate.namespace,tools.id,'ST_CIC_COHORT_RUNTIME');
   const launchProcess=candidateArchiveProcess(config.config,facetSettings(facet).scope);assert.deepEqual(candidate.launchProcess,launchProcess,'ST_CIC_COHORT_FOREIGN_CONFIG');
   const plan=read(path.join(current,'cohort-host-plan.json'));
   assert.deepEqual(plan.candidate,{image:candidate.image,mounts:candidate.mounts,launchProcess},'ST_CIC_COHORT_PLAN');
   assert.equal(plan.tools.image,tools.image,'ST_CIC_COHORT_PLAN');assert.deepEqual(plan.tools.mounts,tools.mounts,'ST_CIC_COHORT_PLAN');
   assert.deepEqual(plan.tools.launchProcess,{entrypoint:['/usr/bin/env'],command:['-i','PATH=/usr/local/bin:/usr/bin:/bin','HOME=/tmp','node','scripts/source-profile-jurisdictions-worker.mjs','--inside-providers','--invocation',invocationId]},'ST_CIC_COHORT_PLAN');
   const targets=candidate.mounts.map(x=>x.target).sort();assert.deepEqual(targets,['/candidate','/diagnostics','/harness-network-guard.cjs','/tmp/.sessions'],'ST_CIC_COHORT_PLAN');
   const mounted=(items,target)=>items.find(x=>x.target===target);
   assert.deepEqual(mounted(candidate.mounts,'/candidate'),{source:binding.artifact.candidateRoot,target:'/candidate',writable:false},'ST_CIC_COHORT_PLAN');
   assert.deepEqual(mounted(tools.mounts,'/candidate'),mounted(candidate.mounts,'/candidate'),'ST_CIC_COHORT_PLAN');
   assert.deepEqual(mounted(tools.mounts,'/output'),{source:folder,target:'/output',writable:true},'ST_CIC_COHORT_PLAN');
   assert.deepEqual(mounted(tools.mounts,'/tmp/.sessions'),mounted(candidate.mounts,'/tmp/.sessions'),'ST_CIC_COHORT_PLAN');
   const sourceMount=mounted(tools.mounts,'/harness');assert(sourceMount&&!sourceMount.writable,'ST_CIC_COHORT_PLAN');
   assert.deepEqual(mounted(candidate.mounts,'/harness-network-guard.cjs'),{source:path.join(sourceMount.source,'scripts/lib/exui-runtime-network-guard.cjs'),target:'/harness-network-guard.cjs',writable:false},'ST_CIC_COHORT_PLAN');
   assert.equal(path.basename(sourceMount.source),'sources','ST_CIC_COHORT_PRIVATE_STATE');const privateState=path.dirname(sourceMount.source);assert(path.dirname(privateState)===fs.realpathSync(os.tmpdir())&&/^profile-native-state-/.test(path.basename(privateState))&&!fs.existsSync(privateState),'ST_CIC_COHORT_PRIVATE_STATE');if(facetState===undefined){assert(!privateStates.has(privateState),'ST_CIC_COHORT_PRIVATE_STATE');privateStates.add(privateState);facetState=privateState;}else assert.equal(privateState,facetState,'ST_CIC_COHORT_PRIVATE_STATE');
   for(const [target,name] of [['/tmp/.sessions','sessions'],['/diagnostics','diagnostics']])assert.deepEqual(mounted(candidate.mounts,target),{source:path.join(privateState,invocationId,name),target,writable:true},'ST_CIC_COHORT_PLAN');
   assert.deepEqual(tools.mounts.map(x=>x.target).sort(),(browser?['/browser','/harness/node_modules','/harness','/candidate','/output','/tmp/.sessions']:['/harness','/candidate','/output','/tmp/.sessions']).sort(),'ST_CIC_COHORT_PLAN');
   if(browser)for(const [target,source] of [['/browser',binding.browser.root],['/harness/node_modules',binding.browser.dependenciesRoot]])assert.deepEqual(mounted(tools.mounts,target),{source,target,writable:false},'ST_CIC_COHORT_PLAN');
   const inspected=read(path.join(current,'cohort-host-tools.json'));assert.deepEqual(Object.keys(inspected).sort(),['schemaVersion','invocationId','terminal','observations'].sort(),'ST_CIC_COHORT_TOOLS');assert.equal(inspected.schemaVersion,1,'ST_CIC_COHORT_TOOLS');assert.equal(inspected.invocationId,invocationId,'ST_CIC_COHORT_TOOLS');assert.deepEqual(inspected.terminal,captured,'ST_CIC_COHORT_TOOLS');
   assert(Array.isArray(inspected.observations)&&inspected.observations.length>=2,'ST_CIC_COHORT_TOOLS');
   for(const row of inspected.observations){assert.deepEqual(row,{id:tools.id,name:'/'+tools.name,owner:tools.owner,service:'browser-provider',image:tools.image,network:'none',running:row.running,exitCode:row.exitCode,oomKilled:false,restartCount:0},'ST_CIC_COHORT_TOOLS');assert.equal(typeof row.running,'boolean','ST_CIC_COHORT_TOOLS');assert.equal(row.exitCode,0,'ST_CIC_COHORT_TOOLS');}
   assert.equal(inspected.observations[0].running,true,'ST_CIC_COHORT_TOOLS');assert.equal(inspected.observations.at(-1).running,false,'ST_CIC_COHORT_TOOLS');
   assert.equal(lifecycle.before.Id,candidate.id,'ST_CIC_COHORT_RUNTIME');assert.equal(lifecycle.after.Id,candidate.id,'ST_CIC_COHORT_RUNTIME');
   assertOwnedContainer(lifecycle.before,{...candidate,launchProcess,running:true});assertOwnedContainer(lifecycle.after,{...candidate,launchProcess,running:false});
   const runtime=read(path.join(current,'runtime-identity.json'));assert.deepEqual(runtime.identity,binding.artifact.identity,'ST_CIC_COHORT_ARTIFACT');assert.equal(runtime.payloadDigest,binding.artifact.payloadDigest,'ST_CIC_COHORT_ARTIFACT');assert.equal(runtime.candidateContainerId,candidate.id,'ST_CIC_COHORT_RUNTIME');assert.equal(runtime.observedImageId,candidate.image,'ST_CIC_COHORT_RUNTIME');assert.equal(runtime.runtime.platform,'linux','ST_CIC_COHORT_RUNTIME');assert.equal(runtime.runtime.architecture,{'linux/arm64':'arm64','linux/amd64':'x64'}[binding.runtime.platform],'ST_CIC_COHORT_RUNTIME');assert.equal(runtime.runtime.nodeVersion,binding.artifact.provenance.runtimeNodeVersion,'ST_CIC_COHORT_RUNTIME');assert(/^ID=debian$/m.test(runtime.runtime.osRelease)&&/^VERSION_CODENAME=bookworm$/m.test(runtime.runtime.osRelease),'ST_CIC_COHORT_RUNTIME');
   assert.deepEqual(read(path.join(current,'manifest.json')),{schemaVersion:1,kind:'source-profile-feasibility-invocation',scope:facetSettings(facet).scope,invocationId,identity:binding.artifact.identity,configDigest,runtimeMetadata:{candidateAuthorityIsolation:'separate-container-no-evidence-mount',candidateRuntimeNodeVersion:binding.artifact.provenance.runtimeNodeVersion,candidateObservedImageId:candidate.image},runtimeAcceptance:false,catalogueCredit:false,wholeProfileSatisfied:false,releaseCredit:false},'ST_CIC_COHORT_MANIFEST');
   assert.deepEqual(read(path.join(current,'provider-stopped.json')),{closed:true,requestedSignal:'SIGTERM'},'ST_CIC_COHORT_PROVIDER_SHUTDOWN');
   for(const name of ['provider-rejections.jsonl','unhandled-provider.jsonl','gateway-errors.jsonl','network-rejections.jsonl'])assert(!fs.existsSync(path.join(current,name)),'ST_CIC_COHORT_PROVIDER_REJECTION');
   // Raw replay above compares persisted full health/API/G journals after provider shutdown.
   if(browser){
    const assetRoot=fs.realpathSync(path.join(binding.artifact.candidateRoot,'dist/rpx-exui/browser'));
    const assets=read(path.join(current,'profile-browser-assets.json'));
    for(const witness of [binding.fallback.route.main,binding.fallback.route.guard])assert(assets.some(asset=>asset.path==='/'+path.basename(witness.path)&&asset.digest===witness.digest),'ST_CIC_COHORT_ROUTE_ASSETS');
    for(const asset of assets){const file=path.resolve(assetRoot,'.'+asset.path);assert(file.startsWith(assetRoot+path.sep)&&fs.realpathSync(file).startsWith(assetRoot+path.sep),'ST_CIC_COHORT_ASSET_PATH');assert.equal(digestBytes(fs.readFileSync(file)),asset.digest,'ST_CIC_COHORT_ASSET_BYTES');}
   }
  }
  assert.deepEqual(receipt.invocations,results,'ST_CIC_COHORT_RESULT');
  assert.deepEqual(receipt.cleanup.containers,resources.map(x=>({name:x.name,id:x.id,removed:true})),'ST_CIC_COHORT_CLEANUP');
  proofs.push({facet,invocations:results,evidence:sealedFiles(folder)});
 }
 assert.equal(privateStates.size,5,'ST_CIC_COHORT_PRIVATE_STATE');
 assert.equal(candidates.size,20,'ST_CIC_COHORT_RESOURCE');
 return {runtimeAcceptance:false,schemaVersion:1,status:'validated-for-independent-review',obligationId:binding.contract.obligationId,contractDigest:binding.contractDigest,bindingDigest:digestBytes(JSON.stringify(binding)),proofs,catalogueCredit:false,wholeProfileSatisfied:false,releaseCredit:false,releaseApproval:false};
}
export function validateStCicCohortSeal(directory,receipt,expected){
 assert(hash.test(receipt.bindingDigest),'ST_CIC_COHORT_BINDING');const observed=readStCicCohort(directory,expected);assert.deepEqual(receipt,observed,'ST_CIC_COHORT_SEAL');return observed;
}
