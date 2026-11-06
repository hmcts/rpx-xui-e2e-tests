const assert = require('node:assert/strict');
const { test } = require('node:test');
const fixture = (...args) => require('./fixtures/exui-selector-phase-evidence.mock.cjs').createSelectorObservation(...args);
test('trusted selector reader replays optional empty, navigation, Change, exact persisted association and history', async () => {
  const good = await fixture(); const check = x => good.m.validateSelectorInvocationObservation(x.observation, x.journal, x.selected, 'baseline'); check(good);
  const changes = [x=>{x.observation.optionalEmptyState.after.state.version++;},x=>{x.observation.ui.navigation.pop();},x=>{x.observation.ui.predecessorEditableControls=1;},x=>{x.observation.ui.selectorInitiallyChecked=true;},x=>{x.observation.ui.cyaHeading='Service unavailable';},x=>{x.observation.ui.changeTarget+='wrong';},x=>{x.observation.ui.selectedAfterChange=false;},x=>{x.observation.beforeSubmit.state.version++;},x=>{x.observation.after.state.case_data.sodAdditionalRecipientsList[0].id='changed';},x=>{x.observation.after.state.security_classification='PRIVATE';},x=>{x.observation.after.state.version--;},x=>{x.observation.after.history[0].user_id='changed';},x=>{x.observation.after.history.at(-1).user_id='other';},x=>{x.observation.submission.data.protectedValue='changed';},x=>{delete x.observation.submission.data.sodAdditionalRecipientsList[0].value.postalInformation;},x=>{x.journal[0].status=500;},x=>{x.journal[0].actorId='other';},x=>{x.journal.shift();},x=>{x.journal.find(e=>e.selectorValidation?.pageId==='serviceOfDocuments2').selectorValidation.selected=['additionalRecipients'];},x=>{x.journal.push({method:'POST',path:`/data/cases/${x.observation.optionalEmptyState.caseId}/events`,status:201});},x=>{x.journal.push(structuredClone(x.journal.at(-1)));},x=>{x.selected.credentials.courtadmin.roles=['caseworker'];}];
  for (const change of changes) { const bad = structuredClone({selected:good.selected,observation:good.observation,journal:good.journal}); change(bad); assert.throws(()=>check(bad),/SELECTOR_/); }
});
test('trusted selector fault cannot pass with unhealthy CYA, changed case, wrong variant or a submitted event', async () => {
  const good = await fixture(false); const { SELECTOR_EVENT_MUTATION } = await import('./lib/exui-selector-event-row-contract.mjs');
  const check = x => good.m.validateSelectorInvocationObservation(x.observation,x.journal,x.selected,SELECTOR_EVENT_MUTATION);check(good);
  for (const change of [x=>{x.observation.variant='baseline';},x=>{x.observation.selectedCya.healthySiblingCount=0;},x=>{x.observation.selectedCya.selectorSummaryCount=1;},x=>{x.observation.optionalEmpty.status=500;},x=>{x.observation.afterFault.state.case_data.protectedValue='changed';},x=>{x.journal.push({method:'POST',path:`/data/cases/${x.observation.caseId}/events`,status:201});},x=>{x.observation.completed=true;}]) {
    const bad = structuredClone({selected:good.selected,observation:good.observation,journal:good.journal});change(bad);assert.throws(()=>check(bad),/SELECTOR_/);
  }
});

test('selector destructive cleanup requires observed controller termination and preserves order',async()=>{
 const {afterSelectorChildStopped}=await import('./run-harness-selector-event-row.mjs');const calls=[];
 const cleanup=async()=>{calls.push('native');calls.push('ccd');};
 await assert.rejects(afterSelectorChildStopped({},cleanup,async()=>{throw Error('unobserved');}),/unobserved/);assert.deepEqual(calls,[]);
 await assert.rejects(afterSelectorChildStopped({},cleanup,async()=>({observed:false})),/UNOBSERVED/);assert.deepEqual(calls,[]);
 await afterSelectorChildStopped({},cleanup,async()=>{calls.push('terminated');return {observed:true,forced:false};});assert.deepEqual(calls,['terminated','native','ccd']);
 const failure=[];await assert.rejects(afterSelectorChildStopped({},async()=>{failure.push('native');throw Error('still present');},async()=>({observed:true})),/still present/);assert.deepEqual(failure,['native']);
});

