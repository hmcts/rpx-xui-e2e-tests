const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { test } = require('node:test');
const ts = require('typescript');
const { chromium, expect } = require('@playwright/test');

// Exercise the actual helper with Chromium, without bootstrapping native CCD.
const filename = path.resolve(__dirname, '../src/fixtures/harnessSourceShapes.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const captureFilename = path.resolve(__dirname, '../src/fixtures/harnessSourceShapeCapture.ts');
const capture = new Module(captureFilename, module);
capture.paths = module.paths;
capture._compile(ts.transpileModule(fs.readFileSync(captureFilename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, captureFilename);
const fixture = new Module(filename, module);
fixture.paths = module.paths;
fixture.require = (id) => id === './harnessCcdEvent'
  ? { expect: expect.configure({ timeout: 150 }) }
  : id === './harnessSourceShapeCapture' ? capture.exports : require(id);
fixture._compile(compiled, filename);
const { assertSourceShapeHiddenControls } = fixture.exports;

test('source shape visibility permits retained hidden controls but rejects visible leaks', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<input id="emailName" type="hidden"><div hidden><input id="AddressLine2"></div><input id="emailAddress">');
    await assertSourceShapeHiddenControls(page.locator('#emailName'), page.locator('#AddressLine2'));
    await assertSourceShapeHiddenControls(page.locator('#absent'));
    await assert.rejects(() => assertSourceShapeHiddenControls(page.locator('#emailAddress')));
    await page.locator('#emailName').evaluate((element) => { element.type = 'text'; });
    await assert.rejects(() => assertSourceShapeHiddenControls(page.locator('#emailName')));
  } finally {
    await browser.close();
  }
});

// Regression for retained native run 66119: empty optional siblings serialize as
// null on edit. Populate them so exact subsequent readback proves data retention.
test('postal fixture populates every unrelated optional sibling and preserves the target blank', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(['AddressLine2','AddressLine3','PostTown','County','Country','PostCode'].map(id => `<input id="recipient_postalAddress_${id}" value="${id === 'PostCode' ? 'SW1A 1AA' : ''}">`).join(''));
    await fixture.exports.fillSourceShapePostalSiblings(page);
    for (const [field, value] of Object.entries(fixture.exports.postalSiblingValues))
      assert.equal(await page.locator(`input[id$="${field}"]`).inputValue(), value);
    assert.equal(await page.locator('input[id$="AddressLine2"]').inputValue(), '');
    assert.equal(await page.locator('input[id$="PostCode"]').inputValue(), 'SW1A 1AA');
  } finally { await browser.close(); }
});

// Optional is a real candidate label suffix; neither variant may accept the other.
test('radio label binds the exact baseline or optional-mutant display context', async()=>{
 const browser=await chromium.launch({headless:true});
 try {
  const page=await browser.newPage();
  await page.setContent('<fieldset><legend>Served by (Optional)</legend><input type="radio"></fieldset>');
  await fixture.exports.assertSourceShapeRadioLabel(page,true);
  await assert.rejects(()=>fixture.exports.assertSourceShapeRadioLabel(page,false));
  await page.setContent('<fieldset><legend>Served by</legend><input type="radio"></fieldset>');
  await fixture.exports.assertSourceShapeRadioLabel(page,false);
  await assert.rejects(()=>fixture.exports.assertSourceShapeRadioLabel(page,true));
 } finally {await browser.close();}
});

test('postal label witness reads the actual label and rejects unrelated or unchanged mutant labels',async()=>{
 const browser=await chromium.launch({headless:true});
 try {
  const page=await browser.newPage();
  await page.setContent('<label for="line2">Address Line 2 (Optional)</label><input id="line2">');
  assert.equal(await fixture.exports.assertSourceShapePostalLabel(page.locator('#line2'),false),'Address Line 2 (Optional)');
  await assert.rejects(()=>fixture.exports.assertSourceShapePostalLabel(page.locator('#line2'),true));
  await page.locator('label').evaluate(el=>el.textContent='Harness changed postal line two (Optional)');
  assert.equal(await fixture.exports.assertSourceShapePostalLabel(page.locator('#line2'),true),'Harness changed postal line two (Optional)');
  await assert.rejects(()=>fixture.exports.assertSourceShapePostalLabel(page.locator('#line2'),false));
 } finally {await browser.close();}
});


test('radio bypass requires real successful empty-recipient persistence and preserves unrelated state/history',()=>{
 const before={state:{state:'JUDICIAL_REVIEW',version:1,case_data:{protectedValue:'control',sodAdditionalRecipientsList:[]}},history:[{id:'create',created_date:'before'}]};
 const after={state:{state:'JUDICIAL_REVIEW',version:2,case_data:{...before.state.case_data,sodAdditionalRecipients:['additionalRecipients'],sodAdditionalRecipientsList:[]}},history:[{id:'serviceOfDocuments',created_date:'after'},...before.history]};
 fixture.exports.assertRadioValidationBypass(201,before,after);
 for(const change of [x=>x.state.case_data.sodAdditionalRecipientsList=[{id:'unexpected'}],x=>delete x.state.case_data.sodAdditionalRecipientsList,x=>x.state.case_data.protectedValue='changed',x=>x.state.case_data.extra='changed',x=>x.state.state='other',x=>x.state.version=1,x=>x.history.pop(),x=>x.history[1].created_date='changed',x=>x.history[0].id='wrongEvent']) {
  const changed=structuredClone(after);change(changed);
  assert.throws(()=>fixture.exports.assertRadioValidationBypass(201,before,changed));
 }
 assert.throws(()=>fixture.exports.assertRadioValidationBypass(400,before,after));
});
