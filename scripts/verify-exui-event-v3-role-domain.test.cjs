const test=require('node:test'),assert=require('node:assert/strict');
const {roleFixture}=require('./fixtures/exui-event-v3-role-domain.mock.cjs');
const load=()=>import(process.env.EVENT_V3_ROLE_TEST_MODULE??'./lib/exui-event-v3-fault-semantics.mjs');
const ids=['ccd-remove-courtadmin-recipient-read','ccd-remove-readonly-recipient-read','ccd-remove-courtadmin-event-create','ccd-enable-readonly-recipient-update'];
const replay=(m,f)=>m.readEventSerialV3RoleSemantics(f.directory,f.expected,{runPin:f.runPin,invocationId:f.invocationId});
for(const id of ids){
 test(`${id} requires all healthy role baselines and its own four-shape actual observation bytes`,async t=>{
  const f=await roleFixture(t,id),m=await load(),result=replay(m,f);
  assert.equal(result.replayScope,'structured-proof-import-derivation-and-role-observations');
  assert.deepEqual(result.roleDomain,{name:f.roleName,baselineObservations:4,faultObservations:1,checkedScenarios:20});
  assert.equal(result.semanticFaults,1);assert.equal(result.incompleteDomainFaults.length,7);
  for(const key of ['semanticReplay','nativeAuthority','sourceComplete','nativeRuntimeAcceptance','runtimeAcceptance','catalogueCredit','releaseCredit','releaseApproval','promotionAllowed'])assert.equal(result[key],false);
  assert(!JSON.stringify(result).includes(f.directory));assert(!JSON.stringify(result).includes('Bearer'));assert(!JSON.stringify(result).includes('synthetic-unit-session'));
 });
 test(`${id} rejects coherently resealed actor, fields, data, history, case and missing requests`,async t=>{
  const m=await load();
  const changes=[
   ['actor',v=>v.observations[0].actor.id='foreign'],
   ['field permission projection',v=>{const o=v.observations[0];if(o.recipientFields!==undefined)o.recipientFields=[{id:'foreign',value:[]}];else o.eventTriggers=[{id:'foreign',name:'Foreign event'}];}],
   ['data',v=>v.observations[0].after.state.case_data.protectedValue='foreign'],
   ['history',v=>v.observations[0].after.history.push({id:'foreign'})],
   ['case',v=>v.observations[0].before.state.id=1234567890123999],
  ];
  for(const[label,change]of changes){const f=await roleFixture(t,id);replay(m,f);f.changeRole(id,f.roleName+'-observation.json',change);assert.throws(()=>replay(m,f),/^Error: EVENT_V3_ROLE_REPLAY_INVALID$/,label);}
  const missing=await roleFixture(t,id);replay(m,missing);missing.changeRole(id,'ccd-requests.jsonl',r=>r.pop());assert.throws(()=>replay(m,missing),/^Error: EVENT_V3_ROLE_REPLAY_INVALID$/);
 });
}
test('structured-only replay is not a replacement for domain observations',async t=>{
 const f=await roleFixture(t),m=await load();f.changeRole(f.invocationId,f.roleName+'-observation.json',v=>v.observations[0].actor.id='foreign');
 assert.equal(m.readEventSerialV3FaultSemantics(f.directory,f.expected,{runPin:f.runPin,invocationId:f.invocationId}).replayScope,'structured-proof-import-derivation');
 assert.throws(()=>replay(m,f),/^Error: EVENT_V3_ROLE_REPLAY_INVALID$/);
});
test('actual role files must be present in both held completion and run execution pins',async t=>{
 const {eventV3PolicySemanticFixture}=require('./fixtures/exui-event-v3-policy-semantic.mock.cjs'),m=await load();
 const unsealed=await eventV3PolicySemanticFixture(t,ids[0]);assert.throws(()=>replay(m,unsealed),/^Error: EVENT_V3_ROLE_REPLAY_INVALID$/);
 const f=await roleFixture(t);replay(m,f);const run=f.read('run.json'),ref=run.executionArtifacts.find(r=>r.path===f.invocationId+'/execution.json'),execution=f.read(ref.path);delete execution.sharedRoleArtifacts;Object.assign(ref,f.put(ref.path,execution));f.put('run.json',run);f.saveRun();assert.throws(()=>replay(m,f),/^Error: EVENT_V3_ROLE_REPLAY_INVALID$/);
});
test('healthy baseline cannot be replaced by a fault, and persona or context cannot replace selected source identity',async t=>{
 const m=await load();
 for(const [id,file,change]of [
  ['baseline','courtadmin-read-observation.json',v=>{v.observations[0].controlVisible=false;}],
  [ids[0],'personas.json',v=>v.credentials.courtadmin.roles.push('admin')],
  [ids[0],'personas.json',v=>{v.credentials.courtadmin.headers.Authorization='Bearer private-unit-substitution';}],
  [ids[0],'context.json',v=>v.invocationId='baseline'],
 ]){const f=await roleFixture(t);replay(m,f);f.changeRole(id,file,change);assert.throws(()=>replay(m,f),/^Error: EVENT_V3_ROLE_REPLAY_INVALID$/);}
});
test('late authenticated requests cannot satisfy an earlier write or case window',async t=>{
 const m=await load();
 for(const id of [ids[0],ids[2],ids[3]]){
  const f=await roleFixture(t,id);replay(m,f);f.changeRole(id,'ccd-requests.jsonl',rows=>{rows.push(rows.shift());});assert.throws(()=>replay(m,f),/^Error: EVENT_V3_ROLE_REPLAY_INVALID$/);
 }
});

test('role domain membership rejects omitted, duplicate, extra and unsealed altered bytes',async t=>{
 const m=await load(),fs=require('node:fs'),path=require('node:path');
 for(const change of [r=>r.files.pop(),r=>r.files.push(r.files[0]),r=>r.files.push({path:'foreign/observation.json',digest:r.files[0].digest})]){
  const f=await roleFixture(t);replay(m,f);f.rewriteRaw(f.index,'readbacks',change);assert.throws(()=>replay(m,f),/^Error: EVENT_V3_ROLE_REPLAY_INVALID$/);
 }
 const f=await roleFixture(t);replay(m,f);fs.appendFileSync(path.join(f.directory,f.invocationId,f.roleName+'-observation.json'),' ');assert.throws(()=>replay(m,f),/^Error: EVENT_V3_ROLE_REPLAY_INVALID$/);
});
test('healthy role cases preserve their own order without inventing a global baseline spec order',async t=>{
 const f=await roleFixture(t),m=await load();replay(m,f);
 f.changeRole('baseline','ccd-requests.jsonl',rows=>{rows.push(...rows.splice(0,8));});
 assert.equal(replay(m,f).roleDomain.baselineObservations,4);
});
