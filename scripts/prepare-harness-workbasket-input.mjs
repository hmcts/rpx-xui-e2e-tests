#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { assertFreshCandidateDerivationOutput } from './lib/exui-candidate-artifact.mjs';
import { digestBytes } from './lib/exui-evidence-io.mjs';
import { buildWorkbasketInputDefinition } from './lib/exui-workbasket-input-definition.mjs';

const fixtureRoot = fileURLToPath(new URL('./fixtures/ccd/', import.meta.url));
export async function prepareWorkbasketInputDefinition(output) {
  const destination = await assertFreshCandidateDerivationOutput({
    baseline: { candidateRoot: fixtureRoot },
    manifestPath: path.join(fixtureRoot, 'workbasket-input.source.json'), output,
  });
  fs.mkdirSync(destination, { mode: 0o700 });
  const definition = buildWorkbasketInputDefinition();
  const json = path.join(destination, 'definition.json');
  fs.writeFileSync(json, JSON.stringify(definition, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  const workbook = path.join(destination, 'definition.xlsx');
  const generated = spawnSync('python3', [path.join(fixtureRoot, 'workbook.py'), json, workbook],
    { encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024 });
  if (generated.error || generated.status !== 0) throw Error('WORKBASKET_INPUT_WORKBOOK_FAILED');
  fs.chmodSync(workbook, 0o600);
  const binding = { schemaVersion: 1, source: definition.workbasketInputSource,
    definitionDigest: digestBytes(fs.readFileSync(json)), workbookDigest: digestBytes(fs.readFileSync(workbook)),
    runtimeAcceptance: false, catalogueCredit: false, releaseCredit: false };
  fs.writeFileSync(path.join(destination, 'binding.json'), JSON.stringify(binding, null, 2) + '\n',
    { flag: 'wx', mode: 0o600 });
  return binding;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 2 || args[0] !== '--output' || !path.isAbsolute(args[1])) throw Error('WORKBASKET_INPUT_OUTPUT_REQUIRED');
    await prepareWorkbasketInputDefinition(args[1]);
    console.log('Prepared source-bound workbasket input workbook; runtime acceptance remains unproved.');
  } catch {
    console.error('Workbasket input workbook preparation rejected.');
    process.exitCode = 2;
  }
}
