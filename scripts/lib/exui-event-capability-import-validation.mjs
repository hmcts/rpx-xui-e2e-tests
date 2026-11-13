import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { digestBytes } from './exui-evidence-io.mjs';
import { prepareCcdImport, assertObservedCcdDefinition, assertObservedEventCapabilityDefinition } from './exui-ccd-runtime.mjs';
import { assertStoredSourceShapeDates } from './exui-source-shape-dates.mjs';

// Pure replay of the existing v2 import contract; directory has the caller's validated phase root.
export function readEventCapabilityImportMetadata(directory, selected, variant) {
  const readFixed = (root, relative) => {
    const file = path.join(root, relative);
    assert(fs.lstatSync(file).isFile() && fs.realpathSync(file) === file, "EVENT_TRANSITION_ARTIFACT_ALIAS");
    const bytes = fs.readFileSync(file);
    return { value: JSON.parse(bytes), digest: digestBytes(bytes) };
  };
  const root = path.join(path.dirname(directory), `event-${variant}-runtime`);
  const receipt = readFixed(root, "definition-import.json"), observed = readFixed(root, "observed-definition.json");
  const prepared = prepareCcdImport(undefined, `event-capability-${variant}`);
  assert.equal(receipt.digest, selected.definitionImportDigest, "EVENT_TRANSITION_IMPORT_DIGEST");
  assert([200, 201].includes(receipt.value.status), "EVENT_TRANSITION_IMPORT_STATUS");
  assert.equal(receipt.value.fixtureSelection, prepared.fixtureSelection, "EVENT_TRANSITION_IMPORT_VARIANT");
  assert.deepEqual(receipt.value.binding, prepared.binding, "EVENT_TRANSITION_IMPORT_BINDING");
  assert.equal(receipt.value.sourceRevision, prepared.source.provenance.sourceRevision, "EVENT_TRANSITION_IMPORT_SOURCE");
  assert.equal(receipt.value.sourceProjectionDigest, prepared.binding.sourceProjectionDigest, "EVENT_TRANSITION_IMPORT_SOURCE");
  assert.deepEqual(receipt.value.images, selected.ccd.images, "EVENT_TRANSITION_IMPORT_IMAGES");
  assert.equal(receipt.value.fixtureDigest, digestBytes(prepared.file), "EVENT_TRANSITION_IMPORT_WORKBOOK");
  for (const field of ["fixtureDigest", "observedDefinitionDigest", "definitionVersion"])
    assert.deepEqual(receipt.value[field], selected.definition[field], "EVENT_TRANSITION_IMPORT_IDENTITY");
  assertObservedCcdDefinition(receipt.value, observed.value);
  assertObservedEventCapabilityDefinition(observed.value, prepared.source);
  assertStoredSourceShapeDates(receipt.value.storedSourceShapeDates,selected.ccd,receipt.value.definitionVersion);
  return { definitionImportDigest: receipt.digest, observedDefinitionDigest: receipt.value.observedDefinitionDigest,
    definitionVersion: String(receipt.value.definitionVersion), ccdNamespace: selected.ccd.namespace };
}
