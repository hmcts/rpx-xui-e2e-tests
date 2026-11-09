const test=require('node:test');
const assert=require('node:assert/strict');

test('FR profile is the exact candidate-bound jurisdiction, staff and ABA2 obligation',async()=>{
 const contract=await import('./lib/exui-fr-profile-contract.mjs');
 const catalogue=await import('./lib/exui-configuration-runtime-coverage.mjs');
 const {catalogue:built}=catalogue.loadCommittedConfigurationCatalogue();
 const row=built.obligations.filter(item=>item.id===contract.FR_PROFILE_ID);
 assert.equal(row.length,1);
 assert.deepEqual(row[0],{id:contract.FR_PROFILE_ID,family:'FR',kind:'configuration-profile',requiredBoundary:'candidate',sourceKeys:['rpx-xui-webapp:config/default.json','rpx-xui-webapp:config/default.json']});
 assert.deepEqual(contract.FR_PROFILE_FACETS.map(item=>item.facet),['fr-jurisdiction','fr-staff','fr-mapping']);
 const profile=contract.frProfileContract();
 assert.deepEqual(profile.capabilities,['jurisdictions','staffSupportedJurisdictions','serviceRefDataMapping']);
 assert.equal(profile.family,'FR');
 for(const key of ['globalSearchServices','waSupportedJurisdictions','services.hearings.hearingsJurisdictions']) assert(profile.noClaims.includes(key));
 assert.equal(profile.releaseCredit,false);assert.equal(profile.releaseApproval,false);
});

test('FR source projection rejects drift and each mutation changes only its declared capability',async()=>{
 const {frProfileConfiguration,FR_PROFILE_FACETS}=await import('./lib/exui-fr-profile-contract.mjs');
 const config={jurisdictions:'DIVORCE,PROBATE,FR,PUBLICLAW,IA,SSCS,EMPLOYMENT,HRS,CIVIL,CMC,PRIVATELAW,PCS',globalSearchServices:'IA',waSupportedJurisdictions:'IA',staffSupportedJurisdictions:'ST_CIC,CIVIL,EMPLOYMENT,PRIVATELAW,PUBLICLAW,IA,SSCS,DIVORCE,FR,PROBATE,HRS,PCS',serviceRefDataMapping:[{service:'FR',serviceCodes:['ABA2']},{service:'IA',serviceCodes:['BFA1']}],services:{hearings:{hearingsJurisdictions:'SSCS,PRIVATELAW,CIVIL,IA'}}};
 for(const {facet,fault} of FR_PROFILE_FACETS){
  const baseline=frProfileConfiguration(config,facet),mutant=frProfileConfiguration(config,facet,fault);
  assert.deepEqual(baseline.config,config);
  const key={ 'fr-jurisdiction':'jurisdictions','fr-staff':'staffSupportedJurisdictions','fr-mapping':'serviceRefDataMapping'}[facet];
  const expected=structuredClone(config);
  if(key==='serviceRefDataMapping')expected.serviceRefDataMapping[0].serviceCodes=['ZZZ1'];
  else expected[key]=expected[key].split(',').filter(value=>value!=='FR').join(',');
  assert.deepEqual(mutant.config,expected);
  assert.throws(()=>frProfileConfiguration(config,facet,'foreign-fault'));
 }
 assert.throws(()=>frProfileConfiguration({...config,globalSearchServices:'FR,IA'},'fr-staff'),'FR_PROFILE_SOURCE_INVALID');
 assert.doesNotThrow(()=>frProfileConfiguration({...config,globalSearchServices:'FRANCE,IA'},'fr-staff'));
 assert.throws(()=>frProfileConfiguration({...config,waSupportedJurisdictions:'FR,IA'},'fr-staff'),'FR_PROFILE_SOURCE_INVALID');
 assert.throws(()=>frProfileConfiguration({...config,serviceRefDataMapping:[{service:'FR',serviceCodes:['ABA1']}]},'fr-mapping'),'FR_PROFILE_SOURCE_INVALID');
});

