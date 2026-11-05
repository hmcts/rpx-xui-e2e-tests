const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
function temporary(t) { const value=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'profile-feasibility-'));t.after(()=>fs.rmSync(value,{recursive:true,force:true}));return value; }

test('staged source closure imports in isolation and rejects missing, changed and extra seal entries', async t => {
  const {stageProfileSources,verifyProfileSources}=await import('./lib/exui-source-profile-sources.mjs');
  const directory=path.join(temporary(t),'sources');const staged=stageProfileSources(directory,root);
  assert.equal(verifyProfileSources(directory,staged.digest).digest,staged.digest);
  const child=spawnSync(process.execPath,[path.join(directory,'scripts/source-profile-jurisdictions-worker.mjs'),'--verify-only'],{encoding:'utf8',env:{PATH:process.env.PATH},timeout:10000});
  assert.equal(child.status,0,child.stderr);assert.equal(JSON.parse(child.stdout).status,'source-verified');
  const file=path.join(directory,'scripts/lib/exui-source-profile-provider.mjs');fs.chmodSync(file,0o600);fs.appendFileSync(file,'\n// changed');
  assert.throws(()=>verifyProfileSources(directory,staged.digest),/SOURCE_PROFILE_SOURCE_CHANGED/);
  const seals=JSON.parse(fs.readFileSync(path.join(directory,'profile-source-seals.json')));seals['unknown.json']='sha256:'+'a'.repeat(64);
  fs.chmodSync(path.join(directory,'profile-source-seals.json'),0o600);fs.writeFileSync(path.join(directory,'profile-source-seals.json'),JSON.stringify(seals));
  assert.throws(()=>verifyProfileSources(directory),/SOURCE_PROFILE_SOURCE_INVENTORY/);
});

test('feasibility factory binds exact process/config and isolates candidate evidence authority', async t => {
  const {profileInvocationPlan}=await import('./run-harness-source-profile-jurisdictions.mjs');
  const parent=temporary(t),paths={};for(const name of ['output','sources','candidate','sessions','diagnostics']){paths[name]=path.join(parent,name);fs.mkdirSync(paths[name]);}
  fs.mkdirSync(path.join(paths.sources,'scripts/lib'),{recursive:true});fs.writeFileSync(path.join(paths.sources,'scripts/lib/exui-runtime-network-guard.cjs'),'guard');
  const artifact={candidateRoot:paths.candidate,identity:{webappCommit:'a'.repeat(40)},payloadDigest:'sha256:'+'b'.repeat(64),provenance:{platform:'linux/arm64',runtimeNodeVersion:'v24.22.1'}};
  const config={jurisdictions:'CMC,FR',feature:{workAllocationEnabled:false}};
  const spec=profileInvocationPlan({owner:'candidate-11111111-1111-4111-8111-111111111111',invocationId:'source-profile-drop-divorce-jurisdiction',artifact,runtime:{imageId:'sha256:'+'c'.repeat(64),platform:'linux/arm64'},config,...paths});
  assert.equal(spec.tools.args[spec.tools.args.indexOf('--network')+1],'none');
  assert.deepEqual(spec.candidate.mounts.map(x=>x.target).sort(),['/candidate','/diagnostics','/harness-network-guard.cjs','/tmp/.sessions']);
  assert(spec.candidate.launchProcess.command.includes('NODE_CONFIG='+JSON.stringify(config)));
  const args=spec.candidate.arguments('d'.repeat(64));assert.equal(args[args.indexOf('--network')+1],'container:'+'d'.repeat(64));
  assert.equal(spec.tools.launchProcess.command.at(-1),'source-profile-drop-divorce-jurisdiction');
  assert.throws(()=>profileInvocationPlan({owner:'foreign',invocationId:'other',artifact,runtime:{},config,...paths}));
  const {nativeInvocations}=await import('./lib/exui-native-contract.mjs');assert.throws(()=>nativeInvocations('exui-source-profile-jurisdictions-feasibility'));
});

