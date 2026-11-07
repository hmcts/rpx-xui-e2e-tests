const assert = require('node:assert/strict');

const faults = [
  ['judge-event-enabled','Judge event enabled','ccd-enable-judge-event'],
  ['courtadmin-recipient-read-removed','Court administrator recipient read removed','ccd-remove-courtadmin-recipient-read'],
  ['readonly-recipient-read-removed','Read only recipient read removed','ccd-remove-readonly-recipient-read'],
  ['readonly-recipient-update-enabled','Read only recipient update enabled','ccd-enable-readonly-recipient-update'],
  ['courtadmin-event-create-removed','Court administrator event creation removed','ccd-remove-courtadmin-event-create'],
  ['recipient-collection-shape','Recipient collection shape','ccd-shape-recipient-collection'],
  ['case-field-recipient-selector-shape','Case field recipient selector shape','ccd-shape-case-field-recipient-selector'],
  ['required-delivery-radio-shape','Required delivery radio shape','ccd-shape-required-delivery-radio'],
  ['conditional-email-complex-shape','Conditional email complex shape','ccd-shape-conditional-email-complex'],
  ['postal-recipient-name-shape','Postal recipient name shape','ccd-shape-postal-recipient-name'],
  ['optional-postal-line-two-shape','Optional second postal line shape','ccd-shape-optional-postal-line-two'],
];
const steps = ['startup','definition-import','identity-verification','runtime-observation','ownership-capture','transition-identity'];
const failure = () => new Error('PUBLIC_EVENT_PREPARATION_TIMINGS_INVALID');
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
const phaseStatus = evidence => evidence?.phases?.find(phase => phase.phase === 'eventCapability')?.status;
const digestRunId = value => typeof value === 'string' && /^(?:ccd|candidate)-[a-f0-9-]{36}$/.test(value);
const validTimestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;

function validateEventRuntimePreparationTimings(records, evidence) {
  try {
    assert(Array.isArray(records));
    const nativeStatus = phaseStatus(evidence);
    assert(['PASS','FAIL','BLOCKED'].includes(nativeStatus));
    assert(records.length <= faults.length * steps.length);
    let runId;
    const scenarios = faults.map(([key,label]) => ({
      key, label,
      steps: steps.map(name => ({name,status:'not-run',durationMs:null})),
    }));
    let priorFaultStep = -1;
    records.forEach((row,index) => {
      assert(exactKeys(row,['sequence','runId','invocationId','step','status','startedAt','durationMs']));
      assert.equal(row.sequence,index+1);
      if(runId===undefined)runId=row.runId;
      assert.equal(row.runId,runId);
      assert(digestRunId(row.runId));
      assert(validTimestamp(row.startedAt));
      assert(Number.isSafeInteger(row.durationMs)&&row.durationMs>=0&&row.durationMs<=7_200_000);
      assert(['completed','failed'].includes(row.status));
      const faultIndex=faults.findIndex(([, , invocationId])=>invocationId===row.invocationId);
      const stepIndex=steps.indexOf(row.step);
      const order=faultIndex*steps.length+stepIndex;
      assert(faultIndex>=0&&stepIndex>=0&&order>priorFaultStep);
      priorFaultStep=order;
      const expectedFault=faults[faultIndex], expectedStep=steps[stepIndex];
      assert.equal(row.invocationId,expectedFault[2]);
      assert.equal(row.step,expectedStep);
      assert(row.status!=='failed'||index===records.length-1);
      scenarios[faultIndex].steps[stepIndex]={name:expectedStep,status:row.status,durationMs:row.durationMs};
    });
    let firstGap=false;
    for(const scenario of scenarios)for(const step of scenario.steps){
      if(firstGap){step.status='not-run';step.durationMs=null;}
      if(step.status==='not-run'||step.status==='failed')firstGap=true;
    }
    const visibleSteps=scenarios.flatMap(scenario=>scenario.steps);
    const completedSteps=visibleSteps.filter(step=>step.status==='completed').length;
    const failedSteps=visibleSteps.filter(step=>step.status==='failed').length;
    const complete=completedSteps===faults.length*steps.length&&!failedSteps;
    return {
      schemaVersion:1,
      phaseStatus:nativeStatus,
      status:failedSteps?'failed':complete?'complete':completedSteps?'partial':'not-run',
      completedSteps,
      failedSteps,
      totalSteps:faults.length*steps.length,
      scenarios,
    };
  } catch {
    throw failure();
  }
}

