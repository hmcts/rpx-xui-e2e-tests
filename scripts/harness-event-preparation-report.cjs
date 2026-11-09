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
const preparationBatches = [[0,1],[2,3],[4,5],[6,7],[8,9],[10]].map(batch=>batch.map(index=>faults[index][2]));
const steps = ['startup','definition-import','identity-verification','runtime-observation','ownership-capture','transition-identity'];
const lifecycleInvocations = ['baseline','ccd-enable-judge-event','ccd-remove-courtadmin-recipient-read','ccd-remove-readonly-recipient-read','ccd-enable-readonly-recipient-update','ccd-remove-courtadmin-event-create','ccd-shape-recipient-collection','ccd-shape-case-field-recipient-selector','ccd-shape-required-delivery-radio','ccd-shape-conditional-email-complex','ccd-shape-postal-recipient-name','ccd-shape-optional-postal-line-two'];
const lifecycleSteps = ['browser-provider-setup','candidate-runtime-setup','application-readiness','playwright-proof','post-proof-resource-observation','candidate-graceful-shutdown','provider-graceful-shutdown','resource-cleanup'];
const providerSetupSteps = ['provider-container-create','provider-container-start','provider-readiness','provider-ownership-check','provider-egress-probes'];
const providerInitializationSteps = ['harness-source-validation','dependency-seal','browser-seal','candidate-seal','candidate-identity','configuration-source-validation','ccd-contract-validation','persona-session-preparation','gateway-startup'];
const failure = () => new Error('PUBLIC_EVENT_PREPARATION_TIMINGS_INVALID');
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
const phaseStatus = evidence => evidence?.phases?.find(phase => phase.phase === 'eventCapability')?.status;
const digestRunId = value => typeof value === 'string' && /^(?:ccd|candidate)-[a-f0-9-]{36}$/.test(value);
const validTimestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;

function validateProviderSetupDetails(details, status, durationMs) {
  assert(Array.isArray(details) && details.length === providerSetupSteps.length);
  let incomplete = false, failed = 0, elapsed = 0;
  details.forEach((item, index) => {
    assert(exactKeys(item, ['step','status','durationMs',...(Object.hasOwn(item,'initialization')?['initialization']:[])]));
    assert.equal(item.step, providerSetupSteps[index]);
    if (item.status === 'not-run') { assert.equal(item.durationMs, null); incomplete = true; return; }
    assert(['completed','failed'].includes(item.status) && !incomplete);
    assert(Number.isSafeInteger(item.durationMs) && item.durationMs >= 0 && item.durationMs <= 7_200_000);
    if (item.status === 'failed') { failed++; incomplete = true; }
    elapsed += item.durationMs;
    if (Object.hasOwn(item,'initialization')) {
      assert.equal(item.step,'provider-readiness');
      validateProviderInitialization(item.initialization,item.durationMs);
    }
  });
  assert(failed <= 1);
  assert(status !== 'completed' || details.every(item => item.status === 'completed'));
  assert(elapsed <= durationMs + details.length);
  return details;
}

