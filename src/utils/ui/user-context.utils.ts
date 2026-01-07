import type { APIResponse, Page, TestInfo } from "@playwright/test";

import { decodeJwtPayload } from "./jwt.utils.js";

type UserContextDetails = {
  username?: string;
  roles?: string[];
  source: "api/user/details" | "storage-state" | "error";
  status?: number;
  error?: string;
};

const pickFirstString = (value: unknown, fallback?: string): string | undefined => {
  if (typeof value === "string" && value.trim()) return value;
  return fallback;
};

const normalizeRoles = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const roles = value.filter(
    (role): role is string => typeof role === "string" && role.trim().length > 0
  );
  return roles.length ? Array.from(new Set(roles)) : undefined;
};

const readAuthPayloadFromCookies = async (
  page: Page
): Promise<Record<string, unknown> | undefined> => {
  try {
    const state = await page.context().storageState();
    const authCookie = state.cookies?.find((cookie) => cookie.name === "__auth__");
    if (!authCookie?.value) return undefined;
    return decodeJwtPayload(authCookie.value) ?? undefined;
  } catch {
    return undefined;
  }
};

const parseUserDetails = async (
  response: APIResponse,
  fallbackUsername?: string
): Promise<UserContextDetails> => {
  const status = response.status();
  if (!response.ok()) {
    return {
      source: "error",
      status,
      error: `api/user/details returned ${status}`
    };
  }

  try {
    const data = (await response.json()) as { userInfo?: Record<string, unknown> } | undefined;
    const userInfo = data?.userInfo ?? {};
    const username =
      pickFirstString(userInfo.email) ||
      pickFirstString(userInfo.sub) ||
      pickFirstString(userInfo.uid) ||
      fallbackUsername;
    const roles = normalizeRoles(userInfo.roles);
    return {
      source: "api/user/details",
      status,
      username,
      roles
    };
  } catch (error) {
    return {
      source: "error",
      status,
      error: `api/user/details parse failed: ${(error as Error).message}`
    };
  }
};

export const getUiUserContext = async (page: Page): Promise<UserContextDetails> => {
  const payload = await readAuthPayloadFromCookies(page);
  const fallbackUsername =
    pickFirstString(payload?.sub) ||
    pickFirstString(payload?.subname) ||
    pickFirstString(payload?.email);
  const fallbackRoles = normalizeRoles(payload?.roles ?? payload?.authorities);
  try {
    const response = await page.request.get("api/user/details", { failOnStatusCode: false });
    const details = await parseUserDetails(response, fallbackUsername);
    if (details.source !== "error") {
      return {
        ...details,
        username: details.username ?? fallbackUsername
      };
    }
    if (fallbackUsername || fallbackRoles) {
      return {
        source: "storage-state",
        username: fallbackUsername,
        roles: fallbackRoles,
        status: details.status,
        error: details.error
      };
    }
    return { ...details, username: fallbackUsername };
  } catch (error) {
    return {
      source: "error",
      username: fallbackUsername,
      roles: fallbackRoles,
      error: (error as Error).message
    };
  }
};

export const attachUiUserContext = async (page: Page, testInfo: TestInfo): Promise<void> => {
  const details = await getUiUserContext(page);
  const summary = [
    details.username ? `username=${details.username}` : "username=unknown",
    details.roles?.length ? `roles=${details.roles.join(",")}` : "roles=unknown",
    `source=${details.source}`
  ].join(" | ");
  testInfo.annotations.push({
    type: "ui-user-context",
    description: summary
  });
  await testInfo.attach("ui-user-context", {
    body: JSON.stringify(details, null, 2),
    contentType: "application/json"
  });
};
