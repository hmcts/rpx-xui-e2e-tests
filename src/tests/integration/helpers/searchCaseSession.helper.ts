import type { Page, TestInfo } from "@playwright/test";

import { ensureUiStorageStateForUser } from "../../../utils/ui/session-storage.utils.js";
import { UserUtils } from "../../../utils/ui/user.utils.js";
import { loadSessionCookies } from "../../e2e/integration/utils/session.utils.js";

const defaultSearchCaseSessionUsers = ["FPL_GLOBAL_SEARCH"] as const;
const defaultIntegrationWarmupUsers = ["FPL_GLOBAL_SEARCH", "SOLICITOR", "STAFF_ADMIN"] as const;
const searchCaseFallbackUsers: Record<string, string[]> = {
  FPL_GLOBAL_SEARCH: ["CASEWORKER_GLOBALSEARCH", "WA2_GLOBAL_SEARCH", "CASEWORKER_R1"]
};

function parseUserList(rawValue?: string): string[] {
  return Array.from(
    new Set(
      (rawValue ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    )
  );
}

export function resolveSearchCaseSessionUsers(env: NodeJS.ProcessEnv = process.env): string[] {
  const configured = parseUserList(env.PW_SEARCH_CASE_SESSION_USERS);
  return configured.length > 0 ? configured : [...defaultSearchCaseSessionUsers];
}

export function resolveIntegrationSessionWarmupUsers(env: NodeJS.ProcessEnv = process.env): string[] {
  const configured = parseUserList(env.PW_INTEGRATION_SESSION_WARMUP_USERS);
  if (configured.length > 0) {
    return configured;
  }

  return Array.from(
    new Set([...defaultIntegrationWarmupUsers, ...resolveSearchCaseSessionUsers(env)])
  );
}

function normalizeUserIdentifier(userIdentifier: string): string {
  return userIdentifier.trim().toUpperCase();
}

function rotateUsersToPreferred(users: string[], preferredUserIdentifier: string): string[] {
  const preferredIndex = users.indexOf(preferredUserIdentifier);
  if (preferredIndex <= 0) {
    return users;
  }

  return [...users.slice(preferredIndex), ...users.slice(0, preferredIndex)];
}

export function resolveSearchCaseSessionCandidateUsers(
  preferredUserIdentifier: string,
  env: NodeJS.ProcessEnv = process.env
): string[] {
  const normalizedPreferredUserIdentifier = normalizeUserIdentifier(preferredUserIdentifier);
  const configuredUsers = resolveSearchCaseSessionUsers(env).map(normalizeUserIdentifier);
  const configuredPool =
    configuredUsers.length > 0
      ? configuredUsers.includes(normalizedPreferredUserIdentifier)
        ? rotateUsersToPreferred(configuredUsers, normalizedPreferredUserIdentifier)
        : configuredUsers
      : [];
  const fallbackUsers = searchCaseFallbackUsers[normalizedPreferredUserIdentifier] ?? [];

  return Array.from(
    new Set([normalizedPreferredUserIdentifier, ...configuredPool, ...fallbackUsers])
  );
}

export function resolveSearchCaseUserIdentifier(
  testInfo: Pick<TestInfo, "workerIndex">,
  env: NodeJS.ProcessEnv = process.env
): string {
  const users = resolveSearchCaseSessionUsers(env);
  return users[testInfo.workerIndex % users.length];
}

function resolveCapturedSessionUserIdentifier(candidateUsers: string[]): string {
  for (const candidateUser of candidateUsers) {
    try {
      const session = loadSessionCookies(candidateUser);
      if (session.cookies.length > 0) {
        return candidateUser;
      }
    } catch {
      // Fall through to the next candidate.
    }
  }

  return candidateUsers[0];
}

export function resolveCapturedSearchCaseSessionUser(
  preferredUserIdentifier: string,
  env: NodeJS.ProcessEnv = process.env
): string {
  return resolveCapturedSessionUserIdentifier(
    resolveSearchCaseSessionCandidateUsers(preferredUserIdentifier, env)
  );
}

export async function ensureSearchCaseSessionAccessForUser(
  preferredUserIdentifier: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<string> {
  const userUtils = new UserUtils();
  const candidateUsers = resolveSearchCaseSessionCandidateUsers(preferredUserIdentifier, env);
  const failureMessages: string[] = [];

  for (const candidateUser of candidateUsers) {
    if (!userUtils.hasUserCredentials(candidateUser)) {
      failureMessages.push(`${candidateUser}: missing credentials`);
      continue;
    }

    try {
      await ensureUiStorageStateForUser(candidateUser, { strict: true });
      return candidateUser;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failureMessages.push(`${candidateUser}: ${message}`);
    }
  }

  throw new Error(
    `Unable to establish search-case session for ${preferredUserIdentifier}. ` +
      `Attempts: ${failureMessages.join(" | ")}`
  );
}

export async function ensureSearchCaseSessionAccess(
  testInfo: Pick<TestInfo, "workerIndex">,
  env: NodeJS.ProcessEnv = process.env
): Promise<string> {
  const userIdentifier = resolveSearchCaseUserIdentifier(testInfo, env);
  return ensureSearchCaseSessionAccessForUser(userIdentifier, env);
}

export async function applySearchCaseSessionCookies(
  page: Page,
  testInfo: Pick<TestInfo, "workerIndex" | "annotations">,
  env: NodeJS.ProcessEnv = process.env
): Promise<string> {
  const preferredUserIdentifier = resolveSearchCaseUserIdentifier(testInfo, env);
  const userIdentifier = resolveCapturedSearchCaseSessionUser(preferredUserIdentifier, env);
  const session = loadSessionCookies(userIdentifier);

  if (session.cookies.length > 0) {
    await page.context().addCookies(session.cookies);
  }

  testInfo.annotations.push({ type: "session-user", description: userIdentifier });
  return userIdentifier;
}
