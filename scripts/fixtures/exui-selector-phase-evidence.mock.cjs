const fs=require('node:fs'),path=require('node:path');
const {createHash}=require('node:crypto');
const hash=value=>'sha256:'+createHash('sha256').update(value).digest('hex');
const digest=letter=>'sha256:'+letter.repeat(64);
async function createSelectorObservation(baseline = true, actor) {
  const m = await import('../lib/exui-selector-event-row-observations.mjs');
  const c = await import('../lib/exui-selector-event-row-contract.mjs');
  const selected = actor ?? { credentials: { courtadmin: { userId: 'source-actor', roles: ['caseworker', 'caseworker-harness', 'caseworker-privatelaw-courtadmin'] } } };
  const state = (id, data) => ({ state: { id, case_type_id: 'HarnessNestedPRL', jurisdiction: 'HARNESS', state: 'JUDICIAL_REVIEW', version: 1, last_modified: '2026-11-05T12:00:00Z', case_data: data, security_classification: 'PUBLIC' }, history: [{ id: 'create', created_date: '2026-11-05T11:00:00Z', user_id: 'creator' }] });
  const caseId = '1234567890123456', emptyId = '1234567890123457', prefix = id => `/cases/case-details/HARNESS/HarnessNestedPRL/${id}/trigger/serviceOfDocuments/`;
  const before = state(caseId, m.selectorSeed()), empty = state(emptyId, m.selectorEmptySeed()), variant = baseline ? 'baseline' : 'summary-hidden';
  const observation = { schemaVersion: 1, kind: 'native-selector-event-row-observation', invocationId: baseline ? 'baseline' : c.SELECTOR_EVENT_MUTATION, variant, sourceBinding: c.deriveSelectorEventRowFixture(variant).binding, caseId, before,
    optionalEmptyState: { caseId: emptyId, before: empty, after: structuredClone(empty), cyaHeading: 'Check your answers', cyaPath: prefix(emptyId) + 'submit' }, optionalEmpty: { status: 200, pageId: 'serviceOfDocuments2' },
    ui: { navigation: ['serviceOfDocumentsharnessBefore','serviceOfDocuments2','serviceOfDocumentsharnessBefore','serviceOfDocuments2'].map(page => prefix(caseId) + page), predecessorLabel: 'Protected value', predecessorEditableControls: 0, selectorInitiallyChecked: false, selectorAfterCheck: true, siblingLabel: 'Recipient', siblingValue: 'Selector recipient', cyaHeading: 'Check your answers', cyaPath: prefix(caseId) + 'submit', selectorSummaryLabel: 'Select additional recipients who needs to be served', selectorSummaryValue: 'Additional recipients (optional)', changeAccessibleName: 'Change Select additional recipients who needs to be served', changeTarget: prefix(caseId) + 'serviceOfDocuments2', selectedAfterChange: true },
    selectedCya: { validation: { status: 200, pageId: 'serviceOfDocuments2' }, selectorChecked: true, selectorPrecedesRecipient: true, predecessorRoundTrip: true, healthySiblingCount: 1, selectorSummaryCount: baseline ? 1 : 0 }, completed: baseline };
  const journal=[];
  for(const [index,id] of [emptyId,caseId].entries()) {
    journal.push({method:'GET',path:`/data/internal/cases/${id}/event-triggers/serviceOfDocuments`,status:200,actorId:selected.credentials.courtadmin.userId});
    const predecessor='serviceOfDocumentsharnessBefore',page='serviceOfDocuments2';
    for(const pageId of index===0?[predecessor,page]:[predecessor,predecessor,page,...(baseline?[page]:[])])journal.push({method:'POST',path:'/data/case-types/HarnessNestedPRL/validate',status:200,actorId:selected.credentials.courtadmin.userId,selectorValidation:{pageId,eventId:'serviceOfDocuments',controlValue:pageId===predecessor?(index===0?'selector-empty-control':'selector-persistence-control'):null,selected:pageId===predecessor?null:index===0?[]:['additionalRecipients']}});
  }

  if (baseline) {
    observation.beforeSubmit = structuredClone(before); observation.intended = m.selectorPersisted(); observation.after = structuredClone(before);
    observation.after.state.case_data = m.selectorPersisted(); observation.after.state.version++; observation.after.state.last_modified = '2026-11-05T12:01:00Z';
    observation.after.history.push({ id: 'serviceOfDocuments', created_date: '2026-11-05T12:01:00Z', case_type_id: 'HarnessNestedPRL', state_id: 'JUDICIAL_REVIEW', user_id: selected.credentials.courtadmin.userId });
    observation.submission = { method: 'POST', path: `/data/cases/${caseId}/events`, status: 201, eventId: 'serviceOfDocuments', data: m.selectorPersisted() };
    journal.push({ method: 'POST', path: `/data/cases/${caseId}/events`, status: 201, actorId: selected.credentials.courtadmin.userId });
  } else Object.assign(observation, { faultEffective: true, witness: 'healthy-cya-without-selector-row', afterFault: structuredClone(before) });
  return { m, selected, observation, journal };
}
// Synthetic full-reader packet only; accepted native evidence comes from the owned controller.
async function createSelectorPhaseFixture({root,candidate,harnessCommit='b'.repeat(40),sourceDigest=digest('4'),dependencyDigest=digest('a'),browserDigest=digest('b')}={}) {
 const c=await import('../lib/exui-selector-event-row-contract.mjs');
 const {prepareRecipientCallbackImport}=await import('../lib/exui-recipient-callback-import.mjs');
 const {canonicalRecipientCallbackPages}=await import('../lib/exui-recipient-callback-fixture.mjs');
 const {validateSelectorStoredDate}=await import('../lib/exui-selector-event-row-facets.mjs');
 const {selectorTransitionRequest}=await import('../lib/exui-selector-event-row-transition.mjs');
 const {selectorObservationReferences}=await import('../lib/exui-selector-event-row-observations.mjs');
 const {CCD_IMAGES}=await import('../lib/exui-ccd-runtime.mjs');
 const {nativeIdentity}=await import('../lib/exui-native-contract.mjs');
 const {loadRunEvidence}=await import('../lib/exui-evidence-io.mjs');
 const {completeRun}=require('./exui-release-evidence.mock.cjs');
 const directory=path.join(root,'selectorEventRow');fs.mkdirSync(directory,{recursive:true});
 const put=(name,value,base=directory)=>{const bytes=Buffer.isBuffer(value)?value:Buffer.from(JSON.stringify(value));const file=path.join(base,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes);return {path:name,digest:hash(bytes)};};
 const candidateRoot=path.join(root,'selector-candidate');put('config/default.json',{services:{idam:{}},feature:{}},candidateRoot);
 const artifact={candidateRoot,...(candidate??{identity:completeRun().manifest.identity})},policy=c.selectorEventPolicy();
 const images=Object.fromEntries(Object.entries(CCD_IMAGES).map(([name,id])=>[name,{id,architecture:'arm64',repoDigests:[`fixture@${id}`]}]));
 const credentials=Object.fromEntries(['allowed','courtadmin','judge','observer','readonly'].map((name,i)=>[name,{userId:`${i+1}1111111-1111-4111-8111-111111111111`,headers:{Authorization:`Bearer PRIVATE-CANARY-${name}`},roles:['caseworker','caseworker-harness',`caseworker-privatelaw-${name}`]}]));
 const variants={};
 for(const [index,variant]of ['baseline','summary-hidden'].entries()) {
  const id=index?c.SELECTOR_EVENT_MUTATION:'baseline',output=path.join(root,`selector-${variant}-runtime`),fixtureDirectory=path.join(output,'selector-fixture');
  fs.mkdirSync(output,{recursive:true});
  const seal=await prepareRecipientCallbackImport(fixtureDirectory,{variant:'binding-omitted',rowFacets:true,selectorEventVariant:variant});
  const canonical=c.deriveSelectorEventRowFixture(variant),binding=canonical.binding;
  const containers=Object.fromEntries(Object.keys(images).map((name,i)=>[name,(index?'b':'a')+String(i+1).repeat(63)]));
  const state={schemaVersion:1,ready:true,owner:'harness-'+String(index+1).repeat(16),output,containers,namespace:containers.database,images};
  const source=canonical.fixture.sheets.CaseField.find(row=>row.ID==='sodAdditionalRecipients');
  const definition={id:'HarnessNestedPRL',version:{number:1},events:[{id:'serviceOfDocuments',case_fields:[{case_field_id:'sodAdditionalRecipients',display_context:'OPTIONAL',show_condition:null,show_summary_change_option:!index},{case_field_id:'protectedValue',display_context:'READONLY'}]}],case_fields:[{id:'sodAdditionalRecipients',label:source.Label,field_type:{type:source.FieldType,id:'MultiSelectList-AdditionalRecipients',fixed_list_items:[{code:'additionalRecipients',label:'Additional recipients (optional)',order:1}]}}]};
  const pages={case_type_id:'HarnessNestedPRL',event_id:'serviceOfDocuments',wizard_pages:[{id:'serviceOfDocumentsharnessBefore',order:1,show_condition:null,wizard_page_fields:[{case_field_id:'protectedValue',order:1}]},{id:'serviceOfDocuments2',order:2,show_condition:null,wizard_page_fields:[{case_field_id:'sodAdditionalRecipients',order:7},{case_field_id:'sodAdditionalRecipientsList',order:8}]}]};
  const support={schemaVersion:1,kind:'recipient-callback-import-feasibility',status:'import-and-callback-descriptor-observed',owner:state.owner,namespace:state.namespace,images,seal,runtimeAcceptance:false,catalogueCredit:false,releaseCredit:false,observations:{import:{status:201},definition:{status:200,body:definition},pages:{status:200,body:pages}}};
  const date={...validateSelectorStoredDate([{case_type:'HarnessNestedPRL',version:1,event:'serviceOfDocuments',page:'serviceOfDocuments2',field:'sodAdditionalRecipients',live_from:'2024-09-01',sql_type:'date'}],1),owner:state.owner,namespace:state.namespace,images,rawDigest:digest('f')};
  const imported={schemaVersion:1,kind:'native-selector-event-row-definition',releaseScopeId:c.SELECTOR_EVENT_SCOPE,variant,fixtureDigest:seal.workbookDigest,sourceDefinitionDigest:seal.definitionDigest,observedDefinitionDigest:hash(JSON.stringify(definition)),observedPagesDigest:hash(JSON.stringify(canonicalRecipientCallbackPages(pages))),definitionVersion:1,storedDateDigest:hash(JSON.stringify(date)),sourceBinding:binding,owner:state.owner,namespace:state.namespace,images};
  const evidence={selectorImportReceipt:put(id+'/selectorImportReceipt.json',imported),selectorObservedReceipt:put(id+'/selectorObservedReceipt.json',support),selectorDateReceipt:put(id+'/selectorDateReceipt.json',date),selectorDefinitionReceipt:put(id+'/selectorDefinitionReceipt.json',fs.readFileSync(path.join(fixtureDirectory,'definition.json'))),selectorWorkbookReceipt:put(id+'/selectorWorkbookReceipt.json',fs.readFileSync(path.join(fixtureDirectory,'definition.xlsx')))};
  variants[variant]={state,definition:imported,definitionImportDigest:evidence.selectorImportReceipt.digest,selectorEventBinding:binding,evidence};
 }
 const shared={runId:'ccd-11111111-1111-4111-8111-111111111111',releaseScopeId:c.SELECTOR_EVENT_SCOPE,harnessCommit,harnessSourceDigest:sourceDigest,artifact,credentials,apiContracts:{data:digest('5'),definition:digest('6')},gatewayDigest:digest('7'),nativeRuntime:{imageId:digest('8')},browserRuntimeImage:digest('9')};
 const runtime=variant=>{const selected=variants[variant];return {...shared,ccd:selected.state,definition:selected.definition,definitionImportDigest:selected.definitionImportDigest,selectorEventBinding:selected.selectorEventBinding,...selected.evidence};};
 const input=runtime('baseline'),faultInput=runtime('summary-hidden'),request=selectorTransitionRequest(input);
 const runtimeRecord={schemaVersion:1,runId:input.runId,invocationId:c.SELECTOR_EVENT_MUTATION,request,requestDigest:hash(JSON.stringify(request)),runtime:faultInput};
 const identities=[input,faultInput].map((value,index)=>nativeIdentity(value,{mutation:index?c.SELECTOR_EVENT_MUTATION:null},candidateRoot).identity);
 const expected={nativeAuthority:true,runId:input.runId,releaseScopeId:c.SELECTOR_EVENT_SCOPE,harnessCommit,policyDigest:policy.policyDigest,identity:identities[0],harnessSourceDigest:sourceDigest,harnessDependencyDigest:dependencyDigest,browserDigest};
 const metadata=value=>({isolation:'native-separate-api-owned-network-none',harnessSourceState:'clean',harnessSourceDigest:sourceDigest,harnessDependencyDigest:dependencyDigest,browserDigest,gatewayDigest:input.gatewayDigest,idamSimulatorImage:images.idam.id,definitionImportDigest:value.definitionImportDigest,observedDefinitionDigest:value.definition.observedDefinitionDigest,observedPagesDigest:value.definition.observedPagesDigest,selectorStoredDateDigest:value.definition.storedDateDigest,definitionVersion:'1',ccdNamespace:value.ccd.namespace});
 const observations={},items=[];
 for(const [index,value]of [input,faultInput].entries()){
  const id=index?c.SELECTOR_EVENT_MUTATION:'baseline',identity=identities[index],status=index?'failed':'passed';
  const current={schemaVersion:1,runId:input.runId,releaseScopeId:c.SELECTOR_EVENT_SCOPE,harnessCommit,policyDigest:policy.policyDigest,requiredObligationIds:policy.requiredObligationIds,identity,runtimeMetadata:metadata(value)};
  const report={schemaVersion:1,complete:true,status,globalErrors:[],context:{runId:input.runId,invocationId:id,identity,harnessCommit,releaseScopeId:c.SELECTOR_EVENT_SCOPE,policyDigest:policy.policyDigest,harnessSourceState:'clean',harnessSourceDigest:sourceDigest},tests:[{proofId:index?c.SELECTOR_EVENT_MUTANT_PROOF:c.SELECTOR_EVENT_PROOF,expectedStatus:'passed',status,retry:0,unattributedErrors:0,failureId:index?c.SELECTOR_EVENT_FAILURE:null}]};
  const execution={runId:input.runId,invocationId:id,kind:index?'mutation':'baseline',identity,terminalState:'completed',runnerExitCode:index?1:0,unexpectedGlobalErrors:[]};
  observations[id]=await createSelectorObservation(!index,{credentials});
  items.push({current,report,execution,input:value});
 }
 const capture={schemaVersion:1,completedAfterController:true,invocations:[]},registry=[];
 const write=()=>{
  put('input.json',input);put('selector-transition-request.json',request);put(c.SELECTOR_EVENT_MUTATION+'/runtime-input.json',runtimeRecord);
  capture.baselineInputDigest=hash(fs.readFileSync(path.join(directory,'input.json')));capture.invocations=[];registry.length=0;
  const executions=[];
  for(const [index,item]of items.entries()){
   const id=item.execution.invocationId,value=item.input,identity=identities[index],observation=observations[id];
   put(id+'/manifest.json',item.current);item.execution.resultArtifact=put(id+'/report.json',item.report);executions.push(put(id+'/execution.json',item.execution));put(id+'/framework-terminal.json',{code:index?1:0,signal:null});
   put(id+'/selector-event-row-observation.json',observation.observation);fs.writeFileSync(path.join(directory,id,'ccd-requests.jsonl'),observation.journal.map(row=>JSON.stringify(row)+'\n').join(''));
   const resources=['candidate','tools'].map((role,i)=>({name:`${input.runId}-${id}-${role}`,id:String(8+index*2+i).padStart(64,'0'),owner:input.runId,service:role==='candidate'?'candidate':'browser-provider',image:role==='candidate'?input.nativeRuntime.imageId:input.browserRuntimeImage,namespace:value.ccd.namespace,removed:true}));registry.push(...resources);
   put(id+'/candidate-write-denial.json',{candidateId:resources[0].id,controllerSourceVisible:false,attempts:['/output/report.json','/harness/controller.mjs'].map(file=>({path:file,denied:true}))});
   put(id+'/candidate-lifecycle.json',{requestedStop:true,before:{Image:input.nativeRuntime.imageId,Id:resources[0].id,Name:'/'+resources[0].name,State:{Running:true}},after:{Image:input.nativeRuntime.imageId,Id:resources[0].id,Name:'/'+resources[0].name,State:{Running:false,ExitCode:143,OOMKilled:false}}});
   const initial={...expected,identity};
   const before={capturedBeforeExecution:true,capturedAt:'2026-11-05T12:00:00Z',invocationId:id,expected:initial,definition:value.definition,definitionImportDigest:value.definitionImportDigest,selectorEventBinding:value.selectorEventBinding,ccd:value.ccd,apiContracts:value.apiContracts,runtimeEvidence:Object.fromEntries(Object.entries(value).filter(([key])=>/^selector.*Receipt$/.test(key))),actors:Object.fromEntries(Object.entries(credentials).map(([name,actor])=>[name,{userId:actor.userId,roles:actor.roles}]))};
   capture.invocations.push({invocationId:id,identity,expectation:put(`independent-selector-${id}.json`,before),removal:put(`independent-selector-${id}-removal.json`,{invocationId:id,native:{invocationId:id,removed:resources.map(({name,id})=>({name,id}))},ccd:{owner:value.ccd.owner,cleanupComplete:true,checkedNames:Object.keys(value.ccd.containers).map(service=>`${value.ccd.owner}-${service}`),checkedContainerIds:Object.values(value.ccd.containers)}}),...(index?{runtimeRecord:put(id+'/runtime-input.json',runtimeRecord)}:{})});
  }
  put('owned-resources.json',registry);
  const contract=c.selectorEventMutation();
  const derivation={baselineIdentity:identities[0],mutantIdentity:identities[1],mutationDefinitionDigest:policy.mutationDefinitions[0].definitionDigest,transformation:c.SELECTOR_EVENT_MUTATION,transformationRecord:contract,target:contract.target,beforeDigest:hash('Y'),afterDigest:hash('N'),runtimeRecord:capture.invocations[1].runtimeRecord,selectorObservations:selectorObservationReferences(directory)};
  put('run.json',{schemaVersion:1,manifest:items[0].current,executionArtifacts:executions,mutations:[{mutationId:c.SELECTOR_EVENT_MUTATION,baselineInvocationId:'baseline',mutantInvocationId:c.SELECTOR_EVENT_MUTATION,derivationArtifact:put(c.SELECTOR_EVENT_MUTATION+'/derivation.json',derivation)}]});
  const loaded=loadRunEvidence(path.join(directory,'run.json'),policy);expected.evidenceManifestDigest=loaded.evidenceManifestDigest;expected.receiptArtifactDigest=put('gate.json',loaded.receipt).digest;
  const {selectorEventCapture,selectorControllerTerminal,...pre}=expected;
  put('independent-preexecution.json',{...pre,capturedAt:'2026-11-05T12:00:00Z',capturedBeforeGate:true});
  expected.selectorEventCapture=put('independent-selector-capture.json',capture);expected.selectorControllerTerminal=put('independent-controller-terminal.json',{schemaVersion:1,runId:input.runId,terminal:{code:0,signal:null}});
  put('independent-selector-admission.json',{schemaVersion:1,completedAfterController:true,expected});put('controller-terminal.json',{status:'completed',exitCode:loaded.receipt.verdict.exitCode,cleanupComplete:true});return loaded;
 };
 const loaded=write();
 return {directory,policy,expected,input,runtimeRecord,variants,observations,items,capture,registry,put,write,terminal:{code:loaded.receipt.verdict.exitCode,signal:null},result:{phase:'selectorEventRow',status:loaded.receipt.verdict.status,exitCode:loaded.receipt.verdict.exitCode,receiptArtifactDigest:expected.receiptArtifactDigest},loaded:()=>loadRunEvidence(path.join(directory,'run.json'),policy).input};
}
module.exports={createSelectorObservation,createSelectorPhaseFixture};
