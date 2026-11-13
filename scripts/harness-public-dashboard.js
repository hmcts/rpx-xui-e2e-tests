(() => {
  const coverage = document.querySelector('#harness-application-coverage');
  const metrics = document.querySelector('.report-metrics');
  if (!coverage || !metrics) return;
  const native = document.querySelector('#harness-native-evidence');
  const run = document.querySelector('#harness-public-run');
  const nativeStatus = native?.dataset.nativeStatus || 'NOT_RUN';
  const info = document.querySelector('#TabDashboard .testcase-run-info-table');
  const infoValue = (label) => [...(info?.querySelectorAll('tr') || [])]
    .find((row) => row.querySelector('th')?.textContent.trim() === label)
    ?.querySelector('td')?.textContent.trim() || 'Not recorded';
  const diagnosticTime = infoValue('Diagnostic execution time');
  const assuranceElapsed = run?.dataset.assuranceElapsedMs;
  const assuranceMs = assuranceElapsed === undefined || !/^(0|[1-9]\d*)$/.test(assuranceElapsed) ? NaN : Number(assuranceElapsed);
  const preparationTiming = run?.dataset.assuranceVersion === '2' && run.dataset.assuranceScope === 'harness-preparation-start-to-report-snapshot';
  const assuranceScopeValid = preparationTiming || (run?.dataset.assuranceVersion === '1' && run.dataset.assuranceScope === 'assurance-start-to-report-snapshot');
  const assuranceTime = assuranceScopeValid && run.dataset.assuranceClock === 'monotonic' && Number.isSafeInteger(assuranceMs)
    ? `${Math.floor(assuranceMs / 60000)}m ${((assuranceMs % 60000) / 1000).toFixed(3)}s` : 'Not recorded';

  const accepted = [...document.querySelectorAll('#harness-catalogue-breakdown [data-catalogue-kind]')]
    .reduce((sum, row) => sum + Number(row.dataset.catalogueAccepted), 0);
  const selected = Number(coverage.dataset.runtimeObligations);
  const baselines = native?.querySelectorAll('[data-native-table="baseline"] tr[data-native-phase]').length || 0;
  const faults = native?.querySelectorAll('[data-native-table="fault"] tr[data-native-phase]').length || 0;
  const nativeElapsed = Number(run?.dataset.nativeElapsedMs);
  const nativeTime = Number.isSafeInteger(nativeElapsed) && nativeElapsed > 0
    ? ` · ${(nativeElapsed / 60000).toFixed(1)} min recorded native interval` : '';
  const diagnosticTotal = Number(metrics.querySelector('.metric-0 strong')?.textContent || 0);
  const diagnosticPassRate = metrics.querySelector('.metric-1 strong')?.textContent.trim() || '—';
  const diagnosticAttention = metrics.querySelector('.metric-2 strong')?.textContent.trim() || '—';
  const supplements = [];
  const renderer = document.querySelector('#harness-shared-nested-attempt');
  const profile = document.querySelector('#harness-divorce-profile-admission');
  const applicant = document.querySelector('#harness-applicant-compatibility');
  if (renderer) {
    const data = renderer.dataset;
    supplements.push(['Shared nested renderer', data.attemptStatus,
      `${data.attemptBaselinesCompleted} baseline facets completed · ${data.attemptBaselinesPassed} passed · ${data.attemptBaselinesFailed} failed`,
      `${data.attemptFaultsCompleted} effective faults · ${data.attemptFaultsNotRun} not run · No catalogue credit`,
      '#harness-shared-nested-attempt']);
  }
  if (profile) {
    const data = profile.dataset;
    const duration = data.profileDurationMs === undefined ? null : Number(data.profileDurationMs);
    const profileTime = Number.isSafeInteger(duration) && duration >= 0
      ? `${Math.floor(duration / 60000)}m ${Math.floor(duration % 60000 / 1000)}s` : 'not recorded';
    supplements.push(['DIVORCE configuration profile', data.profileStatus,
      `${data.profileBaselines} baselines · ${data.profileFaults} effective faults`,
      data.profileInclusion === 'included' ? `${data.profileAccepted} requirement already included in main candidate coverage` : `${data.profileAccepted} / ${data.profileSelected} requirement accepted in this separate run`,
      '#harness-divorce-profile-admission',
      `Separate profile interval: ${profileTime} · excluded from recorded native interval`]);
  }
  const profileAttempt = document.querySelector('#harness-divorce-profile-attempt');
  if(profileAttempt)supplements.push(['DIVORCE profile not admitted',profileAttempt.dataset.profileAttemptStatus,'Completed proof counts unavailable','No catalogue or release credit','#harness-divorce-profile-attempt']);
  if (applicant) {
    const data = applicant.dataset;
    supplements.push(['Applicant result columns', data.compatibilityStatus,
      `${data.compatibilityBaselines} baseline · ${data.compatibilityFaults} effective faults`,
      'Corrected local ARM64 CCD · No main catalogue credit',
      '#harness-applicant-compatibility']);
  }
  const personal = document.querySelector('#harness-personal-service-admission');
  if (personal) {
    const data = personal.dataset;
    const duration = data.personalDurationMs === undefined ? null : Number(data.personalDurationMs);
    const pairTime = Number.isSafeInteger(duration) && duration >= 0
      ? `${Math.floor(duration / 60000)}m ${Math.floor(duration % 60000 / 1000)}s` : 'not recorded';
    supplements.push(['Personal-service event row', data.personalStatus,
      `${data.personalBaselines} baseline · ${data.personalEffectiveFaults} effective fault`,
      data.personalInclusion === 'included' ? `${data.personalAccepted} requirement already included in main candidate coverage` : `${data.personalAccepted} / ${data.personalTotal} requirement accepted in this separate run`,
      '#harness-personal-service-admission', `Personal pair interval: ${pairTime} · excluded from recorded native interval`]);
  }
  const stCic = document.querySelector('#harness-st-cic-profile-admission');
  if (stCic) {
    const data = stCic.dataset;
    const valid = data.stCicStatus === 'PASS' && data.stCicBaselines === '5' && data.stCicEffectiveFaults === '5' && data.stCicExecutions === '10' &&
      ((data.stCicInclusion === 'included' && data.stCicCredited === '1') || (data.stCicInclusion === 'separate' && data.stCicCredited === '0'));
    supplements.push(['ST_CIC bounded profile', valid ? 'PASS' : 'Not recorded',
      valid ? '5 baseline results · 5 effective fault detections · 10 standalone executions' : 'Execution counts not recorded',
      valid ? data.stCicInclusion === 'included' ? '1 requirement already included once in candidate coverage' : 'Separate packet; no requirement added to candidate coverage' : 'Admission counts not recorded',
      '#harness-st-cic-profile-admission', 'ST_CIC duration not recorded separately; no per-facet durations or traces recorded']);
  }
  const mandatoryEmail = document.querySelector('#harness-mandatory-email-admission');
  if (mandatoryEmail) {
    const data = mandatoryEmail.dataset;
    const valid = data.mandatoryEmailStatus === 'PASS' && data.mandatoryEmailBaselines === '2' && data.mandatoryEmailEffectiveFaults === '2' && data.mandatoryEmailExecutions === '3' &&
      ((data.mandatoryEmailInclusion === 'included' && data.mandatoryEmailCredited === '2') || (data.mandatoryEmailInclusion === 'separate' && data.mandatoryEmailCredited === '0'));
    const rawTime = mandatoryEmail.querySelector('[data-mandatory-email-timing]')?.dataset.mandatoryEmailTiming;
    const duration = typeof rawTime === 'string' && /^(0|[1-9][0-9]*)$/.test(rawTime) ? Number(rawTime) : null;
    const time = Number.isSafeInteger(duration) && duration >= 0 ? `${Math.floor(duration / 60000)}m ${Math.floor(duration % 60000 / 1000)}s` : 'Not recorded';
    supplements.push(['Mandatory email source rows', valid ? 'PASS' : 'Not recorded',
      valid ? '2 baseline results · 2 named fault results · 3 executions' : 'Execution counts not recorded',
      valid ? data.mandatoryEmailInclusion === 'included' ? '2 requirements already included once each in candidate coverage' : 'Separate packet; no requirements added to candidate coverage' : 'Admission counts not recorded',
      '#harness-mandatory-email-admission', `Admission call elapsed: ${valid ? time : 'Not recorded'} · excluded from recorded native interval; no per-proof durations recorded`]);
  }
  const personalAttempt = document.querySelector('#harness-personal-service-attempt');
  if (personalAttempt) {
    const duration = Number(personalAttempt.dataset.personalAttemptDurationMs);
    supplements.push(['Personal-service event row not admitted', personalAttempt.dataset.personalAttemptStatus,
      'Completed proof counts unavailable', 'No additional catalogue or release credit', '#harness-personal-service-attempt',
      Number.isSafeInteger(duration) && duration >= 0 ? `Observed attempt interval: ${Math.floor(duration / 60000)}m ${Math.floor(duration % 60000 / 1000)}s` : 'Attempt duration not recorded']);
  }
  const complex = document.querySelector('#harness-complex-email-admission');
  if (complex) {
    const data = complex.dataset;
    const interval = Number(data.complexDurationMs);
    const observed = Number.isSafeInteger(interval) && interval >= 0
      ? `${Math.floor(interval / 60000)}m ${Math.floor(interval % 60000 / 1000)}s` : 'not recorded';
    supplements.push(['ComplexTypes email address', data.complexStatus,
      `${data.complexBrowserContexts} browser invocations · ${data.complexMappingContexts} mapping contexts · ${data.complexEffectiveFaults} effective faults`,
      data.complexInclusion === 'included' ? '1 requirement already included in candidate coverage' : '1 requirement verified separately; excluded from main coverage',
      '#harness-complex-email-admission', `Cohort interval: ${observed} · source reproduction included · excluded from recorded native interval`]);
  }
  const complexAttempt = document.querySelector('#harness-complex-email-attempt');
  if (complexAttempt) supplements.push(['ComplexTypes email address', 'NOT_RUN', 'No execution counts',
    'Requirement remains unaccepted in this run', '#harness-complex-email-attempt']);
  for (const [id, label] of [['#harness-fr-profile-attempt', 'FR'], ['#harness-cmc-profile-attempt', 'CMC']]) {
    const attempt = document.querySelector(id);
    if (attempt) supplements.push([`${label} profile attempt`, attempt.dataset.profileAttemptStatus, 'Completed proof counts unavailable', 'No catalogue or release credit', id]);
  }
  const cards = [
    ['Catalogue runtime evidence', `${accepted} / ${selected}`, `${selected - accepted} awaiting accepted evidence`, '#harness-application-coverage'],
    [supplements.length ? 'Main native proof outcomes' : 'Native proof outcomes', native ? `${baselines} + ${faults}` : 'Not run', native ? `${nativeStatus} · ${baselines} baseline · ${faults} deliberate faults${nativeTime} · Core native, attached ST_CIC and evidence verification; excludes personal-service, ComplexTypes, DIVORCE, ${mandatoryEmail ? 'mandatory email admission, ' : ''}diagnostics and Build self-checks` : 'Candidate and CCD checks not attached', native ? '#harness-native-evidence' : null],
    ['Diagnostic tests', String(diagnosticTotal), `${diagnosticPassRate} pass rate · ${diagnosticAttention} need attention · ${diagnosticTime}`, '#TabTests'],
    ['Release approval', 'Unavailable', 'Catalogue and deployment gaps remain', '#harness-application-coverage'],
  ];
  if (native) {
    const oldTiming = metrics.querySelector('.metric-3');
    if (oldTiming?.children?.length >= 3) {
      oldTiming.children[0].textContent = 'Diagnostic duration';
      oldTiming.children[2].textContent = 'Playwright diagnostics only; Harness timing below';
    }
  }
  const harnessMetrics = document.createElement('section');
  harnessMetrics.className = 'report-metrics harness-assurance-summary';
  harnessMetrics.setAttribute('aria-label', 'Harness evidence at a glance');
  cards.forEach(([label, value, detail, href], index) => {
    const card = document.createElement(href ? 'a' : 'div');
    card.className = `report-metric metric-${index}`;
    if (href) card.href = href;
    if (index === 1) card.dataset.nativeStatus = nativeStatus;
    if (index === 2 && diagnosticAttention !== '0') card.classList.add('has-attention');
    [label, value, detail].forEach((content, part) => {
      const element = document.createElement(part === 1 ? 'strong' : 'span');
      element.textContent = content;
      card.append(element);
    });
    harnessMetrics.append(card);
  });
  const elapsedSummary = document.createElement('section');
  elapsedSummary.className = 'report-metric report-supplement-summary report-assurance-elapsed';
  const elapsedLabel = preparationTiming ? 'Harness preparation → report snapshot' : 'Harness elapsed to report';
  const elapsedNote = preparationTiming ? 'Harness preparation start → report snapshot. Includes runtime, input, candidate build and browser preparation, selected assurance phases, evidence verification and diagnostics. Excludes earlier Jenkins shell/bootstrap, checkout/build/queue outside this invocation and report sealing/validation/publication after snapshot.' : 'Assurance start → report snapshot. Includes selected assurance phases, evidence verification and diagnostics. Excludes report sealing/publication after snapshot, wrapper bookkeeping and Jenkins checkout/build/queue.';
  elapsedSummary.setAttribute('aria-label', elapsedLabel);
  [['h2', elapsedLabel], ['strong', assuranceTime], ['p', elapsedNote]].forEach(([tag, content]) => {
    const element = document.createElement(tag);
    element.textContent = content;
    elapsedSummary.append(element);
  });
  harnessMetrics.append(elapsedSummary);
  const build = document.querySelector('#harness-build-self-check-summary');
  if (build) {
    const data = build.dataset, status = data.buildSelfCheckStatus;
    const keys = ['tests','passed','failed','cancelled','skipped','todo'];
    const raw = keys.map(key => data['buildSelfCheck' + key[0].toUpperCase() + key.slice(1)]);
    const counts = raw.map(value => typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : NaN);
    const knownCounts = counts.every(Number.isSafeInteger), missingCounts = raw.every(value => value === undefined);
    const wall = Number(data.buildSelfCheckWallMs);
    const knownWall = typeof data.buildSelfCheckWallMs === 'string' && String(wall) === data.buildSelfCheckWallMs && Number.isFinite(wall) && wall >= 0;
    const validCounts = knownCounts && counts[0] > 0 && counts[0] === counts.slice(1).reduce((sum,value) => sum + value,0);
    const valid = status === 'not-collected' ? missingCounts && data.buildSelfCheckWallMs === undefined : knownWall && (
      (validCounts && ((status === 'passed' && counts[2] === 0 && counts[3] === 0) || (status === 'failed' && counts[2] > 0 && counts[3] === 0) || (status === 'incomplete' && counts[3] > 0))) ||
      (status === 'incomplete' && missingCounts));
    const measure = document.createElement('a');
    measure.className = 'report-metric report-supplement-summary report-build-self-checks';
    measure.href = '#harness-build-self-check-details';
    const label = valid ? status === 'not-collected' ? 'Not collected' : status.toUpperCase() : 'Not recorded';
    const outcome = valid && validCounts ? `${counts[0]} Node tests · ${counts[1]} passed · ${counts[2]} failed · ${counts[3]} cancelled · ${counts[4]} skipped · ${counts[5]} todo` : 'Counts not recorded';
    const duration = valid && knownWall ? `${Math.floor(wall / 60000)}m ${((wall % 60000) / 1000).toFixed(3)}s` : 'Not recorded';
    [['span','Build self-checks'],['strong',label],['span',outcome],['span',`Build unit collector wall time: ${duration}`],['span','Separate Harness correctness checks; counts and duration are not additive to diagnostics, native executions or catalogue requirements. TypeScript and ESLint results are not represented.']].forEach(([tag,content]) => {
      const element = document.createElement(tag);
      element.textContent = content;
      measure.append(element);
    });
    harnessMetrics.append(measure);
  }
  if (supplements.length) {
    const summary = document.createElement('section');
    summary.className = 'report-supplement-summary';
    summary.setAttribute('aria-label', 'Additional runtime activity');
    const heading = document.createElement('h2');
    heading.textContent = 'Additional runtime activity';
    const explanation = document.createElement('p');
    explanation.textContent = 'Separate execution counts and durations. Supplementary requirements enter the catalogue total only when jointly admitted. Open each result for its evidence and limits.';
    const links = document.createElement('div');
    links.className = 'report-supplement-links';
    supplements.forEach(([label, status, counts, scope, href, timing]) => {
      const link = document.createElement('a');
      link.href = href;
      link.dataset.supplementStatus = status;
      [label, status, counts, ...(timing ? [timing] : []), scope].forEach((content, index) => {
        const element = document.createElement(index === 0 ? 'strong' : 'span');
        if (index === 1) element.className = 'report-supplement-status';
        element.textContent = content;
        link.append(element);
      });
      links.append(link);
    });
    summary.append(heading, explanation, links);
    harnessMetrics.append(summary);
  }
  const map = document.createElement('nav');
  map.className = 'report-coverage-map';
  map.setAttribute('aria-label', 'Explore Harness coverage');
  [
    ['Test lanes', '#harness-lanes', '#harness-lanes tbody tr[data-lane]'],
    ['Named slices', '#harness-slices', '#harness-slices tr[data-harness-slice]'],
    ['Service labels', '#harness-coverage-services', '[data-coverage-dimension="services"] tbody tr'],
    ['Jurisdiction labels', '#harness-coverage-jurisdictions', '[data-coverage-dimension="jurisdictions"] tbody tr'],
    ['Case type labels', '#harness-coverage-caseTypes', '[data-coverage-dimension="caseTypes"] tbody tr'],
  ].forEach(([label, href, selector]) => {
    const link = document.createElement('a');
    link.href = href;
    const count = document.createElement('strong');
    count.textContent = String(document.querySelectorAll(selector).length);
    const name = document.createElement('span');
    name.textContent = label;
    link.append(count, name);
    map.append(link);
  });
  const note = document.createElement('p');
  note.className = 'report-metrics-note';
  note.textContent = 'Separate measures; counts are not additive. Service, jurisdiction and case type labels describe diagnostic associations, while accepted runtime evidence appears in the catalogue card.';
  harnessMetrics.append(map, note);
  const timeline = document.querySelector('#harness-phase-timings');
  document.querySelector('#TabDashboard').after(harnessMetrics);
  if (timeline) harnessMetrics.after(timeline);
})();
