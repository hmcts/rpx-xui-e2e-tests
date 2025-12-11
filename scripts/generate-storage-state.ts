#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { environment } from "../config/index.ts";
import { UserUtils } from "../utils/user.utils.ts";

const userUtils = new UserUtils();

const resolveUrl = () => `${environment.appBaseUrl}/login`;
const resolveFilename = (identifier: string) => {
  const normalised = identifier.toLowerCase().replace(/[^a-z0-9_-]/g, "_");
  switch (normalised) {
    case "casemanager":
      return "caseManager.json";
    case "staffadmin":
    case "staff_admin":
    case "staff-admin":
      return "staff_admin.json";
    default:
      return `${normalised}.json`;
  }
};

async function loginAndSave(username: string, password: string, file: string) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(resolveUrl());
  await page.getByLabel("Email address").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  // wait for a post-login indicator (best-effort)
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  await ctx.storageState({ path: file });
  await browser.close();
  console.log(`Saved storage state: ${file}`);
}

async function main() {
  const outDir = path.resolve(process.cwd(), "storage");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const requiredUsers = [
    { id: "caseManager", username: environment.caseManager.username, password: environment.caseManager.password },
    { id: "judge", username: environment.judge.username, password: environment.judge.password },
  ];

  const optionalUsers = ["SOLICITOR", "STAFF_ADMIN"];

  for (const { id, username, password } of requiredUsers) {
    await loginAndSave(username, password, path.join(outDir, resolveFilename(id)));
  }

  for (const identifier of optionalUsers) {
    try {
      const creds = userUtils.getUserCredentials(identifier);
      await loginAndSave(
        creds.email,
        creds.password,
        path.join(outDir, resolveFilename(identifier)),
      );
    } catch (err) {
      console.warn(`Skipping storage generation for ${identifier}: ${String(err)}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