test('FR jurisdiction obligation checks FR membership and leaves other jurisdiction rows out of scope',async()=>{
 const {frProfileEvidence,validateFrProfileObservations,FR_PROFILE_FACETS}=await import('./lib/exui-source-profile-fr-consumers.mjs');
 for(const {facet,fault} of FR_PROFILE_FACETS.filter(item=>item.facet==='fr-jurisdiction')){
  const baseline=frProfileEvidence(facet),mutant=frProfileEvidence(facet,fault);
  for(const evidence of [baseline,mutant])for(const observation of evidence.observations)observation.body.push({id:'ST_CIC',name:'Synthetic out-of-scope ST_CIC'},{id:'UNREVIEWED',name:'Synthetic out-of-scope UNREVIEWED'});
  assert.equal(validateFrProfileObservations(facet,baseline.observations,baseline.journal).catalogueCredit,false);
  assert.throws(()=>validateFrProfileObservations(facet,mutant.observations,mutant.journal,fault),/FR_PROFILE_MEMBERSHIP_ASSERTION/);
 }
 for(const {facet,fault} of FR_PROFILE_FACETS.filter(item=>item.facet==='fr-staff')){
  const baseline=frProfileEvidence(facet),mutant=frProfileEvidence(facet,fault);
  assert.equal(validateFrProfileObservations(facet,baseline.observations,baseline.journal).catalogueCredit,false);
  const assertion=facet==='fr-mapping'?'FR_PROFILE_MAPPING_ASSERTION':'FR_PROFILE_MEMBERSHIP_ASSERTION';
  assert.throws(()=>validateFrProfileObservations(facet,mutant.observations,mutant.journal,fault),e=>e.message===assertion);
  assert.throws(()=>validateFrProfileObservations(facet,baseline.observations,baseline.journal,fault),e=>e.message!==assertion);
  const altered=structuredClone(baseline);altered.journal.push(altered.journal[0]);
  assert.throws(()=>validateFrProfileObservations(facet,altered.observations,altered.journal),e=>!/^FR_PROFILE_.*ASSERTION$/.test(e.message));
 }
});

test('FR live membership mismatch keeps its specific diagnostic code',async()=>{
 const {profileFailureCode}=await import('./lib/exui-source-profile-sources.mjs');
 assert.equal(profileFailureCode(new Error('FR_PROFILE_MEMBERSHIP')),'FR_PROFILE_MEMBERSHIP');
});

test('FR mutation mismatch reports expected and observed jurisdiction ids',async t=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
 const {validateProfileInvocationResult}=await import('./run-harness-source-profile-jurisdictions.mjs');
 const {frProfileEvidence,FR_PROFILE_FACETS}=await import('./lib/exui-source-profile-fr-consumers.mjs');
 const directory=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'fr-membership-diagnostic-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const facet='fr-jurisdiction',mutation=FR_PROFILE_FACETS.find(item=>item.facet===facet).fault,identity={webappCommit:'a'.repeat(40)},configDigest='sha256:'+'b'.repeat(64),sourceDigest='sha256:'+'c'.repeat(64);
 const observations=frProfileEvidence(facet,mutation).observations;observations[0].body.push({id:'FR'},{id:'ST_CIC'},{id:'UNREVIEWED'});
 fs.writeFileSync(path.join(directory,'profile-worker-result.json'),JSON.stringify({schemaVersion:1,status:'failed',invocationId:mutation,mutation,code:'FR_PROFILE_MEMBERSHIP',identity,configDigest,sourceDigest,runtimeAcceptance:false,catalogueCredit:false,wholeProfileSatisfied:false,releaseCredit:false}));
 fs.writeFileSync(path.join(directory,'profile-fr-observations.json'),JSON.stringify({observations}));
 assert.throws(()=>validateProfileInvocationResult({directory,invocationId:mutation,mutation,identity,configDigest,sourceDigest,terminal:{code:2,signal:null},facet}),error=>{
  assert.equal(error.message,'FR_PROFILE_MEMBERSHIP');
  assert.equal(error.frProfileDiagnostic.reasonCode,'FR_PROFILE_MEMBERSHIP');
  assert(!error.frProfileDiagnostic.expectedIds.includes('FR'));
  assert(error.frProfileDiagnostic.observedIds.includes('FR'));
  assert.deepEqual(error.frProfileDiagnostic.unexpectedIds,['FR','ST_CIC','UNREVIEWED']);
  return true;
 });
});