test('selector removal requires exact captured launch command and both lifecycle names',async t=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');const {assertSelectorInvocationRemoved}=await import('./lib/exui-selector-event-row-evidence.mjs');
 const directory=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'selector-removal-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));fs.mkdirSync(path.join(directory,'baseline'));
 const owner='ccd-00000000-0000-4000-8000-000000000000',namespace='a'.repeat(64),hash=n=>'sha256:'+n.repeat(64),launchProcess={entrypoint:['/usr/local/bin/node'],command:['/candidate/api/server.js']};
 const plan={namespace,candidate:{name:owner+'-baseline-candidate',image:hash('b'),mounts:[],launchProcess},tools:{name:owner+'-baseline-tools',image:hash('c'),mounts:[]}};
 const ownership={directory,owner,invocations:[{invocationId:'baseline',plan}]};
 const registry=[['candidate',plan.candidate,'d'.repeat(64)],['browser-provider',plan.tools,'e'.repeat(64)]].map(([service,resource,id])=>({name:resource.name,id,owner,service,image:resource.image,namespace,mounts:resource.mounts,removed:true}));
 const before={Id:registry[0].id,Name:'/'+plan.candidate.name,Image:plan.candidate.image,Config:{Labels:{'exui.harness.owner':owner,'exui.harness.service':'candidate'},Entrypoint:launchProcess.entrypoint,Cmd:launchProcess.command},HostConfig:{NetworkMode:'container:'+namespace,ReadonlyRootfs:true,Init:true,Privileged:false,PidMode:'',CapDrop:['ALL'],SecurityOpt:['no-new-privileges'],PidsLimit:256,Memory:4294967296,NanoCpus:2000000000,PortBindings:{}},Mounts:[],State:{Running:true,ExitCode:0,OOMKilled:false}};
 const lifecycle={requestedStop:true,before,after:{...structuredClone(before),State:{Running:false,ExitCode:143,OOMKilled:false}}};
 const write=value=>fs.writeFileSync(path.join(directory,'baseline/candidate-lifecycle.json'),JSON.stringify(value));
 fs.writeFileSync(path.join(directory,'owned-resources.json'),JSON.stringify(registry));fs.writeFileSync(path.join(directory,'baseline/candidate-write-denial.json'),JSON.stringify({candidateId:registry[0].id,attempts:[{path:'/output/report.json',denied:true},{path:'/harness/controller.mjs',denied:true}],controllerSourceVisible:false}));write(lifecycle);
 assert.equal(assertSelectorInvocationRemoved(ownership,'baseline',()=>null).removed.length,2);
 for(const side of ['before','after'])for(const [field,value,reason] of [['Name','/wrong',/LIFECYCLE_NAME/],['Cmd',['/foreign.js'],/COMMAND_MISMATCH/],['Entrypoint',['/bin/sh'],/ENTRYPOINT_MISMATCH/]]){
  const bad=structuredClone(lifecycle);if(field==='Name')bad[side][field]=value;else bad[side].Config[field]=value;write(bad);assert.throws(()=>assertSelectorInvocationRemoved(ownership,'baseline',()=>null),reason);
 }
 write(lifecycle);assert.throws(()=>assertSelectorInvocationRemoved(ownership,'baseline',()=>({present:true})),/CID_PRESENT/);
});

test('selector raw validation windows reject reused/swapped cases, missing predecessor and late or foreign requests',async()=>{
 const good=await fixture();const check=x=>good.m.validateSelectorInvocationObservation(x.observation,x.journal,x.selected,'baseline');check(good);
 const changes=[
 x=>{const starts=x.journal.filter(e=>e.method==='GET');[starts[0].path,starts[1].path]=[starts[1].path,starts[0].path];},
 x=>{const starts=x.journal.filter(e=>e.method==='GET');starts[1].path=starts[0].path;},
 x=>{x.journal.unshift(structuredClone(x.journal[1]));},
 x=>{x.journal.splice(1,1);},
 x=>{x.journal[1].selectorValidation.controlValue='selector-persistence-control';},
 x=>{x.journal[1].selectorValidation.pageId='serviceOfDocuments1';},
 x=>{x.journal.push(structuredClone(x.journal.find(e=>e.method==='GET')));},
 x=>{x.journal.push(structuredClone(x.journal.at(-2)));},
 x=>{const val=x.journal.find(e=>e.selectorValidation?.pageId==='serviceOfDocuments2');val.actorId='other';},
 x=>{const val=x.journal.find(e=>e.selectorValidation?.pageId==='serviceOfDocuments2');val.status=500;},
 ];
 for(const change of changes){const bad=structuredClone({observation:good.observation,journal:good.journal,selected:good.selected});change(bad);assert.throws(()=>check(bad),/SELECTOR_/);}
});
