#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { readConfigurationSources, buildConfigurationCatalogue, validateConfigurationCatalogue, selectConfigurationObligations } from './lib/exui-configuration-catalogue.mjs';
import { writeJsonAtomic } from './lib/exui-evidence-io.mjs';

try {
  const { values } = parseArgs({ options: {
    webapp: { type: 'string' }, definitions: { type: 'string' }, output: { type: 'string' }, changes: { type: 'string' }
  } });
  if (!values.webapp || !values.definitions || !values.output) throw new Error('EXPLICIT_SOURCE_AND_OUTPUT_PATHS_REQUIRED');
  const review = JSON.parse(fs.readFileSync(fileURLToPath(new URL('./fixtures/exui-configuration-review.json', import.meta.url)), 'utf8'));
  const snapshot = readConfigurationSources({ webappRoot: path.resolve(values.webapp), definitionsRoot: path.resolve(values.definitions) });
  const catalogue = buildConfigurationCatalogue(snapshot, review);
  const changedPaths = values.changes ? JSON.parse(fs.readFileSync(path.resolve(values.changes), 'utf8')) : [];
  const selection = selectConfigurationObligations(catalogue, changedPaths);
  const report = validateConfigurationCatalogue({ snapshot, review, catalogue, selectedIds: selection.obligationIds });
  writeJsonAtomic(path.join(values.output, 'catalogue.json'), catalogue);
  writeJsonAtomic(path.join(values.output, 'selection.json'), selection);
  writeJsonAtomic(path.join(values.output, 'source-validation.json'), report);
  console.log(JSON.stringify({ kind: 'configuration-source-diagnostic', releaseCredit: false, errors: report.errors.length,
    requiredObligations: report.denominator.requiredObligations, selected: report.coverage.selected,
    runtimeGaps: report.coverage.missingCandidateOrCcd.length }));
  process.exitCode = report.errors.length ? 2 : 0;
} catch {
  console.error('BLOCKED: configuration source validation could not complete. Check explicit source paths and supported configuration formats.');
  process.exitCode = 2;
}
