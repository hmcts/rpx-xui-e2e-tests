const test=require('node:test');
const assert=require('node:assert/strict');

test('CMC profile pins one candidate jurisdiction catalogue row and no other capabilities',async()=>{
 const contract=await import('./lib/exui-cmc-profile-contract.mjs');
 const {catalogue}=await import('./lib/exui-configuration-runtime-coverage.mjs').then(module=>module.loadCommittedConfigurationCatalogue());
 const rows=catalogue.obligations.filter(row=>row.id===contract.CMC_PROFILE_ID);
 assert.equal(rows.length,1);
 assert.deepEqual(rows[0],{id:contract.CMC_PROFILE_ID,family:'CMC',kind:'configuration-profile',requiredBoundary:'candidate',sourceKeys:['rpx-xui-webapp:config/default.json','rpx-xui-webapp:config/default.json']});
 const profile=contract.cmcProfileContract();
 assert.deepEqual(profile.capabilities,['jurisdictions']);
 assert.equal(profile.family,'CMC');assert.equal(profile.releaseCredit,false);assert.equal(profile.releaseApproval,false);
 assert(profile.noClaims.includes('production CMC readiness'));
});

test('CMC candidate configuration fault removes only CMC from jurisdiction selection',async()=>{
 const {projectCmcJurisdiction,CMC_PROFILE_FACET}=await import('./lib/exui-cmc-profile-contract.mjs');
 const source=JSON.parse(require('node:fs').readFileSync('./scripts/fixtures/exui-configuration-source.json')).sources.find(row=>row.path==='config/default.json').document;
 const baseline=projectCmcJurisdiction(source),mutant=projectCmcJurisdiction(source,CMC_PROFILE_FACET.fault);
 assert(baseline.jurisdictions.split(',').includes('CMC'));
 assert.deepEqual(mutant.jurisdictions.split(','),baseline.jurisdictions.split(',').filter(id=>id!=='CMC'));
 assert.deepEqual({...mutant,jurisdictions:baseline.jurisdictions},{...baseline});
});

test('CMC profile runner binds its configured mutation to the expected candidate jurisdiction delta',async t=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{runSourceProfileFeasibility}=await import('./run-harness-source-profile-jurisdictions.mjs');
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'cmc-runner-config-'))),candidateRoot=path.join(root,'candidate'),configDir=path.join(candidateRoot,'config'),output=path.join(root,'profile');t.after(()=>fs.rmSync(root,{recursive:true,force:true}));fs.mkdirSync(configDir,{recursive:true});
 const source=structuredClone(JSON.parse(fs.readFileSync('./scripts/fixtures/exui-configuration-source.json')).sources.find(row=>row.path==='config/default.json').document),localise=(value,key)=>{if(Array.isArray(value))return value.map(item=>localise(item));if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([name,item])=>[name,localise(item,name)]));if(typeof value==='string'&&/^https?:\/\//.test(value)){const url=new URL(value);url.protocol='http:';url.hostname='127.0.0.1';url.port='3101';return url.toString();}return value;};Object.assign(source,localise(source));fs.writeFileSync(path.join(configDir,'default.json'),JSON.stringify(source));
 const artifact={candidateRoot,payloadDigest:'sha256:'+'1'.repeat(64),identity:{artifactDigest:'sha256:'+'2'.repeat(64),webappCommit:'20c6ec129fc1e81061c733e164198ec63a33e71a'},provenance:{platform:'linux/arm64',runtimeNodeVersion:'v24.10.0'}};let seen=[];
 const {projectCmcJurisdiction}=await import('./lib/exui-cmc-profile-contract.mjs'),{digestBytes}=await import('./lib/exui-evidence-io.mjs'),configuration=(_root,mutation)=>{const config=projectCmcJurisdiction(source,mutation);return{config,digest:digestBytes(JSON.stringify(config)),contract:{scope:'exui-cmc-jurisdiction-feasibility',mutation}};};
 const result=await runSourceProfileFeasibility({artifactPath:path.join(root,'candidate-artifact.json'),output,facet:'cmc-jurisdiction'},{inspectOwner:()=>null,verifyArtifact:async()=>artifact,inspectRuntime:()=>({reference:'candidate.invalid/runtime@sha256:'+'3'.repeat(64),imageId:'sha256:'+'3'.repeat(64),platform:'linux/arm64'}),configuration,runInvocation:async spec=>{const serialized=spec.candidate.launchProcess.command.find(value=>value.startsWith('NODE_CONFIG='));seen.push(JSON.parse(serialized.slice('NODE_CONFIG='.length)));throw new Error('TEST_STOP_AFTER_CONFIG_BINDING');}});
 assert.equal(result.failure.phase,'baseline',JSON.stringify(result.failure));assert.equal(seen.length,1,JSON.stringify(result.failure));
 assert.deepEqual(seen[0],source,'candidate NODE_CONFIG must carry the exact source baseline');
});

