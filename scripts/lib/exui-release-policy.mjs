import { CALLBACK_SCOPE, CALLBACK_OBLIGATION, CALLBACK_PROOF, CALLBACK_MUTATION, CALLBACK_MUTANT_PROOF, CALLBACK_FAILURE } from './exui-recipient-callback-contract.mjs';
import { SOURCE_SHAPE_ROWS } from './exui-source-shape-contract.mjs';
import { createHash } from 'node:crypto';

const postalSequenceId = 'configuration-sequence:5e3fa818f42a05cf53c18623577ef91e26ceaff4ee829692ad7cf5e305ce22ed';
const digest = (value) => 'sha256:' + createHash('sha256').update(JSON.stringify(value)).digest('hex');

// This reviewed pilot scope cannot authorize a full EXUI release.
export function getReleasePolicy(scope) {
  if (scope === CALLBACK_SCOPE) {
    const policy={releaseScopeId:scope,requiredObligationIds:[CALLBACK_OBLIGATION],
      obligations:[{id:CALLBACK_OBLIGATION,boundary:'candidate',requiredProofIds:[CALLBACK_PROOF],requiredMutationIds:[CALLBACK_MUTATION]}],
      mutationDefinitions:[{mutationId:CALLBACK_MUTATION,obligationId:CALLBACK_OBLIGATION,
        definitionDigest:digest({sourceRowDigest:'sha256:867df74fb320620da2249eb754aea68faecfb8cc2de18ab5298c2239179b6196',column:'CallBackURLMidEvent',transformation:'omit-only-source-page2-mid-event-binding'}),
        expectedFailureId:CALLBACK_FAILURE,baselineProofId:CALLBACK_PROOF,mutantProofId:CALLBACK_MUTANT_PROOF}]};
    return {...policy,policyDigest:digest(policy)};
  }
  if (scope === 'exui-ccd-event-capability-pilot') {
    const courtadminCell = 'ccd-source-courtadmin-update-shapes';
    const courtadminReadCell = 'ccd-source-courtadmin-read-shapes';
    const readonlyUpdateCell = 'ccd-source-readonly-update-shapes';
    const readonlyReadCell = 'ccd-source-readonly-read-shapes';
    const policy = {
      releaseScopeId: scope,
      requiredObligationIds: [courtadminCell, 'ccd-source-event-capability', courtadminReadCell, readonlyReadCell, readonlyUpdateCell],
      obligations: [
        { id: courtadminCell, boundary: 'ccd', requiredProofIds: ['ccd-courtadmin-update-recipient-shapes'], requiredMutationIds: ['ccd-remove-courtadmin-event-create'] },
        { id: 'ccd-source-event-capability', boundary: 'ccd', requiredProofIds: ['ccd-event-create-denied'], requiredMutationIds: ['ccd-enable-judge-event'] },
        { id: courtadminReadCell, boundary: 'ccd', requiredProofIds: ['ccd-courtadmin-read-recipient-shapes'], requiredMutationIds: ['ccd-remove-courtadmin-recipient-read'] },
        { id: readonlyReadCell, boundary: 'ccd', requiredProofIds: ['ccd-readonly-read-recipient-shapes'], requiredMutationIds: ['ccd-remove-readonly-recipient-read'] },
        { id: readonlyUpdateCell, boundary: 'ccd', requiredProofIds: ['ccd-readonly-update-recipient-shapes-denied'], requiredMutationIds: ['ccd-enable-readonly-recipient-update'] }
      ],
      mutationDefinitions: [{
        mutationId: 'ccd-enable-judge-event', obligationId: 'ccd-source-event-capability',
        definitionDigest: digest({ boundary: 'ccd', transformation: 'change-only-source-judge-serviceOfDocuments-event-CRUD-R-to-CR' }),
        expectedFailureId: 'event-capability-isolation', baselineProofId: 'ccd-event-create-denied', mutantProofId: 'ccd-event-create-enabled'
      }, {
        mutationId: 'ccd-remove-courtadmin-recipient-read', obligationId: courtadminReadCell,
        definitionDigest: digest({ boundary: 'ccd', transformation: 'change-only-source-courtadmin-sodAdditionalRecipientsList-field-CRUD-to-CUD' }),
        expectedFailureId: 'courtadmin-recipient-read-projection', baselineProofId: 'ccd-courtadmin-read-recipient-shapes', mutantProofId: 'ccd-courtadmin-read-shapes-hidden'
      }, {
        mutationId: 'ccd-remove-readonly-recipient-read', obligationId: readonlyReadCell,
        definitionDigest: digest({ boundary: 'ccd', transformation: 'change-only-source-readonly-sodAdditionalRecipientsList-field-R-to-U' }),
        expectedFailureId: 'readonly-recipient-read-projection', baselineProofId: 'ccd-readonly-read-recipient-shapes', mutantProofId: 'ccd-readonly-read-shapes-hidden'
      }, {
        mutationId: 'ccd-enable-readonly-recipient-update', obligationId: readonlyUpdateCell,
        definitionDigest: digest({ boundary: 'ccd', transformation: 'change-only-source-readonly-type-state-recipient-field-R-to-RU-and-serviceOfDocuments-event-R-to-CR' }),
        expectedFailureId: 'readonly-update-isolation', baselineProofId: 'ccd-readonly-update-recipient-shapes-denied', mutantProofId: 'ccd-readonly-update-recipient-shapes-enabled'
      }, {
        mutationId: 'ccd-remove-courtadmin-event-create', obligationId: courtadminCell,
        definitionDigest: digest({ boundary: 'ccd', transformation: 'change-only-source-courtadmin-serviceOfDocuments-event-CRUD-CRU-to-RU' }),
        expectedFailureId: 'courtadmin-update-persistence', baselineProofId: 'ccd-courtadmin-update-recipient-shapes', mutantProofId: 'ccd-courtadmin-update-recipient-shapes-denied'
      }]
    };
    for (const row of SOURCE_SHAPE_ROWS) {
      const obligationId = `ccd-source-shape-${row.id}`, mutationId = `ccd-shape-${row.id}`;
      policy.requiredObligationIds.push(obligationId);
      policy.obligations.push({id:obligationId,boundary:'ccd',requiredProofIds:[obligationId],requiredMutationIds:[mutationId]});
      policy.mutationDefinitions.push({mutationId,obligationId,definitionDigest:digest({reference:row.reference,column:row.faultColumn,value:row.faultValue}),
        expectedFailureId:`source-shape-${row.id}`,baselineProofId:obligationId,mutantProofId:`${obligationId}-fault`});
    }
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
    requiredObligationIds: ['ccd-nested-preservation', 'ccd-access-integrity', 'ccd-role-revocation', postalSequenceId, 'ccd-prl-workbasket-source-inputs'],
    obligations: [
      { id: 'ccd-nested-preservation', boundary: 'ccd', requiredProofIds: ['ccd-nested-roundtrip'], requiredMutationIds: ['ccd-drop-child'] },
      { id: 'ccd-role-revocation', boundary: 'ccd', requiredProofIds: ['ccd-role-revocation'], requiredMutationIds: ['ccd-stale-revoked-bearer'] },
      { id: 'ccd-access-integrity', boundary: 'ccd', requiredProofIds: ['ccd-role-policy'], requiredMutationIds: ['ccd-broaden-access', 'ccd-write-then-deny'] },
      { id: postalSequenceId, boundary: 'ccd', requiredProofIds: ['ccd-postal-two-roundtrip'], requiredMutationIds: ['ccd-drop-postal-optional-child'] },
      { id: 'ccd-prl-workbasket-source-inputs', boundary: 'candidate', requiredProofIds: ['ccd-prl-workbasket-inputs'], requiredMutationIds: ['ccd-drop-workbasket-field'] }
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
      { mutationId: 'ccd-drop-workbasket-field', obligationId: 'ccd-prl-workbasket-source-inputs',
        definitionDigest: digest({ boundary: 'candidate', transformation: 'remove-only-applicantCaseName-from-real-CCD-workbasket-response' }),
        expectedFailureId: 'workbasket-source-field', baselineProofId: 'ccd-prl-workbasket-inputs', mutantProofId: 'ccd-prl-workbasket-inputs-fault' },
      { mutationId: 'ccd-drop-postal-optional-child', obligationId: postalSequenceId,
        definitionDigest: digest({ boundary: 'ccd', transformation: 'drop-second-postal-recipient-optional-address-line2-on-submit' }),
        expectedFailureId: 'postal-persistence', baselineProofId: 'ccd-postal-two-roundtrip', mutantProofId: 'ccd-postal-child-loss' }
    ]
  };
  return { ...policy, policyDigest: digest(policy) };
}
