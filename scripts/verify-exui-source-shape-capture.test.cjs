const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const Module = require('node:module');
const ts = require('typescript');
const filename = process.env.SOURCE_SHAPE_CAPTURE_TEST_MODULE ?? path.resolve(__dirname, '../src/fixtures/harnessSourceShapeCapture.ts');
function load() {
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
  }).outputText;
  const loaded = new Module(filename, module); loaded.paths = module.paths;
  loaded._compile(compiled, filename); return loaded.exports;
}
const actor = {id:'12345678-1234-4234-8234-123456789abc', roles:['caseworker','caseworker-harness','caseworker-privatelaw-courtadmin'], name:'private-canary', token:'private-canary'};
test('capture fixes six filenames, normalizes only measured actor identity, and refuses unsafe JSON', t => {
  const {sourceShapeCapture} = load();
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'shape-capture-unit-'))); t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  for (const shape of ['recipient-collection','case-field-recipient-selector','required-delivery-radio','conditional-email-complex','postal-recipient-name','optional-postal-line-two']) {
    const capture = sourceShapeCapture(shape,actor,'1234567890123456');
    assert.deepEqual(capture.snapshot().actor,{id:actor.id,roles:actor.roles});
    assert(!JSON.stringify(capture.snapshot()).includes('private-canary'));
    assert.throws(()=>capture.response('bootstrap', {status:()=>NaN}),/SOURCE_SHAPE_CAPTURE/);
    assert.throws(()=>capture.readback('collection-reopened', {value:undefined}),/SOURCE_SHAPE_CAPTURE/);
  }
  for (const shape of ['../escape','unknown','recipient-collection/../../escape']) assert.throws(()=>sourceShapeCapture(shape,actor,'1234567890123456'),/SOURCE_SHAPE_CAPTURE/);
  assert.throws(()=>sourceShapeCapture('recipient-collection',{...actor,roles:['admin']},'1234567890123456'),/SOURCE_SHAPE_CAPTURE/);
});
const {capturePage} = require('./fixtures/exui-source-shape-capture.mock.cjs');
test('actual DOM callback measures field IDs, labels, visibility, order and rows without expected-value substitution',async()=>{
  const {sourceShapeCapture}=load(),f=capturePage(),capture=sourceShapeCapture('recipient-collection',actor,'1234567890123456');
  f.model.inputs=[f.node({id:'unrelated_emailName',value:'private-unrelated-canary'}),f.node({id:'sodAdditionalRecipientsList_0_emailName',value:'measured different value',attributes:{'aria-label':'Actual ARIA name','aria-labelledby':'measured-label'},labels:[f.node({textContent:' Measured label '})]}),f.node({id:'sodAdditionalRecipientsList_0_emailAddress',value:'measured@example.invalid',visible:false})];
  f.model.markers=[f.node({id:'measured-label',textContent:'Actual referenced label'})];
  f.model.buttons=[f.node({textContent:'Add new'})];f.model.errors=[f.node({textContent:'secret error text'})];
  const row=f.node({textContent:'Actual row two',select:{':scope > td':[f.node({textContent:'Measured cell'})]}});
  f.model.tables=[f.node({select:{':scope > tbody > tr':[row]}})];
  await capture.stage('case-opened',f.page);const dom=capture.snapshot().stages[0].dom;
  assert.equal(dom.fields.emailName[0].value,'measured different value');assert.deepEqual(dom.fields.emailName[0].labels,['Measured label']);
  assert.equal(dom.fields.emailName[0].ariaLabel,'Actual ARIA name');assert.deepEqual(dom.fields.emailName[0].labelledBy,[{id:'measured-label',text:'Actual referenced label'}]);assert(!JSON.stringify(dom).includes('private-unrelated-canary'));
  assert.equal(dom.fields.emailAddress[0].visible,false);assert.deepEqual(dom.order.map(row=>row.field),['emailName','emailAddress']);
  assert.equal(dom.collections[0].rows[0].text,'Actual row two');assert.deepEqual(dom.errors,[{visible:true}]);assert(!JSON.stringify(dom).includes('secret error text'));
  f.model.inputs.reverse();f.model.inputs[0].visible=true;await capture.stage('event-opened',f.page);
  assert.deepEqual(capture.snapshot().stages[1].dom.order.map(row=>row.field),['emailAddress','emailName']);
  assert.equal(capture.snapshot().stages[1].dom.fields.emailAddress[0].visible,true);
});
test('conditional fault snapshots preserve zero OR one measured pair, with postalName distinct from Line2',async()=>{
  const {sourceShapeCapture}=load();
  for(const count of [0,1]){
    const f=capturePage(),capture=sourceShapeCapture('conditional-email-complex',actor,'1234567890123456','ccd-shape-conditional-email-complex');
    if(count) f.model.inputs.push(f.node({id:'sodAdditionalRecipientsList_0_emailName',value:'observed fault name'}),f.node({id:'sodAdditionalRecipientsList_0_emailAddress',value:'observed fault email'}));
    f.model.inputs.push(f.node({id:'sodAdditionalRecipientsList_0_postalName',labels:[f.node({textContent:'Actual postal-name label'})]}),f.node({id:'sodAdditionalRecipientsList_0_AddressLine2',labels:[f.node({textContent:'Actual line-two label'})]}));
    await capture.stage('case-opened',f.page);const dom=capture.snapshot().stages[0].dom;
    assert.equal(dom.fields.emailName.length,count);assert.equal(dom.fields.emailAddress.length,count);
    assert.deepEqual(dom.fields.postalName[0].labels,['Actual postal-name label']);assert.deepEqual(dom.fields.AddressLine2[0].labels,['Actual line-two label']);
  }
});
test('all six finite healthy/fault flows persist private exclusive receipts with observed statuses and independent reopened read',async t=>{
 const {sourceShapeCapture}=load(),dir=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'shape-capture-flows-')));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const flows={
 'recipient-collection':[['collection-cya','collection-reopened'],['singular-form','singular-cya']],
 'case-field-recipient-selector':[['email-filled','cya','selector-reopened'],['email-filled','cya','selector-reopened']],
 'required-delivery-radio':[['radio-unselected','first-continue','email-filled','cya'],['radio-unselected','first-continue','cya']],
 'conditional-email-complex':[['email-selected','post-selected','email-returned','email-filled','cya'],['email-selected','post-selected','post-filled','cya']],
 'postal-recipient-name':[['email-selected','post-selected','post-filled','cya'],['email-selected','post-selected','post-filled','cya']],
 'optional-postal-line-two':[['email-selected','post-selected','post-filled','cya','line2-reopened','line2-filled','second-cya'],['email-selected','post-selected','post-filled','cya','line2-reopened','line2-filled','second-cya']]};
 for(const [shape,variants]of Object.entries(flows))for(const [index,stages]of variants.entries()){
  const f=capturePage(),capture=sourceShapeCapture(shape,actor,'1234567890123456',index?`ccd-shape-${shape}`:undefined),output=path.join(dir,shape+'-'+index);fs.mkdirSync(output);
  assert.throws(()=>capture.save(output),/SOURCE_SHAPE_CAPTURE/);
  for(const stage of ['case-opened','event-opened',...stages])await capture.stage(stage,f.page);
  assert.throws(()=>capture.save(output),/SOURCE_SHAPE_CAPTURE/);
  const response={status:()=>418};
  const ids=['bootstrap','user-details','case-opened','event-opened','submit',...(shape==='recipient-collection'&&!index?['collection-reopened']:[]),...(shape==='case-field-recipient-selector'?['selector-reopened']:[]),...(shape==='optional-postal-line-two'?['line2-case-reopened','line2-event-reopened','second-submit']:[])];
  for(const id of ids)assert.equal(capture.response(id,response),response);assert.equal(capture.snapshot().responses[0].status,418);
  if(shape==='recipient-collection'&&!index){const actual={state:{value:'actual second read'}};capture.readback('collection-reopened',actual);actual.state.value='later mutation';assert.equal(capture.snapshot().readbacks[0].observation.state.value,'actual second read');}
  capture.save(output);const filename=path.join(output,`source-shape-${shape}-ui-observation.json`);
  assert.equal(fs.statSync(filename).mode&0o777,0o600);assert.throws(()=>capture.save(output),/EEXIST/);
  assert.equal(JSON.parse(fs.readFileSync(filename)).stages.length,stages.length+2);
 }
});
test('foreign stages, identity conflicts, duplicate responses and DOM errors cannot become successful capture',async()=>{
 const {sourceShapeCapture}=load(),f=capturePage(),capture=sourceShapeCapture('recipient-collection',actor,'1234567890123456');
 await assert.rejects(()=>capture.stage('line2-filled',f.page),/SOURCE_SHAPE_CAPTURE/);
 await assert.rejects(()=>capture.stage('case-opened',{locator:()=>({evaluate:()=>{throw Error('dom measurement failed');}})}),/dom measurement failed/);
 await assert.rejects(()=>capture.stage('case-opened',{locator:()=>({evaluate:()=>({rawError:'private-canary'})})}),/SOURCE_SHAPE_CAPTURE/);
 assert.equal(capture.snapshot().stages.length,0);
 capture.response('bootstrap',{status:()=>201});assert.throws(()=>capture.response('bootstrap',{status:()=>201}),/SOURCE_SHAPE_CAPTURE/);
 assert.throws(()=>sourceShapeCapture('recipient-collection',{...actor,uid:'foreign'},'1234567890123456'),/SOURCE_SHAPE_CAPTURE/);
 assert.throws(()=>sourceShapeCapture('recipient-collection',actor,'1234567890123456','ccd-shape-postal-recipient-name'),/SOURCE_SHAPE_CAPTURE/);
});

