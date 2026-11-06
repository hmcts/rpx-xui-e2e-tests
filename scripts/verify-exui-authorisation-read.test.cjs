const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createHash}=require('node:crypto');
const {authorisationReadyCcdFake,authorisationReadPacket,authorisationRunFakes}=require('./fixtures/exui-authorisation-create.mock.cjs');
const api=async()=>({...await import('./lib/exui-authorisation-row-fixture.mjs'),...await import('./lib/exui-authorisation-create-runtime.mjs')});
const temporary=t=>{const dir=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'auth-read-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;};
const hash=file=>'sha256:'+createHash('sha256').update(fs.readFileSync(file)).digest('hex');

test('R carrier preserves C carrier context and changes only one grouped source R cell / two imported actors',async()=>{
 const a=await api(),baseline=a.buildAuthorisationReadDefinition(),fault=a.buildAuthorisationReadDefinition('remove-read'),expected=structuredClone(baseline);
 expected.variant='remove-read';expected.rawRow.AccessControl[0].CRUD='CU';expected.sourceChange=fault.sourceChange;
 expected.sheets.AuthorisationCaseEvent.filter(row=>row.CaseEventID==='serviceOfDocuments'&&['caseworker-privatelaw-courtadmin','caseworker-privatelaw-systemupdate'].includes(row.UserRole)).forEach(row=>row.CRUD='CU');
 assert.deepEqual(fault,expected);assert.equal(fault.sourceChange.sourceCells,1);assert.equal(fault.sourceChange.derivedImportCells,2);
 const original=a.buildAuthorisationCreateDefinition();original.kind=baseline.kind;assert.deepEqual(baseline,original);
 assert.deepEqual(a.AUTH_CREATE_VARIANTS,['baseline','remove-create']);assert.throws(()=>a.buildAuthorisationCreateDefinition('remove-read'),/AUTH_CREATE_VARIANT/);assert.throws(()=>a.buildAuthorisationReadDefinition('remove-create'),/AUTH_READ_VARIANT/);
});
for(const variant of ['baseline','remove-read'])test('actual R observer preserves five-actor access/C controls and isolates target history: '+variant,async()=>{
 const a=await api(),fake=authorisationReadyCcdFake(a.buildAuthorisationReadDefinition(variant)),value=await a.observeAuthorisationRead(fake.state,variant,{request:fake.request});
 const result=a.validateAuthorisationReadObservation(value,variant);assert.equal(result.actors,5);assert.equal(result.successfulTargetWrites,2);assert.equal(result.deniedTargetWrites,3);assert.equal(result.healthyControlWrites,4);assert.equal(result.groupedSourceCellFaultObserved,variant==='remove-read');
 for(const persona of ['courtadmin','systemupdate','judge','la','readonly']){
  const history=value.journal.find(row=>row.label===persona+'-history').response;
  assert.equal(history.some(row=>row.id==='serviceOfDocuments'),variant==='baseline'||!['courtadmin','systemupdate'].includes(persona));
  assert(history.some(row=>row.id==='harnessAuthorisationControl'));assert.equal(history.some(row=>row.id==='create'),persona==='courtadmin');
  assert.equal(value.journal.find(row=>row.label===persona+'-seed-target-submit').persona,'courtadmin');
 }
 assert(!JSON.stringify(value).includes('synthetic-token-'));assert(!JSON.stringify(value).includes('synthetic-event-token-'));
 for(const key of ['runtimeAcceptance','sourceComplete','catalogueCredit','releaseCredit'])assert.equal(result[key],false);
 assert.throws(()=>a.validateAuthorisationCreateObservation(value,'baseline'),/AUTH_CREATE_OBSERVATION_KIND/);
});
test('unchanged source R cannot masquerade as effective remove-read fault',async()=>{
 const a=await api(),fake=authorisationReadyCcdFake(a.buildAuthorisationReadDefinition()),value=await a.observeAuthorisationRead(fake.state,'remove-read',{request:fake.request});
 assert.throws(()=>a.validateAuthorisationReadObservation(value,'remove-read'),/AUTH_ROW_READ_CAPABILITY/);
});
for(const [name,mutate] of [
 ['empty history',v=>v.journal.find(r=>r.label==='systemupdate-history').response=[]],
 ['history500',v=>v.journal.find(r=>r.label==='courtadmin-history').status=500],
 ['foreign case',v=>v.journal.find(r=>r.label==='courtadmin-history').route=v.journal.find(r=>r.label==='systemupdate-history').route],
 ['extra create history',v=>v.journal.find(r=>r.label==='systemupdate-history').response.push(v.journal.find(r=>r.label==='systemupdate-before-history').response.find(r=>r.id==='create'))],
 ['control history removed',v=>v.journal.find(r=>r.label==='judge-history').response=v.journal.find(r=>r.label==='judge-history').response.filter(r=>r.id!=='harnessAuthorisationControl')],
 ['other source R lost',v=>v.journal.find(r=>r.label==='la-history').response=v.journal.find(r=>r.label==='la-history').response.filter(r=>r.id!=='serviceOfDocuments')],
 ['wrong seed actor',v=>v.journal.find(r=>r.label==='courtadmin-seed-target-submit').userId=v.observerId],
 ['token substitution',v=>v.journal.find(r=>r.label==='systemupdate-target-submit').sentTokenDigest='sha256:'+'0'.repeat(64)],
 ['C disabled',v=>v.journal.find(r=>r.label==='courtadmin-target-submit').status=404],
 ['wrong increment',v=>v.journal.find(r=>r.label==='courtadmin-after-state').response.version++],
 ['reused control case',v=>v.cases[1].controlId=v.cases[0].controlId],
 ['reordered windows',v=>{const a=v.journal.findIndex(r=>r.label==='courtadmin-history'),b=v.journal.findIndex(r=>r.label==='courtadmin-read');[v.journal[a],v.journal[b]]=[v.journal[b],v.journal[a]];v.journal.forEach((r,i)=>r.sequence=i);}],
])test('R raw reader rejects '+name,async()=>{
 const a=await api(),fake=authorisationReadyCcdFake(a.buildAuthorisationReadDefinition('remove-read')),value=await a.observeAuthorisationRead(fake.state,'remove-read',{request:fake.request});mutate(value);assert.throws(()=>a.validateAuthorisationReadObservation(value,'remove-read'));
});
test('R packet replays actual workbook/ACL/journal and held context pins, with C packet excluded',async t=>{
 const a=await api(),directory=temporary(t),packet=await authorisationReadPacket(directory),calls=[];
 const result=a.readAuthorisationReadPacket(directory,packet.expected,{inspect:id=>{calls.push(id);return null;}});assert.equal(result.contexts.length,2);assert.equal(calls.length,28);assert.equal(result.catalogueCredit,false);
 assert.throws(()=>a.readAuthorisationReadPacket(directory,{...packet.expected,dimension:'create'},{inspect:()=>null}),/AUTH_READ_EXPECTED_DIMENSION/);
 assert.throws(()=>a.readAuthorisationCreatePacket(directory,packet.expected,{inspect:()=>null}),/AUTH_CREATE_PARENT_CONTEXTS/);
 const name='remove-read-observation.json',value=packet.read(name);value.journal.find(row=>row.label==='systemupdate-history').response=[];packet.write(name,value);packet.write('remove-read-requests.json',value.journal);packet.expected.contexts[1].observationDigest=hash(path.join(directory,name));packet.expected.contexts[1].journalDigest=hash(path.join(directory,'remove-read-requests.json'));
 assert.throws(()=>a.readAuthorisationReadPacket(directory,packet.expected,{inspect:()=>null}),/AUTH_ROW_READ_CAPABILITY/);
});
for(const failure of ['none','unknown-cleanup','create-uncertain','cancelled'])test('fixed R controller retains owned closure and stops on '+failure,async t=>{
 const {runAuthorisationRead}=await import('./run-harness-authorisation-read.mjs'),fake=authorisationRunFakes();
 if(failure==='unknown-cleanup')fake.options.cleanup=()=>undefined;
 if(failure==='create-uncertain')fake.options.start=async(_output,options)=>{fake.calls.push('start');options.onCreateUncertainty();throw Error('private-canary');};
 if(failure==='cancelled')fake.options.observe=async()=>{fake.signal.emit('SIGTERM');return {};};
 const value=await runAuthorisationRead(path.join(temporary(t),'run'),fake.options);assert.equal(value.expected.dimension,'read');assert.equal(value.exitCode,failure==='none'?0:2);assert.equal(value.summary.catalogueCredit,false);assert.equal(fake.calls.filter(x=>x==='start').length,failure==='none'?2:1);assert(!JSON.stringify(value).includes('private-canary'));
 if(failure==='none')assert.deepEqual(value.expected.contexts.map(x=>x.variant),['baseline','remove-read']);
 if(['unknown-cleanup','create-uncertain'].includes(failure))assert.equal(value.summary.cleanupComplete,false);
});
