const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const api=()=>import(process.env.ST_CIC_GLOBAL_TEST_MODULE??'./lib/exui-st-cic-global-browser.mjs');
const fault='source-profile-drop-st-cic-global-search',named='ST_CIC_GLOBAL_SEARCH_ASSERTION';
async function packet(t,mutated=false){
 const {stCicGlobalSearchEvidence}=await import('./lib/exui-st-cic-profile-consumers.mjs');
 const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'st-cic-global-reader-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const directory=path.join(root,'evidence'),candidateRoot=path.join(root,'candidate'),assetRoot=path.join(candidateRoot,'dist/rpx-exui/browser');fs.mkdirSync(directory);fs.mkdirSync(assetRoot,{recursive:true});
 const bytes='fixed candidate script',digest='sha256:'+require('node:crypto').createHash('sha256').update(bytes).digest('hex');fs.writeFileSync(path.join(assetRoot,'main.js'),bytes);
 const data=stCicGlobalSearchEvidence();if(mutated){for(const key of ['delivered','warm'])data.observation[key]=data.observation[key].filter(row=>row.serviceId!=='ST_CIC');data.observation.rendered=data.observation.rendered.filter(row=>row.id!=='ST_CIC');data.observation.upstream.searchCriteria.CCDJurisdictionIds=data.observation.upstream.searchCriteria.CCDJurisdictionIds.filter(id=>id!=='ST_CIC');data.journal[1].body.searchCriteria.CCDJurisdictionIds=data.journal[1].body.searchCriteria.CCDJurisdictionIds.filter(id=>id!=='ST_CIC');}
 const write=(name,value)=>fs.writeFileSync(path.join(directory,name),JSON.stringify(value));
 const identity={webappCommit:'1a986f4dc87e6ea4598e30c042bf2b3072122b75'};
 const files={'manifest.json':{identity},'runtime-identity.json':{identity},'profile-browser-flags.json':{flag:'feature-global-search',evaluationFlags:{},routeFallback:true,liveProvider:false,calls:[{host:'app.launchdarkly.com',kind:'evaluation',method:'REPORT',path:'/sdk/evalx/synthetic-flags/context',response:{}}]},'profile-browser-report.json':{errors:[],stats:{expected:1,skipped:0,unexpected:0,flaky:0},suites:[{specs:[{title:'ST_CIC profile global-search browser consumer',tests:[{status:'expected',expectedStatus:'passed',results:[{status:'passed',retry:0}]}]}]}]},'profile-browser-terminal.json':{code:0,signal:null},'profile-browser-observation.json':data.observation,'profile-browser-assets.json':[{path:'/main.js',digest}],'profile-browser-rejections.json':[],'profile-st-cic-support.json':[],'profile-st-cic-destinations.json':data.journal,'profile-st-cic-selection.json':{schemaVersion:1,family:'ST_CIC',available:!mutated,selected:mutated?null:'ST_CIC',restored:'ALL'}};
 for(const [name,value]of Object.entries(files))write(name,value);
 return {directory,candidateRoot,identity,files,write,data,assetRoot};
}
test('ST_CIC global reader accepts healthy browser controls and only full declared omission reaches unchanged named oracle',async t=>{
 const m=await api(),base=await packet(t),changed=await packet(t,true);assert.equal(m.readStCicGlobalBrowserEvidence(base.directory,null,base).catalogueCredit,false);
 assert.throws(()=>m.readStCicGlobalBrowserEvidence(changed.directory,fault,changed),error=>error.message===named);
 assert.throws(()=>m.readStCicGlobalBrowserEvidence(base.directory,fault,base),error=>error.message==='ST_CIC_FAULT_NOT_EFFECTIVE');
});
test('ST_CIC global reader rejects missing user selection, control loss, flags, assets, terminal or false green before semantic attribution',async t=>{
 const m=await api(),p=await packet(t,true);
 const mutations=[['profile-st-cic-selection.json',{schemaVersion:1,family:'ST_CIC',available:false,selected:'ST_CIC',restored:'ALL'}],['profile-browser-flags.json',{...p.files['profile-browser-flags.json'],evaluationFlags:{'feature-global-search':true}}],['profile-browser-flags.json',{...p.files['profile-browser-flags.json'],calls:[]}],['profile-browser-assets.json',[]],['profile-browser-assets.json',[{path:'/main.js',digest:'sha256:'+'0'.repeat(64)}]],['profile-browser-assets.json',[{path:'/../outside.js',digest:'sha256:'+'0'.repeat(64)}]],['profile-browser-terminal.json',{code:1,signal:null}],['profile-browser-report.json',{...p.files['profile-browser-report.json'],stats:{expected:0,skipped:1,unexpected:0,flaky:0}}],['profile-browser-rejections.json',['UNDECLARED']],['profile-st-cic-support.json',[{method:'GET',path:'/foreign',status:200,body:{}}]],['runtime-identity.json',{identity:{webappCommit:'other'}}]];
 for(const [file,value]of mutations){p.write(file,value);assert.throws(()=>m.readStCicGlobalBrowserEvidence(p.directory,fault,p),error=>error.message!==named,file);p.write(file,p.files[file]);}
 const observation=structuredClone(p.data.observation);observation.rendered=observation.rendered.filter(row=>row.id!=='IA');p.write('profile-browser-observation.json',observation);assert.throws(()=>m.readStCicGlobalBrowserEvidence(p.directory,fault,p),error=>error.message!==named);p.write('profile-browser-observation.json',p.files['profile-browser-observation.json']);
 fs.writeFileSync(path.join(p.directory,'provider-rejections.jsonl'),'{}\n');assert.throws(()=>m.readStCicGlobalBrowserEvidence(p.directory,fault,p),error=>error.message!==named);
});
test('baseline requires observed ST_CIC selection and complete single test first attempt',async t=>{
 const m=await api(),p=await packet(t);
 for(const change of [x=>{x.available=false;x.selected=null;},x=>{x.selected='ALL';},x=>{x.restored='ST_CIC';},x=>{x.extra=true;}]){const receipt=structuredClone(p.files['profile-st-cic-selection.json']);change(receipt);p.write('profile-st-cic-selection.json',receipt);assert.throws(()=>m.readStCicGlobalBrowserEvidence(p.directory,null,p),/ST_CIC_BROWSER_SELECTION/);}
 p.write('profile-st-cic-selection.json',p.files['profile-st-cic-selection.json']);
 for(const change of [x=>{x.suites[0].specs[0].title='other';},x=>{x.suites[0].specs[0].tests[0].results[0].retry=1;},x=>{x.suites[0].specs[0].tests[0].results.push({status:'passed',retry:0});},x=>{x.errors.push({message:'PRIVATE-CANARY'});},x=>{x.suites[0].specs.push(x.suites[0].specs[0]);}]){const report=structuredClone(p.files['profile-browser-report.json']);change(report);p.write('profile-browser-report.json',report);assert.throws(()=>m.readStCicGlobalBrowserEvidence(p.directory,null,p),/ST_CIC_BROWSER_REPORT/);}
});

