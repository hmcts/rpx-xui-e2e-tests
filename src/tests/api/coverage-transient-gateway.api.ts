import { expect, test } from "@playwright/test";

import {
  hasTransientGatewayPage,
  navigateWithTransientGatewayRetry
} from "../integration/utils/transientGatewayPage.utils.js";

function buildFakePage(bodyTexts: string[]) {
  let index = 0;
  const gotoCalls: string[] = [];

  return {
    gotoCalls,
    page: {
      async goto(url: string) {
        gotoCalls.push(url);
      },
      locator() {
        return {
          async innerText() {
            const bodyText = bodyTexts[Math.min(index, bodyTexts.length - 1)] ?? "";
            index += 1;
            return bodyText;
          }
        };
      }
    }
  };
}

test.describe("transient gateway page coverage", () => {
  test("hasTransientGatewayPage recognises Azure Front Door gateway pages", async () => {
    const fake = buildFakePage([
      "504 The service behind this page isn't responding to Azure Front Door. Error Info:OriginTimeout"
    ]);

    await expect(hasTransientGatewayPage(fake.page as never)).resolves.toBe(true);
  });

  test("navigateWithTransientGatewayRetry retries once after a transient gateway page", async () => {
    const fake = buildFakePage([
      "504 Gateway Timeout Azure Front Door OriginTimeout",
      ""
    ]);

    await expect(
      navigateWithTransientGatewayRetry(fake.page as never, "/cases/example", {
        maxAttempts: 2,
        contextLabel: "example page"
      })
    ).resolves.toBeUndefined();

    expect(fake.gotoCalls).toEqual(["/cases/example", "about:blank", "/cases/example"]);
  });

  test("navigateWithTransientGatewayRetry retries when post-navigation readiness fails transiently", async () => {
    const fake = buildFakePage(["", ""]);
    let readinessAttempt = 0;

    await expect(
      navigateWithTransientGatewayRetry(fake.page as never, "/cases/example", {
        maxAttempts: 2,
        contextLabel: "example page",
        afterNavigation: async () => {
          readinessAttempt += 1;
          if (readinessAttempt === 1) {
            throw new Error("Timeout 15000ms exceeded while waiting for case details tabs.");
          }
        }
      })
    ).resolves.toBeUndefined();

    expect(readinessAttempt).toBe(2);
    expect(fake.gotoCalls).toEqual(["/cases/example", "about:blank", "/cases/example"]);
  });
});
