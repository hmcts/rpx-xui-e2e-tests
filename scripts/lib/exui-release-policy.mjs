import { createHash } from 'node:crypto';

const digest = (value) => 'sha256:' + createHash('sha256').update(JSON.stringify(value)).digest('hex');

// This reviewed pilot scope cannot authorize a full EXUI release.
export function getReleasePolicy(scope) {
  if (scope !== 'exui-wa-family-pilot') throw new Error('UNSUPPORTED_RELEASE_SCOPE');
  const policy = {
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
  };
  return { ...policy, policyDigest: digest(policy) };
}
