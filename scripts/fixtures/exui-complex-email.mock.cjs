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
