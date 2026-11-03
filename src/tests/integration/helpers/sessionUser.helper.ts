import type { Page } from "@playwright/test";

import { ensureUiStorageStateForUser } from "../../../utils/ui/session-storage.utils.js";
import { resolvePooledUserIdentifier } from "../../common/userPoolIdentifiers.js";
import { loadSessionCookies } from "../../e2e/integration/utils/session.utils.js";

type SessionCookie = { name: string; value: string };
type AppliedSessionCookies = { cookies: SessionCookie[] };

export async function applySessionCookies(
  page: Page,
  userIdentifier: string
): Promise<AppliedSessionCookies> {
  const resolvedUserIdentifier = resolvePooledUserIdentifier(userIdentifier);
  await ensureUiStorageStateForUser(resolvedUserIdentifier, { strict: true });
  const loadedSession = loadSessionCookies(resolvedUserIdentifier);
  await page.context().addCookies(loadedSession.cookies);
  return { cookies: loadedSession.cookies };
}
