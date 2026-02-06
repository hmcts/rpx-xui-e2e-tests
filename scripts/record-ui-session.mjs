import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { chromium } from "@playwright/test";

const trimTrailingSlash = (value) => value.replace(/\/+$/, "");

const resolveUserIdentifier = () => {
  const fromEnv = process.env.PW_UI_USER ?? process.env.PW_UI_USERS;
  if (fromEnv?.trim()) {
    const [first] = fromEnv
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    if (first) return first;
  }
  const [, , arg] = process.argv;
  if (arg?.trim()) return arg.trim();
  return "SOLICITOR";
};

const toStorageName = (value) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-");

const resolveStoragePath = (userIdentifier) => {
  const override = process.env.PW_UI_STORAGE_PATH;
  if (override?.trim()) return override;
  const baseDir = path.join(
    process.cwd(),
    "test-results",
    "storage-states",
    "ui",
  );
  return path.join(baseDir, `${toStorageName(userIdentifier)}.json`);
};

const resolveManageCaseUrl = () => {
  const baseUrl =
    process.env.TEST_URL ?? "https://manage-case.aat.platform.hmcts.net";
  const trimmed = trimTrailingSlash(baseUrl);
  return trimmed.endsWith("/cases") ? trimmed : `${trimmed}/cases`;
};

const resolveTimeoutMs = () => {
  const raw = process.env.PW_UI_MANUAL_TIMEOUT_MS;
  if (!raw) return 300_000;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) return 300_000;
  return Math.max(30_000, parsed);
};

const userIdentifier = resolveUserIdentifier();
const storagePath = resolveStoragePath(userIdentifier);
const manageCaseUrl = resolveManageCaseUrl();
const timeoutMs = resolveTimeoutMs();

console.log(`[ui-session] Recording session for ${userIdentifier}`);
console.log(`[ui-session] Target URL: ${manageCaseUrl}`);
console.log(`[ui-session] Storage path: ${storagePath}`);
console.log(
  `[ui-session] Waiting up to ${Math.round(timeoutMs / 1000)}s for login...`,
);

fs.mkdirSync(path.dirname(storagePath), { recursive: true });

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext();
const page = await context.newPage();

try {
  await page.goto(manageCaseUrl, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("exui-header, exui-case-home", {
    timeout: timeoutMs,
  });
  await context.storageState({ path: storagePath });
  console.log("[ui-session] Session saved.");
} catch (error) {
  console.error(
    "[ui-session] Failed to record session.",
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
} finally {
  await context.close();
  await browser.close();
}
