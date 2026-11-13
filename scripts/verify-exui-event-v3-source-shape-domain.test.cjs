const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {sourceShapeDomainFixture}=require('./fixtures/exui-event-v3-source-shape-domain.mock.cjs');
const load=()=>import(process.env.EVENT_V3_SHAPE_DOMAIN_TEST_MODULE??'./lib/exui-event-v3-source-shape-semantics.mjs');
const replay=(m,f)=>m.readEventSerialV3SourceShapeSemantics(f.directory,f.expected,{runPin:f.runPin,invocationId:f.invocationId});
const invalid=/^Error: EVENT_V3_SOURCE_SHAPE_REPLAY_INVALID$/;
const shapes=['recipient-collection','case-field-recipient-selector','required-delivery-radio','conditional-email-complex','postal-recipient-name','optional-postal-line-two'];
for(const shape of shapes)test('double-pinned source shape '+shape+' replays baseline6 and selected1 without authority',async t=>{
 const m=await load(),f=await sourceShapeDomainFixture(t,shape),v=replay(m,f);assert.deepEqual(v.sourceShapeDomain,{baselineShapes:6,selectedFaults:1,uiObservations:7});assert.equal(v.incompleteDomainFaults.length,5);for(const key of ['semanticReplay','nativeAuthority','sourceComplete','nativeRuntimeAcceptance','runtimeAcceptance','catalogueCredit','releaseCredit','releaseApproval','promotionAllowed'])assert.equal(v[key],false);assert(!JSON.stringify(v).includes(f.directory));
});
test('finite helper selects exactly16 baseline refs and6 selected refs for fixed policy IDs',async()=>{
 const m=await import('./lib/exui-event-v3-source-shape-artifacts.mjs');assert.equal(m.sourceShapeArtifactNames('baseline').length,16);for(const shape of shapes)assert.equal(m.sourceShapeArtifactNames('ccd-shape-'+shape).length,6);for(const id of ['unknown','../baseline','ccd-enable-judge-event'])assert.throws(()=>m.sourceShapeArtifactNames(id));
});
test('all22 baseline members are accepted by old role/judge readers without borrowing shape semantics',async t=>{
 const f=await sourceShapeDomainFixture(t),m=await import(process.env.EVENT_V3_SHAPE_UNION_TEST_MODULE??'./lib/exui-event-v3-fault-semantics.mjs');assert.equal(m.readEventSerialV3RoleSemantics(f.directory,f.expected,{runPin:f.runPin,invocationId:'ccd-remove-courtadmin-recipient-read'}).roleDomain.checkedScenarios,20);assert.equal(m.readEventSerialV3JudgeSemantics(f.directory,f.expected,{runPin:f.runPin,invocationId:'ccd-enable-judge-event'}).judgeDomain.checkedCases,2);
});
test('shape/role/judge reject partial22, role-plus-shapes20, duplicates and foreign extras',async t=>{
 const m=await load(),old=await import(process.env.EVENT_V3_SHAPE_UNION_TEST_MODULE??'./lib/exui-event-v3-fault-semantics.mjs');
 for(const change of [r=>r.pop(),r=>r.splice(8,2),r=>r.push(r[0]),r=>r.push({path:'baseline/foreign.json',digest:r[0].digest})]){
  const f=await sourceShapeDomainFixture(t);replay(m,f);f.shapeMembership('baseline',change);assert.throws(()=>replay(m,f),invalid);assert.throws(()=>old.readEventSerialV3RoleSemantics(f.directory,f.expected,{runPin:f.runPin,invocationId:'ccd-remove-courtadmin-recipient-read'}));assert.throws(()=>old.readEventSerialV3JudgeSemantics(f.directory,f.expected,{runPin:f.runPin,invocationId:'ccd-enable-judge-event'}));
 }
});
test('source artifacts require independent execution pins and held raw-byte pins, including common metadata',async t=>{
 const m=await load();
 for(const change of [e=>delete e.sourceShapeArtifacts,e=>e.sourceShapeArtifacts.pop(),e=>e.sourceShapeArtifacts.push(e.sourceShapeArtifacts[0]),e=>e.sourceShapeArtifacts[0].digest='sha256:'+'0'.repeat(64)]){
  const f=await sourceShapeDomainFixture(t);replay(m,f);f.changeShapeExecution('baseline',change);assert.throws(()=>replay(m,f),invalid);
 }
 const f=await sourceShapeDomainFixture(t);replay(m,f);fs.appendFileSync(path.join(f.directory,'baseline/source-shape-recipient-collection-ui-observation.json'),' ');assert.throws(()=>replay(m,f),invalid);
});
test('selected6 membership, aliases and missing bytes fail closed',async t=>{
 const m=await load();for(const change of [r=>r.pop(),r=>r.push(r[0])]){const f=await sourceShapeDomainFixture(t);f.shapeMembership(f.invocationId,change);assert.throws(()=>replay(m,f),invalid);}
 const f=await sourceShapeDomainFixture(t),file=path.join(f.directory,f.invocationId,'source-shape-recipient-collection-ui-observation.json'),outside=path.join(f.directory,'alias-target.json');fs.renameSync(file,outside);fs.symlinkSync(outside,file);assert.throws(()=>replay(m,f),invalid);
});
test('coherently resealed data, schema, context, identity and persona substitutions cannot borrow structured proof PASS',async t=>{
 const m=await load();for(const [name,change]of [
  ['source-shape-recipient-collection-observation.json',v=>v.after.state.case_data.sodAdditionalRecipientsList.emailInformation.emailName='wrong'],
  ['source-shape-recipient-collection-ui-observation.json',v=>v.schemaVersion=2],['context.json',v=>v.invocationId='baseline'],['manifest.json',v=>v.identity.artifactDigest='sha256:'+'0'.repeat(64)],['personas.json',v=>v.credentials.courtadmin.userId='foreign'],
 ]){const f=await sourceShapeDomainFixture(t);replay(m,f);f.changeShape(f.invocationId,name,change);assert.throws(()=>replay(m,f),invalid);}
});
test('actual journal and conditional0/1 branches remain semantic rather than reference-count evidence',async t=>{
 const m=await load();for(const count of [0,1]){const f=await sourceShapeDomainFixture(t,'conditional-email-complex',count);replay(m,f);f.changeShape(f.invocationId,'ccd-requests.jsonl',r=>r.pop());assert.throws(()=>replay(m,f),invalid);}
});
test('old current producer packets missing source refs reject despite structured proof success',async t=>{
 const {eventV3PolicySemanticFixture}=require('./fixtures/exui-event-v3-policy-semantic.mock.cjs'),m=await load(),f=await eventV3PolicySemanticFixture(t,'ccd-shape-recipient-collection');assert.throws(()=>replay(m,f),invalid);
});