test('CMC candidate probe requires repeatable read/create/default rows and effective CMC-only fault',async()=>{
 const {cmcProfileEvidence,validateCmcProfileObservations,probeCmcProfileConsumer}=await import('./lib/exui-cmc-profile-consumer.mjs');
 const {CMC_PROFILE_FACET}=await import('./lib/exui-cmc-profile-contract.mjs');
 const baseline=cmcProfileEvidence(),mutant=cmcProfileEvidence(CMC_PROFILE_FACET.fault);
 assert.equal(baseline.journal.length,6);
 assert.equal(validateCmcProfileObservations(baseline.observations,baseline.journal).catalogueCredit,false);
 assert.throws(()=>validateCmcProfileObservations(mutant.observations,mutant.journal,CMC_PROFILE_FACET.fault),/CMC_PROFILE_MEMBERSHIP_ASSERTION/);
 const root=require('node:fs').mkdtempSync(require('node:path').join(require('node:os').tmpdir(),'cmc-consumer-'));
 try{
  let calls=0,journal=[];
  await probeCmcProfileConsumer({cookie:'synthetic-cookie',output:root,readJournal:()=>journal,request:async(url,options)=>{
   const index=calls++,expected=baseline.observations[index];assert.equal(new URL(url).origin,'http://127.0.0.1:3100');assert.equal(options.method,'GET');
   journal.push({method:'GET',path:'/aggregated/caseworkers/harness-supervisor/jurisdictions',access:expected.access});
   return {status:200,json:async()=>structuredClone(expected.body)};
  }});
  assert.equal(calls,6);
  const saved=JSON.parse(require('node:fs').readFileSync(require('node:path').join(root,'cmc-profile-observations.json')));
  assert.deepEqual(saved.journal,baseline.journal);assert.equal(saved.catalogueCredit,false);
 }finally{require('node:fs').rmSync(root,{recursive:true,force:true});}
});

test('CMC membership proof accepts unclaimed jurisdiction rows and isolates the CMC fault',async()=>{
 const {validateCmcProfileObservations,validateCmcProfileContrast,cmcProfileEvidence}=await import('./lib/exui-cmc-profile-consumer.mjs');
 const {CMC_PROFILE_FACET}=await import('./lib/exui-cmc-profile-contract.mjs');
 const baseline=cmcProfileEvidence(),fault=cmcProfileEvidence(CMC_PROFILE_FACET.fault),extra=structuredClone(baseline.observations),extraFault=structuredClone(fault.observations);
 for(const observations of [extra,extraFault])for(const observation of observations)observation.body.push({id:'ST_CIC',name:'Synthetic unconfigured',caseTypes:[]},{id:'UNREVIEWED',name:'Synthetic unreviewed',caseTypes:[]});
 assert.equal(validateCmcProfileObservations(baseline.observations,baseline.journal).capability,'jurisdictions');
 assert.doesNotThrow(()=>validateCmcProfileObservations(extra,baseline.journal));
 assert.throws(()=>validateCmcProfileObservations(extraFault,fault.journal,CMC_PROFILE_FACET.fault),/CMC_PROFILE_MEMBERSHIP_ASSERTION/);
 assert.doesNotThrow(()=>validateCmcProfileContrast(extra,extraFault));
 const changed=structuredClone(extraFault);changed[0].body=changed[0].body.filter(row=>row.id!=='FR');
 assert.throws(()=>validateCmcProfileContrast(extra,changed),/CMC_PROFILE_FAULT_SCOPE/);
});

