# Playwright API tests (node-api project)

This folder contains the Playwright API suite that replaces the legacy Mocha `yarn test:api` run.

## Prerequisites
- Node 20+, Yarn installed.
- Copy `.env.example` to `.env` and fill in the values that apply to your target:  
  - `TEST_URL` / `API_URL`, `TEST_ENV` (`aat`/`demo`).
- Optional: `IDAM_WEB_URL`, `IDAM_TESTING_SUPPORT_URL`, `IDAM_CLIENT_ID`, `IDAM_CLIENT_SECRET`, `S2S_URL`, `S2S_SECRET`, `S2S_MICROSERVICE_NAME` for token bootstrap.
- Users: `API_USERS_JSON` or `TEST_USERS_JSON` with per-env, per-role credentials (see `config/configManager.ts`).

## Running
- Smoke the API suite (honours `PLAYWRIGHT_REPORTERS`):  
  `yarn test:api`
- Example with list-only reporter:  
  `PLAYWRIGHT_REPORTERS=list yarn test:api`

## Authentication model
- `auth.ts` first attempts to use `API_BEARER_TOKEN`. If absent, it will try client-credentials token bootstrap (IDAM client ID/secret + IDAM URLs); if that fails, it falls back to password-grant when username/password are provided, and finally to `/auth/login` form flow.
- Storage states are cached under `functional-output/tests/playwright-api/storage-states/<env>/<role>.json`.
- Required for token bootstrap: `IDAM_WEB_URL`, `IDAM_TESTING_SUPPORT_URL`, `IDAM_CLIENT_ID` (or `SERVICES_IDAM_CLIENT_ID`), `IDAM_CLIENT_SECRET` (or `IDAM_SECRET`), `S2S_URL`, `S2S_MICROSERVICE_NAME` (or `MICROSERVICE`); optional `IDAM_OAUTH2_SCOPE`, `IDAM_RETURN_URL`. Opt out with `API_AUTH_MODE=form`.
- XSRF handling: set `API_AUTO_XSRF=true` to auto-inject the `X-XSRF-TOKEN` header from stored cookies.
- Correlation IDs: every API client sets `X-Correlation-Id` per request (UUID).

## Reports & outputs
- Default reporters: local `list,html`; CI `list,junit,html,blob` (override with `PLAYWRIGHT_REPORTERS`).
- API call logs are attached automatically per test as `node-api-calls.json` and `node-api-calls.pretty.txt`.

## What we assert (vs the old Mocha smoke checks)
- Unauthenticated sweep (`authenticated-routes.api.ts`) asserts 401 **and** body `{ message: 'Unauthorized' }` for every protected route.
- Node shell (`node-app-endpoints.api.ts`) verifies `auth/isAuthenticated` true/false behaviour, `/api/user/details` payload shape (user info, role assignments, timeout metadata) and feature flag responses.
- CCD and case-share suites check required keys/arrays (jurisdictions, work-basket inputs, profile, organisations/users/cases/assignments) with `expect.objectContaining` schema checks.
- Postcode lookup asserts result/header structure and sample DPA fields when present.
- Work Allocation covers locations (list/id), catalogues (task names/types of work), task search for `MyTasks`/`AvailableTasks`/`AllWork`, my-work dashboards, negative task actions (unauthenticated / missing XSRF / guarded statuses for claim/unclaim/assign/unassign/complete/cancel), basic caseworker/person endpoints, and best-effort action state checks when APIs permit.
- Global search and ref-data: `/api/globalSearch/services` + `/api/globalSearch/results`, `/data/internal/searchCases` proxy smoke, WA/staff supported jurisdictions, locations, staff-ref-data, and role-access/AM smoke checks (roles/access-get, valid roles, specific/allocate/delete/reallocate, exclusions/confirm, roles/post/manageLabelling) plus basic OPTIONS/CORS coverage.
- Every spec captures the underlying API calls via `ApiClient` so failures include the request/response log for debugging.
