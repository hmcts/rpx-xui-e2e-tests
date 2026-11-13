const fs=require('node:fs'),path=require('node:path');
const {createHash}=require('node:crypto');
const {eventV3PolicySemanticFixture}=require('./exui-event-v3-policy-semantic.mock.cjs');
const digest=value=>'sha256:'+createHash('sha256').update(value).digest('hex');
// Unit-only synthetic observations. No real case, journal, resource or execution evidence.
const names=['courtadmin-read','readonly-read','courtadmin-cell','readonly-update'];
const faults=['ccd-remove-courtadmin-recipient-read','ccd-remove-readonly-recipient-read','ccd-remove-courtadmin-event-create','ccd-enable-readonly-recipient-update'];
const roles=name=>['caseworker','caseworker-harness',`caseworker-privatelaw-${name}`];
function recipients(channel, count, changed) {
 return Array.from({length:count},(_,i)=>({id:`46e2ff95-4689-42ea-b38c-d3b9204572b${i}`,value:channel==='email'?{serveByPostOrEmail:'email',emailInformation:{emailName:`Synthetic read recipient ${i+1}`,emailAddress:changed=== 'courtadmin'?`courtadmin-edited-${i+1}@harness.example.com`:changed==='readonly'?`readonly-change-${i+1}@harness.example.com`:`read-recipient-${i+1}@harness.example.com`}}:{serveByPostOrEmail:'post',postalInformation:{postalName:`Synthetic postal read ${i+1}`,postalAddress:{AddressLine1:changed==='courtadmin'?`Synthetic courtadmin edited street ${i+1}`:changed==='readonly'?`Synthetic readonly changed street ${i+1}`:`Synthetic read street ${i+1}`,AddressLine2:null,AddressLine3:null,PostTown:null,County:null,PostCode:['SW1A 1AA','M1 1AA'][i],Country:null}}}}));
}
function observations(name, fault, credentials, offset) {
 return ['email','post'].flatMap(channel=>[1,2].map((count,index)=>{
 const original=recipients(channel,count), isRead=name.endsWith('-read'), court=name==='courtadmin-cell', persona=name.startsWith('readonly')?'readonly':'courtadmin';
 const caseId='1234567890'+String(offset).padStart(4,'0')+(channel==='email'?'0':'1')+index;
 const control=isRead?'synthetic-courtadmin-read-control':court?'synthetic-courtadmin-original':'synthetic-readonly-update-control';
 const data=court?{protectedValue:control,sodAdditionalRecipientsList:[]}:{protectedValue:control,sodAdditionalRecipients:['additionalRecipients'],sodAdditionalRecipientsList:original};
 const before={state:{id:Number(caseId),case_type_id:'HarnessNestedPRL',jurisdiction:'HARNESS',state:'JUDICIAL_REVIEW',version:0,case_data:data},history:[{id:'create',audit:'unchanged'}]};
 const result={scenario:channel+'-'+count,caseId,actor:{id:credentials[persona].userId,roles:roles(persona)},before,after:structuredClone(before),caseViewStatus:200,protectedValue:control,controlVisible:true};
 const markers=rows=>rows.map(({value:v})=>[v.emailInformation?.emailName,v.emailInformation?.emailAddress,v.postalInformation?.postalName,v.postalInformation?.postalAddress.AddressLine1,v.postalInformation?.postalAddress.PostCode].filter(x=>typeof x==='string').map(marker=>({marker,visible:true})));
 const view=rows=>({markerVisibility:markers(rows),caseViewStatus:200,protectedValue:control,controlVisible:true,recipientFields:[{id:'sodAdditionalRecipientsList',value:rows}],projected:rows,visible:Array(count).fill(true)});
 if(isRead) return {...result,...view(original),recipientFields:fault?[]:view(original).recipientFields,projected:fault?null:original,expectedRecipients:original.map(r=>r.value),visible:Array(count).fill(!fault),markerVisibility:markers(original).map(list=>list.map(m=>({...m,visible:!fault})))};
 const changed=recipients(channel,count,court?'courtadmin':'readonly'),submittedData={sodAdditionalRecipients:['additionalRecipients'],sodAdditionalRecipientsList:changed};
 const allowed=court?!fault:fault;
 if(allowed) {result.after.state.case_data={...data,...submittedData};result.after.state.version++;result.after.history.unshift({id:'serviceOfDocuments'});}
 const triggers=allowed?[{id:'serviceOfDocuments',name:'Service of documents'}]:[];
 if(court) return {...result,expectedValues:changed.map(r=>r.value),eventTriggers:triggers,formCompleted:allowed,startStatus:allowed?200:404,submitStatus:allowed?201:404,submittedData,csrfHeaderPresent:allowed,csrfHeaderDigest:allowed?digest('csrf'):null,readback:allowed?view(changed):null};
 return {...result,actor:{id:credentials.readonly.userId,roles:roles('readonly')},sessionUser:{id:credentials.readonly.userId,roles:roles('readonly')},eventId:'serviceOfDocuments',caseTriggers:triggers,menuOptions:allowed?['Select an event','Service of documents']:['Select an event'],eventTriggers:triggers,eventOptions:allowed?['Service of documents']:[],startStatus:allowed?200:404,legacyTokenStatus:200,eventTokenPresent:true,submitStatus:allowed?201:404,intendedData:{...data,...submittedData},submittedData,recipientFields:view(original).recipientFields,projected:original,visible:Array(count).fill(true),markerVisibility:markers(original)};
 }));
}

