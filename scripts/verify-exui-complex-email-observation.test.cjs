const assert=require('node:assert/strict');
const {test}=require('node:test');
const {fixture}=require('./fixtures/exui-complex-email-observation.mock.cjs');

test('actual Complex journey retains both distinct validation responses, first/second CYA and restored controls',async()=>{
  const f=fixture('baseline');await f.run();
  const observed=JSON.parse(f.files.get('/owned/complex-email-text-observation.json'));
  for(const journey of [observed.healthy,observed.probe]) {
    assert.deepEqual(journey.validationResponses.map(x=>x.body.sequence),[1,2]);
    assert.equal(journey.validationResponses[0].status,200);assert.equal(journey.validationResponses[1].status,200);
    assert.equal(journey.cya.visible,true);assert.deepEqual(journey.cya.rows,journey.cyaRows);
    assert.equal(journey.secondCya.visible,true);assert.deepEqual(journey.secondCya.rows,journey.cyaRows);
    assert.deepEqual(journey.restoredControls,journey.controls);
    assert.deepEqual(journey.outgoing,{method:'POST',path:`/data/cases/${journey.caseId}/events`,classificationPresent:false,dataClassificationPresent:false});
    for(const [index,control] of journey.controls.entries()) {
      assert.equal(control.type,'text');assert.equal(control.label,'Email address');assert.equal(control.visible,true);
      assert.equal(control.emailName.value,journey.restored[index].name);
      assert.equal(control.value,journey.restored[index].address);assert(control.domIndex>control.emailName.domIndex);
      assert.equal(control.channel.emailSelected,true);assert.equal(control.channel.postSelected,false);assert.equal(control.channel.emailValue,'on');
      assert.deepEqual(control.postal,{count:1,id:`recipient_${index}_postalName`,hidden:true});
    }
  }
  assert.equal(observed.probe.controls[0].value,'Synthetic recipient contact alpha');
  for(const key of ['sourceComplete','runtimeAcceptance','catalogueCredit','releaseCredit'])assert.equal(observed[key],false);
  assert(!f.files.get('/owned/complex-email-text-observation.json').includes('DO-NOT-RETAIN'));
});

test('actual Email mutant retains healthy control then exact failed probe without fabricated second validation or CYA',async()=>{
  const f=fixture('email-type');await assert.rejects(f.run());
  const observed=JSON.parse(f.files.get('/owned/complex-email-text-observation.json'));
  assert.deepEqual(observed.healthy.validationResponses.map(x=>x.status),[200,200]);
  assert.equal(observed.healthy.status,201);assert.equal(observed.probe.validationResponses.length,1);
  assert.equal(observed.probe.validationResponses[0].status,422);assert.equal(observed.probe.cya.visible,false);
  assert.equal(observed.probe.secondCya,null);assert.equal(observed.probe.outgoing,null);assert.equal(observed.probe.sent,null);
  assert.deepEqual(observed.probe.submissions,[]);assert.deepEqual(observed.probe.restoredControls,[]);
  assert.deepEqual(observed.probe.rejectedControls[0].classes,['govuk-input--error']);
  assert.deepEqual(observed.probe.after,observed.probe.before);
});

test('control snapshot reports actual changed DOM values and visibility rather than declaring expected state',async()=>{
  const f=fixture('baseline');await f.run();f.alter();
  const controls=JSON.parse(JSON.stringify(await f.capture()));
  assert.equal(controls[0].channel.emailSelected,false);assert.equal(controls[0].channel.postSelected,true);
  assert.equal(controls[0].postal.hidden,false);assert.equal(controls[0].type,'email');
  assert.equal(controls[0].value,'observed-changed');assert.equal(controls[0].emailName.value,'Observed name');
});

test('fixed cohort reader consumes actual journey output and rejects missing validation or altered channel evidence',async()=>{
  const {validateComplexObservation}=await import('./lib/exui-complex-email-cohort.mjs');
  for(const variant of ['baseline','email-type']) {
    const f=fixture(variant);
    if(variant==='baseline')await f.run();else await assert.rejects(f.run());
    const observed=JSON.parse(f.files.get('/owned/complex-email-text-observation.json'));
    assert.equal(validateComplexObservation(observed,variant),true);
    for(const mutate of [x=>x.healthy.validationResponses.pop(),x=>x.healthy.controls[0].channel.postSelected=true,
      x=>x.healthy.restoredControls[0].value='wrong',x=>x.healthy.secondCya.rows.reverse(),x=>x.healthy.outgoing.classificationPresent=true]) {
      const changed=structuredClone(observed);mutate(changed);
      assert.throws(()=>validateComplexObservation(changed,variant),/COMPLEX_COHORT/);
    }
  }
});

