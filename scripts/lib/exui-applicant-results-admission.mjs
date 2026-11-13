import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { digestBytes } from './exui-evidence-io.mjs';
import { loadCommittedConfigurationCatalogue } from './exui-configuration-runtime-coverage.mjs';
import { applicantResultCatalogueContract } from './exui-applicant-results-catalogue.mjs';

const POLICY = 'applicant-results-native-candidate-v1';
const separate = reason => ({ policy: POLICY, status: 'separate', reason, releaseCredit: false, releaseApproval: false });
const candidateFields = ['artifactDigest', 'webappCommit', 'dependencyLockDigest', 'toolkitVersion', 'toolkitDigest'];
const hash = /^sha256:[a-f0-9]{64}$/;

function expectedCatalogueRows(catalogue) {
  return applicantResultCatalogueContract().map(source => {
    const row = catalogue.obligations.find(item => item.id === source.obligationId);
    assert(row, 'APPLICANT_CATALOGUE_ROW_MISSING');
    return { obligationId: row.id, family: row.family, kind: row.kind, requiredBoundary: row.requiredBoundary, sourceKeys: row.sourceKeys };
  });
}

export function applyApplicantResultsAdmission(native, applicant) {
  const fail = 'APPLICANT_ADMISSION_INVALID';
  assert(native?.source && native?.catalogueCoverage && native.releaseApproval === false, fail);
  assert.equal(applicant?.status, 'PASS', fail);
  assert.equal(applicant?.cleanupComplete, true, fail);
  assert.match(applicant.producerCommit, /^[a-f0-9]{40}$/, fail);
  assert.match(applicant.sourceDigest, hash, fail);
  assert.match(applicant.harnessDependencyDigest, hash, fail);
  assert.match(applicant.browserDigest, hash, fail);
  assert.match(applicant.catalogueDigest, hash, fail);
  assert.deepEqual(Object.keys(applicant.candidate ?? {}).sort(), candidateFields.slice().sort(), fail);
  for (const field of ['artifactDigest', 'dependencyLockDigest', 'toolkitDigest']) assert.match(applicant.candidate[field], hash, fail);
  assert.match(applicant.candidate.webappCommit, /^[a-f0-9]{40}$/, fail);
  assert.match(applicant.candidate.toolkitVersion, /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/, fail);
  assert(applicant.dependencies && typeof applicant.dependencies === 'object', fail);
  assert.equal(applicant.dependencies.ccd?.artifactDigest, applicant.dataImageDigest, fail);
  assert.deepEqual(Object.keys(applicant.ccdRuntime ?? {}).sort(), ['elasticsearch', 'localProfile', 'profileDigest'], fail);
  assert.equal(typeof applicant.ccdRuntime.elasticsearch, 'boolean', fail);
  assert.equal(typeof applicant.ccdRuntime.localProfile, 'boolean', fail);
  assert(applicant.ccdRuntime.profileDigest === null || hash.test(applicant.ccdRuntime.profileDigest), fail);
  const { catalogue } = loadCommittedConfigurationCatalogue();
  const catalogueDigest = digestBytes(JSON.stringify(catalogue.obligations));
  const rows = expectedCatalogueRows(catalogue);
  assert.deepEqual(applicant.catalogueRows, rows, fail);

  const coverage = native.catalogueCoverage, source = native.source;
  assert.equal(coverage.releaseCredit, false, fail);
  assert.equal(coverage.selected, 112, fail);
  assert.equal(coverage.catalogueDigest, catalogueDigest, fail);
  if (applicant.catalogueDigest !== catalogueDigest) return separate('different-catalogue');
  if (source.harnessCommit !== applicant.producerCommit) return separate('different-producer');
  if (source.harnessSourceDigest !== applicant.sourceDigest) return separate('different-source');
  if (source.candidate?.artifactDigest !== applicant.candidate.artifactDigest || source.candidate?.webappCommit !== applicant.candidate.webappCommit) return separate('different-candidate');
  if (candidateFields.some(field => source.candidate?.[field] !== applicant.candidate[field])) return separate('different-candidate');
  if (!isDeepStrictEqual(source.ccdDependencies, applicant.dependencies) || source.harnessDependencyDigest !== applicant.harnessDependencyDigest) return separate('different-dependencies');
  if (source.browserDigest !== applicant.browserDigest) return separate('different-browser');
  if (!isDeepStrictEqual(source.ccdRuntime, applicant.ccdRuntime)) return separate('different-ccd-runtime');

  const ids = rows.map(row => row.obligationId);
  assert.equal(new Set(coverage.creditedObligationIds).size, coverage.creditedObligationIds.length, fail);
  assert(ids.every(id => !coverage.creditedObligationIds.includes(id)), 'APPLICANT_DUPLICATE_CREDIT');
  assert(coverage.missing >= ids.length, fail);
  assert.equal(coverage.candidate + coverage.ccd, coverage.creditedObligationIds.length, fail);
  assert.equal(coverage.selected - coverage.missing, coverage.creditedObligationIds.length, fail);
  const joint = {
    policy: POLICY, status: 'included', obligationIds: ids,
    nativeRunId: native.jobRunId, profileRunId: applicant.runId,
    producerCommit: applicant.producerCommit, producerDigest: applicant.sourceDigest,
    candidateArtifactDigest: applicant.candidate.artifactDigest, candidateCommit: applicant.candidate.webappCommit,
    harnessDependencyDigest: applicant.harnessDependencyDigest, browserDigest: applicant.browserDigest,
    catalogueDigest, sourceRows: rows.map(({ obligationId, sourceKeys }) => ({ obligationId, sourceKeys })),
    releaseCredit: false, releaseApproval: false,
  };
  coverage.creditedObligationIds.push(...ids);
  coverage.candidate += ids.length;
  coverage.missing -= ids.length;
  coverage.applicantResultsAdmission = joint;
  return joint;
}
