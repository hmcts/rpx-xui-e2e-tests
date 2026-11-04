import { createHash } from 'node:crypto';

const postalSequenceId = 'configuration-sequence:5e3fa818f42a05cf53c18623577ef91e26ceaff4ee829692ad7cf5e305ce22ed';
const digest = (value) => 'sha256:' + createHash('sha256').update(JSON.stringify(value)).digest('hex');

// This reviewed pilot scope cannot authorize a full EXUI release.
export function getReleasePolicy(scope) {
  if (scope === 'exui-ccd-event-capability-pilot') {
    const courtadminCell = 'configuration-cell:a6d5e8421152eca670bc39912f6781824bfc3190d2b78ed9ea7757b5f168e313';
    const courtadminReadCell = 'configuration-cell:8c1a3f11d156a5557c5400305414da596d644a4d2378aa539753a7e9fc88d76a';
    const policy = {
      releaseScopeId: scope,
      requiredObligationIds: [courtadminCell, 'ccd-source-event-capability', courtadminReadCell],
      obligations: [
        { id: courtadminCell, boundary: 'ccd', requiredProofIds: ['ccd-courtadmin-email-one'], requiredMutationIds: [] },
        { id: 'ccd-source-event-capability', boundary: 'ccd', requiredProofIds: ['ccd-event-create-denied'], requiredMutationIds: ['ccd-enable-judge-event'] },
        { id: courtadminReadCell, boundary: 'ccd', requiredProofIds: ['ccd-courtadmin-read-email-one'], requiredMutationIds: ['ccd-remove-courtadmin-recipient-read'] }
      ],
      mutationDefinitions: [{
        mutationId: 'ccd-enable-judge-event', obligationId: 'ccd-source-event-capability',
        definitionDigest: digest({ boundary: 'ccd', transformation: 'change-only-source-judge-serviceOfDocuments-event-CRUD-R-to-CR' }),
        expectedFailureId: 'event-capability-isolation', baselineProofId: 'ccd-event-create-denied', mutantProofId: 'ccd-event-create-enabled'
      }, {
        mutationId: 'ccd-remove-courtadmin-recipient-read', obligationId: courtadminReadCell,
        definitionDigest: digest({ boundary: 'ccd', transformation: 'change-only-source-courtadmin-sodAdditionalRecipientsList-field-CRUD-to-CUD' }),
        expectedFailureId: 'courtadmin-recipient-read-projection', baselineProofId: 'ccd-courtadmin-read-email-one', mutantProofId: 'ccd-courtadmin-read-hidden'
      }]
    };
    return { ...policy, policyDigest: digest(policy) };
  }
  if (scope === 'exui-hearing-publication-pilot') {
    const policy = {
      releaseScopeId: scope,
      requiredObligationIds: ['hearing-published-capabilities'],
      obligations: [{ id: 'hearing-published-capabilities', boundary: 'candidate',
        requiredProofIds: ['hearing-prod-capabilities'], requiredMutationIds: ['hearing-amendments-use-enabled-map'] }],
      mutationDefinitions: [{ mutationId: 'hearing-amendments-use-enabled-map', obligationId: 'hearing-published-capabilities',
        definitionDigest: digest({ boundary: 'candidate', transformation: 'replace-prod-amendment-map-with-candidate-prod-enabled-map' }),
        expectedFailureId: 'hearing-amendment-capability-map', baselineProofId: 'hearing-prod-capabilities', mutantProofId: 'hearing-amendment-map-broadened' }],
    };
    return { ...policy, policyDigest: digest(policy) };
  }
  if (scope === 'exui-global-search-pilot') {
    const policy = { releaseScopeId: scope, requiredObligationIds: ['global-search-capability-composition'],
      obligations: [{ id: 'global-search-capability-composition', boundary: 'candidate', requiredProofIds: ['global-search-all-services'], requiredMutationIds: ['global-search-wa-capability'] }],
      mutationDefinitions: [{ mutationId: 'global-search-wa-capability', obligationId: 'global-search-capability-composition',
        definitionDigest: digest({ boundary: 'candidate', transformation: 'bind-globalSearchServices-to-waSupportedJurisdictions' }),
        expectedFailureId: 'global-search-capability-scope', baselineProofId: 'global-search-all-services', mutantProofId: 'global-search-wa-list' }] };
    return { ...policy, policyDigest: digest(policy) };
  }
  if (scope === 'exui-decentralised-routing-pilot') {
    const policy = { releaseScopeId: scope, requiredObligationIds: ['routing-create-entry', 'routing-noc-cache'],
      obligations: [
        { id: 'routing-create-entry', boundary: 'candidate', requiredProofIds: ['routing-create-redirect-fallback'], requiredMutationIds: ['routing-omit-web-url'] },
        { id: 'routing-noc-cache', boundary: 'candidate', requiredProofIds: ['routing-noc-session-cache'], requiredMutationIds: ['routing-omit-noc-base-url'] }
      ], mutationDefinitions: [
        { mutationId: 'routing-omit-web-url', obligationId: 'routing-create-entry', definitionDigest: digest({ boundary: 'candidate', transformation: 'omit-only-PCS-webUrl' }), expectedFailureId: 'event-redirect', baselineProofId: 'routing-create-redirect-fallback', mutantProofId: 'routing-web-url-omission' },
        { mutationId: 'routing-omit-noc-base-url', obligationId: 'routing-noc-cache', definitionDigest: digest({ boundary: 'candidate', transformation: 'omit-only-PCS-nocBaseUrl' }), expectedFailureId: 'noc-session-routing', baselineProofId: 'routing-noc-session-cache', mutantProofId: 'routing-noc-url-omission' }
      ] };
    return { ...policy, policyDigest: digest(policy) };
  }
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
    requiredObligationIds: ['ccd-nested-preservation', 'ccd-access-integrity', 'ccd-role-revocation', postalSequenceId],
    obligations: [
      { id: 'ccd-nested-preservation', boundary: 'ccd', requiredProofIds: ['ccd-nested-roundtrip'], requiredMutationIds: ['ccd-drop-child'] },
      { id: 'ccd-role-revocation', boundary: 'ccd', requiredProofIds: ['ccd-role-revocation'], requiredMutationIds: ['ccd-stale-revoked-bearer'] },
      { id: 'ccd-access-integrity', boundary: 'ccd', requiredProofIds: ['ccd-role-policy'], requiredMutationIds: ['ccd-broaden-access', 'ccd-write-then-deny'] },
      { id: postalSequenceId, boundary: 'ccd', requiredProofIds: ['ccd-postal-two-roundtrip'], requiredMutationIds: ['ccd-drop-postal-optional-child'] }
    ],
    mutationDefinitions: [
      { mutationId: 'ccd-drop-child', obligationId: 'ccd-nested-preservation',
        definitionDigest: digest({ boundary: 'ccd', transformation: 'drop-nested-email-address-on-submit' }),
        expectedFailureId: 'nested-persistence', baselineProofId: 'ccd-nested-roundtrip', mutantProofId: 'ccd-child-loss' },
      { mutationId: 'ccd-stale-revoked-bearer', obligationId: 'ccd-role-revocation',
        definitionDigest: digest({ boundary: 'ccd', transformation: 'substitute-same-revoked-actor-original-warmed-bearer-on-exact-case-read' }),
        expectedFailureId: 'revoked-data-isolation', baselineProofId: 'ccd-role-revocation', mutantProofId: 'ccd-stale-revoked-bearer' },
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
