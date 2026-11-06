import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { digestBytes } from './exui-evidence-io.mjs';
import { definitionDigest } from './exui-definition-references.mjs';
import { assertFreshCandidateDerivationOutput } from './exui-candidate-artifact.mjs';
import { deriveSelectorEventRowFixture } from './exui-selector-event-row-contract.mjs';

export const WARNING_OBLIGATION = 'configuration-shape:6720379b6c70609aec057b75a0d290a3e79a4839757c127c1330736a61bec593';
export const WARNING_VARIANTS = Object.freeze(['baseline', 'condition-equals-empty']);
const sourceDigest = 'sha256:c7ca8f869f41a505c5a1819ca7e66d19e3637aa1ad0dda69702fd1f56c1c4fc1';
const sourcePath = 'definitions/private-law/json/CaseEventToFields/ServiceOfDocuments/Page2/CaseEventToFields.json';
const sourceRow = Object.freeze({ LiveFrom: '01/09/2024', CaseTypeID: 'PRLAPPS', CaseEventID: 'serviceOfDocuments',
  CaseFieldID: 'missingAddressWarningTextLabel', DisplayContext: 'READONLY', PageID: 2,
  PageDisplayOrder: 2, PageFieldDisplayOrder: 1, ShowSummaryChangeOption: 'N', FieldShowCondition: 'missingAddressWarningText!=""' });
export const WARNING_ATTRIBUTES = Object.freeze(Object.keys(sourceRow).sort());
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const sourceFile = fileURLToPath(new URL('../fixtures/ccd/conditional-warning.source.json', import.meta.url));
const noCredit = () => ({ activationClaim: false, sourceComplete: false, runtimeAcceptance: false, catalogueCredit: false, releaseCredit: false });

export function conditionalWarningRow(fixture) {
  const rows = fixture.sheets.CaseEventToFields.filter(row => row.CaseEventID === sourceRow.CaseEventID && row.CaseFieldID === sourceRow.CaseFieldID);
  assert.equal(rows.length, 1, 'WARNING_EXACT_ROW');
  return rows[0];
}

export function conditionalWarningMutation() {
  return { sheet: 'CaseEventToFields', event: sourceRow.CaseEventID, field: sourceRow.CaseFieldID,
    column: 'FieldShowCondition', before: sourceRow.FieldShowCondition, after: 'missingAddressWarningText=""' };
}

