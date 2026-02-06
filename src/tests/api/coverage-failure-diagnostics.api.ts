import { test, expect } from "@playwright/test";

import {
  __test__ as failureDiagnosisTest,
  buildFailureDiagnosis,
} from "../../utils/diagnostics/failure-diagnosis.utils";

test.describe("Failure diagnosis utility coverage", () => {
  test("sanitizeUrlForLogs removes query, fragment, and userinfo", () => {
    expect(
      failureDiagnosisTest.sanitizeUrlForLogs(
        "https://user:pass@example.com/path?q=token#frag",
      ),
    ).toBe("https://example.com/path");
    expect(
      failureDiagnosisTest.sanitizeUrlForLogs("/api/user/details?token=abc"),
    ).toBe("/api/user/details");
    expect(
      failureDiagnosisTest.sanitizeUrlForLogs(
        "https://example.test/data/internal/cases/1770385378257233/event-triggers/updateCase?token=abc",
      ),
    ).toBe(
      "https://example.test/data/internal/cases/[REDACTED]/event-triggers/updateCase",
    );
  });

  test("sanitizeErrorText redacts token-like values and identifiers", () => {
    const sanitized = failureDiagnosisTest.sanitizeErrorText(
      "Bearer abc.def.ghi token=secret user=test.user@hmcts.net case=1770385378257233 id=123e4567-e89b-12d3-a456-426614174000 url=https://example.test/api/cases/1770385378257233?token=secret",
      800,
    );

    expect(sanitized).not.toContain("secret");
    expect(sanitized).not.toContain("test.user@hmcts.net");
    expect(sanitized).not.toContain("1770385378257233");
    expect(sanitized).not.toContain("123e4567-e89b-12d3-a456-426614174000");
    expect(sanitized).toContain("[REDACTED_EMAIL]");
    expect(sanitized).toContain("[REDACTED_ID]");
    expect(sanitized).toContain("[REDACTED_UUID]");
  });

  test("isBackendApiUrl detects backend calls and ignores static assets", () => {
    expect(
      failureDiagnosisTest.isBackendApiUrl(
        "https://service/api/user/details?foo=1",
      ),
    ).toBe(true);
    expect(
      failureDiagnosisTest.isBackendApiUrl(
        "https://service/assets/main.bundle.js?v=1",
      ),
    ).toBe(false);
  });

  test("classifyFailureType covers API, timeout, ui, assertion, and fallback", () => {
    expect(
      failureDiagnosisTest.classifyFailureType({
        errorMessage: "",
        serverErrors: [{ method: "GET", url: "/api/a", status: 500 }],
        clientErrors: [],
        slowCalls: [],
        networkFailures: [],
      }),
    ).toBe("DOWNSTREAM_API_5XX");

    expect(
      failureDiagnosisTest.classifyFailureType({
        errorMessage: "",
        serverErrors: [],
        clientErrors: [{ method: "GET", url: "/api/b", status: 403 }],
        slowCalls: [],
        networkFailures: [],
      }),
    ).toBe("DOWNSTREAM_API_4XX");

    expect(
      failureDiagnosisTest.classifyFailureType({
        errorMessage: "Timed out waiting for response",
        serverErrors: [],
        clientErrors: [],
        slowCalls: [{ method: "GET", url: "/api/c", durationMs: 7200 }],
        networkFailures: [],
      }),
    ).toBe("SLOW_API_RESPONSE");

    expect(
      failureDiagnosisTest.classifyFailureType({
        errorMessage: "waiting for locator('.govuk-button')",
        serverErrors: [],
        clientErrors: [],
        slowCalls: [],
        networkFailures: [],
      }),
    ).toBe("UI_ELEMENT_MISSING");

    expect(
      failureDiagnosisTest.classifyFailureType({
        errorMessage: "expect(received).toBe(200)",
        serverErrors: [],
        clientErrors: [],
        slowCalls: [],
        networkFailures: [],
      }),
    ).toBe("ASSERTION_FAILURE");

    expect(
      failureDiagnosisTest.classifyFailureType({
        errorMessage: "unexpected branch",
        serverErrors: [],
        clientErrors: [],
        slowCalls: [],
        networkFailures: [],
      }),
    ).toBe("UNKNOWN");
  });

  test("buildFailureDiagnosis returns odhin-ready annotations and sanitized payload", () => {
    const diagnosis = buildFailureDiagnosis({
      testTitle: "example failure",
      errorMessage:
        "Timeout calling https://example.test/api/cases?token=secret",
      apiErrors: [
        {
          method: "get",
          status: 500,
          url: "https://example.test/data/internal/cases/1770385378257233?token=secret",
        },
      ],
      slowCalls: [
        {
          method: "post",
          durationMs: 6300,
          url: "https://example.test/api/events?state=abc",
        },
      ],
      networkFailures: [
        {
          method: "get",
          reason: "net::ERR_TIMED_OUT",
          url: "https://example.test/api/user/details?code=123",
        },
      ],
      slowThresholdMs: 5000,
    });

    expect(diagnosis.failureType).toBe("DOWNSTREAM_API_5XX");
    expect(diagnosis.annotations.map((annotation) => annotation.type)).toEqual(
      expect.arrayContaining([
        "Failure type",
        "API errors",
        "Slow calls",
        "Network failures",
      ]),
    );
    expect(diagnosis.text).toContain("Failure type: DOWNSTREAM_API_5XX");
    expect(JSON.stringify(diagnosis.data)).not.toContain("token=secret");
    expect(JSON.stringify(diagnosis.data)).toContain("/cases/[REDACTED]");
  });
});
