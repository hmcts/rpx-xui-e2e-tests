/* Public Odhín accepts reviewed declarations and execution scalars only. */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { setImmediate: nextTurn } = require("node:timers/promises");
const overview = require("./harness-public-overview.cjs");
const checkMethods = require("./harness-public-check-steps.cjs");
const checkDetails = require("./harness-public-check-details.cjs");
const eventPreparationReport = require("./harness-event-preparation-report.cjs");
const { calculateNativePhaseIntervals } = require("./lib/native-phase-intervals.cjs");
const fixture = { selections: overview.profiles };
const Generate = require("odhin-reports-playwright/lib/generate").default;
const { parse } = require("node-html-parser");
const { applyPresentation } = require("./odhin-presentation/enhance.cjs");

const statuses = ["passed", "failed", "skipped", "timedOut"];
const nativePhaseLabels = ["WA family", "Scope fault candidate preparation", "WA organisation scope", "CCD runtime startup", "CCD configuration and access", "CCD runtime cleanup", "Source event CCD runtime startup", "CCD source event permissions", "Source event CCD runtime cleanup", "Application routing", "Recipient callback CCD runtime startup", "Recipient callback validation and persistence", "Recipient callback CCD runtime cleanup", "Selector CCD baseline preparation", "Selector baseline proof and cleanup", "Selector CCD fault preparation", "Selector fault proof and cleanup", "Selector evidence verification", "Selector final cleanup", "Selector cohort admission", "Native evidence and interpreter verification"];
const proofPhases = new Map([["WA family", "family"], ["WA organisation scope", "scope"], ["CCD configuration and access", "ccd"], ["CCD source event permissions", "eventCapability"], ["Application routing", "routing"], ["Recipient callback validation and persistence", "recipientCallback"], ["Selector cohort admission", "selectorEventRow"]]);
// Pinned odhin-reports-playwright 1.1.8 has callback loading, with no readiness promise.
const templateFields = [
  "base",
  "runInfo",
  "chart",
  "chartInfo",
  "chartStatus",
  "chartFile",
  "chartProject",
  "chartJs",
  "content",
  "summary",
  "summaryRow",
  "testCaseTemplate",
  "testCaseDetailsTemplate",
  "cssThemeLight",
  "cssThemeDark",
  "cssThemeCustom",
  "cssColors",
  "css",
  "jqueryDataTablesCss",
  "bootstrapCss",
  "prismCss",
  "imgComparisonSliderCss",
  "jQuery",
  "js",
  "themeJs",
  "chartJsLibrary",
  "jqueryDataTablesJs",
  "dataTables",
  "bootstrapJs",
  "prismJs",
  "imgComparisonSliderJs",
];
const digest = (bytes) =>
  crypto.createHash("sha256").update(bytes).digest("hex");
const htmlEscape = (text) =>
  text.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const key = (entry) => JSON.stringify([entry.file, entry.titlePath]);
const failure = () => new Error("PUBLIC_ODHIN_INVALID_OR_INCOMPLETE");
const assuranceTimingScopes = {1:'assurance-start-to-report-snapshot',2:'harness-preparation-start-to-report-snapshot'};
const assuranceTimingNote = 'Assurance sequence start → report snapshot. Includes selected assurance phases, evidence verification and diagnostics. Excludes report sealing/publication after snapshot, wrapper bookkeeping and Jenkins checkout/build/queue.';
function validateAssuranceTiming(timing) {
  if (timing === undefined) return;
  if (!timing || typeof timing !== 'object' || Array.isArray(timing) ||
    JSON.stringify(Object.keys(timing).sort()) !== JSON.stringify(['clock','elapsedMs','schemaVersion','scope','startedAt']) ||
    ![1,2].includes(timing.schemaVersion) || timing.scope !== assuranceTimingScopes[timing.schemaVersion] || timing.clock !== 'monotonic' ||
    !Number.isSafeInteger(timing.elapsedMs) || timing.elapsedMs < 0 || typeof timing.startedAt !== 'string' ||
    new Date(timing.startedAt).toISOString() !== timing.startedAt) throw failure();
}
function assuranceTimingAttributes(timing) {
  validateAssuranceTiming(timing);
  return timing === undefined ? '' : ` data-assurance-version="${timing.schemaVersion}" data-assurance-scope="${timing.scope}" data-assurance-clock="monotonic" data-assurance-started-at="${timing.startedAt}" data-assurance-elapsed-ms="${timing.elapsedMs}"`;
}
function assuranceRunInfo(timing) {
  const preparation = timing?.schemaVersion === 2;
  return [
    [preparation ? 'Harness preparation → report snapshot' : 'Harness elapsed to report', timing === undefined ? 'Not recorded' : `${Math.floor(timing.elapsedMs / 60000)}m ${((timing.elapsedMs % 60000) / 1000).toFixed(3)}s`],
    [preparation ? 'Preparation started at' : 'Assurance started at', timing?.startedAt ?? 'Not recorded'],
    ['Assurance timing scope', preparation ? 'Harness preparation start → report snapshot. Includes runtime, input, candidate build and browser preparation, selected assurance phases, evidence verification and diagnostics. Excludes earlier Jenkins shell/bootstrap, checkout/build/queue outside this invocation and report sealing/validation/publication after snapshot.' : assuranceTimingNote],
  ];
}
function validatePhaseTimings(timings, evidence, elapsed) {
  if (!Array.isArray(timings) || !timings.length || !evidence || !Number.isSafeInteger(elapsed)) throw failure();
  let prior = -1;
  for (const item of timings) {
    const index = nativePhaseLabels.indexOf(item.label);
    if (index <= prior || !["PASS", "FAIL", "BLOCKED", "completed", "stopped"].includes(item.status) ||
      !Number.isSafeInteger(item.durationMs) || item.durationMs < 0 || item.durationMs > 7_200_000 ||
      typeof item.startedAt !== "string" || new Date(item.startedAt).toISOString() !== item.startedAt) throw failure();
    const phase = evidence.phases.find((row) => row.phase === proofPhases.get(item.label));
    if (phase && item.status !== phase.status) throw failure();
    prior = index;
  }
  const { coveredMs: covered, overlapPairs } = calculateNativePhaseIntervals(timings);
  if (overlapPairs.some((pair) => pair.join("|") !== "WA family|Scope fault candidate preparation")) throw failure();
  if (evidence.status === "PASS" && timings.filter(item=>item.label!=="Native evidence and interpreter verification").length !== nativePhaseLabels.length-1) throw failure();
  if (covered > elapsed + 1000) throw failure();
}
function renderPhaseTimings(timings, elapsed, legacy = false, previousLabels = false, mandatorySelected = false, previousKinds = false) {
  const duration = (ms) => `${Math.floor(ms / 60000)}m ${Math.floor(ms % 60000 / 1000)}s`;
  const { coveredMs: covered, overlapMs: overlap } = calculateNativePhaseIntervals(timings);
  const difference = elapsed - covered;
  const unitemized = difference < 0
    ? `Unitemized recorded interval: Not recorded (listed phase intervals exceed the recorded interval by ${-difference} ms).`
    : `Unitemized recorded interval: ${duration(difference)} (${difference} ms).`;
  const disclosure = previousLabels ? '' : `<p data-native-unitemized="${difference < 0 ? 'unknown' : difference}" data-native-overlap-ms="${overlap}">Recorded phase overlap: ${duration(overlap)} (${overlap} ms). ${unitemized} Unitemized time uses the union of recorded phase intervals; it includes preflight and controller work, and ST_CIC when attached. Overlapping phase durations are not additive. This is not an exact ST_CIC or per-facet duration or additional proof evidence.</p>`;
  return `<section id="harness-phase-timings" aria-labelledby="harness-phase-timings-title"><div class="harness-phase-heading"><div><h2 id="harness-phase-timings-title">What ran during native assurance</h2><p>Native controller timings and collector evidence checks, in execution order. These are timing telemetry, not additional catalogue credit. ${previousLabels ? 'Diagnostic Playwright time and Jenkins checkout/build time are separate.' : `Recorded interval includes core native, attached ST_CIC and evidence verification; excludes personal-service, ComplexTypes, DIVORCE, ${mandatorySelected ? 'mandatory email admission, ' : ''}diagnostics and Build self-checks. Jenkins checkout/build time is separate.`}</p></div><strong>${duration(elapsed)} ${previousLabels ? 'main native + evidence verification' : 'recorded native interval'}</strong></div><div class="table-responsive"><table class="table"><thead><tr><th>Phase</th><th>Kind</th><th>Outcome</th><th>Started (UTC)</th><th>Duration</th></tr></thead><tbody>${timings.map((item) => `<tr${legacy?'':` data-phase-duration-ms="${item.durationMs}" data-phase-started-at="${item.startedAt}"`}><th scope="row">${htmlEscape(item.label)}</th><td>${['Native evidence and interpreter verification','Selector evidence verification','Selector cohort admission'].includes(item.label)?'Evidence verification':['Selector baseline proof and cleanup','Selector fault proof and cleanup'].includes(item.label) ? 'Proof + setup / cleanup' : proofPhases.has(item.label) ? (previousKinds ? 'Proof' : 'Proof + setup / cleanup') : 'Setup / cleanup'}</td><td><span class="harness-phase-status" data-status="${item.status}">${item.status}</span></td><td>${item.startedAt.slice(0, 19).replace('T', ' ')} UTC</td><td>${duration(item.durationMs)}</td></tr>`).join('')}</tbody></table></div>${disclosure}</section>`;
}