test('CMC ineffective fault reports the CMC row that remains on the candidate route',async()=>{
 const {validateCmcProfileObservations}=await import('./lib/exui-cmc-profile-consumer.mjs');
 const {CMC_PROFILE_FACET}=await import('./lib/exui-cmc-profile-contract.mjs');
 const {SOURCE_JURISDICTIONS}=await import('./lib/exui-source-profile-jurisdictions.mjs');
 const observedIds=[...SOURCE_JURISDICTIONS,'ST_CIC','UNREVIEWED'].sort();
 const observations=Array.from({length:2},()=>['read','create','default'].map(access=>({access,status:200,body:observedIds.map(id=>({id}))}))).flat();
 let failure;try{validateCmcProfileObservations(observations,[],CMC_PROFILE_FACET.fault);}catch(error){failure=error;}
 assert.match(failure?.message,/CMC_PROFILE_FAULT_NOT_EFFECTIVE/);
 assert.deepEqual(failure.cmcProfileDiagnostic,{schemaVersion:1,kind:'cmc-jurisdiction-filter-diagnostic',reasonCode:'CMC_PROFILE_FAULT_NOT_EFFECTIVE',expectedIds:[...SOURCE_JURISDICTIONS].filter(id=>id!=='CMC').sort(),observedIds,missingIds:[],unexpectedIds:['CMC','ST_CIC','UNREVIEWED']});
});

test('CMC failed fault receipt carries its row diagnosis into the blocked attempt',async t=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{validateProfileInvocationResult}=await import('./run-harness-source-profile-jurisdictions.mjs'),{cmcProfileEvidence}=await import('./lib/exui-cmc-profile-consumer.mjs'),{CMC_PROFILE_FACET}=await import('./lib/exui-cmc-profile-contract.mjs'),{SOURCE_JURISDICTIONS}=await import('./lib/exui-source-profile-jurisdictions.mjs');
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'cmc-fault-result-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));const evidence=cmcProfileEvidence(),observations=evidence.observations.map(item=>({...item,body:[...item.body,{id:'ST_CIC'},{id:'UNREVIEWED'}]})),identity={artifactDigest:'sha256:'+'a'.repeat(64),webappCommit:'20c6ec129fc1e81061c733e164198ec63a33e71a'},configDigest='sha256:'+'b'.repeat(64),sourceDigest='sha256:'+'c'.repeat(64);
 fs.writeFileSync(path.join(directory,'cmc-profile-observations.json'),JSON.stringify({observations,journal:evidence.journal,mutation:CMC_PROFILE_FACET.fault,catalogueCredit:false}));fs.writeFileSync(path.join(directory,'profile-jurisdiction-destinations.json'),JSON.stringify(evidence.journal));fs.writeFileSync(path.join(directory,'profile-worker-result.json'),JSON.stringify({schemaVersion:1,status:'failed',invocationId:CMC_PROFILE_FACET.fault,mutation:CMC_PROFILE_FACET.fault,code:'CMC_PROFILE_FAULT_NOT_EFFECTIVE',identity,configDigest,sourceDigest,runtimeAcceptance:false,catalogueCredit:false,wholeProfileSatisfied:false,releaseCredit:false}));
 assert.throws(()=>validateProfileInvocationResult({directory,invocationId:CMC_PROFILE_FACET.fault,mutation:CMC_PROFILE_FACET.fault,identity,configDigest,sourceDigest,terminal:{code:2,signal:null},facet:CMC_PROFILE_FACET.facet}),error=>{assert.equal(error.message,'CMC_PROFILE_FAULT_NOT_EFFECTIVE');assert.deepEqual(error.cmcProfileDiagnostic.expectedIds,[...SOURCE_JURISDICTIONS].filter(id=>id!=='CMC').sort());assert.deepEqual(error.cmcProfileDiagnostic.unexpectedIds,['CMC','ST_CIC','UNREVIEWED']);return true;});
});

