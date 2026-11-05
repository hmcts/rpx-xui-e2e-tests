const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
async function evidence(mutation=null) {
 const lib=await import('./lib/exui-source-profile-jurisdictions.mjs');
 const ids=lib.SOURCE_JURISDICTIONS.filter(id=>!mutation||id!=='DIVORCE');
 const observations=[0,1].flatMap(()=>['read','create','default'].map(access=>({access,status:200,body:lib.profileJurisdictionRows(access).filter(row=>ids.includes(row.id))})));
 const journal=['read','create','default'].map(access=>({method:'GET',path:'/aggregated/caseworkers/harness-supervisor/jurisdictions',access}));
 return {lib,observations,journal};
}
test('three contrasting families share jurisdiction facet but never whole-profile credit',async()=>{
 const {lib,observations,journal}=await evidence();
 const result=lib.validateProfileJurisdictionObservations(observations,journal);
 assert.deepEqual(result.families,['CMC','FR','DIVORCE']);assert.equal(result.catalogueCredit,false);assert.equal(result.wholeProfileSatisfied,false);
 assert(lib.profileJurisdictionRows('read').some(row=>row.id==='ST_CIC'));assert(lib.profileJurisdictionRows('read').some(row=>row.id==='UNREVIEWED'));
});
for(const [name,change] of [
 ['broadened unknown family',e=>e.observations[0].body.push({id:'UNREVIEWED'})],
 ['partition contamination',e=>e.observations[1].body=e.observations[0].body],
 ['cache miss',e=>e.journal.push(e.journal[0])],
 ['unrewritten uid',e=>e.journal[0].path='/aggregated/caseworkers/:uid/jurisdictions'],
 ['transport error',e=>e.observations[0].status=500],
 ['missing baseline family',e=>e.observations[0].body=e.observations[0].body.filter(row=>row.id!=='CMC')],
])test(`rejects ${name}`,async()=>{const e=await evidence();change(e);assert.throws(()=>e.lib.validateProfileJurisdictionObservations(e.observations,e.journal));});
test('effective omission reaches intended assertion only after valid independent partitions',async()=>{
 const {lib,observations,journal}=await evidence('fault');
 assert.throws(()=>lib.validateProfileJurisdictionObservations(observations,journal,lib.SOURCE_PROFILE_JURISDICTION_FAULT),/^Error: SOURCE_PROFILE_JURISDICTION_ASSERTION$/);
 observations[0].status=500;assert.throws(()=>lib.validateProfileJurisdictionObservations(observations,journal,lib.SOURCE_PROFILE_JURISDICTION_FAULT),/SOURCE_PROFILE_TRANSPORT/);
});
test('ineffective omission is not an accepted fault',async()=>{
 const {lib,observations,journal}=await evidence();assert.throws(()=>lib.validateProfileJurisdictionObservations(observations,journal,lib.SOURCE_PROFILE_JURISDICTION_FAULT),/SOURCE_PROFILE_FAULT_NOT_EFFECTIVE/);
});
test('candidate probe uses real proxy URLs, no redirect-follow and persists only synthetic observations',async t=>{
 const {lib,observations,journal}=await evidence();const output=fs.mkdtempSync(path.join(os.tmpdir(),'profile-probe-'));t.after(()=>fs.rmSync(output,{recursive:true,force:true}));let calls=0;
 const endpoint='http://127.0.0.1:3100/aggregated/caseworkers/:uid/jurisdictions';
 const expectedUrls=[`${endpoint}?access=read`,`${endpoint}?access=create`,endpoint];
 await lib.probeProfileJurisdictions({cookie:'synthetic',output,readJournal:()=>journal,request:async(url,options)=>{assert.equal(url,expectedUrls[calls%3]);assert.equal(options.redirect,'manual');return options.headers.cookie==='xui-webapp=synthetic'?{status:200,json:async()=>observations[calls++].body}:{status:401};}});
 assert.equal(calls,6);const saved=fs.readFileSync(path.join(output,'profile-jurisdiction-observations.json'),'utf8');assert(!saved.includes('connect.sid'));
});
test('failed authenticated transport preserves only access, attempt and numeric status',async t=>{
 const {lib}=await evidence();const output=fs.mkdtempSync(path.join(os.tmpdir(),'profile-transport-'));t.after(()=>fs.rmSync(output,{recursive:true,force:true}));
 await assert.rejects(lib.probeProfileJurisdictions({cookie:'PRIVATE-CREDENTIAL-CANARY',output,readJournal:()=>assert.fail('failed transport cannot reach proof'),request:async()=>({status:401,headers:{authorization:'PRIVATE-CREDENTIAL-CANARY'},json:async()=>assert.fail('private error body must not be read')})}),/SOURCE_PROFILE_TRANSPORT/);
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(output,'profile-jurisdiction-transport.json'))),{schemaVersion:1,access:'read',attempt:1,status:401});
});
test('configuration refuses unbound source bytes before adapting source-default semantics',async t=>{
 const {lib}=await evidence();const root=fs.mkdtempSync(path.join(os.tmpdir(),'profile-source-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));fs.mkdirSync(path.join(root,'config'));fs.writeFileSync(path.join(root,'config/default.json'),'{}');
 assert.throws(()=>lib.sourceProfileJurisdictionConfiguration(root),/SOURCE_PROFILE_CONFIG_DRIFT/);
});

async function profileProvider(t,health=false) {
 const http=require('node:http');
 const output=fs.mkdtempSync(path.join(os.tmpdir(),'profile-provider-'));
 const server=http.createServer((_request,response)=>{response.writeHead(200,{'content-type':'application/json'});response.end('{}');});
 t.after(async()=>{server.closeAllConnections();await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));fs.rmSync(output,{recursive:true,force:true});});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const {startProfileJurisdictionProviders}=await import('./lib/exui-source-profile-provider.mjs');
 const provider=await startProfileJurisdictionProviders(output,{seed:()=>({id:'synthetic-provider-session'}),start:async()=>server,health});
 return {...provider,output,origin:`http://127.0.0.1:${server.address().port}`};
}

