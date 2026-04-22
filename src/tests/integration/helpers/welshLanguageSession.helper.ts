import fs from "node:fs";
import path from "node:path";

import type { Page, TestInfo } from "@playwright/test";

import config from "../../../utils/ui/config.utils.js";
import { ensureUiStorageStateForUser } from "../../../utils/ui/session-storage.utils.js";
import { UserUtils } from "../../../utils/ui/user.utils.js";
import { loadSessionCookies } from "../../e2e/integration/utils/session.utils.js";

const defaultWelshLanguageSessionUsers = [
  "SOLICITOR",
  "PRL_SOLICITOR",
  "WA_SOLICITOR",
  "NOC_SOLICITOR"
] as const;
const welshLanguageLeaseRoot = path.join(process.cwd(), ".sessions", "welsh-language-leases");
const welshLanguageLeaseStaleMs = 5 * 60 * 1000;
const welshLanguageLeaseRetryMs = 1_000;
const welshLanguageLeaseMaxWaitMs = 2 * 60 * 1000;

export type WelshLanguageSessionLease = {
  release: () => Promise<void>;
  userIdentifier: string;
};

function parseUserList(rawValue?: string): string[] {
  return Array.from(
    new Set(
      (rawValue ?? "")
        .split(",")
        .map((value) => value.trim().toUpperCase())
        .filter(Boolean)
    )
  );
}

function ensureDirectory(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function toLeaseKey(userIdentifier: string): string {
  return userIdentifier.toLowerCase().replace(/[^a-z0-9._-]+/g, "_");
}

async function acquireWelshLanguageLease(userIdentifier: string): Promise<() => Promise<void>> {
  ensureDirectory(welshLanguageLeaseRoot);
  const leasePath = path.join(welshLanguageLeaseRoot, toLeaseKey(userIdentifier));
  const startedAt = Date.now();

  while (true) {
    try {
      fs.mkdirSync(leasePath);
      fs.writeFileSync(
        path.join(leasePath, "lease.json"),
        JSON.stringify({
          userIdentifier,
          acquiredAt: new Date().toISOString(),
          pid: process.pid
        }),
        "utf8"
      );

      return async () => {
        await fs.promises.rm(leasePath, { recursive: true, force: true });
      };
    } catch (error) {
      const candidate = error as NodeJS.ErrnoException;
      if (candidate.code !== "EEXIST") {
        throw error;
      }

      const elapsedMs = Date.now() - startedAt;
      if (elapsedMs >= welshLanguageLeaseMaxWaitMs) {
        throw new Error(`Timed out waiting for Welsh language session lease after ${elapsedMs}ms (${leasePath})`);
      }

      const stat = fs.statSync(leasePath, { throwIfNoEntry: false });
      if (stat && Date.now() - stat.mtimeMs >= welshLanguageLeaseStaleMs) {
        fs.rmSync(leasePath, { recursive: true, force: true });
        continue;
      }

      await new Promise<void>((resolve) => setTimeout(resolve, welshLanguageLeaseRetryMs));
    }
  }
}

export function resolveWelshLanguageSessionUsers(env: NodeJS.ProcessEnv = process.env): string[] {
  const userUtils = new UserUtils();
  const configuredUserFilter = parseUserList(env.PW_WELSH_LANGUAGE_SESSION_USERS);
  const filteredDefaults =
    configuredUserFilter.length > 0 ? configuredUserFilter : [...defaultWelshLanguageSessionUsers];
  const resolved = filteredDefaults.filter((userIdentifier) => userUtils.hasUserCredentials(userIdentifier));
  return resolved.length > 0 ? resolved : ["SOLICITOR"];
}

export function resolveWelshLanguageSessionUser(
  testInfo: Pick<TestInfo, "workerIndex">,
  env: NodeJS.ProcessEnv = process.env
): string {
  const users = resolveWelshLanguageSessionUsers(env);
  return users[testInfo.workerIndex % users.length];
}

export async function ensureWelshLanguageSessionAccess(
  testInfo: Pick<TestInfo, "workerIndex">,
  env: NodeJS.ProcessEnv = process.env
): Promise<string> {
  const userIdentifier = resolveWelshLanguageSessionUser(testInfo, env);
  await ensureUiStorageStateForUser(userIdentifier, { strict: true });
  return userIdentifier;
}

export async function setupWelshLanguageSession(
  page: Page,
  testInfo: Pick<TestInfo, "workerIndex" | "annotations">,
  env: NodeJS.ProcessEnv = process.env
): Promise<WelshLanguageSessionLease> {
  const userIdentifier = resolveWelshLanguageSessionUser(testInfo, env);
  const release = await acquireWelshLanguageLease(userIdentifier);

  try {
    await ensureUiStorageStateForUser(userIdentifier, { strict: true });
    const session = loadSessionCookies(userIdentifier);
    if (session.cookies.length > 0) {
      await page.context().addCookies(session.cookies);
    }

    await page.context().addCookies([
      {
        name: "exui-preferred-language",
        value: "en",
        url: config.urls.exuiDefaultUrl
      }
    ]);

    testInfo.annotations.push({ type: "session-user", description: userIdentifier });
    return { release, userIdentifier };
  } catch (error) {
    await release().catch(() => undefined);
    throw error;
  }
}
