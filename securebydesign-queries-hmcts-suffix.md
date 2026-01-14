# Secure-by-Design Plan: HMCTS suffix query UI test

This Secure-by-Design plan follows `.agent/SECURE.md` and covers the EXUI query suffix test added in this repository.

## Purpose

Validate that HMCTS staff queries/responses show the "-HMCTS" suffix in the Queries tab and Query Details view using real backend data (no mocking or interception), while selecting cases dynamically from the case list.

## Data and Secrets Handling

Credentials are sourced only from environment variables (`CIVIL_SOLICITOR_USERNAME`, `CIVIL_SOLICITOR_PASSWORD`, `CIVIL_HMCTS_STAFF_USERNAME`, `CIVIL_HMCTS_STAFF_PASSWORD`). The test submits minimal query text that contains no sensitive data and avoids logging or persisting case payloads.

## Logging and Artifacts

The test does not print or attach response bodies. Only standard Playwright traces apply if enabled by the runner.

## Network and Environment Safety

Requests are limited to the configured EXUI host. The test uses UI navigation for case/query flows and only calls `/api/user/details` to confirm the active session user. No external endpoints are introduced.

## Threats and Mitigations

- Accidental PII leakage: keep query subject/body synthetic and avoid outputting case data.
- Over-privileged access: reuse existing HMCTS-approved test users and storage-state handling.
- Data integrity: create a new query with a unique subject to prevent modifying unrelated case content.
- Navigation safety: prefer UI navigation for the Queries tab to avoid brittle URL fragments.

## Validation

Run the new EXUI-3695 test and confirm "-HMCTS" suffix appears in "Last submitted by" and "Caseworker name" while "Sender name" remains unsuffixed.

## Decision Log

- Decision: Use UI navigation to open queries and respond, avoiding direct query-management URLs.
  Rationale: aligns with the "no URL usage" requirement and keeps the test on real user flows.

## Progress Notes

- 2025-02-14: Secure-by-Design plan created for HMCTS query suffix UI test.
- 2025-02-14: Updated plan to cover dynamic case selection and UI tab navigation.
- 2025-02-14: Updated plan to reflect CIVIL credential usage and UI-only query response flow.