test('existing browser assertions module-load the actual capture helper without running a browser',()=>{
 const browserFile=path.resolve(__dirname,'verify-exui-source-shape-visibility.browser.test.cjs'),registered=[];
 const smoke=new Module(browserFile,module);smoke.paths=module.paths;
 const realRequire=Module.createRequire(browserFile);
 smoke.require=id=>id==='node:test'?{test:(name)=>registered.push(name)}:realRequire(id);
 smoke._compile(fs.readFileSync(browserFile,'utf8'),browserFile);
 assert.deepEqual(registered,[
  'source shape visibility permits retained hidden controls but rejects visible leaks',
  'postal fixture populates every unrelated optional sibling and preserves the target blank',
  'radio label binds the exact baseline or optional-mutant display context',
  'postal label witness reads the actual label and rejects unrelated or unchanged mutant labels',
  'radio bypass requires real successful empty-recipient persistence and preserves unrelated state/history',
 ]);
});

test('absent, zero-area, hidden and replaced controls are measured without an existence-wait fallback',async()=>{
 const {sourceShapeCapture}=load(),f=capturePage(),capture=sourceShapeCapture('recipient-collection',actor,'1234567890123456');
 f.model.inputs=[f.node({id:'sodAdditionalRecipientsList_0_emailName',visibility:'hidden'}),f.node({id:'sodAdditionalRecipientsList_0_emailAddress',getClientRects:()=>[{width:0,height:10}]})];
 await capture.stage('case-opened',f.page);let dom=capture.snapshot().stages[0].dom;
 assert.equal(dom.fields.emailName[0].visible,false);assert.equal(dom.fields.emailAddress[0].visible,false);assert.deepEqual(dom.fields.postalName,[]);
 f.model.inputs=[f.node({id:'sodAdditionalRecipientsList_1_emailName',value:'replacement'})];
 await capture.stage('event-opened',f.page);dom=capture.snapshot().stages[1].dom;
 assert.equal(dom.fields.emailName[0].id,'sodAdditionalRecipientsList_1_emailName');assert.deepEqual(dom.fields.emailAddress,[]);
});
test('strict private serialization rejects unsafe paths, prototypes, oversized measurements and non-JSON reads',async t=>{
 const {sourceShapeCapture}=load(),f=capturePage(),capture=sourceShapeCapture('recipient-collection',actor,'1234567890123456');
 for(const value of [undefined,NaN,Infinity,1n,new Date(),{x:undefined},Array(2),{value:()=>1}])assert.throws(()=>capture.readback('collection-reopened',value),/SOURCE_SHAPE_CAPTURE/);
 const cycle={};cycle.self=cycle;assert.throws(()=>capture.readback('collection-reopened',cycle),/SOURCE_SHAPE_CAPTURE/);
 f.model.inputs=[f.node({id:'sodAdditionalRecipientsList_0_emailName',value:'x'.repeat(4097)})];await assert.rejects(()=>capture.stage('case-opened',f.page),/SOURCE_SHAPE_CAPTURE/);
 assert.equal(capture.snapshot().stages.length,0);
 assert.throws(()=>capture.save('../relative'),/SOURCE_SHAPE_CAPTURE/);
 const dir=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'shape-capture-alias-')));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const link=path.join(dir,'alias');fs.symlinkSync(dir,link);assert.throws(()=>capture.save(link),/SOURCE_SHAPE_CAPTURE/);
});

