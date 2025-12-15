import path from "node:path";
import CONFIG from "../../../config/configManager.js";

export interface UserConfig {
  username: string;
  password: string;
  sessionFile?: string;
  cookieName?: string;
}

export interface ResolvedConfig {
  environment: string;
  baseUrl: string;
  sessionDir: string;
  users: Record<string, UserConfig>;
}

function resolveSessionDir(): string {
  return (
    process.env.SESSION_DIR ??
    CONFIG.ui?.sessionDir ??
    path.resolve(process.cwd(), ".sessions")
  );
}

function parseUsersFromEnv(): Record<string, UserConfig> {
  const raw = process.env.TEST_USERS_JSON;
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null) {
      return parsed as Record<string, UserConfig>;
    }
  } catch {
    // fall back to config users
  }
  return {};
}

export function resolveConfig(): ResolvedConfig {
  const sessionDir = resolveSessionDir();
  const envUsers =
    (CONFIG.users?.[CONFIG.environment as keyof typeof CONFIG.users] as Record<string, UserConfig>) ?? {};
  const overrideUsers = parseUsersFromEnv();

  return {
    environment: CONFIG.environment,
    baseUrl: CONFIG.urls.xui,
    sessionDir,
    users: { ...envUsers, ...overrideUsers }
  };
}