test('FR ABA2 mapping proof checks the actual consumers and its exact one-code fault',async()=>{
 const {frProfileEvidence,validateFrProfileObservations,FR_PROFILE_FACETS}=await import('./lib/exui-source-profile-fr-consumers.mjs');
 const {fault}=FR_PROFILE_FACETS.find(item=>item.facet==='fr-mapping');
 const baseline=frProfileEvidence('fr-mapping'),mutant=frProfileEvidence('fr-mapping',fault);
 assert.equal(validateFrProfileObservations('fr-mapping',baseline.observations,baseline.journal).catalogueCredit,false);
 assert.throws(()=>validateFrProfileObservations('fr-mapping',mutant.observations,mutant.journal,fault),/FR_PROFILE_MAPPING_ASSERTION/);
 for(let index=0;index<mutant.observations.length;index++){
  const altered=structuredClone(mutant);altered.observations[index].body=[];
  assert.throws(()=>validateFrProfileObservations('fr-mapping',altered.observations,altered.journal,fault),e=>e.message!=='FR_PROFILE_MAPPING_ASSERTION');
 }
});

test('FR admission credits one exact profile only after all facets and same-candidate native join',async t=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),root=fs.realpathSync(fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'fr-admission-failure-test-')));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const admission=await import('./lib/exui-fr-profile-admission.mjs');
 const {runFrProfileAdmission}=await import('./run-harness-fr-profile-admission.mjs');
 const {FR_PROFILE_FACETS,FR_PROFILE_ID,frProfileContract,frProfileContractDigest}=await import('./lib/exui-fr-profile-contract.mjs');
 const {digestBytes}=await import('./lib/exui-evidence-io.mjs');
 const {NATIVE_HARNESS_SOURCE_FILES}=await import('./lib/exui-native-sources.mjs');
 const {nativeInventoryDigest}=await import('./lib/exui-divorce-native-binding.mjs');
 const {catalogue}=await import('./lib/exui-configuration-runtime-coverage.mjs').then(module=>module.loadCommittedConfigurationCatalogue());
 const hash=letter=>'sha256:'+String(letter).slice(-1).repeat(64),commit='a'.repeat(40),artifactDigest=hash('b'),runtime={reference:'example.invalid/candidate@sha256:'+('c'.repeat(64)),imageId:hash('d'),platform:'linux/arm64'};
 const candidate={identity:{artifactDigest,webappCommit:frProfileContract().consumerRevision},payloadDigest:hash('e'),provenance:{webappCommit:frProfileContract().consumerRevision,platform:'linux/arm64'}};
 const artifact={identity:candidate.identity,payloadDigest:candidate.payloadDigest,provenance:candidate.provenance};
 const files=Object.fromEntries(NATIVE_HARNESS_SOURCE_FILES.map((name,index)=>[name,hash(String(index%9+1))])),producer={commit,files,sourceDigest:nativeInventoryDigest(files)};
 const catalogueDigest=digestBytes(JSON.stringify(catalogue.obligations));
 const profile={schemaVersion:1,kind:'fr-profile-cohort',status:'validated-for-admission',runId:'fr-00000000-0000-4000-8000-000000000001',obligationId:FR_PROFILE_ID,family:'FR',contract:frProfileContract(),contractDigest:frProfileContractDigest(),candidate,producer,sourceDefault:{revision:frProfileContract().sourceRevision,digest:frProfileContract().sourceDigest},runtime,nativeBindingDigest:hash('1'),catalogueDigest,cohortDigest:hash('2'),facets:FR_PROFILE_FACETS.map((item,index)=>({facet:item.facet,receiptDigest:hash(String(index+3)),baseline:{status:'observed',configDigest:hash(String(index+6)),observationsDigest:hash(String(index+9)),journalDigest:hash(String(index+2))},fault:{status:'expected-fault-observed',configDigest:hash(String(index+4)),observationsDigest:hash(String(index+7)),journalDigest:hash(String(index+1))}}))};
 const nativeContext={binding:{producer,candidate,runtime,sourceDefault:profile.sourceDefault,catalogue:{obligationsDigest:catalogueDigest}},expected:{harnessCommit:commit,candidateArtifactDigest:artifactDigest,jobRunId:'ci-00000000-0000-4000-8000-000000000001'}};
 const result=admission.admitFrProfile(profile,nativeContext,catalogue);
 assert.equal(result.accepted,1);assert.equal(result.joint.status,'included');assert.equal(result.releaseApproval,false);
 assert.deepEqual(result.joint.sourceKeys,['rpx-xui-webapp:config/default.json','rpx-xui-webapp:config/default.json']);
 for(const mutate of [value=>value.facets.pop(),value=>value.family='DIVORCE',value=>value.facets[0].fault.status='observed',value=>value.facets[1].fault.configDigest=value.facets[1].baseline.configDigest]){
  const invalid=structuredClone(profile);mutate(invalid);assert.throws(()=>admission.admitFrProfile(invalid,nativeContext,catalogue),/FR_PROFILE_ADMISSION_INVALID/);
 }
 const foreign={...nativeContext,expected:{...nativeContext.expected,candidateArtifactDigest:hash('9')}};
 assert.equal(admission.admitFrProfile(profile,foreign,catalogue).accepted,0);
 const oldCatalogue={...nativeContext,binding:{...nativeContext.binding,catalogue:{obligationsDigest:hash('8')}}};
 assert.equal(admission.admitFrProfile(profile,oldCatalogue,catalogue).accepted,0);
 const wrongCatalogue={...catalogue,obligations:catalogue.obligations.filter(item=>item.id!==FR_PROFILE_ID)};
 assert.throws(()=>admission.admitFrProfile(profile,nativeContext,wrongCatalogue),/FR_PROFILE_ADMISSION_INVALID/);
 const blockedDiagnostic={schemaVersion:1,kind:'fr-jurisdiction-filter-diagnostic',reasonCode:'FR_PROFILE_OBSERVATIONS',expectedIds:['FR'],observedIds:['FR','ST_CIC'],unexpectedIds:['ST_CIC'],missingIds:[]};let failedFacets=0;
 await assert.rejects(runFrProfileAdmission({artifactPath:path.join(root,'candidate.json'),output:path.join(root,'blocked'),nativeContext},{verifyArtifact:async()=>artifact,inspectRuntime:()=>runtime,runFacet:async()=>{failedFacets++;return{status:'failed',cleanup:{complete:true},privateStateRemoved:true,failure:{code:'FR_PROFILE_OBSERVATIONS',diagnostic:blockedDiagnostic}};}}),error=>{assert.equal(error.message,'FR_PROFILE_OBSERVATIONS');assert.equal(error.frProfileCleanupVerified,true);assert.equal(error.frProfileAttempt.status,'BLOCKED');assert.deepEqual(error.frProfileDiagnostic,blockedDiagnostic);assert.deepEqual(error.frProfileAttempt.diagnostic,blockedDiagnostic);return true;});
 assert.equal(failedFacets,2);
 await assert.rejects(runFrProfileAdmission({artifactPath:path.join(root,'candidate.json'),output:path.join(root,'unclean-sibling'),nativeContext},{verifyArtifact:async()=>artifact,inspectRuntime:()=>runtime,runFacet:async({facet})=>({status:'failed',cleanup:{complete:facet==='fr-jurisdiction'},privateStateRemoved:facet==='fr-jurisdiction',failure:{code:'FR_PROFILE_OBSERVATIONS',diagnostic:blockedDiagnostic}})}),error=>{assert.equal(error.frProfileCleanupVerified,undefined);assert.equal(error.frProfileAttempt,undefined);return true;});
});

