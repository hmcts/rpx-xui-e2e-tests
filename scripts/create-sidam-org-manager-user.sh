#!/usr/bin/env bash
set -euo pipefail

# Creates a fixed user in SIDAM testing-support accounts and assigns the user
# to a target organisation as pui-organisation-manager via PRD internal API.
#
# Fixed user details (requested for EXUI-3778):
#   email: xui_org_main_test@gmail.com
#   forename: XUI-Test-Namne
#   surname: XUI-TEST-Surname
#   password: TEstPassword01
#
# Required env vars:
#   ORG_USER_ASSIGNMENT_BEARER_TOKEN / CREATE_USER_BEARER_TOKEN
#
# Optional env vars:
#   TEST_SOLICITOR_ORGANISATION_ID / ORG_ID
#   AAT_ENV / TEST_ENV                         Default: aat
#   IDAM_WEB_URL                               Default: https://idam-web-public.${AAT_ENV}.platform.hmcts.net
#   IDAM_API_URL                               Default: derived from IDAM_WEB_URL -> idam-api
#   RD_PROFESSIONAL_API_PATH                   Default internal rd-professional-api URL
#   S2S_URL                                    Default internal rpe-service-auth-provider testing-support URL
#   S2S_MICROSERVICE_NAME                      Default: xui_webapp
#   S2S_SECRET                                 Optional basic auth for lease endpoint
#   S2S_TOKEN                                  Optional pre-seeded service token
#   IDAM_TEST_USER_GROUP                       Default: test
#   ORG_USER_ASSIGNMENT_USER_ROLES             Default: pui-organisation-manager

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

TARGET_EMAIL="xui_org_main_test@gmail.com"
TARGET_FORENAME="XUI-Test-Namne"
TARGET_SURNAME="XUI-TEST-Surname"
TARGET_PASSWORD="TEstPassword01"
TARGET_ROLE="pui-organisation-manager"
TARGET_ORG_ID="${TEST_SOLICITOR_ORGANISATION_ID:-${ORG_ID:-}}"

AAT_ENV="${AAT_ENV:-${TEST_ENV:-aat}}"
IDAM_WEB_URL="${IDAM_WEB_URL:-https://idam-web-public.${AAT_ENV}.platform.hmcts.net}"
IDAM_WEB_URL="${IDAM_WEB_URL%/}"
IDAM_API_URL="${IDAM_API_URL:-${IDAM_WEB_URL/idam-web-public./idam-api.}}"
IDAM_API_URL="${IDAM_API_URL%/}"
IDAM_API_URL="${IDAM_API_URL%/testing-support/accounts}"
RD_PROFESSIONAL_API_PATH="${RD_PROFESSIONAL_API_PATH:-http://rd-professional-api-${AAT_ENV}.service.core-compute-${AAT_ENV}.internal}"
S2S_URL="${S2S_URL:-http://rpe-service-auth-provider-${AAT_ENV}.service.core-compute-${AAT_ENV}.internal/testing-support/lease}"
S2S_MICROSERVICE_NAME="${S2S_MICROSERVICE_NAME:-xui_webapp}"
IDAM_TEST_USER_GROUP="${IDAM_TEST_USER_GROUP:-test}"
ASSIGNMENT_USER_ROLES="${ORG_USER_ASSIGNMENT_USER_ROLES:-pui-organisation-manager}"

USER_BEARER_TOKEN="${ORG_USER_ASSIGNMENT_BEARER_TOKEN:-${CREATE_USER_BEARER_TOKEN:-}}"
require_var USER_BEARER_TOKEN
require_var TARGET_ORG_ID
echo "Using pre-seeded assignment bearer token."

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

SIDAM_PAYLOAD="$(
  jq -n \
    --arg email "${TARGET_EMAIL}" \
    --arg forename "${TARGET_FORENAME}" \
    --arg surname "${TARGET_SURNAME}" \
    --arg password "${TARGET_PASSWORD}" \
    --arg role "${TARGET_ROLE}" \
    --arg userGroup "${IDAM_TEST_USER_GROUP}" \
    '{
      email: $email,
      forename: $forename,
      surname: $surname,
      password: $password,
      roles: [{code: $role}],
      userGroup: {code: $userGroup}
    }'
)"

SIDAM_ENDPOINT="${IDAM_API_URL}/testing-support/accounts"
echo "Creating/upserting SIDAM account at ${SIDAM_ENDPOINT}..."
SIDAM_CREATE_RESPONSE="$(
  curl -sS -w '\n%{http_code}' -X POST \
    "${SIDAM_ENDPOINT}" \
    -H "Content-Type: application/json" \
    --data "${SIDAM_PAYLOAD}"
)"
SIDAM_CREATE_STATUS="$(echo "${SIDAM_CREATE_RESPONSE}" | tail -n 1)"
SIDAM_CREATE_BODY="$(echo "${SIDAM_CREATE_RESPONSE}" | sed '$d')"

