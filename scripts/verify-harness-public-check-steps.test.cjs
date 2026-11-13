const test=require('node:test');
const assert=require('node:assert/strict');
const helper=require(process.env.HARNESS_CHECK_STEPS_HELPER??'./harness-public-check-steps.cjs');
const overview=require('./harness-public-overview.cjs');
const entries=overview.profiles['local-aat'];
const canary='PRIVATE_STEP_AUTH_COOKIE_QUERY_CANARY';
const multi=entries.find(entry=>helper.methodFor(entry).steps.length>1);
const actual=(entry,format='framework')=>helper.methodFor(entry).steps.map(step=>({title:'harness-check:'+step.id,duration:3,...(format==='framework'?{category:'test.step',startTime:new Date()}:{}),steps:[]}));

test('reviewed methods cover every exact121identity and retain trusted scope separately from purpose',()=>{
  assert.equal(entries.length,121);
  const ids=[];
  for(const entry of entries){const method=helper.methodFor(entry);assert(method.purpose&&method.boundary);ids.push(...method.steps.map(step=>step.id));const copy=helper.methodFor(entry);copy.purpose=canary;assert.notEqual(helper.methodFor(entry).purpose,canary);}
  assert.equal(new Set(ids).size,129);
  assert.throws(()=>helper.methodFor({file:'foreign',titlePath:['unknown']}),/PUBLIC_ODHIN_CHECK/);
  const different={...entries[0],titlePath:[...entries[0].titlePath]};different.titlePath[different.titlePath.length-1]='unreviewed';assert.throws(()=>helper.methodFor(different),/PUBLIC_ODHIN_CHECK/);
});
test('framework extracts actual reviewed event order and scalars while private automatic/hook data stays private',()=>{
  const known=actual(multi),id=helper.methodFor(multi).steps[0].id;
  const raw=[{category:'hook',title:canary,steps:[{category:'test.step',title:'harness-check:'+id,duration:1}]},{category:'expect',title:'harness-check:'+id,duration:1},...known];
  Object.assign(known[0],{location:{file:canary},attachments:[{body:canary}],params:{Authorization:canary},subtitle:canary});known[0].steps=[{category:'expect',title:canary,error:{message:canary},duration:0}];
  const before=JSON.stringify(raw),safe=helper.extractCheckSteps(multi,raw);
  assert.deepEqual(safe,helper.methodFor(multi).steps.map((step,index)=>({id:step.id,status:'passed',durationMs:3,order:index+1})));
  assert(!JSON.stringify(safe).includes(canary));assert.equal(JSON.stringify(raw),before);
  assert.equal(helper.validateCheckSteps(multi,safe,'passed').length,known.length);
});
test('installed JSON title/duration/error/steps shape is supported without inventing category or dates',()=>{
  const raw=actual(multi,'json');raw[0].error={message:canary,stack:canary};raw[0].subtitle=canary;raw[0].location={file:canary};
  const safe=helper.extractCheckSteps(multi,raw,'json');assert.equal(safe[0].status,'failed');assert(!JSON.stringify(safe).includes(canary));
  helper.validateCheckSteps(multi,safe,'failed');assert.throws(()=>helper.validateCheckSteps(multi,safe,'passed'),/PUBLIC_ODHIN_CHECK/);
  const spoof=actual(multi,'framework');assert.deepEqual(helper.extractCheckSteps(multi,spoof,'json'),[]);
});
test('unreviewed named steps are denied rather than publishing raw titles or treating them as recorded method',()=>{
  const raw=[{category:'test.step',title:'harness-check:'+canary,duration:1}];
  assert.throws(()=>helper.extractCheckSteps(entries[0],raw),error=>error.message==='PUBLIC_ODHIN_CHECK_STEPS_INVALID');
  assert.deepEqual(helper.extractCheckSteps(entries[0],[{category:'test.step',title:canary,duration:1}]),[]);
});
test('duplicates, reversed method order, malformed duration and extra safe payload fail closed',()=>{
  const raw=actual(multi),safe=helper.extractCheckSteps(multi,raw);
  assert.throws(()=>helper.extractCheckSteps(multi,[raw[0],raw[0]]),/PUBLIC_ODHIN_CHECK/);
  assert.throws(()=>helper.validateCheckSteps(multi,helper.extractCheckSteps(multi,[...raw].reverse()),'failed'),/PUBLIC_ODHIN_CHECK/);
  for(const duration of [NaN,Infinity,-2,Number.MAX_VALUE])assert.throws(()=>helper.extractCheckSteps(multi,[{...raw[0],duration}]),/PUBLIC_ODHIN_CHECK/);
  for(const mutate of [v=>v[0].order=2,v=>v[0].payload=canary,v=>v[0].id='foreign',v=>v[0].status='skipped',v=>v[0].durationMs=-1]){const value=structuredClone(safe);mutate(value);assert.throws(()=>helper.validateCheckSteps(multi,value,'failed'),/PUBLIC_ODHIN_CHECK/);}
});
test('missing or incomplete failed-setup stages are explicit while passed missing stages cannot publish',()=>{
  const first=entries[0],id=helper.methodFor(first).steps[0].id;
  assert.throws(()=>helper.validateCheckSteps(first,[],'passed'),/PUBLIC_ODHIN_CHECK/);
  for(const status of ['failed','skipped','timedOut']){helper.validateCheckSteps(first,[],status);assert.match(helper.renderSteps(first,[],status),/Not recorded/);}
  const incomplete=helper.extractCheckSteps(first,[{category:'test.step',title:'harness-check:'+id,duration:-1}]);
  assert.deepEqual(incomplete,[{id,status:'incomplete',durationMs:null,order:1}]);
  assert.match(helper.renderSteps(first,incomplete,'timedOut'),/Started; completion not recorded/);assert.throws(()=>helper.validateCheckSteps(first,incomplete,'passed'),/PUBLIC_ODHIN_CHECK/);
});
test('method record binds identity/order/static source and aggregate statuses without raw fields',()=>{
  const results=new Map(entries.map(entry=>[JSON.stringify([entry.file,overview.normalize(entry).titlePath]),{status:'passed',checkSteps:helper.extractCheckSteps(entry,actual(entry))}]));
  const record=helper.methodEvidence(entries,results),counts={passed:121,failed:0,skipped:0,timedOut:0};
  helper.validateMethodEvidence(record,entries,counts);
  for(const mutate of [r=>r.manifestDigest='sha256:foreign',r=>r.checks.pop(),r=>r.checks.reverse(),r=>r.checks[0].status='failed',r=>r.checks[0].extra=canary,r=>r.checks[0].steps=[],r=>r.schemaVersion=2]){const value=structuredClone(record);mutate(value);assert.throws(()=>helper.validateMethodEvidence(value,entries,counts),/PUBLIC_ODHIN_CHECK/);}
});

