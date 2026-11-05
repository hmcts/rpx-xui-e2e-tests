import assert from 'node:assert/strict';
import fs from 'node:fs';
import { digestBytes } from './exui-evidence-io.mjs';
import { validateEventCapabilitySource } from './exui-ccd-event-capability.mjs';
import { bindSharedNestedSourceFixture } from './exui-shared-nested-contract.mjs';

export const COMPLEX_EMAIL_OBLIGATION = 'configuration-shape:9a20dc72fb413cd3bd34d97dc415f55c042088bf6b517cda7fc275215c5f7e39';
export const COMPLEX_EMAIL_ATTRIBUTES = Object.freeze(['LiveFrom', 'ID', 'ListElementCode', 'FieldType', 'ElementLabel', 'SecurityClassification', 'Searchable']);
export const COMPLEX_EMAIL_VARIANTS = Object.freeze(['baseline', 'email-type', 'searchable']);
const sourcePath = 'definitions/private-law/json/ComplexTypes/ManageOrders/OrderDetails/ComplexTypes.json';
const sourceRowDigest = 'sha256:411c03f388498bbbb8328d3180f32805bd14c0bb22167ecd4727d83f011c8fcf';
const sourceRow = Object.freeze({LiveFrom:'01/12/2022',ID:'EmailInformation',ListElementCode:'emailAddress',FieldType:'Text',ElementLabel:'Email address',SecurityClassification:'Public',Searchable:'N'});
const read = name => JSON.parse(fs.readFileSync(new URL('../fixtures/ccd/' + name, import.meta.url)));
const one = (rows, predicate) => {
  const matches = rows.filter(predicate);
  assert.equal(matches.length, 1, 'COMPLEX_EMAIL_EXACT_ROW_REQUIRED');
  return matches[0];
};

export function complexEmailRow(fixture) {
  return one(fixture.sheets.ComplexTypes, row => row.ID === sourceRow.ID && row.ListElementCode === sourceRow.ListElementCode);
}

export function deriveComplexEmailFixture(variant = 'baseline') {
  assert(COMPLEX_EMAIL_VARIANTS.includes(variant), 'COMPLEX_EMAIL_VARIANT_REQUIRED');
  const source = read('event-capability.source.json');
  validateEventCapabilitySource(source);
  const file = one(source.sources, item => item.path === sourcePath);
  const selected = one(file.rows, item => item.row.ID === sourceRow.ID && item.row.ListElementCode === sourceRow.ListElementCode);
  assert.equal(selected.rowDigest, sourceRowDigest, 'COMPLEX_EMAIL_SOURCE_DIGEST');
  assert.deepEqual(selected.row, sourceRow, 'COMPLEX_EMAIL_SOURCE_ROW');
  assert.deepEqual(Object.keys(selected.row).sort(), [...COMPLEX_EMAIL_ATTRIBUTES].sort(), 'COMPLEX_EMAIL_UNCLASSIFIED_FACET');
  const fixture = read('nested-prl.json');
  const original = bindSharedNestedSourceFixture(fixture, source);
  assert.deepEqual(complexEmailRow(fixture), sourceRow, 'COMPLEX_EMAIL_FIXTURE_SOURCE');
  // The source collection and branch are non-searchable. This declared,
  // mapping-only parent exposes the same leaf without changing those ancestors.
  fixture.sheets.CaseField.push({LiveFrom:'01/01/2020',CaseTypeID:'HarnessNestedPRL',ID:'harnessEmailTypeProbe',Label:'Mapping-only EmailInformation probe',FieldType:'EmailInformation',SecurityClassification:'Public',Searchable:'Y'});
  fixture.provenance.adaptations.push('Synthetic searchable harnessEmailTypeProbe references the unchanged EmailInformation type for mapping observation only; it is absent from all event pages');
  const row = complexEmailRow(fixture);
  if (variant === 'email-type') row.FieldType = 'Email';
  if (variant === 'searchable') row.Searchable = 'Y';
  return {fixture, binding:{
    schemaVersion:1,kind:'complex-email-text-source-binding',variant,obligationId:COMPLEX_EMAIL_OBLIGATION,
    sourceRepository:source.repository,sourceRevision:source.revision,sourcePath,sourceRowDigest,
    sourceFileDigest:file.fileDigest,sourceIndex:selected.index,sourceRow:{...sourceRow},
    originalFixtureDigest:original.fixtureDigest,fixtureDigest:digestBytes(JSON.stringify(fixture)),
    normalization:original.normalization,mappingScaffold:'searchable-direct-EmailInformation-parent-outside-event-pages',
    liveFromDisposition:'ignored-by-pinned-complex-types-importer',
    activationClaim:false,runtimeAcceptance:false,catalogueCredit:false,
  }};
}

