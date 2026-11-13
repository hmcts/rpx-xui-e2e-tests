const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {jointFixture}=require('./exui-divorce-joint-packet.mock.cjs');
const {parentPacket}=require('./exui-personal-service-parent.mock.cjs');
exports.personalAdmissionFixture=async t=>{
 const f=await jointFixture(t),m=await import('../lib/exui-personal-service-admission.mjs'),b=await import('../lib/exui-personal-service-invocation-binding.mjs');
 const root=path.join(f.root,'personal');fs.mkdirSync(root);const write=(file,value)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');return b.personalFile(path.dirname(file),path.basename(file)).digest;};
 // The old main fixture has no full CCD input for its generic phase; supply the
 // same standard images used by its actual event/callback/selector raw fixtures.
 const ccdImages=Object.fromEntries(Object.entries(f.event.input.ccd.images).map(([key,value])=>[key,{image:value.id,os:'linux',architecture:value.architecture}]));
 const ccdFile=path.join(f.directory,'private/ccd/input.json'),ccdInput=JSON.parse(fs.readFileSync(ccdFile));ccdInput.ccd={...ccdInput.ccd,images:f.event.input.ccd.images};write(ccdFile,ccdInput);
 const capture=m.capturePersonalNativeBinding({nativeCohortCapture:{binding:f.native,reference:f.descriptor.expected.nativeCohortBinding}},f.directory,ccdImages);
 f.descriptor.expected.personalServiceNativeBinding=capture.reference;f.save();
 const context={native:f.native,capture,expected:m.expectedWithoutRequests(f.descriptor.expected)};
 const deps=f.descriptor.expected.phases.find(row=>row.phase==='ccd').expected.identity.dependencyIdentities;
 const p=await parentPacket(root,{apiContracts:{data:deps.ccd.apiContractDigest,definition:deps['ccd-definition'].apiContractDigest},content:{runId:'personal-'+randomUUID(),producerCommit:f.native.producer.commit,artifact:{...f.event.input.artifact},nativeRuntime:f.native.runtime,browser:{root:'/sealed-browser',...f.native.browser},dependencies:f.native.dependencies,admissionContext:context,admissionContractDigest:m.personalAdmissionDigest()}});
 const raw=b.readPersonalCohort(root,p.expected);write(path.join(root,'personal-service-cohort.json'),raw);
 write(path.join(root,'cohort-timing.json'),{startedAt:'2026-11-06T01:00:00.000Z',endedAt:'2026-11-06T01:04:00.000Z',durationMs:240000,telemetryOnly:true});
 const request={schemaVersion:1,kind:'personal-service-admission-request',directory:root,expected:p.expected,contractDigest:m.personalAdmissionDigest(),receiptDigest:b.personalFile(root,'personal-service-cohort.json').digest,timingDigest:b.personalFile(root,'cohort-timing.json').digest},requestPath=path.join(root,'personal-service-admission-request.json');
 const pin={runId:p.expected.runId,digest:write(requestPath,request)};f.descriptor.personalServiceAdmission=requestPath;f.descriptor.expected.personalServiceRequest=pin;f.save();
 return {f,p,m,b,root,context,capture,write,request,requestPath,pin};
};
