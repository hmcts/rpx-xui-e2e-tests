import { expect, test } from "@playwright/test";

import {
  hasTransientGatewayPage,
  navigateWithTransientGatewayRetry
} from "../integration/utils/transientGatewayPage.utils.js";

function buildFakePage(bodyTexts: string[], gotoErrors: Array<string | undefined> = []) {
  let index = 0;
  const gotoCalls: string[] = [];

  return {
    gotoCalls,
    page: {
      async goto(url: string) {
        gotoCalls.push(url);
        const gotoError = gotoErrors[gotoCalls.length - 1];
        if (gotoError) {
          throw new Error(gotoError);
        }
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

  test("navigateWithTransientGatewayRetry can verify guarded redirects after aborted navigation", async () => {
    const fake = buildFakePage([""], ["page.goto: net::ERR_ABORTED at https://manage-case.example/booking"]);
    let redirectVerified = false;

    await expect(
      navigateWithTransientGatewayRetry(fake.page as never, "/booking", {
        allowAbortedNavigation: true,
        contextLabel: "booking access redirect",
        afterNavigation: async () => {
          redirectVerified = true;
        }
      })
    ).resolves.toBeUndefined();

    expect(redirectVerified).toBe(true);
    expect(fake.gotoCalls).toEqual(["/booking"]);
  });
});