test('actual profile provider accepts only the three canonical actor routes over HTTP',async t=>{
 const provider=await profileProvider(t),route='/aggregated/caseworkers/harness-supervisor/jurisdictions';
 for(const access of ['read','create','default']) {
  const url=provider.origin+route+(access==='default'?'':`?access=${access}`);
  const response=await fetch(url,{redirect:'manual'});assert.equal(response.status,200);
  const rows=await response.json();assert.equal(rows.length,14);
  assert(rows.every(row=>row.name.startsWith(`Synthetic ${access} `)));
  assert(rows.some(row=>row.id==='UNREVIEWED'));assert(rows.some(row=>row.id==='ST_CIC'));
 }
 assert.deepEqual(provider.readJournal(),['read','create','default'].map(access=>({method:'GET',path:route,access})));
 for(const [method,path] of [
  ['GET',`${route}?scope=profile`],['GET',`${route}?access=read&access=create`],
  ['GET',`${route}?access=read&other=value`],['GET',`${route}?%61ccess=read`],
  ['GET',`${route}?access=update`],['GET',route.replace('harness-supervisor','other-actor')],['POST',route]
 ]) {
  const response=await fetch(provider.origin+path,{method,redirect:'manual'});assert.equal(response.status,501);
  assert.deepEqual(await response.json(),{code:'UNDECLARED_PROFILE_REQUEST'});
 }
 assert.equal(provider.readJournal().length,3);
});

test('all worker-emitted routes reach the real provider while its unfiltered uncached responses still fail the product oracle',async t=>{
 const provider=await profileProvider(t),{lib}=await evidence();
 const emitted=[];
 await assert.rejects(lib.probeProfileJurisdictions({cookie:'synthetic',output:provider.output,readJournal:provider.readJournal,request:async(url,options)=>{
  emitted.push(url);
  // Only model the declared authenticated UID transport here; no candidate filtering or caching.
  const target=new URL(url);target.pathname=target.pathname.replace('/caseworkers/:uid/','/caseworkers/harness-supervisor/');
  return fetch(provider.origin+target.pathname+target.search,{method:options.method,redirect:options.redirect});
 }}),{code:'ERR_ASSERTION',actual:6,expected:3,message:/^SOURCE_PROFILE_UPSTREAM_COUNT/});
 const endpoint='http://127.0.0.1:3100/aggregated/caseworkers/:uid/jurisdictions';
 const routes=[`${endpoint}?access=read`,`${endpoint}?access=create`,endpoint];
 assert.deepEqual(emitted,[...routes,...routes]);
 assert.equal(provider.readJournal().length,6);
 const observations=JSON.parse(fs.readFileSync(path.join(provider.output,'profile-jurisdiction-observations.json'))).observations;
 assert.equal(observations.length,6);
 for(const observation of observations){assert.equal(observation.status,200);assert.equal(observation.body.length,14);assert(observation.body.every(row=>row.name.startsWith(`Synthetic ${observation.access} `)));}
 assert(!fs.existsSync(path.join(provider.output,'provider-rejections.jsonl')));
});

test('health provider records exact outbound checks only in explicit health mode',async t=>{
 const provider=await profileProvider(t,true);
 assert.deepEqual(provider.readJournal(),[]);
 const response=await fetch(provider.origin+'/health');assert.equal(response.status,200);
 assert.deepEqual(provider.readJournal(),[{method:'GET',path:'/health'}]);
 for(const [route,method] of [['/health?unexpected=1','GET'],['/health','POST'],['/health/foreign','GET']])assert.equal((await fetch(provider.origin+route,{method})).status,501);
 assert.equal(provider.readJournal().length,1);
});
