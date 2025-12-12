import { test as base, request, type APIRequestContext } from "@playwright/test";
import CONFIG from "../../config/configManager.js";
import { buildAuthHeaders, disposeAuthClients } from "../utils/api/auth.js";

type Fixtures = {
  apiContext: APIRequestContext;
};

export const test = base.extend<Fixtures>({
  apiContext: async ({}, use) => {
    const headers = await buildAuthHeaders();
    const context = await request.newContext({
      baseURL: CONFIG.urls.api,
      extraHTTPHeaders: headers,
      ignoreHTTPSErrors: true
    });
    await use(context);
    await context.dispose();
    await disposeAuthClients();
  }
});

export const expect = test.expect;