export function deriveConditionalWarningFixture(variant = 'baseline') {
  assert(WARNING_VARIANTS.includes(variant), 'WARNING_VARIANT');
  const bytes = fs.readFileSync(sourceFile);
  assert.equal(digestBytes(bytes), sourceDigest, 'WARNING_SOURCE_BYTES');
  const source = JSON.parse(bytes), [event, backing] = source.sources;
  assert.equal(source.repository, 'hmcts/prl-ccd-definitions', 'WARNING_SOURCE_REPOSITORY');
  assert.equal(source.revision, '694b9951e94369f1394380506960c4f04f25755d', 'WARNING_SOURCE_REVISION');
  assert.equal(event.path, sourcePath, 'WARNING_SOURCE_PATH');
  assert.deepEqual(event.rows.map(item => item.row), [sourceRow], 'WARNING_SOURCE_ROW');
  for (const file of source.sources) for (const item of file.rows) assert.equal(definitionDigest(item.row), item.rowDigest, 'WARNING_SOURCE_ROW_DIGEST');
  const catalogue = JSON.parse(fs.readFileSync(new URL('../fixtures/exui-configuration-source.json', import.meta.url)));
  const matches = catalogue.sources.filter(item => item.repository === 'prl-ccd-definitions' && item.path === sourcePath);
  assert.equal(matches.length, 1, 'WARNING_CATALOGUE_SOURCE');
  assert.equal(matches[0].revision, source.revision, 'WARNING_CATALOGUE_REVISION');
  assert.equal('sha256:' + matches[0].fileDigest, event.fileDigest, 'WARNING_CATALOGUE_FILE');
  assert.deepEqual(matches[0].document[event.rows[0].index], sourceRow, 'WARNING_CATALOGUE_ROW');
  assert.equal('configuration-shape:' + definitionDigest({ source: 'prl-ccd-definitions:' + sourcePath, row: sourceRow }).slice(7), WARNING_OBLIGATION, 'WARNING_CATALOGUE_ID');
  const derivative = deriveSelectorEventRowFixture(), fixture = derivative.fixture;
  // Keep a visible CYA control even though the selected source Label is excluded.
  fixture.sheets.CaseEventToFields.find(row => row.CaseEventID === sourceRow.CaseEventID && row.CaseFieldID === 'protectedValue').ShowSummaryChangeOption = 'Y';
  const grants = fixture.sheets.AuthorisationCaseField.filter(row => row.CaseFieldID === 'sodAdditionalRecipients');
  for (const { row } of backing.rows) {
    assert(!fixture.sheets.CaseField.some(field => field.ID === row.ID), 'WARNING_DUPLICATE_BACKING_FIELD');
    fixture.sheets.CaseField.push({ ...row, CaseTypeID: 'HarnessNestedPRL' });
    // Controlled bootstrap/observer/actor grants are scaffolding, not PRL ACL proof.
    fixture.sheets.AuthorisationCaseField.push(...grants.map(grant => ({ ...grant, CaseFieldID: row.ID })));
  }
  fixture.sheets.CaseEventToFields.push({ ...sourceRow, CaseTypeID: 'HarnessNestedPRL' }, {
    LiveFrom: '01/01/2020', CaseTypeID: 'HarnessNestedPRL', CaseEventID: 'create',
    CaseFieldID: 'missingAddressWarningText', DisplayContext: 'OPTIONAL', PageID: 2,
    PageDisplayOrder: 2, PageFieldDisplayOrder: 10, ShowSummaryChangeOption: 'N',
  });
  if (variant === 'condition-equals-empty') conditionalWarningRow(fixture).FieldShowCondition = conditionalWarningMutation().after;
  return { fixture, callbackBinding: derivative.callbackBinding, binding: {
    schemaVersion: 1, kind: 'conditional-warning-source-binding', variant, obligationId: WARNING_OBLIGATION,
    sourceRepository: source.repository, sourceRevision: source.revision, sourcePath, sourceFileDigest: event.fileDigest,
    sourceRowDigest: event.rows[0].rowDigest, sourceIndex: event.rows[0].index, sourceSnapshotDigest: sourceDigest,
    sourceAttributes: [...WARNING_ATTRIBUTES], sourceCaseType: 'PRLAPPS', caseType: 'HarnessNestedPRL',
    eventId: sourceRow.CaseEventID, fieldId: sourceRow.CaseFieldID, pageId: 'serviceOfDocuments2', pageOrder: 2, fieldOrder: 1,
    liveFrom: '2024-09-01', supportingSources: [{ path: backing.path, fileDigest: backing.fileDigest,
      rows: backing.rows.map(item => ({ index: item.index, rowDigest: item.rowDigest })) }],
    supportingContext: { predecessor: 'protectedValue:READONLY:serviceOfDocumentsharnessBefore:order1:summaryY',
      sourcePageProjection: ['missingAddressWarningTextLabel', 'sodAdditionalRecipients', 'sodAdditionalRecipientsList'],
      bootstrap: 'create:missingAddressWarningText:OPTIONAL:page2:order10',
      grants: 'copy-existing-selector-scaffold-grants-for-both-backing-fields-no-source-ACL-claim',
      neighbouringCallback: 'omitted-controlled-context-no-business-workflow-claim' },
    consumerLimits: { readonly: 'Label-inherently-noneditable-no-isolated-editability-proof',
      interpolation: 'source-placeholder-retained-runtime-not-executed',
      hiddenSubmission: 'READONLY-skips-field-condition-reset-exact-wire-and-state-unproved' },
    ...noCredit(),
  } };
}

export function validateConditionalWarningFixture(value, variant = 'baseline') {
  assert.deepEqual(value, deriveConditionalWarningFixture(variant), 'WARNING_CANONICAL_FIXTURE');
  return value.binding;
}

export async function prepareConditionalWarningWorkbook(output, variant = 'baseline') {
  const derived = deriveConditionalWarningFixture(variant);
  const destination = await assertFreshCandidateDerivationOutput({ baseline: { candidateRoot: path.resolve(ROOT) }, manifestPath: sourceFile, output });
  fs.mkdirSync(destination, { mode: 0o700 });
  const definition = path.join(destination, 'definition.json'), workbook = path.join(destination, 'definition.xlsx');
  fs.writeFileSync(definition, JSON.stringify(derived.fixture, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  const result = spawnSync('python3', [path.join(ROOT, 'scripts/fixtures/ccd/workbook.py'), definition, workbook], {
    encoding: 'utf8', timeout: 30_000, maxBuffer: 1024 * 1024,
    env: { PATH: process.env.PATH, HOME: process.env.HOME ?? os.homedir(), PYTHONDONTWRITEBYTECODE: '1' },
  });
  assert(!result.error && result.status === 0, 'WARNING_WORKBOOK_FAILED');
  fs.chmodSync(workbook, 0o600);
  const binding = { schemaVersion: 1, kind: 'conditional-warning-workbook', binding: derived.binding,
    definitionDigest: digestBytes(fs.readFileSync(definition)), workbookDigest: digestBytes(fs.readFileSync(workbook)), ...noCredit() };
  fs.writeFileSync(path.join(destination, 'binding.json'), JSON.stringify(binding, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  return binding;
}
