import { test, expect } from "@playwright/test";

import {
  loadConfig,
  resolveConfigModule,
  type EnvMap,
  type TestableConfigModule,
} from "../../utils/api/playwrightConfigUtils";

let configModule: TestableConfigModule;

const buildConfig = (env: EnvMap) => configModule.__test__.buildConfig(env);
const resolveWorkerCount = (env: EnvMap) =>
  configModule.__test__.resolveWorkerCount(env);
const getReporterTuple = (
  reporter: unknown,
  name: string,
): [string, Record<string, unknown> | undefined] => {
  if (!Array.isArray(reporter)) {
    throw new TypeError("Unexpected reporter config shape");
  }
  const match = reporter.find(
    (entry) => Array.isArray(entry) && entry[0] === name,
  );
  if (!match || !Array.isArray(match)) {
    throw new TypeError(`Reporter "${name}" not found`);
  }
  const [, options] = match as [string, Record<string, unknown> | undefined];
  return [name, options];
};

const getReporterNames = (reporter: unknown): string[] => {
  if (!Array.isArray(reporter)) {
    throw new TypeError("Unexpected reporter config shape");
  }
  return reporter.map((entry) =>
    Array.isArray(entry) ? String(entry[0]) : String(entry),
  );
};

test.describe.configure({ mode: "serial" });

test.describe("Playwright config coverage", { tag: "@svc-internal" }, () => {
  test.beforeAll(async () => {
    configModule = await loadConfig();
  });

  test("resolveWorkerCount covers configured, CI, and default", async () => {
    const configured = resolveWorkerCount({
      PLAYWRIGHT_WORKERS: "4",
      CI: undefined,
    });
    expect(configured).toBe(4);

    const ciCount = resolveWorkerCount({
      PLAYWRIGHT_WORKERS: undefined,
      CI: "true",
    });
    expect(ciCount).toBe(1);

    const defaultCount = resolveWorkerCount({
      PLAYWRIGHT_WORKERS: undefined,
      CI: undefined,
    });
    expect(defaultCount).toBeGreaterThanOrEqual(1);
  });

  test("resolveConfigModule prefers __test__ and default exports", () => {
    const withTest = resolveConfigModule({
      __test__: {
        buildConfig: () => ({}),
        resolveWorkerCount: () => 1,
      },
      default: { name: "default" },
    });
    expect(withTest.__test__).toBeDefined();

    const withDefault = resolveConfigModule({ default: { name: "default" } });
    expect(withDefault.name).toBe("default");

    const plain = resolveConfigModule({ name: "plain" });
    expect(plain.name).toBe("plain");
  });

  test("config uses CI overrides, worker budgets, and env reporters", async () => {
    const config = buildConfig({
      CI: "true",
      PLAYWRIGHT_WORKERS: "8",
      PLAYWRIGHT_REPORTERS: "dot,odhin,junit",
      PLAYWRIGHT_REPORT_FOLDER: "custom-report",
      PLAYWRIGHT_REPORT_PROJECT: "Custom Project",
      PLAYWRIGHT_REPORT_RELEASE: "Custom Release",
      TEST_URL: "https://example.test",
    });
    const useConfig = config.use ?? {};
    const reporterConfig = config.reporter ?? [];
    const projectConfig = config.projects ?? [];
    const reporterNames = getReporterNames(reporterConfig);

    expect(config.workers).toBe(8);
    expect(useConfig.baseURL).toBe("https://example.test");
    expect(reporterNames[0]).toBe("dot");
    expect(reporterNames).toContain(
      "./scripts/reporters/flake-gate.reporter.cjs",
    );
    expect(reporterNames).toContain("junit");
    const [, odhinOptions] = getReporterTuple(
      reporterConfig,
      "odhin-reports-playwright",
    );
    expect(odhinOptions?.outputFolder).toBe("custom-report");
    expect(odhinOptions?.project).toBe("Custom Project");
    expect(odhinOptions?.release).toBe("Custom Release");
    expect(odhinOptions?.testEnvironment).toContain("ci");
    const uiProject = projectConfig.find((project) => project.name === "ui");
    const apiProject = projectConfig.find((project) => project.name === "api");
    expect(uiProject).toBeDefined();
    expect(uiProject?.workers).toBe(8);
    expect(uiProject?.use?.headless).toBe(true);
    expect(apiProject).toBeDefined();
    expect(apiProject?.workers).toBe(4);
  });

  test("config defaults to local reporter values", async () => {
    const config = buildConfig({
      CI: undefined,
      PLAYWRIGHT_REPORT_FOLDER: undefined,
      PLAYWRIGHT_REPORT_PROJECT: undefined,
      PLAYWRIGHT_REPORT_RELEASE: undefined,
      GIT_BRANCH: undefined,
      TEST_URL: undefined,
    });
    const reporterConfig = config.reporter ?? [];
    const useConfig = config.use ?? {};
    const reporterNames = getReporterNames(reporterConfig);

    expect(reporterNames[0]).toBe("list");
    expect(reporterNames).toContain(
      "./scripts/reporters/flake-gate.reporter.cjs",
    );
    expect(reporterNames).not.toContain("odhin-reports-playwright");
    expect(useConfig.baseURL).toContain("manage-case");
  });

  test("config uses branch from environment when provided", async () => {
    const config = buildConfig({
      PLAYWRIGHT_REPORTERS: "odhin",
      PLAYWRIGHT_REPORT_RELEASE: undefined,
      GIT_BRANCH: "feat/EXUI-3618-case-search-e2e",
    });
    const reporterConfig = config.reporter ?? [];
    const [, odhinOptions] = getReporterTuple(
      reporterConfig,
      "odhin-reports-playwright",
    );
    expect(odhinOptions?.release).toContain(
      "branch=feat/EXUI-3618-case-search-e2e",
    );
  });

  test("config resolves explicit UI and API worker overrides", () => {
    const config = buildConfig({
      PLAYWRIGHT_WORKERS: "10",
      PW_UI_WORKERS: "6",
      PW_API_WORKERS: "3",
    });
    const projectConfig = config.projects ?? [];
    const uiProject = projectConfig.find((project) => project.name === "ui");
    const apiProject = projectConfig.find((project) => project.name === "api");
    expect(config.workers).toBe(10);
    expect(uiProject?.workers).toBe(6);
    expect(apiProject?.workers).toBe(3);
  });
});
