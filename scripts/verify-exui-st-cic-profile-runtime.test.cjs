const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const facet = 'st-cic-wa';
const fault = 'source-profile-remove-st-cic-wa-membership';
const named = 'ST_CIC_WA_ASSERTION';
const noCredit = { runtimeAcceptance:false,catalogueCredit:false,wholeProfileSatisfied:false,releaseCredit:false };
function temporary(t) {
  const directory = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'st-cic-worker-'));
  t.after(() => fs.rmSync(directory, {recursive:true,force:true}));
  return directory;
}
test('ST_CIC WA execution uses its fixed fault and scope without admitting another profile', async () => {
  const {facetSettings} = await import('./run-harness-source-profile-jurisdictions.mjs');
  assert.equal(facetSettings(facet).scope, 'exui-st-cic-wa-feasibility');
  assert.equal(facetSettings(facet).fault, fault);
  assert.throws(() => facetSettings('st-cic-unknown'), /SOURCE_PROFILE_INPUT_INVALID/);
  assert.equal(facetSettings('st-cic-global-search').fault,'source-profile-drop-st-cic-global-search');
});
test('ST_CIC worker only classifies its exact semantic fault, preserving framework and unrelated failures', async t => {
  const {executeProfileProof} = await import('./source-profile-jurisdictions-worker.mjs');
  const directory = temporary(t), current = {facet,directory,invocationId:fault,mutation:fault,identity:{},configDigest:'config',sourceDigest:'source'};
  for (const [message, code, status] of [[named,1,'expected-fault-observed'],['ST_CIC_JOURNAL_INVALID',2,'failed'],['ST_CIC_STAFF_ASSERTION',2,'failed'],['PRIVATE-CANARY',2,'failed']]) {
    assert.equal(await executeProfileProof(current,{probe:async()=>{throw Error(message);}}),code);
    const raw=fs.readFileSync(path.join(directory,'profile-worker-result.json'),'utf8');
    const result=JSON.parse(raw);
    assert.equal(result.status,status); assert(!raw.includes('PRIVATE-CANARY'));
    assert.equal(result.catalogueCredit,false);
  }
});
test('ST_CIC raw replay rejects invented fault labels, altered journals, credit and terminal substitutions', async t => {
  const {executeProfileProof} = await import('./source-profile-jurisdictions-worker.mjs');
  const {validateProfileInvocationResult} = await import('./run-harness-source-profile-jurisdictions.mjs');
  const {ST_CIC_CANDIDATE_RESPONSES,ST_CIC_BASELINE_JOURNALS} = await import('./fixtures/exui-st-cic-profile.mock.mjs');
  const directory=temporary(t), current={facet,directory,invocationId:'baseline',mutation:null,identity:{},configDigest:'config',sourceDigest:'source'};
  const data={observations:structuredClone(ST_CIC_CANDIDATE_RESPONSES[facet]),journal:structuredClone(ST_CIC_BASELINE_JOURNALS[facet]),mutation:null,...noCredit};
  const write=()=>{fs.writeFileSync(path.join(directory,'profile-st-cic-support.json'),'[]');fs.writeFileSync(path.join(directory,'profile-st-cic-observations.json'),JSON.stringify(data));fs.writeFileSync(path.join(directory,'profile-st-cic-destinations.json'),JSON.stringify(data.journal));};
  write(); assert.equal(await executeProfileProof(current,{probe:async()=>{}}),0);
  assert.equal(validateProfileInvocationResult({...current,terminal:{code:0,signal:null}}).wholeProfileSatisfied,false);
  assert.throws(()=>validateProfileInvocationResult({...current,terminal:{code:1,signal:null}}),/SOURCE_PROFILE_FRAMEWORK_TERMINAL/);
  data.catalogueCredit=true;write();assert.throws(()=>validateProfileInvocationResult({...current,terminal:{code:0,signal:null}}),/SOURCE_PROFILE_OBSERVATION_BINDING/);data.catalogueCredit=false;
  current.invocationId=fault;current.mutation=fault;data.mutation=fault;
  for(const index of [0,2])data.observations[index].body=[];
  data.observations.forEach((row,index)=>{row.outboundCount=[0,1,1,2][index];});
  data.journal=data.journal.filter(row=>row.body.case_jurisdiction!=='ST_CIC');write();
  assert.equal(await executeProfileProof(current,{probe:async()=>{throw Error(named);}}),1);
  assert.equal(validateProfileInvocationResult({...current,terminal:{code:1,signal:null}}).status,'expected-fault-observed');
  data.journal.push({method:'GET',path:'/health'});write();
  assert.throws(()=>validateProfileInvocationResult({...current,terminal:{code:1,signal:null}}),error=>error.message!==named);
});

