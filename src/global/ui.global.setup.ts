import fs from "node:fs";
import path from "node:path";

import { IdamPage } from "@hmcts/playwright-common";
import { chromium, type BrowserContext, type FullConfig, type Page } from "@playwright/test";

import config from "../utils/ui/config.utils.js";
import { resolveUiStoragePath, shouldUseUiStorage } from "../utils/ui/storage-state.utils.js";
import { UserUtils } from "../utils/ui/user.utils.js";

const waitForSelector = async (page: Page, selector: string) => {
  await page.waitForSelector(selector, { timeout: 60_000 });
};

const addAnalyticsCookie = async (context: BrowserContext, baseUrl: string) => {
  const cookies = await context.cookies();
  const userId = cookies.find((cookie) => cookie.name === "__userid__")?.value;
  if (!userId) return;

  const domain = new URL(baseUrl).hostname;
  const secure = baseUrl.startsWith("https://");
  await context.addCookies([
    {
      name: `hmcts-exui-cookies-${userId}-mc-accepted`,
      value: "true",
      domain,
      path: "/",
      expires: -1,
      httpOnly: false,
      secure,
      sameSite: "Lax"
    }
  ]);
};

async function globalSetup(_config: FullConfig) {
  void _config;
  if (!shouldUseUiStorage()) {
    return;
  }

  const userUtils = new UserUtils();
  const { email, password } = userUtils.getUserCredentials("SOLICITOR");
  const storagePath = resolveUiStoragePath();

  fs.mkdirSync(path.dirname(storagePath), { recursive: true });

  const baseUrl = process.env.TEST_URL ?? config.urls.exuiDefaultUrl;
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  const idamPage = new IdamPage(page);

  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await waitForSelector(page, "#username");
  await idamPage.login({ username: email, password });

  try {
    await page.waitForSelector("exui-header", { timeout: 60_000 });
  } catch {
    // Proceed even if header is slow to render; cookies may still be set.
  }

  await addAnalyticsCookie(context, baseUrl);
  await context.storageState({ path: storagePath });
  await browser.close();
}

export default globalSetup;
