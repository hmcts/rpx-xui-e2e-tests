const hash=n=>'sha256:'+String(n).padStart(64,'0');
async function fixture(){
 const mod=await import('../lib/exui-applicant-results-transition.mjs'),contract=await import('../lib/exui-applicant-results-contract.mjs');
 const dates=await import('../lib/exui-applicant-result-dates.mjs'),{digestBytes}=await import('../lib/exui-evidence-io.mjs');
 const runtime=(variant,index)=>{
  const ccd={ready:true,owner:'harness-'+String(index+1).padStart(16,'0'),namespace:String(index+1).padStart(64,'0'),images:{data:{id:hash(1)},definition:{id:hash(2)}}};
  const resultExpected={SEARCH:{},WORKBASKET:{}};const workbookDigest=contract.applicantResultWorkbookDigest(variant);
  return {runId:'ccd-00000000-0000-0000-0000-000000000001',releaseScopeId:contract.APPLICANT_RESULTS_SCOPE,variant,ccd,
   definition:{kind:'native-applicant-result-definition',variant,owner:ccd.owner,namespace:ccd.namespace,fixtureDigest:workbookDigest,sourceContract:contract.applicantResultsContract(),images:ccd.images,definitionVersion:1,observedDefinitionDigest:hash(5)},
   definitionImportDigest:hash(index+10),resultExpected,resultExpectedDigest:digestBytes(JSON.stringify(resultExpected)),resultDatesDigest:hash(6),resultDescriptorDigests:{definition:hash(5),search:hash(7),workbasket:hash(8)},
   storedResultDates:dates.applicantResultDateRecord(dates.expectedApplicantResultDates(1,variant),ccd,1,{variant,workbookDigest}),credentials:{allowed:{headers:{Authorization:'Bearer synthetic'}},observer:{headers:{Authorization:'Bearer synthetic'}}}};
 };
 const inputs=mod.applicantResultSequence.map(runtime);
 const record=index=>{const request=mod.applicantResultTransitionRequest(inputs[0],inputs[index].variant,inputs[index-1]);return {schemaVersion:1,runId:inputs[0].runId,invocationId:inputs[index].variant,request,requestDigest:digestBytes(JSON.stringify(request)),runtime:inputs[index]};};
 return {mod,inputs,record,digestBytes};
}
module.exports={fixture};
