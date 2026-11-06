const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {EventEmitter}=require('node:events');
const {authorisationCcdFake}=require('./fixtures/exui-authorisation-create.mock.cjs');
const temporary=t=>{const directory=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'auth-create-test-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));return directory;};
const libs=async()=>({...await import('./lib/exui-authorisation-row-fixture.mjs'),...await import('./lib/exui-authorisation-create-runtime.mjs')});

test('fixed complete carrier preserves source date/groups/prerequisites and mutates exactly two flattened C cells',async()=>{
 const api=await libs(),baseline=api.buildAuthorisationCreateDefinition(),fault=api.buildAuthorisationCreateDefinition('remove-create');
 for(const value of [baseline,fault]){
  for(const flag of ['sourceComplete','runtimeAcceptance','catalogueCredit','releaseCredit'])assert.equal(value[flag],false);
  const rows=value.sheets.AuthorisationCaseEvent.filter(row=>row.CaseEventID==='serviceOfDocuments'&&row.UserRole.startsWith('caseworker-privatelaw-'));
  assert.equal(rows.length,5);assert(rows.every(row=>row.LiveFrom==='01/09/2024'));
 }
 const expected=structuredClone(baseline);expected.variant='remove-create';expected.rawRow.AccessControl[0].CRUD='RU';expected.sourceChange=fault.sourceChange;
 expected.sheets.AuthorisationCaseEvent.filter(row=>row.CaseEventID==='serviceOfDocuments'&&['caseworker-privatelaw-courtadmin','caseworker-privatelaw-systemupdate'].includes(row.UserRole)).forEach(row=>row.CRUD='RU');
 assert.deepEqual(fault,expected);
 assert.throws(()=>api.buildAuthorisationCreateDefinition('remove-read'),/AUTH_CREATE_VARIANT/);
});
for(const variant of ['baseline','remove-create'])test(`actual API observer and independent raw replay cover five source actors: ${variant}`,async()=>{
 const api=await libs(),fake=authorisationCcdFake(api.buildAuthorisationCreateDefinition(variant));
 const observation=await api.observeAuthorisationCreate(fake.state,variant,{request:fake.request});const result=api.validateAuthorisationCreateObservation(observation,variant);
 assert.equal(result.actors,5);assert.equal(result.successfulTargetWrites,variant==='baseline'?2:0);assert.equal(result.deniedTargetWrites,variant==='baseline'?3:5);assert.equal(result.healthyControlWrites,4);assert.equal(result.readonlyDenial,'prerequisite-masked');assert.equal(result.catalogueCredit,false);
});
test('controlled restored C invalidates the grouped effective-fault oracle',async()=>{
 const api=await libs(),restored=api.buildAuthorisationCreateDefinition('remove-create');restored.sheets.AuthorisationCaseEvent.filter(row=>row.CaseEventID==='serviceOfDocuments'&&['caseworker-privatelaw-courtadmin','caseworker-privatelaw-systemupdate'].includes(row.UserRole)).forEach(row=>row.CRUD='CRU');
 const fake=authorisationCcdFake(restored),observation=await api.observeAuthorisationCreate(fake.state,'remove-create',{request:fake.request});assert.throws(()=>api.validateAuthorisationCreateObservation(observation,'remove-create'),/AUTH_ROW_CREATE_CAPABILITY/);
});
for(const [name,change] of [
 ['missing systemupdate',value=>value.actors.splice(1,1)],['observer membership',value=>value.actors[1].roles.push('caseworker-harness-observer')],
 ['reused identity',value=>value.actors[1].userId=value.actors[0].userId],['server500',value=>value.journal.find(row=>row.label==='courtadmin-target-submit').status=500],
 ['token400',value=>value.journal.find(row=>row.label==='courtadmin-target-submit').status=400],['wrong route',value=>value.journal.find(row=>row.label==='courtadmin-target-start').route='/wrong'],
 ['token swapped',value=>value.journal.find(row=>row.label==='courtadmin-target-submit').sentTokenDigest='sha256:'+'0'.repeat(64)],
 ['no independent control',value=>value.journal.find(row=>row.label==='systemupdate-control-submit').status=404],
 ['denied persisted mutation',value=>value.journal.find(row=>row.label==='judge-after-state').response.version++],
 ['duplicate request',value=>value.journal.push(structuredClone(value.journal[0]))],['wrong actor request',value=>value.journal.find(row=>row.label==='systemupdate-target-submit').userId=value.observerId],
 ['late target submit with renumbered journal',value=>{const index=value.journal.findIndex(row=>row.label==='judge-target-submit'),[row]=value.journal.splice(index,1);value.journal.push(row);value.journal.forEach((item,i)=>item.sequence=i);}],
 ['reused after window with renumbered journal',value=>{const a=value.journal.findIndex(row=>row.label==='judge-target-start'),b=value.journal.findIndex(row=>row.label==='judge-after-state');[value.journal[a],value.journal[b]]=[value.journal[b],value.journal[a]];value.journal.forEach((item,i)=>item.sequence=i);}],
 ['implied credit',value=>value.catalogueCredit=true],
])test(`raw replay rejects ${name}`,async()=>{
 const api=await libs(),fake=authorisationCcdFake(api.buildAuthorisationCreateDefinition());const value=await api.observeAuthorisationCreate(fake.state,'baseline',{request:fake.request});change(value);assert.throws(()=>api.validateAuthorisationCreateObservation(value,'baseline'));
});
test('owned fixed SQL retains all five typed dates and rejects substituted rows/version without coercion',async()=>{
 const api=await libs(),fake=authorisationCcdFake(api.buildAuthorisationCreateDefinition());let query;
 const read=rows=>api.readAuthorisationAclDates(fake.state,3,'baseline',{inspect:()=>{},runDocker:(args,sql)=>{assert.deepEqual(args.slice(0,3),['exec','-i',fake.state.namespace]);query=sql;return JSON.stringify(rows);}});
 const rows=api.expectedAuthorisationAclRows(3,'baseline');const result=read(rows);assert.equal(result.sourceDate,'01/09/2024');assert.equal(result.retentionClaim,false);assert.equal(result.activationClaim,false);assert.match(query,/BEGIN READ ONLY/);assert.match(query,/ct.version=3/);
 for(const mutate of [r=>r.pop(),r=>r[0].live_from='2024-09-01',r=>r[0].version=4,r=>r.push(r[0]),r=>r[0].create=false]){const wrong=structuredClone(rows);mutate(wrong);assert.throws(()=>read(wrong),/AUTH_CREATE_STORED_ACL_ROWS/);}
});
test('workbook generation executes the actual offline converter and preserves original date',async t=>{
 const api=await libs(),root=temporary(t),receipt=api.prepareAuthorisationCreateWorkbook(path.join(root,'fixture'),'baseline');assert.match(receipt.workbookDigest,/^sha256:/);assert.equal(receipt.originalSourceDate,'01/09/2024');const rows=api.validateAuthorisationWorkbook(path.join(root,'fixture/definition.xlsx'),'baseline');assert.equal(rows.length,5);assert(rows.every(row=>row.LiveFrom.type==='n'&&row.LiveFrom.style==='1'));
});
test('default source actor API remains three fixed actors; new personas require the explicit standalone helper',async()=>{
 const core=await import('./lib/exui-ccd-runtime.mjs'),api=await libs(),fake=authorisationCcdFake(api.buildAuthorisationCreateDefinition());
 for(const persona of ['courtadmin','systemupdate','judge','la','readonly']){const actor=core.ccdAuthorisationRowCredentials(fake.state,persona,{request:fake.request});assert.deepEqual(actor.roles,['caseworker','caseworker-harness',`caseworker-privatelaw-${persona}`]);}
 assert.throws(()=>core.ccdAuthorisationRowCredentials(fake.state,'observer',{request:fake.request}),/CCD_AUTH_ROW_FIXED_ACTOR_REQUIRED/);
 assert.throws(()=>core.ccdAuthorisationRowCredentials({...fake.state,fixtureSelection:'nested-prl'},'la',{request:fake.request}),/CCD_AUTH_ROW_BASELINE_CONTEXT_REQUIRED/);
 const original=core.ccdCredentials(fake.state,'systemupdate',{request:fake.request});assert.equal(original.roles,undefined);const details=fake.request(fake.state,5000,'/details',{headers:original.headers});assert.deepEqual(details.body.roles,['caseworker','caseworker-harness','caseworker-harness-systemupdate']);
});
test('cancellation between journal requests prevents further calls',async()=>{
 const api=await libs(),fake=authorisationCcdFake(api.buildAuthorisationCreateDefinition());let cancelled=false,calls=0;
 await assert.rejects(api.observeAuthorisationCreate(fake.state,'baseline',{request:(...args)=>{calls++;if(args[2].includes('/cases')&&args[3]?.method==='POST')cancelled=true;return fake.request(...args);},isCancelled:()=>cancelled}),/AUTH_CREATE_CANCELLED/);
 const count=calls;await new Promise(resolve=>setImmediate(resolve));assert.equal(calls,count);
});
const runFakes=()=>{
 const calls=[],signal=new EventEmitter(),source={commit:'1'.repeat(40),sourceDigest:'sha256:'+'2'.repeat(64),files:{}},owner='harness-1234567890abcdef',cid='a'.repeat(64);
 const write=(file,value)=>fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');
 const removal={owner,cleanupComplete:true,checkedNames:[owner+'-database'],checkedContainerIds:[cid]};
 return {calls,signal,options:{producer:()=>source,prepare:directory=>{calls.push('prepare');fs.mkdirSync(directory);write(path.join(directory,'definition.json'),{});fs.writeFileSync(path.join(directory,'definition.xlsx'),'fake workbook');write(path.join(directory,'binding.json'),{});return {};},start:async output=>{calls.push('start');fs.mkdirSync(output);const state={owner,output,namespace:cid,containers:{database:cid},images:{},fixtureSelection:'event-capability-baseline'};write(path.join(output,'runtime.json'),state);write(path.join(output,'recovery.json'),{owner,output,resources:{database:{name:owner+'-database'}}});write(path.join(output,'creation-attempts.json'),[]);return state;},inspect:()=>{},importDefinition:()=>({version:1}),dates:()=>({}),observe:async()=>({}),replay:()=>({catalogueCredit:false}),finalReplay:()=>({catalogueCredit:false}),cleanup:()=>{calls.push('cleanup');return structuredClone(removal);},signalTarget:signal}};
};
for(const failure of ['create-uncertain','cleanup-failed','proof-failed','cancelled'])test(`standalone sequence blocks later resources after ${failure}`,async t=>{
 const {runAuthorisationCreate}=await import('./run-harness-authorisation-create.mjs'),fake=runFakes();
 if(failure==='create-uncertain')fake.options.start=async (output,options)=>{fake.calls.push('start');options.onCreateUncertainty();throw Error('unknown create');};
 if(failure==='cleanup-failed')fake.options.cleanup=()=>{fake.calls.push('cleanup');throw Error('first removal failed');};
 if(failure==='proof-failed')fake.options.observe=async()=>{throw Error('proof failed');};
 if(failure==='cancelled')fake.options.start=async output=>{fake.calls.push('start');fake.signal.emit('SIGTERM');return {output};};
 const result=await runAuthorisationCreate(path.join(temporary(t),'run'),fake.options);assert.equal(result.exitCode,2);assert.equal(result.summary.status,'BLOCKED');assert.equal(fake.calls.filter(call=>call==='start').length,1);assert.equal(fake.calls.filter(call=>call==='cleanup').length,1);assert.equal(result.summary.variants.length,1);assert.equal(result.summary.catalogueCredit,false);
});
test('standalone successful bounded sequence remains explicitly non-credit',async t=>{
 const {runAuthorisationCreate}=await import('./run-harness-authorisation-create.mjs'),fake=runFakes();const result=await runAuthorisationCreate(path.join(temporary(t),'run'),fake.options);assert.equal(result.exitCode,0);assert.equal(fake.calls.filter(call=>call==='start').length,2);assert.equal(result.summary.variants.length,2);for(const flag of ['sourceComplete','runtimeAcceptance','catalogueCredit','releaseCredit'])assert.equal(result.summary[flag],false);
});

test('post-cleanup reader replays both raw contexts and all fixed owned resource removals without credit',async t=>{
 const api=await libs(),{authorisationPacket}=require('./fixtures/exui-authorisation-create.mock.cjs'),directory=temporary(t),packet=await authorisationPacket(directory),checked=[];
 const result=api.readAuthorisationCreatePacket(directory,packet.expected,{inspect:id=>{checked.push(id);return null;}});assert.equal(result.contexts.length,2);assert.equal(result.catalogueCredit,false);assert.equal(checked.length,28);
});
for(const [name,alter] of [
 ['missing import outcome',packet=>{const value=packet.read('baseline-import.json');delete value.imported;packet.write('baseline-import.json',value);}],
 ['wrong SQL date',packet=>{const value=packet.read('baseline-stored-acl.json');value.rows[0].live_from='2024-09-01';packet.write('baseline-stored-acl.json',value);}],
 ['unsettled create',packet=>{const value=packet.read('baseline-runtime/creation-attempts.json');value[0].state='pending';packet.write('baseline-runtime/creation-attempts.json',value);}],
 ['wrong owned name',packet=>{const value=packet.read('baseline-runtime/recovery.json');value.resources.data.name='foreign-data';packet.write('baseline-runtime/recovery.json',value);}],
 ['foreign observation owner',packet=>{const value=packet.read('baseline-observation.json');value.binding.owner='harness-'+ 'c'.repeat(16);packet.write('baseline-observation.json',value);}],
 ['changed producer',packet=>{const value=packet.read('summary.json');value.producer.commit='2'.repeat(40);packet.write('summary.json',value);}],
 ['coherent wrong-date workbook hash',packet=>{
  const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');const file=path.join(packet.directory,'baseline-fixture/definition.xlsx');
  const result=spawnSync('python3',['-B','-c',"import pathlib,sys,zipfile,io;p=pathlib.Path(sys.argv[1]);z=zipfile.ZipFile(io.BytesIO(p.read_bytes()));entries=[(i,z.read(i).replace(b'45536',b'43831')) for i in z.infolist()];z.close();w=zipfile.ZipFile(p,'w');[w.writestr(i,b) for i,b in entries];w.close()",file],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);
  const binding=packet.read('baseline-fixture/binding.json');binding.workbookDigest='sha256:'+createHash('sha256').update(fs.readFileSync(file)).digest('hex');packet.write('baseline-fixture/binding.json',binding);const imported=packet.read('baseline-import.json');imported.binding=binding;packet.write('baseline-import.json',imported);
 }],
])test(`post-cleanup reader rejects ${name}`,async t=>{
 const api=await libs(),{authorisationPacket}=require('./fixtures/exui-authorisation-create.mock.cjs'),directory=temporary(t),packet=await authorisationPacket(directory);packet.directory=directory;alter(packet);assert.throws(()=>api.readAuthorisationCreatePacket(directory,packet.expected,{inspect:()=>null}));
});
test('post-cleanup reader never accepts a surviving owned container',async t=>{
 const api=await libs(),{authorisationPacket}=require('./fixtures/exui-authorisation-create.mock.cjs'),directory=temporary(t),packet=await authorisationPacket(directory);assert.throws(()=>api.readAuthorisationCreatePacket(directory,packet.expected,{inspect:()=>({Id:'foreign'})}),/AUTH_CREATE_PACKET_RESOURCE_SURVIVES/);
});
test('workbook projection passes the bounded HOME environment required by the configured Python shim',async t=>{
 const api=await libs(),directory=temporary(t);api.prepareAuthorisationCreateWorkbook(path.join(directory,'fixture'),'baseline');let environment;
 api.validateAuthorisationWorkbook(path.join(directory,'fixture/definition.xlsx'),'baseline',{run:(command,args,options)=>{environment=options.env;return require('node:child_process').spawnSync(command,args,options);}});assert.equal(environment.HOME,process.env.HOME);assert.equal(environment.PATH,process.env.PATH);assert.equal(environment.PYTHONDONTWRITEBYTECODE,'1');assert.equal(Object.keys(environment).length,3);
});
test('cancellation during preparation prevents every CCD start and leaves no later context',async t=>{
 const {runAuthorisationCreate}=await import('./run-harness-authorisation-create.mjs'),fake=runFakes();fake.options.prepare=()=>{fake.calls.push('prepare');fake.signal.emit('SIGTERM');};const result=await runAuthorisationCreate(path.join(temporary(t),'run'),fake.options);assert.equal(result.exitCode,2);assert.equal(fake.calls.includes('start'),false);assert.equal(result.summary.variants.length,1);
});
test('cancellation queued during final raw replay cannot publish a passing milestone',async t=>{
 const {runAuthorisationCreate}=await import('./run-harness-authorisation-create.mjs'),fake=runFakes();fake.options.finalReplay=()=>{setImmediate(()=>fake.signal.emit('SIGTERM'));return {};};const result=await runAuthorisationCreate(path.join(temporary(t),'run'),fake.options);assert.equal(result.exitCode,2);assert.equal(result.summary.cancelled,true);assert.equal(result.summary.status,'BLOCKED');
});
test('offline workbook path works through the configured Python shim with HOME absent from the parent',t=>{
 const output=path.join(temporary(t),'fixture'),source=`import {prepareAuthorisationCreateWorkbook,validateAuthorisationWorkbook} from './scripts/lib/exui-authorisation-create-runtime.mjs';prepareAuthorisationCreateWorkbook(${JSON.stringify(output)},'baseline');validateAuthorisationWorkbook(${JSON.stringify(path.join(output,'definition.xlsx'))},'baseline');`;
 const environment={...process.env};delete environment.HOME;const result=require('node:child_process').spawnSync(process.execPath,['--input-type=module','-e',source],{encoding:'utf8',env:environment});assert.equal(result.status,0,result.stderr);
});

for(const mutation of ['epoch','style'])test(`actual workbook projection rejects changed ${mutation} despite unchanged numeric cell/style index`,async t=>{
 const api=await libs(),directory=temporary(t),fixture=path.join(directory,'fixture');api.prepareAuthorisationCreateWorkbook(fixture,'baseline');
 const file=path.join(fixture,'definition.xlsx'),program="import pathlib,sys,zipfile,io;p=pathlib.Path(sys.argv[1]);z=zipfile.ZipFile(io.BytesIO(p.read_bytes()));entries=[(i,z.read(i)) for i in z.infolist()];z.close();w=zipfile.ZipFile(p,'w');[(w.writestr(i,b.replace(b'<sheets>',b'<workbookPr date1904=\\\"1\\\"/><sheets>') if i.filename=='xl/workbook.xml' and sys.argv[2]=='epoch' else b.replace(b'numFmtId=\\\"14\\\"',b'numFmtId=\\\"0\\\"') if i.filename=='xl/styles.xml' and sys.argv[2]=='style' else b)) for i,b in entries];w.close()";
 const changed=require('node:child_process').spawnSync('python3',['-B','-c',program,file,mutation],{encoding:'utf8'});assert.equal(changed.status,0,changed.stderr);assert.throws(()=>api.validateAuthorisationWorkbook(file,'baseline'),/AUTH_CREATE_WORKBOOK_PROJECTION/);
});
test('actual import status response is retained before the importer rejects500',async t=>{
 const api=await libs(),directory=temporary(t),fixture=path.join(directory,'fixture');api.prepareAuthorisationCreateWorkbook(fixture,'baseline');const fake=authorisationCcdFake(api.buildAuthorisationCreateDefinition()),observations=[];
 assert.throws(()=>api.importAuthorisationCreate(fake.state,fixture,'baseline',{inspect:()=>{},request:(state,port,route,options)=>{if(port===4451)return {status:route==='/import'?500:201,body:{synthetic:'private-status-observation'}};return fake.request(state,port,route,options);},onObservation:entry=>observations.push(entry)}),/AUTH_CREATE_IMPORT_STATUS/);
 assert.equal(observations.length,6);assert.equal(observations.at(-1).kind,'definition-import');assert.equal(observations.at(-1).response.status,500);assert.equal(observations.at(-1).route,'/import');
});
test('a partial failing API journey retains its actual status journal before observation construction fails',async()=>{
 const api=await libs(),fake=authorisationCcdFake(api.buildAuthorisationCreateDefinition());let saved=[];
 await assert.rejects(api.observeAuthorisationCreate(fake.state,'baseline',{onJournal:journal=>{saved=structuredClone(journal);},request:(state,port,route,options)=>{if(port===4452&&route.match(/\/cases\/\d{16}$/)&&!options.method)return {status:500,body:{synthetic:'unusable response'}};return fake.request(state,port,route,options);}}));
 assert(saved.some(row=>row.status===500));assert.equal(saved.at(-1).label,'courtadmin-seed-before-history');assert(saved.every(row=>!JSON.stringify(row).includes('synthetic-token-')));
});
test('caller retains fixed failedStage and never copies arbitrary exception messages into summaries',async t=>{
 const {runAuthorisationCreate}=await import('./run-harness-authorisation-create.mjs'),fake=runFakes();fake.options.importDefinition=()=>{throw Error('private-canary-never-publish');};const result=await runAuthorisationCreate(path.join(temporary(t),'run'),fake.options);assert.equal(result.exitCode,2);assert.equal(result.summary.failedStage,'source-import');assert(!JSON.stringify(result.summary).includes('private-canary'));
});
test('successful CCD start followed by missing cleanup authority cannot start the next context',async t=>{
 const {runAuthorisationCreate}=await import('./run-harness-authorisation-create.mjs'),fake=runFakes();fake.options.cleanup=()=>undefined;const result=await runAuthorisationCreate(path.join(temporary(t),'run'),fake.options);assert.equal(result.exitCode,2);assert.equal(result.summary.failedStage,'cleanup');assert.equal(result.summary.cleanupComplete,false);assert.equal(fake.calls.filter(value=>value==='start').length,1);
});
test('parent-held pins reject coherently rewritten observation and captured journal',async t=>{
 const api=await libs(),{authorisationPacket}=require('./fixtures/exui-authorisation-create.mock.cjs'),directory=temporary(t),packet=await authorisationPacket(directory),value=packet.read('baseline-observation.json');
 value.journal.find(row=>row.label==='courtadmin-read').response.syntheticAdditional='coherent changed response';packet.write('baseline-observation.json',value);packet.write('baseline-requests.json',value.journal);assert.throws(()=>api.readAuthorisationCreatePacket(directory,packet.expected,{inspect:()=>null}),/AUTH_CREATE_PARENT_PIN_MISMATCH/);
});
test('parent-held identity rejects coherently rewritten owner/removal aliases',async t=>{
 const api=await libs(),{authorisationPacket}=require('./fixtures/exui-authorisation-create.mock.cjs'),directory=temporary(t),packet=await authorisationPacket(directory),old='harness-'+ 'a'.repeat(16),replacement='harness-'+ 'c'.repeat(16);
 for(const name of ['baseline-runtime/runtime.json','baseline-runtime/recovery.json','baseline-runtime/creation-attempts.json','baseline-import.json','baseline-stored-acl.json','baseline-observation.json','summary.json']){
  const value=JSON.parse(JSON.stringify(packet.read(name)).replaceAll(old,replacement));packet.write(name,value);
 }
 assert.throws(()=>api.readAuthorisationCreatePacket(directory,packet.expected,{inspect:()=>null}),/AUTH_CREATE_PARENT_PIN_MISMATCH/);
});
test('actual API returns separate held contexts and passes them directly to final replay',async t=>{
 const {runAuthorisationCreate}=await import('./run-harness-authorisation-create.mjs'),fake=runFakes();let held;
 fake.options.finalReplay=(directory,expected)=>{held=expected;assert.equal(expected.contexts.length,2);assert(expected.contexts.every(context=>context.fixture['definition.xlsx'].startsWith('sha256:')));return {};};const result=await runAuthorisationCreate(path.join(temporary(t),'run'),fake.options);assert.equal(result.exitCode,0);assert.equal(result.expected,held);assert.notEqual(result.expected,result.summary);assert.equal(result.expected.contexts[0].runtime.owner,'harness-1234567890abcdef');
});
test('actual-shaped UI event_token and legacy token responses retain hashes instead of credential values',async()=>{
 const api=await libs(),ui='synthetic-ui-start-secret',legacy='synthetic-legacy-secret',sent='synthetic-submission-secret';
 const captured=api.createAuthorisationJournal({}, {request:()=>({status:200,body:{event_token:ui,token:legacy,case_fields:[]}})});
 const response=await captured.call('fixed-start','courtadmin',{userId:'synthetic-actor',headers:{}},4452,'/internal/cases/1000000000000001/event-triggers/serviceOfDocuments',{method:'POST',body:{event_token:sent}});
 assert.equal(response.body.event_token,ui);assert.equal(response.body.token,legacy);
 const [row]=captured.journal;for(const value of [ui,legacy,sent])assert(!JSON.stringify(row).includes(value),'JOURNAL_CREDENTIAL_RETAINED');for(const value of [row.tokenDigest,row.eventTokenDigest,row.sentTokenDigest])assert.match(value,/^sha256:[a-f0-9]{64}$/);assert.equal(row.response.event_token,undefined);
});
