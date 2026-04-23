import type { Page } from "@playwright/test";

import {
  ensureSearchCaseSessionAccessForUser,
  resolveCapturedSearchCaseSessionUser
} from "../../integration/helpers/searchCaseSession.helper.js";
import { loadSessionCookies } from "../integration/utils/session.utils.js";
import type { ResolveCaseReferenceOptions } from "../utils/case-reference.utils.js";

export const PUBLIC_LAW_CASE_REFERENCE_OPTIONS: ResolveCaseReferenceOptions = {
  jurisdictionIds: ["PUBLICLAW"],
  preferredStates: ["Case management", "Submitted", "Gatekeeping", "Closed"]
};

export async function ensureSearchCaseSession(userIdentifier: string): Promise<string> {
  return ensureSearchCaseSessionAccessForUser(userIdentifier);
}

export async function openHomeWithCapturedSession(
  page: Page,
  userIdentifier: string
): Promise<void> {
  const resolvedUserIdentifier = resolveCapturedSearchCaseSessionUser(userIdentifier);
  const session = loadSessionCookies(resolvedUserIdentifier);
  if (session.cookies.length > 0) {
    await page.context().addCookies(session.cookies);
  }

  await page.goto("/cases", { waitUntil: "domcontentloaded" });
  await page.locator("exui-header").waitFor({ state: "visible", timeout: 30_000 });
}
