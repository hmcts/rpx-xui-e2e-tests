import { resolveConfig, type UserConfig } from "./config.js";

export class UserUtils {
  private readonly users: Record<string, UserConfig>;

  constructor() {
    this.users = resolveConfig().users;
  }

  public getUserCredentials(userIdentifier: string): UserConfig {
    const user = this.users[userIdentifier];
    if (!user) {
      throw new Error(`User "${userIdentifier}" not configured for environment.`);
    }
    return user;
  }
}
