exports.binding={runId:'synthetic-run',invocationId:'baseline',testId:'synthetic-framework-test',retry:0};
exports.nested=value=>({state:{case_data:{sodAdditionalRecipientsList:[{value:{emailInformation:value}}]}}});
exports.empty={state:{case_data:{sodAdditionalRecipientsList:[]}}};
exports.child={emailAddress:'PRIVATE_ADDRESS'};
exports.scope={visibleServices:['IA'],requestServices:['IA'],providerCodes:['BFA1'],responseStatus:200};
exports.recorded=proof=>{
 const field=value=>({state:'recorded',value}),absent={state:'not-reached'};
 return {schemaVersion:1,availability:'recorded',scalars:proof.startsWith('ccd-')?{
  emptyRecipientCount:field(0),emptyCollectionState:field('array'),emptySubmitStatus:field(201),recipientCount:field(1),emailAddressPresent:field(proof==='ccd-nested-roundtrip'),emailAddressState:field(proof==='ccd-nested-roundtrip'?'nonempty':'absent'),submitStatus:field(201)
 }:{visibleServices:field(proof==='wa-org-scope-ia'?['IA']:['IA','CIVIL']),requestServices:proof==='wa-org-scope-ia'?field(['IA']):absent,providerCodes:proof==='wa-org-scope-ia'?field(['BFA1']):absent,responseStatus:proof==='wa-org-scope-ia'?field(200):absent}};
};

// Pure display fixture only; original role replay and sealed carrier are tested separately.
exports.denialObservation=proof=>{
 const before={state:{case_data:{protectedValue:'PRIVATE_SYNTHETIC_PROTECTED'},version:1},history:[{id:'create'}]};
 const broadened=proof==='ccd-access-broadened',written=proof==='ccd-write-then-deny';
 return {complete:!broadened,before,deniedRead:broadened?200:403,
  deniedReadResponse:{status:broadened?200:403,presentMarkers:broadened?['protected-original']:[]},
  ...(broadened?{}:{deniedWrite:403,after:written?{state:{case_data:{protectedValue:'PRIVATE_SYNTHETIC_WRITTEN'},version:2},history:[{id:'create'},{id:'update'}]}:structuredClone(before)})};
};

exports.sealedDenialObservation=({binding,mutation,actorId})=>{
 const caseId='1234567890123456',before={state:{id:caseId,case_type_id:'HarnessNestedPRL',jurisdiction:'HARNESS',state:'Created',version:1,case_data:{protectedValue:'synthetic-protected-original',sodAdditionalRecipientsList:[]}},history:[{id:'create'}]};
 const response=(status,markers=[])=>({status,bodyBytes:0,bodyDigest:'sha256:'+'a'.repeat(64),presentMarkers:markers});
 const broadened=mutation==='ccd-broaden-access',written=mutation==='ccd-write-then-deny',after=structuredClone(before);
 if(written){after.state.case_data.protectedValue='must-never-persist';after.state.version=2;after.history.push({id:'update'});}
 return {schemaVersion:1,binding,caseId,actor:{id:actorId,roles:[]},before,complete:!broadened,deniedRead:broadened?200:403,deniedReadResponse:response(broadened?200:403,broadened?['protected-original']:[]),...(broadened?{}:{deniedWrite:403,deniedWriteResponse:response(403),after,auditOnlyExceptions:[]})};
};

// Exercise the unchanged production reporter; environment mutation is synchronous.
exports.emitActualDenialReport=async({contextPath,reportPath,tests,status})=>{
 const fs=require('node:fs'),{default:Reporter}=await import('../lib/exui-playwright-evidence-reporter.mjs');
 const priorContext=process.env.EXUI_EVIDENCE_CONTEXT,priorReport=process.env.EXUI_EVIDENCE_REPORT;
 try{
  process.env.EXUI_EVIDENCE_CONTEXT=contextPath;process.env.EXUI_EVIDENCE_REPORT=reportPath;
  const reporter=new Reporter();
  for(const row of tests){
   if(!['ccd-role-policy','ccd-access-broadened','ccd-write-then-deny','ccd-nested-roundtrip','wa-org-scope-ia'].includes(row.proofId)){reporter.tests.push(row);continue;}
   const error={message:'unit assertion',stack:'unit stack'},failed=row.status==='failed';
   reporter.onTestEnd({id:'unit-'+row.proofId,annotations:[{type:'harness-proof',description:row.proofId}],expectedStatus:'passed'},
    {status:row.status,retry:0,duration:1,attachments:[],errors:failed?[error]:[],steps:failed?[{category:'test.step',title:'harness-assertion:'+row.failureId,steps:[{category:'expect',title:'unit expect',error,steps:[]}]}]:[]});
  }
  reporter.onEnd({status});return JSON.parse(fs.readFileSync(reportPath,'utf8'));
 }finally{
  for(const[key,value]of [['EXUI_EVIDENCE_CONTEXT',priorContext],['EXUI_EVIDENCE_REPORT',priorReport]])if(value===undefined)delete process.env[key];else process.env[key]=value;
 }
};