test('CMC native profile evidence is admitted only for the exact catalogue row and same native candidate',async()=>{
 const {admitCmcProfile,cmcNativeProfileCompatibility}=await import('./lib/exui-cmc-profile-admission.mjs');
 const {CMC_PROFILE_FACET,CMC_PROFILE_ID,cmcProfileContract,cmcProfileContractDigest}=await import('./lib/exui-cmc-profile-contract.mjs');
 const {NATIVE_HARNESS_SOURCE_FILES}=await import('./lib/exui-native-sources.mjs');
 const {nativeInventoryDigest}=await import('./lib/exui-divorce-native-binding.mjs');
 const {catalogue}=await import('./lib/exui-configuration-runtime-coverage.mjs').then(module=>module.loadCommittedConfigurationCatalogue());
 const {digestBytes}=await import('./lib/exui-evidence-io.mjs');
 const hash=n=>'sha256:'+String(n).slice(-1).repeat(64),commit='a'.repeat(40),runtime={reference:'candidate.invalid/exui@sha256:'+('c'.repeat(64)),imageId:hash('d'),platform:'linux/arm64'};
 const files=Object.fromEntries(NATIVE_HARNESS_SOURCE_FILES.map((name,index)=>[name,hash(String(index%9+1))])),producer={commit,files,sourceDigest:nativeInventoryDigest(files)};
 const candidate={identity:{artifactDigest:hash('b'),webappCommit:cmcProfileContract().consumerRevision},payloadDigest:hash('e'),provenance:{webappCommit:cmcProfileContract().consumerRevision,platform:'linux/arm64'}};
 const catalogueDigest=digestBytes(JSON.stringify(catalogue.obligations)),sourceDefault={revision:cmcProfileContract().sourceRevision,digest:cmcProfileContract().sourceDigest},nativeContext={binding:{producer,candidate,runtime,sourceDefault,catalogue:{obligationsDigest:catalogueDigest}},expected:{harnessCommit:commit,candidateArtifactDigest:candidate.identity.artifactDigest,jobRunId:'ci-00000000-0000-4000-8000-000000000001',nativeCohortBinding:{digest:hash('1')}}};
 const evidence={status:'observed',configDigest:hash('2'),observationsDigest:hash('3'),journalDigest:hash('4')},fault={status:'expected-fault-observed',configDigest:hash('5'),observationsDigest:hash('6'),journalDigest:hash('7')},facets=[{facet:CMC_PROFILE_FACET.facet,fault:CMC_PROFILE_FACET.fault,receiptDigest:hash('8'),baseline:evidence,faultEvidence:fault}];
 const profile={schemaVersion:1,kind:'cmc-profile-cohort',status:'validated-for-admission',runId:'cmc-00000000-0000-4000-8000-000000000001',obligationId:CMC_PROFILE_ID,family:'CMC',contract:cmcProfileContract(),contractDigest:cmcProfileContractDigest(),candidate,producer,sourceDefault,runtime,facets,nativeBindingDigest:hash('1'),catalogueDigest,cohortDigest:digestBytes(JSON.stringify(facets))};
 const result=admitCmcProfile(profile,nativeContext,catalogue);
 assert.equal(result.accepted,1);assert.equal(result.joint.status,'included');assert.equal(result.releaseApproval,false);
 const foreign={...nativeContext,expected:{...nativeContext.expected,candidateArtifactDigest:hash('9')}};
 assert.equal(cmcNativeProfileCompatibility(foreign,profile).status,'separate');
 const incomplete=structuredClone(profile);incomplete.facets[0].faultEvidence.status='observed';assert.throws(()=>admitCmcProfile(incomplete,nativeContext,catalogue),/CMC_PROFILE_ADMISSION_INVALID/);
 const wrongCatalogue={...catalogue,obligations:catalogue.obligations.filter(row=>row.id!==CMC_PROFILE_ID)};assert.throws(()=>admitCmcProfile(profile,nativeContext,wrongCatalogue),/CMC_PROFILE_ADMISSION_INVALID/);
});

