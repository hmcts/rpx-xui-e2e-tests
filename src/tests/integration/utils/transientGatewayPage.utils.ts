import type { Page } from "@playwright/test";

import { retryOnTransientFailure } from "../../e2e/utils/transient-failure.utils.js";

export const TRANSIENT_GATEWAY_PAGE_PATTERNS: RegExp[] = [
  /Gateway Timeout/i,
  /Azure Front Door/i,
  /OriginTimeout/i,
  /The service behind this page isn't responding/i
];

export async function readPageBodyText(page: Page): Promise<string> {
  return page.locator("body").innerText().catch(() => "");
}

export async function hasTransientGatewayPage(page: Page): Promise<boolean> {
  const bodyText = await readPageBodyText(page);
  return TRANSIENT_GATEWAY_PAGE_PATTERNS.some((pattern) => pattern.test(bodyText));
}

export async function navigateWithTransientGatewayRetry(
  page: Page,
  url: string,
  options: {
    maxAttempts?: number;
    waitUntil?: NonNullable<Parameters<Page["goto"]>[1]>["waitUntil"];
    contextLabel?: string;
    afterNavigation?: () => Promise<void>;
  } = {}
): Promise<void> {
  await retryOnTransientFailure(
    async () => {
      await page.goto(url, {
        waitUntil: options.waitUntil ?? "domcontentloaded"
      });

      if (await hasTransientGatewayPage(page)) {
        throw new Error(
          `Gateway Timeout page was displayed while opening ${options.contextLabel ?? url}: ${await readPageBodyText(page)}`
        );
      }

      await options.afterNavigation?.();
    },
    {
      maxAttempts: options.maxAttempts ?? 2,
      onRetry: async () => {
        await page.goto("about:blank").catch(() => undefined);
      }
    }
  );
}
