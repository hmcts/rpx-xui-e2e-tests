import { test as base, type BrowserContextOptions } from "@playwright/test";
import CONFIG from "../../config/configManager.js";
import { CookieUtils } from "../utils/ui/cookie.js";
import { ValidatorUtils } from "../utils/ui/validator.js";
import { UserUtils } from "../utils/ui/user.js";
import { resolveConfig } from "../utils/ui/config.js";
import { ensureStorageState } from "../utils/ui/auth.js";

type UiFixtures = {
  config: typeof CONFIG;
  cookieUtils: CookieUtils;
  validatorUtils: ValidatorUtils;
  userUtils: UserUtils;
  storageStatePath: string;
};

export const uiTest = base.extend<UiFixtures>({
  config: async ({}, use) => {
    await use(CONFIG);
  },
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
    const userKey = process.env.UI_USER_KEY ?? "default";
    const statePath = await ensureStorageState(userKey);
    await use(statePath);
  },
  contextOptions: async ({ storageStatePath }, use) => {
    const opts: BrowserContextOptions = {
      storageState: storageStatePath
    };
    await use(opts);
  }
});

export const uiExpect = uiTest.expect;
export { resolveConfig };
