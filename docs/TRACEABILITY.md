# EXUI-3788 Traceability

## Ticket
- EXUI-3788

## Source of Truth
- `rpx-xui-webapp/playwright_tests_new`

## Slice Mapping
- `playwright_tests_new/integration/searchCase/*`
  - `src/tests/integration/searchCase/*`
- `playwright_tests_new/integration/welshLanguage/*`
  - `src/tests/integration/welshLanguage/*`

## Supporting Assets
- search and Welsh mock payloads
- dedicated route helper for quick search, find case, and global search flows
- Playwright config and script updates so the parity suite is runnable in this repo
- header component support for language toggle interactions and selected-page assertions

## Deferred Areas
- E2E search-case journeys
- document upload parity
- access requests
- restricted access
- case linking
- hearings
- booking UI
- remaining manage tasks parity

## Credential Adaptation
- This slice uses existing repo credential identifiers:
  - search-case integration -> `CASEWORKER_R1`
  - Welsh language integration -> `SOLICITOR`
- Rationale:
  - clean master does not currently expose the closed-branch `FPL_GLOBAL_SEARCH` mapping
  - current Jenkins files already provision `CASEWORKER_R1` and `SOLICITOR`
