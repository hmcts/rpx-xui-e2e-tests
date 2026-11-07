const test = require('node:test');
const assert = require('node:assert/strict');
const load = () => import('./lib/exui-mandatory-email-event-observation.mjs');
const fixture = require('./fixtures/exui-mandatory-email-event-observation.mock.cjs');
test('coherently altered initial data is rejected against an independent full literal seed',async()=>{
  const api=await load();
  for(const variant of ['baseline','name-optional','address-optional']){
    const x=await fixture.packet(variant,variant==='address-optional'?'address':'name');
    api.validateMandatoryEmailObservation(x.observed,x.derivation,x.actorId);
    for(const c of [x.observed.filled,x.observed.empty])for(const s of [c.before,c.after])s.state.case_data.protectedValue='coherent wrong source control';
    assert.throws(()=>api.validateMandatoryEmailObservation(x.observed,x.derivation,x.actorId));
  }
});
test('baseline empty and filled controls each bind actual case identity and healthy initial state',async()=>{
  const api=await load();
  for(const key of ['id','case_type_id','jurisdiction','state','version']){
    const x=await fixture.packet('baseline','name');
    api.validateMandatoryEmailObservation(x.observed,x.derivation,x.actorId);
    for(const s of [x.observed.empty.before,x.observed.empty.after])s.state[key]=key==='version'?-1:key==='id'?'9999999999999999':'Foreign';
    assert.throws(()=>api.validateMandatoryEmailObservation(x.observed,x.derivation,x.actorId),key);
  }
});
test('sole final failed custom stage permits its nested expect but rejects unrelated failed stages',async()=>{
  const api=await load();
  const x=await fixture.packet('name-optional','name'),r=x.report.suites[0].specs[0].tests[0].results[0];
  r.steps[0].steps=[{title:'expect.toHaveURL',error:{message:'MANDATORY_EMAIL_NAME_REQUIRED_DENIAL'}}];
  api.validateMandatoryEmailFramework(x.report,x.terminal,'name-optional');
  r.steps.push({title:'harness-assertion:unrelated-failure',error:{message:'unrelated error'}});
  assert.throws(()=>api.validateMandatoryEmailFramework(x.report,x.terminal,'name-optional'));
  r.steps.pop();r.steps[0].steps.push({title:'expect.unrelated',error:{message:'unrelated'}});
  assert.throws(()=>api.validateMandatoryEmailFramework(x.report,x.terminal,'name-optional'));
  const baseline=await fixture.packet('baseline','name');baseline.report.suites[0].specs[0].tests[0].results[0].steps=[{title:'expect.failed',error:{message:'hidden failure'}}];
  assert.throws(()=>api.validateMandatoryEmailFramework(baseline.report,baseline.terminal,'baseline'));
});
test('one hard-assertion failure chain rejects sibling errors even with copied attribution IDs',async()=>{
  const api=await load(),x=await fixture.packet('name-optional','name');
  const r=x.report.suites[0].specs[0].tests[0].results[0],error={message:'MANDATORY_EMAIL_NAME_REQUIRED_DENIAL'};
  r.steps[0].steps=[{title:'expect.toHaveURL',error}];
  api.validateMandatoryEmailFramework(x.report,x.terminal,'name-optional');
  r.steps[0].steps.push({title:'expect.unrelated',error});
  assert.throws(()=>api.validateMandatoryEmailFramework(x.report,x.terminal,'name-optional'));
});
test('two baseline row observations and each consequential one-cell fault validate without credit', async () => {
  const api = await load();
  for (const variant of ['baseline','name-optional','address-optional']) {
    for (const row of variant === 'baseline' ? ['name','address'] : [variant.split('-')[0]]) {
      const x = await fixture.packet(variant,row);
      assert.equal(api.validateMandatoryEmailObservation(x.observed,x.derivation,x.actorId).catalogueCredit,false);
      assert.equal(api.validateMandatoryEmailFramework(x.report,x.terminal,variant).runtimeAcceptance,false);
    }
  }
});
test('ineffective optional, missing persistence, unrelated mutation and foreign actor cannot witness a fault', async () => {
  const api = await load();
  for (const mutate of [
    x => { x.observed.empty.after = structuredClone(x.observed.empty.before); },
    x => { x.observed.empty.after.state.case_data.sodAdditionalRecipientsList[0].value.emailInformation.emailName = 'not blank'; },
    x => { x.observed.filled.after.state.case_data.protectedValue = 'unrelated'; },
    x => { x.observed.filled.after.history.at(-1).user_id = 'foreign'; },
    x => { x.observed.empty.submission.status = 500; },
    x => { x.observed.controls.inactivePost = false; },
    x => { x.observed.controls.nameBeforeAddress = false; },
    x => { x.derivation.binding.rows[0].sourceIndex++; },
  ]) {
    const x = await fixture.packet('name-optional','name'); mutate(x);
    assert.throws(() => api.validateMandatoryEmailObservation(x.observed,x.derivation,x.actorId));
  }
});
test('baseline denial requires actual linked field error and unchanged full state', async () => {
  const api=await load();
  for (const mutate of [
    x => {x.observed.empty.error.forId='foreign';},
    x => {x.observed.empty.error.text='wrong';},
    x => {x.observed.empty.after.state.version++;},
    x => {x.observed.empty.path='/error';},
    x => {x.observed.empty.submission={status:201};},
  ]) { const x=await fixture.packet('baseline','address');mutate(x);assert.throws(()=>api.validateMandatoryEmailObservation(x.observed,x.derivation,x.actorId)); }
});
test('actual terminal and exactly named sole failed stage are necessary, not arbitrary framework red',async()=>{
  const api=await load();
  for(const mutate of [
    x=>{x.terminal.code=0;},x=>{x.terminal.signal='SIGTERM';},
    x=>{x.report.suites[0].specs[0].tests[0].results[0].steps[0].title='unrelated';},
    x=>{x.report.suites[0].specs[0].tests[0].results[0].errors.push({message:'extra'});},
    x=>{x.report.suites[0].specs[0].tests[0].results[0].retry=1;},
  ]){const x=await fixture.packet('name-optional','name');mutate(x);assert.throws(()=>api.validateMandatoryEmailFramework(x.report,x.terminal,'name-optional'));}
});
