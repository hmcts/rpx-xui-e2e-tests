const {test}=require('node:test'),assert=require('node:assert/strict');
const {admissionPacket}=require('./fixtures/exui-mandatory-email-admission.mock.cjs');
test('complete synthetic mandatory packet replays both fixed rows and joins only its held main context',async t=>{
 const f=await admissionPacket(t),api=await import('./lib/exui-mandatory-email-event-admission.mjs');const packet=api.readMandatoryEmailAdmissionPacket(f.requestPath,f.requestPin);assert.equal(packet.admission.executions,3);assert.equal(packet.admission.baselineProofs,2);assert.equal(packet.admission.effectiveFaults,2);assert.equal(packet.admission.catalogueCredit,false);const joint=api.mandatoryEmailNativeJointAdmission(f.native,f.capture.binding,packet,f.expected);assert.equal(joint.status,'included');assert.deepEqual(joint.obligationIds,['configuration-shape:d0189498d796f462bbd150341384aaf1743ec24491af04fc5176dc8e7e72439e','configuration-shape:afb8b838dc9de1bb8314cbf494ff26a987aa3edb845b2fa0a45c378834d2b74d']);
});

test('strict main reader adds only the two existing missing IDs and keeps the112 denominator',async t=>{
 const f=await admissionPacket(t),{readNativeReportEvidence}=await import('./lib/exui-native-report-evidence.mjs');f.write(f.main.descriptorPath,f.descriptor);const result=await readNativeReportEvidence(f.main.descriptorPath),before=f.previousMain.catalogueCoverage,after=result.catalogueCoverage;
 assert.equal(after.selected,112);assert.equal(after.candidate,before.candidate+2);assert.equal(after.ccd,before.ccd);assert.equal(after.missing,before.missing-2);assert.equal(after.creditedObligationIds.length,before.creditedObligationIds.length+2);assert.equal(result.mandatoryEmailAdmission.joint.status,'included');assert.equal(result.mandatoryEmailAdmission.catalogueCredit,false);assert.deepEqual(result.phases,f.previousMain.phases);
});

const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const leaf=()=>import('./lib/exui-mandatory-email-event-contract.mjs');
const api=()=>import('./lib/exui-mandatory-email-event-admission.mjs');

test('contract maps exact source rows, all ten attributes and distinct assertion/error identifiers',async()=>{
 const m=await leaf(),contract=m.mandatoryEmailAdmissionContract();assert.equal(contract.catalogueSize,112);assert.deepEqual(contract.source.rows.map(row=>[row.id,row.sourceIndex,row.sourceRow.DisplayContext]),[['name',14,'MANDATORY'],['address',13,'MANDATORY']]);for(const row of contract.source.rows){assert.equal(row.facets.length,10);assert.equal(row.sourceRow.EventElementLabel,' ');assert.equal(row.normalizedRow.CaseTypeID,'HarnessNestedPRL');assert.match(row.failureId,/^source-email-(name|address)-required$/);}assert.equal(contract.source.sourceRevision,'694b9951e94369f1394380506960c4f04f25755d');
});

test('opt-in intent cannot drop both capsule and final request against the sealed CI-result marker',async t=>{
 const f=await admissionPacket(t),{readNativeReportEvidence}=await import('./lib/exui-native-report-evidence.mjs');
 for(const mutation of [d=>delete d.mandatoryEmailAdmission,d=>delete d.expected.mandatoryEmailNativeBinding,d=>{delete d.mandatoryEmailAdmission;delete d.expected.mandatoryEmailRequest;delete d.expected.mandatoryEmailNativeBinding;},d=>{d.mandatoryEmailAdmission=null;},d=>{d.mandatoryEmailAdmission=false;},d=>{d.expected.mandatoryEmailRequest=null;}]){
  const d=structuredClone(f.descriptor);mutation(d);f.write(f.main.descriptorPath,d);await assert.rejects(readNativeReportEvidence(f.main.descriptorPath),/^Error: NATIVE_REPORT_/);
 }
 const file=path.join(f.main.directory,'private/ci-result.json'),ci=f.read(file);delete ci.mandatoryEmailNativeBinding;f.write(file,ci);f.write(f.main.descriptorPath,f.descriptor);await assert.rejects(readNativeReportEvidence(f.main.descriptorPath),/NATIVE_REPORT_CI_RESULT_DIGEST_MISMATCH/);
});