function validateProviderInitialization(value, readinessDurationMs) {
  assert(exactKeys(value,['schemaVersion','proofAuthority','catalogueCredit','status','steps']));
  assert.equal(value.schemaVersion,1);
  assert.equal(value.proofAuthority,false);
  assert.equal(value.catalogueCredit,false);
  assert(['complete','partial','failed','not-run'].includes(value.status));
  assert(Array.isArray(value.steps)&&value.steps.length<=providerInitializationSteps.length);
  let prior=-1,failed=0;
  for(const row of value.steps){
    assert(exactKeys(row,['step','status','durationMs']));
    const index=providerInitializationSteps.indexOf(row.step);
    assert(index>prior);prior=index;
    assert(['completed','failed'].includes(row.status));
    assert(Number.isSafeInteger(row.durationMs)&&row.durationMs>=0&&row.durationMs<=7_200_000);
    assert(row.durationMs<=readinessDurationMs+1000);
    if(row.status==='failed')failed++;
  }
  if (failed) {
    const failedSeals = value.steps.some((row,index) => index < 3 && row.status === 'failed');
    const failedSequential = value.steps.some((row,index) => index >= 3 && row.status === 'failed');
    if (failedSeals) assert(value.steps.every(row => providerInitializationSteps.indexOf(row.step) < 3));
    if (failedSequential) {
      assert(!failedSeals);
      assert.equal(value.steps.filter(row => row.status === 'failed').length,1);
      assert.equal(value.steps.at(-1).status,'failed');
    }
  }
  assert.equal(value.status,failed?'failed':value.steps.length===providerInitializationSteps.length?'complete':value.steps.length?'partial':'not-run');
  return value;
}

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
    let priorBatch = -1;
    const lastStepByFault = new Map(), failedFaults = new Set();
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
      const batchIndex=preparationBatches.findIndex(batch=>batch.includes(row.invocationId));
      assert(faultIndex>=0&&stepIndex>=0&&batchIndex>=priorBatch&&!failedFaults.has(faultIndex));
      assert.equal(stepIndex,(lastStepByFault.get(faultIndex)??-1)+1);
      priorBatch=batchIndex;
      const expectedFault=faults[faultIndex], expectedStep=steps[stepIndex];
      assert.equal(row.invocationId,expectedFault[2]);
      assert.equal(row.step,expectedStep);
      lastStepByFault.set(faultIndex,stepIndex);
      if(row.status==='failed')failedFaults.add(faultIndex);
      scenarios[faultIndex].steps[stepIndex]={name:expectedStep,status:row.status,durationMs:row.durationMs};
    });
    for(const scenario of scenarios){let gap=false;for(const step of scenario.steps){if(gap){assert.equal(step.status,'not-run');assert.equal(step.durationMs,null);}if(step.status==='not-run'||step.status==='failed')gap=true;}}
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
    let completed=0,failed=0,batchBlocked=false;
    preparationBatches.forEach(batch=>{
      let batchIncomplete=false;
      for(const invocationId of batch){
        const index=faults.findIndex(([, , id])=>id===invocationId),scenario=value.scenarios[index];
        assert(exactKeys(scenario,['key','label','steps']));
        assert.deepEqual([scenario.key,scenario.label],faults[index].slice(0,2));
        assert.equal(scenario.steps.length,steps.length);
        let seenIncomplete=batchBlocked;
        scenario.steps.forEach((step,stepIndex)=>{
          assert(exactKeys(step,['name','status','durationMs']));
          assert.equal(step.name,steps[stepIndex]);
          if(step.status==='not-run'){
            assert.equal(step.durationMs,null);seenIncomplete=true;batchIncomplete=true;
          }else{
            assert(['completed','failed'].includes(step.status));
            assert(Number.isSafeInteger(step.durationMs)&&step.durationMs>=0&&step.durationMs<=7_200_000);
            assert(!seenIncomplete);
            if(step.status==='failed'){failed++;seenIncomplete=true;batchIncomplete=true;}else completed++;
          }
        });
      }
      if(batchIncomplete)batchBlocked=true;
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

function validateEventRuntimeLifecycleTimings(records, evidence) {
  try {
    assert(Array.isArray(records));
    const nativeStatus=phaseStatus(evidence);
    assert(['PASS','FAIL','BLOCKED'].includes(nativeStatus));
    assert(records.length<=lifecycleInvocations.length*lifecycleSteps.length);
    let runId,prior=-1,failedAt;
    const invocations=lifecycleInvocations.map(id=>({id,steps:lifecycleSteps.map(name=>({name,status:'not-run',durationMs:null}))}));
    records.forEach((row,index)=>{
      assert(exactKeys(row,row.step==='browser-provider-setup'?['sequence','runId','invocationId','step','status','startedAt','durationMs',...(Object.hasOwn(row,'details')?['details']:[])]:['sequence','runId','invocationId','step','status','startedAt','durationMs']));
      assert.equal(row.sequence,index+1);
      if(runId===undefined)runId=row.runId;
      assert.equal(row.runId,runId);
      assert(digestRunId(row.runId));
      assert(validTimestamp(row.startedAt));
      assert(Number.isSafeInteger(row.durationMs)&&row.durationMs>=0&&row.durationMs<=7_200_000);
      assert(['completed','failed'].includes(row.status));
      const invocationIndex=lifecycleInvocations.indexOf(row.invocationId),stepIndex=lifecycleSteps.indexOf(row.step),order=invocationIndex*lifecycleSteps.length+stepIndex;
      assert(invocationIndex>=0&&stepIndex>=0&&order>prior);prior=order;
      if(failedAt!==undefined)assert(invocationIndex===failedAt&&row.step==='resource-cleanup');
      if(row.status==='failed'){
        if(failedAt===undefined)failedAt=invocationIndex;
        else assert(row.step==='resource-cleanup'&&invocationIndex===failedAt);
      }
      invocations[invocationIndex].steps[stepIndex]={name:row.step,status:row.status,durationMs:row.durationMs,...(row.details===undefined?{}:{details:validateProviderSetupDetails(row.details,row.status,row.durationMs)})};
    });
    const all=invocations.flatMap(x=>x.steps),completedSteps=all.filter(x=>x.status==='completed').length,failedSteps=all.filter(x=>x.status==='failed').length,totalSteps=all.length;
    return {schemaVersion:1,phaseStatus:nativeStatus,status:failedSteps?'failed':completedSteps===totalSteps?'complete':completedSteps?'partial':'not-run',completedSteps,failedSteps,totalSteps,invocations};
  } catch { throw Error('PUBLIC_EVENT_LIFECYCLE_TIMINGS_INVALID'); }
}

function unavailableEventRuntimeLifecycleTimings(evidence) {
  return {schemaVersion:1,phaseStatus:phaseStatus(evidence),status:'unavailable',completedSteps:0,failedSteps:0,totalSteps:lifecycleInvocations.length*lifecycleSteps.length,invocations:lifecycleInvocations.map(id=>({id,steps:lifecycleSteps.map(name=>({name,status:'not-run',durationMs:null}))}))};
}

function validateEventRuntimeLifecycleSummary(value,evidence) {
  try {
    assert(exactKeys(value,['schemaVersion','phaseStatus','status','completedSteps','failedSteps','totalSteps','invocations']));
    assert.equal(value.schemaVersion,1);assert.equal(value.phaseStatus,phaseStatus(evidence));assert(['PASS','FAIL','BLOCKED'].includes(value.phaseStatus));
    assert(['complete','partial','failed','not-run','unavailable'].includes(value.status));assert.equal(value.totalSteps,lifecycleInvocations.length*lifecycleSteps.length);
    assert(Number.isSafeInteger(value.completedSteps)&&value.completedSteps>=0);assert(Number.isSafeInteger(value.failedSteps)&&value.failedSteps>=0);assert.equal(value.invocations.length,lifecycleInvocations.length);
    let complete=0,failed=0,firstFailure,cleanupSeen=false,gap=false;
    value.invocations.forEach((invocation,index)=>{
      assert(exactKeys(invocation,['id','steps']));assert.equal(invocation.id,lifecycleInvocations[index]);assert.equal(invocation.steps.length,lifecycleSteps.length);
      invocation.steps.forEach((step,stepIndex)=>{
        assert(exactKeys(step,step.name==='browser-provider-setup'?['name','status','durationMs',...(Object.hasOwn(step,'details')?['details']:[])]:['name','status','durationMs']));assert.equal(step.name,lifecycleSteps[stepIndex]);
          if(step.status==='not-run'){assert.equal(step.durationMs,null);if(firstFailure===undefined)gap=true;}
        else {
          assert(['completed','failed'].includes(step.status));assert(Number.isSafeInteger(step.durationMs)&&step.durationMs>=0&&step.durationMs<=7_200_000);
            if(step.status==='failed'){failed++;if(firstFailure===undefined)firstFailure=index;else assert(index===firstFailure&&step.name==='resource-cleanup'&&!cleanupSeen);}
            else {if(firstFailure!==undefined){assert(index===firstFailure&&step.name==='resource-cleanup'&&!cleanupSeen);cleanupSeen=true;}else assert(!gap);complete++;}
      }
      if (Object.hasOwn(step,'details')) validateProviderSetupDetails(step.details,step.status,step.durationMs);
      });
    });
    assert.equal(complete,value.completedSteps);assert.equal(failed,value.failedSteps);
    assert.equal(value.status,value.status==='unavailable'?'unavailable':failed?'failed':complete===value.totalSteps?'complete':complete?'partial':'not-run');
    if(value.status==='unavailable')assert.equal(complete+failed,0);
    return value;
  } catch { throw Error('PUBLIC_EVENT_LIFECYCLE_TIMINGS_INVALID'); }
}

function renderEventRuntimeLifecycleTimings(value) {
  const status=value.status==='complete'?'Every recorded invocation reached cleanup':value.status==='failed'?`${value.completedSteps} timed stages completed; one stage failed`:value.status==='partial'?`${value.completedSteps} stage timings were recorded; later stages did not run`:value.status==='unavailable'?'Lifecycle timings are unavailable; proof outcomes are unchanged':'No lifecycle timings were recorded';
  const rows=value.invocations.map(invocation=>`<tr><th scope="row">${invocation.id==='baseline'?'Baseline':invocation.id.replace(/^ccd-/,'').replaceAll('-',' ')}</th>${invocation.steps.map(step=>`<td data-step-status="${step.status}">${step.status==='not-run'?'Not recorded':`${step.status==='failed'?'Failed':'Completed'} · ${step.durationMs} ms`}${step.details?`<small class="harness-provider-breakdown">Provider setup breakdown:<br>${step.details.map(detail=>`${detail.step.replaceAll('-',' ')} · ${detail.status==='not-run'?'not run':`${detail.status} · ${detail.durationMs} ms`}${detail.initialization?`<br><span>Provider initializer breakdown (${detail.initialization.status}; no proof or catalogue credit):</span><br>${detail.initialization.steps.map(item=>`${item.step.replaceAll('-',' ')} · ${item.status} · ${item.durationMs} ms`).join('<br>')}`:''}`).join('<br>')}</small>`:''}</td>`).join('')}</tr>`).join('');
  return `<section id="harness-event-runtime-lifecycle" aria-labelledby="harness-event-runtime-lifecycle-title"><h2 id="harness-event-runtime-lifecycle-title">Source-event browser and candidate lifecycle timings</h2><p>${status} (${value.completedSteps}/${value.totalSteps}; event phase outcome ${value.phaseStatus}). The 12 rows cover one baseline and 11 fault scenarios. These diagnostic durations include the browser-provider and candidate setup/probes, application readiness request, Playwright proof, post-proof resource observations, candidate shutdown, provider shutdown, and owned-resource cleanup. The longer intervals include provider and candidate work, so they are not browser-only timings. Browser-provider setup is broken down into container create/start, readiness, ownership, and egress checks; its aggregate also includes resource registration and registry writes. Dependency, browser, and candidate seals run concurrently and are displayed in a stable order. These nested substeps are non-additive to the aggregate or event phase and provide no catalogue credit; lifecycle timing availability never changes proof status.</p><div class="table-responsive"><table class="table"><thead><tr><th>Invocation</th>${lifecycleSteps.map(x=>`<th>${x.replaceAll('-',' ')}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div></section>`;
}

module.exports={validateEventRuntimePreparationTimings,validateEventPreparationSummary,unavailableEventPreparationSummary,renderEventPreparationTimings,validateEventRuntimeLifecycleTimings,validateEventRuntimeLifecycleSummary,unavailableEventRuntimeLifecycleTimings,renderEventRuntimeLifecycleTimings};