test('CMC isolated profile invocation accepts only the expected baseline and effective fault receipts',async t=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
 const {facetSettings,validateProfileInvocationResult}=await import('./run-harness-source-profile-jurisdictions.mjs');
 const {cmcProfileEvidence}=await import('./lib/exui-cmc-profile-consumer.mjs');
 const {CMC_PROFILE_FACET}=await import('./lib/exui-cmc-profile-contract.mjs');
 const {digestBytes}=await import('./lib/exui-evidence-io.mjs');
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'cmc-invocation-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const settings=facetSettings(CMC_PROFILE_FACET.facet);assert.equal(settings.scope,'exui-cmc-jurisdiction-feasibility');assert.equal(settings.fault,CMC_PROFILE_FACET.fault);
 const identity={artifactDigest:'sha256:'+'a'.repeat(64),webappCommit:'20c6ec129fc1e81061c733e164198ec63a33e71a'},configDigest='sha256:'+'b'.repeat(64),sourceDigest='sha256:'+'c'.repeat(64);
 for(const mutation of [null,CMC_PROFILE_FACET.fault]){
  const invocationId=mutation??'baseline',evidence=cmcProfileEvidence(mutation),observationsPath=path.join(directory,'cmc-profile-observations.json'),journalPath=path.join(directory,'profile-jurisdiction-destinations.json');
  fs.writeFileSync(observationsPath,JSON.stringify(evidence));fs.writeFileSync(journalPath,JSON.stringify(evidence.journal));
  fs.writeFileSync(path.join(directory,'profile-worker-result.json'),JSON.stringify({schemaVersion:1,status:mutation?'expected-fault-observed':'observed',invocationId,mutation,code:mutation?'CMC_PROFILE_MEMBERSHIP_ASSERTION':null,identity,configDigest,sourceDigest,runtimeAcceptance:false,catalogueCredit:false,wholeProfileSatisfied:false,releaseCredit:false}));
  const result=validateProfileInvocationResult({directory,invocationId,mutation,identity,configDigest,sourceDigest,terminal:{code:mutation?1:0,signal:null},facet:CMC_PROFILE_FACET.facet});
  assert.equal(result.observationsDigest,digestBytes(fs.readFileSync(observationsPath)));
 }
});