test('absence is legacy only when every intent signal is absent; malformed supplied markers never downgrade',async t=>{
 const m=await leaf(),root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'mandatory-intent-unit-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));fs.mkdirSync(path.join(root,'private'));assert.equal(m.assertMandatoryEmailIntent({}, {}, {},root),false);
 for(const value of [undefined,null,false,{}, {path:m.MANDATORY_EMAIL_NATIVE_PATH,digest:'invalid'}])assert.throws(()=>m.assertMandatoryEmailIntent({mandatoryEmailNativeBinding:value},{},{},root));
 fs.writeFileSync(path.join(root,m.MANDATORY_EMAIL_NATIVE_PATH),'{}');assert.throws(()=>m.assertMandatoryEmailIntent({},{},{},root));fs.unlinkSync(path.join(root,m.MANDATORY_EMAIL_NATIVE_PATH));fs.symlinkSync(path.join(root,'missing'),path.join(root,m.MANDATORY_EMAIL_NATIVE_PATH));assert.throws(()=>m.assertMandatoryEmailIntent({},{},{},root));
});

test('coherently resealed worker, ineffective fault, pending creator and dropped child context reject',async t=>{
 const m=await api();
 for(const fault of ['worker','ineffective','pending','child-context','bearer','actor']){
  const f=await admissionPacket(t),variant='name-optional',dir=path.join(f.cohortDirectory,variant);
  if(fault==='worker'){const file=path.join(dir,'baseline/report.json'),v=f.read(file);v.config.workers=2;f.write(file,v);}
  if(fault==='ineffective'){const file=path.join(dir,'baseline/mandatory-email-name-observation.json'),v=f.read(file);v.empty.after=structuredClone(v.empty.before);f.write(file,v);}
  if(fault==='pending'){const file=path.join(dir,'runtime/creation-attempts.json'),v=f.read(file);v[0].state='pending';f.write(file,v);}
  if(fault==='child-context'){const file=path.join(f.cohortDirectory,variant+'-expected.json'),v=f.read(file);delete v.cohort.admissionContext;delete v.cohort.admissionInput;f.write(file,v);}
  if(fault==='bearer'||fault==='actor'){const file=path.join(dir,'input.json'),v=f.read(file);if(fault==='bearer')v.credentials.judge.headers.Authorization=f.packets[0].input.credentials.judge.headers.Authorization;else v.credentials.judge.userId=v.credentials.readonly.userId;f.write(file,v);}
  f.rehashVariant(variant);assert.throws(()=>m.readMandatoryEmailAdmissionPacket(f.requestPath,f.requestPin),/MANDATORY_EMAIL_/);
 }
});

test('late raw writes after earlier variant replay and before final join cannot acquire admission',async t=>{
 const f=await admissionPacket(t),m=await api(),read=fs.readFileSync;let triggered=false;
 try{fs.readFileSync=function(file,...args){const value=read.call(this,file,...args);if(!triggered&&typeof file==='string'&&file===path.join(f.cohortDirectory,'address-optional/baseline/report.json')){triggered=true;fs.appendFileSync(path.join(f.cohortDirectory,'baseline/baseline/mandatory-email-name-observation.json'),' ');}return value;};assert.throws(()=>m.readMandatoryEmailAdmissionPacket(f.requestPath,f.requestPin),/MANDATORY_EMAIL_LATE_REPLAY_DRIFT/);assert(triggered);}finally{fs.readFileSync=read;}
});

