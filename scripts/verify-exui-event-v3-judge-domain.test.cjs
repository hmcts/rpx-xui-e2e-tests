const test=require('node:test'),assert=require('node:assert/strict');
const {judgeFixture}=require('./fixtures/exui-event-v3-judge-domain.mock.cjs');
const load=()=>import(process.env.EVENT_V3_JUDGE_TEST_MODULE??'./lib/exui-event-v3-fault-semantics.mjs');
const replay=(m,f)=>m.readEventSerialV3JudgeSemantics(f.directory,f.expected,{runPin:f.runPin,invocationId:f.invocationId});
const role=(m,f)=>m.readEventSerialV3RoleSemantics(f.directory,f.expected,{runPin:f.runPin,invocationId:'ccd-remove-courtadmin-recipient-read'});
test('sealed judge baseline denial and narrow effective fault replay exact source data with no authority',async t=>{
 const f=await judgeFixture(t),m=await load(),result=replay(m,f);
 assert.equal(result.replayScope,'structured-proof-import-derivation-and-judge-observations');assert.deepEqual(result.judgeDomain,{baselineObservations:1,faultObservations:1,checkedCases:2,uiObservations:2});assert.equal(result.incompleteDomainFaults.length,6);assert.equal(result.semanticFaults,1);
 for(const k of ['semanticReplay','nativeAuthority','sourceComplete','nativeRuntimeAcceptance','runtimeAcceptance','catalogueCredit','releaseCredit','releaseApproval','promotionAllowed'])assert.equal(result[k],false);
 assert(!JSON.stringify(result).includes(f.directory));assert(!JSON.stringify(result).includes('Bearer'));assert(!JSON.stringify(result).includes('@harness.example.com'));
});
test('finite baseline union is accepted by role reader without claiming sealed judge semantics',async t=>{
 const f=await judgeFixture(t),m=await load(),result=role(m,f);assert.equal(result.roleDomain.checkedScenarios,20);assert.equal(result.incompleteDomainFaults.length,7);assert(!Object.hasOwn(result,'judgeDomain'));assert.equal(result.semanticReplay,false);
});
test('judge rejects coherently resealed actor, role, data, permission, menu, case, version and history substitutions',async t=>{
 const m=await load();
 for(const change of [
  v=>v.actor.userId='foreign',v=>v.sessionUser.roles.push('admin'),v=>v.submittedData.sodAdditionalRecipientsList[0].value.emailInformation.emailAddress='wrong',v=>v.intendedData.protectedValue='wrong',v=>v.eventTriggers=[],v=>v.eventOptions=[],v=>v.caseTriggers=[],v=>v.before.state.id=1234567890123999,v=>v.after.state.version++,v=>v.after.history.push({id:'foreign'}),v=>v.after.history[0].user_id='foreign',v=>v.after.state.case_data.protectedValue='wrong',v=>v.legacyTokenStatus=403,v=>v.eventTokenPresent=false,
 ]){const f=await judgeFixture(t);replay(m,f);f.changeJudge(f.invocationId,'event-capability-observation.json',change);assert.throws(()=>replay(m,f),/^Error: EVENT_V3_JUDGE_REPLAY_INVALID$/);}
 const f=await judgeFixture(t);replay(m,f);f.changeJudge('baseline','event-capability-observation.json',v=>{v.after.state.case_data.protectedValue='changed';});assert.throws(()=>replay(m,f),/^Error: EVENT_V3_JUDGE_REPLAY_INVALID$/);
});
test('required UI receipt cannot be inferred from report pass, projected data or caller flags',async t=>{
 const m=await load();
 for(const change of [v=>v.visibleMarkers=[],v=>v.visibleMarkers[0].visible=false,v=>v.userDetailsStatus=302,v=>v.actorId='foreign',v=>v.caseId='1234567890123999',v=>v.extra='private-canary']){const f=await judgeFixture(t);replay(m,f);f.changeJudge(f.invocationId,'judge-event-ui-observation.json',change);assert.throws(()=>replay(m,f),/^Error: EVENT_V3_JUDGE_REPLAY_INVALID$/);}
});
test('judge requires captured credentials and native manifest/context identity',async t=>{
 const m=await load();for(const [name,change]of [['context.json',v=>v.invocationId='baseline'],['personas.json',v=>{v.credentials.judge.headers.Authorization='Bearer private-unit-substitution';}],['manifest.json',v=>v.identity.artifactDigest='sha256:'+'0'.repeat(64)]]){const f=await judgeFixture(t);replay(m,f);f.changeJudge(f.invocationId,name,change);assert.throws(()=>replay(m,f),/^Error: EVENT_V3_JUDGE_REPLAY_INVALID$/);}
});
test('baseline union rejects partial groups, duplicates, foreign extras and missing independent judge references',async t=>{
 const m=await load();
 for(const change of [r=>r.pop(),r=>r.splice(0,1),r=>r.push(r[0]),r=>r.push({path:'baseline/foreign.json',digest:r[0].digest})]){const f=await judgeFixture(t);replay(m,f);role(m,f);f.judgeMembership('baseline',change);assert.throws(()=>replay(m,f),/^Error: EVENT_V3_JUDGE_REPLAY_INVALID$/);assert.throws(()=>role(m,f),/^Error: EVENT_V3_ROLE_REPLAY_INVALID$/);}
 const f=await judgeFixture(t);replay(m,f);const run=f.read('run.json'),ref=run.executionArtifacts.find(r=>r.path===f.invocationId+'/execution.json'),execution=f.read(ref.path);delete execution.judgeEventArtifacts;Object.assign(ref,f.put(ref.path,execution));f.put('run.json',run);f.saveRun();assert.throws(()=>replay(m,f),/^Error: EVENT_V3_JUDGE_REPLAY_INVALID$/);
});
test('judge rejects missing, wrong actor/status and late start/token/submit request evidence',async t=>{
 const m=await load();for(const change of [r=>r.pop(),r=>r[2].actorId='foreign',r=>r[3].status=404,r=>r.splice(4,1),r=>{r.push(r.splice(2,1)[0]);},r=>{[r[3],r[5]]=[r[5],r[3]];}]){const f=await judgeFixture(t);replay(m,f);f.changeJudge(f.invocationId,'ccd-requests.jsonl',change);assert.throws(()=>replay(m,f),/^Error: EVENT_V3_JUDGE_REPLAY_INVALID$/);}
});
test('currently unsealed old producer packets cannot acquire judge replay from structured proof results',async t=>{
 const {eventV3PolicySemanticFixture}=require('./fixtures/exui-event-v3-policy-semantic.mock.cjs'),m=await load(),f=await eventV3PolicySemanticFixture(t,'ccd-enable-judge-event');assert.equal(m.readEventSerialV3FaultSemantics(f.directory,f.expected,{runPin:f.runPin,invocationId:f.invocationId}).semanticFaults,1);assert.throws(()=>replay(m,f),/^Error: EVENT_V3_JUDGE_REPLAY_INVALID$/);
});

