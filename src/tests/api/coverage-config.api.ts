import { test, expect } from "@playwright/test";

import { __test__ as apiConfigTest } from "../../config/api";
import { withEnv } from "../../utils/api/testEnv";
import uiConfig, { __test__ as uiConfigTest } from "../../utils/ui/config.utils";

test.describe.configure({ mode: "serial" });

test.describe("Configuration resolution coverage", () => {
  test("api config helpers resolve env values", () => {
    expect(apiConfigTest.resolveBaseUrl(undefined)).toBe("https://manage-case.aat.platform.hmcts.net/");
    expect(apiConfigTest.resolveBaseUrl("https://example.test")).toBe("https://example.test/");

    expect(apiConfigTest.resolveTestEnv(undefined)).toBe("aat");
    expect(apiConfigTest.resolveTestEnv("demo")).toBe("demo");
    expect(apiConfigTest.resolveTestEnv("aat")).toBe("aat");
    expect(apiConfigTest.resolveTestEnv("prod")).toBe("aat");
  });

  test("ui config helpers resolve env values", async () => {
    expect(uiConfigTest.resolveUrl("https://override", "https://fallback")).toBe("https://override");
    expect(uiConfigTest.resolveUrl(undefined, "https://fallback")).toBe("https://fallback");

    await withEnv({ CONFIG_TEST_VAR: "value" }, () => {
      expect(uiConfigTest.getEnvVar("CONFIG_TEST_VAR")).toBe("value");
    });

    await withEnv({ CONFIG_TEST_VAR: undefined }, () => {
      expect(() => uiConfigTest.getEnvVar("CONFIG_TEST_VAR")).toThrow("CONFIG_TEST_VAR");
    });

    expect(typeof uiConfig.urls.exuiDefaultUrl).toBe("string");
    expect(uiConfig.urls.exuiDefaultUrl.length).toBeGreaterThan(0);
  });

  test("withEnv restores pre-existing variables", async () => {
    process.env.CONFIG_TEST_VAR_RESTORE = "existing";
    await withEnv({ CONFIG_TEST_VAR_RESTORE: "override" }, () => {
      expect(process.env.CONFIG_TEST_VAR_RESTORE).toBe("override");
    });
    expect(process.env.CONFIG_TEST_VAR_RESTORE).toBe("existing");
    delete process.env.CONFIG_TEST_VAR_RESTORE;
  });
});
