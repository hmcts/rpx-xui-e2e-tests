const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const {test}=require('node:test'),ts=require('typescript'),pw=require('@playwright/test');
const filename=path.resolve(__dirname,'../src/fixtures/harnessCallbackJourney.ts'),fixture=new Module(filename,module);fixture.paths=module.paths;
fixture.require=id=>id==='./harnessCcdEvent'?{}:id==='@playwright/test'?{...pw,expect:pw.expect.configure({timeout:250})}:require(id);
fixture._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,filename);
test('callback waits for actual first event page and rejects premature or wrong-case URLs',async()=>{
 const browser=await pw.chromium.launch({headless:true});try{
  const page=await browser.newPage();await page.route('http://127.0.0.1:3100/**',r=>r.fulfill({body:'<html>Protected value</html>',contentType:'text/html'}));
  const base='/cases/case-details/HARNESS/HarnessNestedPRL/1234567890123456';await page.goto('http://127.0.0.1:3100'+base);
  await assert.rejects(()=>fixture.exports.waitForCallbackFirstPage(page,'1234567890123456'));
  await page.evaluate(p=>setTimeout(()=>history.pushState({},'',p),50),base+'/trigger/serviceOfDocuments/serviceOfDocumentsharnessBefore');
  await fixture.exports.waitForCallbackFirstPage(page,'1234567890123456');
  await assert.rejects(()=>fixture.exports.waitForCallbackFirstPage(page,'2234567890123456'));
 }finally{await browser.close();}
});
test('callback captures computed link name without requiring aria-label and rejects wrong names',async()=>{
 const browser=await pw.chromium.launch({headless:true});try{
  const page=await browser.newPage();await page.setContent('<a href="#">Change <span>Recipient</span></a>');
  assert.equal(await page.locator('a').getAttribute('aria-label'),null);
  assert.equal(await fixture.exports.callbackChangeAccessibleName(page.locator('a')),'Change Recipient');
  await page.locator('span').evaluate(el=>el.textContent='Other');
  await assert.rejects(()=>fixture.exports.callbackChangeAccessibleName(page.locator('a')));
 }finally{await browser.close();}
});
