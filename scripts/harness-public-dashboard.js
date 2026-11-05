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
  const accepted = [...document.querySelectorAll('#harness-catalogue-breakdown [data-catalogue-kind]')]
    .reduce((sum, row) => sum + Number(row.dataset.catalogueAccepted), 0);
  const selected = Number(coverage.dataset.runtimeObligations);
  const baselines = native?.querySelectorAll('[data-native-table="baseline"] tr[data-native-phase]').length || 0;
  const faults = native?.querySelectorAll('[data-native-table="fault"] tr[data-native-phase]').length || 0;
  const nativeElapsed = Number(run?.dataset.nativeElapsedMs);
  const nativeTime = Number.isFinite(nativeElapsed) && nativeElapsed > 0
    ? ` · ${(nativeElapsed / 60000).toFixed(1)} min main native + evidence verification` : '';
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
      `Separate profile interval: ${profileTime} · excluded from main native duration`]);
  }
  if (applicant) {
    const data = applicant.dataset;
    supplements.push(['Applicant result columns', data.compatibilityStatus,
      `${data.compatibilityBaselines} baseline · ${data.compatibilityFaults} effective faults`,
      'Corrected local ARM64 CCD · No main catalogue credit',
      '#harness-applicant-compatibility']);
  }
  const cards = [
    ['Catalogue runtime evidence', `${accepted} / ${selected}`, `${selected - accepted} awaiting accepted evidence`, '#harness-application-coverage'],
    [supplements.length ? 'Main native proof outcomes' : 'Native proof outcomes', native ? `${baselines} + ${faults}` : 'Not run', native ? `${nativeStatus} · ${baselines} baseline · ${faults} deliberate faults${nativeTime}` : 'Candidate and CCD checks not attached', native ? '#harness-native-evidence' : null],
    ['Diagnostic tests', String(diagnosticTotal), `${diagnosticPassRate} pass rate · ${diagnosticAttention} need attention · ${diagnosticTime}`, '#TabTests'],
    ['Release approval', 'Unavailable', 'Catalogue and deployment gaps remain', '#harness-application-coverage'],
  ];
  metrics.replaceChildren();
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
    metrics.append(card);
  });
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
      [label, status, counts, ...(timing ? [timing] : []), scope, 'View evidence →'].forEach((content, index) => {
        const element = document.createElement(index === 0 ? 'strong' : 'span');
        if (index === 1) element.className = 'report-supplement-status';
        element.textContent = content;
        link.append(element);
      });
      links.append(link);
    });
    summary.append(heading, explanation, links);
    metrics.append(summary);
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
  metrics.append(map, note);
  const timeline = document.querySelector('#harness-phase-timings');
  if (timeline) metrics.after(timeline);
})();
