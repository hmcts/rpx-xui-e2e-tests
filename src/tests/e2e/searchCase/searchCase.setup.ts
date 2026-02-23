import { type Page } from "@playwright/test";

import { EXUI_TIMEOUTS } from "../../../page-objects/pages/exui/exui-timeouts.js";

import { type ResolveCaseReferenceOptions } from "./case-reference.utils.js";

export const PUBLIC_LAW_CASE_REFERENCE_OPTIONS: ResolveCaseReferenceOptions = {
  jurisdictionIds: ["PUBLICLAW"],
  preferredStates: ["Case management", "Submitted", "Gatekeeping", "Closed"],
};

export async function openHomeWithCapturedSession(page: Page): Promise<void> {
  await page.goto("/");
  await page.locator("exui-header").waitFor({
    state: "visible",
    timeout: EXUI_TIMEOUTS.SEARCH_FIELD_VISIBLE,
  });
}
