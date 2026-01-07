import { test as base, expect } from "@playwright/test";

import { pageFixtures, type PageFixtures } from "../page-objects/pages/page.fixtures.js";
import {
  acceptAnalyticsCookiesOnPage,
  installAnalyticsAutoAccept
} from "../utils/ui/analytics.utils.js";
import { attachUiUserContext } from "../utils/ui/user-context.utils.js";
import { uiUtilsFixtures, type UiUtilsFixtures } from "../utils/ui/utils.fixtures.js";

export type UiFixtures = PageFixtures &
  UiUtilsFixtures & {
    autoAcceptAnalytics: void;
    attachUserContext: void;
  };

export const test = base.extend<UiFixtures>({
  ...pageFixtures,
  ...uiUtilsFixtures,
  autoAcceptAnalytics: [
    async ({ page }, use) => {
      const handler = async () => {
        await acceptAnalyticsCookiesOnPage(page);
      };
      await installAnalyticsAutoAccept(page);
      page.on("domcontentloaded", handler);
      await acceptAnalyticsCookiesOnPage(page);
      await use(undefined);
      page.off("domcontentloaded", handler);
    },
    { auto: true }
  ],
  attachUserContext: [
    async ({ page }, use, testInfo) => {
      await use(undefined);
      await attachUiUserContext(page, testInfo);
    },
    { auto: true }
  ]
});

export { expect };
