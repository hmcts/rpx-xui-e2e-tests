import { test as base } from "@playwright/test";
import CONFIG from "../../config/configManager.js";
import { getLogger } from "../logger-config.js";

type BaseFixtures = {
  config: typeof CONFIG;
  logger: ReturnType<typeof getLogger>;
};

export const test = base.extend<BaseFixtures>({
  config: [async ({}, use) => use(CONFIG), { auto: true }],
  logger: async ({}, use, workerInfo) => {
    const logger = getLogger(`worker-${workerInfo.workerIndex}`);
    await use(logger);
  }
});

export const expect = test.expect;
