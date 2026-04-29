import fs from "node:fs";
import path from "node:path";

import type { Page, TestInfo } from "@playwright/test";

import config from "../../../utils/ui/config.utils.js";
import { ensureUiStorageStateForUser } from "../../../utils/ui/session-storage.utils.js";
import { USER_ENV_MAP } from "../../../utils/ui/user.utils.js";
import type { SessionIdentity, SessionIdentityInput } from "../../common/sessionIdentity.js";
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

export type WelshLanguageSessionIdentity = SessionIdentity;

export type WelshLanguageSessionLease = {
  release: () => Promise<void>;
  userIdentifier: SessionIdentityInput;
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

function toLeaseKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "_");
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function resolveEnvValue(value: string | string[], env: NodeJS.ProcessEnv): string | undefined {
  const candidates = Array.isArray(value) ? value : [value];
  for (const candidate of candidates) {
    const resolved = env[candidate];
    if (resolved) {
      return resolved;
    }
  }
  return undefined;
}

function buildConfiguredIdentity(
  userIdentifier: string,
  env: NodeJS.ProcessEnv
): WelshLanguageSessionIdentity | undefined {
  const mapping = USER_ENV_MAP[userIdentifier];
  if (!mapping) {
    return undefined;
  }

  const email = resolveEnvValue(mapping.username, env)?.trim();
  const password = resolveEnvValue(mapping.password, env);
  if (!email || !password) {
    return undefined;
  }

  return {
    userIdentifier,
    email,
    password
  };
}

function resolveLeaseKey(user: SessionIdentityInput): string {
  return typeof user === "string" ? toLeaseKey(user) : toLeaseKey(user.email);
}

async function acquireWelshLanguageLease(user: SessionIdentityInput): Promise<() => Promise<void>> {
  ensureDirectory(welshLanguageLeaseRoot);
  const leasePath = path.join(welshLanguageLeaseRoot, resolveLeaseKey(user));
  const startedAt = Date.now();

  while (true) {
    try {
      fs.mkdirSync(leasePath);
      fs.writeFileSync(
        path.join(leasePath, "lease.json"),
        JSON.stringify({
          userIdentifier: typeof user === "string" ? user : user.userIdentifier,
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
        throw new Error(`Timed out waiting for Welsh language session lease after ${elapsedMs}ms (${leasePath})`, {
          cause: error
        });
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

export function resolveConfiguredWelshLanguageSessionIdentities(
  env: NodeJS.ProcessEnv = process.env
): WelshLanguageSessionIdentity[] {
  const configuredUserFilter = parseUserList(env.PW_WELSH_LANGUAGE_SESSION_USERS);
  const filteredDefaults =
    configuredUserFilter.length > 0 ? configuredUserFilter : [...defaultWelshLanguageSessionUsers];
  const seenEmails = new Set<string>();

  return filteredDefaults
    .map((userIdentifier) => buildConfiguredIdentity(userIdentifier, env))
    .filter((identity): identity is WelshLanguageSessionIdentity => Boolean(identity))
    .filter((identity) => {
      const normalizedEmail = normalizeEmail(identity.email);
      if (seenEmails.has(normalizedEmail)) {
        return false;
      }
      seenEmails.add(normalizedEmail);
      return true;
    });
}

function resolveWelshLanguageSessionPool(
  env: NodeJS.ProcessEnv = process.env
): SessionIdentityInput[] {
  const resolved = resolveConfiguredWelshLanguageSessionIdentities(env);
  return resolved.length > 0 ? resolved : ["SOLICITOR"];
}

function resolveWelshLanguageSessionCandidate(
  testInfo: Pick<TestInfo, "workerIndex">,
  env: NodeJS.ProcessEnv = process.env
): SessionIdentityInput {
  const users = resolveWelshLanguageSessionPool(env);
  return users[testInfo.workerIndex % users.length];
}

export function resolveWelshLanguageSessionUsers(env: NodeJS.ProcessEnv = process.env): SessionIdentityInput[] {
  return resolveWelshLanguageSessionPool(env);
}

export function resolveWelshLanguageSessionUser(
  testInfo: Pick<TestInfo, "workerIndex">,
  env: NodeJS.ProcessEnv = process.env
): SessionIdentityInput {
  return resolveWelshLanguageSessionCandidate(testInfo, env);
}

export async function ensureWelshLanguageSessionAccess(
  testInfo: Pick<TestInfo, "workerIndex">,
  env: NodeJS.ProcessEnv = process.env
): Promise<string> {
  const sessionUser = resolveWelshLanguageSessionUser(testInfo, env);
  const userIdentifier = typeof sessionUser === "string" ? sessionUser : sessionUser.userIdentifier;
  await ensureUiStorageStateForUser(userIdentifier, { strict: true });
  return userIdentifier;
}

export async function setupWelshLanguageSession(
  page: Page,
  testInfo: Pick<TestInfo, "workerIndex" | "annotations">,
  env: NodeJS.ProcessEnv = process.env
): Promise<WelshLanguageSessionLease> {
  const sessionUser = resolveWelshLanguageSessionCandidate(testInfo, env);
  const userIdentifier = typeof sessionUser === "string" ? sessionUser : sessionUser.userIdentifier;
  const release = await acquireWelshLanguageLease(sessionUser);

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

    const annotationValue = typeof sessionUser === "string" ? sessionUser : sessionUser.userIdentifier;
    testInfo.annotations.push({ type: "session-user", description: annotationValue });
    return { release, userIdentifier: sessionUser };
  } catch (error) {
    await release().catch(() => undefined);
    throw error;
  }
}
