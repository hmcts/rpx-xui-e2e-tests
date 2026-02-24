const BACKEND_API_PATH_HINTS = [
  "/api/",
  "/data/",
  "/auth/",
  "/workallocation/",
  "/aggregated/",
  "/caseworkers/",
];

const STATIC_ASSET_PATTERN =
  /\.(?:css|js|map|png|jpe?g|gif|svg|ico|woff2?|ttf|eot)(?:$|[?#])/i;
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const UUID_PATTERN =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const LONG_NUMERIC_ID_PATTERN = /\b\d{8,}\b/g;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+){2}\b/g;
const BEARER_TOKEN_PATTERN = /\b[Bb]earer\s+[A-Za-z0-9\-._~+/]+=*/g;
const SECRET_KEY_VALUE_PATTERN =
  /\b(password|passwd|secret|token|client_secret|code|state)\b\s*[:=]\s*[^,\s;]+/gi;
const QUERY_SECRET_PATTERN =
  /([?&](?:code|token|state|password|secret)=)[^&#\s]+/gi;

const PATH_UUID_SEGMENT_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PATH_LONG_NUMERIC_SEGMENT_PATTERN = /^\d{8,}$/;
const PATH_LONG_TOKEN_SEGMENT_PATTERN = /^[A-Za-z0-9_-]{24,}$/;
const PATH_EMAIL_SEGMENT_PATTERN = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;

const DEFAULT_TEXT_LIMIT = 300;

export const truncate = (value: string, maxLength: number): string =>
  value.length <= maxLength ? value : `${value.slice(0, maxLength - 3)}...`;

const redactPathSegment = (segment: string): string => {
  if (
    PATH_UUID_SEGMENT_PATTERN.test(segment) ||
    PATH_LONG_NUMERIC_SEGMENT_PATTERN.test(segment) ||
    PATH_LONG_TOKEN_SEGMENT_PATTERN.test(segment) ||
    PATH_EMAIL_SEGMENT_PATTERN.test(segment)
  ) {
    return "[REDACTED]";
  }
  return segment;
};

const sanitizePathValue = (value: string): string =>
  value
    .split("/")
    .map((segment) => redactPathSegment(segment))
    .join("/");

const redactSensitiveText = (value: string): string =>
  value
    .replace(BEARER_TOKEN_PATTERN, "Bearer [REDACTED]")
    .replace(JWT_PATTERN, "[REDACTED_JWT]")
    .replace(SECRET_KEY_VALUE_PATTERN, "$1=[REDACTED]")
    .replace(QUERY_SECRET_PATTERN, "$1[REDACTED]")
    .replace(EMAIL_PATTERN, "[REDACTED_EMAIL]")
    .replace(UUID_PATTERN, "[REDACTED_UUID]")
    .replace(LONG_NUMERIC_ID_PATTERN, "[REDACTED_ID]");

export const sanitizeUrlForLogs = (urlValue: string): string => {
  try {
    const parsed = new URL(urlValue);
    return `${parsed.origin}${sanitizePathValue(parsed.pathname)}`;
  } catch {
    return sanitizePathValue(urlValue.replace(/[?#].*$/, ""));
  }
};

export const sanitizeErrorText = (
  value: string,
  maxLength = DEFAULT_TEXT_LIMIT,
): string =>
  truncate(
    redactSensitiveText(
      value.replace(/https?:\/\/[^\s)]+/gi, (urlMatch) =>
        sanitizeUrlForLogs(urlMatch),
      ),
    ),
    maxLength,
  );

export const isBackendApiUrl = (url: string): boolean => {
  const lower = url.toLowerCase();
  if (STATIC_ASSET_PATTERN.test(lower)) {
    return false;
  }
  return BACKEND_API_PATH_HINTS.some((fragment) => lower.includes(fragment));
};
