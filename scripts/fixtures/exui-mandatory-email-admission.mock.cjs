// Synthetic complete packets only. No producer process/resources or accepted application evidence.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{randomUUID,createHash}=require('node:crypto');
const digest=bytes=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
const write=(file,value)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');return digest(fs.readFileSync(file));};
exports.admissionPacket=async (t,{personal=false}={})=>{
 const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'mandatory-admission-unit-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const {jointOwnershipPacket}=require('./exui-st-cic-joint-ownership.mock.cjs'),main=await jointOwnershipPacket(t);
 const previousMain=await main.replayMain();
 const leaf=await import('../lib/exui-mandatory-email-event-contract.mjs'),raw=await import('../lib/exui-mandatory-email-event-invocation-binding.mjs'),api=await import('../lib/exui-mandatory-email-event-admission.mjs');
 const descriptor=JSON.parse(fs.readFileSync(main.f.descriptorPath)),native=main.native,expected=descriptor.expected;
 const sourceInput=JSON.parse(fs.readFileSync(path.join(main.f.directory,'private/eventCapability/input.json')));
 for(const phase of ['ccd','eventCapability','recipientCallback','selectorEventRow']){const file=path.join(main.f.directory,'private',phase,'input.json'),value=JSON.parse(fs.readFileSync(file));const before=JSON.stringify(value);if(!value.ccd)value.ccd=structuredClone(sourceInput.ccd);if(!value.credentials)value.credentials=structuredClone(sourceInput.credentials);if(JSON.stringify(value)!==before)write(file,value);}
 const images=sourceInput.ccd.images,projected=leaf.mandatoryEmailImageProjection(images);
 if(personal){
  const api=await import('../lib/exui-personal-service-admission.mjs');
  const images=Object.fromEntries(Object.entries(sourceInput.ccd.images).map(([name,image])=>[name,{image:image.id,os:'linux',architecture:image.architecture}]));
  expected.personalServiceNativeBinding=api.capturePersonalNativeBinding({nativeCohortCapture:{binding:native,reference:expected.nativeCohortBinding}},main.f.directory,images).reference;
 }

 const capture=leaf.captureMandatoryEmailNativeBinding({nativeCohortCapture:{binding:native,reference:expected.nativeCohortBinding}},main.f.directory,projected);
 expected.mandatoryEmailNativeBinding=capture.reference;
 const ciFile=path.join(main.f.directory,'private/ci-result.json'),ci=JSON.parse(fs.readFileSync(ciFile));ci.mandatoryEmailNativeBinding=capture.reference;expected.ciResultDigest=write(ciFile,ci);
 const context={native,capture,expected:structuredClone(expected)};
 const directory=path.join(root,'admission'),cohortDirectory=path.join(directory,'cohort'),browserRoot=path.join(root,'browser');fs.mkdirSync(cohortDirectory,{recursive:true});fs.mkdirSync(browserRoot);
 const candidateManifest=path.join(root,'candidate-artifact.json');const candidateManifestDigest=write(candidateManifest,main.c.f?.artifact??JSON.parse(fs.readFileSync(path.join(main.c.directory,'cohort-input.json'))).artifact);
 const runId='mandatory-admission-'+randomUUID(),input={schemaVersion:1,kind:'mandatory-email-admission-input',runId,context,candidateManifest,browserRoot},inputFile=path.join(directory,'expected-input.json'),inputDigest=write(inputFile,input);
 const artifact=JSON.parse(fs.readFileSync(candidateManifest));
 const cohort={schemaVersion:1,runId:'mandatory-email-'+randomUUID(),producer:{commit:native.producer.commit,files:Object.entries(native.producer.files),digest:native.producer.sourceDigest},candidateManifest,candidateManifestDigest,artifact,browser:{root:browserRoot,...native.browser},dependencies:{...native.dependencies},nativeRuntime:native.runtime,ccdImages:images,noCredit:raw.MANDATORY_EMAIL_NO_CREDIT,admissionContext:context,admissionInput:{path:inputFile,digest:inputDigest}};
 leaf.verifyMandatoryEmailContextCohort(context,cohort);
 const parentDigest=write(path.join(cohortDirectory,'parent-input.json'),cohort),records=[],packets=[];
 const {materialPrepared,completeMaterial}=require('./exui-mandatory-email-cohort.mock.cjs');
 for(const [ordinal,variant]of ['baseline','name-optional','address-optional'].entries()){
  const material=await materialPrepared(t,variant,{base:cohortDirectory,cohort,ordinal});
  const request={schemaVersion:1,cohort,variant,directory:path.join(cohortDirectory,variant),environment:{HOME:root,PATH:process.env.PATH,TMPDIR:fs.realpathSync(os.tmpdir())}},requestName=variant+'-expected.json',requestDigest=write(path.join(cohortDirectory,requestName),request);
  write(path.join(cohortDirectory,variant+'-launch.json'),{command:raw.mandatoryEmailChildCommand(path.join(cohortDirectory,requestName),requestDigest),environment:request.environment,requestDigest,source:cohort.producer,candidate:cohort.artifact,browser:cohort.browser,dependencies:cohort.dependencies});
  const creation=raw.validateMandatoryEmailCreation(material.creation,cohort,material.prepared.handoff.output,variant,{inspect:()=>null}),binding=raw.captureMandatoryEmailBinding(material.prepared,cohort,creation,{inspect:material.inspect});
  write(path.join(cohortDirectory,variant+'-creation.json'),creation);write(path.join(cohortDirectory,variant+'-binding.json'),binding);
  await completeMaterial(material,binding,requestDigest);
  const terminal={started:true,observed:true,closed:true,forced:false,cancelled:false,code:0,signal:null,protocolComplete:true},completion=raw.replayMandatoryEmailInvocation(binding,cohort,terminal,requestDigest);
  write(path.join(cohortDirectory,variant+'-terminal.json'),terminal);write(path.join(cohortDirectory,variant+'-completion.json'),completion);
  const absence={names:[...Object.keys(binding.ccd.containers).map(service=>binding.ccd.owner+'-'+service),binding.plan.candidate.name,binding.plan.tools.name],cids:[...Object.values(binding.ccd.containers),...completion.registry.map(row=>row.id)],privateWorkspace:binding.privateWorkspace,afterObservedClose:true,containersAbsent:true,privateWorkspaceAbsent:true};write(path.join(cohortDirectory,variant+'-absence.json'),absence);
  const names=['expected','launch','creation','binding','terminal','completion','absence'].map(kind=>variant+'-'+kind+'.json');records.push({variant,baselineProofs:variant==='baseline'?2:0,effectiveFaults:variant==='baseline'?0:1,files:Object.fromEntries(names.map(name=>[name,digest(fs.readFileSync(path.join(cohortDirectory,name)))]))});packets.push({variant,binding,completion,input:material.prepared.input,absence});
 }
 write(path.join(cohortDirectory,'mandatory-email-cohort.json'),{cohortDigest:raw.mandatoryEmailDigest(cohort),inputDigest:parentDigest,schemaVersion:1,kind:'mandatory-email-three-invocation-cohort',status:'observed-three-invocation-cohort',records,baselineProofs:2,effectiveFaults:2,...raw.MANDATORY_EMAIL_NO_CREDIT});
 write(path.join(directory,'independent-controller-launch.json'),{schemaVersion:1,runId,inputDigest,producer:native.producer,command:api.mandatoryEmailControllerCommand({candidate:candidateManifest,browser:browserRoot,output:directory,inputDigest}),contextDigest:raw.mandatoryEmailDigest(context)});
 write(path.join(directory,'independent-controller-terminal.json'),{schemaVersion:1,runId,inputDigest,started:true,observed:true,closed:true,forced:false,cancelled:false,code:0,signal:null});write(path.join(directory,'independent-controller-cleanup.json'),{schemaVersion:1,runId,inputDigest,observedAfterControllerClose:true,variants:packets.map(p=>({variant:p.variant,...p.absence}))});
 const requestPath=path.join(directory,'admission-request.json'),requestPin={runId,digest:write(requestPath,{schemaVersion:1,kind:'mandatory-email-admission-request',directory,expected:api.mandatoryEmailAdmissionPins(directory)})};
 expected.mandatoryEmailRequest=requestPin;descriptor.mandatoryEmailAdmission=requestPath;
 const reseal=()=>{const expectedPins=api.mandatoryEmailAdmissionPins(directory);requestPin.digest=write(requestPath,{schemaVersion:1,kind:'mandatory-email-admission-request',directory,expected:expectedPins});expected.mandatoryEmailRequest={...requestPin};};
 const rehashVariant=variant=>{
  const bindingFile=path.join(cohortDirectory,variant+'-binding.json'),binding=JSON.parse(fs.readFileSync(bindingFile));
  for(const name of Object.keys(binding.files))binding.files[name]=digest(fs.readFileSync(path.join(binding.directory,name)));binding.inputDigest=binding.files['input.json'];write(bindingFile,binding);
  const expectedName=variant+'-expected.json',expectedDigest=digest(fs.readFileSync(path.join(cohortDirectory,expectedName))),launchFile=path.join(cohortDirectory,variant+'-launch.json'),launch=JSON.parse(fs.readFileSync(launchFile));launch.requestDigest=expectedDigest;launch.command=raw.mandatoryEmailChildCommand(path.join(cohortDirectory,expectedName),expectedDigest);write(launchFile,launch);
  const childFile=path.join(binding.directory,'mandatory-email-child-completion.json'),child=JSON.parse(fs.readFileSync(childFile));child.expectedDigest=expectedDigest;write(childFile,child);
  const completionFile=path.join(cohortDirectory,variant+'-completion.json'),completion=JSON.parse(fs.readFileSync(completionFile));for(const name of Object.keys(completion.files))completion.files[name]=digest(fs.readFileSync(path.join(binding.directory,name)));write(completionFile,completion);
  const receiptFile=path.join(cohortDirectory,'mandatory-email-cohort.json'),receipt=JSON.parse(fs.readFileSync(receiptFile)),record=receipt.records.find(row=>row.variant===variant);for(const name of Object.keys(record.files))record.files[name]=digest(fs.readFileSync(path.join(cohortDirectory,name)));write(receiptFile,receipt);reseal();
 };

 let personalFixture;
 if(personal){
  main.f.native=native;main.f.descriptor=descriptor;main.f.save=()=>write(main.f.descriptorPath,descriptor);
  personalFixture=await currentSiblingFactory('exui-personal-service-admission.mock.cjs',async()=>main.f).personalAdmissionFixture(t);
  await exports.resealPersonalHeaders(personalFixture,(variant,role)=>'Bearer synthetic-personal-smoke-'+variant+'-'+role);
 }
 return{personal:personalFixture,root,directory,cohortDirectory,cohort,context,native,capture,expected,descriptor,previousMain,main:main.f,packets,requestPath,requestPin,write,read:file=>JSON.parse(fs.readFileSync(file)),reseal,rehashVariant};
};

