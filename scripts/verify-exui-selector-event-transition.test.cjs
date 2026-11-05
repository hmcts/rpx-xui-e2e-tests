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