test('CMC admission reports a failed observation only after private-state cleanup is attested',async t=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{runCmcProfileAdmission}=await import('./run-harness-cmc-profile-admission.mjs'),{CMC_PROFILE_FACET,cmcProfileContract}=await import('./lib/exui-cmc-profile-contract.mjs'),{SOURCE_JURISDICTIONS}=await import('./lib/exui-source-profile-jurisdictions.mjs');
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'cmc-failed-attempt-')));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const digest='sha256:'+'a'.repeat(64),commit='b'.repeat(40),identity={artifactDigest:digest,webappCommit:cmcProfileContract().consumerRevision},nativeContext={binding:{producer:{commit},candidate:{identity}},expected:{harnessCommit:commit,candidateArtifactDigest:digest}},expectedIds=[...SOURCE_JURISDICTIONS].sort(),observedIds=[...expectedIds,'ST_CIC','UNREVIEWED'].sort(),diagnostic={schemaVersion:1,kind:'cmc-jurisdiction-filter-diagnostic',reasonCode:'CMC_PROFILE_OBSERVATIONS',expectedIds,observedIds,missingIds:[],unexpectedIds:['ST_CIC','UNREVIEWED']},receipt={status:'failed',failure:{code:'CMC_PROFILE_OBSERVATIONS',diagnostic},cleanup:{complete:true},privateStateRemoved:true};
 const args={artifactPath:path.join(root,'candidate.json'),output:path.join(root,'attempt'),nativeContext};
 await assert.rejects(()=>runCmcProfileAdmission(args,{verifyArtifact:async()=>({identity,provenance:{webappCommit:identity.webappCommit,platform:'linux/arm64'}}),inspectRuntime:()=>({}),runFacet:async()=>receipt}),error=>{assert.equal(error.cmcProfileCleanupVerified,true);assert.deepEqual(error.cmcProfileAttempt.diagnostic,receipt.failure.diagnostic);assert.equal(error.cmcProfileAttempt.consumerRevision,identity.webappCommit);return true;});
 const uncertain={...receipt,cleanup:{complete:false}};
 await assert.rejects(()=>runCmcProfileAdmission({...args,output:path.join(root,'uncertain')},{verifyArtifact:async()=>({identity,provenance:{webappCommit:identity.webappCommit,platform:'linux/arm64'}}),inspectRuntime:()=>({}),runFacet:async()=>uncertain}),error=>{assert.equal(error.cmcProfileCleanupVerified,undefined);assert.equal(error.cmcProfileAttempt,undefined);return true;});
 assert.equal(CMC_PROFILE_FACET.facet,'cmc-jurisdiction');
});

test('CMC readback rejects changed observed jurisdiction or destination evidence',async t=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
 const {verifyCmcProfileObservationDigests}=await import('./run-harness-cmc-profile-admission.mjs');
 const {digestBytes}=await import('./lib/exui-evidence-io.mjs'),root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'cmc-readback-')));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const fault='source-profile-drop-cmc-jurisdiction',receipt={invocations:[]};
 const accesses=['read','create','default'],baseline=Array.from({length:2},()=>accesses.map(access=>({access,status:200,body:[{id:'CMC'},{id:'ST_CIC'}]}))).flat(),mutant=Array.from({length:2},()=>accesses.map(access=>({access,status:200,body:[{id:'ST_CIC'}]}))).flat();
 for(const [id,observations] of [['baseline',baseline],[fault,mutant]]){const directory=path.join(root,id);fs.mkdirSync(directory);const observation=path.join(directory,'cmc-profile-observations.json'),journal=path.join(directory,'profile-jurisdiction-destinations.json');fs.writeFileSync(observation,JSON.stringify({observations}));fs.writeFileSync(journal,'[]');receipt.invocations.push({invocationId:id,observationsDigest:digestBytes(fs.readFileSync(observation)),journalDigest:digestBytes(fs.readFileSync(journal))});}
 assert.doesNotThrow(()=>verifyCmcProfileObservationDigests(root,receipt));fs.writeFileSync(path.join(root,'baseline/cmc-profile-observations.json'),'["changed"]');
 assert.throws(()=>verifyCmcProfileObservationDigests(root,receipt),/CMC_PROFILE_RUN_INVALID/);
});

