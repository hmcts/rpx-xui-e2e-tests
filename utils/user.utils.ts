import { createRequire } from "node:module";

type LegacyConfig =
  | {
      testEnv: string;
      users: Record<
        string,
        {
          userIdentifier: string;
          email: string;
          key?: string;
        }[]
      >;
    }
  | undefined;

const require = createRequire(import.meta.url);

const userEnvAliases: Record<string, { usernameKey: string; passwordKey: string }> = {
  caseManager: { usernameKey: "CASEMANAGER_USERNAME", passwordKey: "CASEMANAGER_PASSWORD" },
  judge: { usernameKey: "JUDGE_USERNAME", passwordKey: "JUDGE_PASSWORD" },
  SOLICITOR: { usernameKey: "SOLICITOR_USERNAME", passwordKey: "SOLICITOR_PASSWORD" },
};

const legacyConfig: LegacyConfig = (() => {
  try {
    return require("../config/appTestConfig.js") as LegacyConfig;
  } catch {
    return undefined;
  }
})();

const buildDynamicEnvKeys = (
  userIdentifier: string,
): {
  usernameKey: string;
  passwordKey: string;
} => {
  const normalised = userIdentifier.toUpperCase().replace(/[^A-Z0-9]/g, "_");
  return {
    usernameKey: `USER_${normalised}_USERNAME`,
    passwordKey: `USER_${normalised}_PASSWORD`,
  };
};

const resolveEnvCredentials = (
  identifier: string,
): { email: string; password: string } | undefined => {
  const mapping =
    userEnvAliases[identifier] ??
    userEnvAliases[identifier.toUpperCase()] ??
    buildDynamicEnvKeys(identifier);
  const username = process.env[mapping.usernameKey];
  const password = process.env[mapping.passwordKey];
  if (username && password) {
    return { email: username, password };
  }
  return undefined;
};

export class UserUtils {
  public getUserCredentials(userIdentifier: string): {
    email: string;
    password: string;
  } {
    const envCredentials = resolveEnvCredentials(userIdentifier);
    if (envCredentials) {
      return envCredentials;
    }

    if (legacyConfig) {
      const envUsers = legacyConfig.users[legacyConfig.testEnv] ?? [];
      const user = envUsers.find((u) => u.userIdentifier === userIdentifier);
      if (user?.key) {
        return { email: user.email, password: user.key };
      }
    }

    const fallbackKeys = buildDynamicEnvKeys(userIdentifier);
    throw new Error(
      `User "${userIdentifier}" not configured. Set ${fallbackKeys.usernameKey} and ${fallbackKeys.passwordKey} in your environment.`,
    );
  }
}
