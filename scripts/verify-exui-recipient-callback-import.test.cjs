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
