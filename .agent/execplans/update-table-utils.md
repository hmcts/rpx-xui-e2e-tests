# Extract EXUI table readers into playwright-common

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan follows `.agent/PLANS.md` from the repository root and must be maintained in accordance with that file.

## Purpose / Big Picture

Move duplicated table-reading logic into `@hmcts/playwright-common` so EXUI tests can reuse a single, well-defined TableUtils implementation. After this change, the EXUI case details and task list tests will read tables via shared TableUtils methods, and `rpx-xui-webapp` will consume the local `../playwright-common` package to exercise the updated API.

## Progress

- [x] (2026-01-21 13:58Z) Scoped current table utilities in `rpx-xui-webapp` and `playwright-common` to identify duplication and call sites.
- [x] (2026-01-21 14:03Z) Extend `playwright-common` TableUtils with key-value, data table, and work allocation parsing methods and rebuild `dist`.
- [x] (2026-01-21 14:03Z) Update `rpx-xui-webapp` to use the shared TableUtils methods, remove local duplicates, and link to local `playwright-common`.
- [ ] (2026-01-21 13:58Z) Validate via targeted Playwright test(s) or document how to run them (completed: added wizard-step guard and case-number fallback; added session refresh helper and case-details waits to unblock E2E setup; remaining: rerun E2E suite and confirm Employment create-case flow advances past receipt step and case creation returns case details).

## Surprises & Discoveries

- Observation: `playwright-common` uses strict index checks, so the new parsing logic required explicit guards for potentially undefined rows/cells/headers during `yarn build`.
  Evidence: `src/utils/table.utils.ts` errors such as TS2345 and TS2532 before guards were added.
- Observation: Employment create-case E2E flows stalled on `initiateCase1` because wizard advancement was treated as successful after hash-only URL changes.
  Evidence: `playwright_tests_new/E2E/test/caseFlags/caseFlags.positive.spec.ts` timed out waiting for `#claimant_TypeOfClaimant-Individual` while the page snapshot remained on `.../initiateCase1#content`.
- Observation: Session storage could be "fresh" but invalid, leading to redirects to IdAM login and missing EXUI locators.
  Evidence: E2E runs timed out waiting for `#cc-jurisdiction` while the browser was on `idam-web-public.../login`.

## Decision Log

- Decision: Add new parsing methods to the existing `TableUtils` class rather than introduce a new utility class.
  Rationale: `TableUtils` is already exported and injected via fixtures, so extending it avoids new dependency wiring.
  Date/Author: 2026-01-21 / Codex
- Decision: Keep `formatUiDate` in `rpx-xui-webapp` integration utils for now.
  Rationale: It is not table parsing logic and is only used by one test file, so it does not justify a shared change.
  Date/Author: 2026-01-21 / Codex
- Decision: Use a local dependency link to `../playwright-common` in `rpx-xui-webapp`.
  Rationale: This matches the agreed option 1 and enables immediate consumption of the new TableUtils API without publishing.
  Date/Author: 2026-01-21 / Codex
- Decision: Use `TableUtils.parseWorkAllocationTable` in manage tasks integration tests.
  Rationale: It matches the EXUI work allocation table behavior and eliminates the bespoke `readTaskTable` helper.
  Date/Author: 2026-01-21 / Codex
- Decision: Treat wizard advancement as a pathname change (ignoring hash updates) and optionally wait for the next-step locator.
  Rationale: CCD wizard pages were reporting hash-only URL changes even when the step did not advance, causing false positives and stalled waits.
  Date/Author: 2026-01-22 / Codex
- Decision: Add an authenticated-page helper to refresh sessions when IdAM login is detected, and wait for case details after submits.
  Rationale: Stale sessions were not caught by file freshness checks, and case creation could remain on the submit step without a case number.
  Date/Author: 2026-01-22 / Codex

## Outcomes & Retrospective

In progress. Code changes are complete, but validation remains pending.

Plan update note: Updated on 2026-01-21 14:03Z to mark implementation steps complete, record the strict TypeScript discovery, and note pending validation.

## Context and Orientation

`playwright-common` exports `TableUtils` from `playwright-common/src/utils/table.utils.ts`. That class currently supports mapping tables by headers for EXUI and citizen views.

`rpx-xui-webapp` duplicates table-reading logic in two places:

