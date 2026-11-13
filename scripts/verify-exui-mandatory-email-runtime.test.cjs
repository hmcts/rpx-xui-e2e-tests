const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
for(const variant of ['baseline','name-optional','address-optional'])test(`raw ${variant} requires trigger/save causal interleaving after coherent journal rehash`,async t=>{
  const {rawPacket}=require('./fixtures/exui-mandatory-email-runtime.mock.cjs');
  const {readMandatoryEmailEvidence}=await import('./lib/exui-mandatory-email-event-evidence.mjs');
  const {digestBytes}=await import('./lib/exui-evidence-io.mjs');
  const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'mandatory-email-order-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const x=await rawPacket(root,variant),name='baseline/ccd-requests.jsonl',file=x.directory+'/'+name;
  const rows=fs.readFileSync(file,'utf8').trim().split('\n').map(JSON.parse);
  // Unrelated requests can interleave without introducing a global timing contract.
  rows.splice(1,0,{method:'GET',path:'/api/user/details',status:200,actorId:x.expected.actorId});
  fs.writeFileSync(file,rows.map(row=>JSON.stringify(row)+'\n').join(''));x.expected.files[name]=digestBytes(fs.readFileSync(file));
  readMandatoryEmailEvidence(x.directory,x.expected);
  const reordered=[...rows.filter(row=>row.method==='POST'),...rows.filter(row=>row.method!=='POST')];
  fs.writeFileSync(file,reordered.map(row=>JSON.stringify(row)+'\n').join(''));x.expected.files[name]=digestBytes(fs.readFileSync(file));
  assert.throws(()=>readMandatoryEmailEvidence(x.directory,x.expected),/MANDATORY_EMAIL_CAUSAL_JOURNAL_ORDER/);
});
test('actual canonical importer caller seals each finite mandatory email variant and preserves the default',async t=>{
  const {prepareRecipientCallbackImport}=await import('./lib/exui-recipient-callback-import.mjs');
  const {deriveMandatoryEmailEventRows}=await import('./lib/exui-mandatory-email-event-rows.mjs');
  const {deriveRecipientCallbackImport}=await import('./lib/exui-recipient-callback-fixture.mjs');
  const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'mandatory-email-import-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  for(const variant of ['baseline','name-optional','address-optional']){
    const destination=path.join(root,variant),seal=await prepareRecipientCallbackImport(destination,{variant:'binding-omitted',rowFacets:true,mandatoryEmailEventVariant:variant});
    const expected=deriveMandatoryEmailEventRows(variant);
    assert.deepEqual(seal.mandatoryEmailEventBinding,expected.binding);
    assert.deepEqual(JSON.parse(fs.readFileSync(destination+'/definition.json')),expected.fixture);
    assert.deepEqual(seal.binding,deriveRecipientCallbackImport('binding-omitted',true).binding);
    assert.equal(seal.catalogueCredit,false);
  }
  const destination=path.join(root,'default'),seal=await prepareRecipientCallbackImport(destination);
  assert.equal(seal.mandatoryEmailEventBinding,undefined);
  assert.deepEqual(JSON.parse(fs.readFileSync(destination+'/definition.json')),deriveRecipientCallbackImport().fixture);
});
test('new import selection rejects unknown variants and mixed source or callback scenarios before output creation',async t=>{
  const {prepareRecipientCallbackImport}=await import('./lib/exui-recipient-callback-import.mjs');
  const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'mandatory-email-reject-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  for(const extra of [{mandatoryEmailEventVariant:'foreign'},{mandatoryEmailEventVariant:'baseline',selectorEventVariant:'baseline'},{mandatoryEmailEventVariant:'baseline',personalServiceVariant:'baseline'}]){
    const output=path.join(root,'must-not-exist');
    await assert.rejects(prepareRecipientCallbackImport(output,{variant:'binding-omitted',rowFacets:true,...extra}));assert(!fs.existsSync(output));
  }
  await assert.rejects(prepareRecipientCallbackImport(path.join(root,'badcallback'),{variant:'baseline',rowFacets:true,mandatoryEmailEventVariant:'baseline'}));
});
test('fixed descriptor and typed date helpers reject source, condition, order, context, label and owner drift',async()=>{
  const api=await import('./lib/exui-mandatory-email-event-facets.mjs');
  const {descriptorPacket}=require('./fixtures/exui-mandatory-email-runtime.mock.cjs');
  for(const variant of ['baseline','name-optional','address-optional']){
    const x=await descriptorPacket(variant);api.validateMandatoryEmailDescriptors(x.definition,x.pages,x.derivation);
    for(const change of [x=>x.definition.events[0].case_fields[0].case_fields_complex[0].order++,x=>x.definition.events[0].case_fields[0].case_fields_complex[0].showCondition='foreign',x=>x.definition.events[0].case_fields[0].case_fields_complex[0].displayContext='READONLY',x=>x.definition.events[0].case_fields[0].case_fields_complex[0].label='wrong',x=>x.derivation.binding.rows[0].sourceIndex++]){
      const changed=await descriptorPacket(variant);change(changed);assert.throws(()=>api.validateMandatoryEmailDescriptors(changed.definition,changed.pages,changed.derivation));
    }
  }
});
test('actual fixed SQL boundary checks integer version, both owned inspections and exact typed rows',async t=>{
  const {readMandatoryEmailDates}=await import('./lib/exui-mandatory-email-event-facets.mjs');
  const state={output:'/unused',owner:'synthetic-owner',namespace:'a'.repeat(64),images:{}};
  const rows=['emailInformation.emailAddress','emailInformation.emailName'].map(reference=>({case_type:'HarnessNestedPRL',version:3,event:'serviceOfDocuments',field:'sodAdditionalRecipientsList',reference,live_from:'2024-09-01',sql_type:'date'}));
  let inspected=0,sql;
  const result=readMandatoryEmailDates(state,3,{writeReceipt:false,inspect:s=>{assert.equal(s,state);inspected++;},runDocker:(args,query)=>{assert.deepEqual(args.slice(0,3),['exec','-i',state.namespace]);sql=query;return JSON.stringify(rows);}});
  assert.equal(inspected,2);assert.equal(result.catalogueCredit,false);assert(sql.includes('BEGIN READ ONLY;')&&sql.includes("'emailInformation.emailAddress','emailInformation.emailName'"));
  assert.throws(()=>readMandatoryEmailDates(state,'3;WRITE',{writeReceipt:false,inspect:()=>assert.fail('must not inspect')}));
  for(const key of ['reference','live_from','sql_type']){const bad=structuredClone(rows);bad[0][key]='foreign';assert.throws(()=>readMandatoryEmailDates(state,3,{writeReceipt:false,inspect:()=>{},runDocker:()=>JSON.stringify(bad)}));}
});
test('raw source/import/date/terminal/persistence reader accepts complete three-mode packets and rejects held drift',async t=>{
  const {rawPacket}=require('./fixtures/exui-mandatory-email-runtime.mock.cjs');
  const {readMandatoryEmailEvidence}=await import('./lib/exui-mandatory-email-event-evidence.mjs');
  const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'mandatory-email-raw-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  for(const variant of ['baseline','name-optional','address-optional']){
    const x=await rawPacket(root,variant);assert.equal(readMandatoryEmailEvidence(x.directory,x.expected).catalogueCredit,false);
    const journalPath=x.directory+'/baseline/ccd-requests.jsonl',journal=fs.readFileSync(journalPath);
    fs.appendFileSync(journalPath,JSON.stringify({method:'POST',path:'/data/cases/9999999999999999/events',status:201,actorId:x.expected.actorId})+'\n');
    x.expected.files['baseline/ccd-requests.jsonl']=(await import('./lib/exui-evidence-io.mjs')).digestBytes(fs.readFileSync(journalPath));
    assert.throws(()=>readMandatoryEmailEvidence(x.directory,x.expected),/MANDATORY_EMAIL_EXACT_SAVE_JOURNAL/);
    fs.writeFileSync(journalPath,journal);x.expected.files['baseline/ccd-requests.jsonl']=(await import('./lib/exui-evidence-io.mjs')).digestBytes(journal);
    const input=JSON.parse(fs.readFileSync(x.directory+'/input.json'));input.runId='changed-after-held-capture';fs.writeFileSync(x.directory+'/input.json',JSON.stringify(input));
    // A coherent post-proof rehash still cannot replace the parent's pre-proof bytes.
    x.expected.files['input.json']=(await import('./lib/exui-evidence-io.mjs')).digestBytes(fs.readFileSync(x.directory+'/input.json'));
    assert.throws(()=>readMandatoryEmailEvidence(x.directory,x.expected),/MANDATORY_EMAIL_PREPARED_DRIFT/);
  }
});
test('actual tools entrypoint selects only dedicated new config/env while default argv stays unchanged',async t=>{
  const {pathToFileURL}=require('node:url'),{spawnSync}=require('node:child_process');
  const {deriveMandatoryEmailEventRows}=await import('./lib/exui-mandatory-email-event-rows.mjs');
  const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'mandatory-email-tools-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const mock=path.join(root,'owned-spawn.mjs'),capture=path.join(root,'spawn.json');
  fs.writeFileSync(mock,`import fs from 'node:fs';import{EventEmitter}from'node:events';export function spawn(command,args,options){fs.writeFileSync(${JSON.stringify(capture)},JSON.stringify({command,args,options}));const child=new EventEmitter();queueMicrotask(()=>child.emit('exit',options.env.EXUI_MANDATORY_EMAIL_EVENT_VARIANT?.endsWith('-optional')?1:0,null));return child;}`);
  // Only relocate fixed data paths/imports and replace the external process boundary.
  // The actual tools entrypoint selection, canonical source validation and argv body run unchanged.
  const source=fs.readFileSync(path.join(__dirname,'recipient-callback-ui-tools.mjs'),'utf8')
    .replace("import {spawn} from 'node:child_process';",`import {spawn} from ${JSON.stringify(pathToFileURL(mock).href)};`)
    .replace(/(["'])(\.\/[^"']+)\1/g,(_all,_quote,relative)=>JSON.stringify(pathToFileURL(path.resolve(__dirname,relative)).href))
    .replaceAll('/output',root);
  const entry=path.join(root,'tools.mjs');fs.writeFileSync(entry,source);fs.mkdirSync(root+'/baseline');
  const run=input=>{fs.rmSync(capture,{force:true});fs.writeFileSync(root+'/input.json',JSON.stringify(input));return spawnSync(process.execPath,[entry,'--inside-proof'],{encoding:'utf8',timeout:10000,env:{PATH:process.env.PATH,HOME:root}});};
  for(const variant of ['baseline','name-optional','address-optional']){
    const r=run({kind:'mandatory-email-event-ui-feasibility',variant,mandatoryEmailEventBinding:deriveMandatoryEmailEventRows(variant).binding,browserExecutable:'synthetic-not-launched'});
    assert.equal(r.status,variant==='baseline'?0:1,r.stderr);
    const actual=JSON.parse(fs.readFileSync(capture));assert.deepEqual(actual.args.slice(-2),['--config','/harness/playwright.mandatory-email-event.config.mjs']);
    assert.equal(actual.options.env.EXUI_MANDATORY_EMAIL_EVENT,'true');assert.equal(actual.options.env.EXUI_MANDATORY_EMAIL_EVENT_VARIANT,variant);
    assert.deepEqual(JSON.parse(fs.readFileSync(root+'/baseline/framework-terminal.json')),{code:r.status,signal:null});
  }
  const old=run({kind:'recipient-callback-ui-feasibility',variant:'baseline',browserExecutable:'synthetic-not-launched'});assert.equal(old.status,0,old.stderr);
  const original=JSON.parse(fs.readFileSync(capture));assert.equal(original.args.at(-1),'/harness/playwright.callback-feasibility.config.mjs');assert(!Object.hasOwn(original.options.env,'EXUI_MANDATORY_EMAIL_EVENT'));
  for(const input of [{kind:'foreign',variant:'baseline'},{kind:'mandatory-email-event-ui-feasibility',variant:'foreign'},{kind:'mandatory-email-event-ui-feasibility',variant:'baseline',mandatoryEmailEventBinding:{wrong:true}}]){assert.notEqual(run(input).status,0);assert(!fs.existsSync(capture));}
});
test('actual new-scenario controller rejects unknown selection and cancellation before any runtime/output',async t=>{
  const {runCallbackUi}=await import('./run-harness-recipient-callback-ui.mjs');
  const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'mandatory-email-controller-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const input={candidate:path.join(root,'must-not-read-candidate'),browser:path.join(root,'must-not-read-browser'),output:path.join(root,'must-not-create'),scenario:'mandatory-email-event',variant:'foreign'};
  await assert.rejects(runCallbackUi(input),/CALLBACK_UI_VARIANT/);
  await assert.rejects(runCallbackUi({...input,scenario:'foreign',variant:'baseline'}),/CALLBACK_UI_SCENARIO/);
  const controller=new AbortController();controller.abort();await assert.rejects(runCallbackUi({...input,variant:'baseline',signal:controller.signal}),/CALLBACK_UI_CANCELLED/);
  assert(!fs.existsSync(input.output));
});
test('actual importer rejects changed source definition before credential or runtime contact',async t=>{
  const {prepareRecipientCallbackImport,importRecipientCallback}=await import('./lib/exui-recipient-callback-import.mjs');
  const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'mandatory-email-seal-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const output=path.join(root,'fixture'),options={variant:'binding-omitted',rowFacets:true,mandatoryEmailEventVariant:'name-optional'};
  await prepareRecipientCallbackImport(output,options);
  const definition=JSON.parse(fs.readFileSync(output+'/definition.json'));definition.sheets.EventToComplexTypes.find(r=>r.ListElementCode==='emailInformation.emailName').FieldShowCondition='foreign';fs.writeFileSync(output+'/definition.json',JSON.stringify(definition));
  await assert.rejects(importRecipientCallback({}, {...options,fixtureDirectory:output,request:()=>assert.fail('must not reach backend'),inspectContainer:()=>assert.fail('must not inspect')}),/CALLBACK_IMPORT_SEAL_MISMATCH/);
});
