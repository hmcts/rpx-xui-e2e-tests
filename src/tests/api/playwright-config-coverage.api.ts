import { test, expect } from "@playwright/test";

import {
  loadConfig,
  resolveConfigModule,
  type EnvMap,
  type TestableConfigModule
} from "../../utils/api/playwrightConfigUtils";

let configModule: TestableConfigModule;

const buildConfig = (env: EnvMap) => configModule.__test__.buildConfig(env);
const resolveWorkerCount = (env: EnvMap) => configModule.__test__.resolveWorkerCount(env);

type ReporterEntry = [string] | [string, Record<string, unknown>];
type ConfigShape = {
  workers?: number;
  reporter?: ReporterEntry[];
  use?: { baseURL?: string };
  projects?: Array<{ name?: string; retries?: number }>;
};

const getReporters = (config: ConfigShape) => config.reporter ?? [];

const getProjects = (config: ConfigShape) => config.projects ?? [];

const readReporterConfig = (reporter: ReporterEntry | undefined) => {
  if (!reporter || reporter.length < 2) {
    return {};
  }
  return reporter[1] as Record<string, unknown>;
};

test.describe.configure({ mode: "serial" });

test.describe("Playwright config coverage", () => {
  test.beforeAll(async () => {
    configModule = await loadConfig();
  });

  test("resolveWorkerCount covers configured, CI, and default", () => {
    const configured = resolveWorkerCount({ PLAYWRIGHT_WORKERS: "4", CI: undefined });
    expect(configured).toBe(4);

    const ciCount = resolveWorkerCount({ PLAYWRIGHT_WORKERS: undefined, CI: "true" });
    expect(ciCount).toBe(1);

    const defaultCount = resolveWorkerCount({ PLAYWRIGHT_WORKERS: undefined, CI: undefined });
    expect(defaultCount).toBeGreaterThanOrEqual(1);
  });

  test("resolveConfigModule prefers __test__ and default exports", () => {
    const withTest = resolveConfigModule({
      __test__: {
        buildConfig: () => ({}),
        resolveWorkerCount: () => 1
      },
      default: { name: "default" }
    });
    expect(withTest.__test__).toBeDefined();

    const withDefault = resolveConfigModule({ default: { name: "default" } });
    expect(withDefault.name).toBe("default");

    const plain = resolveConfigModule({ name: "plain" });
    expect(plain.name).toBe("plain");
  });

  test("config uses CI overrides and env reporters", () => {
    const config = buildConfig({
      CI: "true",
      PLAYWRIGHT_REPORTERS: "dot,odhin",
      PLAYWRIGHT_REPORT_FOLDER: "custom-report",
      PW_ODHIN_OUTPUT: "legacy-report",
      PW_ODHIN_PROJECT: "Custom Project",
      PLAYWRIGHT_REPORT_PROJECT: "Alt Project",
      PW_ODHIN_RELEASE: "Custom Release",
      PLAYWRIGHT_REPORT_RELEASE: "Alt Release",
      TEST_URL: "https://example.test",
      PW_UI_CHANNEL: "chrome"
    });

    const shape = config as ConfigShape;
    const reporters = getReporters(shape);
    const odhinConfig = readReporterConfig(reporters[1]);

    expect(shape.workers).toBe(1);
    expect(shape.use?.baseURL).toBe("https://example.test");
    expect(reporters[0]?.[0]).toBe("dot");
    expect(odhinConfig.outputFolder).toBe("custom-report");
    expect(odhinConfig.project).toBe("Alt Project");
    expect(odhinConfig.release).toBe("Alt Release");
    expect(String(odhinConfig.testEnvironment)).toContain("ci");

    const apiProject = getProjects(shape).find((project) => project.name === "api");
    expect(apiProject).toBeDefined();
    expect(apiProject?.retries).toBe(1);
  });

  test("config defaults to local reporter values", () => {
    const config = buildConfig({
      CI: undefined,
      PLAYWRIGHT_REPORTERS: undefined,
      PLAYWRIGHT_DEFAULT_REPORTER: undefined,
      TEST_URL: undefined
    });

    const shape = config as ConfigShape;
    const reporters = getReporters(shape);
    expect(reporters[0]?.[0]).toBe("list");
    expect(String(shape.use?.baseURL)).toContain("manage-case");
  });
});
