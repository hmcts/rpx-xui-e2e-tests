# RPX Playwright Migration Tracker

This document inventories the Playwright coverage that currently lives inside `rpx-xui-webapp` and prioritises which scenarios should be rebuilt in this repository. It underpins **Phase 7 – Test Migration Strategy** of `build-plan.md`.

## Legacy Playwright Suites

| Legacy file | Scenario focus | Notes / Dependencies | Suggested tag |
| ----------- | -------------- | -------------------- | ------------- |
| `playwright_tests/E2E/tests/workallocation2.test.ts` | My work / All work tabs, task views, role-specific actions | Relies on work-allocation data + task API stubs; uses `IAC_CaseOfficer` personas. | `@smoke @wa` |
| `playwright_tests/E2E/tests/staff-search.test.ts` | Staff directory simplified/advanced search and toggle flows | Exercises staff search filters + advanced criteria; good candidate for data-driven tests. | `@smoke @staff` |
| `playwright_tests/E2E/tests/staff.test.ts` | Staff management (view + add user workflow) | Covers add-user wizard including back/cancel/change; depends on seeded staff records. | `@regression @staff` |
| `playwright_tests/E2E/tests/global-search.test.ts` | Global case search via menu & dedicated page + accessibility checks | Uses `IAC_CaseOfficer_R2`, relies on `findCaseId` helper + axe scans. | `@smoke @search @a11y` |
| `playwright_tests/E2E/tests/new-url.test.ts` | URL parameter propagation (jurisdiction/caseType) during create/search/event journeys | Validates breadcrumb/URL rewriting while creating/searching cases. | `@regression @navigation` |
| `playwright_tests/E2E/tests/test-case.test.ts` | Case list/detail regression: next steps dropdown, submit events, tabs, workbasket fields | Requires case creation helper + response interception; multiple assertions per feature. | `@regression @caselist` |
| `playwright_tests/E2E/tests/case-flags.test.ts` & `createFlag-scenario.test.ts` | Case flag RA journeys (view/update) | Heavy test-data requirements; touches Case Flags UI + API responses. | `@smoke @case-flags` |
| `playwright_tests/E2E/tests/support-scenario.test.ts` (skipped) | Support request RA flow | Currently `test.skip`; still useful blueprint for future accessibility/support automation. | `@future @support` |

### POM / Utility Prototype

`rpx-xui-webapp/playwright_tests_new/E2E` already contains:

- **Page objects:** `page-objects/pages/exui/*`, `components/exui/exui-header.component.ts` following the desired POM style.
- **Fixtures:** `fixtures.ts` + `utils/utils.fixtures.ts` providing typed fixtures for pages/utils.
- **Utilities:** `utils/config.utils.ts`, `user.utils.ts`, `cookie.utils.ts`, `validator.utils.ts` and a `createCase.spec.ts` smoke journey that creates a case via POM flows.

Reusing or adapting this folder provides a shortcut to Phase 2 (page-object structure) and Phase 4 (shared fixtures).

## Proposed Migration Order
1. **Work Allocation smoke** – visible, high-impact, minimal new selectors required.
2. **Staff search simplified/advanced** – verify staff directory core functionality.
3. **Global search (menu + page)** – ensures navigation + search assistance works, also covers accessibility attachments.
4. **Case flags view** – sanity-check RA state, then expand to creation/update once data helpers exist.
5. **Create case (from `playwright_tests_new`)** – adopt the POM flow and wire into this repo.
6. **Extended regression (test-case, new-url, support)** – after smoke parity, refactor remaining suites to fixtures/POM.

> **Note**: Set `STAFF_SEARCH_ENABLED=false` in `.env` when running against environments that do not expose the Staff UI (e.g., local Manage Case builds without the staff feature). The suite is skipped automatically when this flag is false.

> **Data reminder**: Global search uses hard-coded case references (`1746778909032144` for AAT, `1662020492250902` for Demo). Update these IDs if the upstream data refresh changes them.
>
> **Case flags setup**: The case flags smoke test expects `CASE_FLAGS_CASE_ID` to point to a CCD case with active flags visible to `USER_WITH_FLAGS`. Adjust the environment variable if data refreshes and set `CASE_FLAGS_ENABLED=true` only in environments where that data exists.

For each migrated suite:
- Port/clean selectors into the new `page-objects/` structure (components → pages).
- Replace direct `page` calls with actions/fixtures to keep tests declarative.
- Capture ENV/dependency needs (e.g., test data case references) and document under `docs/data-strategy.md` (to be created).

Maintaining this tracker as suites are moved will provide transparency on what remains in the legacy repo.

## PRL Playwright Migration

See `docs/prl-migration.md` for the dedicated PRL inventory and migration plan. The high-level approach mirrors the RPX phases: reuse the existing PRL page objects/journeys, adopt the Playwright Skeleton structure, and port smoke suites (Manage Cases + Citizen) before tackling broader regression coverage.
