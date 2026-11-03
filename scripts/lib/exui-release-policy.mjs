import { createHash } from 'node:crypto';

const postalSequenceId = 'configuration-sequence:5e3fa818f42a05cf53c18623577ef91e26ceaff4ee829692ad7cf5e305ce22ed';
const digest = (value) => 'sha256:' + createHash('sha256').update(JSON.stringify(value)).digest('hex');

// This reviewed pilot scope cannot authorize a full EXUI release.
export function getReleasePolicy(scope) {
  if (!['exui-wa-family-pilot', 'exui-wa-scope-pilot', 'exui-ccd-pilot'].includes(scope)) throw new Error('UNSUPPORTED_RELEASE_SCOPE');
  const policy = scope === 'exui-wa-family-pilot' ? {
    releaseScopeId: scope,
    requiredObligationIds: ['wa-family-membership'],
    obligations: [{
      id: 'wa-family-membership', boundary: 'candidate',
      requiredProofIds: ['wa-family-options'], requiredMutationIds: ['wa-drop-family']
    }],
    mutationDefinitions: [{
      mutationId: 'wa-drop-family', obligationId: 'wa-family-membership',
      definitionDigest: digest({ boundary: 'candidate', transformation: 'remove-supported-IA-family' }),
      expectedFailureId: 'family-membership', baselineProofId: 'wa-family-options', mutantProofId: 'wa-missing-family'
    }]
  } : scope === 'exui-wa-scope-pilot' ? {
    releaseScopeId: scope,
    requiredObligationIds: ['wa-organisation-scope'],
    obligations: [{ id: 'wa-organisation-scope', boundary: 'candidate',
      requiredProofIds: ['wa-org-scope-ia', 'wa-org-scope-civil'], requiredMutationIds: ['wa-broaden-scope'] }],
    mutationDefinitions: [{ mutationId: 'wa-broaden-scope', obligationId: 'wa-organisation-scope',
      definitionDigest: digest({ boundary: 'candidate', transformation: 'include-case-roles-in-organisation-location-scope' }),
      expectedFailureId: 'organisation-scope', baselineProofId: 'wa-org-scope-ia', mutantProofId: 'wa-scope-broadened' }]
  } : {
    releaseScopeId: scope,
    requiredObligationIds: ['ccd-nested-preservation', 'ccd-access-integrity', postalSequenceId],
    obligations: [
      { id: 'ccd-nested-preservation', boundary: 'ccd', requiredProofIds: ['ccd-nested-roundtrip'], requiredMutationIds: ['ccd-drop-child'] },
      { id: 'ccd-access-integrity', boundary: 'ccd', requiredProofIds: ['ccd-role-policy'], requiredMutationIds: ['ccd-broaden-access', 'ccd-write-then-deny'] },
      { id: postalSequenceId, boundary: 'ccd', requiredProofIds: ['ccd-postal-two-roundtrip'], requiredMutationIds: ['ccd-drop-postal-optional-child'] }
    ],
    mutationDefinitions: [
      { mutationId: 'ccd-drop-child', obligationId: 'ccd-nested-preservation',
        definitionDigest: digest({ boundary: 'ccd', transformation: 'drop-nested-email-address-on-submit' }),
        expectedFailureId: 'nested-persistence', baselineProofId: 'ccd-nested-roundtrip', mutantProofId: 'ccd-child-loss' },
      { mutationId: 'ccd-broaden-access', obligationId: 'ccd-access-integrity',
        definitionDigest: digest({ boundary: 'ccd', transformation: 'grant-denied-persona-protected-case-read' }),
        expectedFailureId: 'denied-data-isolation', baselineProofId: 'ccd-role-policy', mutantProofId: 'ccd-access-broadened' },
      { mutationId: 'ccd-write-then-deny', obligationId: 'ccd-access-integrity',
        definitionDigest: digest({ boundary: 'ccd', transformation: 'persist-protected-field-change-before-denied-response' }),
        expectedFailureId: 'denied-state-integrity', baselineProofId: 'ccd-role-policy', mutantProofId: 'ccd-write-then-deny' },
      { mutationId: 'ccd-drop-postal-optional-child', obligationId: postalSequenceId,
        definitionDigest: digest({ boundary: 'ccd', transformation: 'drop-second-postal-recipient-optional-address-line2-on-submit' }),
        expectedFailureId: 'postal-persistence', baselineProofId: 'ccd-postal-two-roundtrip', mutantProofId: 'ccd-postal-child-loss' }
    ]
  };
  return { ...policy, policyDigest: digest(policy) };
}
