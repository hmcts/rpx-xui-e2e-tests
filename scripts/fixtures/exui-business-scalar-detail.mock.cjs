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
