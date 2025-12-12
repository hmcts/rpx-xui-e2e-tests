import type { IdamPage } from "@hmcts/playwright-common";
import type { Page } from "@playwright/test";

import type { Config } from "../utils/config.utils";
import type { UserUtils } from "../utils/user.utils";

export interface AuthFixtures {
  loginAs: (userIdentifier: string) => Promise<void>;
}

interface AuthFixtureDependencies {
  idamPage: IdamPage;
  page: Page;
  userUtils: UserUtils;
  config: Config;
}

export const authFixtures = {
  async loginAs(
    { idamPage, page, userUtils, config }: AuthFixtureDependencies,
    use: (fn: AuthFixtures["loginAs"]) => Promise<void>,
  ): Promise<void> {
    await use(async (userIdentifier: string) => {
      const { email, password } = userUtils.getUserCredentials(userIdentifier);
      await page.goto(config.urls.manageCaseBaseUrl);
      // Accept analytics/essential cookies banner on the IdAM login page if present
      const acceptCookies = page.getByRole("button", { name: /Accept additional cookies/i });
      if (await acceptCookies.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await acceptCookies.click();
      }
      await idamPage.login({ username: email, password });
    });
  },
};
