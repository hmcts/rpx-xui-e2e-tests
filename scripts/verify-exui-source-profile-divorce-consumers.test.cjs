const test=require('node:test');
const assert=require('node:assert/strict');
const load=()=>import('./lib/exui-source-profile-divorce-consumers.mjs');
test('DIVORCE consumers remain a bounded zero-credit prerequisite',async()=>{
 const m=await load();assert.equal(m.DIVORCE_CONSUMERS.staff.fault,'source-profile-drop-divorce-staff');assert.equal(m.DIVORCE_CONSUMERS.mapping.fault,'source-profile-change-divorce-code');
 for(const facet of ['staff','mapping'])assert.equal(m.divorceConsumerEvidence(facet).catalogueCredit,false);
});
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http');
const temp=t=>{const p=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'divorce-consumers-'));t.after(()=>fs.rmSync(p,{recursive:true,force:true}));return p;};
for(const facet of ['staff','mapping']) {
 test(`${facet}: source configuration has one consequential mutation and preserves WA=false`,async t=>{
  const m=await load(),candidate=temp(t);fs.mkdirSync(path.join(candidate,'config'));
  const source=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/exui-configuration-source.json'))).sources.find(x=>x.path==='config/default.json'&&x.repository==='rpx-xui-webapp');
  const base=structuredClone(source.document),changed=m.applyDivorceConsumerFault(structuredClone(base),facet),expected=structuredClone(base);
  if(facet==='staff')expected.staffSupportedJurisdictions='ST_CIC,CIVIL,EMPLOYMENT,PRIVATELAW,PUBLICLAW,IA,SSCS,FR,PROBATE,HRS,PCS';
  else expected.serviceRefDataMapping.find(x=>x.service==='DIVORCE').serviceCodes=['ZZZ1'];
  assert.deepEqual(changed,expected);assert.equal(base.feature.workAllocationEnabled,false);assert.equal(changed.feature.workAllocationEnabled,false);
  fs.writeFileSync(path.join(candidate,'config/default.json'),'{}');assert.throws(()=>m.divorceConsumerConfiguration(candidate,facet),/SOURCE_PROFILE_CONFIG_DRIFT/);

 });
 test(`${facet}: baseline passes and only fully effective mutation reaches named oracle failure`,async()=>{
  const m=await load(),fault=m.DIVORCE_CONSUMERS[facet].fault,e=m.divorceConsumerEvidence(facet),changed=m.divorceConsumerEvidence(facet,fault);
  assert.equal(m.validateDivorceConsumerObservations(facet,e.observations,e.journal).catalogueCredit,false);
  const named=`SOURCE_PROFILE_DIVORCE_${facet.toUpperCase()}_ASSERTION`;
  assert.throws(()=>m.validateDivorceConsumerObservations(facet,changed.observations,changed.journal,fault),x=>x.message===named);
  for(const change of [e=>e.observations.pop(),e=>e.observations[1].status=500,e=>e.observations[1].body=[],e=>e.observations[1].outboundCount=0,e=>e.journal.pop(),e=>e.journal.push(e.journal[0]),e=>e.journal[0].path='/wrong',e=>e.journal[0].method='DELETE']){
   const bad=structuredClone(changed);change(bad);assert.throws(()=>m.validateDivorceConsumerObservations(facet,bad.observations,bad.journal,fault),x=>x.message!==named);
  }
  assert.throws(()=>m.validateDivorceConsumerObservations(facet,e.observations,e.journal,fault),x=>x.message!==named);
 });
 test(`${facet}: provider accepts exact source and fault vectors with no oracle imports`,async t=>{
  const m=await load(),{startProfileJurisdictionProviders}=await import('./lib/exui-source-profile-provider.mjs'),output=temp(t);
  const server=http.createServer((_req,res)=>{res.writeHead(200);res.end('{}');});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
  const started=await startProfileJurisdictionProviders(output,{divorce:facet,seed:()=>({id:'synthetic-test'}),start:async()=>server});const origin=`http://127.0.0.1:${server.address().port}`;
  {
   const form={grant_type:'password',password:'synthetic-password',username:'synthetic-user',scope:'openid profile roles manage-user create-user search-user',client_id:'xuiwebapp',client_secret:'synthetic-client-value'};
   const auth=await fetch(origin+'/o/token',{method:'POST',body:new URLSearchParams(form)});assert.equal(auth.status,200);const token=(await auth.json()).access_token;assert.equal(token.split('.').length,3);assert.deepEqual(JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString()),{sub:'synthetic-user',exp:4102444800});assert.deepEqual(started.readJournal(),[]);
   const denied=await fetch(origin+'/o/token',{method:'POST',body:new URLSearchParams({...form,username:'PRIVATE-AUTH-CANARY'})});assert.equal(denied.status,501);
   assert(!fs.readFileSync(path.join(output,'provider-rejections.jsonl'),'utf8').includes('PRIVATE-AUTH-CANARY'));
  }
  const combined=[];
  for(const mutation of [null,m.DIVORCE_CONSUMERS[facet].fault])for(const call of m.divorceConsumerEvidence(facet,mutation).journal){
   const response=await fetch(origin+call.path,{method:call.method,headers:{'content-type':'application/json',pagenumber:'0',size:'100000'},...(call.body?{body:JSON.stringify(call.body)}:{})});assert.equal(response.status,200);const body=await response.json();assert(body);combined.push(call);
  }
  assert.deepEqual(started.readJournal(),combined);
  for(const [route,body] of [['/am/role-assignments/query',{private:'CANARY'}],['/refdata/judicial/users',{sidam_ids:['foreign'],serviceCode:'ABA1'}],['/refdata/judicial/users','x'.repeat(5000)]]){
   const response=await fetch(origin+route,{method:'POST',headers:{'content-type':'application/json'},body:typeof body==='string'?body:JSON.stringify(body)});assert.equal(response.status,501);
  }
  assert.deepEqual(started.readJournal(),combined);assert(!fs.readFileSync(path.join(output,'profile-divorce-destinations.json'),'utf8').includes('CANARY'));
  assert(!fs.readFileSync(path.join(__dirname,'lib/exui-source-profile-divorce-provider.mjs'),'utf8').includes('divorceConsumerEvidence'));
 });
 test(`${facet}: probe retains route association, CSRF privacy and raw final journal`,async t=>{
  const m=await load(),output=temp(t),expected=m.divorceConsumerEvidence(facet);let index=0,journal=[];
  await m.probeDivorceConsumers({facet,output,cookie:'COOKIE-CANARY',readJournal:()=>structuredClone(journal),request:async(url,options)=>{
   const observation=expected.observations[index++];assert.equal(url,'http://127.0.0.1:3100'+observation.entrypoint);assert.equal(options.redirect,'manual');
   if(options.method==='POST')assert.equal(options.headers['x-xsrf-token'],'CSRF-CANARY');
   journal=expected.journal.slice(0,observation.outboundCount);
   return{status:200,headers:{getSetCookie:()=>['XSRF-TOKEN=CSRF-CANARY; Secure']},json:async()=>observation.body};
  }});
  const bytes=fs.readFileSync(path.join(output,'profile-divorce-observations.json'),'utf8');assert(!/COOKIE-CANARY|CSRF-CANARY/.test(bytes));assert.deepEqual(JSON.parse(bytes),expected);
 });
 test(`${facet}: parent replay rejects late cache refresh, wrong route and forged expected failure`,async t=>{
  const m=await load(),{executeProfileProof}=await import('./source-profile-jurisdictions-worker.mjs'),{validateProfileInvocationResult}=await import('./run-harness-source-profile-jurisdictions.mjs');
  const directory=temp(t),mutation=m.DIVORCE_CONSUMERS[facet].fault,e=m.divorceConsumerEvidence(facet,mutation),current={facet:`divorce-${facet}`,directory,invocationId:mutation,mutation,identity:{},configDigest:'config',sourceDigest:'source'};
  const write=(name,data)=>fs.writeFileSync(path.join(directory,name),JSON.stringify(data));
  write('profile-divorce-observations.json',e);write('profile-divorce-destinations.json',e.journal);
  assert.equal(await executeProfileProof(current,{probe:()=>m.validateDivorceConsumerObservations(facet,e.observations,e.journal,mutation)}),1);
  assert.equal(validateProfileInvocationResult({...current,terminal:{code:1,signal:null}}).catalogueCredit,false);
  write('provider-rejections.jsonl',{code:'UNDECLARED_PROFILE_REQUEST',method:'POST',path:'/o/token'});
  assert.throws(()=>validateProfileInvocationResult({...current,terminal:{code:1,signal:null}}),/SOURCE_PROFILE_DIVORCE_JOURNAL/);fs.rmSync(path.join(directory,'provider-rejections.jsonl'));
  write('profile-divorce-destinations.json',[...e.journal,e.journal[0]]);
  assert.throws(()=>validateProfileInvocationResult({...current,terminal:{code:1,signal:null}}),/SOURCE_PROFILE_DIVORCE_JOURNAL/);
  write('profile-divorce-destinations.json',e.journal);e.observations[1].entrypoint='/wrong';write('profile-divorce-observations.json',e);
  assert.throws(()=>validateProfileInvocationResult({...current,terminal:{code:1,signal:null}}),/SOURCE_PROFILE_DIVORCE_OBSERVATIONS/);
 });
}
test('mapping vectors independently require all seven real routes and ABA1 associations',async()=>{
 const m=await load(),e=m.divorceConsumerEvidence('mapping');
 assert.deepEqual(e.observations.map(x=>x.entrypoint),['/api/staff-supported-jurisdiction/get','/workallocation/findPerson','/workallocation/getJudicialUsers','/workallocation/location?serviceCodes=DIVORCE','/workallocation/full-location?serviceCodes=DIVORCE','/workallocation/region-location','/am/getBookings','/api/locations/getLocations']);
 assert.deepEqual(e.observations.map(x=>x.outboundCount),[0,1,2,3,4,5,7,8]);
 assert.equal(e.journal[0].body.serviceCode,'ABA1');assert.equal(e.journal[1].body.serviceCode,'ABA1');assert.equal(e.journal[7].path,'/refdata/location/court-venues/venue-search?search-string=Synthetic&court-type-id=&service_code=ABA1');
 assert.deepEqual(e.observations[6].body,[{id:'booking-100001',locationId:'100001',locationName:'Synthetic ABA1'},{id:'booking-100002',locationId:'100002',locationName:null}]);
});
test('staff vectors require both user and role markers and warm cache without additional calls',async()=>{
 const m=await load(),e=m.divorceConsumerEvidence('staff');assert.equal(e.observations.length,3);assert.equal(e.journal.length,2);assert.deepEqual(e.observations.map(x=>x.outboundCount),[0,2,2]);
 assert.deepEqual(e.observations[1].body.map(x=>[x.idamId,x.roleCategories]),[['profile-divorce',['ADMIN']],['profile-ia',['LEGAL_OPERATIONS']]]);
 assert.deepEqual(e.observations[1],e.observations[2]);
});
async function controller(t,facet,extraMutation=false){
 const m=await load(),{runSourceProfileFeasibility}=await import('./run-harness-source-profile-jurisdictions.mjs'),{digestBytes}=await import('./lib/exui-evidence-io.mjs');
 const parent=temp(t),candidateRoot=path.join(parent,'candidate');fs.mkdirSync(candidateRoot);
 const artifact={candidateRoot,identity:{artifactDigest:'sha256:'+'a'.repeat(64)},payloadDigest:'sha256:'+'b'.repeat(64),provenance:{platform:'linux/arm64',runtimeNodeVersion:'v24.22.2'}};
 const artifactPath=path.join(parent,'artifact.json');fs.writeFileSync(artifactPath,JSON.stringify(artifact));
 const output=path.join(parent,'output'),image='sha256:'+'c'.repeat(64),seen=[],fault=m.DIVORCE_CONSUMERS[facet].fault;let resourceId=0;
 const result=await runSourceProfileFeasibility({artifactPath,output,facet:`divorce-${facet}`},{
  inspectOwner:()=>null,verifyArtifact:async()=>structuredClone(artifact),inspectRuntime:()=>({imageId:image,platform:'linux/arm64'}),
  configuration:(_root,mutation)=>{const config={staffSupportedJurisdictions:'IA,DIVORCE',serviceRefDataMapping:[{service:'DIVORCE',serviceCodes:['ABA1']},{service:'IA',serviceCodes:['BFA1']}],feature:{workAllocationEnabled:false}};if(mutation)m.applyDivorceConsumerFault(config,facet);if(mutation&&extraMutation)config.feature.workAllocationEnabled=true;return{config,digest:digestBytes(JSON.stringify(config)),contract:{mutation}};},
  runInvocation:async(spec,{resources})=>{
   seen.push(spec.invocationId);assert.equal(spec.manifest.scope,m.DIVORCE_CONSUMERS[facet].scope);
   const sealed=spec.candidate.launchProcess.command.find(x=>x.startsWith('NODE_CONFIG='));assert.equal(JSON.parse(sealed.slice(12)).feature.workAllocationEnabled,false);
   for(const service of ['tools','candidate']){const name=`${spec.owner}-${spec.invocationId}-${service}`;resources.set(name,{kind:'container',name,id:String(++resourceId).repeat(64),owner:spec.owner,image,service:service==='tools'?'browser-provider':'candidate',removed:true});}
   const input=JSON.parse(fs.readFileSync(path.join(output,'profile-input.json'))),mutation=spec.invocationId==='baseline'?null:fault,e=m.divorceConsumerEvidence(facet,mutation);
   const worker={schemaVersion:1,status:mutation?'expected-fault-observed':'observed',invocationId:spec.invocationId,mutation,code:mutation?`SOURCE_PROFILE_DIVORCE_${facet.toUpperCase()}_ASSERTION`:null,identity:artifact.identity,configDigest:input.configurations[spec.invocationId].digest,sourceDigest:input.sources.digest,runtimeAcceptance:false,catalogueCredit:false,wholeProfileSatisfied:false,releaseCredit:false};
   fs.writeFileSync(path.join(spec.directory,'profile-worker-result.json'),JSON.stringify(worker));fs.writeFileSync(path.join(spec.directory,'profile-divorce-observations.json'),JSON.stringify(e));fs.writeFileSync(path.join(spec.directory,'profile-divorce-destinations.json'),JSON.stringify(e.journal));return{terminal:{code:mutation?1:0,signal:null}};
  },removeResource:async(resources,key)=>{resources.get(key).removed=true;},
 });return{result,seen};
}
for(const facet of ['staff','mapping'])test(`${facet}: controller seals configuration, replays each pair and rejects a second mutation before runtime`,async t=>{
 const m=await load(),{result,seen}=await controller(t,facet);assert.equal(result.status,'feasibility-observed');assert.deepEqual(seen,['baseline',m.DIVORCE_CONSUMERS[facet].fault]);assert.equal(result.cleanup.complete,true);assert.equal(result.privateStateRemoved,true);
 for(const key of ['runtimeAcceptance','catalogueCredit','wholeProfileSatisfied','releaseCredit'])assert.equal(result[key],false);
 const bad=await controller(t,facet,true);assert.equal(bad.result.failure.code,'SOURCE_PROFILE_CONFIG_DRIFT');assert.deepEqual(bad.seen,[]);
});
test('probe rejects missing CSRF, transport errors and stale journals without persisting secrets',async t=>{
 const {probeDivorceConsumers}=await load(),output=temp(t);
 const options={facet:'staff',output,cookie:'COOKIE-CANARY',readJournal:()=>[]};
 await assert.rejects(probeDivorceConsumers({...options,readJournal:()=>[{}],request:()=>assert.fail()}),/SOURCE_PROFILE_DIVORCE_JOURNAL/);
 await assert.rejects(probeDivorceConsumers({...options,request:async()=>({status:403,json:()=>assert.fail('private body must not be read')})}),/SOURCE_PROFILE_DIVORCE_TRANSPORT/);
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(output,'profile-divorce-transport.json'))),{facet:'staff',index:0,status:403});
 for(const cookies of [[],['XSRF-TOKEN=one','XSRF-TOKEN=two'],['XSRF-TOKEN=bad%0Atoken']])await assert.rejects(probeDivorceConsumers({...options,request:async()=>({status:200,headers:{getSetCookie:()=>cookies}})}),/SOURCE_PROFILE_DIVORCE_CSRF/);
 assert(!fs.existsSync(path.join(output,'profile-divorce-observations.json')));
});

test('every mapping consumer must retain its own successful marker association before naming a fault',async()=>{
 const m=await load(),fault=m.DIVORCE_CONSUMERS.mapping.fault;
 for(let index=1;index<=7;index++){
  const e=m.divorceConsumerEvidence('mapping',fault);e.observations[index].body=[];
  assert.throws(()=>m.validateDivorceConsumerObservations('mapping',e.observations,e.journal,fault),/SOURCE_PROFILE_DIVORCE_OBSERVATIONS/);
 }
});
