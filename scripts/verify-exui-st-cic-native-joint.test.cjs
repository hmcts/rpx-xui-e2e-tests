const test=require('node:test'),assert=require('node:assert/strict');
const {createHash,randomUUID}=require('node:crypto');
const {jointPacket}=require('./fixtures/exui-st-cic-joint-packet.mock.cjs');
const hash=x=>'sha256:'+x.repeat(64),digest=bytes=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
const load=()=>import(process.env.ST_CIC_JOINT_TEST_MODULE??'./lib/exui-st-cic-native-joint.mjs');

function refreshContext(context){
 context.expected.nativeCohortBinding.digest=digest(JSON.stringify(context.native,null,2)+'\n');
 context.capture.binding.nativeBindingDigest=context.expected.nativeCohortBinding.digest;
 context.capture.reference.digest=digest(JSON.stringify(context.capture.binding,null,2)+'\n');context.expected.stCicNativeBinding=structuredClone(context.capture.reference);
}
function refreshPacket(packet){const {admission:a,binding:b,admissionContext:c}=packet;a.bindingDigest=digest(JSON.stringify(b));a.producerCommit=b.producer.commit;a.producerDigest=b.producer.digest;a.candidateArtifactDigest=b.artifact.identity.artifactDigest;a.candidateCommit=b.artifact.provenance.webappCommit;if(c)refreshContext(c);}