export function validateComplexEmailFixture(value, variant = 'baseline') {
  assert.deepEqual(value, deriveComplexEmailFixture(variant), 'COMPLEX_EMAIL_FIXTURE_BINDING');
  return value.binding;
}

function metadataExpected(version, variant) {
  assert(Number.isSafeInteger(version) && version > 0, 'COMPLEX_EMAIL_VERSION_REQUIRED');
  assert(COMPLEX_EMAIL_VARIANTS.includes(variant), 'COMPLEX_EMAIL_VARIANT_REQUIRED');
  return [{case_type:'HarnessNestedPRL',version,field:'sodAdditionalRecipientsList',parent:'ServeOrgDetails',branch:'emailInformation',type:'EmailInformation',reference:'emailAddress',label:'Email address',field_type:variant === 'email-type' ? 'Email' : 'Text',security:'PUBLIC',searchable:variant === 'searchable',searchable_sql_type:'boolean'}];
}

export function validateComplexEmailMetadata(rows, context, variant = 'baseline') {
  const expected = metadataExpected(context.version, variant);
  assert(typeof context.owner === 'string' && context.owner.length > 0 && /^[a-f0-9]{64}$/.test(context.namespace), 'COMPLEX_EMAIL_RUNTIME_IDENTITY');
  assert.deepEqual(rows, expected, 'COMPLEX_EMAIL_METADATA_ROWS');
  return {schemaVersion:1,kind:'complex-email-imported-metadata',owner:context.owner,namespace:context.namespace,definitionVersion:context.version,variant,sourceRowDigest,rows:structuredClone(rows),liveFromDisposition:'ignored-by-pinned-complex-types-importer',activationClaim:false,runtimeAcceptance:false,catalogueCredit:false};
}

export function complexEmailMetadataSql(version) {
  metadataExpected(version, 'baseline');
  // Pinned definition-store c37c9b84 has no ComplexFieldEntity date column.
  // Read the actual parent chain for the exact imported case-type version.
  return `BEGIN READ ONLY; SELECT COALESCE(json_agg(row_to_json(r)), '[]'::json) FROM (
SELECT ct.reference AS case_type, ct.version, cf.reference AS field,
parent.reference AS parent, branch.reference AS branch, nested.reference AS type,
leaf.reference, leaf.label, scalar.reference AS field_type,
leaf.security_classification::text AS security, leaf.searchable,
pg_typeof(leaf.searchable)::text AS searchable_sql_type
FROM case_type ct JOIN case_field cf ON cf.case_type_id=ct.id
JOIN field_type collection ON collection.id=cf.field_type_id
JOIN field_type parent ON parent.id=collection.collection_field_type_id
JOIN complex_field branch ON branch.complex_field_type_id=parent.id
JOIN field_type nested ON nested.id=branch.field_type_id
JOIN complex_field leaf ON leaf.complex_field_type_id=nested.id
JOIN field_type scalar ON scalar.id=leaf.field_type_id
WHERE ct.reference='HarnessNestedPRL' AND ct.version=${version}
AND cf.reference='sodAdditionalRecipientsList' AND parent.reference='ServeOrgDetails'
AND branch.reference='emailInformation' AND nested.reference='EmailInformation'
AND leaf.reference='emailAddress') r; COMMIT;`;
}
