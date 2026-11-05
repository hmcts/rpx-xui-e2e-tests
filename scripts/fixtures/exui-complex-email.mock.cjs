exports.definition = (variant = 'baseline') => {
  const type = variant === 'email-type' ? 'Email' : 'Text';
  const nested = {id:'EmailInformation',type:'Complex',complex_fields:[{id:'emailAddress',label:'Email address',security_classification:'PUBLIC',field_type:{id:type,type}}]};
  return {id:'HarnessNestedPRL',version:{number:2},case_fields:[
    {id:'sodAdditionalRecipientsList',field_type:{type:'Collection',collection_field_type:{id:'ServeOrgDetails',type:'Complex',complex_fields:[{id:'emailInformation',field_type:nested}]}}},
    {id:'harnessEmailTypeProbe',field_type:structuredClone(nested)},
  ]};
};
exports.metadata = (variant = 'baseline') => [{case_type:'HarnessNestedPRL',version:2,field:'sodAdditionalRecipientsList',parent:'ServeOrgDetails',branch:'emailInformation',type:'EmailInformation',reference:'emailAddress',label:'Email address',field_type:variant==='email-type'?'Email':'Text',security:'PUBLIC',searchable:variant==='searchable',searchable_sql_type:'boolean'}];
exports.request = (variant, importStatus = 201) => (_state,_port,route) => {
  if(route==='/testing-support/accounts')return {status:201,body:{}};
  if(route==='/o/token')return {status:200,body:{access_token:'synthetic-private-token'}};
  if(route==='/details')return {status:200,body:{id:'synthetic-observer'}};
  if(route==='/testing-support/lease')return {status:200,body:'synthetic-service-token'};
  if(route==='/import')return {status:importStatus,body:{}};
  if(route==='/api/data/case-type/HarnessNestedPRL')return {status:200,body:exports.definition(variant)};
  throw Error('unexpected synthetic route');
};
exports.outcome = (variant = 'baseline') => ({
  terminal:{code:variant==='baseline'?0:1,signal:null},
  observed:{kind:'complex-email-text-observation',variant,runtimeAcceptance:false,catalogueCredit:false,releaseCredit:false,healthy:{status:201},probe:{validation:{status:variant==='baseline'?200:422}}},
  report:{errors:[],stats:{skipped:0},suites:[{specs:[{tests:[{results:[{retry:0,status:variant==='baseline'?'passed':'failed',...(variant==='baseline'?{}:{error:{message:'COMPLEX_EMAIL_SOURCE_TYPE_TIGHTENED'}})}]}]}]}]},
});
