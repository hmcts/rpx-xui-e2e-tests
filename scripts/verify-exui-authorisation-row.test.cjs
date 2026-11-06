const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const contract = () => import('./lib/exui-authorisation-row-contract.mjs');
const fixtures = () => import('./lib/exui-authorisation-row-fixture.mjs');
const roles = ['courtadmin', 'systemupdate', 'judge', 'la', 'readonly'].map(value => `caseworker-privatelaw-${value}`);
const frozen = ['scripts/lib/exui-release-policy.mjs', 'scripts/lib/exui-native-sources.mjs', 'scripts/lib/exui-selector-event-row-contract.mjs', 'scripts/fixtures/exui-configuration-source.json', 'scripts/fixtures/exui-configuration-review.json', 'scripts/fixtures/ccd/event-capability.source.json'];
const snapshot = () => Object.fromEntries(frozen.map(file => [file, createHash('sha256').update(fs.readFileSync(path.join(__dirname, '..', file))).digest('hex')]));
const before = snapshot();
const noCredit = value => {
  for (const key of ['runtimeAcceptance', 'sourceComplete', 'catalogueCredit', 'releaseCredit']) assert.equal(value[key], false, key);
};

test('foundation only: one existing row, all four attributes and five source actors; no admission', async () => {
  const api = await contract(), value = api.authorisationRowContract();
  const { catalogue } = (await import('./lib/exui-configuration-runtime-coverage.mjs')).loadCommittedConfigurationCatalogue();
  assert.equal(catalogue.obligations.length, 112);
  assert.equal(value.obligationId, 'configuration-shape:66ff76e7342bbf62e584059136d4c1f97a25a7078e74549a5c4665d9e0e57142');
  const rows = catalogue.obligations.filter(row => row.id === value.obligationId);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].requiredBoundary, 'ccd');
  assert.deepEqual(rows[0].sourceKeys, [`prl-ccd-definitions:${value.source.path}`]);
  assert.deepEqual(value.source.attributes, ['AccessControl', 'CaseEventID', 'CaseTypeID', 'LiveFrom']);
  assert.deepEqual(value.actors, roles);
  assert.deepEqual(value.normalization, { sourceCaseType: 'PRLAPPS', caseType: 'HarnessNestedPRL', sourceJurisdiction: 'PRIVATELAW', jurisdiction: 'HARNESS', eventId: 'serviceOfDocuments', state: 'JUDICIAL_REVIEW', eventRenamed: false });
  assert.equal(value.requiredEvidence.date.expectedIgnoredDate, null);
  assert.equal(value.requiredEvidence.date.observed, false);
  assert.equal(value.requiredEvidence.date.activationClaim, false);
  assert.equal(value.requiredEvidence.date.retentionClaim, false);
  assert.equal(value.requiredEvidence.delete.expected, false);
  noCredit(value);
});

test('foundation only: baseline imports exact five ACL rows with original date and all source-backed rights', async () => {
  const api = await fixtures(), value = api.deriveAuthorisationRowFixture();
  assert.equal(value.runnable, false);
  assert.equal(value.change, null);
  assert.deepEqual(value.sheets.AuthorisationCaseEvent, roles.map((role, i) => ({ LiveFrom: '01/09/2024', CaseTypeID: 'HarnessNestedPRL', CaseEventID: 'serviceOfDocuments', UserRole: role, CRUD: i < 2 ? 'CRU' : 'R' })));
  assert.deepEqual(value.rawRow.AccessControl, [{ UserRoles: roles.slice(0, 2), CRUD: 'CRU' }, { UserRoles: roles.slice(2), CRUD: 'R' }]);
  for (const [i, role] of roles.entries()) {
    assert.deepEqual(value.sheets.AuthorisationCaseType[i], { LiveFrom: '01/07/2021', CaseTypeID: 'HarnessNestedPRL', UserRole: role, CRUD: ['CRU', 'CRUD', 'RU', 'RU', 'R'][i] });
    assert.deepEqual(value.sheets.AuthorisationCaseState[i], { CaseTypeID: 'HarnessNestedPRL', CaseStateID: 'JUDICIAL_REVIEW', UserRole: role, CRUD: i === 4 ? 'R' : 'CRUD' });
    for (const [field, permission] of [['sodAdditionalRecipients', i === 4 ? 'R' : 'CRU'], ['sodAdditionalRecipientsList', i === 4 ? 'R' : 'CRUD']]) {
      assert.deepEqual(value.sheets.AuthorisationCaseField.find(row => row.UserRole === role && row.CaseFieldID === field), { LiveFrom: '01/09/2024', CaseTypeID: 'HarnessNestedPRL', CaseFieldID: field, UserRole: role, CRUD: permission });
    }
  }
  assert.equal(value.sheets.AuthorisationCaseField.length, 10);
  api.validateAuthorisationRowFixture(value);
  noCredit(value);
  assert.deepEqual(snapshot(), before);
});

