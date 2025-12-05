#!/usr/bin/env node
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { environment } from "../config/index.ts";

async function loginAndSave(username: string, password: string, file: string) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${environment.appBaseUrl}/login`);
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

  await loginAndSave(
    environment.caseManager.username,
    environment.caseManager.password,
    path.join(outDir, "caseManager.json"),
  );
  await loginAndSave(
    environment.judge.username,
    environment.judge.password,
    path.join(outDir, "judge.json"),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
