import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, basename, extname } from 'node:path';

const configurationKeys = ['jurisdictions', 'globalSearchServices', 'waSupportedJurisdictions', 'staffSupportedJurisdictions', 'serviceRefDataMapping', 'wildcardSearchFields', 'wildcardSearchRoles'];
const definitionPaths = [
  'CaseField/ServiceOfDocuments/CaseField.json',
  'ComplexTypes/ManageOrders/OrderDetails/ComplexTypes.json',
  'CaseEventToFields/ServiceOfDocuments/Page2/CaseEventToFields.json',
  'CaseEventToComplexTypes/ServiceOfDocuments/AdditionalRecipients/CaseEventToComplexTypes.json',
  'AuthorisationCaseEvent/ServiceOfDocuments/AuthorisationCaseEvent.json',
  'CaseEvent/ServiceOfDocuments/CaseEvent-nonprod.json',
  'SearchResultFields.json', 'WorkBasketInputFields.json', 'WorkBasketResultFields.json'
].map((path) => `definitions/private-law/json/${path}`);
const complexIds = ['ServeOrgDetails', 'EmailInformation', 'PostalInformation'];
const sharedIds = ['configuration-shared:nested-renderer', 'configuration-shared:role-policy'];
const boundaries = ['model', 'candidate', 'ccd', 'external'];
const sourceKey = (source) => `${source.repository}:${source.path}`;
const sorted = (value) => Array.isArray(value) ? value.map(sorted) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, sorted(value[key])])) : value;
const digest = (value) => createHash('sha256').update(JSON.stringify(sorted(value))).digest('hex');
const fileDigest = (value) => createHash('sha256').update(value).digest('hex');
const unique = (items) => [...new Set(items)];
const cellKey = ({ caseType, role, action, channel, recipientCount }) => [caseType, role, action, channel, recipientCount].join('|');

export function assertCandidateConfigurationSources(candidateRoot, review) {
  const prefix = 'rpx-xui-webapp:';
  const expected = Object.entries(review.sourceFileDigests).filter(([key]) => key.startsWith(prefix));
  if (!expected.some(([key]) => key === prefix + 'config/default.json') ||
      !expected.some(([key]) => key === prefix + 'config/custom-environment-variables.json')) throw new Error('MISSING_REVIEWED_CANDIDATE_CONFIGURATION');
  const expectedPaths = new Set(expected.map(([key]) => key.slice(prefix.length)));
  if (readdirSync(join(candidateRoot, 'config')).some((name) => !expectedPaths.has(`config/${name}`))) throw new Error('UNREVIEWED_CANDIDATE_CONFIGURATION');
  return expected.map(([key, expectedDigest]) => {
    const path = key.slice(prefix.length);
    if (!/^config\/[a-zA-Z0-9._-]+\.json$/.test(path)) throw new Error('UNSUPPORTED_REVIEWED_CONFIGURATION_PATH');
    const observed = fileDigest(readFileSync(join(candidateRoot, path)));
    if (observed !== expectedDigest) throw new Error('CANDIDATE_CONFIGURATION_SOURCE_DRIFT');
    return { path, digest: `sha256:${observed}` };
  });
}
const diagnosticConfiguration = (source) => source.repository === 'rpx-xui-webapp' && source.tracked === false
  && !['config/default.json', 'config/custom-environment-variables.json'].includes(source.path);

function projectConfiguration(document) {
  const result = Object.fromEntries(configurationKeys.filter((key) => key in document).map((key) => [key, document[key]]));
  if (document.feature?.workAllocationEnabled !== undefined) result.feature = { workAllocationEnabled: document.feature.workAllocationEnabled };
  const hearings = document.services?.hearings;
  if (hearings) result.services = { hearings: Object.fromEntries(Object.entries(hearings)
    .filter(([key, value]) => key === 'hearingsJurisdictions' || value && typeof value === 'object' && 'caseTypes' in value)
    .map(([key, value]) => [key, key === 'hearingsJurisdictions' ? value : { caseTypes: value.caseTypes }])) };
  return result;
}

