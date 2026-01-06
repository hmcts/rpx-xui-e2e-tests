import {
  ApiClient,
  createLogger,
  ExuiMediaViewerPage,
  IdamPage,
  type ApiLogEntry
} from "@hmcts/playwright-common";
import type {
  Page,
  PlaywrightTestArgs,
  PlaywrightTestOptions,
  PlaywrightWorkerArgs,
  PlaywrightWorkerOptions,
  TestInfo,
  WorkerInfo,
} from "@playwright/test";

import { CaseDetailsPage } from "./exui/caseDetails.po";
import { CaseListPage } from "./exui/caseList.po";
import { CreateCasePage } from "./exui/createCase.po";
import { TaskListPage } from "./exui/taskList.po";

export interface PageFixtures {
  determinePage: Page;
  caseDetailsPage: CaseDetailsPage;
  caseListPage: CaseListPage;
  taskListPage: TaskListPage;
  createCasePage: CreateCasePage;
  mediaViewerPage: ExuiMediaViewerPage;
  idamPage: IdamPage;
  apiClient: ApiClient;
  logger: ReturnType<typeof createLogger>;
  capturedCalls: ApiLogEntry[];
}

type FixtureArgs = PageFixtures &
  PlaywrightTestArgs &
  PlaywrightTestOptions &
  PlaywrightWorkerArgs &
  PlaywrightWorkerOptions;

/* Instantiates pages and provides page to the test via use()
 * can also contain steps before or after providing the page.
 * This is the same behaviour as a beforeEach/afterEach hook
 */
export const pageFixtures = {
  determinePage: async ({ page }: FixtureArgs, use: (page: Page) => Promise<void>) => {
    await use(page);
  },
  caseDetailsPage: async (
    { determinePage }: FixtureArgs,
    use: (page: CaseDetailsPage) => Promise<void>
  ) => {
    await use(new CaseDetailsPage(determinePage));
  },
  caseListPage: async (
    { determinePage }: FixtureArgs,
    use: (page: CaseListPage) => Promise<void>
  ) => {
    await use(new CaseListPage(determinePage));
  },
  taskListPage: async (
    { determinePage }: FixtureArgs,
    use: (page: TaskListPage) => Promise<void>
  ) => {
    await use(new TaskListPage(determinePage));
  },
  createCasePage: async (
    { determinePage }: FixtureArgs,
    use: (page: CreateCasePage) => Promise<void>
  ) => {
    await use(new CreateCasePage(determinePage));
  },
  mediaViewerPage: async (
    { determinePage }: FixtureArgs,
    use: (page: ExuiMediaViewerPage) => Promise<void>
  ) => {
    await use(new ExuiMediaViewerPage(determinePage));
  },
  idamPage: async (
    { determinePage }: FixtureArgs,
    use: (page: IdamPage) => Promise<void>
  ) => {
    await use(new IdamPage(determinePage));
  },
  logger: async (
    { request }: FixtureArgs,
    use: (logger: ReturnType<typeof createLogger>) => Promise<void>,
    workerInfo: WorkerInfo
  ) => {
    void request;
    const logger = createLogger({
      serviceName: "case-service-ui",
      defaultMeta: { workerId: workerInfo.workerIndex },
    });
    await use(logger);
  },
  capturedCalls: async (
    { request }: FixtureArgs,
    use: (calls: ApiLogEntry[]) => Promise<void>
  ) => {
    void request;
    const calls: ApiLogEntry[] = [];
    await use(calls);
  },
  apiClient: async (
    { logger, capturedCalls }: FixtureArgs,
    use: (client: ApiClient) => Promise<void>,
    testInfo: TestInfo
  ) => {
    const client = new ApiClient({
      baseUrl: process.env.BACKEND_BASE_URL,
      logger,
      onResponse: (entry) => capturedCalls.push(entry),
      captureRawBodies: process.env.PLAYWRIGHT_DEBUG_API === "1",
    });

    await use(client);
    await client.dispose();

    if (capturedCalls.length) {
      await testInfo.attach("api-calls.json", {
        body: JSON.stringify(capturedCalls, null, 2),
        contentType: "application/json",
      });
    }
  },
};
