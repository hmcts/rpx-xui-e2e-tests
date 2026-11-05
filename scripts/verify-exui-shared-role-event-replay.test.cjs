const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const {createHash} = require('node:crypto');
const digest = value => 'sha256:' + createHash('sha256').update(value).digest('hex');
const scope = 'exui-ccd-event-capability-pilot';
const names = ['courtadmin-read','readonly-read','courtadmin-cell','readonly-update'];
const faults = ['ccd-remove-courtadmin-recipient-read','ccd-remove-readonly-recipient-read','ccd-remove-courtadmin-event-create','ccd-enable-readonly-recipient-update'];
function recipients(channel, count, changed) {
 return Array.from({length:count},(_,i)=>({id:`46e2ff95-4689-42ea-b38c-d3b9204572b${i}`,value:channel==='email'?{serveByPostOrEmail:'email',emailInformation:{emailName:`Synthetic read recipient ${i+1}`,emailAddress:changed=== 'courtadmin'?`courtadmin-edited-${i+1}@harness.example.com`:changed==='readonly'?`readonly-change-${i+1}@harness.example.com`:`read-recipient-${i+1}@harness.example.com`}}:{serveByPostOrEmail:'post',postalInformation:{postalName:`Synthetic postal read ${i+1}`,postalAddress:{AddressLine1:changed==='courtadmin'?`Synthetic courtadmin edited street ${i+1}`:changed==='readonly'?`Synthetic readonly changed street ${i+1}`:`Synthetic read street ${i+1}`,AddressLine2:null,AddressLine3:null,PostTown:null,County:null,PostCode:['SW1A 1AA','M1 1AA'][i],Country:null}}}}));
}
const roles = name=>['caseworker','caseworker-harness',`caseworker-privatelaw-${name}`];
const personas = {credentials:Object.fromEntries(['courtadmin','readonly','allowed','judge','observer'].map(name=>[name,{userId:'unit-'+name,roles:roles(name)}]))};
function inputs(invocationId='baseline') {
 const identity={webappCommit:'1'.repeat(40),artifactDigest:digest('artifact'),dependencyLockDigest:digest('lock'),toolkitVersion:'7.4.25',toolkitDigest:digest('toolkit'),configurationDigest:digest('config'),definitionDigests:{HarnessNestedPRL:digest('definition')},dependencyIdentities:{ccd:{artifactDigest:digest('ccd'),apiContractDigest:digest('api')}}};
 const manifest={schemaVersion:1,runId:'unit-event',harnessCommit:'2'.repeat(40),releaseScopeId:scope,policyDigest:digest('policy'),requiredObligationIds:['event-role-policy'],identity,runtimeMetadata:{harnessSourceState:'clean',harnessSourceDigest:digest('source'),definitionImportDigest:digest('import'),observedDefinitionDigest:digest('observed'),definitionVersion:'1',ccdNamespace:'unit-event'}};
 const context={...Object.fromEntries(['runId','harnessCommit','releaseScopeId','policyDigest','identity'].map(key=>[key,manifest[key]])),invocationId,harnessSourceState:'clean',harnessSourceDigest:digest('source')};return {manifest,context};
}
function observations(name, fault=false) {
 return ['email','post'].flatMap(channel=>[1,2].map((count,index)=>{
 const original=recipients(channel,count), isRead=name.endsWith('-read'), court=name==='courtadmin-cell', persona=name.startsWith('readonly')?'readonly':'courtadmin';
 const caseId='12345678901234'+(channel==='email'?'0':'1')+index;
 const control=isRead?'synthetic-courtadmin-read-control':court?'synthetic-courtadmin-original':'synthetic-readonly-update-control';
 const data=court?{protectedValue:control,sodAdditionalRecipientsList:[]}:{protectedValue:control,sodAdditionalRecipients:['additionalRecipients'],sodAdditionalRecipientsList:original};
 const before={state:{id:Number(caseId),case_type_id:'HarnessNestedPRL',jurisdiction:'HARNESS',state:'JUDICIAL_REVIEW',version:0,case_data:data},history:[{id:'create',audit:'unchanged'}]};
 const result={scenario:channel+'-'+count,caseId,actor:{id:'unit-'+persona,roles:roles(persona)},before,after:structuredClone(before),caseViewStatus:200,protectedValue:control,controlVisible:true};
 const markers=rows=>rows.map(({value:v})=>[v.emailInformation?.emailName,v.emailInformation?.emailAddress,v.postalInformation?.postalName,v.postalInformation?.postalAddress.AddressLine1,v.postalInformation?.postalAddress.PostCode].filter(x=>typeof x==='string').map(marker=>({marker,visible:true})));
 const view=rows=>({markerVisibility:markers(rows),caseViewStatus:200,protectedValue:control,controlVisible:true,recipientFields:[{id:'sodAdditionalRecipientsList',value:rows}],projected:rows,visible:Array(count).fill(true)});
 if(isRead) return {...result,...view(original),recipientFields:fault?[]:view(original).recipientFields,projected:fault?null:original,expectedRecipients:original.map(r=>r.value),visible:Array(count).fill(!fault),markerVisibility:markers(original).map(list=>list.map(m=>({...m,visible:!fault})))};
 const changed=recipients(channel,count,court?'courtadmin':'readonly'),submittedData={sodAdditionalRecipients:['additionalRecipients'],sodAdditionalRecipientsList:changed};
 const allowed=court?!fault:fault;
 if(allowed) {result.after.state.case_data={...data,...submittedData};result.after.state.version++;result.after.history.unshift({id:'serviceOfDocuments'});}
 const triggers=allowed?[{id:'serviceOfDocuments',name:'Service of documents'}]:[];
 if(court) return {...result,expectedValues:changed.map(r=>r.value),eventTriggers:triggers,formCompleted:allowed,startStatus:allowed?200:404,submitStatus:allowed?201:404,submittedData,csrfHeaderPresent:allowed,csrfHeaderDigest:allowed?digest('csrf'):null,readback:allowed?view(changed):null};
 return {...result,actor:{id:'unit-readonly',roles:roles('readonly')},sessionUser:{id:'unit-readonly',roles:roles('readonly')},eventId:'serviceOfDocuments',caseTriggers:triggers,menuOptions:allowed?['Select an event','Service of documents']:['Select an event'],eventTriggers:triggers,eventOptions:allowed?['Service of documents']:[],startStatus:allowed?200:404,legacyTokenStatus:200,eventTokenPresent:true,submitStatus:allowed?201:404,intendedData:{...data,...submittedData},submittedData,recipientFields:view(original).recipientFields,projected:original,visible:Array(count).fill(true),markerVisibility:markers(original)};
 }));
}
async function fixture(name='courtadmin-read',fault=false) {
 const lib=await import('./lib/exui-shared-role-event-observations.mjs');
 const {manifest,context}=inputs(fault?faults[names.indexOf(name)]:'baseline');
 const value=lib.sharedRoleEventEnvelope(name,observations(name,fault),manifest,context,personas);
 const requests=value.observations.flatMap(item=>[
  {method:'GET',upstreamPath:`/internal/cases/${item.caseId}`,actorId:item.actor.id,status:200},
  ...(!name.endsWith('-read')?[{method:'GET',upstreamPath:`/internal/cases/${item.caseId}/event-triggers/serviceOfDocuments`,actorId:item.actor.id,status:item.startStatus},{method:'POST',upstreamPath:`/cases/${item.caseId}/events`,actorId:item.actor.id,status:item.submitStatus}]:[]),
 ]).map(item=>({...item,mutation:null}));
 const replay=v=>lib.replaySharedRoleEventObservation(v,{name,manifest,context,personas,requests});
 return {lib,value,replay,manifest,context,requests};
}
test('exact role event files are separated from classic CCD files and sealed in execution evidence',async t=>{
 const lib=await import('./lib/exui-shared-role-artifacts.mjs');
 const expected=['manifest.json','context.json','personas.json','ccd-requests.jsonl',...names.map(n=>n+'-observation.json')];
 assert.deepEqual(lib.sharedRoleArtifactNames('baseline',scope),expected);
 assert.deepEqual(lib.sharedRoleArtifactNames('ccd-enable-judge-event',scope),[]);
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'event-role-refs-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));fs.mkdirSync(path.join(root,'baseline'));
 for(const n of expected)fs.writeFileSync(path.join(root,'baseline',n),'{}');
 const execution={invocationId:'baseline',sharedRoleArtifacts:lib.captureSharedRoleArtifacts(root,'baseline',scope)};
 assert.equal(lib.readSharedRoleArtifact(root,execution,'courtadmin-read-observation.json',scope).toString(),'{}');
 fs.writeFileSync(path.join(root,'baseline','courtadmin-read-observation.json'),'{"changed":true}');
 assert.throws(()=>lib.readSharedRoleArtifact(root,execution,'courtadmin-read-observation.json',scope),/ARTIFACT_DIGEST_MISMATCH/);
 assert.throws(()=>lib.readSharedRoleArtifact(root,{...execution,sharedRoleArtifacts:execution.sharedRoleArtifacts.slice(1)},'personas.json',scope),/SHARED_ROLE_EXECUTION_ARTIFACT_SELECTION/);
});
for(const name of names)for(const fault of [false,true])test(`${name}: all four source shapes independently replay ${fault?'effective fault':'baseline'}`,async()=>{
 const f=await fixture(name,fault);const result=f.replay(f.value);assert.equal(result.checkedShapes,4);assert.equal(result.catalogueCredit,false);
});
test('actor projection cannot retain tokens or arbitrary identity fields',async()=>{
 const {lib}=await fixture();const result=lib.sharedRoleEventActor({uid:'unit-courtadmin',roles:roles('courtadmin'),token:'secret',email:'secret'});
 assert.deepEqual(result,{id:'unit-courtadmin',roles:roles('courtadmin')});assert(!JSON.stringify(result).includes('secret'));
});
const changes=[
 ['missing shape',v=>v.observations.pop()],['duplicate shape',v=>v.observations[1]=v.observations[0]],['wrong case identity',v=>v.observations[0].before.state.id=1234567890123999],
 ['wrong source case type',v=>v.observations[0].before.state.case_type_id='Other'],['wrong jurisdiction',v=>v.observations[0].before.state.jurisdiction='OTHER'],
 ['wrong actor',v=>v.observations[0].actor.id='unit-allowed'],['extra actor role',v=>v.observations[0].actor.roles.push('admin')],['wrong observer',v=>v.observerId='unit-courtadmin'],
 ['other import',v=>v.binding.definitionImportDigest=digest('other')],['self-reported expected values',v=>{v.observations[0].expectedRecipients=[];v.observations[0].projected=[];}],
 ['missing visibility',v=>v.observations[0].visible=[false]],['hidden healthy control',v=>v.observations[0].controlVisible=false],['read modified state',v=>v.observations[0].after.state.version++],
 ['unbound field projection',v=>v.observations[0].recipientFields[0].value=[]],['reused case across shapes',v=>{v.observations[1].caseId=v.observations[0].caseId;}],
];
for(const [name,change] of changes)test(`read replay rejects ${name}`,async()=>{const f=await fixture();change(f.value);assert.throws(()=>f.replay(f.value));});
for(const [name,change] of [
 ['history-only write',v=>v.observations[0].after.state.case_data=v.observations[0].before.state.case_data],
 ['wrong persisted value',v=>v.observations[0].after.state.case_data.sodAdditionalRecipientsList[0].value.emailInformation.emailAddress='wrong'],
 ['hidden nonempty branch',v=>v.observations[0].after.state.case_data.sodAdditionalRecipientsList[0].value.postalInformation={postalName:'must-not-hide'}],
 ['lost sibling',v=>v.observations[1].after.state.case_data.sodAdditionalRecipientsList.pop()],
 ['duplicate assigned id',v=>v.observations[1].after.state.case_data.sodAdditionalRecipientsList[1].id=v.observations[1].after.state.case_data.sodAdditionalRecipientsList[0].id],
 ['unrelated protected write',v=>v.observations[0].after.state.case_data.protectedValue='changed'],
 ['altered prior audit',v=>v.observations[0].after.history[1].audit='changed'],
 ['missing readback',v=>delete v.observations[0].readback],['invisible persisted values',v=>v.observations[0].readback.visible=[false]],
])test(`allowed update replay rejects ${name}`,async()=>{const f=await fixture('courtadmin-cell');change(f.value);assert.throws(()=>f.replay(f.value));});
for(const name of names)test(`${name}: ineffective mutation cannot pass replay`,async()=>{const f=await fixture(name,true);f.value.observations=observations(name,false);assert.throws(()=>f.replay(f.value));});
test('readonly denial rejects a changed state even when HTTP and menu deny',async()=>{const f=await fixture('readonly-update');f.value.observations[0].after.state.case_data.protectedValue='written';assert.throws(()=>f.replay(f.value));});
test('legacy arrays and caller-complete flags cannot replace fresh bound observations',async()=>{const f=await fixture();assert.throws(()=>f.replay(f.value.observations));assert.throws(()=>f.replay({...f.value,complete:true}));});

