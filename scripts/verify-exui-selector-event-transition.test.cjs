const assert=require('node:assert/strict'),{test}=require('node:test'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
async function inputs(){
 const c=await import('./lib/exui-selector-event-row-contract.mjs'),m=await import('./lib/exui-selector-event-row-transition.mjs'),{digestBytes}=await import('./lib/exui-evidence-io.mjs');
 const hash=n=>'sha256:'+n.repeat(64),make=(fault=false)=>{
 const variant=fault?'summary-hidden':'baseline',definition={kind:'native-selector-event-row-definition',releaseScopeId:c.SELECTOR_EVENT_SCOPE,variant,owner:'harness-'+(fault?'b':'a').repeat(16),namespace:(fault?'b':'a').repeat(64),images:{data:{id:hash('c')}},fixtureDigest:hash(fault?'e':'d'),sourceDefinitionDigest:hash('f'),observedDefinitionDigest:hash(fault?'b':'a'),observedPagesDigest:hash('c'),storedDateDigest:hash('d'),definitionVersion:2,sourceBinding:c.deriveSelectorEventRowFixture(variant).binding};
 const credentials=Object.fromEntries(['allowed','courtadmin','judge','observer','readonly'].map((name,i)=>[name,{userId:`00000000-0000-4000-8000-00000000000${i}`,headers:{Authorization:`Bearer actor${i}`},...(['courtadmin','judge','readonly'].includes(name)?{roles:['caseworker','caseworker-harness',`caseworker-privatelaw-${name}`]}:{})}]));
 return {runId:'ccd-00000000-0000-4000-8000-000000000000',releaseScopeId:c.SELECTOR_EVENT_SCOPE,definition,definitionImportDigest:hash(fault?'b':'a'),selectorEventBinding:definition.sourceBinding,ccd:{ready:true,namespace:definition.namespace,owner:definition.owner,images:definition.images},credentials,harnessCommit:'a'.repeat(40),harnessSourceDigest:hash('f')};};
 const input=make(),runtime=make(true),request=m.selectorTransitionRequest(input),record={schemaVersion:1,runId:input.runId,invocationId:c.SELECTOR_EVENT_MUTATION,request,requestDigest:digestBytes(JSON.stringify(request)),runtime};return {c,m,input,record};
}
test('selector transition binds exact source variant, namespace, actors and one immutable request',async()=>{
 const {m,input,record}=await inputs();assert.deepEqual(m.selectSelectorRuntime(input,record),record.runtime);
 for(const alter of [x=>{x.runId+='x';},x=>{x.invocationId='baseline';},x=>{x.request.invocationIds.push('extra');},x=>{x.requestDigest='sha256:'+'0'.repeat(64);},x=>{x.runtime.ccd.owner=input.ccd.owner;},x=>{x.runtime.ccd.namespace=input.ccd.namespace;},x=>{x.runtime.definition.variant='baseline';},x=>{x.runtime.definition.sourceBinding.pageOrder=1;},x=>{x.runtime.definition.observedDefinitionDigest=input.definition.observedDefinitionDigest;},x=>{x.runtime.credentials.courtadmin.roles=['caseworker'];},x=>{x.runtime.credentials.judge.userId=x.runtime.credentials.courtadmin.userId;},x=>{x.runtime.artifact={unexpected:true};}]){
 const bad=structuredClone(record);alter(bad);assert.throws(()=>m.selectSelectorRuntime(input,bad),/SELECTOR_/);
 }
});
test('selector runtime ACK is one-shot and waiting rejects cancellation, timeout and aliases',async t=>{
 const {m,input,record,c}=await inputs(),output=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'selector-transition-'));t.after(()=>fs.rmSync(output,{recursive:true,force:true}));
 await assert.rejects(m.waitForSelectorRuntime(input,output,{isCancelled:()=>true}),/CANCELLED/);
 await assert.rejects(m.waitForSelectorRuntime(input,output,{timeoutMs:0}),/ACK_TIMEOUT/);
 m.publishSelectorRuntime(output,record);assert.deepEqual(await m.waitForSelectorRuntime(input,output),record.runtime);
 assert.throws(()=>m.publishSelectorRuntime(output,record),/EEXIST/);
 await assert.rejects(m.waitForSelectorRuntime(input,output,{isCancelled:()=>true}),/CANCELLED/);
 const file=path.join(output,c.SELECTOR_EVENT_MUTATION,'runtime-input.json'),target=path.join(output,'alternate.json');fs.renameSync(file,target);fs.symlinkSync(target,file);
 await assert.rejects(m.waitForSelectorRuntime(input,output),/ALIAS/);
});
test('selector baseline cannot start before independently bound import and namespace capture',async t=>{
 const {m,input}=await inputs(),output=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'selector-baseline-'));t.after(()=>fs.rmSync(output,{recursive:true,force:true}));
 await assert.rejects(m.waitForSelectorBaselineCapture(input,output,{timeoutMs:0}),/ACK_TIMEOUT/);
 const capture={capturedBeforeExecution:true,expected:Object.fromEntries(['runId','harnessCommit','releaseScopeId','harnessSourceDigest'].map(k=>[k,input[k]])),definition:input.definition,ccd:input.ccd};
 const file=path.join(output,'independent-selector-baseline.json');fs.writeFileSync(file,JSON.stringify(capture));await m.waitForSelectorBaselineCapture(input,output);
 capture.definition={...capture.definition,definitionVersion:1};fs.writeFileSync(file,JSON.stringify(capture));await assert.rejects(m.waitForSelectorBaselineCapture(input,output),/DEFINITION/);
});

