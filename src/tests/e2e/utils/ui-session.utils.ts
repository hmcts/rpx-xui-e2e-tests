import type { Page } from "@playwright/test";

import { ensureUiStorageStateForUser } from "../../../utils/ui/session-storage.utils.js";
import { loadSessionCookies } from "../integration/utils/session.utils.js";

type EnsureUiSessionOptions = {
  strict?: boolean;
};

export async function ensureUiSession(userIdentifier: string, options: EnsureUiSessionOptions = {}): Promise<void> {
  await ensureUiStorageStateForUser(userIdentifier, { strict: options.strict ?? true });
}

export async function openHomeWithCapturedSession(page: Page, userIdentifier: string): Promise<void> {
  const applyCapturedSession = async () => {
    const session = loadSessionCookies(userIdentifier);
    if (session.cookies.length) {
      await page.context().addCookies(session.cookies);
    }
  };

  await applyCapturedSession();
  await page.goto("/cases", { waitUntil: "domcontentloaded" });
  const authResponse = await page.request.get(new URL("/auth/isAuthenticated", page.url()).toString(), {
    failOnStatusCode: false
  });
  const isAuthenticated = authResponse.status() === 200 && (await authResponse.json().catch(() => false)) === true;
  if (!isAuthenticated) {
    await page.context().clearCookies();
    await ensureUiStorageStateForUser(userIdentifier, { strict: true, force: true });
    await applyCapturedSession();
    await page.goto("/cases", { waitUntil: "domcontentloaded" });
  }
  await page.locator("exui-header").waitFor({ state: "visible", timeout: 30_000 });
}