test('token-like actor fields cannot enter the sealed envelope or replay',async()=>{const f=await fixture();f.value.observations[0].actor.token='never-retain';assert.throws(()=>f.lib.sharedRoleEventEnvelope(f.value.name,f.value.observations,f.manifest,f.context,personas),/SHARED_ROLE_EVENT_CREDENTIAL_FIELD/);assert.throws(()=>f.replay(f.value),/SHARED_ROLE_EVENT_CREDENTIAL_FIELD/);});

for(const [name,change] of [['missing request',r=>r.pop()],['other actor bearer',r=>r[0].actorId='unit-allowed'],['wrong status',r=>r[0].status=500],['missing actor',r=>delete r[0].actorId],['transport mutation',r=>r[0].mutation='unreviewed']])test(`journal rejects ${name}`,async()=>{const f=await fixture();change(f.requests);assert.throws(()=>f.replay(f.value));});

test('hidden read fault rejects a partial marker leak even when recipient aggregate stays false',async()=>{const f=await fixture('courtadmin-read',true);f.value.observations[0].markerVisibility[0][0].visible=true;assert.throws(()=>f.replay(f.value),/SHARED_ROLE_EVENT_MARKER_VISIBILITY/);});

test('standard event execution seals observation bytes and rejects classic-scope substitution',async t=>{
 const {writeRunBundle}=require('./fixtures/exui-evidence-bundle.mock.cjs');
 const io=await import('./lib/exui-evidence-io.mjs'),{getReleasePolicy}=await import('./lib/exui-release-policy.mjs');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'event-role-receipt-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const policy=getReleasePolicy(scope),bundle=writeRunBundle(root,policy),ref=bundle.run.executionArtifacts[0];
 const execution=JSON.parse(fs.readFileSync(path.join(root,ref.path))),dir=path.join(root,execution.invocationId);fs.mkdirSync(dir,{recursive:true});
 const observation=execution.invocationId+'/courtadmin-read-observation.json';fs.writeFileSync(path.join(root,observation),'{}');
 execution.sharedRoleArtifacts=[{path:observation,digest:digest('{}')}];
 fs.writeFileSync(path.join(root,ref.path),JSON.stringify(execution));ref.digest=digest(JSON.stringify(execution));
 assert(io.readExecutionEvidence(root,ref,bundle.run.manifest,policy).references.some(item=>item.path===observation));
 assert.throws(()=>io.readExecutionEvidence(root,ref,{...bundle.run.manifest,releaseScopeId:'exui-ccd-pilot'},policy),/INVALID_SHARED_ROLE_ARTIFACT_SELECTION/);
 fs.writeFileSync(path.join(root,observation),'{"changed":true}');
 assert.throws(()=>io.readExecutionEvidence(root,ref,bundle.run.manifest,policy),/ARTIFACT_DIGEST_MISMATCH/);
});

