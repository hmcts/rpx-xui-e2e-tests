export function extractUserIdFromCookies(
  cookies: Array<{ name?: string; value?: string }>,
): string | null {
  if (!Array.isArray(cookies)) return null;
  const userIdCookie = cookies.find((cookie) => cookie.name === "__userid__");
  return userIdCookie?.value ?? null;
}
