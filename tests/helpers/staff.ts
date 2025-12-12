import type { Page } from "@playwright/test";

const STAFF_URL_TEXT = "User list";
const STAFF_FALLBACK_URL_TEXT = "User search";
const STAFF_READY_TIMEOUT = 20_000;

export async function navigateToStaff(page: Page, baseUrl: string): Promise<void> {
  // Ensure we start from the main shell so header navigation is present
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });

  const headerNavSelector =
    "exui-root exui-app-header exui-header header exui-hmcts-global-header nav .hmcts-primary-navigation__nav nav ul li:nth-child(6) a";
  const staffLink = page.getByRole("link", { name: "Staff" });
  const staffNavCss = page.locator(headerNavSelector).first();

  // Prefer accessible locator; fall back to explicit header CSS path
  await retry(async () => {
    const linkVisible = await staffLink.isVisible().catch(() => false);
    if (linkVisible) {
      await staffLink.click();
    } else {
      const cssVisible = await staffNavCss.isVisible({ timeout: 2_000 }).catch(() => false);
      if (cssVisible) {
        await staffNavCss.click();
      } else {
        throw new Error("Staff navigation link not visible");
      }
    }
    await page
      .waitForURL(/\/staff(\/user-search)?/, { timeout: STAFF_READY_TIMEOUT })
      .catch(() => undefined);
  });

  await waitForStaffPage(page);
}

export async function runSimpleStaffSearch(page: Page, term: string): Promise<void> {
  await page.locator("#content").getByRole("textbox").fill(term);
  await page.getByRole("button", { name: "Search", exact: true }).click();
}

async function waitForStaffPage(page: Page): Promise<void> {
  const deadline = Date.now() + STAFF_READY_TIMEOUT;
  const candidates = [
    page.getByRole("heading", { name: /User list/i }),
    page.getByRole("heading", { name: /User search/i }),
    page.getByText(STAFF_URL_TEXT),
    page.getByText(STAFF_FALLBACK_URL_TEXT),
    page.locator("exui-staff-user-list"),
    page.getByRole("button", { name: /Advanced search/i }),
  ];

  // Try each locator with the remaining time budget.
  for (const locator of candidates) {
    const remaining = Math.max(500, deadline - Date.now());
    try {
      await locator.waitFor({ state: "visible", timeout: remaining });
      return;
    } catch {
      // try next candidate
    }
  }

  throw new Error(
    "Staff search page did not load; check feature toggle, user permissions, or environment availability.",
  );
}

async function retry(action: () => Promise<void>, attempts = 5): Promise<void> {
  for (let i = 0; i < attempts; i += 1) {
    try {
      await action();
      return;
    } catch (error) {
      if (i === attempts - 1) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }
}
