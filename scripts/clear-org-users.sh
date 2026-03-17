#!/usr/bin/env bash
set -euo pipefail

# Bulk-clear professional users in the current organisation context by removing
# all assignable roles through PRD external users API.
#
# Safety defaults:
# - DRY_RUN=true by default (no mutation).
# - Protects key users from changes unless FORCE_INCLUDE_PROTECTED=true.
#
# Required env/input:
# - ORG_USER_ASSIGNMENT_BEARER_TOKEN (or CREATE_USER_BEARER_TOKEN fallback)
#
# Optional env vars:
# - DRY_RUN=true|false                     (default: true)
# - FORCE_INCLUDE_PROTECTED=true|false     (default: false)
# - MAX_USERS=<n>                          (default: 500)
# - PAGE_SIZE=<n>                          (default: 50)
# - PARALLELISM=<n>                        (default: 8)
# - ORG_USER_ASSIGNMENT_USER_ROLES=<csv>   (default: pui-organisation-manager)
# - PROTECTED_EMAILS=<csv>                 (default includes assignment principal and xui_org_main_test@gmail.com)
# - ROLES_DELETE=<csv>                     (default: broad HMCTS solicitor/org roles set)
# - AAT_ENV/TEST_ENV, RD_PROFESSIONAL_API_PATH, S2S_URL, S2S_MICROSERVICE_NAME, S2S_SECRET, S2S_TOKEN

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required." >&2
  exit 1
fi

to_bool() {
  local raw="${1:-}"
  raw="$(echo "${raw}" | tr '[:upper:]' '[:lower:]')"
  [[ "${raw}" == "1" || "${raw}" == "true" || "${raw}" == "yes" || "${raw}" == "on" ]]
}

request_with_retry() {
  local attempts="$1"
  local delay_s="$2"
  shift 2

  local output=""
  local status=""
  local body=""
  local n=1
  while (( n <= attempts )); do
    output="$("$@")"
    status="$(echo "${output}" | tail -n 1)"
    body="$(echo "${output}" | sed '$d')"
    if [[ "${status}" =~ ^2 ]] || [[ "${status}" == "409" ]]; then
      echo "${output}"
      return 0
    fi
    if [[ "${status}" == "429" || "${status}" == "500" || "${status}" == "502" || "${status}" == "503" || "${status}" == "504" ]]; then
      if (( n < attempts )); then
        sleep "${delay_s}"
      fi
      n=$(( n + 1 ))
      continue
    fi
    echo "${output}"
    return 0
  done
  echo "${output}"
  return 0
}

require_var() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "ERROR: Missing required env var: ${name}" >&2
    exit 1
  fi
}

AAT_ENV="${AAT_ENV:-${TEST_ENV:-aat}}"
RD_PROFESSIONAL_API_PATH="${RD_PROFESSIONAL_API_PATH:-http://rd-professional-api-${AAT_ENV}.service.core-compute-${AAT_ENV}.internal}"
S2S_URL="${S2S_URL:-http://rpe-service-auth-provider-${AAT_ENV}.service.core-compute-${AAT_ENV}.internal/testing-support/lease}"
S2S_MICROSERVICE_NAME="${S2S_MICROSERVICE_NAME:-xui_webapp}"
ASSIGNMENT_USER_ROLES="${ORG_USER_ASSIGNMENT_USER_ROLES:-pui-organisation-manager}"
MAX_USERS="${MAX_USERS:-500}"
PAGE_SIZE="${PAGE_SIZE:-50}"
PARALLELISM="${PARALLELISM:-8}"
DRY_RUN="${DRY_RUN:-true}"
FORCE_INCLUDE_PROTECTED="${FORCE_INCLUDE_PROTECTED:-false}"
DEFAULT_ROLES_DELETE="pui-case-manager,pui-user-manager,pui-organisation-manager,pui-finance-manager,pui-caa,payments,caseworker,caseworker-divorce,caseworker-divorce-solicitor,caseworker-divorce-financialremedy,caseworker-divorce-financialremedy-solicitor,caseworker-probate,caseworker-probate-solicitor,caseworker-ia,caseworker-ia-legalrep-solicitor,caseworker-publiclaw,caseworker-publiclaw-solicitor,caseworker-civil,caseworker-civil-solicitor,caseworker-employment,caseworker-employment-legalrep-solicitor,caseworker-privatelaw,caseworker-privatelaw-solicitor"
ROLES_DELETE="${ROLES_DELETE:-${DEFAULT_ROLES_DELETE}}"