test('legacy8/10 and selected5/6 reject a sourceShapeArtifacts property without the complete22 group',async t=>{
 const {judgeFixture}=require('./fixtures/exui-event-v3-judge-domain.mock.cjs'),{roleFixture}=require('./fixtures/exui-event-v3-role-domain.mock.cjs'),m=await import(process.env.EVENT_V3_SHAPE_UNION_TEST_MODULE??'./lib/exui-event-v3-fault-semantics.mjs');
 const role=(f,id)=>m.readEventSerialV3RoleSemantics(f.directory,f.expected,{runPin:f.runPin,invocationId:id});
 for(const which of ['baseline','selected']){
  const f=await roleFixture(t),id=which==='baseline'?'baseline':f.invocationId,run=f.read('run.json'),ref=run.executionArtifacts.find(r=>r.path===id+'/execution.json'),e=f.read(ref.path);e.sourceShapeArtifacts=[];Object.assign(ref,f.put(ref.path,e));f.put('run.json',run);f.saveRun();f.resealRole(id);assert.throws(()=>role(f,f.invocationId),/^Error: EVENT_V3_ROLE_REPLAY_INVALID$/);
  const j=await judgeFixture(t),jid=which==='baseline'?'baseline':j.invocationId,jrun=j.read('run.json'),jref=jrun.executionArtifacts.find(r=>r.path===jid+'/execution.json'),je=j.read(jref.path);je.sourceShapeArtifacts=[];Object.assign(jref,j.put(jref.path,je));j.put('run.json',jrun);j.saveRun();j.changeJudge(jid,'judge-event-ui-observation.json',()=>{});assert.throws(()=>m.readEventSerialV3JudgeSemantics(j.directory,j.expected,{runPin:j.runPin,invocationId:j.invocationId}),/^Error: EVENT_V3_JUDGE_REPLAY_INVALID$/);
 }
});
test('role/judge22 readers require independent shape refs but do not borrow sealed shape semantics',async t=>{
 const f=await sourceShapeDomainFixture(t),m=await import(process.env.EVENT_V3_SHAPE_UNION_TEST_MODULE??'./lib/exui-event-v3-fault-semantics.mjs'),shape=await load();
 const role=()=>m.readEventSerialV3RoleSemantics(f.directory,f.expected,{runPin:f.runPin,invocationId:'ccd-remove-courtadmin-recipient-read'}),judge=()=>m.readEventSerialV3JudgeSemantics(f.directory,f.expected,{runPin:f.runPin,invocationId:'ccd-enable-judge-event'});
 f.changeShape('baseline','source-shape-recipient-collection-ui-observation.json',v=>v.readbacks=[]);assert.equal(role().roleDomain.checkedScenarios,20);assert.equal(judge().judgeDomain.checkedCases,2);assert.throws(()=>replay(shape,f),invalid);
 f.changeShapeExecution('baseline',e=>delete e.sourceShapeArtifacts);assert.throws(role,/^Error: EVENT_V3_ROLE_REPLAY_INVALID$/);assert.throws(judge,/^Error: EVENT_V3_JUDGE_REPLAY_INVALID$/);
});