test('shared provider dispatches ST_CIC upstream fixtures and rejects unrelated jurisdiction traffic', async t => {
  const {EventEmitter}=require('node:events'), {Readable}=require('node:stream');
  const {startProfileJurisdictionProviders}=await import('./lib/exui-source-profile-provider.mjs');
  const output=temporary(t), server=new EventEmitter();
  server.on('request',(_request,response)=>response.end('{"original":true}'));
  const result=await startProfileJurisdictionProviders(output,{stCicFacet:facet,seed:()=>({id:'synthetic'}),start:async()=>server});
  const invoke=async(method,url,body)=>{
    const request=Readable.from(body===undefined?[]:[JSON.stringify(body)]);Object.assign(request,{method,url,headers:{}});
    const response={status:null,body:null,writeHead(status){this.status=status;},end(body){this.body=body;}};
    await server.listeners('request')[0](request,response);return response;
  };
  const body={case_id:'1111222233334444',case_jurisdiction:'ST_CIC',case_type:'HarnessPositiveSTCIC',event_id:'profileRouteSTCIC'};
  const response=await invoke('POST','/task/search-for-completable',body);
  assert.equal(response.status,200);assert.equal(JSON.parse(response.body)[0].id,'positive-st-cic-route');
  assert.deepEqual(result.readJournal(),[{method:'POST',path:'/task/search-for-completable',body}]);
  const rejected=await invoke('GET','/aggregated/caseworkers/harness-supervisor/jurisdictions?access=read');
  assert.equal(rejected.status,501);assert.equal(result.readJournal().length,1);
  assert.equal(JSON.parse(fs.readFileSync(path.join(output,'provider-rejections.jsonl'),'utf8')).code,'UNDECLARED_PROFILE_REQUEST');
});
test('unknown ST_CIC provider facets reject before creating a server', async t => {
  const {startProfileJurisdictionProviders}=await import('./lib/exui-source-profile-provider.mjs');let starts=0;
  await assert.rejects(()=>startProfileJurisdictionProviders(temporary(t),{stCicFacet:'st-cic-foreign',start:async()=>{starts++;}}),/ST_CIC_FACET_INVALID/);
  assert.equal(starts,0);
});