- `rpx-xui-webapp/playwright_tests_new/E2E/utils/table.utils.ts` provides `ExuiTableUtils` with `parseKeyValueTable`, `parseDataTable`, and `parseWorkAllocationTable` methods.
- `rpx-xui-webapp/playwright_tests_new/integration/utils/tableUtils.ts` provides `readTaskTable` used by the manage tasks integration tests.

The EXUI case details page object `rpx-xui-webapp/playwright_tests_new/E2E/page-objects/pages/exui/caseDetails.po.ts` calls `ExuiTableUtils` directly, and `rpx-xui-webapp/playwright_tests_new/integration/test/manageTasks/taskList.positive.spec.ts` calls `readTaskTable`. These are the call sites to switch to shared utilities.

EXUI in this context refers to the external user interface under test in this repository. The tables mentioned here are HTML table elements rendered by that UI.

## Secure-by-Design Plan

Follow `.agent/SECURE.md` by keeping the change scoped to table parsing only, avoiding any secrets or PII, and ensuring no new network calls or side effects are introduced. The new methods must only read DOM text content and must not log sensitive data. No new dependencies are required, and existing Playwright APIs are used with least privilege (table locators passed from tests).

## Plan of Work

Update `playwright-common/src/utils/table.utils.ts` by adding shared parsing methods that mirror the existing EXUI logic: key-value parsing for case details tabs, data table parsing with header discovery, and work allocation parsing with sortable headers and link text handling. Add a private helper to evaluate table rows in the browser context for the selector-or-locator variants. Rebuild `playwright-common` so `dist` reflects the new API.

Update `rpx-xui-webapp/playwright_tests_new/E2E/page-objects/pages/exui/caseDetails.po.ts` to use `TableUtils` from `@hmcts/playwright-common` for `parseKeyValueTable` and `parseDataTable`. Remove the local `ExuiTableUtils` implementation file once no longer referenced.

Update `rpx-xui-webapp/playwright_tests_new/integration/test/manageTasks/taskList.positive.spec.ts` to use the `tableUtils` fixture and call the new `parseWorkAllocationTable` method instead of `readTaskTable`. Keep `formatUiDate` in the integration utils file, but remove the table-reading functions from that file.

Update `rpx-xui-webapp/package.json` to link `@hmcts/playwright-common` via `portal:../playwright-common`, and document that `yarn install` is required to pick up the local package.

## Concrete Steps

1. Edit `playwright-common/src/utils/table.utils.ts` to add the new parsing methods and helper. Then rebuild:

   /Users/andrew.grizhenkov/HMCTS/dev/PROJECTS/playwright-common
   yarn build

2. Update `rpx-xui-webapp` call sites and remove local table util duplicates:

   /Users/andrew.grizhenkov/HMCTS/dev/PROJECTS/rpx-xui-webapp
   edit playwright_tests_new/E2E/page-objects/pages/exui/caseDetails.po.ts
   edit playwright_tests_new/integration/test/manageTasks/taskList.positive.spec.ts
   edit playwright_tests_new/integration/utils/tableUtils.ts
   delete playwright_tests_new/E2E/utils/table.utils.ts
   edit package.json

3. If needed to refresh the dependency link:

   /Users/andrew.grizhenkov/HMCTS/dev/PROJECTS/rpx-xui-webapp
   yarn install

## Validation and Acceptance

Run a targeted Playwright test and observe it passes using the shared table utils. For example, in `rpx-xui-webapp`:

npx playwright test --config=playwright.integration.config.ts

Acceptance is met when the manage tasks integration tests and EXUI case details tests compile and run without using the removed local table utilities, and table data assertions still pass.

## Idempotence and Recovery

These edits are additive and reversible. Re-running the steps is safe. If the local link causes issues, switch `@hmcts/playwright-common` back to the published version in `rpx-xui-webapp/package.json` and reinstall dependencies.

## Artifacts and Notes

Capture short diffs or logs that show the new TableUtils methods and the updated imports in `rpx-xui-webapp`. Keep outputs minimal and focused on the table utility migration.

## Interfaces and Dependencies

Extend `playwright-common/src/utils/table.utils.ts` with:

public async parseKeyValueTable(selector: string | Locator, page?: Page): Promise<Record<string, string>>
public async parseDataTable(selector: string | Locator, page?: Page): Promise<Array<Record<string, string>>>
public async parseWorkAllocationTable(tableLocator: Locator): Promise<Array<Record<string, string>>>

Add a private helper in the same class to evaluate table rows in the browser context for selector-or-locator parsing.