test('every non22 baseline cardinality including11through21 is rejected before domain-file reads',async t=>{
 const os=require('node:os'),root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'shape-membership-')));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const m=await import('./lib/exui-event-v3-source-shape-artifacts.mjs'),common=['manifest.json','context.json','personas.json','ccd-requests.jsonl'],names=[...common,'courtadmin-read-observation.json','readonly-read-observation.json','courtadmin-cell-observation.json','readonly-update-observation.json','event-capability-observation.json','judge-event-ui-observation.json',...shapes.flatMap(s=>[`source-shape-${s}-observation.json`,`source-shape-${s}-ui-observation.json`])],refs=names.map(name=>({path:'baseline/'+name,digest:'sha256:'+'a'.repeat(64)}));
 for(const count of [0,8,9,10,11,12,13,14,15,16,17,18,19,20,21,23]){
  const selected=count<=22?refs.slice(0,count):[...refs,{path:'baseline/foreign.json',digest:refs[0].digest}];assert.throws(()=>m.readSourceShapeArtifacts(root,'baseline',selected,{invocationId:'baseline'}),/^Error: EVENT_V3_SOURCE_SHAPE_ARTIFACT_INVALID$/);
 }
 assert.deepEqual(fs.readdirSync(root),[]);
});

test('independent run references are required before decoding coherently pinned domain JSON',async t=>{
 const f=await sourceShapeDomainFixture(t),m=await load(),file=path.join(f.directory,f.invocationId,'source-shape-recipient-collection-ui-observation.json');
 fs.writeFileSync(file,'unit invalid domain JSON');f.resealShapes();f.changeShapeExecution(f.invocationId,e=>delete e.sourceShapeArtifacts);
 const parse=JSON.parse;let attempted=false;JSON.parse=(value,...args)=>{if(String(value)==='unit invalid domain JSON')attempted=true;return parse(value,...args);};
 try{assert.throws(()=>replay(m,f),invalid);}finally{JSON.parse=parse;}
 assert.equal(attempted,false);
});
test('separate sealed runtime namespaces may reuse a case ID without weakening within-baseline uniqueness',async t=>{
 const f=await sourceShapeDomainFixture(t),m=await load(),o=f.read(f.invocationId+'/source-shape-recipient-collection-observation.json'),id=f.read('baseline/source-shape-recipient-collection-observation.json').caseId,previous=o.caseId;
 f.changeShape(f.invocationId,'source-shape-recipient-collection-observation.json',v=>{v.caseId=id;v.before.state.id=Number(id);v.after.state.id=Number(id);});
 f.changeShape(f.invocationId,'source-shape-recipient-collection-ui-observation.json',v=>v.caseId=id);
 f.changeShape(f.invocationId,'ccd-requests.jsonl',rows=>{for(const row of rows)for(const key of ['upstreamPath','path','receivedPath'])if(typeof row[key]==='string')row[key]=row[key].replaceAll(previous,id);});
 assert.equal(replay(m,f).sourceShapeDomain.selectedFaults,1);
});

