# Integration suite

Route-mocked EXUI integration flows migrated from `rpx-xui-webapp/playwright_tests_new/integration`.

- Tag tests with `@integration`.
- Run via `yarn test:integration` (chromium only by default).
- Favors shared fixtures from `fixtures/test.ts` and login helpers instead of legacy `.sessions` cookies.
