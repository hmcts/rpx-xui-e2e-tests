const test=require('node:test'),assert=require('node:assert/strict');
const {eventV3PolicySemanticFixture:fixture}=require('./fixtures/exui-event-v3-policy-semantic.mock.cjs');
const load=()=>import(process.env.EVENT_V3_POLICY_SEMANTIC_TEST_MODULE??'./lib/exui-event-v3-fault-semantics.mjs');
const faults=[
 ['ccd-enable-judge-event','ccd-event-create-denied','event-capability-isolation'],
 ['ccd-remove-courtadmin-recipient-read','ccd-courtadmin-read-recipient-shapes','courtadmin-recipient-read-projection'],
 ['ccd-remove-readonly-recipient-read','ccd-readonly-read-recipient-shapes','readonly-recipient-read-projection'],
 ['ccd-enable-readonly-recipient-update','ccd-readonly-update-recipient-shapes-denied','readonly-update-isolation'],
 ['ccd-remove-courtadmin-event-create','ccd-courtadmin-update-recipient-shapes','courtadmin-update-persistence'],
 ...['recipient-collection','case-field-recipient-selector','required-delivery-radio','conditional-email-complex','postal-recipient-name','optional-postal-line-two'].map(id=>['ccd-shape-'+id,'ccd-source-shape-'+id,'source-shape-'+id]),
];
const replay=(m,f,id=f.invocationId)=>m.readEventSerialV3FaultSemantics(f.directory,f.expected,{runPin:f.runPin,invocationId:id});
for(const[id,proof,failure]of faults){
 test(`fixed policy ${id} binds its own source/import/derivation and declared assertion only`,async t=>{
  const f=await fixture(t,id),m=await load(),result=replay(m,f);assert.equal(result.semanticInvocationId,id);assert.equal(result.baselineProofId,proof);assert.equal(result.expectedFailureId,failure);assert.equal(result.semanticFaults,1);assert.equal(result.lifecycleFaults,11);assert.equal(result.replayScope,'structured-proof-import-derivation');
  for(const key of ['semanticReplay','nativeAuthority','sourceComplete','nativeRuntimeAcceptance','runtimeAcceptance','catalogueCredit','releaseCredit','releaseApproval','promotionAllowed'])assert.equal(result[key],false);
  assert(!JSON.stringify(result).includes(f.directory));assert(!JSON.stringify(result).includes('Bearer'));
 });
 test(`coherently resealed ${id} failure/source/derivation mismatches are rejected`,async t=>{
  const m=await load();
  const wrongFailure=await fixture(t,id);replay(m,wrongFailure);wrongFailure.changeFaultReport(report=>{report.tests[0].failureId='unrelated-assertion';});assert.throws(()=>replay(m,wrongFailure),/EVENT_V3_SEMANTIC_EXPECTED_FAILURE/);
  const wrongSource=await fixture(t,id);replay(m,wrongSource);wrongSource.changeFaultImport(receipt=>{receipt.sourceRevision='foreign-source';});assert.throws(()=>replay(m,wrongSource),/EVENT_TRANSITION_IMPORT_SOURCE/);
  const wrongCell=await fixture(t,id);replay(m,wrongCell);wrongCell.changeDerivation(value=>{value.target='foreign-target';});assert.throws(()=>replay(m,wrongCell),/EVENT_V3_SEMANTIC_DERIVATION_TARGET/);
 });
}
test('each fixed selector must match both current policy and exact held fault, not ordinal zero or a sibling capture',async t=>{
 const m=await load(),f=await fixture(t,'ccd-remove-readonly-recipient-read');
 assert.throws(()=>replay(m,f,'ccd-unknown-fault'),/EVENT_V3_SEMANTIC_SELECTION/);
 const entry=f.expected.faults[f.index],sibling=f.expected.faults[f.index+1],capture=f.read(sibling.capture.path);
 f.changeDerivation(value=>{value.runtimeRecord=capture.runtimeRecord;});assert.throws(()=>replay(m,f),/EVENT_V3_SEMANTIC_DERIVATION_RECORD/);
 assert.equal(entry.invocationId,'ccd-remove-readonly-recipient-read');
});
test('coherently repinned wrong literal role cannot be substituted for the selected source persona',async t=>{
 const f=await fixture(t,'ccd-remove-courtadmin-event-create'),m=await load();
 f.rewriteRuntime(f.index,record=>{record.credentials.courtadmin.roles=['caseworker','caseworker-harness','caseworker-privatelaw-judge'];});
 assert.throws(()=>replay(m,f),/EVENT_SERIAL_V3_RUNTIME_BINDING/);
});
test('the full structured proof gate still rejects a sibling unrelated failure',async t=>{
 const f=await fixture(t,'ccd-enable-judge-event'),m=await load();f.changeFaultReport(report=>{report.tests[0].failureId='unrelated-sibling';},'ccd-shape-optional-postal-line-two');
 assert.throws(()=>replay(m,f),/EVENT_V3_SEMANTIC_COMPLETE_PROOF_OUTCOME/);
});
test('one selected import replay does not claim an unselected sibling domain source was replayed',async t=>{
 const f=await fixture(t,'ccd-enable-judge-event'),m=await load(),sibling='ccd-shape-postal-recipient-name';f.changeFaultImport(receipt=>{receipt.sourceRevision='foreign-source';},sibling);
 const selected=replay(m,f);assert.equal(selected.semanticFaults,1);assert.equal(selected.semanticReplay,false);assert.equal(selected.replayScope,'structured-proof-import-derivation');
 assert.throws(()=>replay(m,f,sibling),/EVENT_TRANSITION_IMPORT_SOURCE/);
});
