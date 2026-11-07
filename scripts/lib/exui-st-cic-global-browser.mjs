import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {digestBytes} from './exui-evidence-io.mjs';
import {validateDivorceFlagEvidence} from './exui-divorce-profile-browser.mjs';
import {validateStCicGlobalSearchBrowser} from './exui-st-cic-profile-consumers.mjs';
const read=file=>JSON.parse(fs.readFileSync(file));
const files=['manifest.json','runtime-identity.json','profile-browser-flags.json','profile-browser-report.json','profile-browser-terminal.json','profile-browser-observation.json','profile-browser-assets.json','profile-browser-rejections.json','profile-st-cic-support.json','profile-st-cic-destinations.json','profile-st-cic-selection.json'];
export function readStCicGlobalBrowserEvidence(directory,mutation,{candidateRoot='/candidate',identity}={}) {
 const get=name=>read(path.join(directory,name)),manifest=get('manifest.json');
 assert.deepEqual(get('runtime-identity.json').identity,manifest.identity,'ST_CIC_BROWSER_IDENTITY');
 if(identity!==undefined)assert.deepEqual(manifest.identity,identity,'ST_CIC_BROWSER_IDENTITY');
 assert.equal(manifest.identity.webappCommit,'20c6ec129fc1e81061c733e164198ec63a33e71a','ST_CIC_BROWSER_IDENTITY');
 try{validateDivorceFlagEvidence(get('profile-browser-flags.json'));}catch{throw Error('ST_CIC_BROWSER_FLAGS');}
 assert.deepEqual(get('profile-browser-terminal.json'),{code:0,signal:null},'ST_CIC_BROWSER_TERMINAL');
 const report=get('profile-browser-report.json'),specs=[];const visit=suite=>{specs.push(...(suite.specs??[]));for(const child of suite.suites??[])visit(child);};for(const suite of report.suites??[])visit(suite);
 assert.deepEqual(report.errors,[],'ST_CIC_BROWSER_REPORT');
 for(const [key,value]of Object.entries({expected:1,skipped:0,unexpected:0,flaky:0}))assert.equal(report.stats?.[key],value,'ST_CIC_BROWSER_REPORT');
 assert.equal(specs.length,1,'ST_CIC_BROWSER_REPORT');assert.equal(specs[0].title,'ST_CIC profile global-search browser consumer','ST_CIC_BROWSER_REPORT');assert.equal(specs[0].tests?.length,1,'ST_CIC_BROWSER_REPORT');
 const test=specs[0].tests[0];assert.equal(test.status,'expected','ST_CIC_BROWSER_REPORT');assert.equal(test.expectedStatus,'passed','ST_CIC_BROWSER_REPORT');assert.equal(test.results?.length,1,'ST_CIC_BROWSER_REPORT');assert.equal(test.results[0].status,'passed','ST_CIC_BROWSER_REPORT');assert.equal(test.results[0].retry,0,'ST_CIC_BROWSER_REPORT');
 const support=get('profile-st-cic-support.json');assert(Array.isArray(support)&&support.length<=1,'ST_CIC_BROWSER_SUPPORT');for(const call of support)assert.deepEqual(call,{method:'GET',path:'/refdata/external/v1/organisations',status:200,body:{}},'ST_CIC_BROWSER_SUPPORT');
 const assets=get('profile-browser-assets.json'),assetRoot=fs.realpathSync(path.join(candidateRoot,'dist/rpx-exui/browser'));
 assert(Array.isArray(assets)&&assets.length>0&&new Set(assets.map(row=>row.path)).size===assets.length,'ST_CIC_BROWSER_ASSETS');
 for(const row of assets){
  assert.deepEqual(Object.keys(row).sort(),['digest','path'],'ST_CIC_BROWSER_ASSETS');assert(typeof row.path==='string'&&row.path.startsWith('/')&&/\.m?js$/.test(row.path)&&/^sha256:[a-f0-9]{64}$/.test(row.digest),'ST_CIC_BROWSER_ASSETS');
  const file=path.resolve(assetRoot,'.'+row.path);assert(file.startsWith(assetRoot+path.sep)&&fs.realpathSync(file).startsWith(assetRoot+path.sep),'ST_CIC_BROWSER_ASSETS');assert.equal(row.digest,digestBytes(fs.readFileSync(file)),'ST_CIC_BROWSER_ASSETS');
 }
 assert.deepEqual(get('profile-browser-rejections.json'),[],'ST_CIC_BROWSER_EGRESS');const rejected=path.join(directory,'provider-rejections.jsonl');assert(!fs.existsSync(rejected)||fs.readFileSync(rejected,'utf8').trim()==='','ST_CIC_BROWSER_EGRESS');
 const observation=get('profile-browser-observation.json'),journal=get('profile-st-cic-destinations.json');
 const available=observation.rendered.some(row=>row.id==='ST_CIC');assert.deepEqual(get('profile-st-cic-selection.json'),{schemaVersion:1,family:'ST_CIC',available,selected:available?'ST_CIC':null,restored:'ALL'},'ST_CIC_BROWSER_SELECTION');
 validateStCicGlobalSearchBrowser(observation,journal,mutation);
 return {runtimeAcceptance:false,catalogueCredit:false,wholeProfileSatisfied:false,releaseCredit:false,releaseApproval:false};
}
export const stCicGlobalBrowserEvidenceDigest=directory=>digestBytes(JSON.stringify(files.map(name=>[name,digestBytes(fs.readFileSync(path.join(directory,name)))])));
export async function probeStCicGlobalBrowser({cookie,output,mutation,browser}) {
 const env={PATH:'/usr/local/bin:/usr/bin:/bin',HOME:'/tmp',EXUI_ST_CIC_BROWSER:'true',EXUI_ST_CIC_OUTPUT:output,EXUI_SESSION_COOKIE:cookie,EXUI_CHROMIUM_EXECUTABLE:browser.executable};
 const child=spawn(process.execPath,['/harness/node_modules/@playwright/test/cli.js','test','--config','/harness/playwright.st-cic-global.config.mjs'],{cwd:'/harness',env,stdio:'inherit'});
 const terminal=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>resolve({code,signal}));});
 fs.writeFileSync(path.join(output,'profile-browser-terminal.json'),JSON.stringify(terminal),{mode:0o600});
 readStCicGlobalBrowserEvidence(output,mutation);
}
