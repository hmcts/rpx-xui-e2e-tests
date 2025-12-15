import CONFIG from "../../../config/configManager.js";

type ApiUser = { e: string; sec: string };
type ApiUsersByEnv = Record<string, Record<string, ApiUser>>;

function parseJsonEnv<T>(envVar: string, fallback: T): T {
  const raw = process.env[envVar];
  if (!raw) {
    return fallback;
  }
  try {
    const parsed = JSON.parse(raw) as T;
    return parsed;
  } catch {
    return fallback;
  }
}

function normaliseUser(user: any): ApiUser | undefined {
  if (typeof user !== "object" || user === null) {
    return undefined;
  }
  const username = user.username ?? user.email ?? user.e;
  const password = user.password ?? user.key ?? user.sec;
  if (!username || !password) {
    return undefined;
  }
  return { e: username, sec: password };
}

function deriveUsersFromEnv(): ApiUsersByEnv {
  const envUsers = parseJsonEnv<Record<string, Record<string, unknown>>>(
    "API_USERS_JSON",
    parseJsonEnv<Record<string, Record<string, unknown>>>("TEST_USERS_JSON", {})
  );
  const normalised: ApiUsersByEnv = {};

  Object.entries(envUsers).forEach(([envKey, users]) => {
    if (typeof users !== "object" || users === null) {
      return;
    }
    Object.entries(users).forEach(([role, user]) => {
      const creds = normaliseUser(user);
      if (!creds) {
        return;
      }
      if (!normalised[envKey]) {
        normalised[envKey] = {};
      }
      normalised[envKey][role] = creds;
    });
  });

  return normalised;
}

function deriveUsersFromLegacyEnv(testEnv: string): ApiUsersByEnv {
  const users: ApiUsersByEnv = {};
  const maybeAdd = (role: string, userEnv: string, passEnv: string) => {
    const username = process.env[userEnv];
    const password = process.env[passEnv];
    if (username && password) {
      users[testEnv] = users[testEnv] ?? {};
      users[testEnv][role] = { e: username, sec: password };
    }
  };

  // Common env vars present in legacy .env files
  maybeAdd("solicitor", "CASEMANAGER_USERNAME", "CASEMANAGER_PASSWORD");
  maybeAdd("staff_admin", "STAFF_ADMIN_USERNAME", "STAFF_ADMIN_PASSWORD");
  maybeAdd("judge", "JUDGE_USERNAME", "JUDGE_PASSWORD");

  return users;
}

function deriveUsersFromConfig(): ApiUsersByEnv {
  const normalised: ApiUsersByEnv = {};
  Object.entries(CONFIG.users ?? {}).forEach(([envKey, users]) => {
    if (typeof users !== "object" || users === null) {
      return;
    }
    Object.entries(users as Record<string, unknown>).forEach(([role, user]) => {
      const creds = normaliseUser(user);
      if (!creds) {
        return;
      }
      if (!normalised[envKey]) {
        normalised[envKey] = {};
      }
      normalised[envKey][role] = creds;
    });
  });
  return normalised;
}

const baseUrl = process.env.API_URL ?? CONFIG.urls.api;
const testEnv = process.env.TEST_ENV ?? CONFIG.environment ?? "aat";

const usersByEnv: ApiUsersByEnv = {
  aat: {},
  demo: {},
  ...deriveUsersFromConfig(),
  ...deriveUsersFromEnv(),
  ...deriveUsersFromLegacyEnv(testEnv)
};

export const config = {
  baseUrl,
  testEnv,
  jurisdictions: parseJsonEnv<Record<string, Array<{ id: string; caseTypeIds: string[] }>>>(
    "API_JURISDICTIONS_JSON",
    { aat: [], demo: [] }
  ),
  jurisdictionNames: parseJsonEnv<Record<string, string[]>>("API_JURISDICTION_NAMES_JSON", {
    aat: [],
    demo: []
  }),
  em: parseJsonEnv<Record<string, { docId?: string }>>("EM_DOC_IDS_JSON", {
    aat: { docId: process.env.EM_DOC_ID ?? "" },
    demo: { docId: process.env.EM_DOC_ID ?? "" }
  }),
  users: usersByEnv,
  configurationUi: parseJsonEnv<Record<string, string[]>>("API_CONFIGURATION_UI_KEYS_JSON", {
    aat: [],
    demo: []
  }),
  workallocation: parseJsonEnv<
    Record<string, { locationId?: string; iaCaseIds?: string[]; judgeUser?: { email?: string; id?: string; name?: string }; legalOpsUser?: { email?: string; id?: string; name?: string } }>
  >("API_WORKALLOCATION_JSON", {
    aat: { locationId: "", iaCaseIds: [] },
    demo: { locationId: "", iaCaseIds: [] }
  })
};

export default config;