exports.roleFixture=async(t,invocationId=faults[0])=>{
 const f=await eventV3PolicySemanticFixture(t,invocationId),index=faults.indexOf(invocationId);
 if(index<0)throw Error('UNIT_ROLE_SELECTION');
 const lib=await import('../lib/exui-shared-role-event-observations.mjs');
 const {readEventBaselineCheckpoint}=await import('../lib/exui-native-proof-validation.mjs');
 const {sharedRoleArtifactNames}=await import('../lib/exui-shared-role-artifacts.mjs');
 const scope='exui-ccd-event-capability-pilot';
 const writeBytes=(relative,bytes)=>{const file=path.join(f.directory,relative);fs.writeFileSync(file,bytes);return {path:relative,digest:digest(bytes)};};
 const install=(id,offset)=>{
  const entry=id==='baseline'?f.expected.baseline:f.expected.faults.find(row=>row.invocationId===id);
  const runtime=id==='baseline'?f.read('input.json'):f.read(f.read(entry.capture.path).runtimeRecord.path);
  const manifest=f.read(id+'/manifest.json');
  const context={...Object.fromEntries(['runId','harnessCommit','releaseScopeId','policyDigest','identity'].map(k=>[k,manifest[k]])),invocationId:id,harnessSourceState:'clean',harnessSourceDigest:manifest.runtimeMetadata.harnessSourceDigest};
  const personas={credentials:runtime.credentials,sessions:Object.fromEntries(['allowed','courtadmin','judge','readonly'].map(n=>[n,'synthetic-unit-session-'+offset+'-'+n]))};
  f.put(id+'/context.json',context);f.put(id+'/personas.json',personas);
  const selectedNames=id==='baseline'?names:[names[index]],requests=[];
  for(const [n,name]of selectedNames.entries()){
   const value=lib.sharedRoleEventEnvelope(name,observations(name,id!=='baseline',runtime.credentials,offset+n),manifest,context,personas);
   f.put(id+'/'+name+'-observation.json',value);
   for(const item of value.observations)requests.push(...[
    {method:'GET',upstreamPath:`/internal/cases/${item.caseId}`,actorId:item.actor.id,status:200,mutation:null},
    ...(!name.endsWith('-read')?[{method:'GET',upstreamPath:`/internal/cases/${item.caseId}/event-triggers/serviceOfDocuments`,actorId:item.actor.id,status:item.startStatus,mutation:null},{method:'POST',upstreamPath:`/cases/${item.caseId}/events`,actorId:item.actor.id,status:item.submitStatus,mutation:null}]:[]),
   ]);
  }
  writeBytes(id+'/ccd-requests.jsonl',requests.map(r=>JSON.stringify(r)).join('\n')+'\n');
  return sharedRoleArtifactNames(id,scope);
 };
 const layouts={baseline:install('baseline',10),[invocationId]:install(invocationId,30)};
 const reseal=id=>{
  const entry=id==='baseline'?f.expected.baseline:f.expected.faults.find(row=>row.invocationId===id);
  const refs=layouts[id].map(n=>({path:id+'/'+n,digest:digest(fs.readFileSync(path.join(f.directory,id,n)))}));
  const run=f.read('run.json'),ref=run.executionArtifacts.find(r=>r.path===id+'/execution.json'),execution=f.read(ref.path);execution.sharedRoleArtifacts=refs;Object.assign(ref,f.put(ref.path,execution));f.put('run.json',run);f.saveRun();
  const completion=f.read(entry.completion.path);if(id==='baseline')completion.checkpointDigest=readEventBaselineCheckpoint(f.directory,f.expected.baselineExpected).checkpointDigest;completion.readbacks=f.put(id+'/v3-readbacks.json',{schemaVersion:3,invocationId:id,files:refs});
  completion.seal=f.put(completion.seal.path,{schemaVersion:3,invocationId:id,files:['readbacks','framework','host','fixture','registry','denial','lifecycle'].map(k=>completion[k])});entry.completion=f.put(entry.completion.path,completion);
  const retirement=f.read(entry.retirement.path);retirement.completion=entry.completion;entry.retirement=f.put(entry.retirement.path,retirement);
  for(let i=id==='baseline'?0:f.index+1;i<f.expected.faults.length;i++){
   const e=f.expected.faults[i],capture=f.read(e.capture.path);capture.previousRetirement=i?f.expected.faults[i-1].retirement:f.expected.baseline.retirement;e.capture=f.put(e.capture.path,capture);
   const ack=f.read(e.ack.path);ack.capture=e.capture;e.ack=f.put(e.ack.path,ack);const proof=f.read(e.proof.path);proof.ack=e.ack;e.proof=f.put(e.proof.path,proof);
   const c=f.read(e.completion.path);c.ack=e.ack;c.proof=e.proof;e.completion=f.put(e.completion.path,c);const r=f.read(e.retirement.path);r.completion=e.completion;e.retirement=f.put(e.retirement.path,r);
  }

 };
 reseal('baseline');reseal(invocationId);
 f.roleName=names[index];f.resealRole=reseal;
 f.changeRole=(id,name,change)=>{const relative=id+'/'+name;let value=name.endsWith('.jsonl')?fs.readFileSync(path.join(f.directory,relative),'utf8').trim().split('\n').map(JSON.parse):f.read(relative);change(value);if(name.endsWith('.jsonl'))writeBytes(relative,value.map(r=>JSON.stringify(r)).join('\n')+'\n');else f.put(relative,value);reseal(id);};
 return f;
};