test('email complex capture counts actual containers and preserves zero direct legends without inventing one',async()=>{
 const {sourceShapeCapture}=load();
 for(const count of [0,1,2])for(const legends of [[],[''],['Actual nonblank legend']]){
  const f=capturePage(),capture=sourceShapeCapture('conditional-email-complex',actor,'1234567890123456');
  f.model.complexes=Array.from({length:count},(_,n)=>f.node({id:`sodAdditionalRecipientsList_${n}_emailInformation`,select:{':scope > fieldset > legend':legends.map(textContent=>f.node({textContent}))}}));
  f.model.legends=f.model.complexes.flatMap(row=>row.select[':scope > fieldset > legend']);
  await capture.stage('case-opened',f.page);const d=capture.snapshot().stages[0].dom;
  assert.equal(d.emailComplexes.length,count);assert.deepEqual(d.emailComplexes.map(row=>row.id),f.model.complexes.map(row=>row.id));
  assert.deepEqual(d.emailComplexes.map(row=>row.legends.map(x=>x.text)),Array.from({length:count},()=>legends));
 }
});
test('collection rows record actual exact leaf text and visibility, including hidden cross-recipient markers',async()=>{
 const {sourceShapeCapture}=load(),f=capturePage(),capture=sourceShapeCapture('recipient-collection',actor,'1234567890123456');
 const shown=f.node({textContent:'Actual recipient name'}),nested=f.node({textContent:'Actual recipient name',children:[shown]}),hidden=f.node({textContent:'Other recipient name',visible:false}),partial=f.node({textContent:'Actual recipient name suffix'});
 const row=f.node({textContent:'aggregate text',children:[nested,hidden,partial],select:{'*':[nested,shown,hidden,partial],':scope > td':[]}});
 f.model.tables=[f.node({select:{':scope > tbody > tr':[row]}})];
 await capture.stage('case-opened',f.page);const leaves=capture.snapshot().stages[0].dom.collections[0].rows[0].leaves;
 assert.equal(leaves.filter(x=>x.text==='Actual recipient name').length,1);assert.deepEqual(leaves.find(x=>x.text==='Other recipient name'),{text:'Other recipient name',visible:false});assert(leaves.some(x=>x.text==='Actual recipient name suffix'));
});

