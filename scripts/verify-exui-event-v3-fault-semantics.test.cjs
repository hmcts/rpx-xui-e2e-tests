const test = require('node:test');
const assert = require('node:assert/strict');
const { eventV3SemanticFixture: fixture } = require('./fixtures/exui-event-v3-semantic.mock.cjs');
const load = () => import('./lib/exui-event-v3-fault-semantics.mjs');
const replay = (m,f) => m.readEventSerialV3FaultSemantics(f.directory, f.expected, { runPin:f.runPin, invocationId:f.invocationId });

test('full v3 lifecycle plus one exact judge-event baseline/fault replay grants no whole-chain or runtime authority', async t => {
 const m=await load(),f=await fixture(t),result=replay(m,f);
 assert.equal(result.lifecycleFaults,11);assert.equal(result.semanticFaults,1);
 assert.equal(result.semanticInvocationId,'ccd-enable-judge-event');
 assert.equal(result.expectedFailureId,'event-capability-isolation');
 assert.equal(result.baselineProofId,'ccd-event-create-denied');
 for(const key of ['semanticReplay','nativeAuthority','sourceComplete','nativeRuntimeAcceptance','runtimeAcceptance','catalogueCredit','releaseCredit','releaseApproval','promotionAllowed'])assert.equal(result[key],false);
 assert(!JSON.stringify(result).includes('Bearer'));assert(!JSON.stringify(result).includes(f.directory));
});
for(const failure of ['unrelated-assertion','family-membership'])test(`coherently rehashed ${failure} cannot replace the declared judge-event failure`,async t=>{
 const m=await load(),f=await fixture(t);f.changeFaultReport(report=>{report.tests[0].failureId=failure;});
 assert.throws(()=>replay(m,f),/EVENT_V3_SEMANTIC_EXPECTED_FAILURE/);
});
test('selected report identity cannot escape its execution context',async t=>{
 const m=await load(),f=await fixture(t);f.changeFaultReport(report=>{report.context.identity.artifactDigest='sha256:'+'0'.repeat(64);});
 assert.throws(()=>replay(m,f),/REPORT_CONTEXT_MISMATCH/);
});
test('canonical fault source import is replayed rather than trusted from a digest',async t=>{
 const m=await load(),f=await fixture(t);
 f.changeFaultImport(receipt=>{receipt.sourceRevision='foreign-source';});
 assert.throws(()=>replay(m,f),/EVENT_TRANSITION_IMPORT_SOURCE/);
});
test('coherently rehashed derivation cannot claim another source cell',async t=>{
 const m=await load(),f=await fixture(t);f.changeDerivation(value=>{value.target='foreign-target';});
 assert.throws(()=>replay(m,f),/EVENT_V3_SEMANTIC_DERIVATION_TARGET/);
});
test('missing or replaced held run pin and an unknown fault selection are rejected',async t=>{
 const m=await load(),f=await fixture(t);
 assert.throws(()=>m.readEventSerialV3FaultSemantics(f.directory,f.expected,{runPin:{path:'run.json',digest:'sha256:'+'0'.repeat(64)},invocationId:f.invocationId}),/EVENT_V3_SEMANTIC_RAW_DIGEST/);
 assert.throws(()=>m.readEventSerialV3FaultSemantics(f.directory,f.expected,{runPin:f.runPin,invocationId:'unknown-fault'}),/EVENT_V3_SEMANTIC_SELECTION/);
});
