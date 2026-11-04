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
const fixture = new Module(filename, module);
fixture.paths = module.paths;
fixture.require = (id) => id === './harnessCcdEvent'
  ? { expect: expect.configure({ timeout: 150 }) }
  : require(id);
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