for (const [variant, crud] of [['remove-create', 'RU'], ['remove-read', 'CU'], ['remove-update', 'CR']]) {
  test(`foundation only: ${variant} is one grouped source CRUD cell and two derived cells`, async () => {
    const api = await fixtures(), baseline = api.deriveAuthorisationRowFixture(), mutant = api.deriveAuthorisationRowFixture(variant);
    const expected = structuredClone(baseline.rawRow); expected.AccessControl[0].CRUD = crud;
    assert.deepEqual(mutant.rawRow, expected);
    assert.deepEqual(mutant.sheets.AuthorisationCaseEvent.map(row => row.CRUD), [crud, crud, 'R', 'R', 'R']);
    assert.deepEqual(mutant.rawRow.AccessControl.map(group => group.UserRoles), [roles.slice(0, 2), roles.slice(2)]);
    const result = api.validateAuthorisationRowFault(baseline, mutant, variant);
    assert.equal(result.sourceCells, 1); assert.equal(result.derivedImportCells, 2);
    assert.deepEqual(result.affectedRoles, roles.slice(0, 2));
    assert.equal(result.effectiveObserved, false); noCredit(result);
    for (const sheet of ['AuthorisationCaseType', 'AuthorisationCaseState', 'AuthorisationCaseField']) assert.deepEqual(mutant.sheets[sheet], baseline.sheets[sheet]);
  });
}
for (const [variant, date] of [['date-past', '01/01/2000'], ['date-future', '01/01/2099']]) {
  test(`foundation only: ${variant} retains permissions and cannot count as effective fault`, async () => {
    const api = await fixtures(), baseline = api.deriveAuthorisationRowFixture(), control = api.deriveAuthorisationRowFixture(variant);
    const expected = structuredClone(baseline.rawRow); expected.LiveFrom = date;
    assert.deepEqual(control.rawRow, expected);
    assert.deepEqual(control.sheets.AuthorisationCaseEvent, baseline.sheets.AuthorisationCaseEvent.map(row => ({ ...row, LiveFrom: date })));
    assert.equal(control.change.effectiveFault, false); assert.equal(control.change.observed, false);
    assert.equal(control.contract.requiredEvidence.date.expectedIgnoredDate, null);
    assert.throws(() => api.validateAuthorisationRowFault(baseline, control, variant), /AUTH_ROW_EFFECTIVE_FAULT_REQUIRED/);
    api.validateAuthorisationRowFixture(control, variant); noCredit(control);
  });
}

