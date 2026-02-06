import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

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
const resolveBranchName = (env: EnvMap) =>
  configModule.__test__.resolveBranchName(env);

type ReporterEntry = [string] | [string, Record<string, unknown>];
type ConfigShape = {
  workers?: number;
  reporter?: ReporterEntry[];
  use?: { baseURL?: string };
  projects?: Array<{
    name?: string;
    retries?: number;
    use?: { launchOptions?: { executablePath?: string } };
  }>;
};

const getReporters = (config: ConfigShape) => config.reporter ?? [];

const getProjects = (config: ConfigShape) => config.projects ?? [];
const getProjectByName = (config: ConfigShape, name: string) =>
  getProjects(config).find((project) => project.name === name);

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
      PW_UI_CHANNEL: "chrome",
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

    const apiProject = getProjects(shape).find(
      (project) => project.name === "api",
    );
    expect(apiProject).toBeDefined();
    expect(apiProject?.retries).toBe(1);
  });

  test("config defaults to local reporter values", () => {
    const config = buildConfig({
      CI: undefined,
      PLAYWRIGHT_REPORTERS: undefined,
      PLAYWRIGHT_DEFAULT_REPORTER: undefined,
      TEST_URL: undefined,
    });

    const shape = config as ConfigShape;
    const reporters = getReporters(shape);
    expect(reporters[0]?.[0]).toBe("list");
    expect(String(shape.use?.baseURL)).toContain("manage-case");
  });

  test("config supports explicit PLAYWRIGHT_DEFAULT_REPORTER and reporter options", () => {
    const config = buildConfig({
      PLAYWRIGHT_REPORTERS: undefined,
      PLAYWRIGHT_DEFAULT_REPORTER: "line,html,junit,custom",
      PLAYWRIGHT_HTML_OPEN: "always",
      PLAYWRIGHT_HTML_OUTPUT: "custom-html",
      PLAYWRIGHT_JUNIT_OUTPUT: "custom-junit.xml",
    });

    const shape = config as ConfigShape;
    const reporters = getReporters(shape);
    expect(reporters[0]?.[0]).toBe("line");
    expect(reporters[1]?.[0]).toBe("html");
    expect(reporters[2]?.[0]).toBe("junit");
    expect(reporters[3]?.[0]).toBe("custom");
    expect(readReporterConfig(reporters[1]).outputFolder).toBe("custom-html");
    expect(readReporterConfig(reporters[1]).open).toBe("always");
    expect(readReporterConfig(reporters[2]).outputFile).toBe(
      "custom-junit.xml",
    );
  });

  test("odhin reporter parses booleans and test output modes", () => {
    const truthy = buildConfig({
      PLAYWRIGHT_REPORTERS: "odhin",
      PW_ODHIN_START_SERVER: "yes",
      PW_ODHIN_CONSOLE_LOG: "0",
      PW_ODHIN_SIMPLE_CONSOLE_LOG: "on",
      PW_ODHIN_CONSOLE_ERROR: "off",
      PW_ODHIN_CONSOLE_TEST_OUTPUT: "1",
      PW_ODHIN_TEST_OUTPUT: "true",
    }) as ConfigShape;
    const truthyConfig = readReporterConfig(getReporters(truthy)[0]);
    expect(truthyConfig.startServer).toBe(true);
    expect(truthyConfig.consoleLog).toBe(false);
    expect(truthyConfig.simpleConsoleLog).toBe(true);
    expect(truthyConfig.consoleError).toBe(false);
    expect(truthyConfig.consoleTestOutput).toBe(true);
    expect(truthyConfig.testOutput).toBe(true);

    const falsy = buildConfig({
      PLAYWRIGHT_REPORTERS: "odhin",
      PW_ODHIN_TEST_OUTPUT: "false",
    }) as ConfigShape;
    expect(readReporterConfig(getReporters(falsy)[0]).testOutput).toBe(false);

    const explicitDefault = buildConfig({
      PLAYWRIGHT_REPORTERS: "odhin",
      PW_ODHIN_TEST_OUTPUT: "only-on-failure",
    }) as ConfigShape;
    expect(
      readReporterConfig(getReporters(explicitDefault)[0]).testOutput,
    ).toBe("only-on-failure");

    const invalidValue = buildConfig({
      PLAYWRIGHT_REPORTERS: "odhin",
      PW_ODHIN_TEST_OUTPUT: "invalid-value",
      PW_ODHIN_CONSOLE_LOG: "unexpected",
    }) as ConfigShape;
    const invalidConfig = readReporterConfig(getReporters(invalidValue)[0]);
    expect(invalidConfig.testOutput).toBe("only-on-failure");
    expect(invalidConfig.consoleLog).toBe(true);
  });

  test("branch resolver respects CI env precedence and normalisation", () => {
    expect(resolveBranchName({ CHANGE_BRANCH: "feature/EXUI-1" })).toBe(
      "feature/EXUI-1",
    );
    expect(resolveBranchName({ BRANCH_NAME: "origin/PR-4913" })).toBe(
      "PR-4913",
    );
    expect(resolveBranchName({ GITHUB_REF_NAME: "refs/heads/main" })).toBe(
      "main",
    );
  });

  test("odhin release uses resolved branch when explicit release not provided", () => {
    const config = buildConfig({
      PLAYWRIGHT_REPORTERS: "odhin",
      BRANCH_NAME: "origin/PR-4913",
      PLAYWRIGHT_REPORT_RELEASE: undefined,
      PW_ODHIN_RELEASE: undefined,
    });

    const shape = config as ConfigShape;
    const reporters = getReporters(shape);
    const odhinConfig = readReporterConfig(reporters[0]);
    expect(String(odhinConfig.release)).toContain("branch=PR-4913");
  });

  test("branch resolver falls back to local when git branch cannot be resolved", async () => {
    const tempCwd = await fs.mkdtemp(path.join(os.tmpdir(), "pw-branch-"));
    const originalCwd = process.cwd();
    try {
      process.chdir(tempCwd);
      expect(resolveBranchName({})).toBe("local");
    } finally {
      process.chdir(originalCwd);
      await fs.rm(tempCwd, { recursive: true, force: true });
    }
  });

  test("config omits launchOptions when chromium executable cannot be discovered", async () => {
    const emptyBrowsersCache = await fs.mkdtemp(
      path.join(os.tmpdir(), "pw-browsers-"),
    );
    try {
      const config = buildConfig({
        PLAYWRIGHT_BROWSERS_PATH: emptyBrowsersCache,
        PW_CHROMIUM_PATH: undefined,
      });
      const shape = config as ConfigShape;

      expect(getProjectByName(shape, "ui")?.use?.launchOptions).toBeUndefined();
      expect(
        getProjectByName(shape, "integration")?.use?.launchOptions,
      ).toBeUndefined();
      expect(
        getProjectByName(shape, "integration-nightly")?.use?.launchOptions,
      ).toBeUndefined();
    } finally {
      await fs.rm(emptyBrowsersCache, { recursive: true, force: true });
    }
  });
});