test('finite nested CSRF details preserve actual status/order/duration without disclosing parser inputs',()=>{
 const details=require('./harness-public-check-details.cjs'),entry=entries.find(e=>helper.methodFor(e).steps[0].id==='auth-basic-csrf'),raw=actual(entry);raw[0].steps=details.declarationsFor(entry).map(row=>({title:'harness-detail:'+row.id,category:'test.step',duration:2,steps:[{category:'expect',title:canary,duration:1}]}));
 const parents=helper.extractCheckSteps(entry,raw),safe=details.extractDetails(entry,raw,'framework',parents,'passed');assert.deepEqual(safe.map(r=>[r.id,r.parentId,r.status,r.durationMs,r.order]),[['csrf-present','auth-basic-csrf','passed',2,1],['csrf-absent','auth-basic-csrf','passed',2,2]]);assert(!JSON.stringify(safe).includes(canary));assert.match(details.renderDetails(entry,safe,parents,'passed'),/Source-defined expected assertion/);assert.match(details.renderDetails(entry,undefined,parents,'passed'),/Not recorded/);
});

test('nested detail parser denies unknown duplicate reversed orphan cross-test and automatic expectation events',()=>{
 const details=require('./harness-public-check-details.cjs'),entry=entries.find(e=>helper.methodFor(e).steps[0].id==='auth-basic-csrf'),other=entries.find(e=>e.file!==entry.file),base=actual(entry);base[0].steps=['csrf-present','csrf-absent'].map(id=>({title:'harness-detail:'+id,category:'test.step',duration:1,steps:[]}));const parents=helper.extractCheckSteps(entry,base);
 for(const mutate of [r=>r[0].steps[0].title='harness-detail:unknown',r=>r[0].steps.push(r[0].steps[0]),r=>r[0].steps.reverse(),r=>r.push(r[0].steps.shift()),r=>r[0].steps[0].category='expect',r=>r[0].steps[0].annotations=[{type:'skip'}],r=>r[0].steps=[{category:'expect',title:canary,duration:0,steps:r[0].steps}]]){const raw=structuredClone(base);mutate(raw);assert.throws(()=>details.extractDetails(entry,raw,'framework',parents,'passed'),/PUBLIC_ODHIN_CHECK_DETAILS/);}
 assert.throws(()=>details.extractDetails(other,base,'framework',parents,'passed'),/PUBLIC_ODHIN_CHECK_DETAILS/);
 const json=base.map(row=>({...row,category:undefined,steps:row.steps.map(child=>({...child,category:undefined}))}));assert.deepEqual(details.extractDetails(entry,json,'json',parents,'passed'),details.extractDetails(entry,base,'framework',parents,'passed'));
});
test('detail outcomes are never inferred from parent PASS and failed setup records no later assertion',()=>{
 const details=require('./harness-public-check-details.cjs'),entry=entries.find(e=>helper.methodFor(e).steps[0].id==='auth-basic-csrf'),raw=actual(entry),parents=helper.extractCheckSteps(entry,raw);
 assert.throws(()=>details.extractDetails(entry,raw,'framework',parents,'passed'),/PUBLIC_ODHIN_CHECK_DETAILS/);assert.deepEqual(details.extractDetails(entry,[],'framework',[],'failed'),[]);assert.match(details.renderDetails(entry,[],[],'failed'),/Not recorded/);
 const rows=[{id:'csrf-present',parentId:'auth-basic-csrf',status:'passed',durationMs:1,order:1},{id:'csrf-absent',parentId:'auth-basic-csrf',status:'passed',durationMs:2,order:2}];
 for(const mutate of [r=>r[0].payload=canary,r=>r[0].parentId='foreign',r=>r[1].order=1,r=>r[1].status='failed',r=>r[0].durationMs=NaN]){const value=structuredClone(rows);mutate(value);assert.throws(()=>details.validateDetails(entry,value,parents,'passed'),/PUBLIC_ODHIN_CHECK_DETAILS/);}
 const results=new Map([[JSON.stringify([entry.file,overview.normalize(entry).titlePath]),{status:'passed',checkSteps:parents,checkDetails:rows}]]),document=details.detailEvidence([entry],results),methods=helper.methodEvidence([entry],results);details.validateEvidence(document,[entry],methods);
 for(const mutate of [v=>v.checks.push(v.checks[0]),v=>v.checks[0].titlePath=['foreign'],v=>v.registryDigest='sha256:foreign',v=>v.checks[0].details=[],v=>v.checks[0].extra=canary]){const value=structuredClone(document);mutate(value);assert.throws(()=>details.validateEvidence(value,[entry],methods),/PUBLIC_ODHIN_CHECK_DETAILS/);}
});


test('completed nested child duration cannot exceed its actual completed parent and no sum or unknown span is invented',()=>{
 const details=require('./harness-public-check-details.cjs'),entry=entries.find(e=>helper.methodFor(e).steps[0].id==='auth-basic-csrf'),parent=[{id:'auth-basic-csrf',status:'passed',durationMs:1,order:1}],rows=['csrf-present','csrf-absent'].map((id,index)=>({id,parentId:'auth-basic-csrf',status:'passed',durationMs:1,order:index+1}));
 details.validateDetails(entry,rows,parent,'passed');const tooLong=structuredClone(rows);tooLong[0].durationMs=999;assert.throws(()=>details.validateDetails(entry,tooLong,parent,'passed'),/PUBLIC_ODHIN_CHECK_DETAILS/);details.validateDetails(entry,rows,[{...parent[0],status:'incomplete',durationMs:null}],'timedOut');
});