test('assurance overlaps CMC with the first FR facet and waits before the remaining FR facets',async()=>{
 const {runAssuranceSequence,parseAssuranceCli}=await import('./run-harness-assurance.mjs');
 const cmc={path:'/private/cmc/admission-request.json',digest:'sha256:'+'a'.repeat(64),runId:'cmc-00000000-0000-4000-8000-000000000001'},fr={path:'/private/fr/admission-request.json',digest:'sha256:'+'b'.repeat(64),runId:'fr-00000000-0000-4000-8000-000000000001'},order=[];let frStarted=false,cmcFinished=false;
 let publication;
 const result=await runAssuranceSequence({native:async()=>({status:'PASS',exitCode:0,continuationSafe:true}),cmcProfile:async()=>{order.push('cmc-start');await Promise.resolve();assert(frStarted,'CMC_FR_OVERLAP_REQUIRED');cmcFinished=true;order.push('cmc-finish');return{status:'passed',accepted:1,reportRequest:cmc};},frProfile:async(_signal,{beforeNextBatch}={})=>{frStarted=true;order.push('fr-first-facet');await beforeNextBatch?.();assert(cmcFinished,'FR_NEXT_BATCH_WAIT_REQUIRED');order.push('fr-remaining-facets');return{status:'passed',accepted:1,reportRequest:fr};},descriptor:async(...args)=>{order.push('descriptor');assert.deepEqual(args.slice(-2),[fr,cmc]);return'/private/native.json';},collect:async(_file,timing)=>{order.push('collect');assert.deepEqual(timing.cmcProfileRequest,cmc);assert.deepEqual(timing.frProfileRequest,fr);return{status:'passed',exitCode:0,cmcProfileInclusion:'included',frProfileInclusion:'included'};},publish:value=>publication=value});
 assert.deepEqual(order,['cmc-start','fr-first-facet','cmc-finish','fr-remaining-facets','descriptor','collect']);assert.equal(result.cmcProfileStatus,'PASS');assert.equal(result.frProfileStatus,'PASS');assert.equal(publication.exitCode,0);
 assert.equal(parseAssuranceCli(['--input','/private/job.json','--cmc-profile']).cmcProfile,true);
});

test('CMC admission failure stops the assurance run before descriptor and FR follow-on',async()=>{
 const {runAssuranceSequence}=await import('./run-harness-assurance.mjs');let withdrawals=0;
 const result=await runAssuranceSequence({native:async()=>({status:'PASS',exitCode:0,continuationSafe:true}),cmcProfile:async()=>{throw Error('CMC_PROFILE_OBSERVATIONS');},frProfile:async()=>assert.fail('CMC admission precedes FR'),descriptor:async()=>assert.fail('blocked CMC must not create descriptor'),collect:async()=>assert.fail('blocked CMC must not collect evidence'),withdraw:()=>withdrawals++});
 assert.equal(result.cmcProfileStatus,'BLOCKED');assert.equal(result.exitCode,2);assert.equal(withdrawals,1);
});

test('paired FR admission stops after its first cleaned facet when CMC cleanup is unverified',async()=>{
 const {runAssuranceSequence}=await import('./run-harness-assurance.mjs');let withdrawals=0;const order=[];
 const result=await runAssuranceSequence({native:async()=>({status:'PASS',exitCode:0,continuationSafe:true}),cmcProfile:async()=>{order.push('cmc-start');throw Error('CMC_PROFILE_CLEANUP_UNVERIFIED');},frProfile:async(_signal,{beforeNextBatch})=>{order.push('fr-first-facet-cleaned');await assert.rejects(beforeNextBatch,/FR_PROFILE_COMPANION_BLOCKED/);order.push('fr-remaining-facets-not-started');throw Error('FR_PROFILE_COMPANION_BLOCKED');},descriptor:async()=>assert.fail('blocked paired admission must not create a descriptor'),collect:async()=>assert.fail('blocked paired admission must not collect evidence'),withdraw:()=>withdrawals++});
 assert.deepEqual(order,['cmc-start','fr-first-facet-cleaned','fr-remaining-facets-not-started']);assert.equal(result.cmcProfileStatus,'BLOCKED');assert.equal(result.frProfileStatus,'BLOCKED');assert.equal(result.exitCode,2);assert.equal(withdrawals,1);
});

