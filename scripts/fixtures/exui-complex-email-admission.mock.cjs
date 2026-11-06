const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
exports.fixture=async t=>{
 const {jointFixture}=require('./exui-divorce-joint-packet.mock.cjs'),{completePacket}=require('./exui-complex-cohort.mock.cjs');
 const f=await jointFixture(t),m=await import('../lib/exui-complex-email-admission.mjs'),raw=await import('../lib/exui-complex-email-cohort.mjs'),io=await import('../lib/exui-evidence-io.mjs'),controller=await import('../run-harness-complex-email-cohort.mjs');
 const root=path.resolve(__dirname,'../..'),directory=path.join(f.root,'complex');fs.mkdirSync(directory);
 const write=(file,value)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');return io.digestBytes(fs.readFileSync(file));};
 const deps=f.descriptor.expected.phases.find(row=>row.phase==='ccd').expected.identity.dependencyIdentities;
 const packet=await completePacket(directory,{disjoint:true,artifact:{...f.event.input.artifact},commonBrowser:{nativeRuntime:f.native.runtime,browserDigest:f.native.browser.digest,browserRuntimeImage:f.native.browser.image,harnessDependencies:f.native.dependencies},apiContracts:{data:deps.ccd.apiContractDigest,definition:deps['ccd-definition'].apiContractDigest}}),expected=packet.expected;
 expected.producer={commit:f.native.producer.commit,tree:'d'.repeat(40),files:controller.COMPLEX_COHORT_SOURCES.map(name=>[name,raw.complexPin(root,name)])};
 expected.sourcePreparation={prepared:expected.sourceProof.prepared,tools:expected.sourceProof.tools};
 const sourceConfiguration={descriptor:{path:path.join(directory,'configured-input.json'),digest:write(path.join(directory,'configured-input.json'),{})},inputs:{},source:expected.sourcePreparation};
 const ccdImages=Object.fromEntries(Object.entries(f.event.input.ccd.images).map(([name,image])=>[name,{image:image.id,os:'linux',architecture:image.architecture}]));
 const ccdFile=path.join(f.directory,'private/ccd/input.json'),ccdInput=JSON.parse(fs.readFileSync(ccdFile));ccdInput.ccd={images:f.event.input.ccd.images};write(ccdFile,ccdInput);
 const capture=m.captureComplexNativeBinding({nativeCohortCapture:{binding:f.native,reference:f.descriptor.expected.nativeCohortBinding}},f.directory,ccdImages,sourceConfiguration);
 f.descriptor.expected.complexEmailNativeBinding=capture.reference;
 const context={native:f.native,capture,expected:structuredClone(f.descriptor.expected)};delete context.expected.divorceProfileRequest;
 expected.runId='complex-'+randomUUID();expected.admissionContext=context;
 expected.inputDigest=write(path.join(directory,'parent-input.json'),{producer:expected.producer,candidate:expected.candidate,runId:expected.runId,admissionContext:context,admissionContractDigest:m.complexAdmissionDigest(),...raw.COMPLEX_FLAGS});
 const result=raw.readComplexCohort(directory,expected,{inspect:()=>null,ownerEmpty:()=>true});
 write(path.join(directory,'complex-cohort-result.json'),result);write(path.join(directory,'cohort-timing.json'),{startedAt:'2026-11-06T01:00:00.000Z',endedAt:'2026-11-06T01:04:00.000Z',durationMs:240000,telemetryOnly:true});
 const request={schemaVersion:1,kind:'complex-email-admission-request',directory,expected,contractDigest:m.complexAdmissionDigest(),receiptDigest:raw.complexPin(directory,'complex-cohort-result.json'),timingDigest:raw.complexPin(directory,'cohort-timing.json')},requestPath=path.join(directory,'complex-email-admission-request.json');
 const pin={runId:expected.runId,digest:write(requestPath,request)};f.descriptor.expected.complexEmailRequest=pin;f.descriptor.complexEmailAdmission=requestPath;f.save();
 // Execute the exact production reader body. Only unavailable external Docker
 // absence checks and the independently tested fixed Java-byte replay are fakes.
 const source=fs.readFileSync(path.join(root,'scripts/lib/exui-complex-email-admission.mjs'),'utf8'),start=source.indexOf('export async function readComplexAdmissionPacket('),end=source.indexOf('export function complexNativeJointAdmission(',start);
 let body=source.slice(start,end).replace(/^export /,'').replace("await import('../run-harness-complex-email-cohort.mjs')",'controller');
 const calls=[];const dependencies={assert,path,root,fail:'COMPLEX_EMAIL_ADMISSION_INVALID',hash:/^sha256:[a-f0-9]{64}$/,keys:(value,names)=>assert.deepEqual(Object.keys(value??{}).sort(),names.slice().sort()),controller,...raw,...m,inspectHostContainer:()=>null,hostDocker:()=>'',replayComplexSource:()=>{calls.push('source-replay');return{};},recheckComplexAdmissionInputs:value=>{assert.equal(raw.complexPin(path.dirname(value.descriptor.path),path.basename(value.descriptor.path)),value.descriptor.digest);return value.inputs;}};
 const read=new Function(...Object.keys(dependencies),body+';return readComplexAdmissionPacket;')(...Object.values(dependencies));
 const tag='complex-admission-'+randomUUID(),bridge=path.join(f.root,'complex-reader-bridge.mjs'),nativeModule=path.join(f.root,'native-reader.mjs'),{pathToFileURL}=require('node:url');
 globalThis[Symbol.for(tag)]=(file,next)=>{assert.equal(file,requestPath);return read(file,next);};t.after(()=>delete globalThis[Symbol.for(tag)]);
 fs.writeFileSync(bridge,`export * from ${JSON.stringify(pathToFileURL(path.join(root,'scripts/lib/exui-complex-email-admission.mjs')).href)};export const readComplexAdmissionPacket=(...args)=>globalThis[Symbol.for(${JSON.stringify(tag)})](...args);`);
 // Load the actual complete native report module; redirect ONLY the external
 // Complex proof process boundary above, while retaining all seven raw gates.
 const originalNative=fs.readFileSync(path.join(root,'scripts/lib/exui-native-report-evidence.mjs'),'utf8');
 const nativeSource=originalNative.replace(/from (["'])(\.[^"']+)\1/g,(_all,_quote,specifier)=>'from '+JSON.stringify(pathToFileURL(specifier==='./exui-complex-email-admission.mjs'?bridge:path.resolve(root,'scripts/lib',specifier)).href)).replace('const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");','const ROOT = '+JSON.stringify(root)+';');
 fs.writeFileSync(nativeModule,nativeSource);const loaded=await import(pathToFileURL(nativeModule).href);
 return{f,m,raw,packet,expected,capture,context,sourceConfiguration,directory,request,requestPath,pin,write,calls,read:()=>read(requestPath,pin),readWithPin:next=>read(requestPath,next),readNative:()=>loaded.readNativeReportEvidence(f.descriptorPath,{profileConfigurationFor:f.c.configurationFor})};
};
exports.functionBody=(name,dependencies,{file='scripts/lib/exui-complex-email-admission.mjs',unsafeReplace}={})=>{
 let source=fs.readFileSync(path.resolve(__dirname,'../..',file),'utf8');if(unsafeReplace){assert(source.includes(unsafeReplace[0]));source=source.replace(...unsafeReplace);}
 const pattern=new RegExp('export (?:async )?function '+name+'\\('),start=source.search(pattern);assert(start>=0);let next=source.indexOf('\nexport ',start+1);if(next<0)next=source.length;
 return new Function(...Object.keys(dependencies),source.slice(start,next).replace(/^export /,'')+';return '+name+';')(...Object.values(dependencies));
};