test('double-pinned legacy user-details actor is credential-bound before safe domain projection',async t=>{
 const m=await load(),{createHash}=require('node:crypto');
 const install=(f,id,change=()=>{})=>{
  // Legacy unit fixtures predate the candidate user-details email field.
  // Supply an independent held credential before producing the rich observation.
  const index=f.expected.faults.findIndex(row=>row.invocationId===id);
  f.rewriteRuntime(index,v=>{v.credentials.courtadmin.email='courtadmin@harness.example.com';});
  f.changeDerivation(v=>{v.runtimeRecord=f.read(f.expected.faults[index].capture.path).runtimeRecord;},id);
  f.changeShape(id,'personas.json',v=>{v.credentials.courtadmin.email='courtadmin@harness.example.com';});
  const runtime=id==='baseline'?f.read('input.json'):f.read(f.read(f.expected.faults.find(row=>row.invocationId===id).capture.path).runtimeRecord.path),credential=runtime.credentials.courtadmin;
  const actor={id:credential.userId,uid:credential.userId,email:credential.email,roles:credential.roles,token:credential.headers.Authorization,forename:'Synthetic',surname:'Courtadmin',roleCategory:'LEGAL_OPERATIONS',roleCategories:['LEGAL_OPERATIONS'],filterOwnerHash:createHash('sha256').update('exui-filter-owner:'+credential.userId).digest('hex')};change(actor);
  for(const shape of id==='baseline'?shapes:[id.slice(10)])f.changeShape(id,`source-shape-${shape}-observation.json`,v=>{v.actor=actor;});
 };
 const f=await sourceShapeDomainFixture(t);install(f,f.invocationId);const before=fs.readFileSync(path.join(f.directory,f.invocationId,'source-shape-recipient-collection-observation.json'));assert.equal(replay(m,f).sourceShapeDomain.selectedFaults,1);assert.deepEqual(fs.readFileSync(path.join(f.directory,f.invocationId,'source-shape-recipient-collection-observation.json')),before);
 for(const change of [a=>a.id='foreign',a=>a.uid='foreign',a=>a.email='foreign@example.invalid',a=>a.roles.push('admin'),a=>a.token='Bearer foreign',a=>a.filterOwnerHash='0'.repeat(64),a=>a.headers={},a=>delete a.token,a=>a.roleCategories=[{}],a=>a.forename={token:'secret'}]){
  const g=await sourceShapeDomainFixture(t);install(g,g.invocationId,change);assert.throws(()=>replay(m,g),invalid);
 }
 const pure=await import('./lib/exui-event-v3-source-shape-observations.mjs'),{shapeReplayFixture}=require('./fixtures/exui-event-v3-source-shape-observations.mock.cjs'),packet=shapeReplayFixture('recipient-collection');packet.selected.observation.actor.token='Bearer forbidden';assert.throws(()=>pure.replayEventV3SourceShapeObservations(packet));
});