test('FR runtime probes call only the declared candidate consumers with FR and ABA2 evidence',async t=>{
 const {frProfileEvidence,probeFrProfileConsumers,FR_PROFILE_FACETS}=await import('./lib/exui-source-profile-fr-consumers.mjs');
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),root=fs.mkdtempSync(path.join(os.tmpdir(),'fr-profile-probe-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 for(const {facet,fault} of FR_PROFILE_FACETS)for(const mutation of [null,fault]){
  const expected=frProfileEvidence(facet,mutation),output=path.join(root,facet,mutation??'baseline');fs.mkdirSync(output,{recursive:true});let calls=0,journal=[];
  const request=async(url,options)=>{
   assert.equal(new URL(url).origin,'http://127.0.0.1:3100');
   const index=calls++,body=expected.observations[index].body;
   if(facet==='fr-jurisdiction')journal.push(expected.journal[index]);
   else if(facet==='fr-staff'&&index===1)journal=structuredClone(expected.journal);
   else if(facet==='fr-mapping'&&index>0)journal=structuredClone(expected.journal.slice(0,expected.observations[index].outboundCount));
   return {status:200,headers:{getSetCookie:()=>index===0?['XSRF-TOKEN=synthetic-token; Path=/']:[]},json:async()=>structuredClone(body)};
  };
  if(mutation)await assert.rejects(probeFrProfileConsumers({facet,cookie:'synthetic-session',output,readJournal:()=>structuredClone(journal),mutation,request}),new RegExp(facet==='fr-mapping'?'FR_PROFILE_MAPPING_ASSERTION':'FR_PROFILE_MEMBERSHIP_ASSERTION'));
  else await probeFrProfileConsumers({facet,cookie:'synthetic-session',output,readJournal:()=>structuredClone(journal),request});
  assert.equal(calls,facet==='fr-jurisdiction'?6:facet==='fr-staff'?3:8);
  const saved=JSON.parse(fs.readFileSync(path.join(output,'profile-fr-observations.json')));
  assert.deepEqual(saved.journal,expected.journal);
  if(facet==='fr-jurisdiction')assert.deepEqual(saved.journal.map(row=>row.access),['create','read','default','create','read','default']);
  if(facet==='fr-mapping')assert(saved.journal.every(row=>!JSON.stringify(row).includes('DIVORCE')&& !JSON.stringify(row).includes('ABA1')));
  if(facet==='fr-staff')assert(saved.observations[1].body.some(row=>row.service==='FR')===!mutation);
 }
});

