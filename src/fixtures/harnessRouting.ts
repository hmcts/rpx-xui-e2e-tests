import fs from "node:fs";
import path from "node:path";

import { verifyRoutingAsset } from "../harness/routing";

import { test as base, expect } from "./harnessIdentity";

export const test = base.extend<{ routingAssets: void }>({
  routingAssets: [
    async ({ context, page, apiIdentity }, use, testInfo) => {
      void apiIdentity;
      const manifest = JSON.parse(
        fs.readFileSync(process.env.EXUI_CANDIDATE_RUN_MANIFEST!, "utf8"),
      );
      const required = JSON.parse(
        manifest.runtimeMetadata.routingInterpreter,
      ).knownBaselineRoutingChunk;
      const assets: Promise<void>[] = [],
        served: { path: string; digest: string }[] = [],
        rejected: string[] = [];
      context.on("response", (response) => {
        const url = new URL(response.url());
        if (
          url.origin !== "http://127.0.0.1:3100" ||
          (response.request().resourceType() !== "script" &&
            !/\.m?js$/.test(url.pathname))
        )
          return;
        assets.push(
          (async () => {
            served.push(
              verifyRoutingAsset(
                process.env.EXUI_CANDIDATE_ASSETS!,
                url.pathname,
                await response.body(),
              ),
            );
          })(),
        );
      });
      const flags = Object.fromEntries(
        Object.entries({
          MC_Work_Allocation: true,
          "mc-work-allocation-active-feature": "WorkAllocationRelease2",
          "feature-global-search": true,
        }).map(([key, value]) => [key, { value, version: 1 }]),
      );
      await context.route("**/*", async (route) => {
        const request = route.request(),
          url = new URL(request.url());
        if (url.origin === "http://127.0.0.1:3100") return route.continue();
        if (
          url.origin === "http://127.0.0.1:3103" &&
          request.method() === "GET" &&
          request.isNavigationRequest() &&
          request.frame().parentFrame() === null &&
          url.pathname ===
            "/pcs-ui/cases/case-create/PCS/PCS/ext%3Arouting-create" &&
          url.searchParams.size === 1 &&
          url.searchParams.get("expected_sub") === "harness-supervisor"
        )
          return route.continue();
        if (
          url.origin === "http://127.0.0.1:3101" &&
          url.pathname === "/activity/cases/0/activity" &&
          !url.search &&
          ["GET", "OPTIONS"].includes(request.method())
        )
          return route.continue();
        if (
          [
            "clientstream.launchdarkly.com",
            "clientsdk.launchdarkly.com",
            "events.launchdarkly.com",
            "app.launchdarkly.com",
          ].includes(url.hostname)
        )
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            headers: { "access-control-allow-origin": "*" },
            body: JSON.stringify(url.pathname.includes("goals") ? [] : flags),
          });
        rejected.push(`${request.method()} ${url.origin}${url.pathname}`);
        return route.abort("blockedbyclient");
      });
      await use();
      if (testInfo.status !== testInfo.expectedStatus) {
        fs.writeFileSync(
          `${process.env.EXUI_ROUTING_EVIDENCE}/routing-ui-state.json`,
          JSON.stringify(
            { url: page.url(), body: await page.locator("body").innerText() },
            null,
            2,
          ),
        );
      }
      await Promise.all(assets);
      fs.writeFileSync(
        `${process.env.EXUI_ROUTING_EVIDENCE}/routing-assets.json`,
        JSON.stringify(served, null, 2),
      );
      expect(
        served.length,
        "actual candidate JavaScript consumed",
      ).toBeGreaterThan(0);
      if (required)
        expect(served).toContainEqual({
          path: `/${path.basename(required.path)}`,
          digest: required.digest,
        });
      expect(
        rejected,
        "undeclared browser destinations prevent credit",
      ).toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };
