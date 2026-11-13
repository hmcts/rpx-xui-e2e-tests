const {test}=require('node:test'),assert=require('node:assert/strict');
const api=require('./lib/exui-business-scalar-detail.cjs'),mock=require('./fixtures/exui-business-scalar-detail.mock.cjs');
const attachment=value=>({name:api.attachmentName,contentType:api.contentType,body:Buffer.from(JSON.stringify(value))});
test('nested count stays one while actual email child disappears, expected literals stay independent',()=>{
 for(const [proof,email,present,state]of [['ccd-nested-roundtrip',mock.child,true,'nonempty'],['ccd-child-loss',{},false,'absent'],['ccd-child-loss',{emailAddress:null},true,'null'],['ccd-child-loss',{emailAddress:''},true,'empty']]){
  const c=api.createCapture(proof,mock.binding);c.nestedEmpty(mock.empty);c.nestedPopulated(mock.nested(email));const raw=c.finish(),got=api.extractAttachment(proof,mock.binding,[attachment(raw)]);
  assert.equal(got.scalars.recipientCount.value,1);assert.equal(got.scalars.emailAddressPresent.value,present);assert.equal(got.scalars.emailAddressState.value,state);assert(!JSON.stringify(got).includes('PRIVATE'));
  const methods=api.methods(proof);assert.equal(methods.find(r=>r[0]==='recipientCount')[2],1);assert.equal(methods.find(r=>r[0]==='emailAddressPresent')[2],true);
 }
 const c=api.createCapture('ccd-nested-roundtrip',mock.binding);c.nestedPopulated({state:{case_data:{sodAdditionalRecipientsList:[{value:{}},{value:{}}]}}});assert.equal(c.finish().detail.scalars.recipientCount.value,2);
});
test('IA mismatch is actual measured enum set, later query Not reached; missing response is No observation',()=>{
 const c=api.createCapture('wa-scope-broadened',mock.binding);c.record('visibleServices',['IA','CIVIL']);const d=c.finish().detail;assert.deepEqual(d.scalars.visibleServices.value,['IA','CIVIL']);assert.deepEqual(d.scalars.requestServices,{state:'not-reached'});assert.deepEqual(d.scalars.responseStatus,{state:'not-reached'});
 const b=api.createCapture('wa-org-scope-ia',mock.binding);b.attempt(['responseStatus']);const value=b.finish().detail;assert.deepEqual(value.scalars.responseStatus,{state:'no-observation'});assert(!JSON.stringify(value).includes('200'));
 const h=api.createCapture('wa-org-scope-ia',mock.binding);for(const[k,v]of Object.entries(mock.scope))h.record(k,v);assert.equal(h.finish().detail.scalars.responseStatus.value,200);
 const f=api.createCapture('wa-org-scope-ia',mock.binding);f.record('responseStatus',500);assert.equal(f.finish().detail.scalars.responseStatus.value,500);
});
test('duplicate foreign malformed oversized path and missing attachments never publish raw payload',()=>{
 const c=api.createCapture('wa-org-scope-ia',mock.binding);c.record('visibleServices',['IA']);const raw=c.finish(),good=attachment(raw);
 for(const list of [[],[good,good],[{...good,path:'/PRIVATE_PATH'}],[{...good,body:Buffer.alloc(9000)}],[{...good,contentType:'text/plain'}],[attachment({...raw,proofId:'ccd-child-loss'})],[attachment({...raw,binding:{...mock.binding,testId:'foreign'}})],[attachment({...raw,binding:{...mock.binding,retry:1}})],[attachment({...raw,binding:{...mock.binding,invocationId:'foreign'}})],[attachment({...raw,binding:{...mock.binding,runId:'foreign'}})],[attachment({...raw,extra:'PRIVATE_TOKEN'})]]){const d=api.extractAttachment('wa-org-scope-ia',mock.binding,list);assert.equal(d.availability,'unavailable');assert(!JSON.stringify(d).includes('PRIVATE'));}
 assert.equal(api.extractAttachment('wa-org-scope-civil',mock.binding,[good]),undefined);
});
test('unknown values fields and late mutation cannot become expected defaults or forged public scalars',()=>{
 for(const[key,value]of [['recipientCount',-1],['recipientCount',1.2],['recipientCount',33],['submitStatus',0],['responseStatus',999],['visibleServices',['IA','IA']],['visibleServices',['PRIVATE_SERVICE']],['providerCodes',['PRIVATE_CODE']]]){
  const proof=key.includes('Services')||key==='responseStatus'||key==='providerCodes'?'wa-org-scope-ia':'ccd-child-loss',c=api.createCapture(proof,mock.binding);c.record(key,value);assert.equal(c.finish().detail.availability,'unavailable');
 }
 const c=api.createCapture('ccd-child-loss',mock.binding);c.record('recipientCount',1);c.record('recipientCount',1);assert.equal(c.finish().detail.availability,'unavailable');
 const d=api.createCapture('wa-org-scope-ia',mock.binding),input=['IA'];d.record('visibleServices',input);input.push('PRIVATE_VALUE');const first=d.finish();assert.deepEqual(first.detail.scalars.visibleServices.value,['IA']);d.record('requestServices',['IA']);assert.equal(d.finish().detail.availability,'unavailable');assert.deepEqual(first.detail.scalars.requestServices,{state:'not-reached'});
 const forged=structuredClone(first.detail);forged.expectedRecipientCount=2;assert.equal(api.readDetail('wa-org-scope-ia',forged).availability,'unavailable');
});

test('provider poll preserves last actual finite sample before failure without inventing status or exposing raw strings',()=>{
 const c=api.createCapture('wa-org-scope-ia',mock.binding);c.attempt(['providerCodes']);c.providerPoll([]);assert.deepEqual(c.finish().detail.scalars.providerCodes,{state:'no-observation'});
 const d=api.createCapture('wa-org-scope-ia',mock.binding);d.attempt(['providerCodes']);d.providerPoll([['AAA6']]);d.providerPoll([['BFA1']]);assert.deepEqual(d.finish().detail.scalars.providerCodes.value,['BFA1']);
 const latest=api.createCapture('wa-org-scope-ia',mock.binding);latest.providerPoll([['BFA1']]);latest.providerPoll([]);assert.deepEqual(latest.finish().detail.scalars.providerCodes,{state:'no-observation'});
 const e=api.createCapture('wa-org-scope-ia',mock.binding);e.providerPoll([['PRIVATE_CODE']]);assert.equal(e.finish().detail.availability,'unavailable');
 const no=api.createIaCapture('CIVIL','wa-scope-broadened',mock.binding);no.record('visibleServices',['CIVIL']);assert.equal(no.publish({attach(){throw Error('CIVIL_MUST_NOT_ATTACH');}}) instanceof Promise,true);
});

test('passed partial and early scope failure with fabricated later query observations are unavailable',()=>{
 const c=api.createCapture('wa-org-scope-ia',mock.binding);c.record('visibleServices',['IA']);assert.equal(api.readDetail('wa-org-scope-ia',c.finish().detail,{status:'passed'}).availability,'unavailable');
 const good=mock.recorded('wa-scope-broadened');assert.equal(api.readDetail('wa-scope-broadened',good,{status:'failed',failureId:'organisation-scope'}).availability,'recorded');good.scalars.responseStatus={state:'recorded',value:200};assert.equal(api.readDetail('wa-scope-broadened',good,{status:'failed',failureId:'organisation-scope'}).availability,'unavailable');
});

test('fixed same-reader child joins seven raw scalar rows with no CLI args or resource side effects',async t=>{
 const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process'),f=await require('./fixtures/exui-native-report-packet.mock.cjs').fixture(t,{businessScalars:true});
 const reader=await import('./lib/exui-native-report-evidence.mjs'),evidence=await reader.readNativeReportEvidence(f.descriptorPath),held={path:f.descriptorPath,digest:evidence.descriptorDigest};
 const snapshot=dir=>fs.readdirSync(dir).sort().flatMap(name=>{const file=path.join(dir,name);return fs.statSync(file).isDirectory()?snapshot(file):[[file,crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')]];});const before=snapshot(f.directory),spawn=cp.spawnSync;let count=0,resources;
 try{cp.spawnSync=(command,args,options)=>{count++;assert.equal(command,process.execPath);assert.deepEqual(args.slice(0,2),['--input-type=module','--eval']);assert.equal(args.length,3);assert(!options.shell);assert.equal(options.env.NODE_OPTIONS,undefined);assert.equal(options.env.NODE_DISABLE_COMPILE_CACHE,'1');assert.equal(options.timeout,20*1000);assert.equal(options.maxBuffer,32*1024);assert(Buffer.byteLength(options.input)<=32*1024);
 const result=spawn(command,[...args.slice(0,2),args[2]+";process.stderr.write(JSON.stringify({resourceTypes:process.getActiveResourcesInfo(),argvLength:process.argv.length}));"],options);const observed=JSON.parse(result.stderr);assert.equal(observed.argvLength,1);resources=observed.resourceTypes;assert(!resources.some(name=>/TCP|UDP|PROCESS|MESSAGEPORT/i.test(name)));return result;};api.assertHeldProjection(held,evidence);}finally{cp.spawnSync=spawn;}
 assert.equal(count,1);assert.deepEqual(snapshot(f.directory),before);assert.equal(api.scalarProjection(evidence).rows.length,7);assert(Array.isArray(resources));
 assert.deepEqual(Object.keys(api.scalarProjection(evidence).source).sort(),['harnessCommit','harnessSourceDigest','candidateArtifactDigest','webappCommit'].sort());
 assert.throws(()=>api.scalarProjection({...evidence,source:{...evidence.source,unexpectedAuthority:true}}),/BUSINESS_SCALAR_SOURCE/);
 t.diagnostic(JSON.stringify({fixedChildInvocations:count,argvLength:1,resourceTypes:resources,ownedFixtureBytesUnchanged:true,rawReplayPhases:['scope','ccd']}));
 if(process.env.SELF_CHECK_COMPAT_NODE20){
  const code=`const assert=require('node:assert/strict'),cp=require('node:child_process');let calls=0;cp.spawnSync=()=>{calls++;throw Error('NO_NODE20_CHILD');};const api=require(${JSON.stringify(path.join(__dirname,'lib/exui-business-scalar-detail.cjs'))}),v=JSON.parse(require('node:fs').readFileSync(0,'utf8'));api.assertHeldProjection(v.held,v.evidence,{retiringPreviousRun:true});assert.equal(api.readDetail('ccd-child-loss',undefined),undefined);assert.throws(()=>api.assertHeldProjection(v.held,v.evidence),/^Error: PUBLIC_BUSINESS_SCALAR_RAW_INVALID$/);assert.equal(calls,0);console.log(JSON.stringify({node:process.version,childCalls:calls}));`;
  const result=JSON.parse(cp.execFileSync(process.env.SELF_CHECK_COMPAT_NODE20,['-e',code],{input:JSON.stringify({held,evidence}),encoding:'utf8'}));assert.match(result.node,/^v20\./);assert.equal(result.childCalls,0);t.diagnostic(JSON.stringify(result));
 }

 for(const change of [v=>v.jobRunId='ci-00000000-0000-4000-8000-000000000000',v=>v.source.webappCommit='f'.repeat(40),v=>v.phases.find(p=>p.phase==='ccd').baselineProofs.find(p=>p.proofId==='ccd-nested-roundtrip').invocationId='foreign']){const changed=structuredClone(evidence);change(changed);assert.throws(()=>api.assertHeldProjection(held,changed),/^Error: PUBLIC_BUSINESS_SCALAR_RAW_INVALID$/);}
 const noOutput=()=>({status:0,signal:null,stdout:'{"schemaVersion":1,"ok":true,"projection":{},"extra":"PRIVATE"}',stderr:'PRIVATE'});try{cp.spawnSync=noOutput;assert.throws(()=>api.assertHeldProjection(held,evidence),/^Error: PUBLIC_BUSINESS_SCALAR_RAW_INVALID$/);cp.spawnSync=()=>({error:Error('PRIVATE'),status:null,signal:'SIGKILL',stdout:'',stderr:'PRIVATE'});assert.throws(()=>api.assertHeldProjection(held,evidence),/^Error: PUBLIC_BUSINESS_SCALAR_RAW_INVALID$/);}finally{cp.spawnSync=spawn;}
});


test('denial display uses actual status marker and state observations with constant expected literals',()=>{
 for(const [proof,status,marker,unchanged]of [['ccd-role-policy',403,false,true],['ccd-access-broadened',200,true,null],['ccd-write-then-deny',403,false,false]]){
  const observed=mock.denialObservation(proof),value=api.projectDenialObservation(proof,observed);api.validateDetail(proof,value);assert.throws(()=>api.createCapture(proof,mock.binding),/BUSINESS_SCALAR_CAPTURE_ID/,'denial is read-only projection, not a new producer channel');
  assert.deepEqual(value.scalars.deniedReadStatus,{state:'recorded',value:status});assert.deepEqual(value.scalars.protectedMarkerPresent,{state:'recorded',value:marker});
  assert.deepEqual(value.scalars.deniedWriteStatus,unchanged===null?{state:'not-reached'}:{state:'recorded',value:403});assert.deepEqual(value.scalars.stateUnchanged,unchanged===null?{state:'not-reached'}:{state:'recorded',value:unchanged});
  const expected=Object.fromEntries(api.methods(proof).map(([key,_label,want])=>[key,want]));assert.deepEqual(expected,{deniedReadStatus:[403,404],protectedMarkerPresent:false,deniedWriteStatus:[403,404],stateUnchanged:true});
  assert(!JSON.stringify(value).includes('PRIVATE'));assert(!JSON.stringify(value).includes('case_data'));assert(!JSON.stringify(value).includes('history'));
 }
});
test('denial display never invents attempted write observations or accepts malformed raw scalars',()=>{
 for(const mutate of [v=>delete v.deniedRead,v=>v.deniedRead=600,v=>v.deniedReadResponse.status=404,v=>delete v.deniedWrite,v=>delete v.after]){
  const observed=mock.denialObservation('ccd-role-policy');mutate(observed);assert.throws(()=>api.projectDenialObservation('ccd-role-policy',observed));
 }
 const value=api.projectDenialObservation('ccd-access-broadened',mock.denialObservation('ccd-access-broadened'));assert.throws(()=>api.validateDetail('ccd-access-broadened',{...value,scalars:{...value.scalars,privateBody:{state:'recorded',value:'PRIVATE'}}}));
 assert.throws(()=>api.projectDenialObservation('undeclared-proof',mock.denialObservation('ccd-role-policy')));
});


test('actual denial reporter leaves sealed-role transport absent while original attachment channels remain strict',async t=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),root=fs.mkdtempSync(path.join(os.tmpdir(),'denial-caller-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const contextPath=path.join(root,'context.json');fs.writeFileSync(contextPath,JSON.stringify({runId:'unit',invocationId:'baseline'}));
 for(const[proofId,failureId]of [['ccd-role-policy',null],['ccd-access-broadened','denied-data-isolation'],['ccd-write-then-deny','denied-state-integrity'],['ccd-nested-roundtrip',null],['wa-org-scope-ia',null]]){
  const report=await mock.emitActualDenialReport({contextPath,reportPath:path.join(root,'report.json'),tests:[{proofId,status:failureId?'failed':'passed',failureId}],status:failureId?'failed':'passed'}),row=report.tests[0];
  assert.equal(row.failureId,failureId);assert.equal(row.unattributedErrors,0);assert.deepEqual(report.globalErrors,[]);
  if(proofId==='ccd-nested-roundtrip'||proofId==='wa-org-scope-ia')assert.equal(row.businessScalars.availability,'unavailable');else assert.equal(Object.hasOwn(row,'businessScalars'),false);
 }
});