function gitMetadata(root, path) {
  try {
    return {
      revision: execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(),
      tracked: Boolean(execFileSync('git', ['-C', root, 'ls-files', '--', path], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim())
    };
  } catch { return { revision: null, tracked: false }; }
}

export function readConfigurationSources({ webappRoot, definitionsRoot }) {
  const sources = [];
  const configurationFiles = readdirSync(join(webappRoot, 'config')).sort();
  // node-config parser.js supports these formats; this bounded reader deliberately parses JSON only.
  const unsupportedExtensions = new Set(['.js', '.cjs', '.mjs', '.ts', '.jsonc', '.json5', '.hjson', '.toml', '.coffee', '.iced', '.yaml', '.yml', '.cson', '.properties', '.xml', '.boolean', '.number']);
  for (const path of configurationFiles) if (unsupportedExtensions.has(extname(path))) throw new Error(`unsupported-configuration-format:config/${path}`);
  for (const [repository, root, paths] of [
    ['rpx-xui-webapp', webappRoot, configurationFiles.filter((path) => path.endsWith('.json')).map((path) => `config/${path}`)],
    ['prl-ccd-definitions', definitionsRoot, definitionPaths]
  ]) {
    for (const path of paths) {
      const bytes = readFileSync(join(root, path));
      let document = JSON.parse(bytes.toString('utf8'));
      if (repository === 'rpx-xui-webapp') document = projectConfiguration(document);
      else if (path.includes('/ComplexTypes/')) document = document.filter((row) => complexIds.includes(row.ID));
      sources.push({ repository, ...gitMetadata(root, path), path, fileDigest: fileDigest(bytes), document });
    }
  }
  return { schemaVersion: 1, sources };
}

function familiesInConfiguration(config) {
  const capabilities = new Map();
  const add = (family, capability) => {
    if (typeof family !== 'string' || !/^[A-Z][A-Z0-9_]*$/.test(family)) throw new Error('Invalid configuration family');
    capabilities.set(family, unique([...(capabilities.get(family) ?? []), capability]));
  };
  for (const key of configurationKeys.slice(0, 4)) {
    if (config[key] !== undefined) {
      if (typeof config[key] !== 'string') throw new Error(`Invalid configuration list: ${key}`);
      for (const family of config[key].split(',').map((item) => item.trim()).filter(Boolean)) add(family, key);
    }
  }
  if (config.serviceRefDataMapping !== undefined) {
    if (!Array.isArray(config.serviceRefDataMapping)) throw new Error('Invalid serviceRefDataMapping');
    for (const mapping of config.serviceRefDataMapping) {
      if (!Array.isArray(mapping.serviceCodes) || !mapping.serviceCodes.every((code) => typeof code === 'string')) throw new Error('Invalid service codes');
      add(mapping.service, 'serviceRefDataMapping');
    }
  }
  const hearings = config.services?.hearings;
  if (hearings?.hearingsJurisdictions !== undefined) {
    if (typeof hearings.hearingsJurisdictions !== 'string') throw new Error('Invalid hearings jurisdiction list');
    for (const family of hearings.hearingsJurisdictions.split(',').map((item) => item.trim()).filter(Boolean)) add(family, 'hearings');
  }
  return capabilities;
}

function mergeConfiguration(base, overlay) {
  const result = { ...base, ...overlay };
  if (base.services || overlay.services) result.services = { hearings: { ...base.services?.hearings, ...overlay.services?.hearings } };
  if (base.feature || overlay.feature) result.feature = { ...base.feature, ...overlay.feature };
  return result;
}

export function buildConfigurationCatalogue(snapshot, review) {
  if (snapshot.schemaVersion !== 1 || !Array.isArray(snapshot.sources) || snapshot.sources.length === 0) throw new Error('Invalid configuration source snapshot');
  if (new Set(snapshot.sources.map(sourceKey)).size !== snapshot.sources.length) throw new Error('Duplicate configuration source');
  const configurations = snapshot.sources.filter((source) => source.repository === 'rpx-xui-webapp');
  const defaults = configurations.find((source) => source.path === 'config/default.json');
  if (!defaults) throw new Error('Missing default configuration');
  const configurationProfiles = [];
  const families = new Map();
  const diagnosticFamilies = new Map();
  const obligations = [];
  const features = [];
  for (const source of configurations) {
    if (source.path === 'config/custom-environment-variables.json') continue;
    const effective = mergeConfiguration(defaults.document, source.document);
    const diagnosticOnly = diagnosticConfiguration(source);
    configurationProfiles.push({ path: source.path, tracked: source.tracked, diagnosticOnly, digest: digest(effective), effective });
    for (const [id, capabilities] of familiesInConfiguration(effective)) {
      if (diagnosticOnly) {
        diagnosticFamilies.set(id, { id, classification: 'diagnostic-only', capabilities: unique([...(diagnosticFamilies.get(id)?.capabilities ?? []), ...capabilities]) });
        continue;
      }
      families.set(id, { id, classification: review.families.includes(id) ? 'source-inventory-only' : 'unknown', capabilities: unique([...(families.get(id)?.capabilities ?? []), ...capabilities]) });
      obligations.push({ id: `configuration-profile:${digest({ profile: source.path, family: id, effective })}`, family: id,
        kind: 'configuration-profile', requiredBoundary: 'candidate', sourceKeys: [sourceKey(source), sourceKey(defaults)] });
    }
  }
  for (const source of snapshot.sources.filter((item) => item.repository !== 'rpx-xui-webapp')) {
    if (source.repository !== 'prl-ccd-definitions' || !definitionPaths.includes(source.path)) throw new Error('Unsupported definition source');
    if (!Array.isArray(source.document)) throw new Error('Definition document must be an array');
    for (const row of source.document) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('Invalid definition row');
      const rowDigest = digest(row);
      const kind = basename(source.path, '.json');
      const element = row.ListElementCode ?? '';
      const feature = { id: `configuration-shape:${digest({ source: sourceKey(source), row })}`, kind, rowDigest, sourceKey: sourceKey(source),
        family: 'PRIVATELAW', caseType: row.CaseTypeID ?? null, event: row.CaseEventID ?? row.ID ?? null,
        field: row.CaseFieldID ?? row.ID ?? null, element, nestingDepth: element ? element.split('.').length : 0,
        fieldType: row.FieldType ?? null, fieldTypeParameter: row.FieldTypeParameter ?? null,
        condition: row.FieldShowCondition ?? null, pageCondition: row.PageShowCondition ?? null,
        display: row.DisplayContext ?? null, summaryChange: row.ShowSummaryChangeOption ?? null,
        callbackStages: Object.keys(row).filter((key) => key.startsWith('CallBackURL')),
        accessControl: row.AccessControl ?? [] };
      features.push(feature);
      obligations.push({ id: feature.id, family: 'PRIVATELAW', kind: 'definition-shape', requiredBoundary: feature.accessControl.length ? 'ccd' : 'candidate', sourceKeys: [sourceKey(source)] });
    }
  }
  const authorisation = features.find((feature) => feature.kind === 'AuthorisationCaseEvent' && feature.event === 'serviceOfDocuments');
  if (!authorisation) throw new Error('Missing serviceOfDocuments authorisation source');
  const channels = unique(features.flatMap((feature) => {
    const match = feature.condition?.match(/^sodAdditionalRecipientsList\.serveByPostOrEmail="(email|post)"$/);
    return match ? [match[1]] : [];
  }));
  const pilotCells = [];
  // shortcut: two roles and recipient counts 1/2 form a bounded source pilot; expand only with reviewed denominator examples.
  for (const role of review.pilotRoles) for (const action of ['read', 'update']) for (const channel of channels) for (const recipientCount of [1, 2]) {
    const access = authorisation.accessControl.find((entry) => entry.UserRoles.includes(role));
    if (!access) continue;
    const cell = { caseType: authorisation.caseType, role, action, channel, recipientCount,
      expectedAccess: access.CRUD.includes(action === 'read' ? 'R' : 'U') ? 'allowed' : 'denied' };
    cell.id = `configuration-cell:${digest(cell)}`;
    pilotCells.push(cell);
    obligations.push({ id: cell.id, family: 'PRIVATELAW', kind: 'pilot-cell', requiredBoundary: 'ccd',
      sequence: action === 'read' ? ['read', 'assert-visible-projection'] : cell.expectedAccess === 'allowed'
        ? ['form', 'cya', 'change', 'submit', 'readback']
        : ['observe-state-before', 'attempt-update', 'assert-denied', 'observe-state-and-history-after'],
      sourceKeys: unique(features.map((feature) => feature.sourceKey)) });
  }
  for (const id of sharedIds) obligations.push({ id, kind: 'shared-policy', requiredBoundary: id.endsWith('role-policy') ? 'ccd' : 'candidate', sourceKeys: [] });
  const sequences = (review.sourceSequences ?? []).map((signature) => {
    const support = signature.sourceShapeIds.map((id) => features.find((feature) => feature.id === id)).filter(Boolean);
    const id = `configuration-sequence:${digest(signature)}`;
    return { id, family: 'PRIVATELAW', kind: 'source-shape-sequence', requiredBoundary: signature.requiredBoundary,
      signature, sourceKeys: unique([...support.map((feature) => feature.sourceKey),
        'rpx-xui-webapp:config/default.json',
        'prl-ccd-definitions:definitions/private-law/json/ComplexTypes/ManageOrders/OrderDetails/ComplexTypes.json']) };
  });
  obligations.push(...sequences);
  if (new Set(obligations.map((item) => item.id)).size !== obligations.length) throw new Error('Duplicate configuration obligation');
  return { schemaVersion: 1, scope: review.scope, seed: review.seed, boundary: 'source-and-catalogue', releaseCredit: false,
    pilotAccessBoundary: 'Selected AuthorisationCaseEvent CRUD only; no case, field or state authorisation inferred.',
    sourceManifest: snapshot.sources.map((source) => ({ repository: source.repository, revision: source.revision, path: source.path, tracked: source.tracked, diagnosticOnly: diagnosticConfiguration(source), fileDigest: source.fileDigest, fragmentDigest: digest(source.document) })),
    families: [...families.values()].sort((a, b) => a.id.localeCompare(b.id)), diagnosticFamilies: [...diagnosticFamilies.values()].sort((a, b) => a.id.localeCompare(b.id)), configurationProfiles, features, pilotCells, sequences, obligations };
}

