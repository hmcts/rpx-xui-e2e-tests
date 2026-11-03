import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { test as base, expect } from "./harnessIdentity";

export const test = base.extend<{ candidateIdentity: void }>({
  candidateIdentity: [
    async ({ context }, use) => {
      const rejected: string[] = [];
      const assetChecks: Promise<void>[] = [];
      context.on("response", (assetResponse) => {
        const assetUrl = new URL(assetResponse.url());
        if (
          assetUrl.origin !== "http://127.0.0.1:3100" ||
          !/^\/main-[A-Za-z0-9]+\.js$/.test(assetUrl.pathname)
        )
          return;
        assetChecks.push(
          (async () => {
            const served = await assetResponse.body();
            const sealed = fs.readFileSync(
              path.join(
                process.env.EXUI_CANDIDATE_ASSETS!,
                path.basename(assetUrl.pathname),
              ),
            );
            expect(createHash("sha256").update(served).digest("hex")).toBe(
              createHash("sha256").update(sealed).digest("hex"),
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
        const url = new URL(route.request().url());
        if (url.origin === "http://127.0.0.1:3100") {
          await route.continue();
          return;
        }
        // Explicitly excluded feature flag/telemetry providers; no candidate-owned route is fulfilled.
        if (
          [
            "clientstream.launchdarkly.com",
            "clientsdk.launchdarkly.com",
            "events.launchdarkly.com",
            "app.launchdarkly.com",
          ].includes(url.hostname)
        ) {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            headers: { "access-control-allow-origin": "*" },
            body: JSON.stringify(url.pathname.includes("goals") ? [] : flags),
          });
          return;
        }
        rejected.push(`UNDECLARED_BROWSER_DESTINATION:${url.origin}`);
        await route.abort("blockedbyclient");
      });
      await use();
      expect(
        assetChecks.length,
        "candidate Angular entry bundle was observed",
      ).toBeGreaterThan(0);
      await Promise.all(assetChecks);
      expect(
        rejected,
        "undeclared browser destination prevents evidence credit",
      ).toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };
