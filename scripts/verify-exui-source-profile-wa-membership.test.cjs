const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const fault = 'source-profile-add-cmc-wa-membership';
const vectors = [
  ['case-event', 'CMC', '9999000011112222', 'HarnessMembershipCMC', 'profileRouteCMC', 'membership-cmc-route'],
  ['case-event', 'IA', '3333444455556666', 'HarnessMembershipIA', 'profileRouteIA', 'membership-ia-route'],
  ['post', 'CMC', '1111222233334444', 'HarnessMembershipCMC', 'profilePostCMC', 'membership-cmc-post'],
  ['post', 'IA', '5555666677778888', 'HarnessMembershipIA', 'profilePostIA', 'membership-ia-post'],
];
const payload = row => ({case_id:row[2],case_jurisdiction:row[1],case_type:row[3],event_id:row[4]});
const marker = row => [{id:row[5],name:'Synthetic membership task'}];
function evidence(mutation = null) {
  return {
    observations:vectors.map(row=>({route:row[0],family:row[1],status:200,body:mutation||row[1]==='IA'?marker(row):[]})),
    journal:vectors.filter(row=>mutation||row[1]==='IA').map(row=>({method:'POST',path:'/task/search-for-completable',body:payload(row)})),
    mutation,catalogueCredit:false,
  };
}
function temporary(t) {const dir=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'profile-wa-membership-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;}

test('WA membership oracle proves both negative routes and independent IA control with no profile credit',async()=>{
  const {validateWaMembershipObservations:validate}=await import('./lib/exui-source-profile-wa-membership.mjs');
  const base=evidence();const result=validate(base.observations,base.journal);
  assert.deepEqual(result,{facet:'WA completable-task jurisdiction membership',families:['CMC','IA'],runtimeAcceptance:false,catalogueCredit:false,wholeProfileSatisfied:false,releaseCredit:false});
  const changed=evidence(fault);assert.throws(()=>validate(changed.observations,changed.journal,fault),/^Error: SOURCE_PROFILE_WA_MEMBERSHIP_ASSERTION$/);
});

for(const [name,change] of [
  ['missing positive response',e=>e.observations[1].body=[]],
  ['wrong route marker',e=>e.observations[3].body=e.observations[1].body],
  ['transport failure',e=>e.observations[0].status=500],
  ['reordered observations',e=>e.observations.reverse()],
  ['missing observation',e=>e.observations.pop()],
  ['wrong family payload',e=>e.journal[0].body.case_jurisdiction='FR'],
  ['wrong event payload',e=>e.journal[0].body.event_id='unrelated'],
  ['unexpected payload field',e=>e.journal[0].body.extra=true],
  ['missing journal',e=>e.journal=[]],
  ['extra outbound call',e=>e.journal.push(e.journal[0])],
  ['wrong destination',e=>e.journal[0].path='/task'],
  ['wrong method',e=>e.journal[0].method='GET'],
])test(`WA membership refuses ${name} as intended fault`,async()=>{
  const {validateWaMembershipObservations:validate}=await import('./lib/exui-source-profile-wa-membership.mjs');
  const e=evidence(fault);change(e);assert.throws(()=>validate(e.observations,e.journal,fault),error=>error.message!=='SOURCE_PROFILE_WA_MEMBERSHIP_ASSERTION');
});
test('unchanged baseline cannot masquerade as effective membership fault',async()=>{
  const {validateWaMembershipObservations:validate}=await import('./lib/exui-source-profile-wa-membership.mjs');
  const e=evidence();assert.throws(()=>validate(e.observations,e.journal,fault),/SOURCE_PROFILE_MEMBERSHIP_/);
  assert.throws(()=>validate(e.observations,e.journal,'unknown'),/SOURCE_PROFILE_UNKNOWN_FAULT/);
});

test('probe uses four valid real entrypoints and preserves only synthetic body/journal evidence',async t=>{
  const {probeWaMembership}=await import('./lib/exui-source-profile-wa-membership.mjs');
  const output=temporary(t),e=evidence();let count=0,journal=[];
  await probeWaMembership({output,cookie:'PRIVATE-COOKIE-CANARY',readJournal:()=>structuredClone(journal),request:async(url,options)=>{
    const row=vectors[count];assert.equal(options.redirect,'manual');assert.equal(options.headers.cookie,'xui-webapp=PRIVATE-COOKIE-CANARY');
    if(row[0]==='post') {
      assert.equal(url,'http://127.0.0.1:3100/workallocation/searchForCompletable');assert.equal(options.method,'POST');
      assert.equal(options.headers['x-xsrf-token'],'PRIVATE-CSRF-CANARY');
      assert.deepEqual(JSON.parse(options.body),{searchRequest:{ccdId:row[2],jurisdiction:row[1],caseTypeId:row[3],eventId:row[4]}});
    } else {
      assert.equal(url,`http://127.0.0.1:3100/workallocation/case/tasks/${row[2]}/event/${row[4]}/caseType/${row[3]}/jurisdiction/${row[1]}`);
      assert.equal(options.method,'GET');assert.equal(options.body,undefined);
      assert.equal(options.headers['x-xsrf-token'],undefined);
    }
    if(row[1]==='IA')journal.push({method:'POST',path:'/task/search-for-completable',body:payload(row)});
    return {status:200,headers:{getSetCookie:()=>['XSRF-TOKEN=PRIVATE-CSRF-CANARY; Path=/; Secure']},json:async()=>e.observations[count++].body};
  }});
  assert.equal(count,4);
  const saved=fs.readFileSync(path.join(output,'profile-wa-membership-observations.json'),'utf8');
  assert(!saved.includes('PRIVATE-COOKIE-CANARY'));assert(!saved.includes('PRIVATE-CSRF-CANARY'));assert.deepEqual(JSON.parse(saved),e);
});

test('probe rejects preexisting calls and failed transport without reading private response body',async t=>{
  const {probeWaMembership}=await import('./lib/exui-source-profile-wa-membership.mjs');const output=temporary(t);
  await assert.rejects(probeWaMembership({output,cookie:'private',readJournal:()=>[{}],request:()=>assert.fail('must reject before contact')}),/SOURCE_PROFILE_MEMBERSHIP_JOURNAL/);
  await assert.rejects(probeWaMembership({output,cookie:'PRIVATE-COOKIE-CANARY',readJournal:()=>[],request:async()=>({status:403,json:()=>assert.fail('do not read private error body')})}),/SOURCE_PROFILE_MEMBERSHIP_TRANSPORT/);
  assert.equal(fs.existsSync(path.join(output,'profile-wa-membership-observations.json')),false);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(output,'profile-wa-membership-transport.json'))),{route:'case-event',family:'CMC',status:403});
});

test('probe requires one candidate-issued valid token before any POST and never persists it',async t=>{
  const {probeWaMembership}=await import('./lib/exui-source-profile-wa-membership.mjs');
  for(const cookies of [[],['XSRF-TOKEN=one','XSRF-TOKEN=two'],['XSRF-TOKEN='],['XSRF-TOKEN=bad%0Atoken']]){
    const output=temporary(t);let calls=0;
    await assert.rejects(probeWaMembership({output,cookie:'private',readJournal:()=>[],request:async(_url,options)=>{
      calls++;assert.equal(options.method,'GET');return{status:200,headers:{getSetCookie:()=>cookies},json:async()=>[]};
    }}),/SOURCE_PROFILE_MEMBERSHIP_CSRF/);
    assert.equal(calls,1);assert.equal(fs.existsSync(path.join(output,'profile-wa-membership-observations.json')),false);
  }
});

async function provider(t) {
  const {startProfileJurisdictionProviders}=await import('./lib/exui-source-profile-provider.mjs');const output=temporary(t);
  const server=http.createServer((_request,response)=>{response.writeHead(200,{'content-type':'application/json'});response.end('{}');});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
  const started=await startProfileJurisdictionProviders(output,{seed:()=>({id:'synthetic-membership-session'}),start:async()=>server,membership:true});
  return {...started,output,origin:`http://127.0.0.1:${server.address().port}`};
}
test('real provider admits only four exact synthetic task payloads and journals those bodies',async t=>{
  const p=await provider(t);assert.deepEqual(JSON.parse(fs.readFileSync(path.join(p.output,'profile-wa-membership-destinations.json'))),[]);
  for(const row of vectors){const response=await fetch(p.origin+'/task/search-for-completable',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload(row))});assert.equal(response.status,200);assert.deepEqual(await response.json(),marker(row));}
  assert.deepEqual(p.readJournal(),evidence(fault).journal);
  for(const [suffix,method,body] of [
    ['', 'GET',undefined],['?extra=1','POST',JSON.stringify(payload(vectors[0]))],
    ['', 'POST','invalid-private-body'],['', 'POST',JSON.stringify({...payload(vectors[0]),extra:'private'})],
    ['', 'POST',JSON.stringify({...payload(vectors[0]),case_jurisdiction:'FR'})],['','POST','x'.repeat(5000)],
  ]){const r=await fetch(p.origin+'/task/search-for-completable'+suffix,{method,headers:{'content-type':'application/json'},body});assert.equal(r.status,501);}
  assert.equal(p.readJournal().length,4);
  assert(!fs.readFileSync(path.join(p.output,'provider-rejections.jsonl'),'utf8').includes('private'));
});

