// Finite orchestration fakes only: no actual runtime, source or catalogue credit.
const {EventEmitter}=require('node:events'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
exports.fakeChild=()=>{const child=new EventEmitter();child.pid=12345;child.send=(_message,callback)=>callback();return child;};
exports.campaign=async(output,{mode,abort}={})=>{
  const {MANDATORY_EMAIL_NO_CREDIT}=await import('../lib/exui-mandatory-email-event-invocation-binding.mjs');
  const producer={commit:'a'.repeat(40),files:[],digest:'sha256:'+'b'.repeat(64)},events=[];
  const cohort={producer,noCredit:MANDATORY_EMAIL_NO_CREDIT,artifact:{provenance:{platform:'linux/arm64'}},ccdImages:{database:{id:'sha256:'+'c'.repeat(64)}}};
  let index=0;const framework=variant=>({code:variant==='baseline'?0:1,signal:null});
  const replay=binding=>({frameworkTerminal:framework(binding.variant),registry:[{id:(indexFor(binding.variant)+2).toString(16).repeat(64)},{id:(indexFor(binding.variant)+3).toString(16).repeat(64)}],result:{baselineProofs:binding.variant==='baseline'?2:0,effectiveFaults:binding.variant==='baseline'?0:1}});
  const indexFor=variant=>['baseline','name-optional','address-optional'].indexOf(variant)*3;
  const execute=async(command,{onCreation,onPrepared})=>{
    const request=JSON.parse(fs.readFileSync(command.args[1]));events.push('start:'+request.variant);
    if(mode==='failed-start')return{started:false,observed:false,closed:true,forced:false,cancelled:false,code:-2,signal:null,protocolComplete:false};
    if(mode==='cancel')abort();
    const i=index++,runId='ccd-'+String(i+1).repeat(8)+'-1111-4111-8111-111111111111',owner='harness-'+String(mode==='owner-reuse'?1:i+1).repeat(16);
    const creation={schemaVersion:1,kind:'mandatory-email-creation-intent',variant:request.variant,runId,runtimeDirectory:request.directory+'/runtime',ccd:{schemaVersion:1,kind:'ccd-before-create',owner,output:request.directory+'/runtime',platform:'linux/arm64',resources:{database:{name:owner+'-database',image:cohort.ccdImages.database.id}}},nativeNames:[runId+'-baseline-candidate',runId+'-baseline-tools']};
    await onCreation(creation);events.push('creation:'+request.variant);
    const binding={variant:request.variant,runId,directory:request.directory,privateWorkspace:path.join(fs.realpathSync(os.tmpdir()),'exui-callback-native-FAKE'+i),ccd:{owner,containers:{database:(i*3+1).toString(16).repeat(64)}},plan:{candidate:{name:creation.nativeNames[0]},tools:{name:creation.nativeNames[1]}}};
    await onPrepared({binding});events.push('prepared:'+request.variant);events.push('close:'+request.variant);
    return{started:true,observed:true,closed:true,forced:false,cancelled:false,code:0,signal:null,protocolComplete:true};
  };
  return{cohort,events,options:{output,execute,producer:()=>producer,capturePrepared:packet=>packet.binding,replay,inspect:value=>mode==='unknown-absence'&&/^[a-f0-9]{64}$/.test(value)?undefined:null,exists:()=>false,reconcileFailure:async()=>({status:'synthetic-unit-only'})}};
};
exports.runnerCreationGate=async(t,mode)=>{
 const {pathToFileURL}=require('node:url'),root=path.resolve(__dirname,'../..');
 const dir=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'mandatory-runner-gate-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 for(const name of ['candidate','browser'])fs.mkdirSync(path.join(dir,name));
 const stateFile=path.join(dir,'state.mjs'),stateUrl=pathToFileURL(stateFile).href;
 fs.writeFileSync(stateFile,`export const state={abort:new AbortController(),allocations:0,cleanup:0,packet:null};export let release,seen;export const gate=new Promise(r=>release=r);export const observed=new Promise(r=>seen=r);`);
 const stubs={
  './lib/exui-candidate-artifact.mjs':`export async function verifyCandidateArtifact(){return{candidateRoot:${JSON.stringify(dir+'/candidate')},provenance:{platform:'linux/arm64'}};}export const digestCandidateTree=async()=> 'sha256:'+'a'.repeat(64);`,
  './lib/exui-harness-dependencies.mjs':`export const verifyHarnessDependencies=async()=>({digest:'sha256:'+'b'.repeat(64)});`,
  './lib/exui-configuration-catalogue.mjs':`export const assertCandidateConfigurationSources=()=>{};`,
  './lib/exui-ccd-runtime.mjs':`import fs from 'node:fs';import {state}from ${JSON.stringify(stateUrl)};export * from ${JSON.stringify(pathToFileURL(root+'/scripts/lib/exui-ccd-runtime.mjs').href)};export async function startCcdRuntime(output,options){fs.mkdirSync(output);fs.writeFileSync(output+'/recovery.json','{}');await options.beforeCreate({schemaVersion:1,kind:'ccd-before-create',owner:'harness-'+ 'a'.repeat(16),output,platform:'linux/arm64',resources:{database:{name:'harness-'+ 'a'.repeat(16)+'-database',image:'sha256:'+'a'.repeat(64)}}});state.allocations++;throw Error('CONTROLLED_AFTER_ACK');}`,
  './lib/exui-candidate-ci-process.mjs':`import{state}from ${JSON.stringify(stateUrl)};export const cleanupCiCcd=()=>{state.cleanup++;return{cleanupComplete:true};};`,
 };
 const redirects={};let i=0;for(const [name,code]of Object.entries(stubs)){const file=path.join(dir,'stub'+i+++'.mjs');fs.writeFileSync(file,code);redirects[name]=pathToFileURL(file).href;}
 let source=fs.readFileSync(root+'/scripts/run-harness-recipient-callback-ui.mjs','utf8');
 source=source.replace(/(from\s*|import\s*\()(['"])([^'"]+)\2/g,(_all,prefix,quote,name)=>prefix+quote+(redirects[name]||(name.startsWith('.')?pathToFileURL(path.resolve(root,'scripts',name)).href:name))+quote);
 source=source.replace("const root=fileURLToPath(new URL('../',import.meta.url))",'const root='+JSON.stringify(root+'/'));
 const file=path.join(dir,'runner.mjs');fs.writeFileSync(file,source);const api=await import(pathToFileURL(file).href),shared=await import(stateUrl);
 const running=api.runCallbackUi({candidate:dir+'/artifact.json',browser:dir+'/browser',output:dir+'/output',scenario:'mandatory-email-event',variant:'baseline',signal:shared.state.abort.signal,mandatoryLifecycle:{creationStarted:async packet=>{shared.state.packet=structuredClone(packet);shared.seen();if(mode==='reject')throw Error('CONTROLLED_CREATION_ACK_REJECTED');if(mode==='pending')await shared.gate;},prepared:async()=>{throw Error('proof must not run in this startup-boundary fixture');}}});
 return{...shared,running};
};
exports.materialPrepared=async(t,variant='baseline',options={})=>{
 const root=path.resolve(__dirname,'../..'),m=await import('../lib/exui-mandatory-email-event-invocation-binding.mjs');
 const {CALLBACK_UI_SOURCES}=await import('../run-harness-recipient-callback-ui.mjs'),{ccdImagePins}=await import('../lib/exui-ccd-runtime.mjs');
 const {personalPlan}=await import('../lib/exui-personal-service-invocation-binding.mjs'),{nativeIdentity}=await import('../lib/exui-native-contract.mjs'),{browserExecutable}=await import('../lib/exui-oci-runtime.mjs'),{canonicalRecipientCallbackPages}=await import('../lib/exui-recipient-callback-fixture.mjs');
 const {captureMandatoryEmailPrepared,mandatoryEmailRawFiles}=await import('../lib/exui-mandatory-email-event-evidence.mjs');
 const base=options.base??fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'mandatory-material-')),workspace=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'exui-callback-native-'));t.after(()=>{fs.rmSync(base,{recursive:true,force:true});fs.rmSync(workspace,{recursive:true,force:true});});
 const x=await require('./exui-mandatory-email-runtime.mock.cjs').rawPacket(base,variant),dir=x.directory,hash=c=>'sha256:'+c.repeat(64),put=(name,value)=>{fs.mkdirSync(path.dirname(dir+'/'+name),{recursive:true});fs.writeFileSync(dir+'/'+name,JSON.stringify(value,null,2)+'\n');};
 const files=CALLBACK_UI_SOURCES.map(name=>[name,m.mandatoryEmailFile(root,name).digest]);
 for(const [name]of files){const target=path.join(workspace,'sources',name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(root,name),target);}
 for(const name of ['sessions','diagnostics'])fs.mkdirSync(path.join(workspace,'state/baseline',name),{recursive:true});
 const candidateRoot=options.cohort?.artifact.candidateRoot??path.join(base,'candidate'),browserRoot=options.cohort?.browser.root??path.join(base,'browser');if(!options.cohort){fs.mkdirSync(candidateRoot+'/config',{recursive:true});fs.mkdirSync(browserRoot);fs.writeFileSync(candidateRoot+'/config/default.json',JSON.stringify({services:{idam:{}},feature:{}}));}
 const platform='linux/arm64',images=options.cohort?.ccdImages??Object.fromEntries(Object.entries(ccdImagePins(platform)).map(([service,pin])=>[service,{id:pin.manifestDigest,architecture:'arm64',repoDigests:[pin.reference]}]));
 const cohort=options.cohort??{producer:{commit:'a'.repeat(40),files,digest:m.mandatoryEmailDigest(files)},artifact:{candidateRoot,identity:{artifactDigest:hash('a')},payloadDigest:hash('a'),provenance:{platform,runtimeNodeVersion:'v24.22.2'}},browser:{root:browserRoot,digest:hash('b'),image:hash('c')},dependencies:{digest:hash('d')},nativeRuntime:{imageId:hash('e'),platform},ccdImages:images,noCredit:m.MANDATORY_EMAIL_NO_CREDIT};
 const owner='harness-'+ (options.ordinal===undefined?'a'.repeat(16):(100000+options.ordinal).toString(16).padStart(16,'0')),runId=options.ordinal===undefined?'ccd-11111111-1111-4111-8111-111111111111':'ccd-'+String(options.ordinal+3).repeat(8)+'-1111-4111-8111-111111111111',containers=Object.fromEntries(Object.keys(images).map((service,i)=>[service,options.ordinal===undefined?(i+1).toString(16).repeat(64):(1000000+options.ordinal*20+i).toString(16).padStart(64,'0')])),ccd={ready:true,owner,output:dir+'/runtime',namespace:containers.database,containers,images,fixtureSelection:'event-capability-baseline'};
 const input=JSON.parse(fs.readFileSync(dir+'/input.json')),imported=JSON.parse(fs.readFileSync(dir+'/runtime/recipient-callback-import/receipt.json')),date=JSON.parse(fs.readFileSync(dir+'/runtime/recipient-callback-import/mandatory-email-stored-dates.json'));
 if(options.ordinal!==undefined){
  const actorIds=Object.fromEntries(['allowed','courtadmin','judge','readonly','observer'].map((persona,index)=>[persona,String(index+1).repeat(8)+'-1111-4111-8111-111111111111']));
  for(const name of mandatoryEmailRawFiles(variant).filter(name=>name.startsWith('baseline/'))){const file=path.join(dir,name);if(fs.existsSync(file))fs.writeFileSync(file,fs.readFileSync(file,'utf8').replaceAll('synthetic-courtadmin',actorIds.courtadmin));}
  input.credentials=Object.fromEntries(Object.entries(actorIds).map(([persona,userId])=>[persona,{userId,roles:['caseworker','caseworker-harness',...(['courtadmin','judge','readonly'].includes(persona)?['caseworker-privatelaw-'+persona]:['caseworker-harness-'+persona])],headers:{Authorization:'Bearer synthetic-mandatory-'+options.ordinal+'-'+persona}}]));
  const report=JSON.parse(fs.readFileSync(dir+'/baseline/report.json'));report.config={workers:1};put('baseline/report.json',report);
 }
 Object.assign(imported,{owner,namespace:ccd.namespace,images});Object.assign(date,{owner,namespace:ccd.namespace,images});input.mandatoryEmailEventFacets.date=date;
 const chromium=JSON.parse(fs.readFileSync(root+'/node_modules/playwright-core/browsers.json')).browsers.find(v=>v.name==='chromium-headless-shell');
 Object.assign(input,{runId,releaseScopeId:'exui-ccd-event-capability-pilot',artifact:cohort.artifact,browserRoot,browserDigest:cohort.browser.digest,browserRuntimeImage:cohort.browser.image,browserExecutable:'/browser/'+browserExecutable({browsers:[chromium]},platform),harnessDependencies:cohort.dependencies,nativeRuntime:cohort.nativeRuntime,harnessSources:files.map(([name])=>name),harnessSourceDigest:cohort.producer.digest,gatewayDigest:files.find(([name])=>name==='scripts/lib/exui-ccd-browser-runtime.mjs')[1],ccd,definition:{fixtureDigest:imported.seal.definitionDigest,observedDefinitionDigest:m.mandatoryEmailDigest(imported.observations.definition.body),definitionVersion:3},apiContracts:{data:hash('f'),definition:hash('9')},callbackObservedDigests:{definition:m.mandatoryEmailDigest(imported.observations.definition.body),pages:m.mandatoryEmailDigest(canonicalRecipientCallbackPages(imported.observations.pages.body))}});
 put('input.json',input);put('runtime/recipient-callback-import/receipt.json',imported);put('runtime/recipient-callback-import/mandatory-email-stored-dates.json',date);put('runtime/recipient-callback-import/runtime-verification.json',{status:'verified'});
 const resources=Object.fromEntries(Object.entries(images).map(([service,image])=>[service,{name:owner+'-'+service,image:image.id}]));put('runtime/recovery.json',{owner,output:ccd.output,resources});put('runtime/creation-attempts.json',Object.entries(containers).map(([service,containerId])=>({service,name:owner+'-'+service,state:'settled',containerId})));
 const stashed=Object.fromEntries(mandatoryEmailRawFiles(variant).filter(name=>name.startsWith('baseline/')).map(name=>{const value=fs.readFileSync(dir+'/'+name);fs.unlinkSync(dir+'/'+name);return[name,value];}));
 const handoff={output:dir,stagedHarness:workspace+'/sources',stateRoot:workspace+'/state'},plan=JSON.parse(JSON.stringify(personalPlan(input,handoff))),manifest={schemaVersion:1,kind:'mandatory-email-event-ui-feasibility',identity:nativeIdentity(input,{invocationId:'baseline',mutation:null},candidateRoot).identity,runId,variant,catalogueCredit:false,releaseCredit:false,runtimeMetadata:{rowFacetDigest:m.mandatoryEmailDigest(input.mandatoryEmailEventFacets),callbackImportDigest:m.mandatoryEmailFile(dir,'runtime/recipient-callback-import/receipt.json').digest,harnessSourceDigest:cohort.producer.digest,browserDigest:cohort.browser.digest}};
 const inspections=Object.fromEntries(Object.entries(containers).map(([service,id])=>[id,{Id:id,Name:'/'+owner+'-'+service,Image:images[service].id,Config:{Labels:{'exui.harness.owner':owner,'exui.harness.service':service}},HostConfig:{NetworkMode:service==='database'?'none':'container:'+ccd.namespace},State:{Running:true}}]));
 const creation={schemaVersion:1,kind:'mandatory-email-creation-intent',runId,variant,runtimeDirectory:ccd.output,ccd:{schemaVersion:1,kind:'ccd-before-create',owner,output:ccd.output,platform,resources},nativeNames:[runId+'-baseline-candidate',runId+'-baseline-tools']};
 return{resourceSeed:options.ordinal,cohort,creation,prepared:{input,handoff,plan,manifest,privateWorkspace:workspace,imported,held:captureMandatoryEmailPrepared(dir)},inspect:id=>inspections[id]??null,put,stashed};
};
exports.completeMaterial=async(x,binding,expectedDigest)=>{
 const fs=require('node:fs'),path=require('node:path'),m=await import('../lib/exui-mandatory-email-event-invocation-binding.mjs'),dir=binding.directory;
 const put=x.put;for(const[name,bytes]of Object.entries(x.stashed))fs.writeFileSync(path.join(dir,name),bytes);
 const registry=[['browser-provider',binding.plan.tools,'8'],['candidate',binding.plan.candidate,'9']].map(([service,resource,digit])=>({kind:'container',name:resource.name,id:x.resourceSeed===undefined?digit.repeat(64):(1000018+x.resourceSeed*20+Number(digit)-8).toString(16).padStart(64,'0'),owner:binding.runId,service,image:resource.image,namespace:binding.ccd.namespace,mounts:resource.mounts,removed:true}));
 const candidate=registry[1],info={Id:candidate.id,Name:'/'+candidate.name,Image:candidate.image,Config:{Entrypoint:binding.candidateProcess.entrypoint,Cmd:binding.candidateProcess.command,Labels:{'exui.harness.owner':binding.runId,'exui.harness.service':'candidate'}},HostConfig:{NetworkMode:'container:'+binding.ccd.namespace,ReadonlyRootfs:true,Init:true,Privileged:false,PidMode:'',CapDrop:['ALL'],SecurityOpt:['no-new-privileges'],PidsLimit:256,Memory:4294967296,NanoCpus:2000000000,PortBindings:{}},Mounts:candidate.mounts.map(row=>({Type:'bind',Source:row.source,Destination:row.target,RW:row.writable}))};
 put('owned-resources.json',registry);put('baseline/candidate-lifecycle.json',{requestedStop:true,before:{...info,State:{Running:true,ExitCode:0,OOMKilled:false}},after:{...info,State:{Running:false,ExitCode:143,OOMKilled:false}}});
 put('baseline/candidate-write-denial.json',{candidateId:candidate.id,controllerSourceVisible:false,attempts:[{path:'/output/report.json',denied:true},{path:'/harness/controller.mjs',denied:true}]});
 put('baseline/manifest.json',{...binding.manifest,runtimeMetadata:{...binding.manifest.runtimeMetadata,candidateAuthorityIsolation:'separate-container-no-evidence-mount',candidateRuntimeNodeVersion:x.cohort.artifact.provenance.runtimeNodeVersion,candidateObservedImageId:x.cohort.nativeRuntime.imageId}});
 put('baseline/runtime-identity.json',{identity:binding.manifest.identity,payloadDigest:x.cohort.artifact.payloadDigest,observedImageId:x.cohort.nativeRuntime.imageId,candidateContainerId:candidate.id,runtime:{nodeVersion:x.cohort.artifact.provenance.runtimeNodeVersion,platform:'linux',architecture:'arm64',osRelease:'ID=debian\nVERSION_CODENAME=bookworm'}});
 const frameworkTerminal={code:binding.variant==='baseline'?0:1,signal:null};put('receipt.json',{kind:'mandatory-email-event-ui-feasibility',scenario:'mandatory-email-event',variant:binding.variant,runnerExitCode:frameworkTerminal.code,status:binding.variant==='baseline'?'mandatory-email-event-feasibility-observed':'mandatory-email-optional-fault-detected',nativeCleanupComplete:true,cleanup:{cleanupComplete:true},workspaceCleanupComplete:true,runtimeAcceptance:false,catalogueCredit:false,releaseCredit:false});
 put('mandatory-email-child-completion.json',{schemaVersion:1,kind:'mandatory-email-child-completion',variant:binding.variant,expectedDigest,receiptDigest:m.mandatoryEmailFile(dir,'receipt.json').digest,frameworkTerminal,cancelled:false,cleanupComplete:true});
 fs.rmSync(binding.privateWorkspace,{recursive:true,force:true});return registry;
};
