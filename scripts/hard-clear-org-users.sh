#!/usr/bin/env bash
set -euo pipefail

# Hard cleanup for organisation users:
# 1) Optionally strip PRD organisation roles (external PUT users/{id} rolesDelete)
#
# Notes:
# - PRD currently exposes no DELETE user-membership endpoint in OpenAPI.
# - By policy, this script does NOT call IDAM delete/update/list/token endpoints.
#
# Safe defaults:
# - DRY_RUN=true
# - Protects xui_org_main_test@gmail.com and assignment principal
#
# Optional env:
# - DRY_RUN=true|false                    (default: true)
# - PARALLELISM=<n>                       (default: 4)
# - MAX_USERS=<n>                         (default: 2000)
# - PAGE_SIZE=<n>                         (default: 100)
# - STATUS_FILTER=active|pending|<empty>  (default: empty = all statuses)
# - PROTECTED_EMAILS=email1,email2
# - FORCE_INCLUDE_PROTECTED=true|false    (default: false)
# - PRD_REMOVE_ROLES=true|false           (default: true)
# - ROLES_DELETE=<csv>                    (default: broad solicitor/org role set)

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
    if [[ "${status}" =~ ^2 ]] || [[ "${status}" == "404" || "${status}" == "409" ]]; then
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

MAX_USERS="${MAX_USERS:-2000}"
PAGE_SIZE="${PAGE_SIZE:-100}"
PARALLELISM="${PARALLELISM:-4}"
DRY_RUN="${DRY_RUN:-true}"
FORCE_INCLUDE_PROTECTED="${FORCE_INCLUDE_PROTECTED:-false}"
STATUS_FILTER="${STATUS_FILTER:-}"
PRD_REMOVE_ROLES="${PRD_REMOVE_ROLES:-true}"

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
  S2S_TOKEN="$({
    curl -fsS -X POST "${S2S_LEASE_URL}" \
      -H "Content-Type: application/json" \
      "${AUTH_HEADER[@]}" \
      --data "{\"microservice\":\"${S2S_MICROSERVICE_NAME}\"}" | tr -d '"'
  })"
fi
if [[ -z "${S2S_TOKEN:-}" ]]; then
  echo "ERROR: Failed to resolve S2S token." >&2
  exit 1
fi

TMP_USERS_FILE="$(mktemp)"
TMP_RESULT_FILE="$(mktemp)"
trap 'rm -f "${TMP_USERS_FILE}" "${TMP_RESULT_FILE}"' EXIT

echo "Listing users from PRD external endpoint..."
page=0
total_loaded=0
status_param=""
if [[ -n "${STATUS_FILTER}" ]]; then
  status_param="&status=${STATUS_FILTER}"
fi
while (( total_loaded < MAX_USERS )); do
  LIST_URL="${RD_PROFESSIONAL_API_PATH}/refdata/external/v1/organisations/users?returnRoles=false${status_param}&size=${PAGE_SIZE}&page=${page}"
  LIST_RESPONSE="$({
    request_with_retry 4 2 \
      curl -sS -w '\n%{http_code}' -X GET \
      "${LIST_URL}" \
      -H "Authorization: Bearer ${USER_BEARER_TOKEN}" \
      -H "user-roles: ${ASSIGNMENT_USER_ROLES}" \
      -H "ServiceAuthorization: Bearer ${S2S_TOKEN}"
  })"
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
echo "PRD remove roles: ${PRD_REMOVE_ROLES}"
echo "IDAM operations: disabled-by-policy"
echo

plan_json="$({
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
                  (.email | length > 0)
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
})"

echo "${plan_json}" | jq '.stats'

if to_bool "${DRY_RUN}"; then
  echo
  echo "DRY RUN complete. No users were changed."
  exit 0
fi

roles_delete_json="$({
  echo "${ROLES_DELETE}" \
    | tr ',' '\n' \
    | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' \
    | sed '/^$/d' \
    | jq -R '{name: .}' \
    | jq -s '.'
})"

echo "Executing hard cleanup..."

cleanup_one_user() {
  local user="$1"
  local user_identifier email first_name last_name
  user_identifier="$(echo "${user}" | jq -r '.userIdentifier')"
  email="$(echo "${user}" | jq -r '.email')"
  first_name="$(echo "${user}" | jq -r '.firstName')"
  last_name="$(echo "${user}" | jq -r '.lastName')"

  local prd_status="skipped"
  local idam_status="disabled-by-policy"

  if to_bool "${PRD_REMOVE_ROLES}" && [[ -n "${user_identifier}" ]]; then
    local prd_payload prd_url prd_response
    prd_payload="$({
      jq -n \
        --arg email "${email}" \
        --arg firstName "${first_name}" \
        --arg lastName "${last_name}" \
        --arg idamStatus "ACTIVE" \
        --argjson rolesDelete "${roles_delete_json}" \
        '{email:$email,firstName:$firstName,lastName:$lastName,idamStatus:$idamStatus,rolesDelete:$rolesDelete}'
    })"

    prd_url="${RD_PROFESSIONAL_API_PATH}/refdata/external/v1/organisations/users/${user_identifier}"
    prd_response="$({
      request_with_retry 3 2 \
        curl -sS -w '\n%{http_code}' -X PUT \
        "${prd_url}" \
        -H "Authorization: Bearer ${USER_BEARER_TOKEN}" \
        -H "user-roles: ${ASSIGNMENT_USER_ROLES}" \
        -H "ServiceAuthorization: Bearer ${S2S_TOKEN}" \
        -H "Content-Type: application/json" \
        --data "${prd_payload}"
    })"
    prd_status="$(echo "${prd_response}" | tail -n 1)"
  fi

  local result
  result="$({
    jq -n \
      --arg email "${email}" \
      --arg userIdentifier "${user_identifier}" \
      --arg prdStatus "${prd_status}" \
      --arg idamStatus "${idam_status}" \
      '{email:$email,userIdentifier:$userIdentifier,prdStatus:$prdStatus,idamStatus:$idamStatus}'
  })"
  echo "${result}" >> "${TMP_RESULT_FILE}"

  echo "${email} -> prd=${prd_status}, idam=${idam_status}"
}

run_with_limit() {
  while (( $(jobs -pr | wc -l | tr -d ' ') >= PARALLELISM )); do
    sleep 0.2
  done
  cleanup_one_user "$1" &
}

while IFS= read -r user; do
  run_with_limit "${user}"
done < <(echo "${plan_json}" | jq -c '.planned[] | select(.canMutate)')

wait

echo
echo "Hard cleanup completed."

if [[ -s "${TMP_RESULT_FILE}" ]]; then
  echo "Summary:"
  jq -s '
    {
      processed: length,
      prdStatus: (group_by(.prdStatus) | map({status: .[0].prdStatus, count: length})),
      idamStatus: (group_by(.idamStatus) | map({status: .[0].idamStatus, count: length}))
    }' "${TMP_RESULT_FILE}"
fi