const api3 = [
  ['st-cic-staff','source-profile-drop-st-cic-staff','ST_CIC_STAFF_ASSERTION'],
  ['st-cic-mapping','source-profile-change-st-cic-code','ST_CIC_MAPPING_ASSERTION'],
  ['st-cic-wa-health','source-profile-enable-st-cic-wa-health','ST_CIC_WA_HEALTH_ASSERTION'],
];
const healthCalls = count => Array.from({length:count},()=>({method:'GET',path:'/health'}));
function healthRecord(mutation) {
  const names=['ccdComponentApi','ccdDataApi','docassemblyApi','documentsApi','documentsApiV2','idamApi','idamWeb','s2s',...(mutation?['workAllocationApi','caseworkerRefApi','roleApi','judicialApi']:[])];
  const before=healthCalls(2),journal=healthCalls(names.length);
  return {observation:{status:200,body:{status:'UP',...Object.fromEntries(names.map(key=>[key,{status:'UP'}]))}},before,fullJournal:[...before,...journal],journal,mutation,...noCredit};
}
async function apiRecord(facet,mutation) {
  if(facet==='st-cic-wa-health')return healthRecord(mutation);
  const fixtures=await import('./fixtures/exui-st-cic-profile.mock.mjs');
  const value={observations:structuredClone(fixtures.ST_CIC_CANDIDATE_RESPONSES[facet]),journal:structuredClone(fixtures.ST_CIC_BASELINE_JOURNALS[facet]),mutation,...noCredit};
  if(!mutation)return value;
  if(facet==='st-cic-staff') {
    value.observations[0].body=value.observations[0].body.filter(id=>id!=='ST_CIC');
    for(const index of [1,2])value.observations[index].body=value.observations[index].body.filter(row=>row.service!=='ST_CIC');
    value.journal[0].path='/refdata/internal/staff/usersByServiceName?ccd_service_names=CIVIL,EMPLOYMENT,PRIVATELAW,PUBLICLAW,IA,SSCS,DIVORCE,FR,PROBATE,HRS,PCS&page_size=100000';
    value.journal[1].body.attributes.jurisdiction=value.journal[1].body.attributes.jurisdiction.filter(id=>id!=='ST_CIC');
  } else {
    const person={idamId:'judicial-ZZZ1',fullName:'Synthetic ZZZ1',emailId:'zzz1@example.invalid'};
    const venue={epimms_id:'100002',site_name:'Synthetic ZZZ1',region_id:'1',court_type_id:'18',service_code:'ZZZ1',is_case_management_location:'Y',is_hearing_location:'Y'};
    const bodies=[[{...person,name:person.fullName,email:person.emailId,id:person.idamId}],[person],[{id:'100002',locationName:'Synthetic ZZZ1'}],[venue],[{regionId:'1',locations:['100002']}],[{id:'booking-100001',locationId:'100001',locationName:null},{id:'booking-100002',locationId:'100002',locationName:'Synthetic ZZZ1'}],[venue]];
    for(let index=1;index<value.observations.length;index++)value.observations[index].body=bodies[index-1];
    value.journal=JSON.parse(JSON.stringify(value.journal).replaceAll('BBA2','ZZZ1'));
  }
  return value;
}
for(const [facet,fault,named] of api3) {
  test(`${facet}: finite native settings and real worker oracle preserve baseline and classify only its own effective fault`,async t=>{
    const {facetSettings}=await import('./run-harness-source-profile-jurisdictions.mjs');
    const {executeProfileProof}=await import('./source-profile-jurisdictions-worker.mjs');
    const {validateStCicConsumerObservations,validateStCicWaHealth}=await import('./lib/exui-st-cic-profile-consumers.mjs');
    assert.equal(facetSettings(facet).fault,fault);assert.equal(facetSettings(facet).scope,`exui-${facet}-feasibility`);
    for(const mutation of [null,fault]) {
      const directory=temporary(t),data=await apiRecord(facet,mutation),current={facet,directory,invocationId:mutation??'baseline',mutation,identity:{candidate:'fixed'},configDigest:'config',sourceDigest:'source'};
      const probe=()=>facet==='st-cic-wa-health'?validateStCicWaHealth(data.observation,data.journal,mutation):validateStCicConsumerObservations(facet,data.observations,data.journal,mutation);
      assert.equal(await executeProfileProof(current,{probe}),mutation?1:0);
      assert.equal(JSON.parse(fs.readFileSync(path.join(directory,'profile-worker-result.json'))).code,mutation?named:null);
      for(const code of ['ST_CIC_JOURNAL_INVALID','ST_CIC_STAFF_CONTROL','ST_CIC_HEALTH_PROTOCOL','ST_CIC_HEALTH_CONTROL','ST_CIC_MAPPING_CONTROL','ST_CIC_FAULT_NOT_EFFECTIVE','ST_CIC_FAULT_EVIDENCE_INVALID','PRIVATE-CANARY','ST_CIC_WA_ASSERTION']) {
        assert.equal(await executeProfileProof(current,{probe:async()=>{throw Error(code);}}),2);
        const raw=fs.readFileSync(path.join(directory,'profile-worker-result.json'),'utf8');assert(!raw.includes('PRIVATE-CANARY'));assert.equal(JSON.parse(raw).code,code==='PRIVATE-CANARY'?'SOURCE_PROFILE_UNCLASSIFIED':code);
      }
    }
  });
  test(`${facet}: raw replay independently rejects unknown journal/control/shape/credit/identity and terminal substitutions`,async t=>{
    const {executeProfileProof}=await import('./source-profile-jurisdictions-worker.mjs');
    const {validateProfileInvocationResult}=await import('./run-harness-source-profile-jurisdictions.mjs');
    const {validateStCicConsumerObservations,validateStCicWaHealth}=await import('./lib/exui-st-cic-profile-consumers.mjs');
    for(const mutation of [null,fault]) {
      const directory=temporary(t),data=await apiRecord(facet,mutation),current={facet,directory,invocationId:mutation??'baseline',mutation,identity:{candidate:'fixed'},configDigest:'config',sourceDigest:'source'};
      const terminal={code:mutation?1:0,signal:null},file=facet==='st-cic-wa-health'?'profile-st-cic-health.json':'profile-st-cic-observations.json';
      const write=value=>{fs.writeFileSync(path.join(directory,file),JSON.stringify(value));fs.writeFileSync(path.join(directory,'profile-st-cic-destinations.json'),JSON.stringify(value.fullJournal??value.journal));fs.writeFileSync(path.join(directory,'profile-st-cic-support.json'),'[]');};
      write(data);
      const probe=()=>facet==='st-cic-wa-health'?validateStCicWaHealth(data.observation,data.journal,mutation):validateStCicConsumerObservations(facet,data.observations,data.journal,mutation);
      assert.equal(await executeProfileProof(current,{probe}),terminal.code);
      assert.equal(validateProfileInvocationResult({...current,terminal}).catalogueCredit,false);
      for(const change of [value=>value.journal.push({method:'GET',path:'/unknown'}),value=>value.catalogueCredit=true,value=>value.extra='unbound',value=>value.mutation='foreign',value=>{if(value.observations)value.observations[0].body=[];else delete value.observation.body.s2s;}]) {
        const bad=structuredClone(data);change(bad);write(bad);assert.throws(()=>validateProfileInvocationResult({...current,terminal}),error=>mutation===null||error.message!==named);
      }
      write(data);
      for(const wrong of [{code:2,signal:null},{code:0,signal:'SIGTERM'},{code:terminal.code?0:1,signal:null}])assert.throws(()=>validateProfileInvocationResult({...current,terminal:wrong}),/SOURCE_PROFILE_FRAMEWORK_TERMINAL/);
      for(const key of ['identity','sourceDigest','configDigest'])assert.throws(()=>validateProfileInvocationResult({...current,[key]:'foreign',terminal}),/SOURCE_PROFILE_WORKER_RESULT/);
      fs.writeFileSync(path.join(directory,'provider-rejections.jsonl'),'{"code":"UNDECLARED_PROFILE_REQUEST"}\n');assert.throws(()=>validateProfileInvocationResult({...current,terminal}),/ST_CIC_JOURNAL_INVALID/);fs.rmSync(path.join(directory,'provider-rejections.jsonl'));
      fs.writeFileSync(path.join(directory,'profile-st-cic-support.json'),'[{"extra":true}]');assert.throws(()=>validateProfileInvocationResult({...current,terminal}),/ST_CIC_JOURNAL_INVALID/);
    }
  });
}

test('ST_CIC health probe retains before/full/delta for independent raw boundary replay',async t=>{
  const {probeStCicConsumers}=await import('./lib/exui-st-cic-profile-consumers.mjs');
  const expected=healthRecord(null),output=temporary(t);let journal=expected.before;
  await probeStCicConsumers({facet:'st-cic-wa-health',output,readJournal:()=>structuredClone(journal),request:async()=>{journal=expected.fullJournal;return{status:200,json:async()=>expected.observation.body};}});
  const actual=JSON.parse(fs.readFileSync(path.join(output,'profile-st-cic-health.json')));assert.deepEqual(actual,expected);
});

test('ST_CIC health raw reader rejects dishonest before/full boundary and late provider calls',async t=>{
  const {executeProfileProof}=await import('./source-profile-jurisdictions-worker.mjs');
  const {validateProfileInvocationResult}=await import('./run-harness-source-profile-jurisdictions.mjs');
  const facet='st-cic-wa-health',directory=temporary(t),data=healthRecord(null),current={facet,directory,invocationId:'baseline',mutation:null,identity:{},configDigest:'config',sourceDigest:'source'},terminal={code:0,signal:null};
  const write=value=>{fs.writeFileSync(path.join(directory,'profile-st-cic-health.json'),JSON.stringify(value));fs.writeFileSync(path.join(directory,'profile-st-cic-destinations.json'),JSON.stringify(value.fullJournal));fs.writeFileSync(path.join(directory,'profile-st-cic-support.json'),'[]');};
  write(data);await executeProfileProof(current,{probe:async()=>{}});
  assert.equal(validateProfileInvocationResult({...current,terminal}).catalogueCredit,false);
  for(const change of [v=>v.before[0].path='/foreign',v=>v.before.push({method:'GET',path:'/health'}),v=>v.fullJournal.pop(),v=>v.fullJournal.push({method:'GET',path:'/health'}),v=>v.journal.pop()]){const bad=structuredClone(data);change(bad);write(bad);assert.throws(()=>validateProfileInvocationResult({...current,terminal}),/ST_CIC_JOURNAL_INVALID/);}
  write(data);fs.writeFileSync(path.join(directory,'profile-st-cic-destinations.json'),JSON.stringify([...data.fullJournal,{method:'GET',path:'/health'}]));assert.throws(()=>validateProfileInvocationResult({...current,terminal}),/ST_CIC_JOURNAL_INVALID/);
});

