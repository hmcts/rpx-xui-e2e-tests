const fs=require('node:fs'),path=require('node:path');
const {createHash}=require('node:crypto');
const {completeRun}=require('./exui-release-evidence.mock.cjs');
const hash=value=>'sha256:'+createHash('sha256').update(value).digest('hex');
const digest=c=>'sha256:'+c.repeat(64);
// Unit-test packet only: never substitutes for the owned native producer.
async function createCallbackPhaseFixture({root,harnessCommit='b'.repeat(40),sourceDigest=digest('4'),dependencyDigest=digest('a'),browserDigest=digest('b')}={}){
 const c=await import('../lib/exui-recipient-callback-contract.mjs');
 const {callbackNativeImportRecord}=await import('../lib/exui-recipient-callback-native-import.mjs');
 const {validateCallbackStoredDate}=await import('../lib/exui-recipient-callback-facets.mjs');
 const {callbackTransitionRequest}=await import('../lib/exui-recipient-callback-transition.mjs');
 const {callbackSeedData,callbackObservationReferences}=await import('../lib/exui-recipient-callback-observations.mjs');
 const {CCD_IMAGES}=await import('../lib/exui-ccd-runtime.mjs');
 const {nativeIdentity}=await import('../lib/exui-native-contract.mjs');
 const {getReleasePolicy}=await import('../lib/exui-release-policy.mjs');
 const {loadRunEvidence}=await import('../lib/exui-evidence-io.mjs');
 const {readCallbackBaselineCheckpoint}=await import('../lib/exui-native-proof-validation.mjs');
 const directory=path.join(root,'recipientCallback');fs.mkdirSync(directory,{recursive:true});
 const put=(name,value,base=directory)=>{const file=path.join(base,name),bytes=JSON.stringify(value);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes);return {path:name,digest:hash(bytes)};};
 const candidateRoot=path.join(root,'callback-candidate');put('config/default.json',{services:{idam:{}},feature:{}},candidateRoot);
 const artifact={candidateRoot,identity:completeRun().manifest.identity},policy=getReleasePolicy(c.CALLBACK_SCOPE);
 const images=Object.fromEntries(Object.entries(CCD_IMAGES).map(([name,id])=>[name,{id,architecture:'arm64',repoDigests:[`fixture@${id}`]}]));
 const variants={};
 for(const [index,variant] of ['baseline','binding-omitted'].entries()){
  const prepared=c.callbackCanonicalImport(variant),output=path.join(root,`callback-${variant}-runtime`);
  const containers=Object.fromEntries(Object.keys(images).map((name,i)=>[name,(index?'b':'a')+String(i+1).repeat(63)]));
  const state={schemaVersion:1,ready:true,owner:'harness-'+String(index+1).repeat(16),output,containers,namespace:containers.database,images};
  const row=prepared.fixture.sheets.CaseEventToFields.find(r=>r.CaseEventID==='serviceOfDocuments'&&r.CaseFieldID==='sodAdditionalRecipientsList');
  const definition={id:'HarnessNestedPRL',version:{number:1},events:[{id:'serviceOfDocuments',case_fields:[{case_field_id:row.CaseFieldID,display_context:row.DisplayContext,show_condition:row.FieldShowCondition,show_summary_change_option:true},{case_field_id:'protectedValue',display_context:'READONLY'}]}],case_fields:[{id:row.CaseFieldID,label:'Recipient',field_type:{type:'Collection',collection_field_type:{id:'ServeOrgDetails'}}}]};
  const pages={case_type_id:'HarnessNestedPRL',event_id:'serviceOfDocuments',wizard_pages:[{id:'serviceOfDocumentsharnessBefore',order:1,wizard_page_fields:[{case_field_id:'protectedValue',order:1}]},{id:'serviceOfDocuments2',order:2,callback_url_mid_event:row.CallBackURLMidEvent??null,wizard_page_fields:[{case_field_id:'sodAdditionalRecipients',order:7},{case_field_id:row.CaseFieldID,order:8}]}]};
  const support={schemaVersion:1,kind:'recipient-callback-import-feasibility',status:'import-and-callback-descriptor-observed',owner:state.owner,namespace:state.namespace,images,seal:prepared.seal,runtimeAcceptance:false,catalogueCredit:false,releaseCredit:false,observations:{import:{status:201},definition:{status:200,body:definition},pages:{status:200,body:pages}}};
  const date=validateCallbackStoredDate([{case_type:'HarnessNestedPRL',version:1,event:'serviceOfDocuments',page:'serviceOfDocuments2',field:row.CaseFieldID,live_from:'2024-09-01',sql_type:'date'}],1);
  const supportRef=put('recipient-callback-import/receipt.json',support,output),dateRef=put('recipient-callback-import/stored-row-date.json',date,output);
  const imported=callbackNativeImportRecord(support,date,state,variant,supportRef.digest,dateRef.digest);
  const importedRef=put('recipient-callback-native-import.json',imported,output);variants[variant]={state,imported,importedRef,support,date};
 }
 const credentials=Object.fromEntries(['allowed','courtadmin','judge','observer','readonly'].map((name,i)=>[name,{userId:`${i+1}1111111-1111-4111-8111-111111111111`,headers:{Authorization:`Bearer PRIVATE-CANARY-${name}`},roles:['caseworker','caseworker-harness',`caseworker-privatelaw-${name}`]}]));
 const input={runId:'ccd-11111111-1111-4111-8111-111111111111',releaseScopeId:c.CALLBACK_SCOPE,harnessCommit,harnessSourceDigest:sourceDigest,artifact,ccd:variants.baseline.state,definition:variants.baseline.imported,definitionImportDigest:variants.baseline.importedRef.digest,credentials,apiContracts:{data:digest('5'),definition:digest('6')},gatewayDigest:digest('7'),nativeRuntime:{imageId:digest('8')},browserRuntimeImage:digest('9')};
 const request=callbackTransitionRequest(input),faultVariant=variants['binding-omitted'];
 const runtimeRecord={schemaVersion:1,runId:input.runId,invocationId:c.CALLBACK_MUTATION,requestDigest:hash(JSON.stringify(request)),ccd:faultVariant.state,definition:faultVariant.imported,definitionImportDigest:faultVariant.importedRef.digest,credentials,apiContracts:input.apiContracts};
 const baselineIdentity=nativeIdentity(input,{mutation:null},candidateRoot).identity,faultIdentity=nativeIdentity({...input,...runtimeRecord},{mutation:c.CALLBACK_MUTATION},candidateRoot).identity;
 const expected={nativeAuthority:true,runId:input.runId,releaseScopeId:c.CALLBACK_SCOPE,harnessCommit,policyDigest:policy.policyDigest,identity:baselineIdentity,harnessSourceDigest:sourceDigest,harnessDependencyDigest:dependencyDigest,browserDigest};
 const metadata=selected=>({definitionImportDigest:selected.definitionImportDigest,observedDefinitionDigest:selected.definition.observedDefinitionDigest,observedPagesDigest:selected.definition.observedPagesDigest,definitionVersion:String(selected.definition.definitionVersion),ccdNamespace:selected.ccd.namespace});
 const make=(id,identity,selected,proofId,failed)=>{
  const current={schemaVersion:1,runId:input.runId,releaseScopeId:c.CALLBACK_SCOPE,harnessCommit,policyDigest:policy.policyDigest,requiredObligationIds:policy.requiredObligationIds,identity,runtimeMetadata:{isolation:'native-separate-api-owned-network-none',harnessSourceState:'clean',harnessSourceDigest:sourceDigest,harnessDependencyDigest:dependencyDigest,browserDigest,gatewayDigest:input.gatewayDigest,idamSimulatorImage:images.idam.id,...metadata(selected)}};
  const report={schemaVersion:1,complete:true,status:failed?'failed':'passed',globalErrors:[],context:{runId:input.runId,invocationId:id,identity,harnessCommit,releaseScopeId:c.CALLBACK_SCOPE,policyDigest:policy.policyDigest,harnessSourceState:'clean',harnessSourceDigest:sourceDigest},tests:[{proofId,expectedStatus:'passed',status:failed?'failed':'passed',retry:0,unattributedErrors:0,failureId:failed?c.CALLBACK_FAILURE:null}]};
  return {current,report,execution:{runId:input.runId,invocationId:id,kind:failed?'mutation':'baseline',identity,terminalState:'completed',runnerExitCode:failed?1:0,unexpectedGlobalErrors:[]}};
 };
 const baseline=make('baseline',baselineIdentity,input,c.CALLBACK_PROOF,false),fault=make(c.CALLBACK_MUTATION,faultIdentity,runtimeRecord,c.CALLBACK_MUTANT_PROOF,true);
 const registry=[{name:`${input.runId}-baseline-candidate`,id:'c'.repeat(64),owner:input.runId,service:'candidate',image:input.nativeRuntime.imageId,namespace:input.ccd.namespace,removed:true},{name:`${input.runId}-baseline-tools`,id:'d'.repeat(64),owner:input.runId,service:'browser-provider',image:input.browserRuntimeImage,namespace:input.ccd.namespace,removed:true}];
 const denial={candidateId:registry[0].id,controllerSourceVisible:false,attempts:['/output/report.json','/harness/controller.mjs'].map(p=>({path:p,denied:true}))};
 const lifecycle={requestedStop:true,before:{Id:registry[0].id,Name:`/${registry[0].name}`,State:{Running:true}},after:{Id:registry[0].id,Name:`/${registry[0].name}`,State:{Running:false,ExitCode:143,OOMKilled:false}}};
 const removal={schemaVersion:1,runId:input.runId,baselineNamespace:input.ccd.namespace,baselineOwner:input.ccd.owner,native:{removed:registry.map(({name,id})=>({name,id})),bindings:[]},ccd:{owner:input.ccd.owner,cleanupComplete:true,checkedNames:Object.keys(images).map(name=>`${input.ccd.owner}-${name}`),checkedContainerIds:Object.values(input.ccd.containers).sort()}};
 const contract=c.callbackMutationContract(),derivation={mutationDefinitionDigest:policy.mutationDefinitions[0].definitionDigest,baselineIdentity,mutantIdentity:faultIdentity,transformation:c.CALLBACK_MUTATION,target:contract.target,transformationRecord:contract,beforeDigest:contract.beforeDigest,afterDigest:contract.afterDigest,baselineRuntimeMetadata:metadata(input),mutantRuntimeMetadata:metadata(runtimeRecord)};
 const parent={schemaVersion:1,runId:input.runId,releaseScopeId:c.CALLBACK_SCOPE,harnessCommit,harnessSourceDigest:sourceDigest,capturedBeforeFault:true,capturedAt:'2026-11-04T12:00:00.000Z',faults:[{invocationId:c.CALLBACK_MUTATION,identity:faultIdentity}]};
 const observations={};
 for(const [id,selected,isFault] of [['baseline',input,false],[c.CALLBACK_MUTATION,runtimeRecord,true]]){
  const caseId=isFault?'2234567890123456':'1234567890123456',data=callbackSeedData();
  const before={state:{id:Number(caseId),case_type_id:'HarnessNestedPRL',jurisdiction:'HARNESS',state:'JUDICIAL_REVIEW',version:1,last_modified:'2026-11-04T12:00:00.000',case_data:data},history:[{id:'create',created_date:'2026-11-04T12:00:00.000'}]};
  const names=['HARNESS_CALLBACK_NORMALIZED','Synthetic sibling'];
  const basePath=`/cases/case-details/${caseId}/trigger/serviceOfDocuments/`;
  const ui={predecessor:{label:'Protected value',editableControlCount:0,navigation:['serviceOfDocumentsharnessBefore','serviceOfDocuments2','serviceOfDocumentsharnessBefore','serviceOfDocuments2'].map(page=>basePath+page)},recipientLabel:'Recipient',selectorPrecedesRecipient:true,selectorInitiallyChecked:true,hiddenWhenDeselected:true,visibleWhenReselected:true};
  const journal=[];let observation={schemaVersion:1,kind:'native-recipient-callback-observation',invocationId:id,caseId,before,afterRejected:structuredClone(before),ui,journal};
  if(isFault)Object.assign(observation,{completed:false,faultEffective:true,witness:'valid-CYA-without-callback',validation:[{pageId:'serviceOfDocuments2',status:200}]}, {ui:{...ui,faultCyaHeading:'Check your answers',faultCyaPathname:basePath+'check-your-answers'}});
  else{
   const intended=structuredClone(data);intended.sodAdditionalRecipientsList[0].value.emailInformation.emailName=names[0];
   const after={state:{...structuredClone(before.state),version:2,last_modified:'2026-11-04T12:01:00.000',case_data:intended},history:[{id:'serviceOfDocuments',created_date:'2026-11-04T12:01:00.000',case_type_id:'HarnessNestedPRL',state_id:'JUDICIAL_REVIEW',user_id:selected.credentials.courtadmin.userId},...structuredClone(before.history)]};
   for(let i=0;i<3;i++){
    const current=structuredClone(i===2?intended:data);if(i===0)current.sodAdditionalRecipientsList[0].value.emailInformation.emailName='HARNESS_CALLBACK_REJECT';
    const details=case_data=>({id:Number(caseId),case_type_id:'HarnessNestedPRL',jurisdiction:'HARNESS',state:'JUDICIAL_REVIEW',case_data});
    const rawRequest=JSON.stringify({event_id:'serviceOfDocuments',ignore_warning:false,case_details:details(current),case_details_before:details(data)}),rawResponse=JSON.stringify({data:i===0?current:intended,errors:i===0?['HARNESS_CALLBACK_BUSINESS_REJECTION']:[],warnings:[]});
    journal.push({schemaVersion:1,sequence:i+1,invocationId:'recipient-callback-native',authenticatedService:'ccd_data',path:'/service-of-documents/validate-additional-recipients',method:'POST',bindingDigest:hash(JSON.stringify(c.callbackCanonicalImport().binding)),recipientCount:2,status:200,outcome:['business-rejected','normalized','normalization-unchanged'][i],rawRequest,rawResponse,requestDigest:hash(rawRequest),responseDigest:hash(rawResponse)});
   }
   Object.assign(observation,{completed:true,beforeSubmit:structuredClone(before),after,validation:[{pageId:'serviceOfDocuments2',status:422},{pageId:'serviceOfDocuments2',status:200},{pageId:'serviceOfDocuments2',status:200}]});ui.cya={recipientLabel:'Recipient',changeAccessibleName:'Change Recipient',summaryRecipientNames:names,changedRecipientNames:[...names]};
  }
  observations[id]=observation;
 }
 const write=()=>{
  parent.baselineInputDigest=put('input.json',input).digest;put('callback-transition-request.json',request);parent.requestDigest=hash(JSON.stringify(request));
  parent.faults[0].runtimeRecord=put(c.CALLBACK_MUTATION+'/runtime-input.json',runtimeRecord);
  const executionArtifacts=[baseline,fault].map(item=>{const id=item.execution.invocationId;put(id+'/manifest.json',item.current);item.execution.resultArtifact=put(id+'/report.json',item.report);put(id+'/framework-terminal.json',{code:item.execution.runnerExitCode,signal:null});return put(id+'/execution.json',item.execution);});
  parent.baselineCheckpointDigest=readCallbackBaselineCheckpoint(directory,expected).checkpointDigest;
  removal.native.bindings=[put('baseline/candidate-write-denial.json',denial),put('baseline/candidate-lifecycle.json',lifecycle),put('baseline-owned-resources.json',registry)];parent.baselineRemoval=put('baseline-removal.json',removal);
  derivation.runtimeRecord=parent.faults[0].runtimeRecord;
  for(const [id,observation] of Object.entries(observations)){put(id+'/callback-ui-observation.json',observation);fs.writeFileSync(path.join(directory,id,'recipient-callback.jsonl'),observation.journal.map(row=>JSON.stringify(row)+'\n').join(''));}
  derivation.callbackObservations=callbackObservationReferences(directory);
  put('run.json',{schemaVersion:1,manifest:baseline.current,executionArtifacts,mutations:[{mutationId:c.CALLBACK_MUTATION,baselineInvocationId:'baseline',mutantInvocationId:c.CALLBACK_MUTATION,derivationArtifact:put(c.CALLBACK_MUTATION+'/derivation.json',derivation)}]});
  expected.callbackTransition=put('independent-callback-transition.json',parent);
  put(c.CALLBACK_MUTATION+'/candidate-write-denial.json',{...denial,candidateId:'e'.repeat(64)});put(c.CALLBACK_MUTATION+'/candidate-lifecycle.json',{...lifecycle,before:{...lifecycle.before,Id:'e'.repeat(64),Name:`/${input.runId}-${c.CALLBACK_MUTATION}-candidate`},after:{...lifecycle.after,Id:'e'.repeat(64),Name:`/${input.runId}-${c.CALLBACK_MUTATION}-candidate`}});
  const loaded=loadRunEvidence(path.join(directory,'run.json'),policy);expected.evidenceManifestDigest=loaded.evidenceManifestDigest;expected.receiptArtifactDigest=put('gate.json',loaded.receipt).digest;put('controller-terminal.json',{status:'completed',exitCode:loaded.receipt.verdict.exitCode,cleanupComplete:true});return loaded;
 };
 const loaded=write();
 return {observations,directory,policy,expected,input,request,runtimeRecord,variants,baseline,fault,registry,denial,lifecycle,removal,derivation,parent,put,write,faultIdentity,manifest:baseline.current,terminal:{code:loaded.receipt.verdict.exitCode,signal:null},result:{phase:'recipientCallback',status:loaded.receipt.verdict.status,exitCode:loaded.receipt.verdict.exitCode,receiptArtifactDigest:expected.receiptArtifactDigest,callbackTransition:expected.callbackTransition},loaded:()=>loadRunEvidence(path.join(directory,'run.json'),policy).input};
}
module.exports={createCallbackPhaseFixture};
