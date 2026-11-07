const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { createEventTransitionFixture: fixture } = require('./fixtures/exui-event-transition-evidence.mock.cjs');
const load = () => import('./lib/exui-event-capability-import-validation.mjs');
const digest = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex');

test('extracted import validator returns the same bounded metadata for baseline and all eleven variants', async t => {
  const { readEventCapabilityImportMetadata } = await load(), f = await fixture(t);
  assert.equal(Object.keys(f.variants).length, 12);
  for (const [variant, item] of Object.entries(f.variants)) {
    const selected = { ccd: item.state, definition: item.imported, definitionImportDigest: item.importedRef.digest };
    assert.deepEqual(readEventCapabilityImportMetadata(f.directory, selected, variant), {
      definitionImportDigest: item.importedRef.digest,
      observedDefinitionDigest: item.imported.observedDefinitionDigest,
      definitionVersion: String(item.imported.definitionVersion),
      ccdNamespace: item.state.namespace,
    });
  }
});

for (const [name, mutate, code] of [
  ['metadata', receipt => { receipt.status = 500; }, 'EVENT_TRANSITION_IMPORT_STATUS'],
  ['source', receipt => { receipt.sourceRevision = 'foreign-source'; }, 'EVENT_TRANSITION_IMPORT_SOURCE'],
  ['workbook', receipt => { receipt.fixtureDigest = 'sha256:' + '0'.repeat(64); }, 'EVENT_TRANSITION_IMPORT_WORKBOOK'],
]) test(`coherently repinned ${name} import cannot replace its canonical contract`, async t => {
  const { readEventCapabilityImportMetadata } = await load(), f = await fixture(t), item = f.variants.mutant;
  const file = path.join(item.state.output, 'definition-import.json'), receipt = JSON.parse(fs.readFileSync(file));
  mutate(receipt); const bytes = JSON.stringify(receipt); fs.writeFileSync(file, bytes);
  const selected = { ccd: item.state, definition: receipt, definitionImportDigest: digest(bytes) };
  assert.throws(() => readEventCapabilityImportMetadata(f.directory, selected, 'mutant'), error => error.message === code || error.message.startsWith(code + '\n'));
});
