import { TableUtils, WaitUtils } from "@hmcts/playwright-common";
import type { PlaywrightTestArgs } from "@playwright/test";

import { config, type Config } from "./config.utils.js";
import { UserUtils } from "./user.utils.js";
import { ValidatorUtils } from "./validator.utils.js";

export interface UiUtilsFixtures {
  config: Config;
  userUtils: UserUtils;
  validatorUtils: ValidatorUtils;
  tableUtils: TableUtils;
  waitUtils: WaitUtils;
}

export const uiUtilsFixtures = {
  config: async (
    { request }: PlaywrightTestArgs,
    use: (value: Config) => Promise<void>,
  ) => {
    void request;
    await use(config);
  },
  userUtils: async (
    { request }: PlaywrightTestArgs,
    use: (value: UserUtils) => Promise<void>,
  ) => {
    void request;
    await use(new UserUtils());
  },
  validatorUtils: async (
    { request }: PlaywrightTestArgs,
    use: (value: ValidatorUtils) => Promise<void>,
  ) => {
    void request;
    await use(new ValidatorUtils());
  },
  tableUtils: async (
    { request }: PlaywrightTestArgs,
    use: (value: TableUtils) => Promise<void>,
  ) => {
    void request;
    await use(new TableUtils());
  },
  waitUtils: async (
    { request }: PlaywrightTestArgs,
    use: (value: WaitUtils) => Promise<void>,
  ) => {
    void request;
    await use(new WaitUtils());
  },
};
