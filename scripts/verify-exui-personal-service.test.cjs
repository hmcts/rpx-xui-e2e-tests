const assert=require('node:assert/strict'),{test}=require('node:test'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {packet,writePacket}=require('./fixtures/exui-personal-service-packet.mock.cjs');
const temporary=()=>fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'personal-service-test-'));
test('personal-service complete source row and supporting enum are pinned; sole fault makes only selected event optional',async()=>{
 const m=await import('./lib/exui-personal-service-contract.mjs'),b=m.derivePersonalServiceFixture(),f=m.derivePersonalServiceFixture('optional');
 assert.deepEqual(Object.keys(m.personalServiceRow(b.fixture)).sort(),m.PERSONAL_SERVICE_ATTRIBUTES);assert.equal(m.PERSONAL_SERVICE_ATTRIBUTES.length,9);
 const expected=structuredClone(b.fixture);m.personalServiceRow(expected).DisplayContext='OPTIONAL';assert.deepEqual(f.fixture,expected);
 assert.equal(b.binding.obligationId,'configuration-shape:9ac2fb1c2dec3b07cd2dfb2bafcb2aa9fd4a0adfe8745e202e5616335f291df8');
 for(const k of ['activationClaim','sourceComplete','runtimeAcceptance','catalogueCredit','releaseCredit'])assert.equal(b.binding[k],false);
 assert.deepEqual(b.fixture.sheets.FixedLists.filter(r=>r.ID==='YesNoNotApplicable').map(r=>[r.ListElementCode,r.ListElement]),[['Yes','Yes'],['No','No'],['NotApplicable','Not applicable']]);
 for(const mutate of [x=>{m.personalServiceRow(x.fixture).ShowSummaryChangeOption='N';},x=>{x.binding.sourceRevision='foreign';},x=>{x.fixture.sheets.CaseEventToFields.push({...m.personalServiceRow(x.fixture)});},x=>{x.fixture.sheets.CaseField.find(r=>r.ID===m.PERSONAL_SERVICE_FIELD).Searchable='Y';}]){const bad=structuredClone(b);mutate(bad);assert.throws(()=>m.validatePersonalServiceFixture(bad,'baseline'),/PERSONAL_SERVICE/);}
});
test('personal-service descriptor consumes all event facets and exact enum; typed date joins selected version and row',async()=>{
 const m=await import('./lib/exui-personal-service-facets.mjs');for(const variant of ['baseline','optional']){const p=await packet(variant);m.validatePersonalServiceDescriptors(p.definition,p.pages,variant);m.validatePersonalServiceDate(p.date.rows,3);}
 for(const mutate of [p=>{p.definition.events[0].case_fields[0].display_context='READONLY';},p=>{p.definition.events[0].case_fields[0].show_condition='true';},p=>{p.definition.events[0].case_fields[0].show_summary_change_option=false;},p=>{p.pages.wizard_pages[1].order=1;},p=>{p.pages.wizard_pages[1].wizard_page_fields[0].order=7;},p=>{p.definition.case_fields[0].field_type.fixed_list_items[0].code='Wrong';}]){const p=await packet();mutate(p);assert.throws(()=>m.validatePersonalServiceDescriptors(p.definition,p.pages),/PERSONAL_SERVICE/);}
 for(const key of ['field','version','sql_type','live_from']){const p=await packet();p.date.rows[0][key]='foreign';assert.throws(()=>m.validatePersonalServiceDate(p.date.rows,3),/PERSONAL_SERVICE/);}
});
for(const variant of ['baseline','optional'])test(`personal-service complete non-credit raw reader ${variant}`,async()=>{
 const m=await import('./lib/exui-personal-service-evidence.mjs'),p=await packet(variant),dir=temporary();try{const expected=await writePacket(dir,p);const r=m.readPersonalServiceEvidence(dir,expected);assert.equal(r.status,variant==='baseline'?'personal-service-feasibility-observed':'personal-service-required-fault-detected');assert.equal(r.catalogueCredit,false);assert.equal(r.sourceComplete,false);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
const negatives={
 'filled validation before its trigger':p=>{const r=p.journal.splice(1,1)[0];p.journal.unshift(r);},
 'filled validations after submit':p=>{const r=p.journal.splice(3,1)[0];p.journal.splice(4,0,r);},
 'filled validation reused in empty window':p=>{const r=p.journal.splice(3,1)[0];p.journal.splice(5,0,r);},
 'empty validation before empty trigger':p=>{const r=p.journal.splice(6,1)[0];p.journal.splice(5,0,r);},
 'extra validation copied into window':p=>{p.journal.splice(2,0,structuredClone(p.journal[2]));},
 'empty CYA missing healthy row':p=>{delete p.observed.empty.cyaControl;},
 'empty CYA uses filled control value':p=>{p.observed.empty.cyaControl.value='personal-service-filled-control';},
 'empty CYA repeats control row':p=>{p.observed.empty.cyaControl.rowCount=2;},
 'optional target missing source-context suffix':p=>{p.observed.filled.ui.label='Does this document need to be personally served on the respondent?';},
 'optional sibling missing source-context suffix':p=>{p.observed.empty.healthySibling='Select additional recipients who needs to be served';},
 'unhealthy filled control':p=>{p.observed.filled.ui.precedesSelector=false;},
 'filled default already chosen':p=>{p.observed.filled.ui.initialSelected=1;},
 'missing actual persistence':p=>{p.observed.filled.after=structuredClone(p.observed.filled.before);},
 'wrong persisted answer':p=>{p.observed.filled.after.state.case_data.sodServeToRespondentOptions='Yes';},
 'wrong history actor':p=>{p.observed.filled.after.history[1].user_id='foreign';},
 'mutated prior history':p=>{p.observed.filled.after.history[0].id='foreign';},
 'empty branch persisted':p=>{p.observed.empty.after.state.version++;},
 'empty answer preselected':p=>{p.observed.empty.initialSelected=1;},
 'fault is a broken page':p=>{p.observed.empty.cya.heading='Something went wrong';},
 'fault did not reach CYA':p=>{p.observed.empty.cya.path=p.observed.empty.pagePath;},
 'unexpected blank validation':p=>{p.journal.at(-1).personalService.answer='No';},
 'missing raw submit':p=>{p.journal=p.journal.filter(r=>r.status!==201);},
 'wrong invocation actor':p=>{p.journal[0].actorId='foreign';},
 'framework setup failure':p=>{p.report.suites[0].specs[0].tests[0].results[0].errors[0].message='setup failed';},
 'missing named assertion':p=>{p.report.suites[0].specs[0].tests[0].results[0].steps=[];},
 'foreign descriptor version':p=>{p.definition.version.number=4;},
 'foreign date owner':p=>{p.date.owner='foreign';p.imported.owner='foreign';},
 'changed source row':p=>{p.imported.seal.personalServiceBinding={...p.binding,fieldOrder:99};},
 'failed import':p=>{p.imported.observations.import.status=400;},
};
for(const[name,mutate]of Object.entries(negatives))test(`personal-service reader rejects coherently hashed ${name}`,async()=>{
 const m=await import('./lib/exui-personal-service-evidence.mjs'),p=await packet('optional'),dir=temporary();try{const held={owner:p.date.owner,namespace:p.date.namespace,images:structuredClone(p.date.images)};mutate(p);const expected=await writePacket(dir,p);assert.throws(()=>m.readPersonalServiceEvidence(dir,{...expected,...held}),/PERSONAL_SERVICE/);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('personal-service reader rejects held digest replacement and incorrect observed terminal',async()=>{
 const m=await import('./lib/exui-personal-service-evidence.mjs'),p=await packet('optional'),dir=temporary();try{const expected=await writePacket(dir,p);assert.throws(()=>m.readPersonalServiceEvidence(dir,{...expected,terminal:{code:0,signal:null}}),/PERSONAL_SERVICE_EXIT/);fs.appendFileSync(path.join(dir,'baseline/ccd-requests.jsonl'),'\n');assert.throws(()=>m.readPersonalServiceEvidence(dir,expected),/PERSONAL_SERVICE_EVIDENCE_DIGEST/);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('personal-service import seals deterministic workbook; scenario cannot combine with selector mutation',async()=>{
 const m=await import('./lib/exui-recipient-callback-import.mjs'),root=temporary();try{const opts={variant:'binding-omitted',rowFacets:true,personalServiceVariant:'optional'};const a=await m.prepareRecipientCallbackImport(path.join(root,'a'),opts),b=await m.prepareRecipientCallbackImport(path.join(root,'b'),opts);assert.deepEqual(a,b);assert.equal(a.personalServiceBinding.variant,'optional');assert.equal(a.selectorEventBinding,undefined);await assert.rejects(m.prepareRecipientCallbackImport(path.join(root,'bad'),{...opts,selectorEventVariant:'baseline'}),/CALLBACK_EXCLUSIVE/);}finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('personal-service validation journal exposes only bounded answer and route, never arbitrary body',async()=>{
 const {personalServiceValidationProjection:p}=await import('./lib/exui-ccd-browser-runtime.mjs');const u=new URL('http://local/validate?pageId=serviceOfDocuments2');
 assert.deepEqual(p(JSON.stringify({event:{id:'serviceOfDocuments'},data:{sodServeToRespondentOptions:'No',secret:'not-retained'}}),u),{eventId:'serviceOfDocuments',pageId:'serviceOfDocuments2',answer:'No'});
 assert.equal(p(JSON.stringify({data:{sodServeToRespondentOptions:'not-retained'}}),u).answer,'invalid-answer');assert.equal(p('broken',u).eventId,null);
});
test('default native staged closure executes existing import without loading dedicated personal-service files',async()=>{
 const {NATIVE_HARNESS_SOURCE_FILES}=await import('./lib/exui-native-sources.mjs');const {CALLBACK_UI_SOURCES}=await import('./run-harness-recipient-callback-ui.mjs');
 const personal=['scripts/lib/exui-personal-service-contract.mjs','scripts/lib/exui-personal-service-facets.mjs','scripts/lib/exui-personal-service-evidence.mjs','scripts/fixtures/ccd/personal-service.source.json','src/fixtures/harnessPersonalService.ts','src/tests/harness/callback-feasibility/personal-service.spec.ts'];
 for(const file of personal){assert(CALLBACK_UI_SOURCES.includes(file));assert(!NATIVE_HARNESS_SOURCE_FILES.includes(file));}
 const root=temporary();try{
  const staged=path.join(root,'harness');for(const file of NATIVE_HARNESS_SOURCE_FILES){const dest=path.join(staged,file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.resolve(__dirname,'..',file),dest);}
  fs.symlinkSync(fs.realpathSync(path.join(__dirname,'../node_modules')),path.join(staged,'node_modules'));
  const {pathToFileURL}=require('node:url');const m=await import(pathToFileURL(path.join(staged,'scripts/lib/exui-recipient-callback-import.mjs')));
  assert(!/^import .* from ['"].*exui-personal-service/m.test(fs.readFileSync(path.join(__dirname,'run-harness-recipient-callback-ui.mjs'),'utf8')));
  const result=await m.prepareRecipientCallbackImport(path.join(root,'fixture'),{variant:'binding-omitted',rowFacets:true,selectorEventVariant:'baseline'});assert.equal(result.selectorEventBinding.variant,'baseline');assert.equal(result.personalServiceBinding,undefined);
  await assert.rejects(m.prepareRecipientCallbackImport(path.join(root,'personal'),{variant:'binding-omitted',rowFacets:true,personalServiceVariant:'baseline'}),{code:'ERR_MODULE_NOT_FOUND'});assert(!fs.existsSync(path.join(root,'personal')));
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('mandatory target must retain the unsuffixed label while its optional sibling has the suffix',async()=>{
 const {validatePersonalServiceObservation:validate}=await import('./lib/exui-personal-service-evidence.mjs');const p=await packet();validate(p.observed,p.journal,p.actorId,'baseline');p.observed.filled.ui.label+=' (Optional)';assert.throws(()=>validate(p.observed,p.journal,p.actorId,'baseline'),/PERSONAL_SERVICE_FILLED_UI/);
});
