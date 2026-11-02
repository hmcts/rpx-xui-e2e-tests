import { isDeepStrictEqual } from 'node:util';

const requireFact = (condition, code) => { if (!condition) throw new Error(code); };
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const identifier = (value) => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value);
const digest = (value) => typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value);
const timestamp = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const candidatePath = /^(webappCommit|artifactDigest|dependencyLockDigest|toolkitVersion|toolkitDigest|configurationDigest|definitionDigests\.[A-Za-z0-9_-]+|dependencyIdentities\.[A-Za-z0-9_-]+\.(artifactDigest|apiContractDigest))$/;
const lookup = (value, path) => path.split('.').reduce((current, key) => object(current) && Object.hasOwn(current, key) ? current[key] : undefined, value);

/** Original receipts stay distinct from internal executions. The loader verifies their bytes. */
export function evaluateExternalEvidence(manifest, policy, results = [], evaluatedAt) {
  requireFact(Array.isArray(results), 'INVALID_EXTERNAL_RESULTS');
  const required = new Map(policy.obligations.filter((item) => item.boundary === 'external' && policy.requiredObligationIds.includes(item.id))
    .flatMap((obligation) => obligation.requiredProofIds.map((proofId) => [proofId, obligation])));
  const rules = policy.externalCompatibilityRules ?? [];
  requireFact(Array.isArray(rules), 'INVALID_EXTERNAL_RULES');
  const byProof = new Map();
  const ruleIds = new Set();
  for (const rule of rules) {
    requireFact(object(rule) && ['id', 'proofId', 'producerGateId', 'producerScopeId', 'producerProofId'].every((key) => identifier(rule[key])), 'INVALID_EXTERNAL_RULE');
    requireFact(required.has(rule.proofId) && !byProof.has(rule.proofId) && !ruleIds.has(rule.id), 'UNASSIGNED_OR_DUPLICATE_EXTERNAL_RULE');
    requireFact(digest(rule.gateConfigurationDigest) && Number.isInteger(rule.maxAgeSeconds) && rule.maxAgeSeconds > 0, 'INVALID_EXTERNAL_POLICY_LIMITS');
    // shortcut: numeric immutable Jenkins/GitHub build IDs; add a reviewed adapter before accepting another producer format.
    requireFact(rule.producerRunIdFormat === 'build-number', 'UNSUPPORTED_EXTERNAL_RUN_ID_FORMAT');
    requireFact(Array.isArray(rule.identityBindings) && rule.identityBindings.length > 0, 'EMPTY_EXTERNAL_COMPATIBILITY');
    requireFact(rule.identityBindings.every((binding) => object(binding) && identifier(binding.producerKey) && candidatePath.test(binding.candidatePath)), 'INVALID_EXTERNAL_IDENTITY_BINDING');
    requireFact(new Set(rule.identityBindings.map((item) => item.producerKey)).size === rule.identityBindings.length &&
      new Set(rule.identityBindings.map((item) => item.candidatePath)).size === rule.identityBindings.length, 'DUPLICATE_EXTERNAL_IDENTITY_BINDING');
    requireFact(typeof rule.artifactUriTemplate === 'string' && rule.artifactUriTemplate.includes('{producerRunId}'), 'NON_IMMUTABLE_EXTERNAL_URI_POLICY');
    const uri = new URL(rule.artifactUriTemplate.replaceAll('{producerRunId}', 'run'));
    requireFact(uri.protocol === 'https:' && !uri.username && !uri.password && !uri.search && !uri.hash && !uri.pathname.includes('{'), 'INVALID_EXTERNAL_URI_POLICY');
    requireFact(required.get(rule.proofId).requiredMutationIds.length === 0, 'EXTERNAL_MUTATION_MUST_BE_OWNED_BY_PRODUCER');
    byProof.set(rule.proofId, rule); ruleIds.add(rule.id);
  }
  const seen = new Set();
  const failures = [];
  for (const result of results) {
    requireFact(object(result) && required.has(result.proofId) && !seen.has(result.proofId), 'UNKNOWN_OR_DUPLICATE_EXTERNAL_PROOF');
    seen.add(result.proofId);
    const rule = byProof.get(result.proofId);
    requireFact(rule && rule.id === result.compatibilityRuleId, 'EXTERNAL_COMPATIBILITY_RULE_MISMATCH');
    requireFact(result.releaseRunId === manifest.runId && result.obligationId === required.get(result.proofId).id, 'EXTERNAL_RELEASE_BINDING_MISMATCH');
    requireFact(typeof result.producerRunId === 'string' && /^[1-9][0-9]*$/.test(result.producerRunId), 'INVALID_EXTERNAL_PRODUCER_RUN');
    const artifact = result.producerArtifact;
    requireFact(object(artifact) && typeof artifact.path === 'string' && artifact.path.length > 0 && digest(artifact.digest), 'INVALID_EXTERNAL_ARTIFACT');
    requireFact(artifact.uri === rule.artifactUriTemplate.replaceAll('{producerRunId}', encodeURIComponent(result.producerRunId)), 'EXTERNAL_ARTIFACT_URI_MISMATCH');
    const original = result.original;
    requireFact(object(original) && original.schemaVersion === 1 && original.producerRunId === result.producerRunId &&
      original.producerGateId === rule.producerGateId && original.producerScopeId === rule.producerScopeId && original.proofId === rule.producerProofId &&
      original.gateConfigurationDigest === rule.gateConfigurationDigest, 'EXTERNAL_PRODUCER_SCOPE_MISMATCH');
    requireFact(original.complete === true && original.attempts === 1 && ['PASS', 'FAIL'].includes(original.outcome), 'UNAVAILABLE_EXTERNAL_RESULT');
    requireFact(timestamp(original.completedAt) && timestamp(evaluatedAt), 'INVALID_EXTERNAL_TIME');
    const age = Date.parse(evaluatedAt) - Date.parse(original.completedAt);
    requireFact(age >= 0 && age <= rule.maxAgeSeconds * 1000, 'STALE_OR_FUTURE_EXTERNAL_RESULT');
    requireFact(object(original.identity), 'MISSING_EXTERNAL_IDENTITY');
    for (const binding of rule.identityBindings) {
      const expected = lookup(manifest.identity, binding.candidatePath);
      requireFact(typeof expected === 'string' && Object.hasOwn(original.identity, binding.producerKey) &&
        isDeepStrictEqual(original.identity[binding.producerKey], expected), 'EXTERNAL_IDENTITY_MISMATCH');
    }
    if (original.outcome === 'FAIL') failures.push(`OBSERVED_FAILED_EXTERNAL_RESULT:${result.proofId}`);
  }
  for (const proofId of required.keys()) requireFact(seen.has(proofId), `MISSING_EXTERNAL_PROOF:${proofId}`);
  return failures;
}