test('role union seals judge extras without converting their presence into judge semantics',async t=>{
 const f=await judgeFixture(t),m=await load();replay(m,f);f.changeJudge('baseline','judge-event-ui-observation.json',v=>v.visibleMarkers[0].visible=false);assert.equal(role(m,f).incompleteDomainFaults.length,7);assert.throws(()=>replay(m,f),/^Error: EVENT_V3_JUDGE_REPLAY_INVALID$/);
});
test('judge selected capture requires all six members and named causal structured failure',async t=>{
 const m=await load(),f=await judgeFixture(t);replay(m,f);f.judgeMembership(f.invocationId,refs=>refs.pop());assert.throws(()=>replay(m,f),/^Error: EVENT_V3_JUDGE_REPLAY_INVALID$/);
 const other=await judgeFixture(t);replay(m,other);other.changeFaultReport(report=>{report.tests[0].failureId='unrelated-assertion';},other.invocationId);assert.throws(()=>replay(m,other),/^Error: EVENT_V3_JUDGE_REPLAY_INVALID$/);
});

test('judge accepts canonical zero-based optimistic versions and rejects malformed or nonincrementing versions',async t=>{
 const m=await load(),f=await judgeFixture(t);
 f.changeJudge('baseline','event-capability-observation.json',v=>{v.before.state.version=0;v.after.state.version=0;});
 f.changeJudge(f.invocationId,'event-capability-observation.json',v=>{v.before.state.version=0;v.after.state.version=1;});
 assert.equal(replay(m,f).judgeDomain.checkedCases,2);
 for(const version of [-1,0.5,'0',null,Number.MAX_SAFE_INTEGER+1]){
  const g=await judgeFixture(t);g.changeJudge('baseline','event-capability-observation.json',v=>{v.before.state.version=version;v.after.state.version=version;});assert.throws(()=>replay(m,g),/^Error: EVENT_V3_JUDGE_REPLAY_INVALID$/);
 }
 for(const after of [0,2]){const g=await judgeFixture(t);g.changeJudge(g.invocationId,'event-capability-observation.json',v=>{v.before.state.version=0;v.after.state.version=after;});assert.throws(()=>replay(m,g),/^Error: EVENT_V3_JUDGE_REPLAY_INVALID$/);}
});