test('G worker records browser framework pass separately from its named semantic failure and raw replay never trusts the label',async t=>{
 const {executeProfileProof}=await import('./source-profile-jurisdictions-worker.mjs'),{validateProfileInvocationResult,facetSettings}=await import('./run-harness-source-profile-jurisdictions.mjs'),m=await api();assert.equal(facetSettings('st-cic-global-search').fault,fault);
 for(const mutated of [false,true]){
  const p=await packet(t,mutated),current={facet:'st-cic-global-search',directory:p.directory,invocationId:mutated?fault:'baseline',mutation:mutated?fault:null,identity:p.identity,configDigest:'config',sourceDigest:'source'};
  const code=await executeProfileProof(current,{probe:()=>m.readStCicGlobalBrowserEvidence(p.directory,current.mutation,p)});assert.equal(code,mutated?1:0);
  const raw=validateProfileInvocationResult({...current,candidateRoot:p.candidateRoot,terminal:{code,signal:null}});assert.equal(raw.status,mutated?'expected-fault-observed':'observed');assert.equal(raw.catalogueCredit,false);assert.match(raw.browserEvidenceDigest,/^sha256:/);
  const bad=structuredClone(p.files['profile-st-cic-selection.json']);bad.restored='ST_CIC';p.write('profile-st-cic-selection.json',bad);assert.throws(()=>validateProfileInvocationResult({...current,candidateRoot:p.candidateRoot,terminal:{code,signal:null}}),error=>error.message!==named);
 }
});