// Exercise the actual wrapper body; substitute only Git/asset/process system boundaries.
exports.wrapperStartup=async(t,packet)=>{
 const {pathToFileURL}=require('node:url'),sourceRoot=path.resolve(__dirname,'../..'),directory=path.join(packet.root,'wrapper-copy');fs.mkdirSync(directory);
 const sharedFile=path.join(directory,'state.mjs'),sharedUrl=pathToFileURL(sharedFile).href;
 fs.writeFileSync(sharedFile,`export const state={launches:0,assetReads:0};export let ready,release;export const seen=new Promise(r=>ready=r),gate=new Promise(r=>release=r);`);
 const asset=path.join(directory,'asset.mjs');fs.writeFileSync(asset,`import{state,ready,gate}from${JSON.stringify(sharedUrl)};export async function verifyCandidateArtifact(){state.assetReads++;ready();await gate;return ${JSON.stringify(packet.cohort.artifact)};}`);
 const processFile=path.join(directory,'process.mjs');fs.writeFileSync(processFile,`import{EventEmitter}from'node:events';import{state}from${JSON.stringify(sharedUrl)};export function spawn(){state.launches++;const child=new EventEmitter();queueMicrotask(()=>{child.emit('spawn');child.emit('exit',2,null);child.emit('close',2,null);});return child;}`);
 const bindingFile=path.join(directory,'binding.mjs');fs.writeFileSync(bindingFile,`export * from ${JSON.stringify(pathToFileURL(sourceRoot+'/scripts/lib/exui-mandatory-email-event-invocation-binding.mjs').href)};export const mandatoryEmailProducer=()=>(${JSON.stringify(packet.cohort.producer)});`);
 const replacements={'./lib/exui-candidate-artifact.mjs':pathToFileURL(asset).href,'node:child_process':pathToFileURL(processFile).href,'./lib/exui-mandatory-email-event-invocation-binding.mjs':pathToFileURL(bindingFile).href};
 const source=fs.readFileSync(sourceRoot+'/scripts/run-harness-mandatory-email-event-admission.mjs','utf8').replace(/(from\s+)(['"])([^'"]+)\2/g,(_all,prefix,quote,name)=>prefix+quote+(replacements[name]||(name.startsWith('.')?pathToFileURL(path.resolve(sourceRoot,'scripts',name)).href:name))+quote);
 const file=path.join(directory,'wrapper.mjs');fs.writeFileSync(file,source);return{api:await import(pathToFileURL(file).href),shared:await import(sharedUrl)};
};

// Complete legacy unit packets omitted bearer fields. Add only test-owned headers
// at the actual selected schema and coherently reseal the existing fixed records.
exports.resealPersonalHeaders=async(g,tokenFor)=>{
 const b=g.b;
 for(const variant of ['baseline','optional']){
  const expectedFile=path.join(g.root,variant+'-expected.json'),held=JSON.parse(fs.readFileSync(expectedFile)),binding=held.binding,inputFile=path.join(binding.directory,'input.json'),input=JSON.parse(fs.readFileSync(inputFile));
  for(const [role,actor]of Object.entries(input.credentials))actor.headers={...(actor.headers??{}),Authorization:tokenFor(variant,role)};
  g.write(inputFile,input);binding.files=b.personalFiles(binding.directory,Object.keys(binding.files));const bodyDigest=b.personalDigest(binding),bindingDigest=g.write(expectedFile,held);
  const finalFile=path.join(binding.directory,'personal-service-child-finalization.json'),final=JSON.parse(fs.readFileSync(finalFile));final.bindingDigest=bodyDigest;g.write(finalFile,final);
  const launchFile=path.join(g.root,variant+'-launch.json'),launch=JSON.parse(fs.readFileSync(launchFile));launch.bindingDigest=bindingDigest;launch.command=b.personalChildCommand(expectedFile,bindingDigest);g.write(launchFile,launch);
  const removalFile=path.join(g.root,variant+'-removal.json'),removal=JSON.parse(fs.readFileSync(removalFile));removal.bindingDigest=bodyDigest;g.write(removalFile,removal);
  const completionFile=path.join(g.root,variant+'-completion.json'),completion=JSON.parse(fs.readFileSync(completionFile));completion.files=b.personalFiles(binding.directory,b.PERSONAL_FINAL_FILES);g.write(completionFile,completion);
  Object.assign(g.p.expected.invocations[variant],{bindingDigest,launchDigest:b.personalFile(g.root,variant+'-launch.json').digest,completionDigest:b.personalFile(g.root,variant+'-completion.json').digest,removalDigest:b.personalFile(g.root,variant+'-removal.json').digest});
 }
 const raw=b.readPersonalCohort(g.root,g.p.expected);g.request.receiptDigest=g.write(path.join(g.root,'personal-service-cohort.json'),raw);g.pin.digest=g.write(g.requestPath,g.request);
 return g.m.readPersonalAdmissionPacket(g.requestPath,g.pin);
};
exports.resealComplexHeaders=async(g,tokenFor)=>{
 for(const key of ['browser-baseline','browser-email-type']){
  const context=g.expected.contexts[key],input=context.prepared.input;
  for(const [role,actor]of Object.entries(input.credentials))actor.headers={...(actor.headers??{}),Authorization:tokenFor(key,role)};
  g.write(path.join(context.directory,'input.json'),input);
  for(const stage of ['prepared','completed','closed'])context[stage].files=g.raw.complexPins(context.directory,Object.keys(context[stage].files));
 }
 const raw=g.raw.readComplexCohort(g.directory,g.expected,{inspect:()=>null,ownerEmpty:()=>true});g.request.receiptDigest=g.write(path.join(g.directory,'complex-cohort-result.json'),raw);g.pin.digest=g.write(g.requestPath,g.request);
 return g.read();
};

// Reuse the unchanged complete sibling fixture factories with a current 1.65
// main fixture. Only their upstream test-data factory is replaced; production
// capture, raw readers and comparators remain the real implementations.
async function currentMandatoryMain(t){
 const j=await require('./exui-st-cic-joint-ownership.mock.cjs').jointOwnershipPacket(t);
 const f=j.f;f.native=j.native;f.c=j.c;f.descriptor=JSON.parse(fs.readFileSync(f.descriptorPath));
 const leaf=await import('../lib/exui-mandatory-email-event-contract.mjs');
 const capture=leaf.captureMandatoryEmailNativeBinding({nativeCohortCapture:{binding:j.native,reference:f.descriptor.expected.nativeCohortBinding}},f.directory,leaf.mandatoryEmailImageProjection(f.event.input.ccd.images));
 f.descriptor.expected.mandatoryEmailNativeBinding=capture.reference;
 const ciFile=path.join(f.directory,'private/ci-result.json'),ci=JSON.parse(fs.readFileSync(ciFile));ci.mandatoryEmailNativeBinding=capture.reference;f.descriptor.expected.ciResultDigest=write(ciFile,ci);
 f.save=()=>write(f.descriptorPath,f.descriptor);f.save();return f;
}
function currentSiblingFactory(name,mainFactory=currentMandatoryMain){
 const Module=require('node:module'),file=path.join(__dirname,name),loaded=new Module(file,module),originalRequire=Module.createRequire(file);
 loaded.filename=file;loaded.paths=Module._nodeModulePaths(__dirname);
 loaded.require=specifier=>specifier==='./exui-divorce-joint-packet.mock.cjs'?{jointFixture:mainFactory}:originalRequire(specifier);
 loaded._compile(fs.readFileSync(file,'utf8'),file);return loaded.exports;
}
exports.currentPersonalAdmissionFixture=t=>currentSiblingFactory('exui-personal-service-admission.mock.cjs').personalAdmissionFixture(t);
exports.currentComplexAdmissionFixture=t=>currentSiblingFactory('exui-complex-email-admission.mock.cjs').fixture(t);
exports.currentStCicAdmissionFixture=async t=>{
 const j=await require('./exui-st-cic-joint-packet.mock.cjs').jointPacket(t),leaf=await import('../lib/exui-mandatory-email-event-contract.mjs');
 const capture=leaf.captureMandatoryEmailNativeBinding({nativeCohortCapture:{binding:j.native,reference:j.expected.nativeCohortBinding}},j.f.directory,leaf.mandatoryEmailImageProjection(j.f.event.input.ccd.images));
 j.expected.mandatoryEmailNativeBinding=capture.reference;j.context.expected.mandatoryEmailNativeBinding=capture.reference;
 const parent=path.dirname(j.requestPath),file=path.join(parent,'native-admission-context.json'),envelope=JSON.parse(fs.readFileSync(file));envelope.context=j.context;
 const launchFile=path.join(parent,'independent-controller-launch.json'),launch=JSON.parse(fs.readFileSync(launchFile));launch.admissionContextDigest=write(file,envelope);write(launchFile,launch);
 const request=JSON.parse(fs.readFileSync(j.requestPath));request.expected=j.m.stCicAdmissionPins(parent);j.requestPin.digest=write(j.requestPath,request);j.expected.stCicProfileRequest=j.requestPin;
 j.packet=j.m.readStCicProfileAdmissionPacket(j.requestPath,j.requestPin);return j;
};
