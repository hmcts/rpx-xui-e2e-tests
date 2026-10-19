import {
  isExplicitIdamLoginRejection,
  isIdentityScopedCaptureTimeout,
  isIdentityScopedLoginSurfaceTimeout,
  isUnexplainedIdamLoginRejection,
} from './sessionCaptureRetry.js';
import { resolveSessionIdentity, type SessionIdentity, type SessionIdentityInput } from './sessionIdentity.js';

export type OrderedSessionResult<T> = {
  selectedUserIdentifier: string;
  value: T;
};

export async function withOrderedSessionFallback<T>(
  candidates: readonly SessionIdentityInput[],
  useSession: (identity: SessionIdentity) => Promise<T>
): Promise<OrderedSessionResult<T>> {
  if (candidates.length === 0) {
    throw new Error('Session pool has no configured identities.');
  }

  const seenEmails = new Set<string>();
  let lastIdentityError: unknown;
  let nextCandidateIsBoundedProbe = false;

  for (const candidate of candidates) {
    const identity = resolveSessionIdentity(candidate);
    const identityKey = identity.email.trim().toLowerCase();
    if (seenEmails.has(identityKey)) continue;
    seenEmails.add(identityKey);

    const isBoundedProbe = nextCandidateIsBoundedProbe;
    nextCandidateIsBoundedProbe = false;
    try {
      return {
        selectedUserIdentifier: identity.userIdentifier,
        value: await useSession(identity),
      };
    } catch (error) {
      if (isBoundedProbe) throw error;
      if (isExplicitIdamLoginRejection(error) || isIdentityScopedLoginSurfaceTimeout(error)) {
        lastIdentityError = error;
        continue;
      }
      if (isIdentityScopedCaptureTimeout(error) || isUnexplainedIdamLoginRejection(error)) {
        lastIdentityError = error;
        nextCandidateIsBoundedProbe = true;
        continue;
      }
      throw error;
    }
  }

  throw lastIdentityError ?? new Error('Session pool identities all failed.');
}
