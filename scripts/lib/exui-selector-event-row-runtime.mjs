import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startCcdRuntime, ccdCredentials, ccdRequest, verifyCcdContainerIdentity } from './exui-ccd-runtime.mjs';
import { prepareRecipientCallbackImport, importRecipientCallback } from './exui-recipient-callback-import.mjs';
import { canonicalRecipientCallbackPages } from './exui-recipient-callback-fixture.mjs';
import { deriveSelectorEventRowFixture, SELECTOR_EVENT_SCOPE, SELECTOR_EVENT_MUTATION } from './exui-selector-event-row-contract.mjs';
import { validateSelectorRowDescriptors, validateSelectorStoredDate, readSelectorStoredDate } from './exui-selector-event-row-facets.mjs';
import { digestBytes, writeJsonAtomic } from './exui-evidence-io.mjs';

const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
export const selectorVariant = id => {
  assert(['baseline', SELECTOR_EVENT_MUTATION].includes(id), 'SELECTOR_NATIVE_INVOCATION');
  return id === 'baseline' ? 'baseline' : 'summary-hidden';
};
const definitionRecord = (state, imported, storedDate, variant) => {
  const { binding, fixture } = deriveSelectorEventRowFixture(variant);
  assert.equal(imported.status, 'import-and-callback-descriptor-observed', 'SELECTOR_NATIVE_IMPORT_STATUS');
  assert.equal(imported.observations?.import?.status,201,'SELECTOR_NATIVE_IMPORT_HTTP_STATUS');
  assert.deepEqual(imported.seal.selectorEventBinding, binding, 'SELECTOR_NATIVE_SOURCE_BINDING');
  assert.equal(imported.seal.definitionDigest, digestBytes(JSON.stringify(fixture, null, 2) + '\n'), 'SELECTOR_NATIVE_SOURCE_DEFINITION');
  assert.deepEqual([imported.owner, imported.namespace, imported.images], [state.owner, state.namespace, state.images], 'SELECTOR_NATIVE_IMPORT_OWNER');
  assert.equal(imported.seal.variant, 'binding-omitted', 'SELECTOR_NATIVE_CALLBACK_CONTEXT');
  const { definition, pages } = imported.observations;
  assert.equal(definition.status, 200, 'SELECTOR_NATIVE_DESCRIPTOR_STATUS');
  assert.equal(pages.status, 200, 'SELECTOR_NATIVE_DESCRIPTOR_STATUS');
  validateSelectorRowDescriptors(definition.body, pages.body, variant);
  const dateFacts=validateSelectorStoredDate(storedDate.rows, definition.body.version.number);
  for(const [key,value] of Object.entries(dateFacts))assert.deepEqual(storedDate[key],value,'SELECTOR_NATIVE_TYPED_DATE_CONTRACT');
  assert.deepEqual([storedDate.owner, storedDate.namespace, storedDate.images], [state.owner, state.namespace, state.images], 'SELECTOR_NATIVE_DATE_OWNER');
  return { schemaVersion: 1, kind: 'native-selector-event-row-definition', releaseScopeId: SELECTOR_EVENT_SCOPE, variant, fixtureDigest: imported.seal.workbookDigest, sourceDefinitionDigest: imported.seal.definitionDigest, observedDefinitionDigest: digestBytes(JSON.stringify(definition.body)), observedPagesDigest: digestBytes(JSON.stringify(canonicalRecipientCallbackPages(pages.body))), definitionVersion: definition.body.version.number, storedDateDigest: digestBytes(JSON.stringify(storedDate)), sourceBinding: binding, owner: state.owner, namespace: state.namespace, images: state.images };
};

export async function prepareSelectorRuntime(output, { invocationId = 'baseline', platform, isCancelled = () => false } = {}) {
  const variant = selectorVariant(invocationId);
  const ccd = await startCcdRuntime(output, { fixtureSelection: 'event-capability-baseline', platform, isCancelled });
  assert(!isCancelled(), 'SELECTOR_NATIVE_CANCELLED');
  const options = { variant: 'binding-omitted', rowFacets: true, selectorEventVariant: variant };
  const fixtureDirectory = path.join(output, 'selector-fixture');
  await prepareRecipientCallbackImport(fixtureDirectory, options);
  const imported = await importRecipientCallback(ccd, { ...options, fixtureDirectory });
  const date = readSelectorStoredDate(ccd, imported.observations.definition.body.version.number);
  const definition = definitionRecord(ccd, imported, date, variant);
  writeJsonAtomic(path.join(output, 'selector-native-import.json'), definition);
  assert(!isCancelled(), 'SELECTOR_NATIVE_CANCELLED');
  return verifySelectorRuntime(ccd, invocationId);
}