export function selectConfigurationObligations(catalogue, changedPaths) {
  const all = catalogue.obligations.map((item) => item.id);
  if (!Array.isArray(changedPaths) || changedPaths.length === 0) return { mode: 'broad', reason: 'unknown-impact', obligationIds: all };
  const keys = changedPaths.map(({ repository, path }) => `${repository}:${path}`);
  const known = new Set(catalogue.obligations.flatMap((item) => item.sourceKeys));
  if (keys.some((key) => !known.has(key))) return { mode: 'broad', reason: 'unknown-impact', obligationIds: all };
  const obligationIds = catalogue.obligations.filter((item) => sharedIds.includes(item.id) || item.sourceKeys.some((key) => keys.includes(key))).map((item) => item.id);
  return { mode: 'focused', reason: 'direct-and-shared-dependencies', obligationIds };
}

export function validateConfigurationCatalogue({ snapshot, review, catalogue, expectedSnapshot, selectedIds, executedProofs = [] }) {
  const errors = [];
  const gaps = ['effective-environment-values-unavailable', 'definition-discovery-bounded', 'runtime-proof-not-established'];
  if (review.ownerAcceptance !== 'accepted') gaps.push('owner-grouping-acceptance-pending');
  for (const family of catalogue.families) if (!review.families.includes(family.id)) errors.push(`unknown-family:${family.id}`);
  const expectedFragments = expectedSnapshot ? Object.fromEntries(expectedSnapshot.sources.filter((source) => !diagnosticConfiguration(source)).map((source) => [sourceKey(source), digest(source.document)])) : review.sourceFragmentDigests;
  for (const source of snapshot.sources) {
    const key = sourceKey(source);
    if (diagnosticConfiguration(source)) {
      gaps.push(`optional-local-configuration:${key}`);
      continue;
    }
    if (expectedFragments?.[key] !== digest(source.document)) errors.push(`source-drift:${key}`);
    const expectedSource = expectedSnapshot?.sources.find((item) => sourceKey(item) === key);
    if ((expectedSource?.fileDigest ?? review.sourceFileDigests?.[key]) !== source.fileDigest) errors.push(`source-file-drift:${key}`);
    if ((expectedSource?.revision ?? review.sourceRevisions?.[key]) !== source.revision) errors.push(`source-revision-drift:${key}`);
  }
  for (const key of Object.keys(expectedFragments ?? {})) if (!snapshot.sources.some((source) => sourceKey(source) === key)) errors.push(`missing-source:${key}`);
  for (const feature of catalogue.features) {
    if (!review.definitionRowDigests?.[feature.sourceKey]?.includes(feature.rowDigest)) gaps.push(`unreviewed-shape:${feature.id}`);
  }
  for (const distinction of review.distinctions) if (!catalogue.features.some((feature) => Object.entries(distinction).every(([key, value]) => feature[key] === value))) errors.push(`missing-distinction:${distinction.element}`);
  const cells = new Map(catalogue.pilotCells.map((cell) => [cellKey(cell), cell]));
  if (cells.size !== catalogue.pilotCells.length) errors.push('duplicate-pilot-cell');
  for (const example of review.knownValid) {
    const actual = cells.get(cellKey(example));
    if (!actual) errors.push(`missing-valid-cell:${cellKey(example)}`);
    else if (actual.expectedAccess !== example.expectedAccess) errors.push(`wrong-access-outcome:${cellKey(example)}`);
  }
  for (const example of review.knownInvalid) if (cells.has(cellKey(example))) errors.push(`included-invalid-cell:${cellKey(example)}`);
  const validKeys = new Set(review.knownValid.map(cellKey));
  for (const cell of catalogue.pilotCells) if (!validKeys.has(cellKey(cell))) gaps.push(`unreviewed-cell:${cellKey(cell)}`);
  const sequences = catalogue.obligations.filter((item) => item.kind === 'source-shape-sequence');
  for (const example of review.knownValidSequences ?? []) {
    const actual = sequences.find((item) => item.id === example.id);
    if (!actual || Object.entries(example).some(([key, value]) => key !== 'id' && JSON.stringify(actual.signature[key]) !== JSON.stringify(value))) errors.push(`missing-valid-sequence:${example.id}`);
  }
  for (const example of review.knownInvalidSequences ?? []) if (sequences.some((item) =>
    Object.entries(example).every(([key, value]) => key === 'reason' || item.signature[key] === value))) errors.push('included-invalid-sequence');
  for (const sequence of sequences) {
    if (sequence.id !== `configuration-sequence:${digest(sequence.signature)}`) errors.push(`sequence-signature-drift:${sequence.id}`);
    for (const id of sequence.signature.sourceShapeIds) {
      const feature = catalogue.features.find((item) => item.id === id);
      const original = feature && snapshot.sources.find((item) => sourceKey(item) === feature.sourceKey);
      if (!feature || original?.revision !== sequence.signature.sourceRevision ||
          !review.definitionRowDigests?.[feature.sourceKey]?.includes(feature.rowDigest)) errors.push(`sequence-source-shape-drift:${id}`);
    }
  }
  const requiredIds = unique([...buildConfigurationCatalogue(snapshot, review).obligations.map((item) => item.id),
    ...(review.knownValidSequences ?? []).map((item) => item.id)]);
  const actualIds = catalogue.obligations.map((item) => item.id);
  for (const id of requiredIds) if (!actualIds.includes(id)) errors.push(`missing-obligation:${id}`);
  if (new Set(actualIds).size !== actualIds.length) errors.push('duplicate-obligation');
  for (const id of actualIds) if (!requiredIds.includes(id)) errors.push(`unknown-obligation:${id}`);
  const selected = selectedIds ?? requiredIds;
  if (new Set(selected).size !== selected.length) errors.push('duplicate-selection');
  for (const id of selected) if (!requiredIds.includes(id)) errors.push(`unknown-selection:${id}`);
  const coverage = { selected: new Set(selected).size, model: 0, candidate: 0, ccd: 0, external: 0, missingCandidateOrCcd: [] };
  const passing = (id, boundary) => {
    const proofs = executedProofs.filter((proof) => proof.obligationId === id && proof.boundary === boundary);
    return proofs.length === 1 && proofs[0].status === 'passed';
  };
  for (const proof of executedProofs) {
    if (!requiredIds.includes(proof.obligationId)) errors.push(`unknown-executed-obligation:${proof.obligationId}`);
    else if (!boundaries.includes(proof.boundary) || !['passed', 'failed', 'skipped'].includes(proof.status)) errors.push(`invalid-execution:${proof.obligationId}`);
    if (executedProofs.filter((other) => other.obligationId === proof.obligationId && other.boundary === proof.boundary).length > 1) errors.push(`conflicting-executions:${proof.obligationId}:${proof.boundary}`);
  }
  for (const boundary of boundaries) coverage[boundary] = unique(selected).filter((id) => requiredIds.includes(id) && passing(id, boundary)).length;
  coverage.missingCandidateOrCcd = unique(selected).filter((id) => !passing(id, catalogue.obligations.find((item) => item.id === id)?.requiredBoundary));
  return { schemaVersion: 1, boundary: 'source-and-catalogue', releaseCredit: false, errors: unique(errors), gaps: unique(gaps),
    denominator: { validPilotCells: validKeys.size, cataloguedPilotCells: [...cells.keys()].filter((key) => validKeys.has(key)).length, discoveredShapes: catalogue.features.length, validSequences: (review.knownValidSequences ?? []).length, cataloguedSequences: sequences.length, requiredObligations: requiredIds.length }, coverage };
}