test('selector CI ownership adapter captures the fixed fault invocation rather than the generic phase name',async t=>{
 const {record}=await inputs();const {captureCiSelectorFaultOwnership}=await import('./lib/exui-candidate-ci-evidence.mjs');const {NATIVE_HARNESS_SOURCE_FILES}=await import('./lib/exui-native-sources.mjs');const {digestBytes}=await import('./lib/exui-evidence-io.mjs');
 const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'selector-ownership-')),stateRoot=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'harness-native-state-'));t.after(()=>{fs.rmSync(root,{recursive:true,force:true});fs.rmSync(stateRoot,{recursive:true,force:true});});
 const input=structuredClone(record.runtime),directory=path.join(root,'output'),stage=path.join(root,'stage'),candidate=path.join(root,'candidate'),browser=path.join(root,'browser');
 for(const folder of [directory,stage,browser,path.join(candidate,'config'),...['sessions','diagnostics'].map(kind=>path.join(stateRoot,record.invocationId,kind))])fs.mkdirSync(folder,{recursive:true});
 fs.writeFileSync(path.join(candidate,'config/default.json'),JSON.stringify({services:{idam:{}},feature:{}}));
 for(const file of NATIVE_HARNESS_SOURCE_FILES){const target=path.join(stage,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(__dirname,'..',file),target);}
 input.harnessSources=NATIVE_HARNESS_SOURCE_FILES;input.harnessSourceDigest=digestBytes(JSON.stringify(NATIVE_HARNESS_SOURCE_FILES.map(file=>[file,digestBytes(fs.readFileSync(path.join(stage,file)))])));
 input.artifact={candidateRoot:candidate,identity:{artifactDigest:'sha256:'+'a'.repeat(64)},provenance:{platform:'linux/arm64',runtimeNodeVersion:'v24.22.1'}};input.nativeRuntime={imageId:'sha256:'+'b'.repeat(64),platform:'linux/arm64'};input.browserRuntimeImage='sha256:'+'c'.repeat(64);input.browserRoot=browser;input.gatewayDigest='sha256:'+'d'.repeat(64);input.apiContracts={data:'sha256:'+'e'.repeat(64),definition:'sha256:'+'f'.repeat(64)};
 input.ccd.images={data:{id:'sha256:'+'1'.repeat(64)},definition:{id:'sha256:'+'2'.repeat(64)},idam:{id:'sha256:'+'3'.repeat(64)}};input.definition.images=input.ccd.images;
 const context={artifact:input.artifact,nativeRuntime:input.nativeRuntime,browserRuntimeImage:input.browserRuntimeImage,browserRoot:browser,ccd:input.ccd,sourceDigests:{selectorEventRow:input.harnessSourceDigest}};
 const handoff={mode:'native-separate-api',owner:input.runId,output:directory,stagedHarness:stage,stateRoot};
 const captured=captureCiSelectorFaultOwnership(input,handoff,context,directory);
 assert.deepEqual(captured.invocations.map(item=>item.invocationId),[record.invocationId]);assert.equal(captured.invocations[0].plan.namespace,input.ccd.namespace);
});