test('FR jurisdiction diagnostics identify unexpected configured-list results without copying response rows',async()=>{
 const {frProfileEvidence,frJurisdictionFilterDiagnostic}=await import('./lib/exui-source-profile-fr-consumers.mjs');
 const expected=frProfileEvidence('fr-jurisdiction').observations[0].body;
 const diagnostic=frJurisdictionFilterDiagnostic([{body:[...expected,{id:'ST_CIC'},{id:'UNREVIEWED'}]}]);
 assert.deepEqual(diagnostic,{schemaVersion:1,kind:'fr-jurisdiction-filter-diagnostic',reasonCode:'FR_PROFILE_OBSERVATIONS',expectedIds:expected.map(row=>row.id).sort(),observedIds:[...expected.map(row=>row.id),'ST_CIC','UNREVIEWED'].sort(),unexpectedIds:['ST_CIC','UNREVIEWED'],missingIds:[]});
 assert.throws(()=>frJurisdictionFilterDiagnostic([{body:[{id:'private-user@example.invalid'}]}]),/FR_PROFILE_OBSERVATIONS/);
});

test('FR runner and raw reader pin one request, catalogue and native binding with separate cohorts receiving zero credit',async t=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
 const {runFrProfileAdmission,readFrProfileAdmissionPacket}=await import('./run-harness-fr-profile-admission.mjs');
 const {NATIVE_HARNESS_SOURCE_FILES}=await import('./lib/exui-native-sources.mjs');
 const {nativeInventoryDigest}=await import('./lib/exui-divorce-native-binding.mjs');
 const {FR_PROFILE_FACETS,frProfileContract}=await import('./lib/exui-fr-profile-contract.mjs');
 const {catalogue}=await import('./lib/exui-configuration-runtime-coverage.mjs').then(module=>module.loadCommittedConfigurationCatalogue());
 const {digestBytes}=await import('./lib/exui-evidence-io.mjs');
 const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'fr-admission-test-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const hash=letter=>'sha256:'+String(letter).slice(-1).repeat(64),commit='a'.repeat(40),runtime={reference:'example.invalid/candidate@sha256:'+('c'.repeat(64)),imageId:hash('d'),platform:'linux/arm64'};
 const files=Object.fromEntries(NATIVE_HARNESS_SOURCE_FILES.map((name,index)=>[name,hash(String(index%9+1))])),producer={commit,files,sourceDigest:nativeInventoryDigest(files)};
 const candidate={identity:{artifactDigest:hash('b'),webappCommit:frProfileContract().consumerRevision},payloadDigest:hash('e'),provenance:{webappCommit:frProfileContract().consumerRevision,platform:'linux/arm64'}};
 const binding={producer,candidate,runtime,sourceDefault:{path:'config/default.json',revision:frProfileContract().sourceRevision,digest:frProfileContract().sourceDigest},catalogue:{obligationsDigest:digestBytes(JSON.stringify(catalogue.obligations))}};
 const nativeContext={binding,expected:{harnessCommit:commit,candidateArtifactDigest:candidate.identity.artifactDigest,jobRunId:'ci-00000000-0000-4000-8000-000000000001',nativeCohortBinding:{digest:hash('7')}}};
 const artifact={identity:candidate.identity,payloadDigest:candidate.payloadDigest,provenance:candidate.provenance};let activeArtifact=artifact,active=0,maxActive=0,startedFacets=[];
 const runFacet=async({output,facet})=>{
  active++;maxActive=Math.max(maxActive,active);startedFacets.push(facet);
  try{
  await new Promise(resolve=>setTimeout(resolve,15));
  fs.mkdirSync(output,{recursive:true});const fault=FR_PROFILE_FACETS.find(item=>item.facet===facet).fault;
  const row=(invocationId,status,code)=>({invocationId,status,code,configDigest:hash(invocationId==='baseline'?'1':'2'),observationsDigest:hash('3'),journalDigest:hash('4')});
  const receipt={status:'feasibility-observed',cleanup:{complete:true},privateStateRemoved:true,artifact:activeArtifact.identity,harnessCommit:commit,sources:{files},runtime,configuration:{baseline:{digest:hash('1')},[fault]:{digest:hash('2')}},invocations:[row('baseline','observed',null),row(fault,'expected-fault-observed',`FR_PROFILE_${facet==='fr-mapping'?'MAPPING':'MEMBERSHIP'}_ASSERTION`)]};
  fs.writeFileSync(path.join(output,'profile-feasibility.json'),JSON.stringify(receipt));return receipt;
  }finally{active--;}
 };
 const output=path.join(root,'cohort'),result=await runFrProfileAdmission({artifactPath:path.join(root,'candidate.json'),output,nativeContext},{verifyArtifact:async()=>artifact,inspectRuntime:()=>runtime,runFacet});
 assert.equal(maxActive,2);assert.equal(startedFacets.length,FR_PROFILE_FACETS.length);
 assert.equal(result.accepted,1);assert.deepEqual(Object.keys(result.reportRequest).sort(),['digest','path','runId']);
 const packet=readFrProfileAdmissionPacket(result.reportRequest.path,{runId:result.reportRequest.runId,digest:result.reportRequest.digest},nativeContext,catalogue);
 assert.equal(packet.joint.status,'included');assert.equal(packet.admission.accepted,1);
 active=0;maxActive=0;startedFacets=[];let gateReached=false;
 const scheduledOutput=path.join(root,'scheduled'),scheduled=await runFrProfileAdmission({artifactPath:path.join(root,'candidate.json'),output:scheduledOutput,nativeContext},{verifyArtifact:async()=>artifact,inspectRuntime:()=>runtime,runFacet,beforeNextBatch:async()=>{gateReached=true;assert.equal(active,0);assert.deepEqual(startedFacets,['fr-jurisdiction']);}});
 assert.equal(gateReached,true);assert.equal(maxActive,2);assert.deepEqual(startedFacets,FR_PROFILE_FACETS.map(item=>item.facet));assert.equal(scheduled.accepted,1);
 const foreignArtifact={...artifact,identity:{...artifact.identity,artifactDigest:hash('9')}};
 activeArtifact=foreignArtifact;
 const separateOutput=path.join(root,'separate'),separateResult=await runFrProfileAdmission({artifactPath:path.join(root,'foreign-candidate.json'),output:separateOutput,nativeContext},{verifyArtifact:async()=>foreignArtifact,inspectRuntime:()=>runtime,runFacet});
 assert.equal(separateResult.accepted,0);
 const separate=readFrProfileAdmissionPacket(separateResult.reportRequest.path,{runId:separateResult.reportRequest.runId,digest:separateResult.reportRequest.digest},nativeContext,catalogue);
 assert.equal(separate.joint.status,'separate');assert.equal(separate.admission.accepted,0);
 assert.throws(()=>readFrProfileAdmissionPacket(result.reportRequest.path,{runId:result.reportRequest.runId,digest:hash('0')},nativeContext,catalogue),/FR_PROFILE_RUN_INVALID/);
});

