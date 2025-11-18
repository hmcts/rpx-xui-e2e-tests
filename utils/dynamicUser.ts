import { environment } from "@config/index";

export interface TempUser {
  username: string;
  password: string;
  idamId?: string;
}

interface CreateUserOptions {
  role: "solicitor" | "caseworker" | "judge" | string;
  prefix?: string;
}

// Placeholder implementation. In production, this would POST to
// environment.idamTestingSupportUrl or IDAM_TESTING_SUPPORT_USERS_URL.
export async function createTempUser({ role, prefix = "auto" }: CreateUserOptions): Promise<TempUser> {
  const base = `${prefix}-${role}-${Date.now()}@example.test`; // synthetic email
  const password = `P@ssw0rd${Math.floor(Math.random() * 10000)}`;
  // TODO: integrate with IDAM testing support API:
  // await fetch(`${process.env.IDAM_TESTING_SUPPORT_USERS_URL}`, { method: 'POST', body: JSON.stringify({...}) })
  return { username: base, password };
}

// Fallback helper to use existing static credentials while migrating.
export function getStaticRoleUser(role: string): TempUser | undefined {
  switch (role) {
    case "caseManager":
      return { username: environment.caseManager.username, password: environment.caseManager.password };
    case "judge":
      return { username: environment.judge.username, password: environment.judge.password };
    default:
      return undefined;
  }
}
