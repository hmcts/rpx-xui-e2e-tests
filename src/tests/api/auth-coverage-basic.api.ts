import { test, expect } from "@playwright/test";

import { config } from "../../config/api";
import {
  __test__ as authTest,
  type ApiUserRole,
} from "../../fixtures/api-auth";

test.describe("Auth helper coverage - basic utilities", () => {
  test("extractCsrf parses token and returns undefined when missing", () => {
    expect(authTest.extractCsrf('<input name="_csrf" value="token">')).toBe(
      "token",
    );
    expect(authTest.extractCsrf("<html></html>")).toBeUndefined();
  });

  test("stripTrailingSlash removes trailing slashes", () => {
    expect(authTest.stripTrailingSlash("https://example.com///")).toBe(
      "https://example.com",
    );
  });

  test("getCacheKey includes test environment", () => {
    expect(authTest.getCacheKey("solicitor")).toBe(
      `${config.testEnv}-solicitor`,
    );
  });

  test("getCredentials returns configured users and errors on unknown roles", () => {
    const creds = authTest.getCredentials("solicitor");
    expect(typeof creds.username).toBe("string");
    expect(typeof creds.password).toBe("string");
    expect(() => authTest.getCredentials("unknown" as ApiUserRole)).toThrow(
      "No credentials configured",
    );
  });

  test("formatUnknownError redacts sensitive values", () => {
    const formatted = authTest.formatUnknownError(
      new Error("Bearer abc123 password=super-secret email=user@example.com"),
    );
    expect(formatted).toContain("Bearer [REDACTED]");
    expect(formatted).toContain("password=[REDACTED]");
    expect(formatted).toContain("[REDACTED_EMAIL]");
    expect(formatted).not.toContain("super-secret");
    expect(formatted).not.toContain("user@example.com");
  });
});
