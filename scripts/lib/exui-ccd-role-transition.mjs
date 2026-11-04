import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";

export const TRANSITION_GRANTED_ROLES = Object.freeze([
  "caseworker",
  "caseworker-harness",
  "caseworker-harness-allowed",
]);
export const TRANSITION_REVOKED_ROLES = Object.freeze([
  "caseworker",
  "caseworker-harness",
]);
const tokenDigest = (value) =>
  `sha256:${createHash("sha256").update(value).digest("hex")}`;
const sameRoles = (actual, expected) =>
  Array.isArray(actual) &&
  actual.length === expected.length &&
  [...actual]
    .sort()
    .every((role, index) => role === [...expected].sort()[index]);
const uuid =
  "[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}";
const validUuid = (value) => new RegExp(`^${uuid}$`).test(value);
const validEmail = (email) =>
  new RegExp(`^transitioning-${uuid}@harness\\.example\\.com$`).test(email);
const identity = (value) => ({ id: value.id, roles: [...value.roles].sort() });
const password = "SyntheticHarnessPassword17";
async function idam(route, options, fetchImpl) {
  const response = await fetchImpl(`http://127.0.0.1:5000${route}`, {
    ...options,
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  assert(
    response.status === 200 || response.status === 201,
    `CCD_TRANSITION_IDAM_STATUS_${response.status}`,
  );
  return response.json();
}
function assertUser(user, userId, roles) {
  assert(
    user?.id === userId && validUuid(userId),
    "CCD_TRANSITION_IDENTITY_MISMATCH",
  );
  assert(sameRoles(user.roles, roles), "CCD_TRANSITION_ROLES_MISMATCH");
}
async function account(email, roles, fetchImpl) {
  return idam(
    "/testing-support/accounts",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email,
        forename: "Synthetic",
        surname: "Transitioning",
        password,
        roles: roles.map((code) => ({ code })),
      }),
    },
    fetchImpl,
  );
}
async function observeAccount(email, fetchImpl) {
  return idam(
    `/testing-support/accounts?email=${encodeURIComponent(email)}`,
    {},
    fetchImpl,
  );
}
async function authenticate(
  email,
  userId,
  roles,
  serviceAuthorization,
  fetchImpl,
) {
  const token = await idam(
    "/o/token",
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "password",
        client_id: "ccd_gateway",
        client_secret: "ccd_gateway_secret",
        username: email,
        password,
        scope: "openid profile roles",
        redirect_uri: "http://127.0.0.1:3100/oauth2/callback",
      }).toString(),
    },
    fetchImpl,
  );
  assert(
    typeof token.access_token === "string" && token.access_token.length > 0,
    "CCD_TRANSITION_TOKEN_REQUIRED",
  );
  const headers = {
    Authorization: `Bearer ${token.access_token}`,
    ServiceAuthorization: serviceAuthorization,
    "content-type": "application/json",
    accept: "application/json",
  };
  const observed = await idam(
    "/details",
    { headers: { Authorization: headers.Authorization } },
    fetchImpl,
  );
  assertUser(observed, userId, roles);
  return {
    credential: { userId, email, roles: [...observed.roles], headers },
    observed: identity(observed),
  };
}
export async function provisionRoleTransitionActor({
  email = `transitioning-${randomUUID()}@harness.example.com`,
  serviceAuthorization,
  fetchImpl = fetch,
}) {
  assert(
    validEmail(email) &&
      typeof serviceAuthorization === "string" &&
      serviceAuthorization.length > 0,
    "CCD_TRANSITION_SYNTHETIC_IDENTITY_REQUIRED",
  );
  const created = await account(email, TRANSITION_GRANTED_ROLES, fetchImpl);
  const observed = await observeAccount(email, fetchImpl);
  assertUser(observed, created.uuid, TRANSITION_GRANTED_ROLES);
  return (
    await authenticate(
      email,
      created.uuid,
      TRANSITION_GRANTED_ROLES,
      serviceAuthorization,
      fetchImpl,
    )
  ).credential;
}
export async function revokeRoleTransitionActor(
  initial,
  { fetchImpl = fetch } = {},
) {
  assert(
    validEmail(initial.email),
    "CCD_TRANSITION_SYNTHETIC_IDENTITY_REQUIRED",
  );
  const before = await observeAccount(initial.email, fetchImpl);
  assertUser(before, initial.userId, TRANSITION_GRANTED_ROLES);
  const changed = await account(
    initial.email,
    TRANSITION_REVOKED_ROLES,
    fetchImpl,
  );
  assert(changed.uuid === initial.userId, "CCD_TRANSITION_IDENTITY_MISMATCH");
  const afterAccount = await observeAccount(initial.email, fetchImpl);
  assertUser(afterAccount, initial.userId, TRANSITION_REVOKED_ROLES);
  // Authenticate the existing replaced account. Never call provisioning here: that would restore the grant.
  const renewed = await authenticate(
    initial.email,
    initial.userId,
    TRANSITION_REVOKED_ROLES,
    initial.headers.ServiceAuthorization,
    fetchImpl,
  );
  assert(
    renewed.credential.headers.Authorization !== initial.headers.Authorization,
    "CCD_TRANSITION_TOKEN_NOT_DISTINCT",
  );
  return {
    credential: renewed.credential,
    observations: {
      before: identity(before),
      afterAccount: identity(afterAccount),
      afterAuthentication: renewed.observed,
      tokensDistinct: true,
      oldTokenDigest: tokenDigest(initial.headers.Authorization),
      newTokenDigest: tokenDigest(renewed.credential.headers.Authorization),
    },
  };
}
export function roleTransitionRecord(initial, credential, caseId) {
  const record = {
    schemaVersion: 1,
    caseId,
    oldTokenDigest: tokenDigest(initial.headers.Authorization),
    credential,
  };
  validateRoleTransition(record, initial);
  return record;
}
export function validateRoleTransition(record, initial) {
  assert(
    initial &&
      validEmail(initial.email) &&
      sameRoles(initial.roles, TRANSITION_GRANTED_ROLES),
    "CCD_TRANSITION_INITIAL_ACTOR_REQUIRED",
  );
  assert(
    record?.schemaVersion === 1 && /^\d{16}$/.test(record.caseId),
    "CCD_TRANSITION_CASE_REQUIRED",
  );
  assert(
    record.oldTokenDigest === tokenDigest(initial.headers.Authorization),
    "CCD_TRANSITION_OLD_TOKEN_MISMATCH",
  );
  const renewed = record.credential;
  assert(
    renewed?.userId === initial.userId && renewed.email === initial.email,
    "CCD_TRANSITION_IDENTITY_MISMATCH",
  );
  assert(
    sameRoles(renewed.roles, TRANSITION_REVOKED_ROLES),
    "CCD_TRANSITION_ROLES_MISMATCH",
  );
  assert(
    typeof renewed.headers?.Authorization === "string" &&
      /^Bearer \S+$/.test(renewed.headers.Authorization) &&
      renewed.headers.Authorization !== initial.headers.Authorization,
    "CCD_TRANSITION_TOKEN_NOT_DISTINCT",
  );
  assert(
    renewed.headers.ServiceAuthorization ===
      initial.headers.ServiceAuthorization,
    "CCD_TRANSITION_SERVICE_IDENTITY_MISMATCH",
  );
  return renewed;
}