for(const facet of ['st-cic-staff','st-cic-mapping','st-cic-wa-health'])test(`${facet}: shared provider exposes only declared auth or captured health before generic bypass`,async t=>{
  const {EventEmitter}=require('node:events'),{Readable}=require('node:stream'),{startProfileJurisdictionProviders}=await import('./lib/exui-source-profile-provider.mjs');
  const output=temporary(t),server=new EventEmitter();server.on('request',(_req,res)=>{res.writeHead(200);res.end('{"generic":true}');});
  const started=await startProfileJurisdictionProviders(output,{stCicFacet:facet,seed:()=>({id:'synthetic'}),start:async()=>server});
  const form=new URLSearchParams({grant_type:'password',password:'synthetic-password',username:'synthetic-user',scope:'openid profile roles manage-user create-user search-user',client_id:'xuiwebapp',client_secret:'synthetic-client-value'}).toString();
  const invoke=async(method,url,body='')=>{const req=Readable.from([Buffer.from(body)]);Object.assign(req,{method,url,headers:{}});const res={writeHead(status){this.status=status;},end(body){this.body=JSON.parse(body);}};await server.listeners('request')[0](req,res);return res;};
  if(facet==='st-cic-wa-health') {
    assert.deepEqual((await invoke('GET','/health')).body,{status:'UP'});assert.deepEqual(started.readJournal(),[{method:'GET',path:'/health'}]);
    assert.equal((await invoke('GET','/health','PRIVATE-CANARY')).status,501);assert.deepEqual(started.readJournal(),[{method:'GET',path:'/health'}]);
    assert.equal((await invoke('POST','/o/token',form)).status,501);
  } else {
    const response=await invoke('POST','/o/token',form);assert.equal(response.status,200);
    assert.deepEqual(JSON.parse(Buffer.from(response.body.access_token.split('.')[1],'base64url')),{sub:'synthetic-user',exp:4102444800});assert.deepEqual(started.readJournal(),[]);
    assert.equal((await invoke('POST','/o/token',form+'&extra=PRIVATE-CANARY')).status,501);
  }
  assert.equal((await invoke('GET','/unknown?secret=PRIVATE-CANARY')).status,501);
  for(const file of fs.readdirSync(output))assert(!fs.readFileSync(path.join(output,file),'utf8').includes('PRIVATE-CANARY'));
});