test('worker result requires real healthy omission observations and independent replay, with no release credit', async t => {
  const {validateProfileInvocationResult}=await import('./run-harness-source-profile-jurisdictions.mjs');
  const {SOURCE_JURISDICTIONS,profileJurisdictionRows,SOURCE_PROFILE_JURISDICTION_FAULT}=await import('./lib/exui-source-profile-jurisdictions.mjs');
  const directory=temporary(t),identity={artifactDigest:'sha256:'+'a'.repeat(64)},configDigest='sha256:'+'b'.repeat(64),sourceDigest='sha256:'+'c'.repeat(64);
  const mutation=SOURCE_PROFILE_JURISDICTION_FAULT;
  const observed={mutation,catalogueCredit:false,observations:[0,1].flatMap(()=>['read','create','default'].map(access=>({access,status:200,body:profileJurisdictionRows(access).filter(row=>SOURCE_JURISDICTIONS.includes(row.id)&&row.id!=='DIVORCE')}))),journal:['read','create','default'].map(access=>({method:'GET',path:'/aggregated/caseworkers/harness-supervisor/jurisdictions',access}))};
  const write=(name,value)=>fs.writeFileSync(path.join(directory,name),JSON.stringify(value));
  const worker={schemaVersion:1,status:'expected-fault-observed',invocationId:mutation,mutation,code:'SOURCE_PROFILE_JURISDICTION_ASSERTION',identity,configDigest,sourceDigest,runtimeAcceptance:false,catalogueCredit:false,wholeProfileSatisfied:false,releaseCredit:false};
  write('profile-worker-result.json',worker);write('profile-jurisdiction-observations.json',observed);
  const context={directory,invocationId:mutation,mutation,identity,configDigest,sourceDigest,terminal:{code:1,signal:null}};
  const result=validateProfileInvocationResult(context);assert.equal(result.status,'expected-fault-observed');assert.equal(result.catalogueCredit,false);
  observed.observations[0].status=500;write('profile-jurisdiction-observations.json',observed);assert.throws(()=>validateProfileInvocationResult(context),/SOURCE_PROFILE_TRANSPORT/);
  observed.observations[0].status=200;write('profile-jurisdiction-observations.json',observed);worker.code='SOURCE_PROFILE_TRANSPORT';write('profile-worker-result.json',worker);assert.throws(()=>validateProfileInvocationResult(context),/SOURCE_PROFILE_WORKER_RESULT/);
  worker.code='SOURCE_PROFILE_JURISDICTION_ASSERTION';write('profile-worker-result.json',worker);assert.throws(()=>validateProfileInvocationResult({...context,terminal:{code:0,signal:null}}),/SOURCE_PROFILE_FRAMEWORK_TERMINAL/);
  worker.status='failed';worker.code='SOURCE_PROFILE_TRANSPORT';write('profile-worker-result.json',worker);
  assert.throws(()=>validateProfileInvocationResult({...context,terminal:{code:2,signal:null}}),/^Error: SOURCE_PROFILE_TRANSPORT$/);
  worker.code='PRIVATE_CREDENTIAL_CANARY';write('profile-worker-result.json',worker);assert.throws(()=>validateProfileInvocationResult({...context,terminal:{code:2,signal:null}}),/SOURCE_PROFILE_WORKER_RESULT/);
});

test('worker distinguishes intended omission from transport failure without retaining credentials', async t => {
  const {executeProfileProof}=await import('./source-profile-jurisdictions-worker.mjs');const directory=temporary(t);
  const current={directory,invocationId:'source-profile-drop-divorce-jurisdiction',mutation:'source-profile-drop-divorce-jurisdiction',identity:{},configDigest:'digest',sourceDigest:'digest'};
  assert.equal(await executeProfileProof(current,{cookie:'PRIVATE-CREDENTIAL-CANARY',probe:async()=>{throw Error('SOURCE_PROFILE_TRANSPORT');}}),2);
  assert.equal(JSON.parse(fs.readFileSync(path.join(directory,'profile-worker-result.json'))).status,'failed');
  assert.equal(await executeProfileProof(current,{cookie:'PRIVATE-CREDENTIAL-CANARY',probe:async()=>{throw Error('SOURCE_PROFILE_JURISDICTION_ASSERTION');}}),1);
  assert.equal(JSON.parse(fs.readFileSync(path.join(directory,'profile-worker-result.json'))).status,'expected-fault-observed');
  for(const file of fs.readdirSync(directory))assert(!fs.readFileSync(path.join(directory,file),'utf8').includes('PRIVATE-CREDENTIAL-CANARY'));
});