test('paired FR failure preserves the cleanup-verified CMC diagnosis',async()=>{
 const {runAssuranceSequence}=await import('./run-harness-assurance.mjs');const cmcDiagnostic={reasonCode:'CMC_PROFILE_OBSERVATIONS',unexpectedIds:['UNREVIEWED']},frDiagnostic={reasonCode:'FR_PROFILE_OBSERVATIONS',unexpectedIds:['ST_CIC']};let publication;
 const result=await runAssuranceSequence({native:async()=>({status:'PASS',exitCode:0,continuationSafe:true}),cmcProfile:async()=>{const error=Error('CMC_PROFILE_OBSERVATIONS');error.cmcProfileCleanupVerified=true;error.cmcProfileAttempt={schemaVersion:1,kind:'cmc-profile-attempt',status:'BLOCKED',reason:'CMC_PROFILE_OBSERVATIONS',diagnostic:cmcDiagnostic};throw error;},frProfile:async(_signal,{beforeNextBatch})=>{await beforeNextBatch();const error=Error('FR_PROFILE_OBSERVATIONS');error.frProfileDiagnostic=frDiagnostic;throw error;},descriptor:async()=>assert.fail('failed paired profiles must not create a descriptor'),collect:async()=>assert.fail('failed paired profiles must not collect'),publish:value=>publication=value});
 assert.equal(result.cmcProfileStatus,'BLOCKED');assert.deepEqual(result.cmcProfileAttempt.diagnostic,cmcDiagnostic);assert.equal(result.frProfileStatus,'BLOCKED');assert.deepEqual(result.frProfileAttempt.diagnostic,frDiagnostic);assert.deepEqual(publication.cmcProfileAttempt.diagnostic,cmcDiagnostic);
});

test('CMC failure with verified cleanup is reported while keeping main evidence and release gate blocked',async()=>{
 const {runAssuranceSequence}=await import('./run-harness-assurance.mjs'),{SOURCE_JURISDICTIONS}=await import('./lib/exui-source-profile-jurisdictions.mjs');
 const expectedIds=[...SOURCE_JURISDICTIONS].sort(),observedIds=[...expectedIds,'ST_CIC','UNREVIEWED'].sort(),diagnostic={schemaVersion:1,kind:'cmc-jurisdiction-filter-diagnostic',reasonCode:'CMC_PROFILE_OBSERVATIONS',expectedIds,observedIds,missingIds:[],unexpectedIds:['ST_CIC','UNREVIEWED']},fr={path:'/private/fr/admission-request.json',digest:'sha256:'+'b'.repeat(64),runId:'fr-00000000-0000-4000-8000-000000000001'};let publication,withdrawals=0,descriptorArgs,collectionArgs;
 const result=await runAssuranceSequence({native:async()=>({status:'PASS',exitCode:0,continuationSafe:true}),cmcProfile:async()=>{const error=Error('CMC_PROFILE_OBSERVATIONS');error.cmcProfileCleanupVerified=true;error.cmcProfileAttempt={schemaVersion:1,kind:'cmc-profile-attempt',status:'BLOCKED',reason:'CMC_PROFILE_OBSERVATIONS',diagnostic};throw error;},frProfile:async(_signal,{beforeNextBatch})=>{await beforeNextBatch();return{status:'passed',accepted:1,reportRequest:fr};},descriptor:async(...args)=>{descriptorArgs=args;return'/private/native.json';},collect:async(_file,timing)=>{collectionArgs=timing;return{status:'passed',exitCode:0,frProfileInclusion:'included'};},withdraw:()=>withdrawals++,publish:value=>publication=value});
 assert.equal(result.cmcProfileStatus,'BLOCKED');assert.equal(result.frProfileStatus,'PASS');assert.equal(result.exitCode,2);assert.equal(withdrawals,0);assert.deepEqual(descriptorArgs.at(-2),fr);assert.equal(descriptorArgs.at(-1),undefined);assert.deepEqual(collectionArgs.cmcProfileAttempt,result.cmcProfileAttempt);assert.deepEqual(publication.cmcProfileAttempt,result.cmcProfileAttempt);
});
