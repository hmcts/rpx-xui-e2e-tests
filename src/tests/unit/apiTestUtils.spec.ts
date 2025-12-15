import { vi } from "vitest";

vi.mock("../api/auth.js", () => ({
  ensureStorageState: vi.fn(async () => "state.json"),
  getStoredCookie: vi.fn(async () => "token")
}));

const freshImport = async () => await import("../api/utils/apiTestUtils.js");

describe("apiTestUtils helpers", () => {
  it("expectStatus throws when status not allowed", async () => {
    const { expectStatus } = await freshImport();
    expect(() => expectStatus(500, [200])).toThrow();
  });

  it("buildXsrfHeaders returns header when cookie present", async () => {
    const { buildXsrfHeaders } = await freshImport();
    const headers = await buildXsrfHeaders("solicitor" as any);
    expect(headers["X-XSRF-TOKEN"]).toBe("token");
  });

  it("withRetry retries on retryable status then succeeds", async () => {
    const { withRetry } = await freshImport();
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls++;
        if (calls < 2) {
          return { status: 502 } as any;
        }
        return { status: 200 } as any;
      },
      { retries: 2 }
    );
    expect(result.status).toBe(200);
    expect(calls).toBe(2);
  });
});
