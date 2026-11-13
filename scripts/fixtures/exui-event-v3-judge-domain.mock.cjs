const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const {roleFixture}=require('./exui-event-v3-role-domain.mock.cjs');
const digest=bytes=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
const id='ccd-enable-judge-event',names=['manifest.json','context.json','personas.json','ccd-requests.jsonl','event-capability-observation.json','judge-event-ui-observation.json'];
const data=email=>({protectedValue:'synthetic-judge-readable',sodAdditionalRecipients:['additionalRecipients'],sodAdditionalRecipientsList:[{id:'723a508f-9e84-41a1-b39e-fde9d7e06ed2',value:{serveByPostOrEmail:'email',emailInformation:{emailName:'Synthetic event recipient',emailAddress:email}}}]});
// Synthetic unit-only future capture contract. No real browser, case or runtime proof.
exports.judgeFixture=async t=>{
 const f=await roleFixture(t),{readEventBaselineCheckpoint}=await import('../lib/exui-native-proof-validation.mjs'),{sharedRoleArtifactNames}=await import('../lib/exui-shared-role-artifacts.mjs');
 const layouts={baseline:[...sharedRoleArtifactNames('baseline','exui-ccd-event-capability-pilot'),...names.slice(4)],[id]:names};
 const write=(relative,bytes)=>{fs.writeFileSync(path.join(f.directory,relative),bytes);return{path:relative,digest:digest(bytes)};};
 for(const [index,current]of ['baseline',id].entries()){
  const entry=current==='baseline'?f.expected.baseline:f.expected.faults[0],runtime=current==='baseline'?f.read('input.json'):f.read(f.read(entry.capture.path).runtimeRecord.path),creds=runtime.credentials,manifest=f.read(current+'/manifest.json');
  const context={...Object.fromEntries(['runId','harnessCommit','releaseScopeId','policyDigest','identity'].map(k=>[k,manifest[k]])),invocationId:current,harnessSourceState:'clean',harnessSourceDigest:manifest.runtimeMetadata.harnessSourceDigest};
  f.put(current+'/context.json',context);f.put(current+'/personas.json',{credentials:creds,sessions:Object.fromEntries(['allowed','courtadmin','judge','readonly'].map(n=>[n,'synthetic-judge-session-'+index+'-'+n]))});
  const caseId='223456789012340'+(index+1),fault=index===1,actorId=creds.judge.userId;
  const before={state:{id:Number(caseId),case_type_id:'HarnessNestedPRL',jurisdiction:'HARNESS',state:'JUDICIAL_REVIEW',version:1,case_data:data('event@harness.example.com')},history:[{id:'create',user_id:creds.allowed.userId,case_type_id:'HarnessNestedPRL'}]};
  const after=structuredClone(before),intendedData=data('judge-change@harness.example.com');if(fault){after.state.case_data=intendedData;after.state.version++;after.history.unshift({id:'serviceOfDocuments',user_id:actorId,case_type_id:'HarnessNestedPRL'});}
  const triggers=fault?[{id:'serviceOfDocuments',name:'Service of documents'}]:[];
  const value={actor:{userId:actorId,roles:creds.judge.roles},sessionUser:{id:actorId,roles:creds.judge.roles},caseId,eventId:'serviceOfDocuments',caseViewStatus:200,caseTriggers:triggers,menuOptions:['Select an event',...(fault?['Service of documents']:[])],eventTriggers:triggers,eventOptions:fault?['Service of documents']:[],startStatus:fault?200:404,legacyTokenStatus:200,eventTokenPresent:true,submitStatus:fault?201:404,intendedData,submittedData:{sodAdditionalRecipients:intendedData.sodAdditionalRecipients,sodAdditionalRecipientsList:intendedData.sodAdditionalRecipientsList},before,after};
  f.put(current+'/event-capability-observation.json',value);
  f.put(current+'/judge-event-ui-observation.json',{schemaVersion:1,kind:'judge-event-ui-observation',caseId,actorId,userDetailsStatus:200,visibleMarkers:[{text:'event@harness.example.com',visible:true}]});
  const prefix='/caseworkers/'+creds.allowed.userId+'/jurisdictions/HARNESS/case-types/HarnessNestedPRL';
  const requests=[['GET',prefix+'/event-triggers/create/token',200,creds.allowed.userId],['POST',prefix+'/cases',201,creds.allowed.userId],['GET','/internal/cases/'+caseId,200,actorId],['GET','/internal/cases/'+caseId+'/event-triggers/serviceOfDocuments',value.startStatus,actorId],['GET','/caseworkers/'+actorId+'/jurisdictions/HARNESS/case-types/HarnessNestedPRL/cases/'+caseId+'/event-triggers/serviceOfDocuments/token',200,actorId],['POST','/cases/'+caseId+'/events',value.submitStatus,actorId]].map(([method,upstreamPath,status,actorId])=>({method,upstreamPath,status,actorId,mutation:null}));
  const journal=current==='baseline'?fs.readFileSync(path.join(f.directory,current,'ccd-requests.jsonl'),'utf8'):'';write(current+'/ccd-requests.jsonl',journal+requests.map(r=>JSON.stringify(r)).join('\n')+'\n');
 }
 const rechain=()=>{
  for(let i=0;i<f.expected.faults.length;i++){
   const e=f.expected.faults[i],capture=f.read(e.capture.path);capture.previousRetirement=i?f.expected.faults[i-1].retirement:f.expected.baseline.retirement;e.capture=f.put(e.capture.path,capture);const ack=f.read(e.ack.path);ack.capture=e.capture;e.ack=f.put(e.ack.path,ack);const proof=f.read(e.proof.path);proof.ack=e.ack;e.proof=f.put(e.proof.path,proof);const c=f.read(e.completion.path);c.ack=e.ack;c.proof=e.proof;e.completion=f.put(e.completion.path,c);const r=f.read(e.retirement.path);r.completion=e.completion;e.retirement=f.put(e.retirement.path,r);
  }
 };
 const reseal=()=>{
  const run=f.read('run.json');
  for(const current of ['baseline',id]){
   const refs=layouts[current].map(name=>({path:current+'/'+name,digest:digest(fs.readFileSync(path.join(f.directory,current,name)))}));
   const ref=run.executionArtifacts.find(r=>r.path===current+'/execution.json'),e=f.read(ref.path);e.judgeEventArtifacts=names.map(name=>refs.find(r=>r.path===current+'/'+name));if(current==='baseline')e.sharedRoleArtifacts=sharedRoleArtifactNames(current,'exui-ccd-event-capability-pilot').map(name=>refs.find(r=>r.path===current+'/'+name));Object.assign(ref,f.put(ref.path,e));
   const entry=current==='baseline'?f.expected.baseline:f.expected.faults[0],c=f.read(entry.completion.path);c.readbacks=f.put(current+'/v3-readbacks.json',{schemaVersion:3,invocationId:current,files:refs});c.seal=f.put(c.seal.path,{schemaVersion:3,invocationId:current,files:['readbacks','framework','host','fixture','registry','denial','lifecycle'].map(k=>c[k])});entry.completion=f.put(entry.completion.path,c);
  }
  f.put('run.json',run);f.saveRun();const base=f.read(f.expected.baseline.completion.path);base.checkpointDigest=readEventBaselineCheckpoint(f.directory,f.expected.baselineExpected).checkpointDigest;f.expected.baseline.completion=f.put(f.expected.baseline.completion.path,base);
  for(const current of ['baseline',id]){const entry=current==='baseline'?f.expected.baseline:f.expected.faults[0],r=f.read(entry.retirement.path);r.completion=entry.completion;entry.retirement=f.put(entry.retirement.path,r);}rechain();
 };
 reseal();f.invocationId=id;f.index=0;
 f.changeJudge=(current,name,change)=>{const file=current+'/'+name,value=name.endsWith('.jsonl')?fs.readFileSync(path.join(f.directory,file),'utf8').trim().split('\n').map(JSON.parse):f.read(file);change(value);if(name.endsWith('.jsonl'))write(file,value.map(r=>JSON.stringify(r)).join('\n')+'\n');else f.put(file,value);reseal();};
 f.judgeMembership=(current,change)=>{const entry=current==='baseline'?f.expected.baseline:f.expected.faults[0],c=f.read(entry.completion.path),r=f.read(c.readbacks.path);change(r.files);c.readbacks=f.put(c.readbacks.path,r);c.seal=f.put(c.seal.path,{schemaVersion:3,invocationId:current,files:['readbacks','framework','host','fixture','registry','denial','lifecycle'].map(k=>c[k])});entry.completion=f.put(entry.completion.path,c);const retirement=f.read(entry.retirement.path);retirement.completion=entry.completion;entry.retirement=f.put(entry.retirement.path,retirement);rechain();};
 return f;
};
