#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {verifyCandidateArtifact,assertFreshCandidateDerivationOutput,digestCandidateTree} from './lib/exui-candidate-artifact.mjs';
import {inspectNativeApiRuntime,inspectNativeBrowserRuntime} from './lib/exui-native-containers.mjs';
import {runHostInvocation,removeHostResource,inspectHostContainer} from './lib/exui-host-invocation.mjs';
import {assertReadOnlyMountIsolation,candidateArchiveProcess,installCancellationCleanup,browserExecutable} from './lib/exui-oci-runtime.mjs';
import {digestBytes,writeJsonAtomic} from './lib/exui-evidence-io.mjs';
import {sourceProfileJurisdictionConfiguration,validateProfileJurisdictionObservations,SOURCE_PROFILE_JURISDICTION_SCOPE,SOURCE_PROFILE_JURISDICTION_FAULT} from './lib/exui-source-profile-jurisdictions.mjs';
import {PROFILE_SOURCE_FILES,stageProfileSources,verifyProfileSources,profileFailureCode} from './lib/exui-source-profile-sources.mjs';
import {WA_HEALTH_SCOPE,WA_HEALTH_FAULT,sourceProfileWaHealthConfiguration,validateWaHealthObservations} from './lib/exui-source-profile-wa-health.mjs';
import {DIVORCE_WA_SCOPE,DIVORCE_WA_FAULT,WA_MEMBERSHIP_SCOPE,WA_MEMBERSHIP_FAULT,sourceProfileWaMembershipConfiguration,validateWaMembershipObservations} from './lib/exui-source-profile-wa-membership.mjs';
import {DIVORCE_CONSUMERS,divorceConsumerConfiguration,validateDivorceConsumerObservations} from './lib/exui-source-profile-divorce-consumers.mjs';
import {divorceBrowserConfiguration} from './lib/exui-divorce-profile-contract.mjs';
import {readDivorceBrowserEvidence,divorceBrowserEvidenceDigest} from './lib/exui-divorce-profile-browser.mjs';
import {verifyHarnessDependencies} from './lib/exui-harness-dependencies.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)).replace(/\/$/,'');
const read=file=>JSON.parse(fs.readFileSync(file));
export const facetSettings=facet=>{assert(['jurisdictions','wa-health','wa-membership','divorce-staff','divorce-mapping','divorce-wa','divorce-jurisdiction','divorce-global-search'].includes(facet),'SOURCE_PROFILE_INPUT_INVALID');if(['divorce-jurisdiction','divorce-global-search'].includes(facet))return {scope:`exui-${facet}-feasibility`,fault:facet==='divorce-jurisdiction'?SOURCE_PROFILE_JURISDICTION_FAULT:'source-profile-drop-divorce-global-search',configuration:(root,mutation)=>divorceBrowserConfiguration(root,facet,mutation)};if(facet==='divorce-wa')return{scope:DIVORCE_WA_SCOPE,fault:DIVORCE_WA_FAULT,configuration:(root,mutation)=>sourceProfileWaMembershipConfiguration(root,mutation,'DIVORCE')};if(facet.startsWith('divorce-')){const key=facet.slice(8);return {...DIVORCE_CONSUMERS[key],configuration:(root,mutation)=>divorceConsumerConfiguration(root,key,mutation)};}return facet==='wa-membership'?{scope:WA_MEMBERSHIP_SCOPE,fault:WA_MEMBERSHIP_FAULT,configuration:sourceProfileWaMembershipConfiguration}:facet==='wa-health'?{scope:WA_HEALTH_SCOPE,fault:WA_HEALTH_FAULT,configuration:sourceProfileWaHealthConfiguration}:{scope:SOURCE_PROFILE_JURISDICTION_SCOPE,fault:SOURCE_PROFILE_JURISDICTION_FAULT,configuration:sourceProfileJurisdictionConfiguration};};
const credits={runtimeAcceptance:false,catalogueCredit:false,wholeProfileSatisfied:false,releaseCredit:false};
const hardened=['--init','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--pids-limit','256','--memory','4g','--cpus','2','--tmpfs','/tmp:rw,nosuid,size=512m'];
const mount=(source,target,writable)=>({source:fs.realpathSync(source),target,writable});
const mountArgs=mounts=>mounts.flatMap(item=>{
  assert(path.isAbsolute(item.source)&&!/[\r\n,]/.test(item.source),'SOURCE_PROFILE_INPUT_INVALID');
  return ['--mount',`type=bind,src=${item.source},dst=${item.target}${item.writable?'':',readonly'}`];
});
export function profileInvocationPlan({owner,invocationId,artifact,runtime,config,output,sources,sessions,diagnostics,facet='jurisdictions',browser=null}) {
  const {scope,fault}=facetSettings(facet),ids=['baseline',fault];
  assert(/^candidate-[a-f0-9-]+$/.test(owner)&&ids.includes(invocationId),'SOURCE_PROFILE_INVOCATION_INVALID');
  assert(['linux/arm64','linux/amd64'].includes(runtime.platform)&&runtime.platform===artifact.provenance.platform,'SOURCE_PROFILE_RUNTIME_PLATFORM');
  assert(/^sha256:[a-f0-9]{64}$/.test(runtime.imageId),'SOURCE_PROFILE_INPUT_INVALID');
  assert(/^v\d+\.\d+\.\d+$/.test(artifact.provenance.runtimeNodeVersion),'SOURCE_PROFILE_INPUT_INVALID');
  const candidateRoot=artifact.candidateRoot,guard=path.join(sources,'scripts/lib/exui-runtime-network-guard.cjs');
  assertReadOnlyMountIsolation([candidateRoot,sources],[output,sessions,diagnostics]);
  assertReadOnlyMountIsolation([output],[sessions,diagnostics]);
  const toolsMounts=[...(browser?[mount(browser.root,'/browser',false),mount(browser.dependenciesRoot,'/harness/node_modules',false)]:[]),mount(sources,'/harness',false),mount(candidateRoot,'/candidate',false),mount(output,'/output',true),mount(sessions,'/tmp/.sessions',true)];
  if(browser)assertReadOnlyMountIsolation([browser.root,browser.dependenciesRoot],[output,sessions,diagnostics]);
  const candidateMounts=[mount(candidateRoot,'/candidate',false),mount(sessions,'/tmp/.sessions',true),mount(diagnostics,'/diagnostics',true),mount(guard,'/harness-network-guard.cjs',false)];
  const base=service=>['create','--user',`${process.getuid()}:${process.getgid()}`,'--platform',runtime.platform,...hardened,'--label',`exui.harness.owner=${owner}`,'--label',`exui.harness.service=${service}`];
  const toolsProcess={entrypoint:['/usr/bin/env'],command:['-i','PATH=/usr/local/bin:/usr/bin:/bin','HOME=/tmp','node','scripts/source-profile-jurisdictions-worker.mjs','--inside-providers','--invocation',invocationId]};
  const candidateProcess=candidateArchiveProcess(config,scope);
  return {kind:'native',owner,invocationId,output,directory:path.join(output,invocationId),platform:runtime.platform,diagnostics,payloadDigest:artifact.payloadDigest,
    manifest:{schemaVersion:1,kind:'source-profile-feasibility-invocation',scope,invocationId,identity:artifact.identity,configDigest:digestBytes(JSON.stringify(config)),runtimeMetadata:{},...credits},
    tools:{image:browser?.image??runtime.imageId,mounts:toolsMounts,launchProcess:toolsProcess,args:[...base('browser-provider'),...(browser?['--shm-size','512m']:[]),'--network','none',...mountArgs(toolsMounts),'--workdir','/harness','--entrypoint','/usr/bin/env',browser?.image??runtime.imageId,...toolsProcess.command]},
    candidate:{image:runtime.imageId,node:'/candidate/runtime/node',expectedNodeVersion:artifact.provenance.runtimeNodeVersion,mounts:candidateMounts,launchProcess:candidateProcess,arguments:namespace=>{
      assert(/^[a-f0-9]{64}$/.test(namespace),'SOURCE_PROFILE_INPUT_INVALID');
      return [...base('candidate'),'--network',`container:${namespace}`,...mountArgs(candidateMounts),'--workdir','/tmp','--entrypoint','/usr/bin/env',runtime.imageId,...candidateProcess.command];
    }},proofArguments:['scripts/source-profile-jurisdictions-worker.mjs','--inside-proof','--invocation',invocationId]};
}
export function validateProfileInvocationResult({directory,invocationId,mutation,identity,configDigest,sourceDigest,terminal,facet='jurisdictions'}) {
  const {fault}=facetSettings(facet),ids=['baseline',fault];
  assert(ids.includes(invocationId)&&mutation===(invocationId==='baseline'?null:fault),'SOURCE_PROFILE_INVOCATION_INVALID');
  const expected={schemaVersion:1,status:mutation?'expected-fault-observed':'observed',invocationId,mutation,code:mutation?(facet==='divorce-staff'?'SOURCE_PROFILE_DIVORCE_STAFF_ASSERTION':facet==='divorce-mapping'?'SOURCE_PROFILE_DIVORCE_MAPPING_ASSERTION':facet==='divorce-global-search'?'DIVORCE_PROFILE_GLOBAL_ASSERTION':['wa-membership','divorce-wa'].includes(facet)?'SOURCE_PROFILE_WA_MEMBERSHIP_ASSERTION':facet==='wa-health'?'SOURCE_PROFILE_WA_HEALTH_ASSERTION':'SOURCE_PROFILE_JURISDICTION_ASSERTION'):null,identity,configDigest,sourceDigest,...credits};
  const worker=read(path.join(directory,'profile-worker-result.json'));
  if(worker.status==='failed') {
    assert.equal(typeof worker.code,'string','SOURCE_PROFILE_WORKER_RESULT');
    assert.deepEqual(worker,{...expected,status:'failed',code:profileFailureCode({message:worker.code})},'SOURCE_PROFILE_WORKER_RESULT');
    assert.deepEqual(terminal,{code:2,signal:null},'SOURCE_PROFILE_FRAMEWORK_TERMINAL');
    throw Error(worker.code);
  }
  assert.deepEqual(worker,expected,'SOURCE_PROFILE_WORKER_RESULT');
  assert.deepEqual(terminal,{code:mutation?1:0,signal:null},'SOURCE_PROFILE_FRAMEWORK_TERMINAL');
  if(['divorce-jurisdiction','divorce-global-search'].includes(facet)){
    const rejected=path.join(directory,'provider-rejections.jsonl');assert(!fs.existsSync(rejected)||fs.readFileSync(rejected,'utf8').trim()==='', 'DIVORCE_PROFILE_BROWSER_JOURNAL');
    let failure;try{readDivorceBrowserEvidence(directory,facet,mutation);}catch(error){failure=error;}
    const named=facet==='divorce-jurisdiction'?'SOURCE_PROFILE_JURISDICTION_ASSERTION':'DIVORCE_PROFILE_GLOBAL_ASSERTION';
    if(mutation){if(failure?.message!==named)throw failure??Error('SOURCE_PROFILE_FAULT_NOT_EFFECTIVE');}else if(failure)throw failure;
    return {...expected,browserEvidenceDigest:divorceBrowserEvidenceDigest(directory)};
  }
  if(['divorce-staff','divorce-mapping'].includes(facet)) {
    const rejections=path.join(directory,'provider-rejections.jsonl');
    assert(!fs.existsSync(rejections)||fs.readFileSync(rejections,'utf8').trim()==='', 'SOURCE_PROFILE_DIVORCE_JOURNAL');
    const file=path.join(directory,'profile-divorce-observations.json'),data=read(file),journalFile=path.join(directory,'profile-divorce-destinations.json'),journal=read(journalFile);
    assert.deepEqual(Object.keys(data).sort(),['catalogueCredit','journal','mutation','observations'],'SOURCE_PROFILE_OBSERVATION_BINDING');
    assert.equal(data.mutation,mutation,'SOURCE_PROFILE_OBSERVATION_BINDING');assert.equal(data.catalogueCredit,false,'SOURCE_PROFILE_OBSERVATION_BINDING');
    assert.deepEqual(data.journal,journal,'SOURCE_PROFILE_DIVORCE_JOURNAL');
    let failure;try{validateDivorceConsumerObservations(facet.slice(8),data.observations,journal,mutation);}catch(error){failure=error;}
    const named=facet==='divorce-staff'?'SOURCE_PROFILE_DIVORCE_STAFF_ASSERTION':'SOURCE_PROFILE_DIVORCE_MAPPING_ASSERTION';
    if(mutation){if(failure?.message!==named)throw failure??Error('SOURCE_PROFILE_FAULT_NOT_EFFECTIVE');}else if(failure)throw failure;
    return {...expected,observationsDigest:digestBytes(fs.readFileSync(file)),journalDigest:digestBytes(fs.readFileSync(journalFile))};
  }
  if(['wa-membership','divorce-wa'].includes(facet)) {
    const file=path.join(directory,'profile-wa-membership-observations.json'),data=read(file);
    const journalFile=path.join(directory,'profile-wa-membership-destinations.json'),journal=read(journalFile);
    assert.deepEqual(Object.keys(data).sort(),['catalogueCredit','journal','mutation','observations'],'SOURCE_PROFILE_OBSERVATION_BINDING');
    assert.equal(data.mutation,mutation,'SOURCE_PROFILE_OBSERVATION_BINDING');assert.equal(data.catalogueCredit,false,'SOURCE_PROFILE_OBSERVATION_BINDING');
    assert.deepEqual(data.journal,journal,'SOURCE_PROFILE_MEMBERSHIP_JOURNAL');
    let failure;try{validateWaMembershipObservations(data.observations,journal,mutation,facet==='divorce-wa'?'DIVORCE':'CMC');}catch(error){failure=error;}
    if(mutation){if(failure?.message!=='SOURCE_PROFILE_WA_MEMBERSHIP_ASSERTION')throw failure??Error('SOURCE_PROFILE_FAULT_NOT_EFFECTIVE');}else if(failure)throw failure;
    return {...expected,observationsDigest:digestBytes(fs.readFileSync(file)),journalDigest:digestBytes(fs.readFileSync(journalFile))};
  }
  if(facet==='wa-health'){
    const file=path.join(directory,'profile-health-observations.json'),data=read(file);
    assert.deepEqual(Object.keys(data).sort(),['catalogueCredit','journal','mutation','observation'],'SOURCE_PROFILE_OBSERVATION_BINDING');
    assert.equal(data.mutation,mutation,'SOURCE_PROFILE_OBSERVATION_BINDING');assert.equal(data.catalogueCredit,false,'SOURCE_PROFILE_OBSERVATION_BINDING');
    let failure;try{validateWaHealthObservations(data.observation,data.journal,mutation);}catch(error){failure=error;}
    if(mutation){if(failure?.message!=='SOURCE_PROFILE_WA_HEALTH_ASSERTION')throw failure??Error('SOURCE_PROFILE_FAULT_NOT_EFFECTIVE');}else if(failure)throw failure;
    return {...expected,observationsDigest:digestBytes(fs.readFileSync(file))};
  }
  const observations=read(path.join(directory,'profile-jurisdiction-observations.json'));
  assert.deepEqual(Object.keys(observations).sort(),['catalogueCredit','journal','mutation','observations'],'SOURCE_PROFILE_OBSERVATION_BINDING');
  assert.equal(observations.mutation,mutation,'SOURCE_PROFILE_OBSERVATION_BINDING');assert.equal(observations.catalogueCredit,false,'SOURCE_PROFILE_OBSERVATION_BINDING');
  let failure;
  try {validateProfileJurisdictionObservations(observations.observations,observations.journal,mutation);}catch(error){failure=error;}
  if(mutation){if(failure?.message!=='SOURCE_PROFILE_JURISDICTION_ASSERTION')throw failure??Error('SOURCE_PROFILE_FAULT_NOT_EFFECTIVE');}
  else if(failure)throw failure;
  return {...expected,observationsDigest:digestBytes(fs.readFileSync(path.join(directory,'profile-jurisdiction-observations.json')))};
}
export async function runSourceProfileFeasibility({artifactPath,output,facet='jurisdictions',browserRoot=null,owner='candidate-'+randomUUID()},{inspectOwner=inspectHostContainer,verifyArtifact=verifyCandidateArtifact,inspectRuntime=inspectNativeApiRuntime,inspectBrowser=inspectNativeBrowserRuntime,verifyDependencies=verifyHarnessDependencies,digestBrowser=digestCandidateTree,runInvocation=runHostInvocation,removeResource=removeHostResource,configuration,signalTarget=process}={}) {
  assert(/^candidate-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(owner),'SOURCE_PROFILE_OWNER_REQUIRED');
  const settings=facetSettings(facet),{scope,fault}=settings,ids=['baseline',fault];configuration??=settings.configuration;
  for(const id of ids)for(const service of ['candidate','tools'])assert.equal(inspectOwner(`${owner}-${id}-${service}`),null,'SOURCE_PROFILE_OWNER_NOT_FRESH');
  assert(path.isAbsolute(output??'')&&path.isAbsolute(artifactPath??''),'SOURCE_PROFILE_INPUT_INVALID');
  const artifact=await verifyArtifact(artifactPath);
  await assertFreshCandidateDerivationOutput({baseline:artifact,manifestPath:artifactPath,output});
  assert(!output.split(path.sep).some(part=>part==='functional-output'||part==='public'),'SOURCE_PROFILE_INPUT_INVALID');
  const overlaps=(left,right)=>left===right||left.startsWith(right+path.sep)||right.startsWith(left+path.sep);
  assert(!overlaps(root,output),'SOURCE_PROFILE_INPUT_INVALID');
  fs.mkdirSync(output,{mode:0o700});output=fs.realpathSync(output);
  assertReadOnlyMountIsolation([root,artifact.candidateRoot],[output]);
  const stateRoot=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'profile-native-state-'));fs.chmodSync(stateRoot,0o700);
  const resources=new Map(),cleanupFailures=[];
  const receipt={schemaVersion:1,kind:facet.startsWith('divorce-')?`source-profile-${facet}-feasibility`:facet==='wa-membership'?'source-profile-wa-membership-feasibility':facet==='wa-health'?'source-profile-wa-health-feasibility':'source-profile-jurisdiction-feasibility',scope,facet,owner,status:'in-progress',artifact:artifact.identity,invocations:[],...credits};
  let cancelled=false,phase='prepare';
  const save=()=>writeJsonAtomic(path.join(output,'profile-feasibility.json'),receipt);
  const remove=async key=>{try{await removeResource(resources,key,output);}catch(error){cleanupFailures.push(profileFailureCode(error));throw error;}};
  const cleanup=()=>({complete:cleanupFailures.length===0&&[...resources.values()].every(resource=>resource.kind==='container'&&resource.removed===true),containers:[...resources.values()].filter(x=>x.kind==='container').map(x=>({name:x.name,id:x.id,removed:x.removed===true})),failureCodes:cleanupFailures});
  const finishCleanup=()=>{
    receipt.cleanup=cleanup();receipt.privateStateRemoved=false;
    if(!receipt.cleanup.complete)receipt.status='cleanup-uncertain';
    else {try{fs.rmSync(stateRoot,{recursive:true,force:true});receipt.privateStateRemoved=true;}catch{receipt.status='cleanup-uncertain';}}
  };
  const uninstall=installCancellationCleanup({resources,remove,onCancel:()=>{cancelled=true;receipt.status='cancelled';save();},target:{on:(...args)=>signalTarget.on(...args),removeListener:(...args)=>signalTarget.removeListener(...args),stderr:signalTarget.stderr,exit:code=>{finishCleanup();save();signalTarget.exit(code);}}});
  save();
  try {
    const configurations=Object.fromEntries(ids.map(id=>[id,configuration(artifact.candidateRoot,id==='baseline'?null:fault)]));
    const expected=structuredClone(configurations.baseline.config);if(facet==='divorce-staff')expected.staffSupportedJurisdictions=expected.staffSupportedJurisdictions.split(',').filter(id=>id!=='DIVORCE').join(',');else if(facet==='divorce-mapping')expected.serviceRefDataMapping=expected.serviceRefDataMapping.map(row=>row.service==='DIVORCE'?{...row,serviceCodes:['ZZZ1']}:row);else if(facet==='divorce-wa')expected.waSupportedJurisdictions+=',DIVORCE';else if(facet==='divorce-global-search')expected.globalSearchServices=expected.globalSearchServices.split(',').filter(id=>id!=='DIVORCE').join(',');else if(facet==='wa-membership')expected.waSupportedJurisdictions+=',CMC';else if(facet==='wa-health')expected.feature.workAllocationEnabled=true;else expected.jurisdictions=expected.jurisdictions.split(',').filter(id=>id!=='DIVORCE').join(',');
    assert.deepEqual(configurations[fault].config,expected,'SOURCE_PROFILE_CONFIG_DRIFT');
    assert.equal(configurations.baseline.config.feature.workAllocationEnabled,false,'SOURCE_PROFILE_WA_DEFAULT');
    phase='verify-runtime';const runtime=inspectRuntime(artifact.provenance.platform);
    let browser=null;if(['divorce-jurisdiction','divorce-global-search'].includes(facet)){assert(path.isAbsolute(browserRoot??''),'DIVORCE_PROFILE_BROWSER_REQUIRED');const dependenciesRoot=fs.realpathSync(path.join(root,'node_modules'));browser={root:fs.realpathSync(browserRoot),dependenciesRoot,digest:await digestBrowser(browserRoot),dependencies:await verifyDependencies(dependenciesRoot,path.join(root,'package.json'),path.join(root,'yarn.lock')),image:inspectBrowser(artifact.provenance.platform),executable:'/browser/'+browserExecutable(read(path.join(root,'node_modules/playwright-core/browsers.json')),artifact.provenance.platform)};receipt.browser=browser;}
    const sources=path.join(stateRoot,'sources');receipt.sources=stageProfileSources(sources,root);receipt.harnessCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();receipt.runtime=runtime;
    receipt.harnessSourceState=execFileSync('git',['status','--porcelain','--untracked-files=all','--',...PROFILE_SOURCE_FILES],{cwd:root,encoding:'utf8'}).trim()?'sealed-working-tree':'committed';
    const bindings=Object.fromEntries(ids.map(id=>[id,{digest:configurations[id].digest,contract:configurations[id].contract}]));
    writeJsonAtomic(path.join(output,'profile-input.json'),{scope,facet,artifact,browser,sources:receipt.sources,configurations:bindings,...credits});
    receipt.configuration=bindings;receipt.mutation=facet==='divorce-global-search'?{id:fault,target:'NODE_CONFIG.globalSearchServices',before:configurations.baseline.config.globalSearchServices,after:expected.globalSearchServices}:facet==='divorce-wa'?{id:fault,target:'NODE_CONFIG.waSupportedJurisdictions',before:configurations.baseline.config.waSupportedJurisdictions,after:expected.waSupportedJurisdictions}:['divorce-staff','divorce-mapping'].includes(facet)?{id:fault,target:facet==='divorce-staff'?'NODE_CONFIG.staffSupportedJurisdictions':'NODE_CONFIG.serviceRefDataMapping[DIVORCE].serviceCodes',before:facet==='divorce-staff'?configurations.baseline.config.staffSupportedJurisdictions:['ABA1'],after:facet==='divorce-staff'?expected.staffSupportedJurisdictions:['ZZZ1']}:facet==='wa-membership'?{id:fault,target:'NODE_CONFIG.waSupportedJurisdictions',before:configurations.baseline.config.waSupportedJurisdictions,after:expected.waSupportedJurisdictions}:facet==='wa-health'?{id:fault,target:'NODE_CONFIG.feature.workAllocationEnabled',before:false,after:true}:{id:fault,target:'NODE_CONFIG.jurisdictions',before:configurations.baseline.config.jurisdictions,after:expected.jurisdictions};save();
    for(const invocationId of ids) {
      assert(!cancelled,'SOURCE_PROFILE_CANCELLED');phase=invocationId;
      const directory=path.join(output,invocationId);fs.mkdirSync(directory,{mode:0o700});
      const sessions=path.join(stateRoot,invocationId,'sessions'),diagnostics=path.join(stateRoot,invocationId,'diagnostics');
      for(const directory of [sessions,diagnostics]){fs.mkdirSync(directory,{recursive:true,mode:0o777});fs.chmodSync(directory,0o777);}
      assert.equal(fs.readdirSync(sessions).length,0,'SOURCE_PROFILE_SESSION_NOT_FRESH');
      const spec=profileInvocationPlan({owner:receipt.owner,invocationId,artifact,runtime,config:configurations[invocationId].config,output,sources,sessions,diagnostics,facet,browser});
      const result=await runInvocation(spec,{resources,isCancelled:()=>cancelled});
      assert(!cancelled,'SOURCE_PROFILE_CANCELLED');
      receipt.invocations.push(validateProfileInvocationResult({directory,invocationId,mutation:invocationId==='baseline'?null:fault,identity:artifact.identity,configDigest:configurations[invocationId].digest,sourceDigest:receipt.sources.digest,terminal:result.terminal,facet}));save();
    }
    phase='finalize';verifyProfileSources(sources,receipt.sources.digest);assert.deepEqual(await verifyArtifact(artifactPath),artifact,'SOURCE_PROFILE_ARTIFACT_CHANGED');
    const owned=[...resources.values()];
    assert.deepEqual(owned.map(item=>item.name).sort(),ids.flatMap(id=>['candidate','tools'].map(service=>`${receipt.owner}-${id}-${service}`)).sort(),'SOURCE_PROFILE_CLEANUP_REQUIRED');
    assert(owned.every(item=>item.kind==='container'&&item.owner===receipt.owner&&item.image===(item.service==='browser-provider'&&browser?browser.image:runtime.imageId)&&item.removed===true&&/^[a-f0-9]{64}$/.test(item.id))&&new Set(owned.map(item=>item.id)).size===4,'SOURCE_PROFILE_CLEANUP_REQUIRED');
    receipt.status='feasibility-observed';
  } catch(error) {receipt.status=cancelled?'cancelled':'failed';receipt.failure={phase,code:profileFailureCode(error)};}
  finally {
    for(const key of [...resources.keys()].reverse())try{await remove(key);}catch{/* Retained explicitly in cleanup evidence. */}
    finishCleanup();
    uninstall();save();
  }
  return receipt;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  process.umask(0o077);
  try {
    const args=process.argv.slice(2);assert([4,6].includes(args.length)&&args[0]==='--artifact'&&args[2]==='--output'&&(args.length===4||args[4]==='--facet'),'SOURCE_PROFILE_INPUT_INVALID');
    const result=await runSourceProfileFeasibility({artifactPath:path.resolve(args[1]),output:path.resolve(args[3]),facet:args[5]??'jurisdictions'});
    console.log(JSON.stringify({status:result.status,cleanupComplete:result.cleanup?.complete===true,...credits}));
    if(result.status!=='feasibility-observed')process.exitCode=2;
  }catch(error){console.error(JSON.stringify({status:'rejected',code:profileFailureCode(error),...credits}));process.exitCode=2;}
}