test('only the three asserted visible field families capture actual local textbox names, ignoring raw-attribute guesses',async()=>{
 const {sourceShapeCapture}=load(),f=capturePage(),capture=sourceShapeCapture('recipient-collection',actor,'1234567890123456');
 f.model.inputs=[
  f.node({id:'sodAdditionalRecipientsList_0_emailName',attributes:{'aria-label':'Name','aria-labelledby':'label'},ariaSnapshot:[{role:'textbox',name:'Unrelated recipient',ref:'private-ref-canary',text:'private-value-canary'}]}),
  f.node({id:'sodAdditionalRecipientsList_0_postalName',ariaSnapshot:[{role:'textbox',name:'Hidden reference Name'}]}),
  f.node({id:'sodAdditionalRecipientsList_0_AddressLine2',ariaSnapshot:[{role:'textbox',name:'Name "quoted" \\slash'}]}),
  f.node({id:'sodAdditionalRecipientsList_0_emailAddress'}),
  f.node({id:'sodAdditionalRecipientsList_1_emailName',visible:false}),
 ];
 f.model.markers=[f.node({id:'label',textContent:'Raw referenced text'})];await capture.stage('case-opened',f.page);const d=capture.snapshot().stages[0].dom;
 assert.equal(d.fields.emailName[0].accessibleName,'Unrelated recipient');assert.equal(d.fields.emailName[0].accessibleRole,'textbox');assert.equal(d.fields.postalName[0].accessibleName,'Hidden reference Name');assert.equal(d.fields.AddressLine2[0].accessibleName,'Name "quoted" \\slash');
 assert.equal(d.fields.emailAddress[0].accessibleName,null);assert.equal(d.fields.emailName[1].accessibleName,null);
 assert.equal(f.model.calls.filter(c=>c.method==='ariaSnapshotJSON').length,3);assert(f.model.calls.filter(c=>c.method==='ariaSnapshotJSON').every(c=>c.options.mode==='ai'&&c.options.depth===1));assert(!JSON.stringify(d).includes('private-ref-canary'));assert(!JSON.stringify(d).includes('private-value-canary'));
});
test('absent, duplicated, removed, wrong-role or ambiguous accessibility targets fail without waiting or fallback',async()=>{
 const {sourceShapeCapture}=load();
 for(const snapshot of [[{role:'button',name:'Name'}],[{role:'textbox',name:'Name'},{role:'textbox',name:'Other'}],[],{role:'textbox'},[{role:'textbox',name:42}],[{role:'textbox',name:'Name',children:[{role:'text',text:'ambiguous'}]}],[{role:'textbox',name:'Name',headers:'private-canary'}]]){
  const f=capturePage(),c=sourceShapeCapture('recipient-collection',actor,'1234567890123456');f.model.inputs=[f.node({id:'sodAdditionalRecipientsList_0_emailName',ariaSnapshot:snapshot})];await assert.rejects(()=>c.stage('case-opened',f.page),/SOURCE_SHAPE_CAPTURE/);assert.equal(c.snapshot().stages.length,0);
 }
 for(const count of [0,2]){
  const f=capturePage(),c=sourceShapeCapture('recipient-collection',actor,'1234567890123456');f.model.inputs=[f.node({id:'sodAdditionalRecipientsList_0_emailName'})];f.model.afterBody=()=>{f.model.inputs=Array.from({length:count},()=>f.node({id:'sodAdditionalRecipientsList_0_emailName'}));};await assert.rejects(()=>c.stage('case-opened',f.page),/SOURCE_SHAPE_CAPTURE/);assert.equal(f.model.calls.filter(row=>row.method==='ariaSnapshotJSON').length,0);
 }
 const f=capturePage(),c=sourceShapeCapture('recipient-collection',actor,'1234567890123456');f.model.inputs=[f.node({id:'sodAdditionalRecipientsList_0_emailName'})];f.model.beforeAria=()=>{f.model.inputs=[];};await assert.rejects(()=>c.stage('case-opened',f.page),/missing nonwaiting target/);assert.equal(c.snapshot().stages.length,0);
});