USER_BEARER_TOKEN="${ORG_USER_ASSIGNMENT_BEARER_TOKEN:-${CREATE_USER_BEARER_TOKEN:-}}"

if [[ -z "${USER_BEARER_TOKEN}" ]]; then
  echo "ERROR: Missing assignment bearer token. Set ORG_USER_ASSIGNMENT_BEARER_TOKEN (or CREATE_USER_BEARER_TOKEN)." >&2
  exit 1
fi

if [[ -z "${S2S_TOKEN:-}" ]]; then
  echo "Generating S2S token..."
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
if [[ -z "${S2S_TOKEN:-}" ]]; then
  echo "ERROR: Failed to resolve S2S token." >&2
  exit 1
fi

TMP_USERS_FILE="$(mktemp)"
trap 'rm -f "${TMP_USERS_FILE}"' EXIT

echo "Listing users from PRD external endpoint..."
page=0
total_loaded=0
while (( total_loaded < MAX_USERS )); do
  LIST_URL="${RD_PROFESSIONAL_API_PATH}/refdata/external/v1/organisations/users?returnRoles=false&status=active&size=${PAGE_SIZE}&page=${page}"
  LIST_RESPONSE="$(
    request_with_retry 4 2 \
      curl -sS -w '\n%{http_code}' -X GET \
      "${LIST_URL}" \
      -H "Authorization: Bearer ${USER_BEARER_TOKEN}" \
      -H "user-roles: ${ASSIGNMENT_USER_ROLES}" \
      -H "ServiceAuthorization: Bearer ${S2S_TOKEN}"
  )"
  LIST_STATUS="$(echo "${LIST_RESPONSE}" | tail -n 1)"
  LIST_BODY="$(echo "${LIST_RESPONSE}" | sed '$d')"

  if [[ "${LIST_STATUS}" != "200" ]]; then
    echo "ERROR: Failed to list users. status=${LIST_STATUS}" >&2
    echo "Body: ${LIST_BODY}" >&2
    exit 1
  fi

  page_users="$(echo "${LIST_BODY}" | jq '.users // []')"
  page_count="$(echo "${page_users}" | jq 'length')"
  if [[ "${page_count}" == "0" ]]; then
    break
  fi

  echo "${page_users}" | jq -c '.[]' >> "${TMP_USERS_FILE}"
  total_loaded=$(( total_loaded + page_count ))
  page=$(( page + 1 ))
  if (( page_count < PAGE_SIZE )); then
    break
  fi
done

if [[ ! -s "${TMP_USERS_FILE}" ]]; then
  echo "No users found in organisation scope for current principal."
  exit 0
fi

PROTECTED_EMAILS_CSV="${PROTECTED_EMAILS:-xui_org_main_test@gmail.com}"

echo "Protected emails: ${PROTECTED_EMAILS_CSV}"
echo "Force include protected: ${FORCE_INCLUDE_PROTECTED}"
echo "Dry run: ${DRY_RUN}"
echo "Parallelism: ${PARALLELISM}"
echo

