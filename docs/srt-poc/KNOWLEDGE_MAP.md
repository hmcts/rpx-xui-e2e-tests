# EXUI Superservice Knowledge Map

This page applies the LLM-wiki research idea to the central-assurance POC: each executable scenario should carry enough source context for a future Codex run, reviewer, or tester to refresh it without rediscovering the whole EXUI estate.

## Source Repositories

| Repository | Why it matters | Current anchor |
| --- | --- | --- |
| `rpx-xui-webapp` | Source of truth for EXUI runtime config, Node API exposure, Playwright bootstrap patterns, and legacy backend mocks. | `config/default.json`, `config/custom-environment-variables.json`, `api/configuration/**`, `playwright_tests_new/**`, `test_codecept/backendMock/services/ccd/**` |
| `rpx-xui-e2e-tests` | Destination harness for central-assurance API/UI proofs and local execution documentation. | `src/data/exui-central-assurance.ts`, `src/tests/api/exui-central-assurance.api.ts`, `src/tests/e2e/integration/manageTasks/serviceFamilies.positive.spec.ts`, `docs/srt-poc/**` |
| `prl-ccd-definitions` | Representative consuming-service CCD definition setup for jurisdiction, case type, and role permutations. | `definitions/**` |

## Refresh Contract

When EXUI configuration changes, refresh the POC in this order:

1. Re-read the source anchors above, starting with `rpx-xui-webapp/config/default.json`.
2. Update `EXUI_SOURCE_OF_TRUTH_REFS` only when a new source path becomes relevant.
3. Update the scenario manifest values and keep every scenario linked to at least one `rpx-xui-webapp` source reference.
4. Add API coverage before UI coverage unless the config only affects visible UI behaviour.
5. Keep service-specific downstream seams mocked until the superservice matrix proves a local dependency is worth standing up.

## Review Heuristic

A central-assurance scenario is ready to keep only when it answers all four questions:

- Which EXUI config or API surface owns the behaviour?
- Which service-family or role cluster does the scenario represent?
- Which downstream seam is real, mocked, grouped, or deliberately skipped?
- Which assertion would fail if an EXUI change broke consuming-service behaviour?

## Current Known Gap

The local proof still has one authenticated API seam to close: `/api/wa-supported-jurisdiction/get` can return `401` locally even while the UI proof passes with route-controlled WA data. Keep that gap explicit until local role/session seeding makes the API proof fully green without weakening the assertion.