test('Angular fixed-list radios without value attributes retain measured checked state, DOM value and computed names',async()=>{
 const {sourceShapeCapture}=load(),f=capturePage(),c=sourceShapeCapture('recipient-collection',actor,'1234567890123456');
 const radios=checked=>['email','post'].map(code=>f.node({id:'sodAdditionalRecipientsList_0_serveByPostOrEmail-'+code,type:'radio',value:'on',checked:code===checked,ariaSnapshot:[{role:'radio',name:code==='email'?'Email':'Post',...(code===checked?{checked:true}:{})}]}));
 f.model.inputs=[...radios(null),f.node({id:'sodAdditionalRecipientsListForeign_serveByPostOrEmail-email',type:'radio',value:'on',ariaSnapshot:[{role:'radio',name:'private-canary'}]})];
 await c.stage('case-opened',f.page);const first=c.snapshot().stages[0].dom;
 for(const code of ['email','post']){assert.equal(first.fields[code].length,1);assert.equal(first.fields[code][0].checked,false);assert.equal(first.fields[code][0].value,'on');assert.equal(first.fields[code][0].accessibleRole,'radio');assert.equal(first.fields[code][0].accessibleName,code==='email'?'Email':'Post');}
 f.model.inputs=radios('email');await c.stage('event-opened',f.page);const next=c.snapshot().stages[1].dom;assert.equal(next.fields.email[0].checked,true);assert.equal(next.fields.post[0].checked,false);assert(!JSON.stringify(next).includes('private-canary'));
 const g=capturePage(),other=sourceShapeCapture('recipient-collection',actor,'1234567890123456');g.model.inputs=[g.node({id:'sodAdditionalRecipientsList_1_serveByPostOrEmail-post',type:'radio',value:'on',checked:true,ariaSnapshot:[{role:'radio',name:'Post',checked:true}]})];await other.stage('case-opened',g.page);assert.equal(other.snapshot().stages[0].dom.fields.post[0].checked,true);assert.deepEqual(other.snapshot().stages[0].dom.fields.email,[]);
});
test('radio capture rejects replacement, wrong role and checked-state races without guessing',async()=>{
 const {sourceShapeCapture}=load();
 for(const snapshot of [[{role:'textbox',name:'Email'}],[{role:'radio',name:'Email',checked:true}],[{role:'radio',name:'Email',checked:'mixed'}]]){
  const f=capturePage(),c=sourceShapeCapture('recipient-collection',actor,'1234567890123456');f.model.inputs=[f.node({id:'sodAdditionalRecipientsList_0_serveByPostOrEmail-email',type:'radio',value:'on',checked:false,ariaSnapshot:snapshot})];await assert.rejects(()=>c.stage('case-opened',f.page),/SOURCE_SHAPE_CAPTURE/);assert.equal(c.snapshot().stages.length,0);
 }
 for(const count of [0,2]){const f=capturePage(),c=sourceShapeCapture('recipient-collection',actor,'1234567890123456'),radio=()=>f.node({id:'sodAdditionalRecipientsList_0_serveByPostOrEmail-email',type:'radio',value:'on',ariaSnapshot:[{role:'radio',name:'Email'}]});f.model.inputs=[radio()];f.model.afterBody=()=>{f.model.inputs=Array.from({length:count},radio);};await assert.rejects(()=>c.stage('case-opened',f.page),/SOURCE_SHAPE_CAPTURE/);assert.equal(c.snapshot().stages.length,0);}
});