async function controller(t,{failProof=false,failCleanup=false,cancel=false,missingOwnership=false}={}) {
  const {runSourceProfileFeasibility}=await import('./run-harness-source-profile-jurisdictions.mjs');
  const {SOURCE_JURISDICTIONS,profileJurisdictionRows,SOURCE_PROFILE_JURISDICTION_FAULT}=await import('./lib/exui-source-profile-jurisdictions.mjs');
  const {digestBytes}=await import('./lib/exui-evidence-io.mjs');
  const parent=temporary(t),candidateRoot=path.join(parent,'candidate');fs.mkdirSync(candidateRoot);
  const artifact={candidateRoot,identity:{artifactDigest:'sha256:'+'a'.repeat(64)},payloadDigest:'sha256:'+'b'.repeat(64),provenance:{platform:'linux/arm64',runtimeNodeVersion:'v24.22.1'}};
  const artifactPath=path.join(parent,'artifact.json');fs.writeFileSync(artifactPath,JSON.stringify(artifact));
  const output=path.join(parent,'output'),image='sha256:'+'c'.repeat(64),sessions=[];
  const {EventEmitter}=require('node:events');const signalTarget=new EventEmitter();signalTarget.stderr={write:()=>{}};let signalExitStateRemoved;signalTarget.exit=()=>{signalExitStateRemoved=!fs.existsSync(stateRoot);};
  let calls=0,sequence=0,stateRoot;
  const result=await runSourceProfileFeasibility({artifactPath,output},{
    verifyArtifact:async()=>structuredClone(artifact),inspectRuntime:()=>({imageId:image,platform:'linux/arm64'}),signalTarget,
    configuration:(_root,mutation)=>{const config={jurisdictions:SOURCE_JURISDICTIONS.filter(id=>!mutation||id!=='DIVORCE').join(','),feature:{workAllocationEnabled:false}};return {config,digest:digestBytes(JSON.stringify(config)),contract:{mutation}};},
    runInvocation:async(spec,{resources})=>{
      calls++;const session=spec.candidate.mounts.find(x=>x.target==='/tmp/.sessions').source;sessions.push(session);stateRoot=path.resolve(session,'../..');
      assert.deepEqual(fs.readdirSync(session),[]);fs.writeFileSync(path.join(session,'synthetic-session.json'),'{"readJurisdictions":["cached"]}');
      if(!missingOwnership)for(const service of ['tools','candidate']){const name=`${spec.owner}-${spec.invocationId}-${service}`;resources.set(name,{kind:'container',name,owner:spec.owner,image,id:String(++sequence).repeat(64),service:service==='tools'?'browser-provider':'candidate',removed:!failCleanup});}
      if(cancel){signalTarget.emit('SIGTERM');await new Promise(resolve=>setImmediate(resolve));throw Error('SOURCE_PROFILE_CANCELLED');}
      if(failProof)throw Error('SOURCE_PROFILE_TRANSPORT');
      const input=JSON.parse(fs.readFileSync(path.join(output,'profile-input.json'))),mutation=spec.invocationId==='baseline'?null:SOURCE_PROFILE_JURISDICTION_FAULT;
      const worker={schemaVersion:1,status:mutation?'expected-fault-observed':'observed',invocationId:spec.invocationId,mutation,code:mutation?'SOURCE_PROFILE_JURISDICTION_ASSERTION':null,identity:artifact.identity,configDigest:input.configurations[spec.invocationId].digest,sourceDigest:input.sources.digest,runtimeAcceptance:false,catalogueCredit:false,wholeProfileSatisfied:false,releaseCredit:false};
      fs.writeFileSync(path.join(spec.directory,'profile-worker-result.json'),JSON.stringify(worker));
      fs.writeFileSync(path.join(spec.directory,'profile-jurisdiction-observations.json'),JSON.stringify({mutation,catalogueCredit:false,observations:[0,1].flatMap(()=>['read','create','default'].map(access=>({access,status:200,body:profileJurisdictionRows(access).filter(row=>SOURCE_JURISDICTIONS.includes(row.id)&&(!mutation||row.id!=='DIVORCE'))}))),journal:['read','create','default'].map(access=>({method:'GET',path:'/aggregated/caseworkers/harness-supervisor/jurisdictions',access}))}));
      return {terminal:{code:mutation?1:0,signal:null}};
    },
    removeResource:async(resources,key)=>{if(failCleanup)throw Error('HOST_OWNED_RESOURCE_CLEANUP_FAILED');resources.get(key).removed=true;},
  });
  if(stateRoot)t.after(()=>fs.rmSync(stateRoot,{recursive:true,force:true}));
  return {result,calls,sessions,stateRoot,output,signalExitStateRemoved};
}
test('controller runs isolated green/red pair, retains provenance and removes private state after confirmed ownership cleanup',async t=>{
  const {result,calls,sessions,stateRoot,output}=await controller(t);
  assert.equal(result.status,'feasibility-observed');assert.equal(calls,2);assert.notEqual(sessions[0],sessions[1]);assert.equal(fs.existsSync(stateRoot),false);
  assert.equal(result.cleanup.complete,true);assert.equal(result.cleanup.containers.length,4);assert.equal(result.privateStateRemoved,true);
  for(const key of ['runtimeAcceptance','catalogueCredit','wholeProfileSatisfied','releaseCredit'])assert.equal(result[key],false);
  for(const forbidden of ['gate.json','run.json','release-assurance-summary.json'])assert.equal(fs.existsSync(path.join(output,forbidden)),false);
});
test('controller cannot turn transport failure, missing ownership, cancellation or failed cleanup into feasibility',async t=>{
  for(const options of [{failProof:true},{missingOwnership:true},{cancel:true},{failCleanup:true}]){
    const {result,calls,stateRoot,signalExitStateRemoved}=await controller(t,options);assert.notEqual(result.status,'feasibility-observed');
    if(options.failProof||options.cancel)assert.equal(calls,1);
    if(options.failCleanup){assert.equal(result.status,'cleanup-uncertain');assert.equal(result.cleanup.complete,false);assert.equal(fs.existsSync(stateRoot),true);}
    if(options.cancel){assert.equal(result.status,'cancelled');assert.equal(signalExitStateRemoved,true);}
  }
});