test('FR synthetic staff provider answers only the source-defined family list',async t=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
 const {handleDivorceProvider}=await import('./lib/exui-source-profile-divorce-provider.mjs');
 const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'fr-provider-test-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const journal=[],invoke=async csv=>{
  const request={method:'GET',url:`/refdata/internal/staff/usersByServiceName?ccd_service_names=${csv}&page_size=100000`,headers:{},async *[Symbol.asyncIterator](){}};
  let body;const response={writeHead(){},end(value){body=value;}};
  const handled=await handleDivorceProvider(request,response,{facet:'staff',family:'FR',journal,output:root});
  return {handled,body:body?JSON.parse(body):undefined};
 };
 const exact='ST_CIC,CIVIL,EMPLOYMENT,PRIVATELAW,PUBLICLAW,IA,SSCS,DIVORCE,FR,PROBATE,HRS,PCS';
 const expected=await invoke(exact),wrong=await invoke(exact.replace(',PCS',''));
 assert.equal(expected.handled,true);assert.deepEqual(expected.body.map(row=>row.ccd_service_name),['FR','IA']);assert.equal(wrong.handled,false);
});

test('FR synthetic mapping provider serves ABA2 and controlled ZZZ1 only',async t=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
 const {handleDivorceProvider}=await import('./lib/exui-source-profile-divorce-provider.mjs');
 const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'fr-mapping-provider-test-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const journal=[],invoke=async serviceCode=>{
  const body=JSON.stringify({searchString:'Synthetic',serviceCode}),request={method:'POST',url:'/refdata/judicial/users/search',headers:{},async *[Symbol.asyncIterator](){yield Buffer.from(body);}};
  let value;const response={writeHead(){},end(raw){value=JSON.parse(raw);}};
  const handled=await handleDivorceProvider(request,response,{facet:'mapping',family:'FR',serviceCode:'ABA2',journal,output:root});
  return {handled,value};
 };
 const baseline=await invoke('ABA2'),fault=await invoke('ZZZ1'),foreign=await invoke('ABA1');
 assert.equal(baseline.handled,true);assert.equal(baseline.value[0].idamId,'judicial-ABA2');
 assert.equal(fault.handled,true);assert.equal(fault.value[0].idamId,'judicial-ZZZ1');assert.equal(foreign.handled,false);
});
