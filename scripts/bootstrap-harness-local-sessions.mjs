import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { request } from "@playwright/test";

const repoRoot = process.cwd();
const testUrl = (process.env.TEST_URL || "http://localhost:3455").replace(/\/+$/, "");
const testEnv = process.env.TEST_ENV || "local";
const apiStorageScope = process.env.API_AUTH_STORAGE_SCOPE || "harness-local";
const uiStorageRoot = path.join(repoRoot, "test-results", "storage-states", "ui");
const apiStorageRoot = path.join(repoRoot, "test-results", "storage-states", "api", testEnv, `worker-${apiStorageScope}`);

const harnessUsers = [
  ["SOLICITOR", process.env.SOLICITOR_USERNAME || "exui.local.srt@hmcts.net"],
  ["COURT_ADMIN", process.env.COURT_ADMIN_USERNAME || "exui.local.srt@hmcts.net"],
  ["HEARING_MANAGER_CR84_ON", process.env.HEARING_MANAGER_CR84_ON_USERNAME || "exui.local.srt@hmcts.net"],
  ["HEARING_MANAGER_CR84_OFF", process.env.HEARING_MANAGER_CR84_OFF_USERNAME || "exui.local.srt@hmcts.net"]
];

const toStorageName = (value) =>
  value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-");

const resolveUiStoragePath = (userIdentifier, email) =>
  path.join(uiStorageRoot, `${toStorageName(`${userIdentifier}-${email}`)}.json`);

const writeJson = (targetPath, value) => {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

async function buildLocalStorageState() {
  const context = await request.newContext({
    baseURL: testUrl,
    ignoreHTTPSErrors: true,
    maxRedirects: 0
  });

  try {
    const login = await context.get("auth/login", { failOnStatusCode: false });
    const authorizeUrl = login.headers().location;
    if (!authorizeUrl) {
      throw new Error(`GET /auth/login did not provide an IDAM authorize redirect; status=${login.status()}`);
    }

    const authorize = await context.get(authorizeUrl, { failOnStatusCode: false });
    const callbackUrl = authorize.headers().location;
    if (!callbackUrl) {
      throw new Error(`IDAM authorize redirect did not provide a callback URL; status=${authorize.status()}`);
    }

    const callback = new URL(callbackUrl);
    await context.get(`${testUrl}/oauth2/callback${callback.search}`, { failOnStatusCode: false });
    await context.get("/", { failOnStatusCode: false });

    const authCheck = await context.get("auth/isAuthenticated", { failOnStatusCode: false });
    const isAuthenticated = authCheck.status() === 200 && (await authCheck.json().catch(() => false)) === true;
    if (!isAuthenticated) {
      throw new Error(`Local session bootstrap did not authenticate; status=${authCheck.status()}`);
    }

    return context.storageState();
  } finally {
    await context.dispose();
  }
}

function writeUiMetadata(storagePath, userIdentifier, email) {
  writeJson(storagePath.replace(/\.json$/, ".meta.json"), {
    userIdentifier,
    email: email.trim().toLowerCase(),
    updatedAt: new Date().toISOString()
  });
}

const storageState = await buildLocalStorageState();

for (const [userIdentifier, email] of harnessUsers) {
  const storagePath = resolveUiStoragePath(userIdentifier, email);
  writeJson(storagePath, storageState);
  writeUiMetadata(storagePath, userIdentifier, email);
  console.log(`[harness-local] bootstrapped UI session ${userIdentifier}: ${storagePath}`);
}

const apiStoragePath = path.join(apiStorageRoot, "solicitor.json");
writeJson(apiStoragePath, storageState);
console.log(`[harness-local] bootstrapped API session solicitor: ${apiStoragePath}`);
