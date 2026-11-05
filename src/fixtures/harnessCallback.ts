import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { test as base, expect } from "@playwright/test";

// Candidate transport checks for the explicit feasibility CLI; no release-policy adapter.
export function feasibilityTest(kind: string) { return base.extend<{ callbackCandidate: void }>({
  callbackCandidate: [async ({ context }, use) => {
    const directory = process.env.EXUI_CCD_EVIDENCE!;
    const identity = JSON.parse(fs.readFileSync(path.join(directory, "runtime-identity.json"), "utf8"));
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, "manifest.json"), "utf8"));
    expect(identity.identity).toEqual(manifest.identity);
    expect(manifest.kind).toBe(kind);
    expect(manifest.catalogueCredit).toBe(false);
    const assets: Promise<boolean>[] = []; let rejected = 0;
    context.on("response", response => {
      const url = new URL(response.url());
      if (url.origin === "http://127.0.0.1:3100" && /^\/main-[A-Za-z0-9]+\.js$/.test(url.pathname)) {
        assets.push((async () => {
          const actual = await response.body(), expected = fs.readFileSync(path.join("/candidate/dist/rpx-exui/browser", path.basename(url.pathname)));
          return createHash("sha256").update(actual).digest("hex") === createHash("sha256").update(expected).digest("hex");
        })().catch(() => false));
      }
    });
    await context.route("**/*", route => {
      const url = new URL(route.request().url());
      if (url.origin === "http://127.0.0.1:3100") return route.continue();
      if (["clientstream.launchdarkly.com", "clientsdk.launchdarkly.com", "events.launchdarkly.com", "app.launchdarkly.com"].includes(url.hostname)) return route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(url.pathname.includes("goals") ? [] : { MC_Work_Allocation: { value: false, version: 1 }, "feature-global-search": { value: false, version: 1 } }) });
      rejected++; return route.abort("blockedbyclient");
    });
    await use();
    expect(assets.length, "real candidate Angular entry observed").toBeGreaterThan(0);
    expect((await Promise.all(assets)).every(Boolean), "served candidate assets match sealed bytes").toBe(true);
    expect(rejected, "no undeclared browser destinations").toBe(0);
  }, { auto: true }],
}); }
export const test = feasibilityTest("recipient-callback-ui-feasibility");
export { expect };