for(const platform of ['linux/arm64','linux/amd64'])for(const [facet,fault] of api3)test(`${facet} ${platform}: controller binds the exact published consumer and one config delta through owned fake pair cleanup`,async t=>{
  const {EventEmitter}=require('node:events');
  const {runSourceProfileFeasibility}=await import('./run-harness-source-profile-jurisdictions.mjs');
  const {executeProfileProof}=await import('./source-profile-jurisdictions-worker.mjs');
  const {validateStCicConsumerObservations,validateStCicWaHealth}=await import('./lib/exui-st-cic-profile-consumers.mjs');
  const {digestBytes}=await import('./lib/exui-evidence-io.mjs');
  const published='20c6ec129fc1e81061c733e164198ec63a33e71a';
  for(const scenario of ['valid','foreign-commit','foreign-method','extra-config-delta','failed-terminal']) {
    const parent=temporary(t),candidateRoot=path.join(parent,'candidate');fs.mkdirSync(candidateRoot);
    const artifact={candidateRoot,identity:{webappCommit:scenario==='foreign-commit'?'26d17ebea1b7b470b6cc11409564ce296e8ec621':published,artifactDigest:'sha256:'+'a'.repeat(64)},payloadDigest:'sha256:'+'b'.repeat(64),provenance:{sourceMethod:scenario==='foreign-method'?'working-tree':'git-archive',webappCommit:scenario==='foreign-commit'?'26d17ebea1b7b470b6cc11409564ce296e8ec621':published,platform,runtimeNodeVersion:'v24.22.1'}};
    const artifactPath=path.join(parent,'artifact.json'),output=path.join(parent,'output');fs.writeFileSync(artifactPath,JSON.stringify(artifact));
    const source=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/exui-configuration-source.json'))).sources.find(row=>row.path==='config/default.json').document;
    const image='sha256:'+'c'.repeat(64),signalTarget=new EventEmitter();signalTarget.stderr={write:()=>{}};signalTarget.exit=()=>{};let calls=0,id=0;
    const execute=()=>runSourceProfileFeasibility({facet,artifactPath,output},{inspectOwner:()=>null,verifyArtifact:async()=>structuredClone(artifact),inspectRuntime:()=>({imageId:image,platform}),signalTarget,
      configuration:(_root,mutation)=>{
        const config=structuredClone({jurisdictions:source.jurisdictions,staffSupportedJurisdictions:source.staffSupportedJurisdictions,serviceRefDataMapping:source.serviceRefDataMapping,feature:{workAllocationEnabled:false}});
        if(mutation) {
          if(facet==='st-cic-staff')config.staffSupportedJurisdictions='CIVIL,EMPLOYMENT,PRIVATELAW,PUBLICLAW,IA,SSCS,DIVORCE,FR,PROBATE,HRS,PCS';
          if(facet==='st-cic-mapping')config.serviceRefDataMapping.find(row=>row.service==='ST_CIC').serviceCodes=['ZZZ1'];
          if(facet==='st-cic-wa-health')config.feature.workAllocationEnabled=true;
          if(scenario==='extra-config-delta')config.jurisdictions='FOREIGN';
        }
        return{config,digest:digestBytes(JSON.stringify(config)),contract:{mutation}};
      },
      runInvocation:async(spec,{resources})=>{
        calls++;assert.equal(spec.manifest.scope,`exui-${facet}-feasibility`);
        assert.equal(spec.platform,platform);
        assert.equal(spec.tools.args[spec.tools.args.indexOf('--platform')+1],platform);
        assert.equal(spec.candidate.arguments('a'.repeat(64))[spec.candidate.arguments('a'.repeat(64)).indexOf('--platform')+1],platform);
        const config=JSON.parse(spec.candidate.launchProcess.command.find(value=>value.startsWith('NODE_CONFIG=')).slice(12));
        assert.equal(config.feature.workAllocationEnabled,facet==='st-cic-wa-health'&&spec.invocationId!=='baseline');
        for(const service of ['tools','candidate']){const name=`${spec.owner}-${spec.invocationId}-${service}`;resources.set(name,{kind:'container',name,owner:spec.owner,image,id:String(++id).repeat(64),service:service==='tools'?'browser-provider':'candidate',removed:true});}
        const input=JSON.parse(fs.readFileSync(path.join(output,'profile-input.json'))),mutation=spec.invocationId==='baseline'?null:fault,data=await apiRecord(facet,mutation),current={facet,directory:spec.directory,invocationId:spec.invocationId,mutation,identity:artifact.identity,configDigest:input.configurations[spec.invocationId].digest,sourceDigest:input.sources.digest};
        fs.writeFileSync(path.join(spec.directory,facet==='st-cic-wa-health'?'profile-st-cic-health.json':'profile-st-cic-observations.json'),JSON.stringify(data));
        fs.writeFileSync(path.join(spec.directory,'profile-st-cic-destinations.json'),JSON.stringify(data.fullJournal??data.journal));fs.writeFileSync(path.join(spec.directory,'profile-st-cic-support.json'),'[]');
        const code=await executeProfileProof(current,{probe:()=>facet==='st-cic-wa-health'?validateStCicWaHealth(data.observation,data.journal,mutation):validateStCicConsumerObservations(facet,data.observations,data.journal,mutation)});
        return{terminal:{code:scenario==='failed-terminal'?2:code,signal:null}};
      },removeResource:async(resources,key)=>{resources.get(key).removed=true;},
    });
    if(scenario.startsWith('foreign-')){await assert.rejects(execute,/ST_CIC_CONSUMER_INVALID/);assert.equal(calls,0);continue;}
    const result=await execute();
    if(scenario==='valid'){assert.equal(result.status,'feasibility-observed',JSON.stringify(result.failure));assert.equal(calls,2);assert.equal(result.cleanup.complete,true);assert.equal(result.cleanup.containers.length,4);assert.equal(result.privateStateRemoved,true);assert.equal(result.catalogueCredit,false);assert.equal(result.kind,`source-profile-${facet}-feasibility`);}
    else {assert.equal(result.status,'failed');assert.equal(result.failure.code,scenario==='extra-config-delta'?'SOURCE_PROFILE_CONFIG_DRIFT':'SOURCE_PROFILE_FRAMEWORK_TERMINAL');assert.equal(calls,scenario==='extra-config-delta'?0:1);assert.equal(result.cleanup.complete,true);}
  }
});

for(const [facet,fault,named] of api3)test(`${facet}: default worker dispatch executes its real probe on independently literal fake transport`,async t=>{
  const {executeProfileProof}=await import('./source-profile-jurisdictions-worker.mjs');
  for(const mutation of [null,fault]) {
    const data=await apiRecord(facet,mutation),directory=temporary(t),current={facet,directory,invocationId:mutation??'baseline',mutation,identity:{},configDigest:'config',sourceDigest:'source'};
    let journal=facet==='st-cic-wa-health'?data.before:[],index=0;
    const original=globalThis.fetch;
    globalThis.fetch=async(url,options)=>{
      if(facet==='st-cic-wa-health') {
        index++;assert.equal(url,'http://127.0.0.1:3100/health');assert.equal(options.method,'GET');journal=data.fullJournal;
        return{status:200,json:async()=>data.observation.body};
      }
      const row=data.observations[index++];assert.equal(url,'http://127.0.0.1:3100'+row.entrypoint);
      assert.equal(options.method,index===1||facet==='st-cic-mapping'&&[4,5].includes(index)?'GET':'POST');
      if(options.method==='POST')assert.equal(options.headers['x-xsrf-token'],'SYNTHETIC-CSRF');
      journal=data.journal.slice(0,row.outboundCount);
      return{status:200,headers:{getSetCookie:()=>['XSRF-TOKEN=SYNTHETIC-CSRF; Secure']},json:async()=>row.body};
    };
    try{assert.equal(await executeProfileProof(current,{cookie:'COOKIE-CANARY',readJournal:()=>structuredClone(journal)}),mutation?1:0);}finally{globalThis.fetch=original;}
    assert.equal(index,facet==='st-cic-wa-health'?1:data.observations.length);
    const result=JSON.parse(fs.readFileSync(path.join(directory,'profile-worker-result.json')));assert.equal(result.code,mutation?named:null);
    const file=path.join(directory,facet==='st-cic-wa-health'?'profile-st-cic-health.json':'profile-st-cic-observations.json'),raw=fs.readFileSync(file,'utf8');
    assert.deepEqual(JSON.parse(raw),data);assert(!raw.includes('COOKIE-CANARY'));
  }
});