test('worker and independent replay require raw membership journal and reject forged fault',async t=>{
  const {executeProfileProof}=await import('./source-profile-jurisdictions-worker.mjs');
  const {validateProfileInvocationResult}=await import('./run-harness-source-profile-jurisdictions.mjs');
  const {validateWaMembershipObservations:validate}=await import('./lib/exui-source-profile-wa-membership.mjs');
  const directory=temporary(t),current={facet:'wa-membership',directory,invocationId:fault,mutation:fault,identity:{},configDigest:'config',sourceDigest:'source'};
  const e=evidence(fault),write=(name,value)=>fs.writeFileSync(path.join(directory,name),JSON.stringify(value));
  write('profile-wa-membership-observations.json',e);write('profile-wa-membership-destinations.json',e.journal);
  assert.equal(await executeProfileProof(current,{probe:()=>validate(e.observations,e.journal,fault)}),1);
  assert.equal(validateProfileInvocationResult({...current,terminal:{code:1,signal:null}}).catalogueCredit,false);
  write('profile-wa-membership-destinations.json',e.journal.slice(1));
  assert.throws(()=>validateProfileInvocationResult({...current,terminal:{code:1,signal:null}}),/SOURCE_PROFILE_MEMBERSHIP_JOURNAL/);
  write('profile-wa-membership-destinations.json',e.journal);
  e.observations[0].body=[];write('profile-wa-membership-observations.json',e);
  assert.throws(()=>validateProfileInvocationResult({...current,terminal:{code:1,signal:null}}),/SOURCE_PROFILE_MEMBERSHIP_RESPONSE/);
});