if [[ "${SIDAM_CREATE_STATUS}" == "401" || "${SIDAM_CREATE_STATUS}" == "403" ]]; then
  SIDAM_CREATE_RESPONSE="$(
    curl -sS -w '\n%{http_code}' -X POST \
      "${SIDAM_ENDPOINT}" \
      -H "Authorization: Bearer ${USER_BEARER_TOKEN}" \
      -H "Content-Type: application/json" \
      --data "${SIDAM_PAYLOAD}"
  )"
  SIDAM_CREATE_STATUS="$(echo "${SIDAM_CREATE_RESPONSE}" | tail -n 1)"
  SIDAM_CREATE_BODY="$(echo "${SIDAM_CREATE_RESPONSE}" | sed '$d')"
fi

echo "SIDAM create status: ${SIDAM_CREATE_STATUS}"
echo "SIDAM create body: ${SIDAM_CREATE_BODY}"
if [[ "${SIDAM_CREATE_STATUS}" != "200" && "${SIDAM_CREATE_STATUS}" != "201" && "${SIDAM_CREATE_STATUS}" != "409" ]]; then
  echo "ERROR: SIDAM create account call failed." >&2
  exit 1
fi

ASSIGNMENT_PAYLOAD="$(
  jq -n \
    --arg firstName "${TARGET_FORENAME}" \
    --arg lastName "${TARGET_SURNAME}" \
    --arg email "${TARGET_EMAIL}" \
    --arg role "${TARGET_ROLE}" \
    '{
      firstName: $firstName,
      lastName: $lastName,
      email: $email,
      roles: [$role],
      resendInvite: false
    }'
)"

echo "Assigning ${TARGET_EMAIL} to organisation ${TARGET_ORG_ID} as ${TARGET_ROLE}..."
ASSIGNMENT_ENDPOINT="${RD_PROFESSIONAL_API_PATH}/refdata/internal/v1/organisations/${TARGET_ORG_ID}/users/"
ASSIGN_RESPONSE="$(
  curl -sS -w '\n%{http_code}' -X POST \
    "${ASSIGNMENT_ENDPOINT}" \
    -H "Authorization: Bearer ${USER_BEARER_TOKEN}" \
    -H "user-roles: ${ASSIGNMENT_USER_ROLES}" \
    -H "ServiceAuthorization: Bearer ${S2S_TOKEN}" \
    -H "Content-Type: application/json" \
    --data "${ASSIGNMENT_PAYLOAD}"
)"
ASSIGN_STATUS="$(echo "${ASSIGN_RESPONSE}" | tail -n 1)"
ASSIGN_BODY="$(echo "${ASSIGN_RESPONSE}" | sed '$d')"

if [[ "${ASSIGN_STATUS}" == "403" || "${ASSIGN_STATUS}" == "404" || "${ASSIGN_STATUS}" == "405" ]]; then
  echo "Internal assignment not allowed (status ${ASSIGN_STATUS}); trying external assignment endpoint..."
  ASSIGNMENT_ENDPOINT="${RD_PROFESSIONAL_API_PATH}/refdata/external/v1/organisations/users/"
  ASSIGN_RESPONSE="$(
    curl -sS -w '\n%{http_code}' -X POST \
      "${ASSIGNMENT_ENDPOINT}" \
      -H "Authorization: Bearer ${USER_BEARER_TOKEN}" \
      -H "user-roles: ${ASSIGNMENT_USER_ROLES}" \
      -H "ServiceAuthorization: Bearer ${S2S_TOKEN}" \
      -H "Content-Type: application/json" \
      --data "${ASSIGNMENT_PAYLOAD}"
  )"
  ASSIGN_STATUS="$(echo "${ASSIGN_RESPONSE}" | tail -n 1)"
  ASSIGN_BODY="$(echo "${ASSIGN_RESPONSE}" | sed '$d')"
fi

echo "Assignment status: ${ASSIGN_STATUS}"
echo "Assignment endpoint: ${ASSIGNMENT_ENDPOINT}"
echo "Assignment body: ${ASSIGN_BODY}"
if [[ "${ASSIGN_STATUS}" != "200" && "${ASSIGN_STATUS}" != "201" && "${ASSIGN_STATUS}" != "202" && "${ASSIGN_STATUS}" != "409" ]]; then
  echo "ERROR: Organisation assignment failed." >&2
  exit 1
fi

echo "Fetching organisation users for verification..."
LIST_RESPONSE="$(
  curl -sS -w '\n%{http_code}' -G \
    "${RD_PROFESSIONAL_API_PATH}/refdata/internal/v1/organisations/${TARGET_ORG_ID}/users" \
    --data-urlencode "returnRoles=true" \
    -H "Authorization: Bearer ${USER_BEARER_TOKEN}" \
    -H "user-roles: ${ASSIGNMENT_USER_ROLES}" \
    -H "ServiceAuthorization: Bearer ${S2S_TOKEN}"
)"
LIST_STATUS="$(echo "${LIST_RESPONSE}" | tail -n 1)"
LIST_BODY="$(echo "${LIST_RESPONSE}" | sed '$d')"

echo "List status: ${LIST_STATUS}"
if [[ "${LIST_STATUS}" == "200" ]]; then
  echo "${LIST_BODY}" \
    | jq --arg email "${TARGET_EMAIL}" -r '
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

cat <<EOF

Requested user details:
  email=${TARGET_EMAIL}
  forename=${TARGET_FORENAME}
  surname=${TARGET_SURNAME}
  password=${TARGET_PASSWORD}
  organisation=${TARGET_ORG_ID}
  assigned_role=${TARGET_ROLE}

EOF
