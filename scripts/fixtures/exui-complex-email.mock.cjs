exports.definition = (variant = 'baseline') => {
  const type = variant === 'email-type' ? 'Email' : 'Text';
  const nested = {id:'EmailInformation',type:'Complex',complex_fields:[{id:'emailAddress',label:'Email address',security_classification:'PUBLIC',field_type:{id:type,type}}]};
  return {id:'HarnessNestedPRL',version:{number:2},case_fields:[
    {id:'sodAdditionalRecipientsList',field_type:{type:'Collection',collection_field_type:{id:'ServeOrgDetails',type:'Complex',complex_fields:[{id:'emailInformation',field_type:nested}]}}},
    {id:'harnessEmailTypeProbe',field_type:structuredClone(nested)},
  ]};
};
exports.metadata = (variant = 'baseline') => [{case_type:'HarnessNestedPRL',version:2,field:'sodAdditionalRecipientsList',parent:'ServeOrgDetails',branch:'emailInformation',type:'EmailInformation',reference:'emailAddress',label:'Email address',field_type:variant==='email-type'?'Email':'Text',security:'PUBLIC',searchable:variant==='searchable',searchable_sql_type:'boolean'}];
exports.request = (variant, importStatus = 201) => {
 const registered=new Set();
 const required=['caseworker','caseworker-harness','caseworker-harness-allowed','caseworker-harness-observer','caseworker-harness-denied','ccd-import'];
 return (_state,_port,route,options) => {
  if(route==='/testing-support/accounts')return {status:201,body:{}};
  if(route==='/o/token')return {status:200,body:{access_token:'synthetic-private-token'}};
  if(route==='/details')return {status:200,body:{id:'synthetic-observer'}};
  if(route==='/testing-support/lease')return {status:200,body:'synthetic-service-token'};
  if(route==='/api/user-role'){registered.add(options.body.role);return {status:201,body:{}};}
  if(route==='/import')return {status:required.every(role=>registered.has(role))?importStatus:400,body:{}};
  if(route==='/api/data/case-type/HarnessNestedPRL')return {status:200,body:exports.definition(variant)};
  throw Error('unexpected synthetic route');
 };
};
exports.outcome = (variant = 'baseline') => ({
  terminal:{code:variant==='baseline'?0:1,signal:null},
  observed:{kind:'complex-email-text-observation',variant,runtimeAcceptance:false,catalogueCredit:false,releaseCredit:false,healthy:{status:201},probe:{validation:{status:variant==='baseline'?200:422}}},
  report:{errors:[],stats:{skipped:0},suites:[{specs:[{tests:[{results:[{retry:0,status:variant==='baseline'?'passed':'failed',...(variant==='baseline'?{}:{error:{message:'COMPLEX_EMAIL_SOURCE_TYPE_TIGHTENED'}})}]}]}]}]},
});
exports.classification = (variant='baseline') => {
 const actorId='synthetic-actor',context={owner:'synthetic-owner',namespace:'a'.repeat(64),version:2};
 const journeys=['1234567890123456','1234567890123457'].map((caseId,index)=>{
  const rejected=index===1&&variant==='email-type';
  const recipients=rejected?[]:[0,1].map(n=>({id:`recipient-${index}-${n}`,value:{emailInformation:{emailName:`Synthetic ${n}`,emailAddress:`person${n}@harness.example.com`}}}));
  return {caseId,before:{state:{case_data:{sodAdditionalRecipientsList:[]},data_classification:{}}},after:{state:{version:rejected?1:2,case_data:{sodAdditionalRecipientsList:recipients},data_classification:{}}}};
 });
 const observed={variant,actorId,healthy:journeys[0],probe:journeys[1]};
 const rows=journeys.map((j,index)=>({reference:j.caseId,case_type:'HarnessNestedPRL',jurisdiction:'HARNESS',version:j.after.state.version,data:structuredClone(j.after.state.case_data),data_classification:{sodAdditionalRecipientsList:{classification:'PUBLIC',value:j.after.state.case_data.sodAdditionalRecipientsList.map(r=>({id:r.id,value:{emailInformation:{classification:'PUBLIC',value:{emailName:'PUBLIC',emailAddress:'PUBLIC'}}}}))}},events:(index===1&&variant==='email-type'?['create']:['create','update']).map(event_id=>({event_id,case_type_id:'HarnessNestedPRL',case_type_version:2,user_id:actorId}))}));
 return {observed,rows,context};
};