test('ownership rejects valid raw cohort CID/name/owner/namespace and mutable-store reuse before inclusion',async t=>{
 const f=await admissionPacket(t),m=await api(),ownership=await import('./lib/exui-st-cic-ownership.mjs');m.readMandatoryEmailAdmissionPacket(f.requestPath,f.requestPin);const file=path.join(f.main.directory,'private/family/owned-resources.json'),original=fs.readFileSync(file),row=f.packets[0].completion.registry[0];
 assert.equal(ownership.assertMandatoryEmailOwnership(f.main.directory,f.expected,{mandatoryRequestPath:f.requestPath}),true);
 for(const key of ['id','name','owner','namespace']){const rows=JSON.parse(original);rows[0][key]=row[key];f.write(file,rows);assert.throws(()=>ownership.assertMandatoryEmailOwnership(f.main.directory,f.expected,{mandatoryRequestPath:f.requestPath}),/MANDATORY_EMAIL_CROSS_COHORT_OWNERSHIP/);fs.writeFileSync(file,original);}
 const credentialsFile=path.join(f.main.directory,'private/eventCapability/input.json'),inputBytes=fs.readFileSync(credentialsFile),mainInput=JSON.parse(inputBytes);mainInput.credentials.judge.headers.Authorization=f.packets[0].input.credentials.judge.headers.Authorization;f.write(credentialsFile,mainInput);assert.throws(()=>ownership.assertMandatoryEmailOwnership(f.main.directory,f.expected,{mandatoryRequestPath:f.requestPath}),/MANDATORY_EMAIL_CROSS_COHORT_OWNERSHIP/);fs.writeFileSync(credentialsFile,inputBytes);
 const launch=path.join(f.main.directory,'private/family/container-launch.json');f.write(launch,{stateRoot:path.join(f.packets[0].binding.privateWorkspace,'state')});assert.throws(()=>ownership.assertMandatoryEmailOwnership(f.main.directory,f.expected,{mandatoryRequestPath:f.requestPath}),/MANDATORY_EMAIL_CROSS_COHORT_OWNERSHIP/);
});

test('main source/capsule grafts and duplicate or no-longer-missing row credit fail closed',async t=>{
 const f=await admissionPacket(t),m=await api(),l=await leaf(),{readNativeReportEvidence}=await import('./lib/exui-native-report-evidence.mjs');
 const changed=structuredClone(f.descriptor);changed.expected.phases[0].expected.harnessSourceDigest='sha256:'+'0'.repeat(64);f.write(f.main.descriptorPath,changed);await assert.rejects(readNativeReportEvidence(f.main.descriptorPath),/NATIVE_REPORT_/);
 const packet=m.readMandatoryEmailAdmissionPacket(f.requestPath,f.requestPin);assert.equal(m.mandatoryEmailNativeJointAdmission({...f.native,producer:{...f.native.producer,commit:'c'.repeat(40)}},f.capture.binding,packet,f.expected).reason,'different-producer');
 for(const mutate of [v=>v.admission.rows[0].errorCode='FAKE',v=>v.admission.executions=2,v=>v.admission.extra=true,v=>v.admission.catalogueCredit=true]){const altered=structuredClone(packet);mutate(altered);assert.throws(()=>m.mandatoryEmailNativeJointAdmission(f.native,f.capture.binding,altered,f.expected),/MANDATORY_EMAIL_ADMISSION_INVALID/);}
 const mismatch=structuredClone(f.expected);mismatch.jobRunId='ci-22222222-2222-4222-8222-222222222222';assert.throws(()=>m.mandatoryEmailNativeJointAdmission(f.native,f.capture.binding,packet,mismatch),/MANDATORY_EMAIL_ADMISSION_INVALID/);
 const coverage={selected:112,candidate:0,ccd:0,missing:112,creditedObligationIds:[]},catalogue=(await import('./lib/exui-configuration-runtime-coverage.mjs')).loadCommittedConfigurationCatalogue().catalogue,admission={...packet.admission,joint:m.mandatoryEmailNativeJointAdmission(f.native,f.capture.binding,packet,f.expected)},missing=l.mandatoryEmailAdmissionContract().obligationIds;
 m.creditMandatoryEmailRows(coverage,catalogue,missing,admission);const before=structuredClone(coverage);assert.throws(()=>m.creditMandatoryEmailRows(coverage,catalogue,missing,admission));assert.deepEqual(coverage,before);
});

