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

const base64Url = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");

function buildSyntheticLocalStorageState(email) {
  const token = [
    base64Url({ alg: "none", typ: "JWT" }),
    base64Url({
      email: email.trim().toLowerCase(),
      forename: "Central",
      roles: ["caseworker", "caseworker-privatelaw", "caseworker-publiclaw", "caseworker-civil"],
      sub: email.trim().toLowerCase(),
      surname: "Assurance",
      uid: "exui-central-assurance-user"
    }),
    "local-signature"
  ].join(".");
  const cookieDefaults = {
    domain: "localhost",
    expires: -1,
    httpOnly: true,
    path: "/",
    sameSite: "Lax",
    secure: false
  };

  return {
    cookies: [
      { ...cookieDefaults, name: "__auth__", value: token },
      { ...cookieDefaults, name: "Idam.Session", value: "synthetic-local-session" },
      { ...cookieDefaults, name: "xui-webapp", value: "synthetic-local-session" }
    ],
    origins: []
  };
}

async function buildLocalStorageState(email) {
  const context = await request.newContext({
    baseURL: testUrl,
    ignoreHTTPSErrors: true,
    maxRedirects: 0
  });

  try {
    const login = await context.get("auth/login", { failOnStatusCode: false });
    const authorizeUrl = login.headers().location;
    if (!authorizeUrl) {
      console.log(`[harness-local] GET /auth/login returned ${login.status()}; using synthetic local session for ${email}`);
      return buildSyntheticLocalStorageState(email);
    }

    const authorize = await context.get(authorizeUrl, { failOnStatusCode: false });
    const callbackUrl = authorize.headers().location;
    if (!callbackUrl) {
      console.log(`[harness-local] IDAM authorize returned ${authorize.status()}; using synthetic local session for ${email}`);
      return buildSyntheticLocalStorageState(email);
    }

    const callback = new URL(callbackUrl);
    await context.get(`${testUrl}/oauth2/callback${callback.search}`, { failOnStatusCode: false });
    await context.get("/", { failOnStatusCode: false });

    const authCheck = await context.get("auth/isAuthenticated", { failOnStatusCode: false });
    const isAuthenticated = authCheck.status() === 200 && (await authCheck.json().catch(() => false)) === true;
    if (!isAuthenticated) {
      console.log(`[harness-local] Local auth check returned ${authCheck.status()}; using synthetic local session for ${email}`);
      return buildSyntheticLocalStorageState(email);
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

let solicitorStorageState;

for (const [userIdentifier, email] of harnessUsers) {
  const storageState = await buildLocalStorageState(email);
  const storagePath = resolveUiStoragePath(userIdentifier, email);
  writeJson(storagePath, storageState);
  writeUiMetadata(storagePath, userIdentifier, email);
  console.log(`[harness-local] bootstrapped UI session ${userIdentifier}: ${storagePath}`);

  if (userIdentifier === "SOLICITOR") {
    solicitorStorageState = storageState;
  }
}

const apiStoragePath = path.join(apiStorageRoot, "solicitor.json");
writeJson(apiStoragePath, solicitorStorageState ?? buildSyntheticLocalStorageState(harnessUsers[0][1]));
console.log(`[harness-local] bootstrapped API session solicitor: ${apiStoragePath}`);
