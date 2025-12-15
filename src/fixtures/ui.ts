import AxeBuilder from "@axe-core/playwright";
import { type BrowserContextOptions } from "@playwright/test";
import CONFIG from "../../config/configManager.js";
import { test as base } from "./base.js";
import { CookieUtils } from "../utils/ui/cookie.js";
import { ValidatorUtils } from "../utils/ui/validator.js";
import { UserUtils } from "../utils/ui/user.js";
import { resolveConfig } from "../utils/ui/config.js";
import { ensureStorageState, hasUiCreds } from "../utils/ui/auth.js";

type UiFixtures = {
  cookieUtils: CookieUtils;
  validatorUtils: ValidatorUtils;
  userUtils: UserUtils;
  storageStatePath?: string;
  contextOptions?: BrowserContextOptions;
  axeBuilder: AxeBuilder;
};

export const uiTest = base.extend<UiFixtures>({
  cookieUtils: async ({}, use) => {
    await use(new CookieUtils());
  },
  validatorUtils: async ({}, use) => {
    await use(new ValidatorUtils());
  },
  userUtils: async ({}, use) => {
    await use(new UserUtils());
  },
  storageStatePath: async ({}, use) => {
    if (!hasUiCreds()) {
      await use(undefined);
      return;
    }
    const userKey = process.env.UI_USER_KEY ?? CONFIG.ui?.defaultUserKey ?? "default";
    const statePath = await ensureStorageState(userKey);
    await use(statePath);
  },
  contextOptions: async ({ storageStatePath }, use) => {
    const opts: BrowserContextOptions = storageStatePath
      ? {
          storageState: storageStatePath
        }
      : {};
    await use(opts);
  },
  axeBuilder: [
    async ({ page }, use, testInfo) => {
      const tags = (CONFIG.test.accessibility?.axeTags ?? "wcag21a,best-practice")
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);
      const builder = new AxeBuilder({ page }).withTags(tags);

      await use(builder);

      if (String(testInfo.project.testMatch ?? "").includes("accessibility")) {
        return;
      }
      if (CONFIG.test.accessibility?.autoscanEnabled === false) {
        return;
      }

      const results = await builder.analyze();
      base.expect.soft(results.violations, "Auto accessibility scan").toEqual([]);
    },
    { auto: true }
  ]
});

export const uiExpect = uiTest.expect;
export { resolveConfig };