async function controller(t, extraMutation = false) {
  const {runSourceProfileFeasibility}=await import('./run-harness-source-profile-jurisdictions.mjs');
  const {digestBytes}=await import('./lib/exui-evidence-io.mjs');
  const parent=temporary(t),candidateRoot=path.join(parent,'candidate');fs.mkdirSync(candidateRoot);
  const artifact={candidateRoot,identity:{artifactDigest:'sha256:'+'a'.repeat(64)},payloadDigest:'sha256:'+'b'.repeat(64),provenance:{platform:'linux/arm64',runtimeNodeVersion:'v24.22.2'}};
  const artifactPath=path.join(parent,'artifact.json');fs.writeFileSync(artifactPath,JSON.stringify(artifact));
  const output=path.join(parent,'output'),image='sha256:'+'c'.repeat(64),seen=[];let resourceId=0;
  const result=await runSourceProfileFeasibility({artifactPath,output,facet:'wa-membership'},{
    inspectOwner:()=>null,verifyArtifact:async()=>structuredClone(artifact),inspectRuntime:()=>({imageId:image,platform:'linux/arm64'}),
    configuration:(_root,mutation)=>{const config={waSupportedJurisdictions:mutation?'IA,CMC':'IA',feature:{workAllocationEnabled:false}};if(extraMutation&&mutation)config.feature.workAllocationEnabled=true;return{config,digest:digestBytes(JSON.stringify(config)),contract:{mutation}};},
    runInvocation:async(spec,{resources})=>{
      seen.push(spec.invocationId);
      assert.equal(spec.manifest.scope,'exui-source-profile-wa-membership-feasibility');
      assert(spec.candidate.launchProcess.command.some(arg=>arg.startsWith('NODE_CONFIG=')&&JSON.parse(arg.slice(12)).feature.workAllocationEnabled===false));
      for(const service of ['tools','candidate']){const name=`${spec.owner}-${spec.invocationId}-${service}`;resources.set(name,{kind:'container',name,id:String(++resourceId).repeat(64),owner:spec.owner,image,service:service==='tools'?'browser-provider':'candidate',removed:true});}
      const input=JSON.parse(fs.readFileSync(path.join(output,'profile-input.json'))),mutation=spec.invocationId==='baseline'?null:fault,e=evidence(mutation);
      const worker={schemaVersion:1,status:mutation?'expected-fault-observed':'observed',invocationId:spec.invocationId,mutation,code:mutation?'SOURCE_PROFILE_WA_MEMBERSHIP_ASSERTION':null,identity:artifact.identity,configDigest:input.configurations[spec.invocationId].digest,sourceDigest:input.sources.digest,runtimeAcceptance:false,catalogueCredit:false,wholeProfileSatisfied:false,releaseCredit:false};
      fs.writeFileSync(path.join(spec.directory,'profile-worker-result.json'),JSON.stringify(worker));
      fs.writeFileSync(path.join(spec.directory,'profile-wa-membership-observations.json'),JSON.stringify(e));
      fs.writeFileSync(path.join(spec.directory,'profile-wa-membership-destinations.json'),JSON.stringify(e.journal));
      return {terminal:{code:mutation?1:0,signal:null}};
    },removeResource:async(resources,key)=>{resources.get(key).removed=true;},
  });
  return {result,seen};
}
test('controller selects isolated membership pair and preserves source WA=false and zero credit',async t=>{
  const {result,seen}=await controller(t);
  assert.equal(result.status,'feasibility-observed');assert.deepEqual(seen,['baseline',fault]);
  assert.equal(result.kind,'source-profile-wa-membership-feasibility');
  assert.deepEqual(result.mutation,{id:fault,target:'NODE_CONFIG.waSupportedJurisdictions',before:'IA',after:'IA,CMC'});
  assert.equal(result.cleanup.complete,true);assert.equal(result.privateStateRemoved,true);
  assert.equal(result.cleanup.containers.length,4);
  for(const key of ['runtimeAcceptance','catalogueCredit','wholeProfileSatisfied','releaseCredit'])assert.equal(result[key],false);
});
test('controller rejects a membership fault that also enables WA before launching runtime',async t=>{
  const {result,seen}=await controller(t,true);assert.deepEqual(seen,[]);
  assert.equal(result.status,'failed');assert.equal(result.failure.code,'SOURCE_PROFILE_CONFIG_DRIFT');
});

test('configuration rejects altered source bytes before any runtime contact',async t=>{
  const {sourceProfileWaMembershipConfiguration}=await import('./lib/exui-source-profile-wa-membership.mjs');
  const root=temporary(t);fs.mkdirSync(path.join(root,'config'));fs.writeFileSync(path.join(root,'config/default.json'),'{}');
  assert.throws(()=>sourceProfileWaMembershipConfiguration(root),/SOURCE_PROFILE_CONFIG_DRIFT/);
  assert.throws(()=>sourceProfileWaMembershipConfiguration(root,'unknown'),/SOURCE_PROFILE_UNKNOWN_FAULT/);
});
