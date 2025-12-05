import { randomUUID } from "crypto";
import { promises as fs } from "node:fs";

import { ApiClient, buildApiAttachment, type ApiLogEntry } from "@hmcts/playwright-common";
import { request, type APIRequestContext } from "@playwright/test";

import { expect, test as base } from "../../fixtures/baseTest.ts";
import type { Fixtures as BaseFixtures } from "../../fixtures/baseTest.ts";

import {
  ensureStorageState,
  getStoredCookie,
  shouldAutoInjectXsrf,
  type ApiUserRole,
} from "./auth.ts";
import { config } from "./config.ts";

const baseUrl = config.baseUrl.replace(/\/+$/, "");

type ApiClientFactory = (role: ApiUserRole | "anonymous") => Promise<ApiClient>;

export interface ApiFixtures extends BaseFixtures {
  apiClient: ApiClient;
  anonymousClient: ApiClient;
  apiClientFor: ApiClientFactory;
  apiLogs: ApiLogEntry[];
  apiLogsAttachment: void;
}

async function createContext(
  role: ApiUserRole | "anonymous",
  defaultHeaders: Record<string, string>,
): Promise<APIRequestContext> {
  const storageState = role === "anonymous" ? undefined : await ensureStorageState(role);

  try {
    return await request.newContext({
      baseURL: baseUrl,
      storageState,
      ignoreHTTPSErrors: true,
      extraHTTPHeaders: defaultHeaders,
    });
  } catch (error) {
    const message = (error as Error)?.message ?? "";
    if (storageState && /Unexpected end of JSON input/i.test(message)) {
      await fsSafeUnlink(storageState);
      const rebuilt = await ensureStorageState(role as ApiUserRole);
      return request.newContext({
        baseURL: baseUrl,
        storageState: rebuilt,
        ignoreHTTPSErrors: true,
        extraHTTPHeaders: defaultHeaders,
      });
    }
    throw error;
  }
}

const fsSafeUnlink = async (target: string): Promise<void> => {
  try {
    await fs.unlink(target);
  } catch {
    // ignore
  }
};

async function buildApiClient(
  role: ApiUserRole | "anonymous",
  logger: BaseFixtures["logger"],
  entries: ApiLogEntry[],
): Promise<ApiClient> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Correlation-Id": randomUUID(),
  };
  if (role !== "anonymous" && shouldAutoInjectXsrf()) {
    const xsrf = await getStoredCookie(role, "XSRF-TOKEN");
    if (xsrf) {
      headers["X-XSRF-TOKEN"] = xsrf;
    }
  }

  return new ApiClient({
    baseUrl,
    name: `api-${role}`,
    logger,
    onResponse: (entry) => entries.push(entry),
    captureRawBodies: process.env.PLAYWRIGHT_DEBUG_API === "1",
    requestFactory: async () => createContext(role, headers),
  });
}

export const test = base.extend<ApiFixtures>({
  apiLogs: async ({ capturedApiCalls }, use) => {
    await use(capturedApiCalls);
  },
  apiClient: async ({ logger, apiLogs }, use) => {
    const client = await buildApiClient("solicitor", logger, apiLogs);
    try {
      await use(client);
    } finally {
      await client.dispose();
    }
  },
  anonymousClient: async ({ logger, apiLogs }, use) => {
    const client = await buildApiClient("anonymous", logger, apiLogs);
    try {
      await use(client);
    } finally {
      await client.dispose();
    }
  },
  apiClientFor: async ({ logger, apiLogs }, use) => {
    const clients: ApiClient[] = [];
    const factory: ApiClientFactory = async (role) => {
      const client = await buildApiClient(role, logger, apiLogs);
      clients.push(client);
      return client;
    };

    try {
      await use(factory);
    } finally {
      await Promise.all(clients.map((client) => client.dispose()));
    }
  },
  apiLogsAttachment: [
    async ({ apiLogs }, use, testInfo) => {
      await use();
      if (!apiLogs.length) return;
      await testInfo.attach("api-calls.json", {
        body: JSON.stringify(apiLogs, null, 2),
        contentType: "application/json",
      });
      const pretty = apiLogs.map((entry) => JSON.stringify(entry, null, 2)).join("\n\n---\n\n");
      await testInfo.attach("api-calls.pretty.txt", {
        body: pretty,
        contentType: "text/plain",
      });
    },
    { auto: true },
  ],
});

export { expect, buildApiAttachment };