function nativeIntervalInfo(record, previous = false) {
  const duration = record.nativeElapsedMs === undefined ? 'duration not recorded' : `${(record.nativeElapsedMs / 60000).toFixed(1)} min`;
  return [previous ? 'Main native + evidence verification' : 'Recorded native interval', record.nativeEvidence ? `${record.nativeEvidence.status} · ${duration}${previous ? '' : ` · Core native, attached ST_CIC and evidence verification; excludes personal-service, ComplexTypes, DIVORCE, ${record.nativeEvidence.mandatoryEmailAdmission ? 'mandatory email admission, ' : ''}diagnostics and Build self-checks`}` : 'Not run'];
}

function workerEvidence(runners, checks) {
  const observed=[];
  for (const check of checks) {
    if (!runners.some(row=>row.phase===check.runnerPhase) || !Number.isSafeInteger(check.workerIndex) || check.workerIndex < -1 || (check.runnerPhase!=='direct' && (overview.groupFor(check.file)==='aat')!==(check.runnerPhase==='aat'))) throw failure();
    if(check.workerIndex>=0 && !observed.some(row=>row.phase===check.runnerPhase&&row.workerIndex===check.workerIndex)) observed.push({phase:check.runnerPhase,workerIndex:check.workerIndex});
  }
  return {schemaVersion:1,runners,observed};
}
function renderWorkers(value) {
  const runners=value.runners.map(row=>`${row.phase}: ${row.configuredWorkers??'Not recorded'} configured`).join(' · ');
  return `<tr data-harness-diagnostic-workers="true"><th scope="row">Playwright diagnostic workers</th><td>${runners} · ${value.observed.length} observed across ${value.runners.length} runners; not peak parallelism</td></tr>`;
}
function validateWorkers(value, checks) {
  if(!value||Object.keys(value).sort().join()!=='observed,runners,schemaVersion'||value.schemaVersion!==1||!Array.isArray(value.runners)||!['direct','offline','offline,aat'].includes(value.runners.map(row=>row.phase).join())||value.runners.some(row=>Object.keys(row).sort().join()!=='configuredWorkers,phase'||!(row.configuredWorkers===null||Number.isSafeInteger(row.configuredWorkers)&&row.configuredWorkers>0)))throw failure();
  if(JSON.stringify(value)!==JSON.stringify(workerEvidence(value.runners,checks)))throw failure();
}

