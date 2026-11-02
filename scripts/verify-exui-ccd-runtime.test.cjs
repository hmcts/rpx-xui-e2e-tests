const test = require('node:test');
const assert = require('node:assert/strict');
const runtime = import('./lib/exui-ccd-runtime.mjs');
test('CCD sidecars require a pinned image, owned namespace and loopback configuration', async () => {
 const {sidecarArguments, validateCcdDefinition, CCD_IMAGES} = await runtime;
 assert.throws(() => sidecarArguments({owner:'harness-test', namespace:'abc', image:'latest', service:'data', env:{}}), /PINNED/);
 assert.throws(() => sidecarArguments({owner:'harness-test', namespace:'host', image:CCD_IMAGES.data, service:'data', env:{}}), /NAMESPACE/);
 const args=sidecarArguments({owner:'harness-test',namespace:'a'.repeat(64),image:CCD_IMAGES.data,service:'data',env:{IDAM_USER_URL:'http://127.0.0.1:5000'}});
 assert(args.includes('container:'+'a'.repeat(64))); assert(!args.includes('-p')); assert(!args.includes('--volume'));
 assert.throws(() => validateCcdDefinition({CaseEvent:[{CallBackURLSubmittedEvent:'https://example.com'}]}), /DESTINATION/);
 validateCcdDefinition({CaseEvent:[{CallBackURLSubmittedEvent:'http://127.0.0.1:3101/callback'}]});
});
test('source-backed fixture preserves nested conditions and denies unlisted roles', async()=>{
 const fixture=require('./fixtures/ccd/nested-prl.json');
 const {validateCcdDefinition}=await runtime; validateCcdDefinition(fixture.sheets);
 assert.equal(fixture.provenance.sourceRevision,'694b9951e94369f1394380506960c4f04f25755d');
 assert(fixture.sheets.ComplexTypes.some(r=>r.ID==='ServeOrgDetails'&&r.FieldType==='EmailInformation'));
 assert(fixture.sheets.EventToComplexTypes.some(r=>r.FieldShowCondition?.includes('serveByPostOrEmail="email"')));
 assert(!fixture.sheets.AuthorisationCaseType.some(r=>r.UserRole.includes('denied')));
});

test('wrong live definition or version blocks even when the source fixture is unchanged',async()=>{
 const {assertObservedCcdDefinition}=await runtime;
 const crypto=require('node:crypto');
 const observed={id:'HarnessNestedPRL',version:{number:10},fields:['nested']};
 const receipt={observedDefinitionDigest:'sha256:'+crypto.createHash('sha256').update(JSON.stringify(observed)).digest('hex'),definitionVersion:10};
 assertObservedCcdDefinition(receipt,observed);
 assert.throws(()=>assertObservedCcdDefinition(receipt,{...observed,fields:[]}),/CCD_IMPORTED_DEFINITION_DRIFT/);
 assert.throws(()=>assertObservedCcdDefinition({...receipt,definitionVersion:11},observed),/CCD_IMPORTED_VERSION_DRIFT/);
});
test('callback placeholders and non-HTTP destinations cannot enter a CCD import',async()=>{
 const {validateCcdDefinition,sidecarArguments,CCD_IMAGES}=await runtime;
 assert.throws(()=>validateCcdDefinition({CaseEvent:[{CallBackURLSubmittedEvent:'${UNREGISTERED_CALLBACK}/send'}]}),/CALLBACK_DESTINATION/);
 assert.throws(()=>validateCcdDefinition({url:'wss://external.example.com/'}),/DESTINATION/);
 assert.throws(()=>sidecarArguments({owner:'harness-test',namespace:'a'.repeat(64),image:CCD_IMAGES.data,service:'data',env:{IDAM_USER_URL:'https://idam.example.com'}}),/NONLOCAL/);
});

test('tampered workbook is rejected before any Docker inspection or import request',async()=>{
 const {importCcdDefinition}=await runtime;
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'ccd-tampered-'));
 try {
  for(const name of ['nested-prl.json','nested-prl.xlsx','nested-prl.binding.json'])fs.copyFileSync(path.join(__dirname,'fixtures/ccd',name),path.join(directory,name));
  fs.appendFileSync(path.join(directory,'nested-prl.xlsx'),'unreviewed callback');
  assert.throws(()=>importCcdDefinition(null,{fixtureDirectory:directory}),/CCD_WORKBOOK_BINDING_MISMATCH/);
 } finally{fs.rmSync(directory,{recursive:true,force:true});}
});

test('existing startup output is untouched and no Docker command is attempted',async()=>{
 const {startCcdRuntime}=await runtime;
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'ccd-existing-'));
 try{
  fs.writeFileSync(path.join(directory,'runtime.json'),'prior owner');
  await assert.rejects(startCcdRuntime(directory,{runDocker:()=>assert.fail('Docker contacted')}),/CCD_FRESH_OUTPUT_REQUIRED/);
  assert.equal(fs.readFileSync(path.join(directory,'runtime.json'),'utf8'),'prior owner');
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});