// Exercise the unchanged runner body with inert dependencies; no Docker/browser launch.
exports.runFeasibilityCleanup = async function(root,mode,scenario='complex-email-text',sourceOverride) {
 const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
 const repo=path.resolve(__dirname,'../..'),source=sourceOverride??fs.readFileSync(path.join(repo,'scripts/run-harness-recipient-callback-ui.mjs'),'utf8');
 const start=source.indexOf('export async function runCallbackUi('),end=source.indexOf('\nif(process.argv',start);assert(start>=0&&end>start);
 const {cleanupCiCcd}=await import('../lib/exui-candidate-ci-process.mjs');
 const {writeJsonAtomic,digestBytes}=await import('../lib/exui-evidence-io.mjs');
 const calls=[],output=path.join(root,'output');let held;
 const fail=()=>{throw Error('CONTROLLED_IMPORT_FAILURE');};
 const context={assert,fs,path,root:repo,process,randomUUID:()=> 'fixed',SELECTOR_EVENT_VARIANTS:['baseline'],CALLBACK_UI_SOURCES:[],writeJsonAtomic,digestBytes,
  verifyCandidateArtifact:async()=>({candidateRoot:root,provenance:{platform:'linux/arm64'}}),createFreshHarnessOutput:p=>{fs.mkdirSync(p);return p;},
  verifyHarnessDependencies:async()=>{if(mode==='no-start')throw Error('CONTROLLED_NO_START');return{};},assertCandidateConfigurationSources:()=>{},digestCandidateTree:async()=> 'digest',read:()=>({browsers:[{name:'chromium-headless-shell'}]}),
  startCcdRuntime:async(directory,options)=>{calls.push('start');
   if(mode==='precreation-missing')throw Error('CONTROLLED_BEFORE_CREATE');
   if(mode==='created-missing'){(options.runDocker??context.docker)(['create','synthetic-image']);throw Error('CONTROLLED_AFTER_CREATE');}
   if(mode==='throwing-create-complete'||mode==='invalid-create-complete'){(options.runDocker??context.docker)(['create','synthetic-image']);throw Error('CONTROLLED_CREATE_NOT_REJECTED');}
   if(mode==='started-incomplete'){fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(directory+'/recovery.json','{}');}
   return {output:directory};},
  docker:args=>{assert.equal(args[0],'create');calls.push('create');if(mode==='throwing-create-complete')throw Error('CONTROLLED_CREATE_FAILURE');return mode==='invalid-create-complete'?'not-a-container-id':'a'.repeat(64);},
  prepareComplexEmailImport:async()=>{},prepareRecipientCallbackImport:async()=>{},
  importComplexEmail:fail,importRecipientCallback:fail,
  cleanupCiCcd:directory=>{calls.push('cleanup');if(['started-complete','throwing-create-complete','invalid-create-complete','host-retry'].includes(mode))return{cleanupComplete:true};if(mode==='started-incomplete')return{cleanupComplete:false};return cleanupCiCcd(directory,{inspect:()=>assert.fail('unexpected Docker'),stop:()=>assert.fail('unexpected Docker')});},
  removeHostResource:async(resources,key)=>{calls.push('remove-host');if(mode==='host-stop-failure')throw Error('CONTROLLED_UNOBSERVED_STOP');resources.delete(key);},callbackUiFailureCode:()=> 'CONTROLLED',classifyNativeFailure:()=>({reason:'CONTROLLED'})
 };
 if(['host-retry','host-stop-failure'].includes(mode)) {
  context.importComplexEmail=async state=>{fs.mkdirSync(state.output+'/complex-email-import',{recursive:true});fs.writeFileSync(state.output+'/complex-email-import/receipt.json','{}');return{seal:{definitionDigest:'digest'},observations:{definition:{body:{version:{number:1}}}}};};
  Object.assign(context,{validateComplexEmailDefinition:()=>({}),ccdCredentials:()=>({}),ccdRequest:()=>({status:200,body:{}}),browserExecutable:()=> 'browser',inspectNativeApiRuntime:()=>({}),inspectNativeBrowserRuntime:()=>({}),nativeContainerPlan:()=>({tools:{args:['scripts/run-harness-native-tools.mjs']}}),nativeIdentity:()=>({identity:{}}),
   createCallbackNativeWorkspace:()=>{const workspace=path.join(root,'workspace');fs.mkdirSync(workspace);return{workspace,stagedHarness:workspace,stateRoot:workspace};},
   runHostInvocation:async(_plan,{resources})=>{held=resources;resources.set('retained',{kind:'container'});if(mode==='host-stop-failure')resources.set('process',{kind:'process'});throw new AggregateError([Error('CONTROLLED_FIRST_CLEANUP')],'HOST_OWNED_RESOURCE_CLEANUP_FAILED');}
  });
 }
 const run=new Function(...Object.keys(context),source.slice(start,end).replace(/^export /,'')+';return runCallbackUi;')(...Object.values(context));
 const receipt=await run({candidate:path.join(root,'candidate.json'),browser:root,output,scenario});
 return {receipt,calls,retained:held?.size,workspaceExists:fs.existsSync(path.join(root,'workspace'))};
};
