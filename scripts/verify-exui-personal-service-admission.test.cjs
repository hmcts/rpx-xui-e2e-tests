const test=require('node:test'),assert=require('node:assert/strict');
test('fixed personal admission contract covers precisely nine keys without activation or dependency credit',async()=>{
 const {personalAdmissionContract}=await import('./lib/exui-personal-service-admission.mjs');
 const c=personalAdmissionContract();assert.equal(c.catalogueSize,112);assert.equal(c.boundary,'candidate');assert.equal(Object.keys(c.facets).length,9);assert.equal(c.facets.LiveFrom,'typed-import-retention-only');assert.equal(c.activationClaim,false);assert.equal(c.releaseCredit,false);assert.equal(c.mutation.attribute,'DisplayContext');assert.equal(c.mutation.from,'MANDATORY');assert.equal(c.mutation.to,'OPTIONAL');
});

const fs=require('node:fs'),path=require('node:path');
const {personalAdmissionFixture}=require('./fixtures/exui-personal-service-admission.mock.cjs');
test('raw seven phases plus twelve profile calls plus personal pair adds only the exact existing candidate row',async t=>{
 const x=await personalAdmissionFixture(t);const joined=await x.f.read();assert.equal(joined.personalServiceAdmission.joint.status,'included');assert.equal(joined.catalogueCoverage.selected,112);assert.equal(joined.status,'BLOCKED');assert.equal(joined.releaseApproval,false);
 const saved=fs.readFileSync(x.f.descriptorPath);delete x.f.descriptor.personalServiceAdmission;delete x.f.descriptor.expected.personalServiceRequest;x.f.save();const before=await x.f.read();fs.writeFileSync(x.f.descriptorPath,saved);
 assert.equal(joined.catalogueCoverage.candidate,before.catalogueCoverage.candidate+1);assert.equal(joined.catalogueCoverage.missing,before.catalogueCoverage.missing-1);assert.equal(joined.catalogueCoverage.ccd,before.catalogueCoverage.ccd);assert.deepEqual(joined.phases,before.phases);assert.deepEqual(joined.divorceProfileAdmission,before.divorceProfileAdmission);
 assert.equal(joined.catalogueCoverage.creditedObligationIds.filter(id=>id===joined.personalServiceAdmission.obligationId).length,1);
 const html=require('./harness-native-report.cjs').renderNativeEvidence(joined);assert.match(html,/Personal-service event row: 1 requirement included/);assert.match(html,/typed import retention only, not activation/);
});
const read=file=>JSON.parse(fs.readFileSync(file));
const hash='sha256:'+'e'.repeat(64);
test('held request and native capsule reject coherent substitutions before any separate classification',async t=>{
 const x=await personalAdmissionFixture(t),original=fs.readFileSync(x.requestPath),nativePath=path.join(x.f.directory,x.m.PERSONAL_NATIVE_PATH),nativeBytes=fs.readFileSync(nativePath),desc=fs.readFileSync(x.f.descriptorPath);
 for(const change of [r=>r.expected.inputDigest=hash,r=>r.expected.bindingDigest=hash,r=>r.expected.producer.commit='e'.repeat(40),r=>r.contractDigest=hash,r=>r.expected.invocations.baseline.observedTerminal.code=1]){const r=JSON.parse(original);change(r);x.write(x.requestPath,r);await assert.rejects(x.f.read);fs.writeFileSync(x.requestPath,original);}
 for(const change of [r=>r.contractDigest=hash,r=>r.nativeBindingDigest=hash,r=>r.ccdImages.definition.image=hash,r=>r.ccdImages.data.architecture='amd64',r=>r.extra=true]){const r=JSON.parse(nativeBytes);change(r);const d=JSON.parse(desc);d.expected.personalServiceNativeBinding.digest=x.write(nativePath,r);x.write(x.f.descriptorPath,d);await assert.rejects(x.f.read);fs.writeFileSync(nativePath,nativeBytes);fs.writeFileSync(x.f.descriptorPath,desc);}
 // Even absent main context cannot turn malformed raw data into a separate success.
 const d=JSON.parse(desc);delete d.expected.personalServiceNativeBinding;x.write(x.f.descriptorPath,d);const file=path.join(x.root,'optional/baseline/report.json'),saved=fs.readFileSync(file);fs.unlinkSync(file);await assert.rejects(x.f.read);fs.writeFileSync(file,saved);
 assert.equal((await x.f.read()).personalServiceAdmission.joint.status,'separate');fs.writeFileSync(x.f.descriptorPath,desc);assert.equal((await x.f.read()).personalServiceAdmission.joint.status,'included');
});
test('fresh-contract requirement rejects historical non-credit pair even with a newly pinned request',async t=>{
 const x=await personalAdmissionFixture(t);delete x.p.cohort.admissionContext;delete x.p.cohort.admissionContractDigest;x.p.put('parent-input.json',x.p.cohort);const r=read(x.requestPath);r.expected.inputDigest=x.b.personalFile(x.root,'parent-input.json').digest;r.expected.bindingDigest=x.b.personalDigest(x.p.cohort);const pin={runId:r.expected.runId,digest:x.write(x.requestPath,r)};assert.throws(()=>x.m.readPersonalAdmissionPacket(x.requestPath,pin));
});
test('complete raw personal packet rejects coherently rehashed date, ordering, Change, windows and empty summary changes',async t=>{
 const x=await personalAdmissionFixture(t),root=x.root;
 for(const [variant,name,change]of [
  ['baseline','runtime/recipient-callback-import/personal-service-stored-row-date.json',r=>r.rows[0].sql_type='text'],
  ['baseline','runtime/recipient-callback-import/personal-service-stored-row-date.json',r=>r.rows[0].version++],
  ['baseline','baseline/personal-service-observation.json',r=>r.filled.ui.precedesSelector=false],
  ['baseline','baseline/personal-service-observation.json',r=>r.filled.ui.afterChange='Yes'],
  ['baseline','baseline/personal-service-observation.json',r=>r.filled.after.state.version++],
  ['optional','baseline/personal-service-observation.json',r=>r.empty.cyaControl.value='foreign'],
  ['baseline','baseline/candidate-lifecycle.json',r=>r.before.Config.Cmd=['foreign']],
  ['optional','baseline/candidate-lifecycle.json',r=>r.after.Config.Entrypoint=['foreign']],
 ]){
  const file=path.join(root,variant,name),saved=fs.readFileSync(file),cfile=path.join(root,variant+'-completion.json'),csaved=fs.readFileSync(cfile),originalRequest=fs.readFileSync(x.requestPath);
  const value=read(file);change(value);x.write(file,value);const completion=read(cfile);completion.files=x.b.personalFiles(path.join(root,variant),x.b.PERSONAL_FINAL_FILES);const req=read(x.requestPath);req.expected.invocations[variant].completionDigest=x.write(cfile,completion);const pin={runId:req.expected.runId,digest:x.write(x.requestPath,req)};
  assert.throws(()=>x.m.readPersonalAdmissionPacket(x.requestPath,pin),undefined,name);fs.writeFileSync(file,saved);fs.writeFileSync(cfile,csaved);fs.writeFileSync(x.requestPath,originalRequest);
 }
 assert.equal(x.m.readPersonalAdmissionPacket(x.requestPath,x.pin).admission.status,'passed');
});
test('personal join refuses a consistently substituted parent context and deduplicates only the fixed ID',async t=>{
 const x=await personalAdmissionFixture(t),packet=x.m.readPersonalAdmissionPacket(x.requestPath,x.pin);
 const changed=structuredClone(packet);changed.cohort.admissionContext.expected.jobRunId='ci-00000000-0000-4000-8000-000000000000';assert.throws(()=>x.m.personalNativeJointAdmission(x.f.native,x.capture.binding,changed,x.f.descriptor.expected));
 for(const field of ['producer','candidate']){const native=structuredClone(x.f.native);if(field==='producer')native.producer.commit='e'.repeat(40);else native.candidate.identity.artifactDigest=hash;assert.equal(x.m.personalNativeJointAdmission(native,x.capture.binding,packet,x.f.descriptor.expected).status,'separate');}
 const result=await x.f.read(),render=require('./harness-native-report.cjs').renderNativeEvidence;
 for(const change of [r=>r.catalogueCoverage.creditedObligationIds.push(r.personalServiceAdmission.obligationId),r=>r.catalogueCoverage.candidate++,r=>r.catalogueCoverage.ccd++,r=>r.personalServiceAdmission.sourceComplete=false,r=>r.personalServiceAdmission.activationClaim=true,r=>r.personalServiceAdmission.joint.obligationId='foreign',r=>r.personalServiceAdmission.joint.personalRunId='personal-00000000-0000-4000-8000-000000000000']){const bad=structuredClone(result);change(bad);assert.throws(()=>render(bad));}
});
test('request paths and caller pins reject aliases and a different fully valid packet',async t=>{
 const x=await personalAdmissionFixture(t),other=await personalAdmissionFixture(t);assert.equal(other.m.readPersonalAdmissionPacket(other.requestPath,other.pin).admission.status,'passed');fs.writeFileSync(x.requestPath,fs.readFileSync(other.requestPath));assert.throws(()=>x.m.readPersonalAdmissionPacket(x.requestPath,x.pin));
 const alias=path.join(other.root,'alias.json');fs.symlinkSync(other.requestPath,alias);assert.throws(()=>other.m.readPersonalAdmissionPacket(alias,other.pin));
});
test('publication contains one personal result with consistent catalogue and family scope',async t=>{
 const x=await personalAdmissionFixture(t),evidence=await x.f.read(),{temp}=require('./fixtures/exui-divorce-cohort-packet.mock.cjs'),reportRoot=temp(t),previous=process.cwd();process.chdir(reportRoot);
 try{const Reporter=require('./harness-public-odhin-reporter.cjs'),overview=require('./harness-public-overview.cjs'),reporter=new Reporter({selection:'harness'});reporter.nativeEvidence=evidence;const tests=overview.entries.map(entry=>({location:{file:path.join(reportRoot,entry.file)},titlePath:()=>entry.titlePath,retries:0,expectedStatus:'passed'}));reporter.onBegin({}, {allTests:()=>tests});const startTime=new Date('2026-11-06T01:10:00Z');for(const item of tests)reporter.onTestEnd(item,{status:'passed',retry:0,duration:1,startTime,workerIndex:0,parallelIndex:0});await reporter.onEnd({status:'passed',startTime,duration:1000});const recorded=Reporter.validatePublicReport();assert.deepEqual(recorded.nativeEvidence.catalogueCoverage,evidence.catalogueCoverage);const html=fs.readFileSync(path.join(reportRoot,'functional-output/tests/harness/public/odhin/index.html'),'utf8');assert.equal((html.match(/id="harness-personal-service-admission"/g)||[]).length,1);assert.match(html,/Personal-service event row: 1 candidate requirement included/);assert.match(html,/Postal proof BLOCKED/);assert.match(html,/data-personal-duration-ms="240000"/);
 const {publishAssuranceSummary}=await import('./run-harness-assurance.mjs'),{validatePublicSummary}=await import('./lib/exui-evidence-io.mjs');
 const captured={nativeCohortCapture:{binding:x.f.native,reference:x.f.descriptor.expected.nativeCohortBinding},personalNativeCapture:x.capture};publishAssuranceSummary({output:x.f.directory},captured,{exitCode:0});
 x.write(path.join(x.f.directory,x.m.PERSONAL_NATIVE_PATH),{late:'replacement'});assert.throws(()=>publishAssuranceSummary({output:x.f.directory},captured,{exitCode:0,personalStatus:'PASS'}));assert.equal(validatePublicSummary(path.join(x.f.directory,'public/release-assurance-summary.json')).status,'BLOCKED');assert.equal(fs.existsSync(path.join(reportRoot,'functional-output/tests/harness/public/odhin/index.html')),false);assert.equal(fs.existsSync(path.join(reportRoot,'functional-output/tests/harness/private/public-odhin-harness.json')),false);
 }
 finally{process.chdir(previous);}
});
test('canonical personal stage follows actual profile completion and passes the exact API request to one collector',async()=>{
 const {runAssuranceSequence}=await import('./run-harness-assurance.mjs'),order=[],profilePin={path:'/profile/request',digest:hash,runId:'profile'},personalPin={path:'/personal/request',digest:hash,runId:'personal'};
 const result=await runAssuranceSequence({native:async()=>{order.push('native');return {status:'BLOCKED',exitCode:2,continuationSafe:true};},prepare:()=>order.push('prepare'),profile:async()=>{order.push('profile');return {status:'passed',reportRequest:profilePin};},personal:async()=>{order.push('personal');return {status:'passed',reportRequest:personalPin};},descriptor:async(v,p,r)=>{assert.equal(p,profilePin);assert.equal(r,personalPin);order.push('descriptor');return '/request';},collect:async()=>{order.push('collector');return {status:'passed',exitCode:0,divorceProfileInclusion:'included',personalServiceInclusion:'included'};}});
 assert.deepEqual(order,['native','prepare','profile','personal','descriptor','collector']);assert.equal(result.personalStatus,'PASS');assert.equal(result.nativeStatus,'BLOCKED');assert.equal(result.exitCode,2);assert.equal(result.releaseApproval,false);
});
test('personal failure, unvalidated inclusion and preceding failure cannot yield whole-command success',async()=>{
 const {runAssuranceSequence}=await import('./run-harness-assurance.mjs');
 for(const mode of ['throw','separate','missing','prior-failure']){
  let launches=0,attempt,collections=0;
  const result=await runAssuranceSequence({native:async()=>({status:'PASS',exitCode:0,continuationSafe:true}),profile:async()=>{if(mode==='prior-failure')throw Error('uncertain cleanup');return {status:'passed',reportRequest:{path:'/profile',digest:hash,runId:'profile'}};},personal:async()=>{launches++;if(mode==='throw')throw Error('pair failed');return {status:'passed',reportRequest:{path:'/personal',digest:hash,runId:'personal'}};},descriptor:async()=>'/request',collect:async(file,timing)=>{collections++;attempt=timing.personalServiceAttempt;return {status:'passed',exitCode:0,divorceProfileInclusion:'included',...(mode==='separate'?{personalServiceInclusion:'separate'}:{})};}});
  assert.equal(result.exitCode,2);assert.equal(result.personalStatus,mode==='prior-failure'?'NOT_RUN':'BLOCKED');assert.equal(collections,['throw','prior-failure'].includes(mode)?0:1);assert.equal(launches,mode==='prior-failure'?0:1);if(mode==='throw'||mode==='prior-failure')assert.equal(attempt,undefined);
 }
});
test('personal cancellation and bad request pins preserve safe main handling without later launch or false inclusion',async()=>{
 const {runAssuranceSequence}=await import('./run-harness-assurance.mjs'),controller=new AbortController();let collected=0,withdrawn=0;
 const stopped=await runAssuranceSequence({native:async()=>({status:'PASS',exitCode:0,continuationSafe:true}),personal:async signal=>{assert.equal(signal,controller.signal);controller.abort();return {status:'passed',reportRequest:{path:'/request',digest:hash,runId:'personal'}};},descriptor:async()=>{throw Error('must not write');},collect:async()=>{collected++;},signal:controller.signal,withdraw:()=>withdrawn++});assert.equal(stopped.exitCode,2);assert.equal(collected,0);assert.equal(withdrawn,1);
 let writes=0,attempt;
 const result=await runAssuranceSequence({native:async()=>({status:'PASS',exitCode:0,continuationSafe:true}),profile:async()=>({status:'passed',reportRequest:{path:'/profile',digest:hash,runId:'profile'}}),personal:async()=>({status:'passed',reportRequest:{path:'/invalid',digest:hash,runId:'personal'}}),descriptor:async(v,p,r)=>{writes++;assert(p);if(r)throw Error('pin changed');return '/main-plus-profile';},collect:async(file,timing)=>{assert.equal(file,'/main-plus-profile');attempt=timing.personalServiceAttempt;return {status:'passed',exitCode:0,divorceProfileInclusion:'included'};}});assert.equal(writes,2);assert.equal(result.personalStatus,'BLOCKED');assert.equal(result.profileStatus,'PASS');assert.equal(attempt.status,'BLOCKED');assert.equal(result.exitCode,2);
});
test('AbortSignal before child launch observes no process and cannot start a candidate',async()=>{
 const {executePersonalChild}=await import('./run-harness-personal-service-cohort.mjs'),{personalChildCommand}=await import('./lib/exui-personal-service-invocation-binding.mjs'),signal=AbortSignal.abort();let launch=false;
 const r=await executePersonalChild(personalChildCommand('/tmp/baseline-expected.json',hash),{signal,launch:()=>{launch=true;}});assert.equal(launch,false);assert.equal(r.started,false);assert.equal(r.cancelled,true);assert.equal(r.observed,true);
});
test('fixed adapter preserves the actual pair return pins and never invokes publication replay',async t=>{
 const {temp}=require('./fixtures/exui-divorce-cohort-packet.mock.cjs'),{spawnSync}=require('node:child_process'),dir=temp(t),script=path.join(dir,'scripts');fs.mkdirSync(path.join(script,'lib'),{recursive:true});
 fs.copyFileSync(path.join(__dirname,'run-harness-personal-service-admission.mjs'),path.join(script,'run-harness-personal-service-admission.mjs'));
 fs.writeFileSync(path.join(script,'lib/exui-personal-service-admission.mjs'),`export const verifyPersonalNativeCapture=()=>undefined;export const personalAdmissionDigest=()=>${JSON.stringify(hash)};export const validatePersonalAdmissionContext=value=>value;export const readPersonalAdmissionPacket=()=>{throw Error('DUPLICATE_PUBLICATION_READ')};`);
 fs.writeFileSync(path.join(script,'lib/exui-personal-service-invocation-binding.mjs'),`export const personalFile=()=>({digest:${JSON.stringify(hash)}});`);
 fs.writeFileSync(path.join(script,'lib/exui-evidence-io.mjs'),`import fs from 'node:fs';export const writeJsonAtomic=(file,value)=>fs.writeFileSync(file,JSON.stringify(value));`);
 fs.writeFileSync(path.join(script,'run-harness-personal-service-cohort.mjs'),`import fs from 'node:fs';export const isPersonalCohortClosedFailure=()=>false;export async function runPersonalCohort(options){fs.writeFileSync('actual-call.json',JSON.stringify(options));return {result:{status:'fresh-cohort-ready-for-independent-review'},expected:{runId:'actual-parent-run',inputDigest:'held-before-child'}};}`);
 const terminal=spawnSync(process.execPath,['--input-type=module','-e',`import {runPersonalServiceAdmission} from './scripts/run-harness-personal-service-admission.mjs';console.log(JSON.stringify(await runPersonalServiceAdmission({candidate:'/candidate',browser:'/browser',output:${JSON.stringify(dir)},nativeContext:{held:'preflight'}})));`],{cwd:dir,encoding:'utf8',env:{PATH:process.env.PATH}});assert.equal(terminal.status,0,terminal.stderr);
 const actual=read(path.join(dir,'actual-call.json'));assert.deepEqual(actual.admissionContext,{held:'preflight'});const request=read(path.join(dir,'personal-service-admission-request.json'));assert.deepEqual(request.expected,{runId:'actual-parent-run',inputDigest:'held-before-child'});assert.equal(JSON.parse(terminal.stdout).reportRequest.runId,'actual-parent-run');
});
test('independent personal context comparator rejects wrong source defaults, inventory and CCD contract before proof',async t=>{
 const x=await personalAdmissionFixture(t);
 for(const change of [c=>c.native.sourceDefault.digest=hash,c=>c.native.sourceDefault.revision='e'.repeat(40),c=>c.native.catalogue.obligationsDigest=hash,c=>c.native.producer.files['scripts/lib/exui-recipient-callback-import.mjs']=hash,c=>c.capture.binding.contractDigest=hash,c=>c.capture.binding.ccdImages.data.architecture='amd64']){const c=structuredClone(x.context);change(c);assert.throws(()=>x.m.validatePersonalAdmissionContext(c));}
 const corpus=structuredClone(x.p.cohort);corpus.ccdImages.data.id=hash;assert.equal(x.m.personalCohortCompatibility(x.context,corpus).reason,'different-ccd-dependencies');
});
test('coherently moved validation remains outside its trigger window through the full admission reader',async t=>{
 const x=await personalAdmissionFixture(t),file=path.join(x.root,'optional/baseline/ccd-requests.jsonl'),rows=fs.readFileSync(file,'utf8').trim().split('\n').map(JSON.parse);const index=rows.findIndex(r=>r.personalService?.pageId==='serviceOfDocuments2');const [moved]=rows.splice(index,1);rows.unshift(moved);fs.writeFileSync(file,rows.map(JSON.stringify).join('\n')+'\n');const completion=read(path.join(x.root,'optional-completion.json'));completion.files=x.b.personalFiles(path.join(x.root,'optional'),x.b.PERSONAL_FINAL_FILES);x.request.expected.invocations.optional.completionDigest=x.write(path.join(x.root,'optional-completion.json'),completion);const pin={runId:x.pin.runId,digest:x.write(x.requestPath,x.request)};assert.throws(()=>x.m.readPersonalAdmissionPacket(x.requestPath,pin),/VALIDATION/);
});
for(const mode of ['artifact','dependencies','started'])test('latched cancellation during personal '+mode+' preparation prevents later runtime/import/proof and cleans owned startup',async t=>{
 const {preparationCancellation}=require('./fixtures/exui-personal-service-preparation.mock.cjs'),r=await preparationCancellation(t,mode);
 assert.equal(r.state.runtime,mode==='started'?1:0);assert.equal(r.state.imports,0);assert.equal(r.state.cleanup,mode==='started'?1:0);assert.equal(r.state.cleanupLookups,mode==='artifact'?0:1);assert(r.error||r.result?.status==='cancelled');if(r.result)assert.equal(r.result.nativeCleanupComplete,true);
 const old=await preparationCancellation(t,mode,{old:true});assert(mode==='started'?old.state.imports>0:old.state.runtime>0,'controlled lost-signal mutation must expose the cancellation gap');
});
test('synchronous abort during personal child launch is rechecked after the child handle exists',async t=>{
 const {executePersonalChild}=await import('./run-harness-personal-service-cohort.mjs'),{personalChildCommand}=await import('./lib/exui-personal-service-invocation-binding.mjs'),{EventEmitter}=require('node:events'),controller=new AbortController(),child=new EventEmitter();let terminated=false;
 const result=await executePersonalChild(personalChildCommand('/tmp/baseline-expected.json',hash),{signal:controller.signal,launch:()=>{controller.abort();queueMicrotask(()=>child.emit('exit',0,null));return child;},terminate:async()=>{terminated=true;return {observed:true,forced:false};}});assert.equal(terminated,true);assert.equal(result.cancelled,true);assert.equal(result.observed,true);
 const {temp}=require('./fixtures/exui-divorce-cohort-packet.mock.cjs'),{pathToFileURL}=require('node:url'),dir=temp(t),source=fs.readFileSync(path.join(__dirname,'run-harness-personal-service-cohort.mjs'),'utf8').replace('  if(cancelled)cancel();','').replace(/(from\s*|import\s*\()(['"])(\.[^'"]+)\2/g,(all,prefix,quote,name)=>prefix+quote+pathToFileURL(path.resolve(__dirname,name)).href+quote),file=path.join(dir,'lost-postspawn.mjs');fs.writeFileSync(file,source);
 const old=await import(pathToFileURL(file)),oldController=new AbortController(),oldChild=new EventEmitter();let oldTerminated=false;
 await old.executePersonalChild(personalChildCommand('/tmp/baseline-expected.json',hash),{signal:oldController.signal,launch:()=>{oldController.abort();queueMicrotask(()=>oldChild.emit('exit',0,null));return oldChild;},terminate:async()=>{oldTerminated=true;return {observed:true,forced:false};}});assert.equal(oldTerminated,false,'removing the post-spawn check must reproduce the lost stop');
});

test('native proof imports stay sealed while the three established collector edges retain separate diagnostic provenance',async()=>{
 const {NATIVE_HARNESS_SOURCE_FILES:files}=await import('./lib/exui-native-sources.mjs'),ts=require('typescript'),root=path.resolve(__dirname,'..');
 const boundary=[['scripts/run-harness-assurance.mjs','scripts/harness-public-odhin-reporter.cjs'],['scripts/run-harness-assurance.mjs','scripts/run-harness-local-aat.cjs'],['scripts/run-harness-shared-nested.mjs','scripts/run-harness-local-aat.cjs']];
 const observed=[];
 for(const file of files.filter(name=>/\.[cm]?js$/.test(name))){
  const source=ts.createSourceFile(file,fs.readFileSync(path.join(root,file),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
  const visit=node=>{
   let literal;
   if(ts.isImportDeclaration(node)||ts.isExportDeclaration(node))literal=node.moduleSpecifier;
   else if(ts.isCallExpression(node)&&(node.expression.kind===ts.SyntaxKind.ImportKeyword||(ts.isIdentifier(node.expression)&&node.expression.text==='require')))literal=node.arguments[0];
   if(literal&&ts.isStringLiteral(literal)&&literal.text.startsWith('.')){
    const target=path.posix.normalize(path.posix.join(path.posix.dirname(file),literal.text));
    if(!files.includes(target)){assert(boundary.some(edge=>edge[0]===file&&edge[1]===target),'unsealed native import: '+file+' -> '+target);observed.push([file,target]);}
   }
   ts.forEachChild(node,visit);
  };visit(source);
 }
 assert.deepEqual(observed.sort(),boundary.slice().sort());
 for(const file of ['scripts/lib/exui-native-report-evidence.mjs','scripts/lib/exui-personal-service-admission.mjs','scripts/lib/exui-candidate-ci-process.mjs','scripts/run-harness-selector-event-row.mjs'])assert(files.includes(file));
 const collector=fs.readFileSync(path.join(root,'scripts/run-harness-local-aat.cjs'),'utf8'),reporter=fs.readFileSync(path.join(root,'scripts/harness-public-odhin-reporter.cjs'),'utf8'),native=fs.readFileSync(path.join(root,'scripts/harness-native-report.cjs'),'utf8');
 assert.match(collector,/const diagnosticSource = Reporter\.captureDiagnosticSource\(\)/);assert.match(collector,/new Reporter\(\{ selection: profile, diagnosticSource/);
 assert.match(reporter,/\["rev-parse", "HEAD"\]/);assert.match(reporter,/\["status", "--porcelain", "--untracked-files=normal"\]/);assert.match(reporter,/diagnosticSource: this\.diagnosticSource/);
 assert.match(reporter,/require\('\.\/harness-personal-service-report\.cjs'\)/);assert.match(native,/require\('\.\/harness-personal-service-report\.cjs'\)/);
 assert(!files.includes('scripts/harness-personal-service-report.cjs'));
});
test('raw main seven plus personal pair without DIVORCE admits exactly one existing row and one report',async t=>{
 const x=await personalAdmissionFixture(t);delete x.f.descriptor.divorceProfileAdmission;delete x.f.descriptor.expected.divorceProfileRequest;x.f.save();
 const evidence=await x.f.read();assert.equal(evidence.divorceProfileAdmission,undefined);assert.equal(evidence.personalServiceAdmission.joint.status,'included');assert.equal(evidence.catalogueCoverage.selected,112);assert.equal(evidence.releaseApproval,false);
 const saved=fs.readFileSync(x.f.descriptorPath);delete x.f.descriptor.personalServiceAdmission;delete x.f.descriptor.expected.personalServiceRequest;x.f.save();const main=await x.f.read();fs.writeFileSync(x.f.descriptorPath,saved);
 assert.equal(evidence.catalogueCoverage.candidate,main.catalogueCoverage.candidate+1);assert.equal(evidence.catalogueCoverage.missing,main.catalogueCoverage.missing-1);assert.equal(evidence.catalogueCoverage.ccd,main.catalogueCoverage.ccd);assert.deepEqual(evidence.phases,main.phases);assert.equal(evidence.catalogueCoverage.creditedObligationIds.filter(id=>id===evidence.personalServiceAdmission.obligationId).length,1);
 const html=require('./harness-native-report.cjs').renderNativeEvidence(evidence);assert.match(html,/Personal-service event row: 1 requirement included/);assert.doesNotMatch(html,/id="harness-divorce-profile-admission"/);
});
test('only actual precreation admission rejection permits BLOCKED main publication; copied error flags cannot authorize it',async()=>{
 const {runPersonalServiceAdmission,isPersonalAdmissionClosedFailure}=await import('./run-harness-personal-service-admission.mjs'),{runAssuranceSequence}=await import('./run-harness-assurance.mjs');let closed;
 try{await runPersonalServiceAdmission({nativeContext:{invalid:true}});}catch(error){closed=error;}
 assert(isPersonalAdmissionClosedFailure(closed));assert(!isPersonalAdmissionClosedFailure(Object.assign(new Error(closed.message),{continuationSafe:true,cleanupComplete:true})));
 for(const error of [closed,Object.assign(new Error('same text'),{continuationSafe:true}),new Error('PERSONAL_SERVICE_CHILD_UNOBSERVED')]){
  let collected=0,withdrawn=0,descriptor=0;
  const result=await runAssuranceSequence({native:async()=>({status:'PASS',exitCode:0,continuationSafe:true}),prepare:()=>{},personal:async()=>{throw error;},descriptor:()=>{descriptor++;return '/owned-main';},collect:async(file,timing)=>{collected++;assert.equal(timing.personalServiceAttempt.status,'BLOCKED');return {status:'passed',exitCode:0};},withdraw:()=>withdrawn++});
  assert.equal(result.exitCode,2);assert.equal(result.personalStatus,'BLOCKED');assert.equal(collected,error===closed?1:0);assert.equal(descriptor,collected);assert.equal(withdrawn,error===closed?0:1);
 }
 const cancelled=AbortSignal.abort();let error;try{await runPersonalServiceAdmission({signal:cancelled});}catch(value){error=value;}assert(!isPersonalAdmissionClosedFailure(error));
});
test('unknown or malformed personal result stops before descriptor and collector',async()=>{
 const {runAssuranceSequence}=await import('./run-harness-assurance.mjs');
 for(const result of [undefined,{status:'passed',reportRequest:true},{status:'passed',reportRequest:{path:'/personal'}},{status:'passed',reportRequest:{path:'relative',digest:hash,runId:'run'}}]){
 let later=0;const value=await runAssuranceSequence({native:async()=>({status:'PASS',exitCode:0,continuationSafe:true}),personal:async()=>result,descriptor:()=>{later++;},collect:()=>{later++;}});assert.equal(value.exitCode,2);assert.equal(value.diagnosticStatus,'not-run');assert.equal(later,0);
 }
});
test('controlled catch-all personal failure would launch collector; real private closure guard rejects it',async()=>{
 const {pathToFileURL}=require('node:url'),root=path.resolve(__dirname,'..');let source=fs.readFileSync(path.join(__dirname,'run-harness-assurance.mjs'),'utf8').replace(/^#![^\n]*\n/,'');
 source=source.replace('if(!isPersonalAdmissionClosedFailure(error))','if(false)').replace('const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");','const ROOT = '+JSON.stringify(root)+';');
 source=source.replace(/(from\s*|import\s*\()(['"])([^'"]+)\2/g,(all,prefix,quote,name)=>prefix+quote+(name.startsWith('.')?pathToFileURL(path.resolve(__dirname,name)).href:name)+quote);
 source=source.replaceAll('fileURLToPath(import.meta.url)',JSON.stringify(path.join(__dirname,'run-harness-assurance.mjs')));
 const old=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64')),current=await import('./run-harness-assurance.mjs');
 for(const [api,expected]of [[current,0],[old,1]]){let collections=0;const r=await api.runAssuranceSequence({native:async()=>({status:'PASS',exitCode:0,continuationSafe:true}),personal:async()=>{throw Object.assign(new Error('pending-create'),{cleanupComplete:true});},descriptor:()=>'/main',collect:async()=>{collections++;return {status:'passed',exitCode:0};}});assert.equal(collections,expected);assert.equal(r.exitCode,2);}
});
test('personal invocation telemetry uses held pair identities and hashed configured worker slots, with missing historical config unknown',async t=>{
 const x=await personalAdmissionFixture(t);let packet=x.m.readPersonalAdmissionPacket(x.requestPath,x.pin);
 assert.deepEqual(packet.admission.invocations,['baseline','optional'].map(variant=>({invocationId:variant,runId:x.p.bindings[variant].runId,configuredWorkers:null})));
 const reportFile=path.join(x.root,'baseline/baseline/report.json'),completionFile=path.join(x.root,'baseline-completion.json');
 const saveWorkers=workers=>{const report=read(reportFile);report.config={workers};x.write(reportFile,report);const completion=read(completionFile);completion.files=x.b.personalFiles(path.join(x.root,'baseline'),x.b.PERSONAL_FINAL_FILES);const request=read(x.requestPath);request.expected.invocations.baseline.completionDigest=x.write(completionFile,completion);return {runId:request.expected.runId,digest:x.write(x.requestPath,request)};};
 let pin=saveWorkers(2);packet=x.m.readPersonalAdmissionPacket(x.requestPath,pin);assert.deepEqual(packet.admission.invocations,[{invocationId:'baseline',runId:x.p.bindings.baseline.runId,configuredWorkers:2},{invocationId:'optional',runId:x.p.bindings.optional.runId,configuredWorkers:null}]);
 for(const value of [0,-1,1.5,'2',null]){pin=saveWorkers(value);assert.throws(()=>x.m.readPersonalAdmissionPacket(x.requestPath,pin),/PERSONAL_SERVICE_CONFIGURED_WORKERS/);}
 pin=saveWorkers(2);const report=read(reportFile);report.config.workers=3;x.write(reportFile,report);assert.throws(()=>x.m.readPersonalAdmissionPacket(x.requestPath,pin),'changed report without held completion pin must reject');
});