plan_json="$(
  jq -s \
    --arg protectedCsv "${PROTECTED_EMAILS_CSV}" \
    --arg forceIncludeProtected "${FORCE_INCLUDE_PROTECTED}" '
      def normalize_email: ( . // "" | tostring | ascii_downcase );
      def split_csv($s):
        ($s | split(",") | map(gsub("^\\s+|\\s+$";"") | ascii_downcase) | map(select(length > 0)));
      def is_protected($email; $protected):
        ($protected | index($email)) != null;

      . as $users
      | (split_csv($protectedCsv)) as $protected
      | {
          users: $users,
          protected: $protected
        }
      | .summary = {
          total: (.users | length),
          active: (.users | map(select((.idamStatus // "") == "ACTIVE")) | length)
        }
      | .planned = (
          .users
          | map(
              . as $u
              | ($u.email | normalize_email) as $email
              | {
                  userIdentifier: ($u.userIdentifier // $u.id // ""),
                  email: $email,
                  firstName: ($u.firstName // $u.forename // ""),
                  lastName: ($u.lastName // $u.surname // ""),
                  idamStatus: ($u.idamStatus // ""),
                  isProtected: (is_protected($email; $protected))
                }
              | .canMutate = (
                  (.userIdentifier | length > 0)
                  and (
                    ($forceIncludeProtected | ascii_downcase) == "true"
                    or (.isProtected | not)
                  )
                )
            )
        )
      | .stats = {
          totalLoaded: (.planned | length),
          protectedUsers: (.planned | map(select(.isProtected)) | length),
          mutationCandidates: (.planned | map(select(.canMutate)) | length)
        }
    ' "${TMP_USERS_FILE}"
)"

echo "${plan_json}" | jq '.stats'
echo
echo "Candidate users:"
echo "${plan_json}" | jq -r '.planned[] | select(.canMutate) | "- \(.email) [id=\(.userIdentifier)]"'
echo
echo "Roles to remove for each user:"
echo "${ROLES_DELETE}"
echo

if to_bool "${DRY_RUN}"; then
  echo "DRY RUN complete. No users were changed."
  echo "To execute deletions: DRY_RUN=false yarn user:clear:org-users"
  exit 0
fi

echo "Executing bulk role removal..."
roles_delete_json="$(
  echo "${ROLES_DELETE}" \
    | tr ',' '\n' \
    | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' \
    | sed '/^$/d' \
    | jq -R '{name: .}' \
    | jq -s '.'
)"

remove_roles_for_user() {
  local user="$1"
  user_identifier="$(echo "${user}" | jq -r '.userIdentifier')"
  email="$(echo "${user}" | jq -r '.email')"
  first_name="$(echo "${user}" | jq -r '.firstName')"
  last_name="$(echo "${user}" | jq -r '.lastName')"

  payload="$(
    jq -n \
      --arg email "${email}" \
      --arg firstName "${first_name}" \
      --arg lastName "${last_name}" \
      --arg idamStatus "ACTIVE" \
      --argjson rolesDelete "${roles_delete_json}" \
      '{
        email: $email,
        firstName: $firstName,
        lastName: $lastName,
        idamStatus: $idamStatus,
        rolesDelete: $rolesDelete
      }'
  )"

  local update_url="${RD_PROFESSIONAL_API_PATH}/refdata/external/v1/organisations/users/${user_identifier}"
  update_response="$(
    request_with_retry 3 2 \
      curl -sS -w '\n%{http_code}' -X PUT \
      "${update_url}" \
      -H "Authorization: Bearer ${USER_BEARER_TOKEN}" \
      -H "user-roles: ${ASSIGNMENT_USER_ROLES}" \
      -H "ServiceAuthorization: Bearer ${S2S_TOKEN}" \
      -H "Content-Type: application/json" \
      --data "${payload}"
  )"
  update_status="$(echo "${update_response}" | tail -n 1)"
  update_body="$(echo "${update_response}" | sed '$d')"

  if [[ "${update_status}" =~ ^2 ]]; then
    echo "OK  ${email} (${user_identifier})"
  else
    echo "ERR ${email} (${user_identifier}) status=${update_status} body=${update_body}" >&2
  fi
}

run_with_limit() {
  while (( $(jobs -pr | wc -l | tr -d ' ') >= PARALLELISM )); do
    sleep 0.2
  done
  remove_roles_for_user "$1" &
}

while IFS= read -r user; do
  run_with_limit "${user}"
done < <(echo "${plan_json}" | jq -c '.planned[] | select(.canMutate)')

wait

echo
echo "Bulk-clear execution completed."