test('WA source-default health facet requires exact healthy sets and effective flag fault',async()=>{
 const {BASE_HEALTH,WA_HEALTH,WA_HEALTH_FAULT,validateWaHealthObservations:validate}=await import('./lib/exui-source-profile-wa-health.mjs');
 const observation=keys=>({status:200,body:{status:'UP',buildInfo:{name:'synthetic'},...Object.fromEntries(keys.map(k=>[k,{status:'UP'}]))}});
 const journal=n=>Array.from({length:n},()=>({method:'GET',path:'/health'}));
 const baseline=observation(BASE_HEALTH);assert.equal(validate(baseline,journal(8)).catalogueCredit,false);
 const fault=observation([...BASE_HEALTH,...WA_HEALTH]);assert.throws(()=>validate(fault,journal(12),WA_HEALTH_FAULT),/^Error: SOURCE_PROFILE_WA_HEALTH_ASSERTION$/);
 assert.throws(()=>validate(baseline,journal(8),WA_HEALTH_FAULT),/HEALTH_DEPENDENCIES/);
 for(const alter of [o=>o.status=503,o=>o.body.status='DOWN',o=>o.body.ccdDataApi.status='DOWN',o=>delete o.body.s2s,o=>o.body.foreign={status:'UP'}]){const changed=structuredClone(baseline);alter(changed);assert.throws(()=>validate(changed,journal(8)),/SOURCE_PROFILE_HEALTH_/);}
 assert.throws(()=>validate(baseline,journal(7)),/HEALTH_DESTINATIONS/);
 assert.throws(()=>validate(baseline,[...journal(7),{method:'POST',path:'/health'}]),/HEALTH_DESTINATIONS/);
});

test('WA health worker/replay binds raw observations and rejects a forged expected fault',async t=>{
 const {BASE_HEALTH,WA_HEALTH,WA_HEALTH_FAULT,validateWaHealthObservations}=await import('./lib/exui-source-profile-wa-health.mjs');
 const {executeProfileProof}=await import('./source-profile-jurisdictions-worker.mjs');
 const {validateProfileInvocationResult}=await import('./run-harness-source-profile-jurisdictions.mjs');
 const directory=temporary(t),current={facet:'wa-health',directory,invocationId:WA_HEALTH_FAULT,mutation:WA_HEALTH_FAULT,identity:{},configDigest:'config',sourceDigest:'source'};
 const data={observation:{status:200,body:{status:'UP',...Object.fromEntries([...BASE_HEALTH,...WA_HEALTH].map(k=>[k,{status:'UP'}]))}},journal:Array.from({length:12},()=>({method:'GET',path:'/health'})),mutation:WA_HEALTH_FAULT,catalogueCredit:false};
 fs.writeFileSync(path.join(directory,'profile-health-observations.json'),JSON.stringify(data));
 assert.equal(await executeProfileProof(current,{probe:()=>validateWaHealthObservations(data.observation,data.journal,WA_HEALTH_FAULT)}),1);
 assert.equal(validateProfileInvocationResult({...current,terminal:{code:1,signal:null}}).wholeProfileSatisfied,false);
 delete data.observation.body.workAllocationApi;fs.writeFileSync(path.join(directory,'profile-health-observations.json'),JSON.stringify(data));
 assert.throws(()=>validateProfileInvocationResult({...current,terminal:{code:1,signal:null}}),/HEALTH_DEPENDENCIES/);
});

test('WA health probe preserves candidate response and journals only request-local outbound checks',async t=>{
 const {BASE_HEALTH,probeWaHealth}=await import('./lib/exui-source-profile-wa-health.mjs');const output=temporary(t);
 let calls=0;const before=[{method:'GET',path:'/health'}];
 const body={status:'UP',...Object.fromEntries(BASE_HEALTH.map(k=>[k,{status:'UP'}]))};
 await probeWaHealth({output,readJournal:()=>++calls===1?before:[...before,...BASE_HEALTH.map(()=>({method:'GET',path:'/health'}))],request:async(url,options)=>{assert.equal(url,'http://127.0.0.1:3100/health');assert.equal(options.redirect,'manual');return{status:200,json:async()=>body};}});
 const data=JSON.parse(fs.readFileSync(path.join(output,'profile-health-observations.json')));assert.equal(data.journal.length,8);assert.deepEqual(data.observation.body,body);
});
