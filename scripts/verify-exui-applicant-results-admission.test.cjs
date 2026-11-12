const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');

const hash = value => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const commit = 'a'.repeat(40);

async function fixture() {
  const [{ applicantResultCatalogueContract }, { loadCommittedConfigurationCatalogue }, { digestBytes }] = await Promise.all([
    import('./lib/exui-applicant-results-catalogue.mjs'),
    import('./lib/exui-configuration-runtime-coverage.mjs'),
    import('./lib/exui-evidence-io.mjs'),
  ]);
  const { catalogue } = loadCommittedConfigurationCatalogue();
  const rows = applicantResultCatalogueContract().map(({ obligationId }) => {
    const { id, family, kind, requiredBoundary, sourceKeys } = catalogue.obligations.find(item => item.id === obligationId);
    return { obligationId: id, family, kind, requiredBoundary, sourceKeys };
  });
  const catalogueDigest = digestBytes(JSON.stringify(catalogue.obligations));
  const candidate = {
    artifactDigest: hash('artifact'), webappCommit: commit, dependencyLockDigest: hash('lock'),
    toolkitVersion: '1.2.3', toolkitDigest: hash('toolkit'),
  };
  const dependencies = {
      ccd: { artifactDigest: hash('ccd'), apiContractDigest: hash('ccd-api') },
      'ccd-definition': { artifactDigest: hash('definitions'), apiContractDigest: hash('definitions-api') },
  };
  const applicant = {
    status: 'PASS', cleanupComplete: true, producerCommit: commit, sourceDigest: hash('source'),
    harnessDependencyDigest: hash('dependencies'), browserDigest: hash('browser'), candidate, dependencies, dataImageDigest: hash('ccd'),
    ccdRuntime: { elasticsearch: false, localProfile: false, profileDigest: null },
    catalogueDigest, catalogueRows: rows, runId: 'ccd-11111111-1111-4111-8111-111111111111',
  };
  const native = {
    releaseApproval: false,
    source: {
      harnessCommit: commit, harnessSourceDigest: applicant.sourceDigest,
      harnessDependencyDigest: applicant.harnessDependencyDigest, browserDigest: applicant.browserDigest,
      candidate: structuredClone(candidate), ccdDependencies: structuredClone(dependencies),
      ccdRuntime: { elasticsearch: false, localProfile: false, profileDigest: null },
    },
    jobRunId: 'ci-11111111-1111-4111-8111-111111111111',
    catalogueCoverage: {
      catalogueDigest, selected: 112, candidate: 5, ccd: 10, missing: 97,
      creditedObligationIds: Array.from({length: 15}, (_, index) => `existing:${index}`), releaseCredit: false,
    },
  };
  return { applicant, native, rows };
}

test('joins applicant result rows only to the exact candidate, producer, runtime and catalogue', async () => {
  const { applyApplicantResultsAdmission } = await import('./lib/exui-applicant-results-admission.mjs');
  const { applicant, native, rows } = await fixture();
  const joint = applyApplicantResultsAdmission(native, applicant);
  assert.equal(joint.status, 'included');
  assert.deepEqual(joint.obligationIds, rows.map(row => row.obligationId));
  assert.equal(joint.catalogueDigest, native.catalogueCoverage.catalogueDigest);
  assert.equal(native.catalogueCoverage.candidate, 8);
  assert.equal(native.catalogueCoverage.ccd, 10);
  assert.equal(native.catalogueCoverage.missing, 94);
  assert.equal(native.catalogueCoverage.creditedObligationIds.filter(id => rows.some(row => row.obligationId === id)).length, 3);
  assert.equal(native.catalogueCoverage.releaseCredit, false);
  assert.equal(native.releaseApproval, false);
});

test('keeps valid applicant evidence separate when any candidate or runtime identity differs', async () => {
  const { applyApplicantResultsAdmission } = await import('./lib/exui-applicant-results-admission.mjs');
  for (const [mutate, reason] of [
    [value => { value.producerCommit = 'b'.repeat(40); }, 'different-producer'],
    [value => { value.sourceDigest = hash('other-source'); }, 'different-source'],
    [value => { value.candidate.artifactDigest = hash('other-artifact'); }, 'different-candidate'],
    [value => { value.dependencies.ccd.artifactDigest = hash('other-ccd'); value.dataImageDigest = hash('other-ccd'); }, 'different-dependencies'],
    [value => { value.harnessDependencyDigest = hash('other-dependencies'); }, 'different-dependencies'],
    [value => { value.browserDigest = hash('other-browser'); }, 'different-browser'],
    [value => { value.ccdRuntime.localProfile = true; value.ccdRuntime.profileDigest = hash('local-profile'); }, 'different-ccd-runtime'],
    [value => { value.catalogueDigest = hash('other-catalogue'); }, 'different-catalogue'],
  ]) {
    const { applicant, native } = await fixture();
    mutate(applicant);
    const before = structuredClone(native.catalogueCoverage);
    const joint = applyApplicantResultsAdmission(native, applicant);
    assert.deepEqual(joint, { policy: 'applicant-results-native-candidate-v1', status: 'separate', reason, releaseCredit: false, releaseApproval: false });
    assert.deepEqual(native.catalogueCoverage, before);
  }
});

test('rejects altered catalogue rows, duplicate admission, and incomplete evidence', async () => {
  const { applyApplicantResultsAdmission } = await import('./lib/exui-applicant-results-admission.mjs');
  for (const mutate of [
    value => { value.catalogueRows[0].sourceKeys[0] = 'invented-source'; },
    value => { value.catalogueRows.pop(); },
    value => { value.catalogueRows[1] = structuredClone(value.catalogueRows[0]); },
    value => { value.cleanupComplete = false; },
  ]) {
    const { applicant, native } = await fixture();
    mutate(applicant);
    assert.throws(() => applyApplicantResultsAdmission(native, applicant));
  }
  const { applicant, native, rows } = await fixture();
  native.catalogueCoverage.creditedObligationIds.push(rows[0].obligationId);
  assert.throws(() => applyApplicantResultsAdmission(native, applicant));
});

test('native report validates admitted result rows against its held candidate evidence', async t => {
  const { applyApplicantResultsAdmission } = await import('./lib/exui-applicant-results-admission.mjs');
  const { readNativeReportEvidence } = await import('./lib/exui-native-report-evidence.mjs');
  const packet = await require('./fixtures/exui-native-report-packet.mock.cjs').fixture(t);
  const native = await readNativeReportEvidence(packet.descriptorPath);
  const { applicant } = await fixture();
  Object.assign(applicant, {
    producerCommit: native.source.harnessCommit,
    sourceDigest: native.source.harnessSourceDigest,
    harnessDependencyDigest: native.source.harnessDependencyDigest,
    browserDigest: native.source.browserDigest,
    candidate: structuredClone(native.source.candidate),
    dependencies: structuredClone(native.source.ccdDependencies),
    dataImageDigest: native.source.ccdDependencies.ccd.artifactDigest,
    ccdRuntime: structuredClone(native.source.ccdRuntime),
    catalogueDigest: native.catalogueCoverage.catalogueDigest,
  });
  const joint = applyApplicantResultsAdmission(native, applicant);
  assert.equal(joint.status, 'included');
  const { renderNativeEvidence } = require('./harness-native-report.cjs');
  assert.doesNotThrow(() => renderNativeEvidence(native));
  const forged = structuredClone(native);
  forged.catalogueCoverage.applicantResultsAdmission.sourceRows[0].sourceKeys[0] = 'foreign-source';
  assert.throws(() => renderNativeEvidence(forged));
});