test('actual case-view capture waits for control and every marker before observing visibility',async()=>{
 const ts=require('typescript'), source=fs.readFileSync(path.join(__dirname,'../src/fixtures/harnessCcdEvent.ts'),'utf8');
 const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}});
 const exports={}, library=await import('./lib/exui-shared-role-event-observations.mjs');
 new Function('require','exports',compiled.outputText)(name=>name.startsWith('node:')?require(name):name==='./harnessCcd'?{}:library,exports);
 const rows=recipients('email',2,'courtadmin'),control='synthetic-courtadmin-original',caseId='1234567890123456',calls=[],rendered=new Set();
 const response={status:()=>200,json:async()=>{throw Error('ABORTED_BROWSER_RESPONSE');},request:()=>({method:()=> 'GET'}),url:()=>`http://127.0.0.1:3100/data/internal/cases/${caseId}`};
 const evaluate=async(fn,id,status=200)=>{const original=global.fetch;global.fetch=async(target,options)=>{assert.equal(target,`/data/internal/cases/${caseId}`);assert.equal(options.credentials,'same-origin');assert(options.signal);calls.push('fresh-readback');return {status,json:async()=>({tabs:[{fields:[{id:'protectedValue',value:control},{id:'sodAdditionalRecipientsList',value:rows}]}]})};};try{return await fn(id);}finally{global.fetch=original;}};
 const page={waitForResponse:async predicate=>{assert(predicate(response));return response;},goto:async target=>assert.equal(target,`/cases/case-details/HARNESS/HarnessNestedPRL/${caseId}`),evaluate,getByText:(marker,options)=>{assert.deepEqual(options,{exact:true});return {waitFor:async options=>{assert.deepEqual(options,{state:'visible'});calls.push('wait:'+marker);rendered.add(marker);},isVisible:async()=>{calls.push('read:'+marker);return rendered.has(marker);}};}};
 const observed=await exports.observeCcdEventReadback(page,caseId,rows.map(row=>row.value));
 assert.equal(observed.controlVisible,true);assert.deepEqual(observed.visible,[true,true]);assert.deepEqual(observed.projected,rows);
 assert(calls.indexOf('fresh-readback')<calls.indexOf('wait:'+control));
 await assert.rejects(()=>exports.observeCcdEventReadback({...page,evaluate:(fn,id)=>evaluate(fn,id,403)},caseId,rows.map(row=>row.value)),/CCD_READBACK_STATUS/);
 for(const marker of [control,...rows.flatMap(row=>[row.value.emailInformation.emailName,row.value.emailInformation.emailAddress])])assert(calls.indexOf('wait:'+marker)<calls.indexOf('read:'+marker));
 assert(observed.markerVisibility.flat().every(item=>item.visible));
});

test('shared fixture preserves source-shape and judge observation formats outside role envelope selection',async()=>{
 const ts=require('typescript'),source=fs.readFileSync(path.join(__dirname,'../src/fixtures/harnessCcdEvent.ts'),'utf8');
 const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}),exports={},writes=[];
 const library=await import('./lib/exui-shared-role-event-observations.mjs');
 const fakeFs={writeFileSync:(file,bytes,options)=>writes.push({file,value:JSON.parse(bytes),options}),readFileSync:()=>{throw Error('NON_ROLE_CONTEXT_READ');}};
 new Function('require','exports','process',compiled.outputText)(name=>name==='node:fs'?fakeFs:name.startsWith('node:')?require(name):name==='./harnessCcd'?{}:library,exports,{env:{EXUI_CCD_EVIDENCE:'/private/unit-observation'}});
 const selected=['event-capability','source-shape-required-delivery-radio','source-shape-conditional-email-complex','source-shape-optional-postal-line-two'];
 for(const name of selected)exports.saveCcdEventObservation(name,[{sourceShape:name}]);
 assert.deepEqual(writes,selected.map(name=>({file:`/private/unit-observation/${name}-observation.json`,value:[{sourceShape:name}],options:{mode:0o600,flag:'wx'}})));
});
