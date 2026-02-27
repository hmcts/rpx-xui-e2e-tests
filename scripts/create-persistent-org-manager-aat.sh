#!/usr/bin/env bash
set -euo pipefail

# Creates (invites) a durable professional user in AAT via PRD internal endpoint.
# This does NOT use SIDAM testing-support user creation endpoints.
#
# Required env vars:
#   ASSIGNER_USERNAME            Existing org-admin user in target org
#   ASSIGNER_PASSWORD            Password for existing org-admin user
#   IDAM_CLIENT_SECRET           OAuth client secret (e.g. xuiwebapp secret)
#   ORG_ID                       Target organisation identifier (e.g. QO4A1Q8)
#   NEW_USER_EMAIL               New user email (must be unique)
#   NEW_USER_FIRST_NAME          New user first name
#   NEW_USER_LAST_NAME           New user last name
#
# Optional env vars:
#   AAT_ENV                      Default: aat
#   IDAM_WEB_URL                 Default: https://idam-web-public.${AAT_ENV}.platform.hmcts.net
#   RD_PROFESSIONAL_API_PATH     Default: http://rd-professional-api-${AAT_ENV}.service.core-compute-${AAT_ENV}.internal
#   S2S_URL                      Default: http://rpe-service-auth-provider-${AAT_ENV}.service.core-compute-${AAT_ENV}.internal/testing-support/lease
#   IDAM_CLIENT_ID               Default: xuiwebapp
#   IDAM_SCOPE                   Default: "openid profile roles manage-user create-user"
#   S2S_MICROSERVICE_NAME        Default: xui_webapp
#   S2S_SECRET                   Optional S2S secret; if set sends Basic auth header
#   NEW_USER_ROLES               Default: pui-organisation-manager
#   RESEND_INVITE                Default: true
#   S2S_TOKEN                    Optional pre-seeded service token

require_var() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "ERROR: Missing required env var: ${name}" >&2
    exit 1
  fi
}

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required." >&2
  exit 1
fi

require_var ASSIGNER_USERNAME
require_var ASSIGNER_PASSWORD
require_var IDAM_CLIENT_SECRET
require_var ORG_ID
require_var NEW_USER_EMAIL
require_var NEW_USER_FIRST_NAME
require_var NEW_USER_LAST_NAME

AAT_ENV="${AAT_ENV:-aat}"
IDAM_WEB_URL="${IDAM_WEB_URL:-https://idam-web-public.${AAT_ENV}.platform.hmcts.net}"
RD_PROFESSIONAL_API_PATH="${RD_PROFESSIONAL_API_PATH:-http://rd-professional-api-${AAT_ENV}.service.core-compute-${AAT_ENV}.internal}"
S2S_URL="${S2S_URL:-http://rpe-service-auth-provider-${AAT_ENV}.service.core-compute-${AAT_ENV}.internal/testing-support/lease}"
IDAM_CLIENT_ID="${IDAM_CLIENT_ID:-xuiwebapp}"
IDAM_SCOPE="${IDAM_SCOPE:-openid profile roles manage-user create-user}"
S2S_MICROSERVICE_NAME="${S2S_MICROSERVICE_NAME:-xui_webapp}"
NEW_USER_ROLES="${NEW_USER_ROLES:-pui-organisation-manager}"
RESEND_INVITE="${RESEND_INVITE:-true}"

if [[ "${RESEND_INVITE}" != "true" && "${RESEND_INVITE}" != "false" ]]; then
  echo "ERROR: RESEND_INVITE must be 'true' or 'false'." >&2
  exit 1
fi

echo "Generating user bearer token from IDAM password grant..."
IDAM_TOKEN_RESPONSE="$(
  curl -fsS -X POST "${IDAM_WEB_URL}/o/token" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    --data-urlencode "grant_type=password" \
    --data-urlencode "client_id=${IDAM_CLIENT_ID}" \
    --data-urlencode "client_secret=${IDAM_CLIENT_SECRET}" \
    --data-urlencode "username=${ASSIGNER_USERNAME}" \
    --data-urlencode "password=${ASSIGNER_PASSWORD}" \
    --data-urlencode "scope=${IDAM_SCOPE}"
)"
USER_BEARER_TOKEN="$(echo "${IDAM_TOKEN_RESPONSE}" | jq -r '.access_token // empty')"
if [[ -z "${USER_BEARER_TOKEN}" ]]; then
  echo "ERROR: Failed to read access_token from IDAM response." >&2
  echo "${IDAM_TOKEN_RESPONSE}" >&2
  exit 1
