const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {test}=require('node:test');
test('support only: callback workbook is deterministic, sealed and cannot overwrite',async t=>{
 const {prepareRecipientCallbackImport}=await import('./lib/exui-recipient-callback-import.mjs');
 const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'callback-workbook-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const first=path.join(root,'first'),second=path.join(root,'second');
 assert.deepEqual(await prepareRecipientCallbackImport(first),await prepareRecipientCallbackImport(second));
 for(const file of ['definition.json','definition.xlsx','binding.json'])assert.deepEqual(fs.readFileSync(path.join(first,file)),fs.readFileSync(path.join(second,file)));
 const fixture=JSON.parse(fs.readFileSync(path.join(first,'definition.json')));
 assert.equal(fixture.sheets.CaseEventToFields.find(row=>row.CaseFieldID==='sodAdditionalRecipientsList').CallBackURLMidEvent,'http://127.0.0.1:3101/service-of-documents/validate-additional-recipients');
 await assert.rejects(prepareRecipientCallbackImport(first));
});
test('support only: observed page binding rejects wrong page, stage, path and schema',async()=>{
 const {deriveRecipientCallbackFixture}=await import('./lib/exui-recipient-callback-fixture.mjs');
 const {validateObservedRecipientCallback}=await import('./lib/exui-recipient-callback-import.mjs');
 const {binding}=deriveRecipientCallbackFixture();
 const definition={id:'HarnessNestedPRL',version:{number:1},events:[{id:'serviceOfDocuments'}]};
 const pages={case_type_id:'HarnessNestedPRL',event_id:'serviceOfDocuments',wizard_pages:[{id:'serviceOfDocuments2',wizard_page_fields:[{case_field_id:binding.fieldId}],callback_url_mid_event:binding.normalizedUrl}]};
 validateObservedRecipientCallback(definition,pages,binding);
 for(const change of [p=>{p.event_id='create'},p=>{p.wizard_pages[0].id='1'},p=>{p.wizard_pages[0].id='2'},p=>{p.wizard_pages[0].callback_url_mid_event+='?different'},p=>{p.wizard_pages=[]},p=>{p.wizard_pages[0].wizard_page_fields=[]}]){const changed=structuredClone(pages);change(changed);assert.throws(()=>validateObservedRecipientCallback(definition,changed,binding),/CALLBACK_/);}
 assert.throws(()=>validateObservedRecipientCallback({...definition,events:[{callback_url_about_to_submit_event:binding.normalizedUrl}]},pages,binding),/CALLBACK_UNEXPECTED_EVENT_STAGE/);
});
test('support only: tampered callback source workbook and seals stop before runtime access',async t=>{
 const {prepareRecipientCallbackImport,importRecipientCallback}=await import('./lib/exui-recipient-callback-import.mjs');
 const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'callback-seals-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 for(const [index,file] of ['definition.json','definition.xlsx','binding.json'].entries()){
  const output=path.join(root,String(index));await prepareRecipientCallbackImport(output);fs.appendFileSync(path.join(output,file),'changed');
  await assert.rejects(importRecipientCallback({}, {fixtureDirectory:output,request:()=>{throw Error('should not call runtime')}}),/CALLBACK_IMPORT_SEAL_MISMATCH/);
 }
});
for (const importedStatus of [400,201]) test('support only: actual importer preserves '+importedStatus+' observations without accepted credit',async t=>{
 const runtime=await import('./lib/exui-ccd-runtime.mjs');
 const {prepareRecipientCallbackImport,importRecipientCallback}=await import('./lib/exui-recipient-callback-import.mjs');
 const {deriveRecipientCallbackFixture}=await import('./lib/exui-recipient-callback-fixture.mjs');const {binding}=deriveRecipientCallbackFixture();
 const output=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'callback-import-'));t.after(()=>fs.rmSync(output,{recursive:true,force:true}));
 const fixtures=path.join(output,'fixtures');await prepareRecipientCallbackImport(fixtures);
 const state={output,owner:'harness-callback-test',namespace:'a'.repeat(64),images:Object.fromEntries(Object.entries(runtime.CCD_IMAGES).map(([name,id])=>[name,{id}])),containers:Object.fromEntries(Object.keys(runtime.CCD_IMAGES).map(name=>[name,name==='database'?'a'.repeat(64):name]))};
 const inspectContainer=id=>{const service=Object.keys(state.containers).find(key=>state.containers[key]===id);return {Image:runtime.CCD_IMAGES[service],Config:{Labels:{'exui.harness.owner':state.owner,'exui.harness.service':service}},HostConfig:{NetworkMode:service==='database'?'none':`container:${state.namespace}`},State:{Running:true}};};
 const roles=[];
 const request=(_state,_port,route,options)=>{
  if(route==='/testing-support/accounts')return {status:201,body:{}};
  if(route==='/o/token')return {status:200,body:{access_token:'test-private-token'}};
  if(route==='/details')return {status:200,body:{id:'observer-id'}};
  if(route==='/testing-support/lease')return {status:200,body:'test-service-token'};
  if(route==='/api/user-role'){roles.push(options.body.role);return {status:201,body:{}};}
  if(route==='/import')return {status:importedStatus,body:{message:'fixture import response'}};
  if(route==='/api/data/case-type/HarnessNestedPRL')return {status:200,body:{id:'HarnessNestedPRL',version:{number:1},events:[{id:binding.eventId}]}};
  if(route.includes('/wizard-page-structure/'))return {status:200,body:{case_type_id:'HarnessNestedPRL',event_id:binding.eventId,wizard_pages:[{id:'serviceOfDocuments2',wizard_page_fields:[{case_field_id:binding.fieldId}],callback_url_mid_event:binding.normalizedUrl}]}};
  throw Error('unexpected route');
 };
 const before=structuredClone(state);
 if(importedStatus===400)await assert.rejects(importRecipientCallback(state,{fixtureDirectory:fixtures,request,inspectContainer}),/CALLBACK_IMPORT_REJECTED/);
 else await importRecipientCallback(state,{fixtureDirectory:fixtures,request,inspectContainer});
 const receipt=JSON.parse(fs.readFileSync(path.join(output,'recipient-callback-import/receipt.json')));
 assert.equal(receipt.status,importedStatus===400?'failed':'import-and-callback-descriptor-observed');
 assert.equal(receipt.runtimeAcceptance,false);assert.equal(receipt.catalogueCredit,false);
 assert.equal(receipt.observations.import.status,importedStatus);
 assert(roles.includes('caseworker-privatelaw-courtadmin')&&roles.includes('caseworker-privatelaw-readonly'));
 assert(!JSON.stringify(receipt).includes('test-private-token'));assert.deepEqual(state,before);
});
test('support only: callback omission is a sealed one-cell derivative with explicit absent descriptor',async t=>{
 const {prepareRecipientCallbackImport,validateObservedRecipientCallback,importRecipientCallback}=await import('./lib/exui-recipient-callback-import.mjs');
 const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'callback-omission-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const baseline=path.join(root,'baseline'),omitted=path.join(root,'omitted');await prepareRecipientCallbackImport(baseline);const seal=await prepareRecipientCallbackImport(omitted,{variant:'binding-omitted'});
 const before=JSON.parse(fs.readFileSync(baseline+'/definition.json')),after=JSON.parse(fs.readFileSync(omitted+'/definition.json'));
 delete before.sheets.CaseEventToFields.find(row=>row.CaseFieldID===seal.binding.fieldId).CallBackURLMidEvent;assert.deepEqual(after,before);assert.equal(seal.variant,'binding-omitted');assert.equal(seal.catalogueCredit,false);
 await assert.rejects(importRecipientCallback({}, {fixtureDirectory:omitted}),/CALLBACK_IMPORT_SEAL_MISMATCH/);
 const definition={id:'HarnessNestedPRL',version:{number:1},events:[{id:seal.binding.eventId}]},pages={case_type_id:'HarnessNestedPRL',event_id:seal.binding.eventId,wizard_pages:[{id:'serviceOfDocuments2',wizard_page_fields:[{case_field_id:seal.binding.fieldId}],callback_url_mid_event:null}]};
 validateObservedRecipientCallback(definition,pages,seal.binding,'binding-omitted');assert.throws(()=>validateObservedRecipientCallback(definition,pages,seal.binding),/CALLBACK_PAGE_URL/);
 pages.wizard_pages[0].callback_url_mid_event=seal.binding.normalizedUrl;assert.throws(()=>validateObservedRecipientCallback(definition,pages,seal.binding,'binding-omitted'),/CALLBACK_PAGE_URL/);
});
test('support only: descriptor set iteration order is immaterial while declared order and every field facet remain binding',async()=>{
 const {canonicalRecipientCallbackPages}=await import('./lib/exui-recipient-callback-fixture.mjs');
 const pages={case_type_id:'HarnessNestedPRL',event_id:'serviceOfDocuments',wizard_pages:[{id:'serviceOfDocuments2',order:2,callback_url_mid_event:'http://127.0.0.1:3101/service-of-documents/validate-additional-recipients',wizard_page_fields:[{case_field_id:'sodAdditionalRecipientsList',order:8,complex_field_overrides:[{complex_field_element_id:'emailInformation.emailName',display_context:'MANDATORY'}]},{case_field_id:'sodAdditionalRecipients',order:7,complex_field_overrides:[]}]}]};
 const original=structuredClone(pages),permuted=structuredClone(pages);permuted.wizard_pages[0].wizard_page_fields.reverse();assert.deepEqual(canonicalRecipientCallbackPages(pages),canonicalRecipientCallbackPages(permuted));assert.deepEqual(pages,original);
 for(const mutate of [p=>p.wizard_pages[0].wizard_page_fields[0].order=9,p=>p.wizard_pages[0].wizard_page_fields[0].complex_field_overrides[0].display_context='OPTIONAL',p=>p.wizard_pages[0].callback_url_mid_event=null]){const changed=structuredClone(pages);mutate(changed);assert.notDeepEqual(canonicalRecipientCallbackPages(pages),canonicalRecipientCallbackPages(changed));}
 for(const mutate of [p=>delete p.wizard_pages[0].wizard_page_fields[0].order,p=>p.wizard_pages[0].wizard_page_fields[0].order=7,p=>p.wizard_pages[0].wizard_page_fields[0].case_field_id='sodAdditionalRecipients']){const changed=structuredClone(pages);mutate(changed);assert.throws(()=>canonicalRecipientCallbackPages(changed),/CALLBACK_PAGE_FIELD_/);}
});
test('support only: row facets add exactly one labelled synthetic predecessor and remain opt-in sealed',async t=>{
 const {prepareRecipientCallbackImport,importRecipientCallback}=await import('./lib/exui-recipient-callback-import.mjs');
 const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'callback-facets-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 await prepareRecipientCallbackImport(root+'/plain');const seal=await prepareRecipientCallbackImport(root+'/facets',{rowFacets:true});
 const plain=JSON.parse(fs.readFileSync(root+'/plain/definition.json')),facets=JSON.parse(fs.readFileSync(root+'/facets/definition.json'));
 assert.deepEqual(facets.sheets.CaseEventToFields.pop(),{LiveFrom:'01/01/2020',CaseTypeID:'HarnessNestedPRL',CaseEventID:'serviceOfDocuments',CaseFieldID:'protectedValue',DisplayContext:'READONLY',PageID:'harnessBefore',PageDisplayOrder:1,PageFieldDisplayOrder:1,ShowSummaryChangeOption:'N'});assert.deepEqual(facets,plain);assert.equal(seal.rowFacets,true);assert.equal(seal.catalogueCredit,false);
 await prepareRecipientCallbackImport(root+'/omitted',{rowFacets:true,variant:'binding-omitted'});
 const omitted=JSON.parse(fs.readFileSync(root+'/omitted/definition.json')),expected=JSON.parse(fs.readFileSync(root+'/facets/definition.json'));
 delete expected.sheets.CaseEventToFields.find(row=>row.CaseFieldID===seal.binding.fieldId).CallBackURLMidEvent;
 assert.deepEqual(omitted,expected);
 await assert.rejects(importRecipientCallback({}, {fixtureDirectory:root+'/facets'}),/CALLBACK_IMPORT_SEAL_MISMATCH/);
 await assert.rejects(prepareRecipientCallbackImport(root+'/invalid',{rowFacets:'yes'}),/CALLBACK_FACETS_OPTION_REQUIRED/);
});
const facetDescriptors=()=>({definition:{events:[{id:'serviceOfDocuments',case_fields:[{case_field_id:'sodAdditionalRecipientsList',display_context:'COMPLEX',show_condition:'sodAdditionalRecipients="additionalRecipients"',show_summary_change_option:true},{case_field_id:'protectedValue',display_context:'READONLY'}]}],case_fields:[{id:'sodAdditionalRecipientsList',label:'Recipient',field_type:{type:'Collection',collection_field_type:{id:'ServeOrgDetails'}}}]},pages:{wizard_pages:[{id:'serviceOfDocumentsharnessBefore',order:1,wizard_page_fields:[{case_field_id:'protectedValue',order:1}]},{id:'serviceOfDocuments2',order:2,wizard_page_fields:[{case_field_id:'sodAdditionalRecipientsList',order:8},{case_field_id:'sodAdditionalRecipients',order:7}]}]}});
test('support only: source row descriptor facets reject material drift and ambiguous identities',async()=>{
 const {validateCallbackRowDescriptors}=await import('./lib/exui-recipient-callback-facets.mjs');
 const valid=facetDescriptors();assert.equal(validateCallbackRowDescriptors(valid.definition,valid.pages).catalogueCredit,false);
 for(const change of [v=>v.definition.events[0].case_fields[0].display_context='OPTIONAL',v=>v.definition.events[0].case_fields[0].show_condition='',v=>v.definition.events[0].case_fields[0].show_summary_change_option=false,v=>v.definition.case_fields[0].label='Other',v=>v.definition.case_fields[0].field_type.collection_field_type.id='Other',v=>v.pages.wizard_pages[1].order=1,v=>v.pages.wizard_pages[1].wizard_page_fields[0].order=7,v=>v.pages.wizard_pages[0].order=3,v=>v.definition.events[0].case_fields.push(v.definition.events[0].case_fields[0]),v=>v.pages.wizard_pages.push(v.pages.wizard_pages[1])]){const altered=structuredClone(valid);change(altered);assert.throws(()=>validateCallbackRowDescriptors(altered.definition,altered.pages),/CALLBACK_FACET_/);}
});
const storedDateRow=()=>({case_type:'HarnessNestedPRL',version:1,event:'serviceOfDocuments',page:'serviceOfDocuments2',field:'sodAdditionalRecipientsList',live_from:'2024-09-01',sql_type:'date'});
test('support only: typed date preservation requires one exact source-identified current-version row',async()=>{
 const {validateCallbackStoredDate}=await import('./lib/exui-recipient-callback-facets.mjs');
 const row=storedDateRow(),proof=validateCallbackStoredDate([row],1);assert.equal(proof.activationClaim,false);assert.equal(proof.catalogueCredit,false);
 for(const rows of [[],[row,row],...Object.entries({case_type:'PRLAPPS',version:2,event:'create',page:'other',field:'protectedValue',live_from:'2024-01-09',sql_type:'text'}).map(([key,value])=>[{...row,[key]:value}])])assert.throws(()=>validateCallbackStoredDate(rows,1),/CALLBACK_FACET_DATE_ROW/);
 assert.throws(()=>validateCallbackStoredDate([row],'1; DROP TABLE case_type'),/CALLBACK_FACET_VERSION/);
});
test('support only: owned date readback uses fixed read-only SQL and retains failed material observations',async t=>{
 const {readCallbackStoredDate}=await import('./lib/exui-recipient-callback-facets.mjs');
 const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'callback-date-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));fs.mkdirSync(root+'/recipient-callback-import');
 const state={output:root,namespace:'a'.repeat(64)};let inspections=0,commands=0;
 const inspect=s=>{assert.equal(s,state);inspections++;};
 const runDocker=(args,sql)=>{commands++;assert.deepEqual(args,['exec','-i',state.namespace,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','ccd_definition']);assert.match(sql,/^BEGIN READ ONLY;/);assert.match(sql,/ct.version=1 /);assert.match(sql,/pg_typeof\(dgcf.live_from\)/);return JSON.stringify([storedDateRow()]);};
 readCallbackStoredDate(state,1,{inspect,runDocker});assert.equal(inspections,2);assert.equal(commands,1);
 assert.throws(()=>readCallbackStoredDate(state,'1; DROP',{inspect,runDocker}),/CALLBACK_FACET_VERSION/);assert.equal(commands,1);
 assert.throws(()=>readCallbackStoredDate(state,1,{inspect:()=>{throw Error('ownership');},runDocker}),/ownership/);assert.equal(commands,1);
 assert.throws(()=>readCallbackStoredDate(state,1,{inspect,runDocker:()=>JSON.stringify([{...storedDateRow(),live_from:'2020-01-01'}])}),/CALLBACK_FACET_DATE_ROW/);
 assert.throws(()=>readCallbackStoredDate(state,1,{inspect,runDocker:()=>{throw Error('private transport detail');}}),/^Error: CALLBACK_FACET_DATE_QUERY_FAILED$/);
 assert.throws(()=>readCallbackStoredDate(state,1,{inspect,runDocker:()=>'{invalid'}),/CALLBACK_FACET_DATE_RESPONSE/);
 const retained=JSON.parse(fs.readFileSync(root+'/recipient-callback-import/stored-row-date.json'));assert.equal(retained.rows[0].live_from,'2020-01-01');assert.equal(retained.catalogueCredit,false);
});
