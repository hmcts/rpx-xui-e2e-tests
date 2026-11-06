const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createHash}=require('node:crypto');
const {authorisationReadyCcdFake,authorisationUpdatePacket,authorisationRunFakes}=require('./fixtures/exui-authorisation-create.mock.cjs');
const api=async()=>({...await import('./lib/exui-authorisation-row-fixture.mjs'),...await import('./lib/exui-authorisation-create-runtime.mjs')});
const temporary=t=>{const dir=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'auth-update-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;};
const hash=file=>'sha256:'+createHash('sha256').update(fs.readFileSync(file)).digest('hex');

test('U carrier changes only grouped CRU to CR and preserves C/R builders, source dates and backing ACLs',async()=>{
 const a=await api(),baseline=a.buildAuthorisationUpdateDefinition(),fault=a.buildAuthorisationUpdateDefinition('remove-update'),expected=structuredClone(baseline);
 expected.variant='remove-update';expected.rawRow.AccessControl[0].CRUD='CR';expected.sourceChange=fault.sourceChange;
 expected.sheets.AuthorisationCaseEvent.filter(row=>row.CaseEventID==='serviceOfDocuments'&&['caseworker-privatelaw-courtadmin','caseworker-privatelaw-systemupdate'].includes(row.UserRole)).forEach(row=>row.CRUD='CR');assert.deepEqual(fault,expected);
 assert.equal(fault.sourceChange.sourceCells,1);assert.equal(fault.sourceChange.derivedImportCells,2);
 const original=a.buildAuthorisationCreateDefinition();original.kind=baseline.kind;assert.deepEqual(baseline,original);
 assert.deepEqual(a.AUTH_CREATE_VARIANTS,['baseline','remove-create']);assert.deepEqual(a.AUTH_READ_VARIANTS,['baseline','remove-read']);
 for(const build of [a.buildAuthorisationCreateDefinition,a.buildAuthorisationReadDefinition])assert.throws(()=>build('remove-update'));
 assert.throws(()=>a.buildAuthorisationUpdateDefinition('remove-read'));
});
for(const variant of ['baseline','remove-update'])test('actual U observer requires exact definition lists and healthy C persistence: '+variant,async()=>{
 const a=await api(),fake=authorisationReadyCcdFake(a.buildAuthorisationUpdateDefinition(variant)),value=await a.observeAuthorisationUpdate(fake.state,variant,{request:fake.request});
 const result=a.validateAuthorisationUpdateObservation(value,variant);assert.equal(result.actors,5);assert.equal(result.successfulTargetWrites,2);assert.equal(result.deniedTargetWrites,3);assert.equal(result.healthyControlWrites,4);assert.equal(result.groupedSourceCellFaultObserved,variant==='remove-update');
 for(const persona of ['courtadmin','systemupdate','judge','la','readonly']){
  const row=value.journal.find(row=>row.label===persona+'-update');assert.equal(row.status,200);
  const ids=row.response.flatMap(type=>type.events.map(event=>event.id));assert.equal(ids.includes('serviceOfDocuments'),variant==='baseline'&&['courtadmin','systemupdate'].includes(persona));assert.equal(ids.includes('harnessAuthorisationControl'),persona!=='readonly');assert.equal(ids.includes('create'),persona==='courtadmin');
  assert(value.journal.find(row=>row.label===persona+'-history').response.some(event=>event.id==='serviceOfDocuments'));
 }
 for(const key of ['runtimeAcceptance','sourceComplete','catalogueCredit','releaseCredit'])assert.equal(result[key],false);
 assert(!JSON.stringify(value).includes('synthetic-token-'));
 assert.throws(()=>a.validateAuthorisationReadObservation(value,'baseline'),/AUTH_CREATE_OBSERVATION_KIND/);assert.throws(()=>a.validateAuthorisationCreateObservation(value,'baseline'),/AUTH_CREATE_OBSERVATION_KIND/);
});
test('restored U cannot masquerade as effective remove-update',async()=>{
 const a=await api(),fake=authorisationReadyCcdFake(a.buildAuthorisationUpdateDefinition()),value=await a.observeAuthorisationUpdate(fake.state,'remove-update',{request:fake.request});assert.throws(()=>a.validateAuthorisationUpdateObservation(value,'remove-update'),/AUTH_CREATE_EVENT_U_BASELINE|AUTH_ROW_UPDATE_CAPABILITY/);
});
for(const [name,mutate] of [
 ['whole type absent',v=>v.journal.find(r=>r.label==='systemupdate-update').response=[]],
 ['route404',v=>v.journal.find(r=>r.label==='courtadmin-update').status=404],
 ['wrong route',v=>v.journal.find(r=>r.label==='courtadmin-update').route='/case-types?access=create'],
 ['wrong actor',v=>v.journal.find(r=>r.label==='courtadmin-update').userId=v.observerId],
 ['foreign type',v=>v.journal.find(r=>r.label==='judge-update').response.push({id:'foreign',events:[]})],
 ['duplicate control',v=>{const row=v.journal.find(r=>r.label==='judge-update').response[0];row.events.push(structuredClone(row.events[0]));}],
 ['lost control',v=>v.journal.find(r=>r.label==='judge-update').response[0].events=[]],
 ['wrong association',v=>v.journal.find(r=>r.label==='la-update').response[0].events[0].name='Wrong source event'],
 ['wrong jurisdiction',v=>v.journal.find(r=>r.label==='la-update').response[0].jurisdiction.id='OTHER'],
 ['invalid version',v=>v.journal.find(r=>r.label==='la-update').response[0].version.number=0],
 ['reordered events',v=>v.journal.find(r=>r.label==='courtadmin-update').response[0].events.reverse()],
 ['C withdrawn',v=>v.journal.find(r=>r.label==='systemupdate-target-submit').status=404],
 ['token substitution',v=>v.journal.find(r=>r.label==='courtadmin-target-submit').sentTokenDigest='sha256:'+'0'.repeat(64)],
 ['R withdrawn',v=>v.journal.find(r=>r.label==='judge-history').response=[]],
 ['wrong write increment',v=>v.journal.find(r=>r.label==='courtadmin-after-state').response.version++],
 ['readonly type granted',v=>v.journal.find(r=>r.label==='readonly-update').response=[structuredClone(v.journal.find(r=>r.label==='la-update').response[0])]],
 ['reindexed windows',v=>{const a=v.journal.findIndex(r=>r.label==='courtadmin-update'),b=v.journal.findIndex(r=>r.label==='courtadmin-read');[v.journal[a],v.journal[b]]=[v.journal[b],v.journal[a]];v.journal.forEach((r,i)=>r.sequence=i);}],
])test('U raw reader rejects '+name,async()=>{
 const a=await api(),fake=authorisationReadyCcdFake(a.buildAuthorisationUpdateDefinition('remove-update')),value=await a.observeAuthorisationUpdate(fake.state,'remove-update',{request:fake.request});mutate(value);assert.throws(()=>a.validateAuthorisationUpdateObservation(value,'remove-update'));
});
for(const mutation of ['none','wrong-import-version','unrelated-descriptor','missing-collection','duplicate-collection','wrong-collection-type','wrong-element-type','wrong-generated-format','foreign-generated-id','unrelated-collection-metadata','wrong-import-collection','wrong-dimension','unknown-removal'])test('U final packet pins complete descriptors/import/owned context: '+mutation,async t=>{
 const a=await api(),directory=temporary(t),packet=await authorisationUpdatePacket(directory);
 if(['wrong-import-version','unrelated-descriptor','missing-collection','duplicate-collection','wrong-collection-type','wrong-element-type','wrong-generated-format','foreign-generated-id','unrelated-collection-metadata'].includes(mutation)){
  const name='remove-update-observation.json',value=packet.read(name),body=value.journal.find(row=>row.label==='courtadmin-update').response[0];
  const collection=body.case_fields.find(row=>row.id==='sodAdditionalRecipientsList');
  if(mutation==='wrong-import-version')body.version.number++;
  else if(mutation==='unrelated-descriptor')body.security_classification='PRIVATE';
  else if(mutation==='missing-collection')body.case_fields=body.case_fields.filter(row=>row!==collection);
  else if(mutation==='duplicate-collection')body.case_fields.push(structuredClone(collection));
  else if(mutation==='wrong-collection-type')collection.field_type.type='Text';
  else if(mutation==='wrong-element-type')collection.field_type.collection_field_type.id='EmailInformation';
  else if(mutation==='wrong-generated-format')collection.field_type.id='sodAdditionalRecipientsList-not-a-uuid';
  else if(mutation==='foreign-generated-id')collection.field_type.id='sodAdditionalRecipientsList-ffffffff-ffff-4fff-8fff-ffffffffffff';
  else collection.field_type.regular_expression='unexpected';
  packet.write(name,value);packet.write('remove-update-requests.json',value.journal);packet.expected.contexts[1].observationDigest=hash(path.join(directory,name));packet.expected.contexts[1].journalDigest=hash(path.join(directory,'remove-update-requests.json'));
 }
 if(mutation==='wrong-import-collection'){
  const imported=packet.read('remove-update-import.json');imported.observed.body.case_fields.find(row=>row.id==='sodAdditionalRecipientsList').field_type.id='sodAdditionalRecipientsList-ffffffff-ffff-4fff-8fff-ffffffffffff';
  packet.write('remove-update-import.json',imported);const journal=packet.read('remove-update-import-requests.json');journal.at(-1).response=imported.observed;packet.write('remove-update-import-requests.json',journal);
  packet.expected.contexts[1].importDigest=hash(path.join(directory,'remove-update-import.json'));packet.expected.contexts[1].importRequestsDigest=hash(path.join(directory,'remove-update-import-requests.json'));
 }
 if(mutation==='wrong-dimension')packet.expected.dimension='read';
 const read=()=>a.readAuthorisationUpdatePacket(directory,packet.expected,{inspect:()=>mutation==='unknown-removal'?{}:null});
 if(mutation==='none'){const result=read();assert.equal(result.contexts.length,2);assert.equal(result.catalogueCredit,false);assert.notEqual(packet.read('baseline-import.json').observed.body.case_fields.find(row=>row.id==='sodAdditionalRecipientsList').field_type.id,packet.read('remove-update-import.json').observed.body.case_fields.find(row=>row.id==='sodAdditionalRecipientsList').field_type.id);assert.throws(()=>a.readAuthorisationReadPacket(directory,packet.expected,{inspect:()=>null}),/AUTH_READ_EXPECTED_DIMENSION/);}
 else assert.throws(read,mutation==='wrong-import-version'?/AUTH_UPDATE_IMPORTED_VERSION/:['unrelated-descriptor','unrelated-collection-metadata'].includes(mutation)?/AUTH_UPDATE_ONLY_TARGET_DESCRIPTOR_REMOVED/:['foreign-generated-id','wrong-import-collection'].includes(mutation)?/AUTH_UPDATE_IMPORTED_COLLECTION_ID/:mutation==='wrong-dimension'?/AUTH_UPDATE_EXPECTED_DIMENSION/:mutation==='unknown-removal'?/AUTH_CREATE_PACKET_RESOURCE_SURVIVES/:/AUTH_UPDATE_COLLECTION_/);
});
for(const failure of ['none','unknown-cleanup','create-uncertain','cancelled'])test('fixed U controller gates continuation after '+failure,async t=>{
 const {runAuthorisationUpdate}=await import('./run-harness-authorisation-update.mjs'),fake=authorisationRunFakes();
 if(failure==='unknown-cleanup')fake.options.cleanup=()=>undefined;
 if(failure==='create-uncertain')fake.options.start=async(_output,options)=>{fake.calls.push('start');options.onCreateUncertainty();throw Error('private-canary');};
 if(failure==='cancelled')fake.options.observe=async()=>{fake.signal.emit('SIGTERM');return {};};
 const result=await runAuthorisationUpdate(path.join(temporary(t),'run'),fake.options);assert.equal(result.expected.dimension,'update');assert.equal(result.exitCode,failure==='none'?0:2);assert.equal(result.summary.catalogueCredit,false);assert.equal(fake.calls.filter(x=>x==='start').length,failure==='none'?2:1);assert(!JSON.stringify(result).includes('private-canary'));
 if(failure==='none')assert.deepEqual(result.expected.contexts.map(x=>x.variant),['baseline','remove-update']);
 if(['unknown-cleanup','create-uncertain'].includes(failure))assert.equal(result.summary.cleanupComplete,false);
});