const observerRows=f=>{assert(f.files.has('/owned/complex-email-observer.jsonl'),'actual observer journal missing');return f.files.get('/owned/complex-email-observer.jsonl').trim().split('\n').map(JSON.parse);};

test('direct observer journal records eight actual GET statuses and exact before/after bodies in both journeys',async()=>{
  for(const variant of ['baseline','email-type']) {
    const f=fixture(variant);if(variant==='baseline')await f.run();else await assert.rejects(f.run());
    const observed=JSON.parse(f.files.get('/owned/complex-email-text-observation.json')),rows=observerRows(f);
    assert.deepEqual(rows.map(row=>row.ordinal),[1,2,3,4,5,6,7,8]);assert.equal(f.observerRequests.length,8);
    let index=0;
    for(const journey of [observed.healthy,observed.probe])for(const stage of ['before','after'])for(const view of ['state','history']) {
      const row=rows[index],request=f.observerRequests[index++];
      assert.deepEqual(row,{ordinal:index,stage,view,caseId:journey.caseId,actorId:'fixed-observer',method:'GET',path:request.path,status:200,body:journey[stage][view]});
      assert.deepEqual(row.body,request.body);
    }
    assert(!JSON.stringify([...f.files]).includes('OBSERVER-SECRET-CANARY'));
  }
});

test('observer failure records both actual responses without accepting errors or retaining private bodies',async()=>{
  for(const failure of [{status:500,body:{message:'PRIVATE-CANARY'}},{status:200,jsonError:'PRIVATE-CANARY'},{error:'PRIVATE-CANARY'}]) {
    const f=fixture('baseline',{observerResponse:call=>call.ordinal===1?failure:undefined});
    await assert.rejects(f.run());const rows=observerRows(f);
    assert.equal(rows.length,2);assert.equal(rows[0].status,failure.status??null);assert.equal(rows[1].status,200);
    assert.deepEqual(rows[0].body,{error:failure.error?'transport-failed':failure.jsonError?'non-json-response':'http-error'});
    assert(!JSON.stringify([...f.files]).includes('PRIVATE-CANARY'));
    assert(!f.files.has('/owned/complex-email-text-observation.json'));
  }
});

test('observer rejects a foreign returned case or domain and only retains declared synthetic data fields',async()=>{
  for(const change of [body=>body.id='9999999999999999',body=>body.case_type_id='ForeignCase',body=>body.jurisdiction='FOREIGN']) {
    const f=fixture('baseline',{observerResponse:call=>{if(call.ordinal!==1)return;change(call.body);return {status:200,body:call.body};}});
    await assert.rejects(f.run());assert.equal(observerRows(f).length,2);
  }
  const f=fixture('baseline',{observerResponse:call=>{
    if(Array.isArray(call.body))return;
    call.body.unexpected='PRIVATE-CANARY';call.body.case_data.token='PRIVATE-CANARY';
    call.body.case_data.foreignField={value:'PRIVATE-CANARY'};
    return {status:200,body:call.body};
  }});
  await f.run();assert(!JSON.stringify([...f.files]).includes('PRIVATE-CANARY'));
});

test('actual observer journal joins fixed transport reader and rejects swapped windows, ordinals and bodies',async()=>{
  const {complexTransportProjection,validateComplexTransport}=await import('./lib/exui-complex-email-transport.mjs');
  for(const variant of ['baseline','email-type']) {
    const f=fixture(variant);if(variant==='baseline')await f.run();else await assert.rejects(f.run());
    const observed=JSON.parse(f.files.get('/owned/complex-email-text-observation.json'));
    const records=f.businessTransports.map(complexTransportProjection),observerRecords=observerRows(f);
    const verify=rows=>validateComplexTransport(records,observed,{actorId:'fixed-actor',observerId:'fixed-observer',observerRecords:rows});
    assert.equal(verify(observerRecords),true);
    for(const mutate of [rows=>rows[0].ordinal=2,rows=>rows[0].caseId=observed.probe.caseId,
      rows=>rows[0].body=rows[2].body,rows=>[rows[0],rows[4]]=[rows[4],rows[0]],rows=>rows[0].status=500,
      rows=>rows[0].actorId='foreign-observer']) {
      const changed=structuredClone(observerRecords);mutate(changed);assert.throws(()=>verify(changed),/COMPLEX_TRANSPORT/);
    }
  }
});
