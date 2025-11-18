import { expect } from "@playwright/test";

import { environment } from "../../config/environment";
import { test } from "../../fixtures/baseTest";

const buildHealthUrl = () => {
  const trimmedBase = environment.appBaseUrl.endsWith("/")
    ? environment.appBaseUrl.slice(0, -1)
    : environment.appBaseUrl;
  const endpoint = environment.appHealthEndpoint.startsWith("/")
    ? environment.appHealthEndpoint
    : `/${environment.appHealthEndpoint}`;
  return `${trimmedBase}${endpoint}`;
};

test.describe("@smoke health", () => {
  test("health endpoint reports OK", async ({ request }) => {
    const response = await request.get(buildHealthUrl());
    expect(response.status(), "health endpoint status").toBeLessThan(400);
  });
});
