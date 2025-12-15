/* eslint-disable playwright/no-conditional-in-test */
import { test } from "@playwright/test";
import CONFIG from "../../config/configManager.js";
import { ensureStorageState, hasUiCreds } from "../utils/ui/auth.js";

const userKey = process.env.UI_USER_KEY ?? CONFIG.ui?.defaultUserKey ?? "default";

test.describe.configure({ mode: "serial" });

test("prepare authenticated storage state", async ({}, testInfo) => {
  if (!hasUiCreds()) {
    testInfo.skip(true, "UI credentials not configured; skipping auth setup");
  }
  await ensureStorageState(userKey);
});
