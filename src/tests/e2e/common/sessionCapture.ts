import type { Page } from "@playwright/test";

import {
  applyCookiesToPage,
  ensureSessionCookies,
  type LoadedSession,
} from "../integration/utils/session.utils.js";

export { ensureSessionCookies, applyCookiesToPage };

export async function ensureSession(
  userIdentifier: string,
  options?: { strict?: boolean },
): Promise<LoadedSession> {
  return ensureSessionCookies(userIdentifier, { strict: options?.strict });
}

export async function applySessionCookies(
  page: Page,
  userIdentifier: string,
  options?: { strict?: boolean },
): Promise<LoadedSession> {
  const session = await ensureSessionCookies(userIdentifier, {
    strict: options?.strict,
  });
  await applyCookiesToPage(page, session.cookies);
  return session;
}

export async function ensureAuthenticatedPage(
  page: Page,
  userIdentifier: string,
  options?: { strict?: boolean; url?: string },
): Promise<LoadedSession> {
  const session = await applySessionCookies(page, userIdentifier, options);
  await page.goto(options?.url ?? "/");
  return session;
}

export function getSetupMarker(page: Page): string {
  const url = page.url().toLowerCase();
  if (!url || url === "about:blank") {
    return "pre-navigation";
  }
  if (url.includes("idam")) {
    return "idam-login";
  }
  if (url.includes("/cases")) {
    return "exui-cases";
  }
  return "ui-flow";
}

export async function sessionCapture(
  identifiers: string[],
  options?: { strict?: boolean },
): Promise<void> {
  for (const identifier of identifiers) {
    await ensureSessionCookies(identifier, { strict: options?.strict });
  }
}

export const __test__ = {
  getSetupMarker,
};
