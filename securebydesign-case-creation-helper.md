# Secure-by-Design Plan: CCD case creation helper

This Secure-by-Design plan accompanies execplan-case-creation-helper.md and follows ../.agent/SECURE.md. It must be updated as implementation proceeds.

## Purpose

Ensure the new case creation helper and test flow do not leak secrets, expand network scope, or permit unsafe inputs when creating CCD cases.

## Data and Secrets Handling

The helper must not log bearer tokens, cookies, or raw headers. Case data should be synthetic test data with no real user information. Any optional JSON data from env must be treated as untrusted input and validated for presence, not executed.

## Logging and Artifacts

Error messages should include only HTTP status and request path. Do not dump response bodies that could contain personal data. Attachments in test reports should avoid storing raw tokens or credentials.

## Network and Environment Safety

All requests remain within the Manage Case base URL (exuiDefaultUrl) or configured internal hosts already used by tests. No new outbound domains are introduced, and the helper uses the same Playwright APIRequestContext with existing cookies and XSRF protections.

## Threats and Mitigations

Threat: Accidental secret exposure in logs. Mitigation: keep logs and errors limited to status and URL, avoid logging headers or payloads.

Threat: Unvalidated input to CCD endpoints. Mitigation: validate required fields (caseTypeId, eventId, data) and reject empty values before issuing requests.

Threat: Excessive case creation on shared environments. Mitigation: only create when required, add unique suffixes to case names, and allow reusing a provided case ID via env variables.

## Validation

Run the dynamic-user-caseworker test with a safe test account to confirm the helper creates a case and assignment succeeds without leaking tokens or cookies in output.

## Decision Log

Decision: Keep helper logging minimal and avoid response body dumps by default. Rationale: reduces risk of logging sensitive case data. Date/Author: 2026-01-07 / Codex.

## Progress Notes

2026-01-07: Secure-by-Design plan created for case creation helper.
2026-01-07: Helper and PRL flow implemented with minimal logging and XSRF reuse.
2026-01-07: Court admin assignment now uses valid-roles fallback and gated error detail to avoid leaking data by default.
2026-01-07: Login helper tolerates net::ERR_ABORTED to avoid leaking error logs during IDAM redirect.
2026-01-07: Allocation retries stay within same role category and avoid logging response bodies unless debug is enabled.
2026-01-07: Assigner fallback uses existing case manager credentials without exposing secrets in logs.
2026-01-07: Default dynamic-user roles are explicit and overridable via IDAM_ROLE_NAMES; no sensitive data logged.