test('actual fresh wrapper snapshots supplied context before await and reaches exactly one fixed owned child',async t=>{
 const f=await admissionPacket(t),{wrapperStartup}=require('./fixtures/exui-mandatory-email-admission.mock.cjs'),{api,shared}=await wrapperStartup(t,f),output=path.join(f.root,'new-wrapper-output');
 await assert.rejects(api.runMandatoryEmailAdmission({candidate:f.cohort.candidateManifest,browser:f.cohort.browser.root,output,admissionContext:{bad:true}}),/MANDATORY_EMAIL_ADMISSION_CONTEXT/);assert.equal(shared.state.assetReads,0);assert.equal(shared.state.launches,0);assert(!fs.existsSync(output));
 const before=f.context.expected.jobRunId,running=api.runMandatoryEmailAdmission({candidate:f.cohort.candidateManifest,browser:f.cohort.browser.root,output,admissionContext:f.context});await shared.seen;f.context.expected.jobRunId='ci-99999999-9999-4999-8999-999999999999';shared.release();await assert.rejects(running,/MANDATORY_EMAIL_CONTROLLER_NOT_CLOSED_SUCCESSFULLY/);
 assert.equal(shared.state.launches,1);const input=f.read(path.join(output,'expected-input.json'));assert.equal(input.context.expected.jobRunId,before);assert.equal(fs.statSync(path.join(output,'expected-input.json')).mode&0o777,0o400);assert.equal(f.read(path.join(output,'independent-controller-terminal.json')).code,2);assert(!fs.existsSync(path.join(output,'admission-request.json')));
});

test('mandatory controller waits for actual close and repeated cancellation forwards only once before joined closure',async()=>{
 const {EventEmitter}=require('node:events'),{executeMandatoryEmailController}=await import('./run-harness-mandatory-email-event-admission.mjs'),m=await api(),command=m.mandatoryEmailControllerCommand({candidate:'/private/tmp/unit-candidate.json',browser:'/private/tmp/unit-browser',output:'/private/tmp/unit-output',inputDigest:'sha256:'+'a'.repeat(64)}),child=new EventEmitter(),signals=new EventEmitter();let calls=0,finish,settled=false;const termination=new Promise(r=>{finish=r;});
 const pending=executeMandatoryEmailController(command,{log:1,signalTarget:signals,launch:()=>child,terminate:()=>{calls++;return termination;}}).then(value=>{settled=true;return value;});child.emit('spawn');signals.emit('SIGTERM');signals.emit('SIGTERM');assert.equal(calls,1);child.emit('exit',0,null);await new Promise(r=>setImmediate(r));assert.equal(settled,false);assert.equal(signals.listenerCount('SIGTERM'),1);child.emit('close',0,null);finish({observed:true,forced:false});const actual=await pending;assert.equal(actual.closed,true);assert.equal(actual.cancelled,true);assert.equal(actual.forced,false);assert.equal(signals.listenerCount('SIGTERM'),0);
});

test('spawned controller errors terminate and join before returning an untrusted terminal',async()=>{
 const {EventEmitter}=require('node:events'),{executeMandatoryEmailController}=await import('./run-harness-mandatory-email-event-admission.mjs'),m=await api(),command=m.mandatoryEmailControllerCommand({candidate:'/private/tmp/unit-candidate.json',browser:'/private/tmp/unit-browser',output:'/private/tmp/unit-output',inputDigest:'sha256:'+'a'.repeat(64)}),child=new EventEmitter(),signals=new EventEmitter();let calls=0,finish,settled=false;const termination=new Promise(r=>{finish=r;});
 const pending=executeMandatoryEmailController(command,{log:1,signalTarget:signals,launch:()=>child,terminate:()=>{calls++;return termination;}}).then(value=>{settled=true;return value;});child.emit('spawn');child.emit('error',Error('synthetic'));assert.equal(calls,1);await new Promise(r=>setImmediate(r));assert.equal(settled,false);child.emit('exit',2,null);child.emit('close',2,null);finish({observed:true,forced:false});const actual=await pending;assert.equal(actual.observed,false);assert.equal(actual.cancelled,true);assert.equal(signals.listenerCount('SIGTERM'),0);
});

