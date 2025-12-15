type AuthenticatedRoute = { endpoint: string };

function parseRoutesFromEnv(): AuthenticatedRoute[] {
  const raw = process.env.AUTHENTICATED_ROUTES_JSON;
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .map((entry) =>
          typeof entry === "string" ? { endpoint: entry } : entry
        )
        .filter((entry): entry is AuthenticatedRoute => Boolean(entry?.endpoint));
    }
  } catch {
    // swallow and fall back to defaults
  }
  return [];
}

export const authenticatedRoutes: AuthenticatedRoute[] = [
  { endpoint: "auth/isAuthenticated" },
  ...parseRoutesFromEnv()
];