function unavailableEventPreparationSummary(evidence) {
  return {
    schemaVersion:1,
    phaseStatus:phaseStatus(evidence),
    status:'unavailable',
    completedSteps:0,
    failedSteps:0,
    totalSteps:faults.length*steps.length,
    scenarios:faults.map(([key,label])=>({key,label,steps:steps.map(name=>({name,status:'not-run',durationMs:null}))})),
  };
}

function validateEventPreparationSummary(value,evidence) {
  try {
    assert(exactKeys(value,['schemaVersion','phaseStatus','status','completedSteps','failedSteps','totalSteps','scenarios']));
    assert.equal(value.schemaVersion,1);
    assert.equal(value.phaseStatus,phaseStatus(evidence));
    assert(['PASS','FAIL','BLOCKED'].includes(value.phaseStatus));
    assert(['complete','partial','failed','not-run','unavailable'].includes(value.status));
    assert.equal(value.totalSteps,faults.length*steps.length);
    assert(Number.isSafeInteger(value.completedSteps)&&value.completedSteps>=0);
    assert(Number.isSafeInteger(value.failedSteps)&&value.failedSteps>=0);
    assert.equal(value.scenarios.length,faults.length);
    let completed=0,failed=0,seenIncomplete=false;
    value.scenarios.forEach((scenario,index)=>{
      assert(exactKeys(scenario,['key','label','steps']));
      assert.deepEqual([scenario.key,scenario.label],faults[index].slice(0,2));
      assert.equal(scenario.steps.length,steps.length);
      scenario.steps.forEach((step,stepIndex)=>{
        assert(exactKeys(step,['name','status','durationMs']));
        assert.equal(step.name,steps[stepIndex]);
        if(step.status==='not-run'){
          assert.equal(step.durationMs,null);seenIncomplete=true;
        }else{
          assert(['completed','failed'].includes(step.status));
          assert(Number.isSafeInteger(step.durationMs)&&step.durationMs>=0&&step.durationMs<=7_200_000);
          assert(!seenIncomplete);
          if(step.status==='failed'){
            failed++;
            seenIncomplete=true;
          }else completed++;
        }
      });
    });
    assert.equal(completed,value.completedSteps);assert.equal(failed,value.failedSteps);
    assert.equal(value.status,value.status==='unavailable'?'unavailable':failed?'failed':completed===value.totalSteps?'complete':completed?'partial':'not-run');
    if(value.status==='unavailable')assert.equal(completed+failed,0);
    return value;
  } catch {
    throw failure();
  }
}

function renderEventPreparationTimings(value) {
  const report=value;
  const status=report.status==='complete'?'All 66 preparation steps were recorded':report.status==='failed'?`${report.completedSteps} recorded as completed; a preparation step was recorded as failed`:
    report.status==='partial'?`${report.completedSteps} preparation steps recorded; ${report.totalSteps-report.completedSteps-report.failedSteps} were not recorded`:report.status==='unavailable'?'Preparation timing records are unavailable; native evidence is unaffected':'No fault-runtime preparation timings were recorded';
  const cells=report.scenarios.map(scenario=>`<tr data-event-preparation-fault="${scenario.key}"><th scope="row">${scenario.label}</th>${scenario.steps.map(step=>`<td data-step-status="${step.status}">${step.status==='not-run'?'Not recorded':`${step.status==='failed'?'Failed':'Completed'} · ${step.durationMs} ms`}</td>`).join('')}</tr>`).join('');
  return `<section id="harness-event-preparation-timings" aria-labelledby="harness-event-preparation-timings-title"><h2 id="harness-event-preparation-timings-title">CCD source-event fault-runtime preparation</h2><p>${status} (${report.completedSteps}/${report.totalSteps}; phase outcome ${report.phaseStatus}). Each cell times only one of six preparation/observation substeps per fault. Acknowledgements, proof execution, and other source-event phase work are outside this table. These substeps are nested within the source-event phase, are not additive to its duration, and provide no additional catalogue evidence.</p><div class="table-responsive"><table class="table"><thead><tr><th>Fault scenario</th>${steps.map(step=>`<th>${step.replaceAll('-',' ')}</th>`).join('')}</tr></thead><tbody>${cells}</tbody></table></div></section>`;
}

module.exports={validateEventRuntimePreparationTimings,validateEventPreparationSummary,unavailableEventPreparationSummary,renderEventPreparationTimings};