test('complete raw five-pair and seven-phase unit packets compare as exactly the fixed ST_CIC profile without promotion',async t=>{
 const x=await jointPacket(t),{stCicNativeJointAdmission}=await load(),before=JSON.stringify(x.packet),result=stCicNativeJointAdmission(x.native,x.capsule,x.packet,x.expected);
 assert.equal(result.status,'included');assert.equal(result.obligationId,'configuration-profile:31fed7b5d70bd2e333287f0b982632381576d11fbc15d71e90f27c14d986983b');assert.equal(result.nativeRunId,x.expected.jobRunId);assert.equal(result.profileRunId,x.packet.admission.runId);assert.equal(result.requestDigest,x.requestPin.digest);assert.deepEqual(result.sourceKeys,['rpx-xui-webapp:config/default.json','rpx-xui-webapp:config/default.json']);
 assert.equal(JSON.stringify(x.packet),before);for(const key of ['runtimeAcceptance','catalogueCredit','wholeProfileSatisfied','releaseCredit','releaseApproval'])assert.equal(x.packet.admission[key],false);assert.equal(result.releaseApproval,false);assert.equal(result.releaseCredit,false);
});
test('missing main authority or historical standalone context remains separate with no row decision',async t=>{
 const x=await jointPacket(t),{stCicNativeJointAdmission:join}=await load();
 for(const [native,capsule,expected]of [[undefined,x.capsule,x.expected],[x.native,undefined,x.expected],[x.native,x.capsule,{...x.expected,stCicProfileRequest:undefined}]]){const r=join(native,capsule,x.packet,expected);assert.equal(r.status,'separate');assert.equal(r.reason,'missing-native-binding');assert.equal(r.obligationId,undefined);}
 const p=structuredClone(x.packet);delete p.admissionContext;assert.equal(join(x.native,x.capsule,p,x.expected).reason,'missing-parent-context');
});
test('malformed row, promoted flags, missing source and request identity reject before compatibility classification',async t=>{
 const x=await jointPacket(t),{stCicNativeJointAdmission:join}=await load();assert.equal(join(x.native,x.capsule,x.packet,x.expected).status,'included');
 for(const change of [p=>p.admission.obligationId='foreign',p=>p.admission.contractDigest=hash('e'),p=>p.admission.catalogueSize=113,p=>p.admission.baselineProofs=4,p=>p.admission.effectiveFaults=4,p=>p.admission.accepted=2,p=>p.admission.catalogueCredit=true,p=>p.admission.runtimeAcceptance=true,p=>p.admission.wholeProfileSatisfied=true,p=>p.binding.contract.sourceKey='foreign',p=>p.binding.contract.sourceRevision='f'.repeat(40),p=>p.admission.runId='st-cic-'+randomUUID(),p=>p.admission.receiptDigest='foreign']){const p=structuredClone(x.packet);change(p);assert.throws(()=>join(undefined,undefined,p,x.expected));}
 for(const request of [{runId:x.requestPin.runId,digest:'foreign'},{...x.requestPin,extra:true},{...x.requestPin,runId:'st-cic-'+randomUUID()}])assert.throws(()=>join(x.native,x.capsule,x.packet,{...x.expected,stCicProfileRequest:request}));
 assert.throws(()=>x.m.readStCicProfileAdmissionPacket(x.requestPath,{...x.requestPin,digest:hash('e')}));
});
test('coherently substituted child main expectations cannot replace independently held parent expectations',async t=>{
 const x=await jointPacket(t),{stCicNativeJointAdmission:join}=await load();assert.equal(join(x.native,x.capsule,x.packet,x.expected).status,'included');
 for(const change of [c=>c.expected.jobRunId='ci-'+randomUUID(),c=>c.expected.ciResultDigest=hash('e'),c=>c.expected.phases[0].terminal={code:2,signal:null},c=>c.expected.phases[0].expected.runId='candidate-'+randomUUID(),c=>c.expected.personalServiceNativeBinding={path:'private/personal-service-native-binding.json',digest:hash('e')}]){const p=structuredClone(x.packet);change(p.admissionContext);assert.throws(()=>join(x.native,x.capsule,p,x.expected),error=>error.message==='ST_CIC_NATIVE_JOINT_INVALID');}
 const p=structuredClone(x.packet);p.admissionContext.capture.binding.contractDigest=hash('e');refreshContext(p.admissionContext);assert.throws(()=>join(x.native,x.capsule,p,x.expected));
});
test('valid internally coherent foreign bindings remain separate while same-identity source substitutions reject',async t=>{
 const x=await jointPacket(t),{stCicNativeJointAdmission:join}=await load();
 for(const [reason,change]of [
 ['different-producer',p=>{p.binding.producer.commit='c'.repeat(40);p.admissionContext.native.producer.commit='c'.repeat(40);p.admissionContext.expected.harnessCommit='c'.repeat(40);for(const row of p.admissionContext.expected.phases)row.expected.harnessCommit='c'.repeat(40);}],
 ['different-candidate',p=>{p.binding.artifact.identity.artifactDigest=hash('e');p.admissionContext.native.candidate.identity.artifactDigest=hash('e');p.admissionContext.expected.candidateArtifactDigest=hash('e');}],
 ['different-runtime',p=>{p.binding.runtime.imageId=hash('e');p.admissionContext.native.runtime.imageId=hash('e');}],
 ['different-browser',p=>{p.binding.browser.digest=hash('e');p.admissionContext.native.browser.digest=hash('e');for(const row of p.admissionContext.expected.phases)row.expected.browserDigest=hash('e');}],
 ['different-dependencies',p=>{p.binding.browser.dependencies.digest=hash('e');p.admissionContext.native.dependencies.digest=hash('e');for(const row of p.admissionContext.expected.phases)row.expected.harnessDependencyDigest=hash('e');}]
 ]){const p=structuredClone(x.packet);change(p);refreshPacket(p);assert.equal(join(x.native,x.capsule,p,x.expected).reason,reason);}
 for(const change of [p=>{p.binding.artifact.payloadDigest=hash('e');p.admissionContext.native.candidate.payloadDigest=hash('e');},p=>{p.binding.producer.files['package.json']=hash('e');p.admissionContext.native.producer.files['package.json']=hash('e');},p=>{p.admissionContext.native.sourceDefault.digest=hash('e');},p=>{p.admissionContext.native.catalogue.obligationsDigest=hash('e');}]){const p=structuredClone(x.packet);change(p);refreshPacket(p);assert.throws(()=>join(x.native,x.capsule,p,x.expected));}
});
test('request projection drops only named request fields and keeps all original main authority strict',async t=>{
 const x=await jointPacket(t),{stCicNativeJointAdmission:join}=await load(),expected=structuredClone(x.expected);expected.personalServiceRequest={runId:'unit-personal',digest:hash('e')};expected.divorceProfileRequest={runId:'unit-divorce',digest:hash('e')};expected.complexEmailRequest={runId:'unit-complex',digest:hash('e')};const saved=JSON.stringify(expected);assert.equal(join(x.native,x.capsule,x.packet,expected).status,'included');assert.equal(JSON.stringify(expected),saved);
 for(const change of [e=>e.foreignBinding={digest:hash('e')},e=>e.stCicNativeBinding.digest=hash('e'),e=>e.nativeCohortBinding.digest=hash('e')]){const e=structuredClone(expected);change(e);assert.throws(()=>join(x.native,x.capsule,x.packet,e));}
});