function paths(selection) {
  if (!Object.hasOwn(fixture.selections, selection)) throw failure();
  const root = process.cwd();
  if (fs.realpathSync(root) !== root) throw failure();
  const base = path.join(root, "functional-output/tests/harness");
  return {
    base,
    dir: path.join(base, "public", "odhin"),
    html: path.join(base, "public", "odhin", "index.html"),
    record: path.join(base, "private", "public-odhin-harness.json"),
    privateDir: path.join(base, "private"),
  };
}
function directory(target, create = false) {
  const parent = path.dirname(target);
  if (parent !== target) directory(parent, create);
  if (!fs.existsSync(target)) {
    // existsSync follows links: lstat also rejects a dangling symlink.
    try {
      fs.lstatSync(target);
      throw failure();
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (!create) return;
    fs.mkdirSync(target, { mode: 0o700 });
  }
  const stat = fs.lstatSync(target);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    fs.realpathSync(target) !== target
  )
    throw failure();
}
function regular(file) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || fs.realpathSync(file) !== file)
    throw failure();
  return stat;
}
function inventory(p) {
  directory(p.dir);
  directory(p.privateDir);
  if (
    fs.existsSync(p.dir) &&
    fs.readdirSync(p.dir).some((name) => name !== "index.html")
  )
    throw failure();
  for (const file of [p.html, p.record]) {
    try {
      regular(file);
    } catch (error) {
      if (error.code !== "ENOENT") throw failure();
    }
  }
}
function validateHtml(html, record, retiringPreviousRun = false) {
  const legacyUnboundBuild=retiringPreviousRun&&!Object.hasOwn(record,'buildSelfCheckHeld')&&(record.buildSelfChecks===undefined||!Object.hasOwn(record.buildSelfChecks,'configuredFileWorkers'));
  const legacyBoundBuild=retiringPreviousRun&&record.buildSelfChecks?.schemaVersion===1&&Object.hasOwn(record,'buildSelfCheckHeld')&&record.buildSelfCheckHeld!==null&&Object.hasOwn(record.buildSelfChecks,'configuredFileWorkers');
  const legacyBuild=legacyUnboundBuild||legacyBoundBuild;
  if(!legacyUnboundBuild){
    if(!Object.hasOwn(record,'buildSelfCheckHeld'))throw failure();
    if(record.buildSelfChecks===undefined){if(record.buildSelfCheckHeld!==null)throw failure();}
    else{
      const held=record.buildSelfCheckHeld;
      if(!held||typeof held!=='object'||Array.isArray(held)||Object.keys(held).sort().join(',')!=='digest,path'||
        typeof held.path!=='string'||!path.isAbsolute(held.path)||path.normalize(held.path)!==held.path||
        path.dirname(held.path)!==path.join(process.cwd(),'.harness-build-self-check')||
        !/^held-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.json$/.test(path.basename(held.path))||
        typeof held.digest!=='string'||!/^sha256:[a-f0-9]{64}$/.test(held.digest))throw failure();
      // A subsequent genuine Build run replaces current-request.json. Retirement
      // validates only this exact self-contained owned presentation for deletion.
      if(!retiringPreviousRun){
        // Build collection/replay requires qualified Node24; diagnostics-only does not.
        if(process.versions.node.split('.')[0]!=='24')throw failure();
        const actual=require('./harness-build-self-check-report.cjs').readHeldBuildSelfChecksForReport(held);
        if(!require('node:util').isDeepStrictEqual(actual,record.buildSelfChecks))throw failure();
      }
    }
  }
  const hasBusiness=record.nativeEvidence?.phases.some(p=>[...p.baselineProofs,...p.faults].some(proof=>proof.businessScalars!==undefined));
  if(!Object.hasOwn(record,'nativeBusinessScalarHeld')){
    if(!retiringPreviousRun||hasBusiness)throw failure();
  }else if(record.nativeEvidence){
    require('./lib/exui-business-scalar-detail.cjs').assertHeldProjection(record.nativeBusinessScalarHeld,record.nativeEvidence,{retiringPreviousRun});
  }else if(record.nativeBusinessScalarHeld!==null)throw failure();
  validateAssuranceTiming(record.assuranceTiming);
  const buildReport=require('./harness-build-self-check-report.cjs');
  const buildOptions={retiringPreviousRun};
  buildReport.validateBuildSelfChecks(record.buildSelfChecks,buildOptions);
  const buildDom=parse(html),buildSummary=buildDom.querySelectorAll('[id="harness-build-self-check-summary"]'),buildDetails=buildDom.querySelectorAll('[id="harness-build-self-check-details"]');
  if(!(retiringPreviousRun&&record.buildSelfChecks===undefined&&buildSummary.length===0&&buildDetails.length===0)){
    if(buildSummary.length!==1||buildDetails.length!==1||buildSummary[0].toString()!==parse(buildReport.renderBuildSelfCheckSummary(record.buildSelfChecks,buildOptions)).toString()||buildDetails[0].toString()!==parse(buildReport.renderBuildSelfCheckDetails(record.buildSelfChecks,buildOptions)).toString())throw failure();
  }
  if(record.buildSelfChecks!==undefined&&record.buildSelfChecks.source.commit!==record.diagnosticSource?.commit)throw failure();
  const mandatoryReport = require('./harness-mandatory-email-report.cjs');
  const mandatoryAdmission = record.nativeEvidence?.mandatoryEmailAdmission;
  mandatoryReport.validateMandatoryEmailTiming(record.mandatoryEmailTiming, mandatoryAdmission);
  const expectedBuild=parse(buildReport.renderBuildSelfCheckDetails(record.buildSelfChecks,buildOptions));
  for(const selector of ['[data-build-self-check-files]','[data-build-self-check-file]','[data-build-self-check-group]']){
    const all=buildDom.querySelectorAll(selector),owned=buildDetails[0]?.querySelectorAll(selector)??[];
    if(all.length!==expectedBuild.querySelectorAll(selector).length||all.length!==owned.length||all.some((node,index)=>node!==owned[index]))throw failure();
  }

  const complexAdmission = record.nativeEvidence?.complexEmailAdmission;
  const complexDom = parse(html);
  const infos = [...complexDom.querySelectorAll('.info-box-header')].filter(header => header.textContent.trim() === 'Run info');
  if (infos.length !== 1 || complexDom.querySelectorAll('[id="harness-public-run"]').length !== 1) throw failure();
  const timingRows = infos[0].parentNode.querySelectorAll('tr');
  const mandatoryLabels = ['Mandatory email standalone executions', 'Mandatory email execution detail'];
  const mandatoryRows = complexDom.querySelectorAll('tr').filter(row => mandatoryLabels.includes(row.querySelector('th')?.textContent.trim()));
  const expectedMandatoryRows = mandatoryAdmission ? parse(mandatoryReport.renderMandatoryEmailExecutionInfo(mandatoryAdmission)).querySelectorAll('tr') : [];
  if (mandatoryRows.length !== expectedMandatoryRows.length || mandatoryRows.some((row,index) => !timingRows.includes(row) || row.toString() !== expectedMandatoryRows[index].toString())) throw failure();

  const nodeWorkers=complexDom.querySelectorAll('[data-build-node-workers]');
  const namedNodeWorkerRows=complexDom.querySelectorAll('tr').filter(row=>row.querySelector('th')?.textContent.trim()==='Configured Node file workers');
  if(namedNodeWorkerRows.length!==(legacyUnboundBuild?0:1+(record.buildSelfChecks===undefined?0:1)))throw failure();
  if(!(legacyUnboundBuild&&nodeWorkers.length===0) && (nodeWorkers.length!==1 || !timingRows.includes(nodeWorkers[0]) || nodeWorkers[0].toString()!==parse(buildReport.renderBuildSelfCheckWorkers(record.buildSelfChecks,buildOptions)).toString()))throw failure();
  if (record.assuranceTiming !== undefined || timingRows.some(row => ['Harness elapsed to report','Harness preparation → report snapshot'].includes(row.querySelector('th')?.textContent.trim()))) {
    const expectedTiming = assuranceRunInfo(record.assuranceTiming);
    if(timingRows.some(row => ['Harness elapsed to report','Harness preparation → report snapshot','Assurance started at','Preparation started at','Assurance timing scope'].includes(row.querySelector('th')?.textContent.trim()) && !expectedTiming.some(([label]) => label === row.querySelector('th')?.textContent.trim()))) throw failure();
    for (const [label, value] of expectedTiming) {
      const rows = timingRows.filter(row => row.querySelector('th')?.textContent.trim() === label);
      if (rows.length !== 1 || rows[0].querySelectorAll('th').length !== 1 || rows[0].querySelectorAll('td').length !== 1 || rows[0].querySelector('td').textContent !== value) throw failure();
    }
  }

  {
    const previous = nativeIntervalInfo(record, true);
    const known = [nativeIntervalInfo(record), ...(retiringPreviousRun && !mandatoryAdmission ? [previous, ['Native execution', previous[1]]] : [])];
    const rows = timingRows.filter(row => ['Recorded native interval','Main native + evidence verification','Native execution'].includes(row.querySelector('th')?.textContent.trim()));
    if (rows.length !== 1 || rows[0].querySelectorAll('th').length !== 1 || rows[0].querySelectorAll('td').length !== 1 || !known.some(([label,value]) => rows[0].querySelector('th').textContent === label && rows[0].querySelector('td').textContent === value)) throw failure();
  }

  const entries = fixture.selections[record.selection];
  if(record.detailEvidence===undefined&&!retiringPreviousRun)throw failure();
  const detailMarkers = complexDom.querySelectorAll('[data-harness-check-info], [data-harness-check-steps]');
  if (retiringPreviousRun && record.checkMethods === undefined) {
    if (detailMarkers.length) throw failure();
  } else {
    checkMethods.validateMethodEvidence(record.checkMethods, entries, record.counts);
    if(record.detailEvidence!==undefined)checkDetails.validateEvidence(record.detailEvidence,entries,record.checkMethods);
    validateWorkers(record.diagnosticWorkers,record.checkMethods.checks);
    const workers=complexDom.querySelectorAll('[data-harness-diagnostic-workers]');
    if(workers.length!==1||workers[0].toString()!==parse(renderWorkers(record.diagnosticWorkers)).toString())throw failure();
    if (detailMarkers.length !== entries.length * 2) throw failure();
    record.checkMethods.checks.forEach((check,index) => {
      const modal = complexDom.querySelector(`#harness-${index}-0`);
      const info = modal?.querySelector(`#TabRunInfo-harness-${index}-0 [data-harness-check-info]`);
      const steps = modal?.querySelector(`#TabSteps-harness-${index}-0`);
      const label = modal?.querySelector('.modal-title label');
      const expectedInfo = parse(checkMethods.renderInfo(entries[index],check.steps,check.status)).toString();
      const expectedSteps = parse(checkMethods.renderSteps(entries[index],check.steps,check.status,checkDetails.recordsFor(record.detailEvidence,entries[index]))).toString();
      const legacySteps=parse(expectedSteps);legacySteps.querySelector('[data-harness-check-details]')?.remove();
      const exactSteps=record.detailEvidence===undefined?retiringPreviousRun&&steps?.innerHTML===legacySteps.toString():steps?.innerHTML===expectedSteps;
      if (!info || !steps || label?.textContent.trim() !== check.status || info.toString() !== expectedInfo || !exactSteps) throw failure();
    });
  }
  const childPanels=complexDom.querySelectorAll('[data-harness-check-details]').length;
  const declaredChildPanels=entries.filter(entry=>checkDetails.declarationsFor(entry).length).length;
  if(childPanels!==(record.detailEvidence===undefined&&retiringPreviousRun?0:declaredChildPanels))throw failure();
  const mandatoryPanels = complexDom.querySelectorAll('[id="harness-mandatory-email-admission"]');
  if (mandatoryPanels.length !== (mandatoryAdmission ? 1 : 0) || (mandatoryAdmission && (mandatoryPanels[0].parentNode?.getAttribute('id') !== 'harness-native-evidence' || mandatoryPanels[0].toString() !== parse(mandatoryReport.renderMandatoryEmailAdmission(mandatoryAdmission, record.mandatoryEmailTiming)).toString()))) throw failure();
  const complexPanels = complexDom.querySelectorAll('[id="harness-complex-email-admission"]').length;
  const complexAttemptPanels = complexDom.querySelectorAll('[id="harness-complex-email-attempt"]').length;
  if (complexPanels !== (complexAdmission ? 1 : 0) || complexAttemptPanels !== (record.complexEmailAttempt ? 1 : 0)) throw failure();
  if (complexAdmission && !html.includes(require('./harness-complex-email-report.cjs').renderComplexEmailAdmission(complexAdmission))) throw failure();

  if (record.complexEmailAttempt && record.nativeEvidence?.complexEmailAdmission) throw failure();
  if (Boolean(record.complexEmailAttempt) !== html.includes('id="harness-complex-email-attempt"')) throw failure();
  if (record.complexEmailAttempt && !html.includes(require('./harness-complex-email-report.cjs').renderComplexEmailAttempt(record.complexEmailAttempt))) throw failure();
  if(record.personalServiceAttempt&&record.nativeEvidence?.personalServiceAdmission)throw failure();
  if(Boolean(record.personalServiceAttempt)!==html.includes('id="harness-personal-service-attempt"'))throw failure();
  if(record.personalServiceAttempt&&!html.includes(require('./harness-personal-service-report.cjs').renderPersonalServiceAttempt(record.personalServiceAttempt)))throw failure();
  if (!retiringPreviousRun && !html.includes(require('./harness-native-report.cjs').renderNativeExecutionInfo(record.nativeEvidence))) throw failure();
  if(record.divorceProfileAttempt&&record.nativeEvidence?.divorceProfileAdmission)throw failure();
  if(Boolean(record.divorceProfileAttempt)!==html.includes('id="harness-divorce-profile-attempt"'))throw failure();
  if(record.divorceProfileAttempt&&!html.includes(require('./harness-divorce-profile-report.cjs').renderDivorceProfileAttempt(record.divorceProfileAttempt)))throw failure();
  if(Boolean(record.sharedNestedAttemptEvidence)!==html.includes('id="harness-shared-nested-attempt"'))throw failure();
  if(record.sharedNestedAttemptEvidence&&!html.includes(require('./harness-shared-nested-report.cjs').renderSharedNestedAttempt(record.sharedNestedAttemptEvidence)))throw failure();
  if (Boolean(record.compatibilityEvidence) !== html.includes('id="harness-applicant-compatibility"')) throw failure();
  if (record.compatibilityEvidence) {
    if (!record.nativeEvidence || !html.includes(require("./harness-applicant-results-report.cjs").renderApplicantCompatibility(record.compatibilityEvidence))) throw failure();
  }
  if (record.nativeElapsedMs !== undefined && (!Number.isSafeInteger(record.nativeElapsedMs) || record.nativeElapsedMs < 0 || !html.includes(`data-native-elapsed-ms="${record.nativeElapsedMs}"`))) throw failure();
  if (record.phaseTimings !== undefined) {
    validatePhaseTimings(record.phaseTimings, record.nativeEvidence, record.nativeElapsedMs);
    const panels = complexDom.querySelectorAll('[id="harness-phase-timings"]');
    const knownPanels = [renderPhaseTimings(record.phaseTimings, record.nativeElapsedMs, false, false, Boolean(record.nativeEvidence?.mandatoryEmailAdmission))];
    if (retiringPreviousRun) knownPanels.push(renderPhaseTimings(record.phaseTimings, record.nativeElapsedMs, false, false, Boolean(record.nativeEvidence?.mandatoryEmailAdmission), true));
    if (retiringPreviousRun && !mandatoryAdmission) knownPanels.push(renderPhaseTimings(record.phaseTimings, record.nativeElapsedMs, record.checkMethods === undefined, true, false, true));
    if (panels.length !== 1 || !knownPanels.some(value => panels[0].toString() === parse(value).toString())) throw failure();
  } else if (html.includes('id="harness-phase-timings"')) throw failure();
  if (record.eventPreparationTimings !== undefined) {
    eventPreparationReport.validateEventPreparationSummary(record.eventPreparationTimings, record.nativeEvidence);
    const panels = complexDom.querySelectorAll('[id="harness-event-preparation-timings"]');
    if (panels.length !== 1 || panels[0].toString() !== parse(eventPreparationReport.renderEventPreparationTimings(record.eventPreparationTimings)).toString()) throw failure();
  } else if (html.includes('id="harness-event-preparation-timings"')) throw failure();
  if (record.eventRuntimeLifecycleTimings !== undefined) {
    const expected = eventPreparationReport.validateEventRuntimeLifecycleTimings(record.eventRuntimeLifecycleTimings, record.nativeEvidence);
    if (!record.eventRuntimeLifecycleSummary || JSON.stringify(expected) !== JSON.stringify(record.eventRuntimeLifecycleSummary)) throw failure();
  }
  if (record.eventRuntimeLifecycleSummary !== undefined) {
    eventPreparationReport.validateEventRuntimeLifecycleSummary(record.eventRuntimeLifecycleSummary, record.nativeEvidence);
    const panels = complexDom.querySelectorAll('[id="harness-event-runtime-lifecycle"]');
    if (panels.length !== 1 || panels[0].toString() !== parse(eventPreparationReport.renderEventRuntimeLifecycleTimings(record.eventRuntimeLifecycleSummary)).toString()) throw failure();
  } else if (html.includes('id="harness-event-runtime-lifecycle"')) throw failure();
  if (
    Boolean(record.nativeEvidence) !==
      html.includes('id="harness-native-evidence"') ||
    Boolean(record.diagnosticSource) !==
      html.includes('class="harness-diagnostic-source"')
  )
    throw failure();
  if (record.diagnosticSource) {
    validateDiagnosticSource(record.diagnosticSource);
    if (
      !html.includes(
        `data-diagnostic-source-sha256="${digest(JSON.stringify(record.diagnosticSource))}"`,
      ) ||
      !html.includes(record.diagnosticSource.capturedAt) ||
      (record.diagnosticSource.commit &&
        !html.includes(record.diagnosticSource.commit))
    )
      throw failure();
  }
  if (record.nativeEvidence) {
    const nativePresentation=parse(require("./harness-native-report.cjs").renderNativeEvidence(record.nativeEvidence, record.mandatoryEmailTiming));
    const nativePanels=complexDom.querySelectorAll('[id="harness-native-evidence"]');
    if(nativePanels.length!==1)throw failure();
    const wantedTables=nativePresentation.querySelectorAll('[data-native-stage-proof]'),actualTables=nativePanels[0].querySelectorAll('[data-native-stage-proof]');
    const wantedNotes=nativePresentation.querySelectorAll('[data-native-stage-note]'),actualNotes=nativePanels[0].querySelectorAll('[data-native-stage-note]');
    if(complexDom.querySelectorAll('[data-native-stage-proof]').length!==actualTables.length||complexDom.querySelectorAll('[data-native-stage-note]').length!==actualNotes.length)throw failure();
    const sameNodes=(actual,wanted)=>actual.length===wanted.length&&actual.every((node,index)=>node.toString()===wanted[index].toString());
    const oldHeader='Order|Assertion stage|Instance|Recorded outcome|Observed duration';
    const legacy=retiringPreviousRun&&record.detailEvidence===undefined&&actualTables.length===0&&actualNotes.length===0;
    const oldTables=complexDom.querySelectorAll('table').filter(table=>table.querySelectorAll('thead th').map(cell=>cell.textContent).join('|')===oldHeader);
    const allStageTables=complexDom.querySelectorAll('table').filter(table=>[oldHeader,'Order|Assertion stage|Instance|Source-defined expected contract|Recorded group outcome|Observed duration'].includes(table.querySelectorAll('thead th').map(cell=>cell.textContent).join('|')));
    const allStageNotes=complexDom.querySelectorAll('p').filter(note=>note.textContent.startsWith('Observed test duration:'));
    if(!legacy&&(!sameNodes(actualTables,wantedTables)||!sameNodes(actualNotes,wantedNotes)||oldTables.length))throw failure();
    const expectedRows=nativePresentation.querySelectorAll('[data-native-row]'),observedRows=nativePanels[0].querySelectorAll('[data-native-row]');
    if(expectedRows.length!==observedRows.length)throw failure();
    const previousTable=table=>{const copy=parse(table.toString()).firstChild;copy.removeAttribute('data-native-stage-proof');copy.querySelectorAll('tr').forEach(row=>row.childNodes.filter(node=>node.tagName==='TH'||node.tagName==='TD')[3]?.remove());copy.querySelectorAll('thead th')[3].textContent='Recorded outcome';return copy;};
    const previousNote=note=>{const copy=parse(note.toString()).firstChild;copy.removeAttribute('data-native-stage-note');copy.textContent=copy.textContent.split(' Expected contracts below')[0];return copy;};
    const businessSelectors=['[data-native-business-scalars]','[data-native-business-note]'];
    for(const selector of businessSelectors)if(!sameNodes(complexDom.querySelectorAll(selector),nativePresentation.querySelectorAll(selector)))throw failure();
    const businessHeader='Business scalar|Source-defined expected|Actually observed|Scalar interpretation';
    if(complexDom.querySelectorAll('table').filter(table=>table.querySelectorAll('thead th').map(cell=>cell.textContent).join('|')===businessHeader).length!==nativePresentation.querySelectorAll('[data-native-business-scalars]').length)throw failure();
    if(complexDom.querySelectorAll('p').filter(node=>node.textContent.startsWith('Business scalar observations:')).length!==nativePresentation.querySelectorAll('[data-native-business-note]').length)throw failure();
    let scopedBusiness=0;
    const postalSelectors=['[data-native-postal-detail]','[data-native-postal-note]','[data-native-postal-heading]'];
    for(const selector of postalSelectors) if(!sameNodes(complexDom.querySelectorAll(selector),nativePresentation.querySelectorAll(selector)))throw failure();
    const postalHeader='Order|Source-defined group method|Group kind|Recorded outcome|Observed duration';
    if(complexDom.querySelectorAll('table').filter(table=>table.querySelectorAll('thead th').map(cell=>cell.textContent).join('|')===postalHeader).length!==nativePresentation.querySelectorAll('[data-native-postal-detail]').length)throw failure();
    const postalNote=node=>node.textContent.startsWith('Actual framework group events,')||node.textContent.startsWith('Postal action/check groups: unavailable.');
    if(complexDom.querySelectorAll('p').filter(postalNote).length!==nativePresentation.querySelectorAll('[data-native-postal-note]').length)throw failure();
    if(complexDom.querySelectorAll('h4').filter(node=>node.textContent==='Recorded postal action/check groups').length!==nativePresentation.querySelectorAll('[data-native-postal-heading]').length)throw failure();
    let scopedPostal=0;
    let scopedTables=0,scopedNotes=0;
    expectedRows.forEach((row,index)=>{
      const actual=observedRows[index],expectedOwners=row.querySelectorAll('details'),owners=actual.querySelectorAll('details');
      if(owners.length!==1||expectedOwners.length!==1||['data-native-phase','data-native-kind'].some(name=>actual.getAttribute(name)!==row.getAttribute(name)))throw failure();
      const owner=owners[0],expectedOwner=expectedOwners[0],ids=owner.querySelectorAll('dl'),expectedIds=expectedOwner.querySelectorAll('dl');
      // Proof, invocation, fault relation, phase run and receipt are the held owner identity.
      if(!sameNodes(ids,expectedIds)||ids.length!==1)throw failure();
      for(const selector of businessSelectors){
        const observed=owner.querySelectorAll(selector),expected=expectedOwner.querySelectorAll(selector);
        if(!sameNodes(observed,expected)||observed.some(node=>node.parentNode!==owner))throw failure();
        scopedBusiness+=observed.length;
      }
      for(const selector of postalSelectors){
        const observed=owner.querySelectorAll(selector),expected=expectedOwner.querySelectorAll(selector);
        if(!sameNodes(observed,expected)||observed.some(node=>node.parentNode!==owner))throw failure();
        scopedPostal+=observed.length;
      }
      const targetTables=expectedOwner.querySelectorAll('[data-native-stage-proof]'),targetNotes=expectedOwner.querySelectorAll('[data-native-stage-note]');
      const tables=legacy?owner.querySelectorAll('table').filter(table=>table.querySelectorAll('thead th').map(cell=>cell.textContent).join('|')===oldHeader):owner.querySelectorAll('[data-native-stage-proof]');
      const notes=legacy?owner.querySelectorAll('p').filter(note=>note.textContent.startsWith('Observed test duration:')):owner.querySelectorAll('[data-native-stage-note]');
      if(tables.some(table=>table.parentNode!==owner)||notes.some(note=>note.parentNode!==owner)||!sameNodes(tables,legacy?targetTables.map(previousTable):targetTables)||!sameNodes(notes,legacy?targetNotes.map(previousNote):targetNotes))throw failure();
      scopedTables+=tables.length;scopedNotes+=notes.length;
    });
    if(scopedBusiness!==businessSelectors.reduce((n,selector)=>n+complexDom.querySelectorAll(selector).length,0))throw failure();
    if(scopedPostal!==postalSelectors.reduce((n,selector)=>n+complexDom.querySelectorAll(selector).length,0))throw failure();
    if(scopedTables!==(legacy?oldTables.length:actualTables.length)||scopedNotes!==(legacy?wantedNotes.length:actualNotes.length)||scopedTables!==allStageTables.length||scopedNotes!==allStageNotes.length)throw failure();
    if (
      !html.includes(`data-native-status="${record.nativeEvidence.status}"`) ||
      !html.includes(
        `data-native-evidence-sha256="${digest(JSON.stringify(record.nativeEvidence))}"`,
      ) ||
      !html.includes(record.nativeEvidence.descriptorDigest) ||
      !html.includes(
        `Diagnostics ${record.status} / Native ${record.nativeEvidence.status}`,
      )
    )
      throw failure();
  }
  if (
    !html.startsWith("<!DOCTYPE html>") ||
    !html.includes("Final Outcomes") ||
    html.includes("{{.") ||
    html.includes("fonts.gstatic.com") ||
    /<(?:script|video|iframe)\b[^>]*\bsrc\s*=/i.test(html) ||
    /<img\b[^>]*\bsrc\s*=\s*["'](?!data:image\/(?:png|gif|jpeg);base64,)/i.test(
      html,
    ) ||
    /<link\b[^>]*\bhref\s*=\s*["'](?!data:)/i.test(html) ||
    /(?:screenshots|videos|traces)\//.test(html)
  )
    throw failure();
  const marker = `<section id="harness-public-run" data-selection="${record.selection}" data-status="${record.status}" data-run-id="${record.runId}"${record.nativeElapsedMs === undefined ? '' : ` data-native-elapsed-ms="${record.nativeElapsedMs}"`}${assuranceTimingAttributes(record.assuranceTiming)}>`;
  if (
    !html.includes(marker) ||
    !html.includes("no release credit") ||
    !html.includes('id="harness-overview"') ||
    !html.includes(record.startTime) ||
    !html.includes(
      new Date(
        new Date(record.startTime).getTime() + record.duration,
      ).toISOString(),
    ) ||
    !html.includes('<style id="webapp-report-theme">') ||
    !html.includes('<script id="webapp-report-ui">') ||
    !html.includes(`Global errors: ${record.globalErrors}`)
  )
    throw failure();
  for (const status of statuses) {
    const count = (
      html.match(
        new RegExp(
          `<tr class="test-row-result row-result-status-${status} result-status-${status}"`,
          "g",
        ),
      ) || []
    ).length;
    if (count !== record.counts[status]) throw failure();
  }
  for (const entry of fixture.selections[record.selection]) {
    if (!html.includes(htmlEscape(entry.titlePath.at(-1)))) throw failure();
  }
}
function validateOwnedReport(selection, retiringPreviousRun = false) {
  try {
    const p = paths(selection || "harness");
    inventory(p);
    regular(p.html);
    regular(p.record);
    const record = JSON.parse(fs.readFileSync(p.record, "utf8"));
    selection ||= record.selection;
    if (!Object.hasOwn(fixture.selections, selection)) throw failure();
    if (
      record.schemaVersion !== 1 ||
      record.selection !== selection ||
      record.tests !== fixture.selections[selection].length ||
      typeof record.startTime !== "string" ||
      new Date(record.startTime).toISOString() !== record.startTime ||
      !Number.isFinite(record.duration) ||
      record.duration < 0 ||
      !Number.isFinite(
        new Date(
          new Date(record.startTime).getTime() + record.duration,
        ).getTime(),
      ) ||
      !["passed", "failed"].includes(record.status) ||
      !/^[a-f0-9-]{36}$/.test(record.runId) ||
      !/^[a-f0-9]{64}$/.test(record.sha256) ||
      !Number.isSafeInteger(record.globalErrors) ||
      record.globalErrors < 0 ||
      statuses.some(
        (status) =>
          !Number.isSafeInteger(record.counts?.[status]) ||
          record.counts[status] < 0,
      ) ||
      statuses.reduce((sum, status) => sum + record.counts[status], 0) !==
        record.tests ||
      (record.status === "passed" &&
        (record.globalErrors || record.counts.failed || record.counts.timedOut))
    )
      throw failure();
    const html = fs.readFileSync(p.html, "utf8");
    if (digest(html) !== record.sha256) throw failure();
    validateHtml(html, record, retiringPreviousRun);
    return record;
  } catch {
    throw failure();
  }
}
function validatePublicReport(selection) {
  return validateOwnedReport(selection);
}
function resetPublicReport(selection) {
  try {
    const p = paths(selection);
    inventory(p);
    if (fs.existsSync(p.html)) {
      // Retirement keeps ownership/privacy checks but permits the previous RunInfo layout.
      validateOwnedReport(undefined, true);
      fs.unlinkSync(p.html);
    }
    if (fs.existsSync(p.record)) fs.unlinkSync(p.record);
  } catch {
    throw failure();
  }
}
function writeExclusive(file, bytes, owned) {
  const fd = fs.openSync(file, "wx", 0o600);
  owned.push({ file, stat: fs.fstatSync(fd) });
  try {
    fs.writeFileSync(fd, bytes);
  } finally {
    fs.closeSync(fd);
  }
}
function withdraw(owned) {
  for (const { file, stat } of owned.reverse()) {
    try {
      const current = fs.lstatSync(file);
      if (current.dev === stat.dev && current.ino === stat.ino)
        fs.unlinkSync(file);
    } catch {
      /* A failed producer never validates without its matching private record. */
    }
  }
}

function captureDiagnosticSource() {
  const capturedAt = new Date().toISOString();
  try {
    const { execFileSync } = require("node:child_process");
    const options = {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
    };
    const commit = execFileSync("git", ["rev-parse", "HEAD"], options).trim();
    const state = execFileSync(
      "git",
      ["status", "--porcelain", "--untracked-files=normal"],
      options,
    ).trim()
      ? "modified"
      : "clean";
    if (!/^[a-f0-9]{40}$/.test(commit)) throw failure();
    return { commit, state, capturedAt };
  } catch {
    return { commit: null, state: "unavailable", capturedAt };
  }
}
function validateDiagnosticSource(source) {
  if (
    !source ||
    !["clean", "modified", "unavailable"].includes(source.state) ||
    (source.state === "unavailable"
      ? source.commit !== null
      : !/^[a-f0-9]{40}$/.test(source.commit)) ||
    new Date(source.capturedAt).toISOString() !== source.capturedAt
  )
    throw failure();
}
class HarnessPublicOdhinReporter {
  constructor({ selection, diagnosticSource, assuranceTiming, nativeElapsedMs, phaseTimings, eventRuntimePreparationTimings, eventRuntimeLifecycleTimings, divorceProfileAttempt, personalServiceAttempt, complexEmailAttempt, mandatoryEmailTiming, buildSelfCheckHeld } = {}) {
    this.buildSelfCheckHeld = buildSelfCheckHeld === undefined ? undefined : structuredClone(buildSelfCheckHeld);
    this.buildSelfChecks = undefined;
    this.diagnosticSource = diagnosticSource;
    this.assuranceTiming = assuranceTiming;
    this.nativeElapsedMs = nativeElapsedMs;
    this.mandatoryEmailTiming = mandatoryEmailTiming === undefined ? undefined : structuredClone(mandatoryEmailTiming);
    this.phaseTimings = phaseTimings;
    this.eventRuntimePreparationTimings = eventRuntimePreparationTimings === undefined ? undefined : structuredClone(eventRuntimePreparationTimings);
    this.eventPreparationTimings = undefined;
    this.eventRuntimeLifecycleTimings = eventRuntimeLifecycleTimings === undefined ? undefined : structuredClone(eventRuntimeLifecycleTimings);
    this.eventRuntimeLifecycleSummary = undefined;
    if(divorceProfileAttempt)require('./harness-divorce-profile-report.cjs').renderDivorceProfileAttempt(divorceProfileAttempt);
    this.divorceProfileAttempt = divorceProfileAttempt;
    if(personalServiceAttempt)require('./harness-personal-service-report.cjs').renderPersonalServiceAttempt(personalServiceAttempt);
    this.personalServiceAttempt=personalServiceAttempt;
    if (complexEmailAttempt) require('./harness-complex-email-report.cjs').renderComplexEmailAttempt(complexEmailAttempt);
    this.complexEmailAttempt = complexEmailAttempt;
    this.nativeEvidence = null;
    this.nativeBusinessScalarHeld = null;
    this.compatibilityEvidence = null;
    this.sharedNestedAttemptEvidence = null;
    this.selection = selection;
    this.paths = paths(selection);
    this.expected = new Map(
      fixture.selections[selection].map((entry) => [key(entry), entry]),
    );
    this.results = new Map();
    this.identities = new WeakMap();
    this.globalErrors = 0;
    this.invalid = false;
    this.begun = false;
    this.ended = false;
  }
  async prepareBuildSelfChecks(held) {
    if(this.begun||this.buildSelfCheckHeld!==undefined)this.reject();
    this.buildSelfCheckHeld=structuredClone(held);
    const {readHeldBuildSelfChecks}=await import('./run-harness-self-check-evidence.mjs');
    this.buildSelfChecks=readHeldBuildSelfChecks(this.buildSelfCheckHeld);
    require('./harness-build-self-check-report.cjs').validateBuildSelfChecks(this.buildSelfChecks);
  }
  async prepareNativeEvidence(descriptorPath) {
    if (this.begun || this.nativeEvidence) this.reject();
    const { readNativeReportEvidence } =
      await import("./lib/exui-native-report-evidence.mjs");
    this.nativeEvidence = await readNativeReportEvidence(descriptorPath);
    {
      this.nativeBusinessScalarHeld={path:path.resolve(descriptorPath),digest:this.nativeEvidence.descriptorDigest};
      require('./lib/exui-business-scalar-detail.cjs').validateHeldReference(this.nativeBusinessScalarHeld,this.nativeEvidence);
    }
    // Validate all display labels before starting collection, never silently omit an unknown proof.
    require("./harness-native-report.cjs").renderNativeEvidence(
      this.nativeEvidence, this.mandatoryEmailTiming,
    );
  }
  async prepareCompatibilityEvidence(descriptorPath) {
    if (this.begun || this.compatibilityEvidence || !this.nativeEvidence) this.reject();
    const { readApplicantCompatibilityEvidence } = await import("./lib/exui-applicant-results-report-evidence.mjs");
    this.compatibilityEvidence = readApplicantCompatibilityEvidence(descriptorPath);
    require("./harness-applicant-results-report.cjs").renderApplicantCompatibility(this.compatibilityEvidence);
  }
  async prepareSharedNestedAttempt(descriptorPath) {
    if(this.begun||this.sharedNestedAttemptEvidence)this.reject();
    const {readSharedNestedAttempt}=await import('./lib/exui-shared-nested-attempt.mjs');
    const started=performance.now(),observed=await readSharedNestedAttempt(descriptorPath);
    this.sharedNestedAttemptEvidence={...observed,collectorVerificationMs:Math.round(performance.now()-started)};
    require('./harness-shared-nested-report.cjs').renderSharedNestedAttempt(this.sharedNestedAttemptEvidence);
  }
  reject() {
    this.invalid = true;
    throw failure();
  }
  onBegin(_config, suite) {
    try {
      this.runnerPhases=_config?.harnessRunnerPhases??['direct'];
      if(!Array.isArray(this.runnerPhases)||!['direct','offline','offline,aat'].includes(this.runnerPhases.join()))this.reject();
      this.configuredWorkers = Number.isSafeInteger(_config?.workers) && _config.workers > 0 ? _config.workers : null;
      this.diagnosticSource ||= captureDiagnosticSource();
      validateDiagnosticSource(this.diagnosticSource);
      resetPublicReport(this.selection);
      if (this.begun) this.reject();
      const tests = suite.allTests();
      if (tests.length !== this.expected.size) this.reject();
      const seen = new Set();
      for (const test of tests) {
        const file = path
          .relative(process.cwd(), test.location.file)
          .split(path.sep)
          .join("/");
        const identity = key({
          file,
          titlePath: overview.normalize({ file, titlePath: test.titlePath() })
            .titlePath,
        });
        if (
          !this.expected.has(identity) ||
          seen.has(identity) ||
          test.retries !== 0 ||
          test.expectedStatus !== "passed"
        )
          this.reject();
        seen.add(identity);
        this.identities.set(test, identity);
      }
      this.begun = true;
    } catch {
      this.reject();
    }
  }
  onTestEnd(test, result) {
    if (!this.begun || this.ended || this.invalid) this.reject();
    const identity = this.identities.get(test);
    if (
      !identity ||
      this.results.has(identity) ||
      !statuses.includes(result.status) ||
      result.retry !== 0 ||
      !Number.isFinite(result.duration) ||
      result.duration < 0 ||
      !(result.startTime instanceof Date) ||
      !Number.isFinite(result.startTime.getTime()) ||
      !Number.isFinite(
        new Date(result.startTime.getTime() + result.duration).getTime(),
      ) ||
      !Number.isSafeInteger(result.workerIndex) ||
      result.workerIndex < -1 ||
      !Number.isSafeInteger(result.parallelIndex) ||
      result.parallelIndex < -1
    )
      this.reject();
    const isAat = overview.groupFor(this.expected.get(identity).file) === "aat";
    if (
      isAat &&
      (![
        "response-passed",
        "login-setup-blocked",
        "failure-unclassified",
        "service-family-contract-mismatch",
        "aat-profile-contract-mismatch",
        "skipped",
      ].includes(result.aatOutcome) ||
        (result.status === "passed" &&
          result.aatOutcome !== "response-passed") ||
        (result.status !== "passed" && result.aatOutcome === "response-passed"))
    )
      this.reject();
    if (
      isAat &&
      result.aatOutcome === "service-family-contract-mismatch" &&
      (this.expected.get(identity).titlePath.at(-1) !==
        "api/globalSearch/services contains the central must-run service-family set" ||
        !Array.isArray(result.aatMissingFamilies) ||
        !result.aatMissingFamilies.length ||
        new Set(result.aatMissingFamilies).size !==
          result.aatMissingFamilies.length ||
        result.aatMissingFamilies.some(
          (code) => !Object.hasOwn(overview.familyNames, code),
        ))
    )
      this.reject();
    if (
      isAat &&
      result.aatOutcome === "aat-profile-contract-mismatch" &&
      ![
        "api/globalSearch/services contains the central must-run service-family set",
        "api/wa-supported-jurisdiction/get contains the central WA must-run family set",
        "api/staff-supported-jurisdiction/get contains the central staff-supported must-run family set",
      ].includes(this.expected.get(identity).titlePath.at(-1))
    )
      this.reject();
    const runnerPhase=result.runnerPhase??'direct';
    if(!this.runnerPhases.includes(runnerPhase)||(runnerPhase!=='direct'&&isAat!==(runnerPhase==='aat')))this.reject();
    let recordedCheckSteps, recordedDetails;
    try {
      recordedCheckSteps = checkMethods.validateCheckSteps(this.expected.get(identity), result.checkSteps === undefined
        ? checkMethods.extractCheckSteps(this.expected.get(identity), result.steps, 'framework')
        : result.checkSteps, result.status);
      recordedDetails=result.checkDetails===undefined?checkDetails.extractDetails(this.expected.get(identity),result.steps,'framework',recordedCheckSteps,result.status):checkDetails.validateDetails(this.expected.get(identity),result.checkDetails,recordedCheckSteps,result.status);
    } catch { this.reject(); }
    this.results.set(identity, {
      ...(isAat ? { aatOutcome: result.aatOutcome } : {}),
      ...(isAat && result.aatOutcome === "service-family-contract-mismatch"
        ? { aatMissingFamilies: [...result.aatMissingFamilies] }
        : {}),
      checkSteps: recordedCheckSteps,
      checkDetails: recordedDetails,
      runnerPhase,
      status: result.status,
      retry: 0,
      duration: result.duration,
      startTime: new Date(result.startTime.getTime()),
      workerIndex: result.workerIndex,
      parallelIndex: result.parallelIndex,
    });
  }
  onError() {
    this.globalErrors++;
  }
  async onEnd(result) {
    let stage;
    const owned = [];
    try {
      if (
        !this.begun ||
        this.ended ||
        this.invalid ||
        this.results.size !== this.expected.size ||
        !["passed", "failed"].includes(result.status) ||
        !(result.startTime instanceof Date) ||
        !Number.isFinite(result.startTime.getTime()) ||
        !Number.isFinite(result.duration) ||
        result.duration < 0 ||
        !Number.isFinite(
          new Date(result.startTime.getTime() + result.duration).getTime(),
        )
      )
        this.reject();
      this.ended = true;
      const counts = Object.fromEntries(statuses.map((status) => [status, 0]));
      validateAssuranceTiming(this.assuranceTiming);
      require('./harness-mandatory-email-report.cjs').validateMandatoryEmailTiming(this.mandatoryEmailTiming, this.nativeEvidence?.mandatoryEmailAdmission);
      if (this.nativeElapsedMs !== undefined && (!this.nativeEvidence || !Number.isSafeInteger(this.nativeElapsedMs) || this.nativeElapsedMs < 0)) this.reject();
      if(this.personalServiceAttempt&&this.nativeEvidence?.personalServiceAdmission)throw failure();
      if (this.complexEmailAttempt && this.nativeEvidence?.complexEmailAdmission) throw failure();
      if(this.divorceProfileAttempt&&this.nativeEvidence?.divorceProfileAdmission)throw failure();
      if (this.phaseTimings !== undefined) validatePhaseTimings(this.phaseTimings, this.nativeEvidence, this.nativeElapsedMs);
      if (this.eventRuntimePreparationTimings !== undefined) {
        try { this.eventPreparationTimings = eventPreparationReport.validateEventRuntimePreparationTimings(this.eventRuntimePreparationTimings, this.nativeEvidence); }
        catch { this.eventPreparationTimings = eventPreparationReport.unavailableEventPreparationSummary(this.nativeEvidence); }
      }
      if (this.eventRuntimeLifecycleTimings !== undefined) {
        try {
          this.eventRuntimeLifecycleSummary = eventPreparationReport.validateEventRuntimeLifecycleTimings(this.eventRuntimeLifecycleTimings, this.nativeEvidence);
          eventPreparationReport.validateEventRuntimeLifecycleSummary(this.eventRuntimeLifecycleSummary, this.nativeEvidence);
        }
        catch { this.eventRuntimeLifecycleSummary = eventPreparationReport.unavailableEventRuntimeLifecycleTimings(this.nativeEvidence); }
      }
      for (const record of this.results.values()) counts[record.status]++;
      if (
        result.status === "passed" &&
        (counts.failed || counts.timedOut || this.globalErrors)
      )
        this.reject();
      const p = this.paths;
      inventory(p);
      directory(p.privateDir, true);
      directory(p.dir, true);
      stage = fs.mkdtempSync(path.join(p.privateDir, ".public-odhin-"));
      fs.chmodSync(stage, 0o700);
      const renderDir = path.join(stage, "render");
      const renderer = new Generate({
        outputFolder: renderDir,
        indexFilename: "index.html",
        title: "EXUI Assurance Harness",
        project: `Harness ${this.selection}`,
        testEnvironment: this.selection,
        release: "",
        testFolder: "src/tests/api",
        initialTheme: "light",
        embedAssets: true,
        embedAttachments: false,
        startServer: false,
        consoleLog: false,
        consoleError: false,
        consoleTestOutput: false,
        testOutput: false,
        testGroupOnConsole: false,
        testProjectOnConsole: false,
      });
      // Its string replacement corrupts bundled jQuery's literal $&. Keep bytes literal.
      renderer.help.updateHtml = (html, tag, content, type) =>
        html.replace(tag, () =>
          type === "css"
            ? `<style>${content}</style>`
            : `<script type='text/javascript'>${content}</script>`,
        );
      const deadline = Date.now() + 5000;
      while (
        !templateFields.every((field) => typeof renderer[field] === "string")
      ) {
        if (Date.now() >= deadline) this.reject();
        await nextTurn();
      }
      await renderer.onBegin(
        { projects: [{ name: `Harness ${this.selection}` }] },
        { allTests: () => [...this.expected.values()] },
      );
      let index = 0;
      for (const [identity, entry] of this.expected) {
        const observed = this.results.get(identity);
        await renderer.onTestEnd(
          {
            id: `harness-${index++}`,
            title: htmlEscape(entry.titlePath.at(-1)),
            filename: entry.file,
            projectId: this.selection,
            projectInfo: true,
            retries: 0,
            tags: [],
            annotations: [],
            titlePath: entry.titlePath.map(htmlEscape),
          },
          {
            ...observed,
            errors: [],
            stderr: [],
            stdout: [],
            steps: observed.checkSteps.map(step => ({
              title: htmlEscape(checkMethods.methodFor(entry).steps.find(declared => declared.id === step.id).label),
              duration: step.durationMs ?? 0,
              ...(step.status === 'passed' ? {} : {error:{message:'Recorded stage did not pass'}}),
              steps: [],
            })),
            attachments: [],
          },
        );
      }
      // Replay updates counters correctly, but its clocks describe rendering rather than execution.
      renderer.execInfo.startTime = result.startTime.toISOString();
      renderer.execInfo.endTime = new Date(
        result.startTime.getTime() + result.duration,
      ).toISOString();
      const spans = new Map();
      let first = Infinity;
      let last = -Infinity;
      for (const [identity, entry] of this.expected) {
        const observed = this.results.get(identity);
        const start = observed.startTime.getTime();
        const end = start + observed.duration;
        const filename = renderer.help.getShortFilePath(
          entry.file,
          "src/tests/api",
        );
        const span = spans.get(filename) || { start: Infinity, end: -Infinity };
        span.start = Math.min(span.start, start);
        span.end = Math.max(span.end, end);
        spans.set(filename, span);
        first = Math.min(first, start);
        last = Math.max(last, end);
      }
      for (const file of renderer.execInfo.execFiles) {
        const span = spans.get(file.filename);
        if (!span) this.reject();
        file.startTime = new Date(span.start).toISOString();
        file.endTime = new Date(span.end).toISOString();
      }
      for (const project of renderer.execInfo.execProjects) {
        if (project.project !== this.selection) this.reject();
        project.startTime = new Date(first).toISOString();
        project.endTime = new Date(last).toISOString();
      }
      await renderer.onEnd();
      if (fs.readdirSync(renderDir).join() !== "index.html") this.reject();
      regular(path.join(renderDir, "index.html"));
      let html = fs.readFileSync(path.join(renderDir, "index.html"), "utf8");
      html = html.replace(
        '<link rel="preconnect" href="https://fonts.gstatic.com" />',
        "",
      );
      if(this.buildSelfCheckHeld!==undefined){const {readHeldBuildSelfChecks}=await import('./run-harness-self-check-evidence.mjs');this.buildSelfChecks=readHeldBuildSelfChecks(this.buildSelfCheckHeld);}
      const record = {
        schemaVersion: 1,
        selection: this.selection,
        runId: crypto.randomUUID(),
        tests: this.results.size,
        checkMethods: checkMethods.methodEvidence([...this.expected.values()], this.results),
        detailEvidence: checkDetails.detailEvidence([...this.expected.values()], this.results),
        diagnosticWorkers: workerEvidence(this.runnerPhases.map(phase=>({phase,configuredWorkers:this.configuredWorkers})),checkMethods.methodEvidence([...this.expected.values()], this.results).checks),
        counts,
        status: result.status,
        globalErrors: this.globalErrors,
        buildSelfChecks: this.buildSelfChecks,
        buildSelfCheckHeld: this.buildSelfCheckHeld===undefined?null:structuredClone(this.buildSelfCheckHeld),
        diagnosticSource: this.diagnosticSource,
        nativeEvidence: this.nativeEvidence,
        nativeBusinessScalarHeld:structuredClone(this.nativeBusinessScalarHeld),
        compatibilityEvidence: this.compatibilityEvidence,
        sharedNestedAttemptEvidence:this.sharedNestedAttemptEvidence,
        assuranceTiming: this.assuranceTiming,
        nativeElapsedMs: this.nativeElapsedMs,
        phaseTimings: this.phaseTimings,
        ...(this.eventPreparationTimings === undefined ? {} : {eventPreparationTimings: this.eventPreparationTimings}),
        ...(this.eventRuntimeLifecycleSummary === undefined ? {} : {eventRuntimeLifecycleSummary: this.eventRuntimeLifecycleSummary}),
        ...(this.mandatoryEmailTiming === undefined ? {} : {mandatoryEmailTiming: this.mandatoryEmailTiming}),
        divorceProfileAttempt: this.divorceProfileAttempt,
        personalServiceAttempt:this.personalServiceAttempt,
        complexEmailAttempt:this.complexEmailAttempt,
        startTime: result.startTime.toISOString(),
        duration: result.duration,
      };
      const banner = `<section id="harness-public-run" data-selection="${record.selection}" data-status="${record.status}" data-run-id="${record.runId}"${record.nativeElapsedMs === undefined ? '' : ` data-native-elapsed-ms="${record.nativeElapsedMs}"`}${assuranceTimingAttributes(record.assuranceTiming)}><div class="alert alert-secondary rounded-0 m-0 py-2 small"><strong>Diagnostics ${record.status}${record.nativeEvidence ? ` / Native ${record.nativeEvidence.status}` : ""}${record.personalServiceAttempt?` / Personal event row ${record.personalServiceAttempt.status}`:""}${record.divorceProfileAttempt?` / DIVORCE profile ${record.divorceProfileAttempt.status}`:""}${record.complexEmailAttempt?` / ComplexTypes ${record.complexEmailAttempt.status}`:''}${record.sharedNestedAttemptEvidence?` / Additional nested attempt ${record.sharedNestedAttemptEvidence.status}`:''}.</strong> ${record.nativeEvidence ? "Separate native execution attached;" : "Supporting diagnostics only;"} no release credit. Global errors: ${record.globalErrors}. Detailed diagnostics remain private.</div></section>`;
      html = html.replace(
        '<body id="body-content">',
        `<body id="body-content">${banner}`,
      );
      const presentation = parse(html);
      const runInfo = [...presentation.querySelectorAll('.info-box-header')]
        .find((header) => header.textContent.trim() === 'Run info')?.parentNode;
      if (!runInfo) this.reject();
      const runRows = [...runInfo.querySelectorAll('tr')];
      const setRunInfo = (label, value, renamed = label) => {
        const row = runRows.find((item) => item.querySelector('th')?.textContent.trim() === label);
        if (!row) this.reject();
        row.querySelector('th').textContent = renamed;
        row.querySelector('td').textContent = value;
      };
      const harnessRevision = this.diagnosticSource.commit?.slice(0, 12) || 'unavailable';
      const candidateRevision = this.nativeEvidence?.source.webappCommit?.slice(0, 12);
      setRunInfo('Project', 'EXUI Assurance Harness');
      setRunInfo('Release', candidateRevision ? `EXUI candidate ${candidateRevision} · Harness ${harnessRevision}` : `Harness ${harnessRevision} · candidate not run`, 'Source revisions');
      setRunInfo('Test Environment', this.selection === 'local-aat' ? 'AAT endpoint probes + local diagnostics' : this.nativeEvidence ? 'Isolated local EXUI candidate + CCD; local diagnostics' : 'Local Harness diagnostics only', 'Execution environment');
      for (const [from, to] of [['Execution Start Time', 'Diagnostic start'], ['Execution End Time', 'Diagnostic end']]) {
        const row = runRows.find((item) => item.querySelector('th')?.textContent.trim() === from);
        if (!row) this.reject();
        row.querySelector('th').textContent = to;
      }
      setRunInfo('Total Execution Time', runRows.find((item) => item.querySelector('th')?.textContent.trim() === 'Total Execution Time')?.querySelector('td')?.textContent.trim() || 'Not recorded', 'Diagnostic execution time');
      const [nativeLabel,nativeValue] = nativeIntervalInfo(record);
      runInfo.querySelector('table').insertAdjacentHTML('beforeend', `${renderWorkers(record.diagnosticWorkers)}<tr><th scope="row">${nativeLabel}</th><td>${nativeValue}</td></tr>`);
      runInfo.querySelector('table').insertAdjacentHTML('beforeend', assuranceRunInfo(this.assuranceTiming).map(([label, value]) => `<tr><th scope="row">${label}</th><td>${htmlEscape(value)}</td></tr>`).join(''));
      runInfo.querySelector('table').insertAdjacentHTML('beforeend', require('./harness-native-report.cjs').renderNativeExecutionInfo(this.nativeEvidence));
      runInfo.querySelector('table').insertAdjacentHTML('beforeend', require('./harness-build-self-check-report.cjs').renderBuildSelfCheckWorkers(this.buildSelfChecks));
      [...this.expected].forEach(([identity,entry],index) => {
        const observed = this.results.get(identity);
        const info = presentation.querySelector(`#TabRunInfo-harness-${index}-0`);
        const steps = presentation.querySelector(`#TabSteps-harness-${index}-0`);
        if (!info || !steps) this.reject();
        info.insertAdjacentHTML('beforeend',checkMethods.renderInfo(entry,observed.checkSteps,observed.status));
        steps.innerHTML = checkMethods.renderSteps(entry,observed.checkSteps,observed.status,observed.checkDetails);
      });
      applyPresentation(
        presentation,
        [...this.expected].map(([identity, entry], index) => ({
          target: `#harness-${index}-0`,
          feature: overview.metadataFor(entry).slice.label,
          tags: [
            overview.metadataFor(entry).lane.label,
            ...overview.metadataFor(entry).jurisdictions,
            ...overview.metadataFor(entry).caseTypes,
          ],
          retry: 0,
          durationMs: this.results.get(identity).duration,
        })),
      );
      presentation.querySelector("#TabDashboard").insertAdjacentHTML(
        "beforeend",
        await overview.renderOverview(
          [...this.expected].map(([identity, entry]) => ({
            entry,
            observed: this.results.get(identity),
          })),
          this.selection,
          {
            nativeEvidence: this.nativeEvidence,
            diagnosticSource: this.diagnosticSource,
            buildSelfChecks: this.buildSelfChecks,
          },
        ),
      );
      if (this.nativeEvidence?.mandatoryEmailAdmission) presentation.querySelector('#harness-mandatory-email-admission').replaceWith(require('./harness-mandatory-email-report.cjs').renderMandatoryEmailAdmission(this.nativeEvidence.mandatoryEmailAdmission, this.mandatoryEmailTiming));
      if (this.compatibilityEvidence) presentation.querySelector("#harness-native-evidence").insertAdjacentHTML("afterend", require("./harness-applicant-results-report.cjs").renderApplicantCompatibility(this.compatibilityEvidence));
      if(this.personalServiceAttempt)presentation.querySelector('#TabDashboard').insertAdjacentHTML('beforeend',require('./harness-personal-service-report.cjs').renderPersonalServiceAttempt(this.personalServiceAttempt));
      if (this.complexEmailAttempt) presentation.querySelector('#TabDashboard').insertAdjacentHTML('beforeend', require('./harness-complex-email-report.cjs').renderComplexEmailAttempt(this.complexEmailAttempt));
      if(this.divorceProfileAttempt)presentation.querySelector('#TabDashboard').insertAdjacentHTML('beforeend',require('./harness-divorce-profile-report.cjs').renderDivorceProfileAttempt(this.divorceProfileAttempt));
      if(this.sharedNestedAttemptEvidence)presentation.querySelector('#TabDashboard').insertAdjacentHTML('beforeend',require('./harness-shared-nested-report.cjs').renderSharedNestedAttempt(this.sharedNestedAttemptEvidence));
      if (this.phaseTimings) presentation.querySelector("#TabDashboard").insertAdjacentHTML("beforeend", renderPhaseTimings(this.phaseTimings, this.nativeElapsedMs, false, false, Boolean(this.nativeEvidence?.mandatoryEmailAdmission)));
      if (this.eventPreparationTimings !== undefined) presentation.querySelector("#TabDashboard").insertAdjacentHTML("beforeend", eventPreparationReport.renderEventPreparationTimings(this.eventPreparationTimings));
      if (this.eventRuntimeLifecycleSummary !== undefined) presentation.querySelector("#TabDashboard").insertAdjacentHTML("beforeend", eventPreparationReport.renderEventRuntimeLifecycleTimings(this.eventRuntimeLifecycleSummary));
      presentation
        .querySelector("head")
        .insertAdjacentHTML(
          "beforeend",
          `<style id="harness-coverage-theme">${fs.readFileSync(path.join(__dirname, "harness-report-coverage.css"), "utf8")}</style>`,
        );
      presentation
        .querySelector("body")
        .insertAdjacentHTML(
          "beforeend",
          `<script id="harness-coverage-ui">${fs.readFileSync(path.join(__dirname, "harness-report-coverage.js"), "utf8")}</script>`,
        );
      presentation
        .querySelector("body")
        .insertAdjacentHTML(
          "beforeend",
          `<script id="harness-dashboard-ui">${fs.readFileSync(path.join(__dirname, "harness-public-dashboard.js"), "utf8")}</script>`,
        );
      html = presentation.toString();
      if(this.buildSelfCheckHeld!==undefined){const {readHeldBuildSelfChecks}=await import('./run-harness-self-check-evidence.mjs');if(JSON.stringify(readHeldBuildSelfChecks(this.buildSelfCheckHeld))!==JSON.stringify(this.buildSelfChecks))this.reject();}
      if(this.detailPhaseCaptures!==undefined)require('./harness-public-detail-recorder.cjs').verifyCaptures(this.detailPhaseCaptures);
      validateHtml(html, record);
      record.sha256 = digest(html);
      fs.rmSync(stage, { recursive: true });
      stage = undefined;
      writeExclusive(p.record, `${JSON.stringify(record)}\n`, owned);
      writeExclusive(p.html, html, owned);
      validatePublicReport(this.selection);
    } catch {
      withdraw(owned);
      this.invalid = true;
      throw failure();
    } finally {
      if (stage) fs.rmSync(stage, { recursive: true, force: true });
    }
  }
}
HarnessPublicOdhinReporter.validateAssuranceTiming = validateAssuranceTiming;
HarnessPublicOdhinReporter.captureDiagnosticSource = captureDiagnosticSource;
HarnessPublicOdhinReporter.validatePublicReport = validatePublicReport;
HarnessPublicOdhinReporter.resetPublicReport = resetPublicReport;
module.exports = HarnessPublicOdhinReporter;
