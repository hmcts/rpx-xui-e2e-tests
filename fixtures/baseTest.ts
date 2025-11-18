import { ApiClient, createLogger, type ApiLogEntry } from "@hmcts/playwright-common";
import { test as base } from "@playwright/test";

import { environment } from "../config/environment";

export interface Fixtures {
  logger: ReturnType<typeof createLogger>;
  capturedApiCalls: ApiLogEntry[];
  apiClient: ApiClient;
}

export const test = base.extend<Fixtures>({
  // eslint-disable-next-line no-empty-pattern
  logger: async ({}, use, workerInfo) => {
    const logger = createLogger({
      serviceName: "rpx-xui-e2e-tests",
      defaultMeta: {
        workerId: workerInfo.workerIndex,
      },
    });
    await use(logger);
  },
  // eslint-disable-next-line no-empty-pattern
  capturedApiCalls: async ({}, use) => {
    const calls: ApiLogEntry[] = [];
    await use(calls);
  },
  apiClient: async ({ logger, capturedApiCalls }, use, testInfo) => {
    const client = new ApiClient({
      baseUrl: environment.apiBaseUrl,
      logger,
      onResponse: (entry) => capturedApiCalls.push(entry),
      captureRawBodies: process.env.PLAYWRIGHT_DEBUG_API === "1",
    });

    try {
      await use(client);
    } finally {
      if (capturedApiCalls.length) {
        await testInfo.attach("api-calls.json", {
          body: Buffer.from(JSON.stringify(capturedApiCalls, null, 2)),
          contentType: "application/json",
        });
      }

      await client.dispose();
    }
  },
});

export { expect } from "@playwright/test";