test('late main mandatory capsule write during final companion replay rejects before two-row credit',async t=>{
 const f=await admissionPacket(t),{readNativeReportEvidence}=await import('./lib/exui-native-report-evidence.mjs'),read=fs.readFileSync;f.write(f.main.descriptorPath,f.descriptor);fs.chmodSync(path.join(f.main.directory,'private/mandatory-email-native-binding.json'),0o600);let changed=false;
 try{fs.readFileSync=function(file,...args){const bytes=read.call(this,file,...args);if(!changed&&file===path.join(f.cohortDirectory,'address-optional/baseline/report.json')){changed=true;fs.appendFileSync(path.join(f.main.directory,'private/mandatory-email-native-binding.json'),' ');}return bytes;};await assert.rejects(readNativeReportEvidence(f.main.descriptorPath),/NATIVE_REPORT_/);assert(changed);}finally{fs.readFileSync=read;}
});

test('held mandatory context rejects coherent candidate browser and dependency substitutions before cohort creation',async t=>{
 const f=await admissionPacket(t),m=await leaf(),held=structuredClone(f.context),original=structuredClone(f.cohort);assert.deepEqual(m.verifyMandatoryEmailContextCohort(f.context,f.cohort),f.context);
 const substitutions=[
  ['candidate artifact and payload',c=>{c.artifact.identity.artifactDigest='sha256:'+'e'.repeat(64);c.artifact.payloadDigest=c.artifact.identity.artifactDigest;}],
  ['browser image and digest',c=>{c.browser.digest='sha256:'+'d'.repeat(64);c.browser.image='sha256:'+'c'.repeat(64);}],
  ['dependency digest',c=>{c.dependencies.digest='sha256:'+'b'.repeat(64);}],
  ['dependency version',c=>{c.dependencies.playwrightVersion='1.62.1';}]
 ];
 for(const [name,mutate]of substitutions){const cohort=structuredClone(f.cohort);mutate(cohort);assert.throws(()=>m.verifyMandatoryEmailContextCohort(f.context,cohort),/MANDATORY_EMAIL_ADMISSION_CONTEXT_INVALID/,name);assert.deepEqual(f.context,held);assert.deepEqual(f.cohort,original);assert.deepEqual(m.verifyMandatoryEmailContextCohort(f.context,f.cohort),held);}

});

test('actual selected personal and Complex schemas reject copied mandatory bearer after healthy full raw replay',async t=>{
 const f=await admissionPacket(t),ownership=await import('./lib/exui-st-cic-ownership.mjs'),{resealPersonalHeaders,resealComplexHeaders,currentPersonalAdmissionFixture,currentComplexAdmissionFixture}=require('./fixtures/exui-mandatory-email-admission.mock.cjs'),personal=await currentPersonalAdmissionFixture(t),complex=await currentComplexAdmissionFixture(t);
 let personalPacket=await resealPersonalHeaders(personal,(variant,role)=>'Bearer synthetic-personal-'+variant+'-'+role),complexPacket=await resealComplexHeaders(complex,(variant,role)=>'Bearer synthetic-complex-'+variant+'-'+role);assert.equal(personalPacket.admission.status,'passed');assert.equal(complexPacket.admission.status,'passed');
 const expected={...f.expected,personalServiceRequest:personal.pin,complexEmailRequest:complex.pin},options={mandatoryRequestPath:f.requestPath,personalRequestPath:personal.requestPath,complexRequestPath:complex.requestPath,complexPacket};assert.equal(ownership.assertMandatoryEmailOwnership(f.main.directory,expected,options),true);
 const copied=f.packets[0].input.credentials.judge.headers.Authorization;
 personalPacket=await resealPersonalHeaders(personal,(variant,role)=>variant==='baseline'&&role==='courtadmin'?copied:'Bearer synthetic-personal-'+variant+'-'+role);assert.equal(personalPacket.admission.status,'passed','copied header passes actual raw sibling replay before ownership comparison');expected.personalServiceRequest=personal.pin;assert.throws(()=>ownership.assertMandatoryEmailOwnership(f.main.directory,expected,options),/MANDATORY_EMAIL_CROSS_COHORT_OWNERSHIP/);
 await resealPersonalHeaders(personal,(variant,role)=>'Bearer synthetic-personal-'+variant+'-'+role);expected.personalServiceRequest=personal.pin;assert.equal(ownership.assertMandatoryEmailOwnership(f.main.directory,expected,options),true);
 complexPacket=await resealComplexHeaders(complex,(variant,role)=>variant==='browser-baseline'&&role==='observer'?copied:'Bearer synthetic-complex-'+variant+'-'+role);assert.equal(complexPacket.admission.status,'passed','copied header passes actual selected Complex raw schema before comparison');expected.complexEmailRequest=complex.pin;options.complexPacket=complexPacket;assert.throws(()=>ownership.assertMandatoryEmailOwnership(f.main.directory,expected,options),/MANDATORY_EMAIL_CROSS_COHORT_OWNERSHIP/);
});