const corruptions = {
  'missing systemupdate actor': value => value.sheets.AuthorisationCaseEvent.splice(1, 1),
  'missing la actor': value => value.sheets.AuthorisationCaseEvent.splice(3, 1),
  'extra observer grant': value => value.sheets.AuthorisationCaseEvent.push({ ...value.sheets.AuthorisationCaseEvent[0], UserRole: 'caseworker-harness-observer' }),
  'duplicate actor': value => value.sheets.AuthorisationCaseEvent.push(value.sheets.AuthorisationCaseEvent[0]),
  'missing backing type right': value => value.sheets.AuthorisationCaseType.splice(1, 1),
  'invented readonly backing U': value => { value.sheets.AuthorisationCaseType[4].CRUD = 'RU'; },
  'extra backing state D': value => { value.sheets.AuthorisationCaseState[4].CRUD = 'RD'; },
  'wrong field permission': value => { value.sheets.AuthorisationCaseField[0].CRUD = 'R'; },
  'changed grouped membership': value => value.rawRow.AccessControl[0].UserRoles.pop(),
  'third raw group': value => value.rawRow.AccessControl.push({ UserRoles: ['extra-role'], CRUD: 'R' }),
  'extra raw source attribute': value => { value.rawRow.DisplayContext = 'OPTIONAL'; },
  'missing date facet': value => { delete value.contract.requiredEvidence.date; },
  'invented typed retention': value => { value.contract.requiredEvidence.date.retentionClaim = true; },
  'date control claimed observed': value => { value.contract.requiredEvidence.date.observed = true; },
  'sourceComplete promotion': value => { value.sourceComplete = true; },
  'runtime promotion': value => { value.runtimeAcceptance = true; },
  'catalogue promotion': value => { value.catalogueCredit = true; },
  'release promotion': value => { value.releaseCredit = true; },
};
for (const [name, change] of Object.entries(corruptions)) test(`foundation rejects ${name}`, async () => {
  const api = await fixtures(), value = api.deriveAuthorisationRowFixture(); change(value);
  assert.throws(() => api.validateAuthorisationRowFixture(value), /AUTH_ROW_CANONICAL_FRAGMENT_REQUIRED/);
});

test('foundation rejects normalized-only single-actor fault, multi-source-cell fault and unchanged mutant', async () => {
  const api = await fixtures(), baseline = api.deriveAuthorisationRowFixture();
  const onlyOne = api.deriveAuthorisationRowFixture('remove-create'); onlyOne.sheets.AuthorisationCaseEvent[1].CRUD = 'CRU';
  const multi = api.deriveAuthorisationRowFixture('remove-create'); multi.rawRow.AccessControl[1].CRUD = 'CR';
  for (const mutant of [onlyOne, multi, baseline]) assert.throws(() => api.validateAuthorisationRowFault(baseline, mutant, 'remove-create'), /AUTH_ROW_CANONICAL_FRAGMENT_REQUIRED/);
  const date = api.deriveAuthorisationRowFixture('date-past'); date.change.effectiveFault = true;
  assert.throws(() => api.validateAuthorisationRowFixture(date, 'date-past'), /AUTH_ROW_CANONICAL_FRAGMENT_REQUIRED/);
});

test('foundation rejects source/backing alterations even with recomputed row digest', async () => {
  const api = await contract(), fixture = await fixtures(), { definitionDigest } = await import('./lib/exui-definition-references.mjs');
  for (const alteration of ['missing-role', 'rights', 'extra-source']) {
    const inputs = api.readAuthorisationRowSources();
    if (alteration === 'missing-role') inputs.backing.sources[0].rows.pop();
    if (alteration === 'rights') { const row = inputs.backing.sources[0].rows[0]; row.row.CRUD = 'CRUD'; row.rowDigest = definitionDigest(row.row); }
    if (alteration === 'extra-source') inputs.backing.sources.push(inputs.backing.sources[0]);
    assert.throws(() => fixture.deriveAuthorisationRowFixture('baseline', inputs), /AUTH_ROW_BACKING_SOURCE_SEAL/);
  }
  assert.throws(() => fixture.deriveAuthorisationRowFixture('enable-delete'), /AUTH_ROW_VARIANT/);
  assert.deepEqual(snapshot(), before);
});
