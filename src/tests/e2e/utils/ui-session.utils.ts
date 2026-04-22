import type { Page } from "@playwright/test";

import { ensureUiStorageStateForUser } from "../../../utils/ui/session-storage.utils.js";
import { loadSessionCookies } from "../integration/utils/session.utils.js";

export async function ensureUiSession(userIdentifier: string): Promise<void> {
  await ensureUiStorageStateForUser(userIdentifier, { strict: true });
}

export async function openHomeWithCapturedSession(page: Page, userIdentifier: string): Promise<void> {
  const session = loadSessionCookies(userIdentifier);
  if (session.cookies.length) {
    await page.context().addCookies(session.cookies);
  }

  await page.goto("/cases", { waitUntil: "domcontentloaded" });
  await page.locator("exui-header").waitFor({ state: "visible", timeout: 30_000 });
}