test('personal Complex and ST_CIC pure sibling projections retain the new prelaunch capsule and remove only its final request',async t=>{
 // Pure context/comparator qualification only: these synthetic projections are
 // never handed to the main reader or presented as a new accepted raw campaign.
 const leafModule=await leaf(),fixtures=require('./fixtures/exui-mandatory-email-admission.mock.cjs'),personal=await fixtures.currentPersonalAdmissionFixture(t),complex=await fixtures.currentComplexAdmissionFixture(t),stCic=await fixtures.currentStCicAdmissionFixture(t),stCicApi=await import('./lib/exui-st-cic-profile-admission.mjs'),stCicJoint=await import('./lib/exui-st-cic-native-joint.mjs');
 const request={runId:'mandatory-admission-11111111-1111-4111-8111-111111111111',digest:'sha256:'+'a'.repeat(64)};
 const pContext=personal.context,pExpected={...structuredClone(personal.f.descriptor.expected),mandatoryEmailRequest:request},pBefore=structuredClone(pExpected),pPacket=personal.m.readPersonalAdmissionPacket(personal.requestPath,personal.pin);
 assert.equal(personal.f.native.dependencies.playwrightVersion,'1.65.0');assert.deepEqual(personal.m.expectedWithoutRequests(pExpected),pContext.expected);assert.equal(personal.m.personalNativeJointAdmission(personal.f.native,personal.capture.binding,pPacket,pExpected).status,'included');assert.deepEqual(pExpected,pBefore);
 const cContext=complex.context,cExpected={...structuredClone(complex.f.descriptor.expected),mandatoryEmailRequest:request},cBefore=structuredClone(cExpected),cPacket=await complex.read();assert.equal(complex.f.native.dependencies.playwrightVersion,'1.65.0');assert.equal(complex.m.complexNativeJointAdmission(complex.f.native,complex.capture.binding,cPacket,cExpected).status,'included');assert.deepEqual(cExpected,cBefore);
 const sContext=stCic.context,sExpected={...structuredClone(stCic.expected),mandatoryEmailRequest:request},sBefore=structuredClone(sExpected),sPacket=stCic.packet;assert.deepEqual(stCicApi.stCicExpectedWithoutRequests(sExpected),sContext.expected);assert.equal(stCicJoint.stCicNativeJointAdmission(stCic.native,stCic.capsule,sPacket,sExpected).status,'included');assert.deepEqual(sExpected,sBefore);
 for(const [context,validate,expected,joint]of [[pContext,personal.m.validatePersonalAdmissionContext,pExpected,value=>personal.m.personalNativeJointAdmission(personal.f.native,personal.capture.binding,pPacket,value)],[cContext,complex.m.validateComplexAdmissionContext,cExpected,value=>complex.m.complexNativeJointAdmission(complex.f.native,complex.capture.binding,cPacket,value)],[sContext,stCicApi.validateStCicAdmissionContext,sExpected,value=>stCicJoint.stCicNativeJointAdmission(stCic.native,stCic.capsule,sPacket,value)]]){
  for(const invalid of [undefined,null,false,{path:'private/foreign.json',digest:'sha256:'+'a'.repeat(64)},{path:leafModule.MANDATORY_EMAIL_NATIVE_PATH,digest:'bad'}]){const changed=structuredClone(context);changed.expected.mandatoryEmailNativeBinding=invalid;assert.throws(()=>validate(changed));}
  const dropped=structuredClone(expected);delete dropped.mandatoryEmailNativeBinding;assert.throws(()=>joint(dropped));const unknown=structuredClone(expected);unknown.unrelatedNativeBinding={path:'private/unknown.json',digest:'sha256:'+'b'.repeat(64)};assert.throws(()=>joint(unknown),'unrelated binding must remain in the projected main context');
 }
});
