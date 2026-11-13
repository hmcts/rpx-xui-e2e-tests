const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const {judgeFixture}=require('./exui-event-v3-judge-domain.mock.cjs');
const {shapeReplayFixture}=require('./exui-event-v3-source-shape-observations.mock.cjs');
const digest=b=>'sha256:'+createHash('sha256').update(b).digest('hex');
const shapes=['recipient-collection','case-field-recipient-selector','required-delivery-radio','conditional-email-complex','postal-recipient-name','optional-postal-line-two'];
const common=['manifest.json','context.json','personas.json','ccd-requests.jsonl'];
const shapeNames=shape=>[`source-shape-${shape}-observation.json`,`source-shape-${shape}-ui-observation.json`];
// Independent synthetic composition only: no real source capture, resources or authority.
exports.sourceShapeDomainFixture=async(t,shape='recipient-collection',pairs=0)=>{
 if(!shapes.includes(shape))throw Error('UNIT_SOURCE_SHAPE_REQUIRED');
 const f=await judgeFixture(t),invocationId='ccd-shape-'+shape,selection=f.expected.faults.find(row=>row.invocationId===invocationId),unit=shapeReplayFixture(shape,pairs);
 const {readEventBaselineCheckpoint}=await import('../lib/exui-native-proof-validation.mjs');
 const layouts={baseline:[...common,'courtadmin-read-observation.json','readonly-read-observation.json','courtadmin-cell-observation.json','readonly-update-observation.json','event-capability-observation.json','judge-event-ui-observation.json',...shapes.flatMap(shapeNames)],[invocationId]:[...common,...shapeNames(shape)]};
 const bytes=(relative,b)=>{fs.writeFileSync(path.join(f.directory,relative),b);return{path:relative,digest:digest(b)};};
 const reference=relative=>({path:relative,digest:digest(fs.readFileSync(path.join(f.directory,relative)))});
 for(const [id,packets,oldIds]of [['baseline',unit.baseline,unit.baselineActorIds],[invocationId,[unit.selected],unit.selectedActorIds]]){
  const runtime=id==='baseline'?f.read('input.json'):f.read(f.read(selection.capture.path).runtimeRecord.path),manifest=f.read(id+'/manifest.json');
  const replace=value=>{if(typeof value==='string'){for(const name of Object.keys(oldIds))value=value.replaceAll(oldIds[name],runtime.credentials[name].userId);return value;}if(Array.isArray(value))return value.map(replace);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,replace(v)]));return value;};
  if(id!=='baseline'){
   f.put(id+'/context.json',{...Object.fromEntries(['runId','harnessCommit','releaseScopeId','policyDigest','identity'].map(k=>[k,manifest[k]])),invocationId:id,harnessSourceState:'clean',harnessSourceDigest:manifest.runtimeMetadata.harnessSourceDigest});
   f.put(id+'/personas.json',{credentials:runtime.credentials,sessions:Object.fromEntries(['allowed','courtadmin','judge','readonly'].map(name=>[name,'synthetic-shape-session-'+name]))});
  }
  const requests=id==='baseline'?fs.readFileSync(path.join(f.directory,id,'ccd-requests.jsonl'),'utf8').trim().split('\n').map(JSON.parse):[];
  for(const original of packets){const p=replace(original);f.put(id+'/'+shapeNames(p.shape)[0],p.observation);f.put(id+'/'+shapeNames(p.shape)[1],p.ui);requests.push(...p.requests);}
  bytes(id+'/ccd-requests.jsonl',requests.map(r=>JSON.stringify(r)).join('\n')+'\n');
 }
 const rechain=()=>{
  const base=f.read(f.expected.baseline.completion.path);base.checkpointDigest=readEventBaselineCheckpoint(f.directory,f.expected.baselineExpected).checkpointDigest;f.expected.baseline.completion=f.put(f.expected.baseline.completion.path,base);
  const retirement=f.read(f.expected.baseline.retirement.path);retirement.completion=f.expected.baseline.completion;f.expected.baseline.retirement=f.put(f.expected.baseline.retirement.path,retirement);
  for(let i=0;i<f.expected.faults.length;i++){
   const e=f.expected.faults[i],capture=f.read(e.capture.path);capture.previousRetirement=i?f.expected.faults[i-1].retirement:f.expected.baseline.retirement;e.capture=f.put(e.capture.path,capture);const ack=f.read(e.ack.path);ack.capture=e.capture;e.ack=f.put(e.ack.path,ack);const proof=f.read(e.proof.path);proof.ack=e.ack;e.proof=f.put(e.proof.path,proof);const c=f.read(e.completion.path);c.ack=e.ack;c.proof=e.proof;e.completion=f.put(e.completion.path,c);const r=f.read(e.retirement.path);r.completion=e.completion;e.retirement=f.put(e.retirement.path,r);
  }
 };
 const reseal=()=>{
  const run=f.read('run.json');
  for(const id of ['baseline',invocationId]){
   const refs=layouts[id].map(name=>reference(id+'/'+name)),ref=run.executionArtifacts.find(r=>r.path===id+'/execution.json'),e=f.read(ref.path);
   e.sourceShapeArtifacts=[...common,...(id==='baseline'?shapes.flatMap(shapeNames):shapeNames(shape))].map(name=>refs.find(r=>r.path===id+'/'+name));
   if(id==='baseline'){e.sharedRoleArtifacts=e.sharedRoleArtifacts.map(r=>refs.find(x=>x.path===r.path));e.judgeEventArtifacts=e.judgeEventArtifacts.map(r=>refs.find(x=>x.path===r.path));}
   Object.assign(ref,f.put(ref.path,e));const entry=id==='baseline'?f.expected.baseline:selection,c=f.read(entry.completion.path);c.readbacks=f.put(id+'/v3-readbacks.json',{schemaVersion:3,invocationId:id,files:refs});c.seal=f.put(c.seal.path,{schemaVersion:3,invocationId:id,files:['readbacks','framework','host','fixture','registry','denial','lifecycle'].map(k=>c[k])});entry.completion=f.put(entry.completion.path,c);
  }
  f.put('run.json',run);f.saveRun();rechain();
 };
 reseal();f.invocationId=invocationId;
 f.changeShape=(id,name,change)=>{const relative=id+'/'+name,value=name.endsWith('.jsonl')?fs.readFileSync(path.join(f.directory,relative),'utf8').trim().split('\n').map(JSON.parse):f.read(relative);change(value);if(name.endsWith('.jsonl'))bytes(relative,value.map(r=>JSON.stringify(r)).join('\n')+'\n');else f.put(relative,value);reseal();};
 f.shapeMembership=(id,change)=>{const entry=id==='baseline'?f.expected.baseline:selection,c=f.read(entry.completion.path),r=f.read(c.readbacks.path);change(r.files);c.readbacks=f.put(c.readbacks.path,r);c.seal=f.put(c.seal.path,{schemaVersion:3,invocationId:id,files:['readbacks','framework','host','fixture','registry','denial','lifecycle'].map(k=>c[k])});entry.completion=f.put(entry.completion.path,c);rechain();};
 f.changeShapeExecution=(id,change)=>{const run=f.read('run.json'),ref=run.executionArtifacts.find(r=>r.path===id+'/execution.json'),e=f.read(ref.path);change(e);Object.assign(ref,f.put(ref.path,e));f.put('run.json',run);f.saveRun();rechain();};
 f.resealShapes=reseal;return f;
};