fi

if [[ -z "${S2S_TOKEN:-}" ]]; then
  echo "Generating S2S token from testing-support lease endpoint..."
  S2S_LEASE_URL="${S2S_URL%/}"
  if [[ ! "${S2S_LEASE_URL}" =~ /lease$ ]]; then
    S2S_LEASE_URL="${S2S_LEASE_URL}/lease"
  fi

  AUTH_HEADER=()
  if [[ -n "${S2S_SECRET:-}" ]]; then
    BASIC_AUTH_VALUE="$(printf '%s' "${S2S_MICROSERVICE_NAME}:${S2S_SECRET}" | base64)"
    AUTH_HEADER=(-H "Authorization: Basic ${BASIC_AUTH_VALUE}")
  fi

  S2S_TOKEN="$(
    curl -fsS -X POST "${S2S_LEASE_URL}" \
      -H "Content-Type: application/json" \
      "${AUTH_HEADER[@]}" \
      --data "{\"microservice\":\"${S2S_MICROSERVICE_NAME}\"}" \
      | tr -d '"'
  )"
fi
if [[ -z "${S2S_TOKEN}" ]]; then
  echo "ERROR: Failed to generate/read S2S token." >&2
  exit 1
fi

ROLES_JSON="$(
  echo "${NEW_USER_ROLES}" \
    | tr ',' '\n' \
    | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' \
    | sed '/^$/d' \
    | jq -R . \
    | jq -s .
)"

PAYLOAD="$(
  jq -n \
    --arg firstName "${NEW_USER_FIRST_NAME}" \
    --arg lastName "${NEW_USER_LAST_NAME}" \
    --arg email "${NEW_USER_EMAIL}" \
    --argjson roles "${ROLES_JSON}" \
    --argjson resendInvite "${RESEND_INVITE}" \
    '{
      firstName: $firstName,
      lastName: $lastName,
      email: $email,
      roles: $roles,
      resendInvite: $resendInvite
    }'
)"

echo "Inviting user into organisation ${ORG_ID} via PRD..."
INVITE_RESPONSE="$(
  curl -sS -w '\n%{http_code}' -X POST \
    "${RD_PROFESSIONAL_API_PATH}/refdata/internal/v1/organisations/${ORG_ID}/users/" \
    -H "Authorization: Bearer ${USER_BEARER_TOKEN}" \
    -H "ServiceAuthorization: Bearer ${S2S_TOKEN}" \
    -H "Content-Type: application/json" \
    --data "${PAYLOAD}"
)"
INVITE_STATUS="$(echo "${INVITE_RESPONSE}" | tail -n 1)"
INVITE_BODY="$(echo "${INVITE_RESPONSE}" | sed '$d')"

echo "Invite status: ${INVITE_STATUS}"
echo "Invite body: ${INVITE_BODY}"

if [[ "${INVITE_STATUS}" != "200" && "${INVITE_STATUS}" != "201" && "${INVITE_STATUS}" != "202" && "${INVITE_STATUS}" != "409" && "${INVITE_STATUS}" != "429" ]]; then
  echo "ERROR: Invite call failed." >&2
  exit 1
fi

echo "Fetching users for organisation ${ORG_ID}..."
LIST_RESPONSE="$(
  curl -sS -w '\n%{http_code}' -G \
    "${RD_PROFESSIONAL_API_PATH}/refdata/internal/v1/organisations/${ORG_ID}/users" \
    --data-urlencode "returnRoles=true" \
    -H "Authorization: Bearer ${USER_BEARER_TOKEN}" \
    -H "ServiceAuthorization: Bearer ${S2S_TOKEN}"
)"
LIST_STATUS="$(echo "${LIST_RESPONSE}" | tail -n 1)"
LIST_BODY="$(echo "${LIST_RESPONSE}" | sed '$d')"

echo "List status: ${LIST_STATUS}"
if [[ "${LIST_STATUS}" == "200" ]]; then
  echo "${LIST_BODY}" \
    | jq --arg email "${NEW_USER_EMAIL}" -r '
      .users[]? | select((.email // "") | ascii_downcase == ($email | ascii_downcase))
      | {
          userIdentifier,
          email,
          idamStatus,
          roles,
          organisationIdentifier
        }'
else
  echo "List body: ${LIST_BODY}"
fi

cat <<'EOF'

Next step for permanence:
1. Open the invitation email for NEW_USER_EMAIL.
2. Complete activation (set password).
3. Re-run the list call and ensure idamStatus becomes ACTIVE.

EOF
