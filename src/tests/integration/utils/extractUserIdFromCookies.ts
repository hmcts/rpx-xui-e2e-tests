import { logger } from "../../e2e/utils/logger.utils.js";

export function extractUserIdFromCookies(cookies: Array<{ name?: string; value?: string }> | unknown): string | null {
  if (!Array.isArray(cookies)) {
    logger.info("extractUserIdFromCookies received a non-array cookies value", { hasUserId: false });
    return null;
  }

  const userIdCookie = cookies.find((cookie) => cookie.name === "__userid__");
  const userId = userIdCookie?.value ?? null;

  logger.info("extractUserIdFromCookies evaluated session cookies", {
    hasUserId: Boolean(userId),
    userIdLength: userId?.length ?? 0,
    cookieCount: cookies.length
  });

  return userId;
}