test('partial startup preserves exclusive recovery owner and resource inventory',async()=>{
 const {startCcdRuntime,CCD_IMAGES}=await runtime;
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
 const parent=fs.mkdtempSync(path.join(os.tmpdir(),'ccd-partial-')),directory=path.join(parent,'new');
 const runDocker=(args)=>{
  if(args[0]==='image')return JSON.stringify([{Id:args[2],Architecture:'arm64',RepoDigests:['fixture@'+args[2]]}]);
  if(args[0]==='create')return 'a'.repeat(64);
  if(args[0]==='start')throw Error('SIMULATED_START_FAILURE');
  assert.fail('Unexpected Docker action '+args[0]);
 };
 try{
  await assert.rejects(startCcdRuntime(directory,{runDocker}),/SIMULATED_START_FAILURE/);
  const recovery=JSON.parse(fs.readFileSync(path.join(directory,'recovery.json'))),state=JSON.parse(fs.readFileSync(path.join(directory,'runtime.json')));
  assert.equal(state.containers.database,'a'.repeat(64));assert.equal(state.owner,recovery.owner);
  assert.equal(recovery.resources.database.name,state.owner+'-database');assert.equal(recovery.resources.database.image,CCD_IMAGES.database);
  assert.throws(()=>fs.writeFileSync(path.join(directory,'recovery.json'),'overwrite',{flag:'wx'}),/EEXIST/);
  await assert.rejects(startCcdRuntime(directory,{runDocker:()=>assert.fail('Recovery overwritten')}),/CCD_FRESH_OUTPUT_REQUIRED/);
 }finally{fs.rmSync(parent,{recursive:true,force:true});}
});

test('reuse changed owner, image or namespace fails before any service request',async()=>{
 const {loadCcdRuntimeForReuse,CCD_IMAGES}=await runtime;
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'ccd-reuse-'));
 const state={owner:'harness-test',namespace:'a'.repeat(64),containers:Object.fromEntries(Object.keys(CCD_IMAGES).map((s,i)=>[s,String(i+1).repeat(64)]))};state.containers.database=state.namespace;
 const info=(id)=>{const service=Object.keys(state.containers).find(s=>state.containers[s]===id);return {Image:CCD_IMAGES[service],Config:{Labels:{'exui.harness.owner':state.owner,'exui.harness.service':service}},HostConfig:{NetworkMode:service==='database'?'none':'container:'+state.namespace,Binds:[],PortBindings:{}},State:{Running:true},Mounts:[]};};
 fs.writeFileSync(path.join(directory,'runtime.json'),JSON.stringify(state));
 try{
  for(const mutation of ['owner','image','network']){
   const inspect=id=>{const observed=info(id);if(mutation==='owner')observed.Config.Labels['exui.harness.owner']='other';if(mutation==='image')observed.Image='sha256:'+'f'.repeat(64);if(mutation==='network')observed.HostConfig.NetworkMode='host';return observed;};
   assert.throws(()=>loadCcdRuntimeForReuse(directory,inspect),/CCD_RUNTIME_(OWNER|IMAGE|NAMESPACE)_MISMATCH/);
  }
  assert.equal(loadCcdRuntimeForReuse(directory,info).owner,state.owner);
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});

test('reuse CLI performs only Docker inspect when owner, image or network was changed',async()=>{
 const {CCD_IMAGES}=await runtime;
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'ccd-cli-reuse-'));
 const state={output:directory,owner:'harness-test',namespace:'a'.repeat(64),containers:Object.fromEntries(Object.keys(CCD_IMAGES).map((s,i)=>[s,String(i+1).repeat(64)]))};state.containers.database=state.namespace;
 fs.writeFileSync(path.join(directory,'runtime.json'),JSON.stringify(state));
 fs.writeFileSync(path.join(directory,'docker'),`#!${process.execPath}\nconst fs=require('node:fs');const args=process.argv.slice(2);fs.appendFileSync(${JSON.stringify(path.join(directory,'calls.jsonl'))},JSON.stringify(args)+'\\n');if(args[0]!=='inspect')process.exit(70);const state=${JSON.stringify(state)},images=${JSON.stringify(CCD_IMAGES)};const service=Object.keys(state.containers).find(s=>state.containers[s]===args[1]);const info={Image:images[service],Config:{Labels:{'exui.harness.owner':state.owner,'exui.harness.service':service}},HostConfig:{NetworkMode:service==='database'?'none':'container:'+state.namespace},State:{Running:true},Mounts:[]};if(process.env.CCD_TEST_MUTATION==='owner')info.Config.Labels['exui.harness.owner']='other';if(process.env.CCD_TEST_MUTATION==='image')info.Image='other';if(process.env.CCD_TEST_MUTATION==='network')info.HostConfig.NetworkMode='host';console.log(JSON.stringify([info]));\n`,{mode:0o755});
 try{
  for(const mutation of ['owner','image','network']){
   fs.writeFileSync(path.join(directory,'calls.jsonl'),'');
   const result=spawnSync(process.execPath,[path.join(__dirname,'start-harness-ccd.mjs'),'--reuse','--output',directory],{env:{...process.env,PATH:directory+path.delimiter+process.env.PATH,CCD_TEST_MUTATION:mutation},encoding:'utf8'});
   assert.equal(result.status,1,result.stderr);
   const calls=fs.readFileSync(path.join(directory,'calls.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
   assert(calls.length>0);assert(calls.every(args=>args[0]==='inspect'),'Service was contacted before identity verification');
  }
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