test('shared profile asset guard preserves DIVORCE transport policy and ST_CIC output separation without a browser',async t=>{
 const {createHash}=require('node:crypto'),{Module}=require('node:module'),typescript=require('typescript');
 const source=fs.readFileSync(path.join(__dirname,'../src/fixtures/harnessProfileBrowserAssets.ts'),'utf8'),code=typescript.transpileModule(source,{compilerOptions:{module:typescript.ModuleKind.CommonJS,target:typescript.ScriptTarget.ES2022}}).outputText;
 const compiled=new Module(__filename);compiled.filename=__filename;compiled.paths=module.paths;const realRequire=compiled.require.bind(compiled);let assetCalls=0;
 compiled.require=name=>name==='../harness/routing'?{verifyRoutingAsset:(root,path,bytes)=>{assetCalls++;assert.equal(root,'/candidate/dist/rpx-exui/browser');return {path,digest:'sha256:'+createHash('sha256').update(bytes).digest('hex')};}}:realRequire(name);compiled._compile(code,__filename);
 const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'profile-assets-fake-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 for(const rejected of [false,true]){
  const output=path.join(root,rejected?'foreign':'healthy');fs.mkdirSync(output);for(const name of ['manifest.json','runtime-identity.json'])fs.writeFileSync(path.join(output,name),JSON.stringify({identity:{webappCommit:'fixed'}}));
  const handlers={},context={on:(event,handler)=>{handlers[event]=handler;},route:async(_pattern,handler)=>{handlers.route=handler;}};
  const actions=[],route=(url,method='GET')=>({request:()=>({url:()=>url,method:()=>method}),continue:async()=>actions.push('continue'),fulfill:async value=>{assert.equal(value.body,'{}');actions.push('empty-flags');},abort:async()=>actions.push('abort')});
  const work=()=>compiled.exports.withProfileBrowserAssets(context,async()=>{
   handlers.response({url:()=> 'http://127.0.0.1:3100/main.js',request:()=>({resourceType:()=> 'script'}),body:async()=>Buffer.from('fixed candidate')});
   await handlers.route(route('http://127.0.0.1:3100/search'));await handlers.route(route('https://app.launchdarkly.com/sdk/evalx/synthetic-flags/context','REPORT'));if(rejected)await handlers.route(route('https://foreign.invalid/private?secret=CANARY'));
  },output);
  if(rejected)await assert.rejects(work);else await work();
  assert.deepEqual(actions,rejected?['continue','empty-flags','abort']:['continue','empty-flags']);const flags=JSON.parse(fs.readFileSync(path.join(output,'profile-browser-flags.json')));assert.deepEqual(flags.evaluationFlags,{});assert.equal(flags.liveProvider,false);assert(!fs.readFileSync(path.join(output,'profile-browser-rejections.json'),'utf8').includes('CANARY'));
 }
 assert.equal(assetCalls,2);assert(fs.readFileSync(path.join(__dirname,'../src/fixtures/harnessDivorceProfile.ts'),'utf8').includes('withProfileBrowserAssets(context,use,process.env.EXUI_DIVORCE_OUTPUT!)'));assert(fs.readFileSync(path.join(__dirname,'../src/fixtures/harnessStCicGlobal.ts'),'utf8').includes('withProfileBrowserAssets(context,use,process.env.EXUI_ST_CIC_OUTPUT!)'));
});

test('G default probe uses its dedicated config and private finite environment and records observed close before rejecting browser failure',async t=>{
 const cp=require('node:child_process'),{syncBuiltinESMExports}=require('node:module'),{EventEmitter}=require('node:events'),original=cp.spawn,p=await packet(t);let calls=0;
 t.after(()=>{cp.spawn=original;syncBuiltinESMExports();});
 cp.spawn=(file,args,options)=>{
  calls++;assert.equal(file,process.execPath);assert.deepEqual(args,['/harness/node_modules/@playwright/test/cli.js','test','--config','/harness/playwright.st-cic-global.config.mjs']);assert.equal(options.cwd,'/harness');assert.equal(options.stdio,'inherit');
  assert.deepEqual(Object.keys(options.env).sort(),['EXUI_CHROMIUM_EXECUTABLE','EXUI_SESSION_COOKIE','EXUI_ST_CIC_BROWSER','EXUI_ST_CIC_OUTPUT','HOME','PATH'].sort());assert.equal(options.env.EXUI_ST_CIC_OUTPUT,p.directory);assert.equal(options.env.EXUI_CHROMIUM_EXECUTABLE,'/browser/chromium');assert.equal(options.env.EXUI_ST_CIC_BROWSER,'true');
  const child=new EventEmitter();queueMicrotask(()=>{child.emit('exit',0,null);child.emit('close',1,null);});return child;
 };syncBuiltinESMExports();
 const m=await api();await assert.rejects(m.probeStCicGlobalBrowser({cookie:'synthetic-session',output:p.directory,mutation:fault,browser:{executable:'/browser/chromium'}}),/ST_CIC_BROWSER_TERMINAL/);assert.equal(calls,1);assert.deepEqual(JSON.parse(fs.readFileSync(path.join(p.directory,'profile-browser-terminal.json'))),{code:1,signal:null});assert(!fs.readFileSync(path.join(p.directory,'profile-browser-terminal.json'),'utf8').includes('synthetic-session'));
});

// Pinned EXUI SearchResultsComponent combines these independent HTTP subscriptions.
test('ST_CIC global replay accepts either results request arrival order and preserves exact fault detection',async t=>{
 const m=await api();
 for(const mutated of [false,true]){
  const p=await packet(t,mutated);
  p.write('profile-st-cic-destinations.json',[p.data.journal[0],p.data.journal[2],p.data.journal[1]]);
  if(mutated)assert.throws(()=>m.readStCicGlobalBrowserEvidence(p.directory,fault,p),e=>e.message===named);
  else assert.equal(m.readStCicGlobalBrowserEvidence(p.directory,null,p).catalogueCredit,false);
 }
});
test('ST_CIC global replay does not forgive extra duplicated misplaced or changed requests',async t=>{
 const m=await api();
 for(const mutated of [false,true]){
  const p=await packet(t,mutated),original=structuredClone(p.data.journal);
  for(const change of [j=>[...j,j[2]],j=>[j[0],j[2],j[2]],j=>[j[2],j[0],j[1]],j=>{j[2].path='/foreign';return j;},j=>{j[1].body.startRecordNumber=2;return j;}]){
   p.write('profile-st-cic-destinations.json',change(structuredClone(original)));
   assert.throws(()=>m.readStCicGlobalBrowserEvidence(p.directory,mutated?fault:null,p),e=>!mutated||e.message!==named);
  }
 }
});
