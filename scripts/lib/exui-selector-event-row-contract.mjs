import assert from 'node:assert/strict';
import fs from 'node:fs';
import { deriveRecipientCallbackImport } from './exui-recipient-callback-fixture.mjs';
import { validateEventCapabilitySource } from './exui-ccd-event-capability.mjs';

export const SELECTOR_EVENT_OBLIGATION = 'configuration-shape:bbfb8dfe6d409d6df3291b434a305a3ac5237d63d21ba8c0695b787af62913fe';
export const SELECTOR_EVENT_ATTRIBUTES = Object.freeze(['LiveFrom', 'CaseTypeID', 'CaseEventID', 'CaseFieldID', 'DisplayContext', 'PageID', 'PageDisplayOrder', 'PageFieldDisplayOrder', 'ShowSummaryChangeOption'].sort());
export const SELECTOR_EVENT_VARIANTS = Object.freeze(['baseline', 'summary-hidden']);
export const SELECTOR_EVENT_FAILURE = 'selector-event-summary-row';
const sourcePath = 'definitions/private-law/json/CaseEventToFields/ServiceOfDocuments/Page2/CaseEventToFields.json';
const rowDigest = 'sha256:784681d796ae33bb0c2d5948ac07c948895d303cd39e7c0acd3562e9e518cd9d';
const sourceRow = Object.freeze({ LiveFrom: '01/09/2024', CaseTypeID: 'PRLAPPS', CaseEventID: 'serviceOfDocuments', CaseFieldID: 'sodAdditionalRecipients', DisplayContext: 'OPTIONAL', PageID: 2, PageDisplayOrder: 2, PageFieldDisplayOrder: 7, ShowSummaryChangeOption: 'Y' });
const read = file => JSON.parse(fs.readFileSync(new URL(file, import.meta.url), 'utf8'));

export function selectorEventRow(fixture) {
  const rows = fixture.sheets.CaseEventToFields.filter(row => row.CaseEventID === sourceRow.CaseEventID && row.CaseFieldID === sourceRow.CaseFieldID);
  assert.equal(rows.length, 1, 'SELECTOR_EXACT_EVENT_ROW_REQUIRED');
  return rows[0];
}

export function deriveSelectorEventRowFixture(variant = 'baseline') {
  assert(SELECTOR_EVENT_VARIANTS.includes(variant), 'SELECTOR_VARIANT_REQUIRED');
  const source = read('../fixtures/ccd/event-capability.source.json');
  validateEventCapabilitySource(source);
  const file = source.sources.find(file => file.path === sourcePath);
  const selected = file.rows.find(item => item.index === 6);
  assert.equal(selected.rowDigest, rowDigest, 'SELECTOR_SOURCE_ROW_DIGEST');
  assert.deepEqual(selected.row, sourceRow, 'SELECTOR_SOURCE_ROW_DRIFT');
  assert.deepEqual(Object.keys(selected.row).sort(), SELECTOR_EVENT_ATTRIBUTES, 'SELECTOR_UNCLASSIFIED_FACET');
  // The full source page has no group condition. The execution slice retains only
  // source rows 7/8, plus its separately declared synthetic predecessor.
  const catalogue = read('../fixtures/exui-configuration-source.json');
  const complete = catalogue.sources.filter(item => item.repository === 'prl-ccd-definitions' && item.path === sourcePath);
  assert.equal(complete.length, 1, 'SELECTOR_CATALOGUE_SOURCE_REQUIRED');
  assert.equal(complete[0].revision, source.revision, 'SELECTOR_CATALOGUE_REVISION');
  assert.equal('sha256:' + complete[0].fileDigest, file.fileDigest, 'SELECTOR_CATALOGUE_FILE_DIGEST');
  assert.equal(complete[0].document.length, 8, 'SELECTOR_SOURCE_PAGE_DRIFT');
  assert.deepEqual(complete[0].document[6], sourceRow, 'SELECTOR_CATALOGUE_ROW_DRIFT');
  assert(complete[0].document.every(row => row.PageID === 2 && row.PageDisplayOrder === 2 && !Object.hasOwn(row, 'PageShowCondition')), 'SELECTOR_SOURCE_PAGE_DRIFT');
  // The neighbouring business callback belongs to a different source row. Keep
  // its existing declared omission equal in both variants; its dedicated proof
  // remains unchanged. The selected row itself has no callback attribute.
  const derivative = deriveRecipientCallbackImport('binding-omitted', true);
  const row = selectorEventRow(derivative.fixture);
  assert.deepEqual(row, { ...sourceRow, CaseTypeID: 'HarnessNestedPRL' }, 'SELECTOR_NORMALIZATION_DRIFT');
  if (variant === 'summary-hidden') row.ShowSummaryChangeOption = 'N';
  return {
    fixture: derivative.fixture,
    callbackBinding: derivative.binding,
    binding: {
      schemaVersion: 1, kind: 'selector-event-row-source-binding', obligationId: SELECTOR_EVENT_OBLIGATION,
      sourceRepository: source.repository, sourceRevision: source.revision, sourcePath,
      sourceFileDigest: file.fileDigest, sourceRowDigest: rowDigest, sourceIndex: 6,
      variant, fieldId: sourceRow.CaseFieldID, eventId: sourceRow.CaseEventID,
      sourceCaseType: sourceRow.CaseTypeID, caseType: 'HarnessNestedPRL', pageId: 'serviceOfDocuments2',
      pageOrder: 2, fieldOrder: 7, pageShowCondition: null,
      sourceProjection: ['sodAdditionalRecipients', 'sodAdditionalRecipientsList'],
      syntheticPredecessor: 'protectedValue:READONLY:serviceOfDocumentsharnessBefore:order1',
      neighbouringCallback: 'omitted-controlled-context-no-business-workflow-claim',
      liveFrom: '2024-09-01', activationClaim: false,
      runtimeAcceptance: false, catalogueCredit: false, releaseCredit: false,
    },
  };
}

export function validateSelectorEventRowFixture(value, variant = 'baseline') {
  assert.deepEqual(value, deriveSelectorEventRowFixture(variant), 'SELECTOR_CANONICAL_FIXTURE_REQUIRED');
  return structuredClone(value.binding);
}
