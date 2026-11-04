const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {test}=require('node:test');
const hash=c=>'sha256:'+c.repeat(64);
async function fixture(){
 const contract=await import('./lib/exui-recipient-callback-contract.mjs'),api=await import('./lib/exui-recipient-callback-transition.mjs');
 const states=['a','b'].map(c=>({ready:true,owner:'harness-'+c.repeat(16),namespace:c.repeat(64),images:{data:{id:hash('1')},definition:{id:hash('2')}}}));
 const definitions=['baseline','binding-omitted'].map((variant,i)=>({kind:'native-recipient-callback-definition',releaseScopeId:contract.CALLBACK_SCOPE,variant,...states[i],fixtureDigest:contract.callbackCanonicalImport(variant).seal.workbookDigest,sourceBinding:contract.callbackCanonicalImport(variant).binding,observedDefinitionDigest:hash('3'),observedPagesDigest:hash(i?'5':'4'),definitionVersion:1}));
 const input={runId:'ccd-11111111-1111-4111-8111-111111111111',releaseScopeId:contract.CALLBACK_SCOPE,ccd:states[0],definition:definitions[0],definitionImportDigest:hash('6'),apiContracts:{data:hash('7'),definition:hash('8')}};
 const credentials=Object.fromEntries(['allowed','courtadmin','judge','observer','readonly'].map((persona,i)=>[persona,{userId:`${String(i+1).repeat(8)}-1111-4111-8111-111111111111`,headers:{Authorization:'Bearer synthetic-'+persona},roles:['caseworker','caseworker-harness',`caseworker-privatelaw-${persona}`]}]));
 const {digestBytes}=await import('./lib/exui-evidence-io.mjs');
 const record={schemaVersion:1,runId:input.runId,invocationId:contract.CALLBACK_MUTATION,requestDigest:digestBytes(JSON.stringify(api.callbackTransitionRequest(input))),ccd:states[1],definition:definitions[1],definitionImportDigest:hash('9'),apiContracts:input.apiContracts,credentials};
 return {api,contract,input,record};
}
test('callback transition requires distinct native import and changed actual page descriptor, not invented case-type drift',async()=>{
 const {api,contract,input,record}=await fixture();
 const selected=api.selectCallbackRuntime(input,contract.CALLBACK_MUTATION,record);
 assert.equal(selected.ccd.namespace,record.ccd.namespace);assert.equal(selected.definition.observedDefinitionDigest,input.definition.observedDefinitionDigest);
 assert.deepEqual(api.callbackTransitionRequest(input).invocationIds,[contract.CALLBACK_MUTATION]);
 for(const change of [r=>r.definition.kind='recipient-callback-import-feasibility',r=>r.definition.variant='baseline',r=>r.definition.sourceBinding.sourceRevision='foreign',r=>r.ccd.namespace=input.ccd.namespace,r=>r.ccd.owner=input.ccd.owner,r=>r.definition.observedPagesDigest=input.definition.observedPagesDigest,r=>r.definitionImportDigest=input.definitionImportDigest,r=>r.invocationId='ccd-enable-judge-event',r=>r.requestDigest=hash('0'),r=>r.extra=true,r=>r.credentials.readonly.roles=['caseworker'],r=>r.credentials.readonly.headers.Authorization=r.credentials.courtadmin.headers.Authorization]){
  const changed=structuredClone(record);change(changed);assert.throws(()=>api.selectCallbackRuntime(input,contract.CALLBACK_MUTATION,changed),/CALLBACK_TRANSITION_/);
 }
 assert.throws(()=>api.callbackTransitionRequest({...input,releaseScopeId:'exui-ccd-event-capability-pilot'}),/CALLBACK_TRANSITION_SCOPE/);
});
test('callback ACK publication is atomic and non-replacing; cancellation and alias paths fail closed',async t=>{
 const {api,input,record}=await fixture();const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'callback-transition-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 await assert.rejects(api.waitForCallbackRuntime(input,root,{isCancelled:()=>true}),/CALLBACK_TRANSITION_CANCELLED/);
 await assert.rejects(api.waitForCallbackRuntime(input,root,{timeoutMs:0}),/CALLBACK_TRANSITION_ACK_TIMEOUT/);
 const reference=api.publishCallbackRuntime(root,record);assert.equal(reference.path,record.invocationId+'/runtime-input.json');
 assert.deepEqual((await api.waitForCallbackRuntime(input,root)).definition,record.definition);
 assert.throws(()=>api.publishCallbackRuntime(root,record),/EEXIST/);
 const file=path.join(root,reference.path);fs.renameSync(file,root+'/outside.json');fs.symlinkSync(root+'/outside.json',file);
 await assert.rejects(api.waitForCallbackRuntime(input,root),/CALLBACK_TRANSITION_ACK_ALIAS/);
});
test('callback transition replay binds native receipts, source dates, cleanup and sole omission ownership chain',async t=>{
 const {createCallbackPhaseFixture}=require('./fixtures/exui-recipient-callback-phase-evidence.mock.cjs');
 const {validateCallbackTransitionEvidence}=await import('./lib/exui-recipient-callback-transition.mjs');
 const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'callback-replay-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const f=await createCallbackPhaseFixture({root});
 assert.deepEqual(validateCallbackTransitionEvidence(f.directory,f.expected,f.loaded()),{transition:f.expected.callbackTransition,identities:[{invocationId:'ccd-omit-recipient-mid-event',identity:f.faultIdentity}]});
 f.parent.capturedBeforeFault=false;f.write();assert.throws(()=>validateCallbackTransitionEvidence(f.directory,f.expected,f.loaded()),/CALLBACK_TRANSITION_CAPTURE_ORDER/);
});
for(const [name,change,code] of [
 ['namespace reuse',f=>{f.runtimeRecord.ccd.namespace=f.input.ccd.namespace;},/CALLBACK_TRANSITION_NAMESPACE_REUSE/],
 ['extra fault',f=>{f.parent.faults.push(structuredClone(f.parent.faults[0]));},/CALLBACK_TRANSITION_FAULT_SELECTION/],
 ['missing baseline cleanup',f=>{f.removal.ccd.cleanupComplete=false;},/CALLBACK_TRANSITION_REMOVAL_INCOMPLETE/],
 ['wrong one-cell derivation',f=>{f.derivation.transformationRecord.column='DisplayContext';},/CALLBACK_TRANSITION_DERIVATION_CELL/],
 ['old feasibility receipt',f=>{f.input.definition.kind='recipient-callback-import-feasibility';},/CALLBACK_TRANSITION_NATIVE_IMPORT_REQUIRED/],
 ['candidate ownership drift',f=>{f.registry[0].owner='other';},/CALLBACK_TRANSITION_NATIVE_OWNER/],
])test('callback transition rejects rehashed '+name,async t=>{
 const {createCallbackPhaseFixture}=require('./fixtures/exui-recipient-callback-phase-evidence.mock.cjs');
 const {validateCallbackTransitionEvidence}=await import('./lib/exui-recipient-callback-transition.mjs');
 const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'callback-replay-negative-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const f=await createCallbackPhaseFixture({root});change(f);f.write();assert.throws(()=>validateCallbackTransitionEvidence(f.directory,f.expected,f.loaded()),code);
});
for(const facet of ['label','date'])test('callback replay rejects materially altered '+facet+' even when receipt/reference hashes are rewritten',async t=>{
 const {createCallbackPhaseFixture}=require('./fixtures/exui-recipient-callback-phase-evidence.mock.cjs');
 const {validateCallbackTransitionEvidence}=await import('./lib/exui-recipient-callback-transition.mjs');
 const {digestBytes}=await import('./lib/exui-evidence-io.mjs');
 const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'callback-material-negative-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const f=await createCallbackPhaseFixture({root}),v=f.variants.baseline;
 if(facet==='label'){
  v.support.observations.definition.body.case_fields[0].label='Wrong recipient';
  v.imported.supportImportArtifact=f.put('recipient-callback-import/receipt.json',v.support,v.state.output);
  v.imported.observedDefinitionDigest=digestBytes(JSON.stringify(v.support.observations.definition.body));
 }else{
  v.date.rows[0].live_from='2020-01-01';
  v.imported.datePreservation=v.date;v.imported.storedDateArtifact=f.put('recipient-callback-import/stored-row-date.json',v.date,v.state.output);
 }
 f.input.definitionImportDigest=f.put('recipient-callback-native-import.json',v.imported,v.state.output).digest;
 f.request.baselineDefinitionImportDigest=f.input.definitionImportDigest;f.runtimeRecord.requestDigest=digestBytes(JSON.stringify(f.request));
 f.baseline.current.runtimeMetadata.definitionImportDigest=f.input.definitionImportDigest;
 f.baseline.current.runtimeMetadata.observedDefinitionDigest=v.imported.observedDefinitionDigest;
 f.write();assert.throws(()=>validateCallbackTransitionEvidence(f.directory,f.expected,f.loaded()),facet==='label'?/CALLBACK_FACET_LABEL/:/CALLBACK_FACET_DATE_ROW/);
});
for(const [name,change,code] of [
 ['old UI feasibility',o=>o.baseline.kind='callback-ui-feasibility',/CALLBACK_OBSERVATION_NATIVE_REQUIRED/],
 ['wrong rendered label',o=>o.baseline.ui.recipientLabel='Other',/CALLBACK_OBSERVATION_LABEL/],
 ['wrong page order',o=>o.baseline.ui.predecessor.navigation.reverse(),/CALLBACK_OBSERVATION_PAGE_SEQUENCE/],
 ['visible deselected recipient',o=>o.baseline.ui.hiddenWhenDeselected=false,/CALLBACK_OBSERVATION_CONDITION_ORDER/],
 ['wrong CYA Change target',o=>o.baseline.ui.cya.changeAccessibleName='Change Protected value',/CALLBACK_OBSERVATION_CYA_CHANGE/],
 ['lost sibling after Change',o=>o.baseline.ui.cya.changedRecipientNames.pop(),/CALLBACK_OBSERVATION_CYA_VALUES/],
 ['rejection persisted data',o=>o.baseline.afterRejected.state.version++,/CALLBACK_OBSERVATION_REJECTION_PERSISTED/],
 ['premature submit',o=>o.baseline.beforeSubmit.state.version++,/CALLBACK_OBSERVATION_PREMATURE_PERSISTENCE/],
 ['lost recipient ID',o=>o.baseline.after.state.case_data.sodAdditionalRecipientsList[0].id='33333333-3333-4333-8333-333333333333',/CALLBACK_OBSERVATION_PERSISTED_DATA/],
 ['wrong final event',o=>o.baseline.after.history[0].id='create',/CALLBACK_OBSERVATION_AUDIT_EVENT/],
 ['wrong final actor',o=>o.baseline.after.history[0].user_id='foreign',/CALLBACK_OBSERVATION_AUDIT_EVENT/],
 ['unverified service',o=>o.baseline.journal[0].authenticatedService='xui_webapp',/CALLBACK_JOURNAL_SERVICE/],
 ['wrong callback path',o=>o.baseline.journal[0].path='/other',/CALLBACK_JOURNAL_PATH/],
 ['lost normalization callback',o=>o.baseline.journal.pop(),/CALLBACK_OBSERVATION_CALLBACK_COUNT/],
 ['fault has no CYA',o=>o['ccd-omit-recipient-mid-event'].ui.faultCyaHeading='Validation failed',/CALLBACK_OBSERVATION_FAULT_CYA/],
 ['fault unexpectedly invoked callback',o=>o['ccd-omit-recipient-mid-event'].journal.push(o.baseline.journal[0]),/CALLBACK_OBSERVATION_FAULT_CALLBACK/],
])test('callback raw replay rejects rehashed '+name,async t=>{
 const {createCallbackPhaseFixture}=require('./fixtures/exui-recipient-callback-phase-evidence.mock.cjs');
 const {validateCallbackTransitionEvidence}=await import('./lib/exui-recipient-callback-transition.mjs');
 const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'callback-ui-replay-negative-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const f=await createCallbackPhaseFixture({root});change(f.observations);f.write();assert.throws(()=>validateCallbackTransitionEvidence(f.directory,f.expected,f.loaded()),code);
});
test('callback response cannot silently alter sibling data even with fresh byte and artifact hashes',async t=>{
 const {createCallbackPhaseFixture}=require('./fixtures/exui-recipient-callback-phase-evidence.mock.cjs');
 const {validateCallbackTransitionEvidence}=await import('./lib/exui-recipient-callback-transition.mjs');
 const {digestBytes}=await import('./lib/exui-evidence-io.mjs');
 const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'callback-response-negative-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const f=await createCallbackPhaseFixture({root});const record=f.observations.baseline.journal[1],response=JSON.parse(record.rawResponse);response.data.sodAdditionalRecipientsList[1].value.emailInformation.emailName='Changed sibling';record.rawResponse=JSON.stringify(response);record.responseDigest=digestBytes(record.rawResponse);f.write();assert.throws(()=>validateCallbackTransitionEvidence(f.directory,f.expected,f.loaded()),/CALLBACK_JOURNAL_RESPONSE_DATA/);
});
