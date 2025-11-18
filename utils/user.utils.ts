// This code block will need to be removed when the frameworks supports creating users on the fly
import { createRequire } from "node:module";

interface LegacyUser {
  userIdentifier: string;
  email: string;
  key?: string;
}

const require = createRequire(import.meta.url);
const legacyConfig = require("../config/appTestConfig.js") as {
  testEnv: string;
  users: Record<string, LegacyUser[]>;
};

export class UserUtils {
  public getUserCredentials(userIdentifier: string): {
    email: string;
    password: string;
  } {
    const envUsers = legacyConfig.users[legacyConfig.testEnv] ?? [];
    const user = envUsers.find((u) => u.userIdentifier === userIdentifier);

    if (!user || !user.key) {
      throw new Error(`User "${userIdentifier}" not found`);
    }

    return { email: user.email, password: user.key };
  }
}
