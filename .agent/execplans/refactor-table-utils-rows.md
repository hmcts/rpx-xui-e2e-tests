# Refine TableUtils row selection and headerless support

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan follows `.agent/PLANS.md` from the repository root and must be maintained in accordance with that file.

## Purpose / Big Picture

Ensure `@hmcts/playwright-common` TableUtils reliably parses tables that contain nested tables, supports headerless tables, and filters `aria-hidden` rows consistently. After this change, EXUI and work allocation table parsing will ignore nested table rows, retain headerless data rows with `column_N` keys, and skip hidden rows in all parsing methods. The behavior is demonstrated by updated unit tests in the `playwright-common` repository.

## Progress

- [x] (2026-01-23 14:59Z) Reviewed current TableUtils behavior and test helpers in `../playwright-common` to identify exact edit points.
- [x] (2026-01-23 14:59Z) Updated TableUtils parsing to use direct-row selection, filter `aria-hidden` rows, and handle headerless tables without dropping the first row.
- [x] (2026-01-23 14:59Z) Updated test helpers and unit tests to cover headerless and `aria-hidden` scenarios.
- [x] (2026-01-23 14:59Z) Ran `yarn test` in `../playwright-common`; all tests passed (stderr from coverage utils is expected in existing tests).

## Surprises & Discoveries

- Observation: Updating table row selection to `:scope > tr` required test helpers to accept selectors that include `:scope` instead of only `"tr"`.
  Evidence: Updated `createWorkAllocationLocator` and `createWorkAllocationLocatorWithHiddenRows` to accept `sel.includes("tr")`.

## Decision Log

- Decision: Implement headerless support by detecting `<th>` usage in the first body row and falling back to `column_N` keys when headers are absent.
  Rationale: This allows header rows to remain supported while preserving data for truly headerless tables.
  Date/Author: 2026-01-23 / Codex
- Decision: Filter nested rows by selecting direct table rows (`:scope > ...`) and by checking the owning table where needed.
  Rationale: Nested tables are expected; selecting only direct rows avoids mixing nested content into the primary table parse.
  Date/Author: 2026-01-23 / Codex
- Decision: When work allocation tables are headerless, compute `column_N` keys from the widest data row.
  Rationale: `parseWorkAllocationTable` needs a stable header count for alignment and selection-cell trimming even when headers are absent.
  Date/Author: 2026-01-23 / Codex

## Outcomes & Retrospective

TableUtils now filters `aria-hidden` rows in key-value and data-table parsing, scopes rows to direct table children, and preserves headerless tables with `column_N` keys. Work allocation parsing follows the same headerless behavior and uses direct-row selection. The `playwright-common` test suite passes with the updated unit tests.

## Context and Orientation

`@hmcts/playwright-common` is a local dependency in `rpx-xui-webapp` (`package.json` uses `file:../playwright-common`). The table parsing logic lives in `../playwright-common/src/utils/table.utils.ts` and is validated by Vitest tests in `../playwright-common/tests/utils/table.utils.new-methods.spec.ts` with helper utilities in `../playwright-common/tests/utils/table.utils.test-helpers.ts`.

`parseKeyValueTable` and `parseDataTable` use `evaluateTable` to execute browser-context parsing functions over table rows. `parseWorkAllocationTable` evaluates a table element directly in the browser context. Changes must preserve existing behavior while adding nested-table safety, headerless support, and consistent `aria-hidden` filtering.

## Secure-by-Design Plan

Follow `.agent/SECURE.md` by limiting changes to DOM parsing logic, avoiding any new external calls, secrets, or logging of sensitive data. Use least-privilege DOM reads only, and keep helper logic deterministic and testable. No new dependencies are introduced.

## Plan of Work

Update `../playwright-common/src/utils/table.utils.ts` to:

1. Ensure `evaluateTable` selects only direct table rows with `:scope >` selectors for locator and string-based inputs.
2. Add `aria-hidden` filtering to `parseKeyValueTable` and `parseDataTable` row visibility checks.
3. In `parseDataTable`, detect header rows only when `<th>` elements are present if no `<thead>`, and keep the first row as data otherwise. Use existing `column_N` fallbacks for headerless tables.
4. In `parseWorkAllocationTable`, use direct-row selection from `<thead>/<tbody>` and only treat the first body row as headers when `<th>` cells are present. When headers are absent, generate `column_N` keys based on the widest data row and include the first row as data.

Update `../playwright-common/tests/utils/table.utils.test-helpers.ts` to support header-row `<th>` detection and optional aria-hidden rows for new tests.

Update `../playwright-common/tests/utils/table.utils.new-methods.spec.ts` to add coverage for headerless tables and `aria-hidden` row filtering while keeping existing header-row behavior tests passing.

## Concrete Steps

1. Edit `../playwright-common/src/utils/table.utils.ts` to implement row selection, `aria-hidden` filtering, and headerless handling.
2. Edit `../playwright-common/tests/utils/table.utils.test-helpers.ts` to add `headerRowUsesTh` and optional `ariaHiddenRows` support for relevant helpers.
3. Edit `../playwright-common/tests/utils/table.utils.new-methods.spec.ts` to add tests for headerless tables and `aria-hidden` rows, and adjust any existing tests if needed.
4. Run tests in `/Users/andrew.grizhenkov/HMCTS/dev/PROJECTS/playwright-common`:

   yarn test

## Validation and Acceptance

Acceptance is met when the Vitest suite in `playwright-common` passes and the new tests show:

- Headerless tables keep their first row as data and use `column_N` keys.
- Rows marked `aria-hidden="true"` are excluded in all parsing methods.
- Nested tables do not affect primary table parsing due to direct-row selection.

## Idempotence and Recovery

Edits are deterministic and can be re-applied safely. If tests fail, revert the modified files and re-run `yarn test` to confirm a clean baseline before reapplying changes.

## Artifacts and Notes

`yarn test` output (2026-01-23 14:59Z):

Test Files 22 passed (22)
Tests 125 passed (125)

## Interfaces and Dependencies

Update `../playwright-common/src/utils/table.utils.ts` in `TableUtils`:

public async parseKeyValueTable(selector: string | Locator, page?: Page): Promise<Record<string, string>>
public async parseDataTable(selector: string | Locator, page?: Page): Promise<Array<Record<string, string>>>
public async parseWorkAllocationTable(tableLocator: Locator): Promise<Array<Record<string, string>>>
private async evaluateTable<T>(selector: string | Locator, page: Page | undefined, fn: (rows: Element[]) => T): Promise<T>

Plan update note: Updated progress, discoveries, decisions, outcomes, and test artifacts after implementing the TableUtils changes and running the playwright-common test suite.