export function verifySelectorRuntime(ccd, invocationId = 'baseline') {
  const variant = selectorVariant(invocationId);
  verifyCcdContainerIdentity(ccd);
  const imported = read(path.join(ccd.output, 'recipient-callback-import/receipt.json'));
  const date = read(path.join(ccd.output, 'recipient-callback-import/selector-stored-row-date.json'));
  const expected = definitionRecord(ccd, imported, date, variant);
  const definitionFile = path.join(ccd.output, 'selector-native-import.json');
  assert.deepEqual(read(definitionFile), expected, 'SELECTOR_NATIVE_DEFINITION_RECORD');
  const observer = ccdCredentials(ccd, 'observer');
  for (const [key, route] of [['definition', '/api/data/case-type/HarnessNestedPRL'], ['pages', '/api/display/wizard-page-structure/case-types/HarnessNestedPRL/event-triggers/serviceOfDocuments']]) {
    const response = ccdRequest(ccd, 4451, route, { headers: observer.headers });
    assert.equal(response.status, 200, 'SELECTOR_NATIVE_LIVE_DESCRIPTOR_STATUS');
    const normalize = body => key === 'pages' ? canonicalRecipientCallbackPages(body) : body;
    assert.deepEqual(normalize(response.body), normalize(imported.observations[key].body), 'SELECTOR_NATIVE_LIVE_DESCRIPTOR_DRIFT');
  }
  assert.deepEqual(readSelectorStoredDate(ccd, expected.definitionVersion, { writeReceipt: false }), date, 'SELECTOR_NATIVE_LIVE_DATE_DRIFT');
  const credentials = Object.fromEntries(['allowed', 'courtadmin', 'judge', 'observer', 'readonly'].map(name => [name, ccdCredentials(ccd, name)]));
  const apiContracts = Object.fromEntries([['data', 4452], ['definition', 4451]].map(([name, port]) => {
    const response = ccdRequest(ccd, port, '/v3/api-docs');
    assert.equal(response.status, 200, 'SELECTOR_NATIVE_API_CONTRACT');
    return [name, digestBytes(JSON.stringify(response.body))];
  }));
  return { ccd, credentials, definition: expected, definitionImportDigest: digestBytes(fs.readFileSync(definitionFile)), selectorEventBinding: expected.sourceBinding, apiContracts };
}

const evidenceFiles = Object.freeze({ selectorImportReceipt: 'selector-native-import.json', selectorObservedReceipt: 'recipient-callback-import/receipt.json', selectorDateReceipt: 'recipient-callback-import/selector-stored-row-date.json', selectorDefinitionReceipt:'selector-fixture/definition.json', selectorWorkbookReceipt:'selector-fixture/definition.xlsx' });
export function copySelectorRuntimeEvidence(directory, input, invocationId) {
  selectorVariant(invocationId);
  const target = path.join(directory, invocationId);
  fs.mkdirSync(target, { recursive: true, mode: 0o700 });
  assert.equal(fs.realpathSync(target), target, 'SELECTOR_CAPTURE_ALIAS');
  return Object.fromEntries(Object.entries(evidenceFiles).map(([key, relative]) => {
    const source = path.join(input.ccd.output, relative), destination = path.join(target, key + '.json');
    assert(fs.lstatSync(source).isFile() && fs.realpathSync(source) === source, 'SELECTOR_CAPTURE_SOURCE_ALIAS');
    const bytes = fs.readFileSync(source); fs.writeFileSync(destination, bytes, { flag: 'wx', mode: 0o600 });
    return [key, { path: `${invocationId}/${key}.json`, digest: digestBytes(bytes) }];
  }));
}
export function assertCopiedSelectorRuntimeEvidence(directory, input, invocationId) {
  const variant = selectorVariant(invocationId), records = {};
  for (const key of Object.keys(evidenceFiles)) {
    const reference = input[key];
    assert.deepEqual(Object.keys(reference ?? {}).sort(), ['digest', 'path'], 'SELECTOR_CAPTURE_REFERENCE');
    assert.equal(reference.path, `${invocationId}/${key}.json`, 'SELECTOR_CAPTURE_PATH');
    const file = path.join(directory, reference.path);
    assert(fs.lstatSync(file).isFile() && fs.realpathSync(file) === file, 'SELECTOR_CAPTURE_ALIAS');
    const bytes = fs.readFileSync(file); assert.equal(digestBytes(bytes), reference.digest, 'SELECTOR_CAPTURE_DIGEST');
    records[key] = key === "selectorWorkbookReceipt" ? bytes : JSON.parse(bytes);
  }
  assert.deepEqual(records.selectorDefinitionReceipt,deriveSelectorEventRowFixture(variant).fixture,"SELECTOR_CAPTURE_SOURCE_FIXTURE");
  assert.equal(input.selectorDefinitionReceipt.digest,input.definition.sourceDefinitionDigest,"SELECTOR_CAPTURE_SOURCE_BYTES");
  assert.equal(digestBytes(records.selectorWorkbookReceipt),input.definition.fixtureDigest,"SELECTOR_CAPTURE_WORKBOOK_BYTES");
  const definition = definitionRecord(input.ccd, records.selectorObservedReceipt, records.selectorDateReceipt, variant);
  assert.deepEqual(records.selectorImportReceipt, definition, 'SELECTOR_CAPTURE_NATIVE_DEFINITION');
  assert.deepEqual(input.definition, definition, 'SELECTOR_CAPTURE_INPUT_DEFINITION');
  assert.equal(input.definitionImportDigest, input.selectorImportReceipt.digest, 'SELECTOR_CAPTURE_INPUT_IMPORT_DIGEST');
  return records;
}
