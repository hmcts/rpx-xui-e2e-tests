import { ExuiMediaViewerPage, IdamPage } from "@hmcts/playwright-common";
import { Page, type TestInfo } from "@playwright/test";

import { CaseDetailsPage } from "./exui/caseDetails.po.ts";
import { CaseListPage } from "./exui/caseList.po.ts";
import { CreateCasePage } from "./exui/createCase.po.ts";

export interface PageFixtures {
  determinePage: Page;
  caseDetailsPage: CaseDetailsPage;
  caseListPage: CaseListPage;
  createCasePage: CreateCasePage;
  mediaViewerPage: ExuiMediaViewerPage;
  idamPage: IdamPage;
}

/* Instantiates pages and provides page to the test via use()
 * can also contain steps before or after providing the page.
 * This is the same behaviour as a beforeEach/afterEach hook
 */
export const pageFixtures = {
  // If a performance test is executed, use the lighthouse created page instead
  determinePage: async (
    { page, lighthousePage }: { page: Page; lighthousePage: Page },
    use: (p: Page) => Promise<void>,
    testInfo: TestInfo
  ) => {
    if (testInfo.tags.includes("@performance")) {
      await use(lighthousePage);
    } else {
      await use(page);
    }
  },
  caseDetailsPage: async (
    { determinePage }: { determinePage: Page },
    use: (value: CaseDetailsPage) => Promise<void>
  ) => {
    await use(new CaseDetailsPage(determinePage));
  },
  caseListPage: async (
    { determinePage }: { determinePage: Page },
    use: (value: CaseListPage) => Promise<void>
  ) => {
    await use(new CaseListPage(determinePage));
  },
  createCasePage: async (
    { determinePage }: { determinePage: Page },
    use: (value: CreateCasePage) => Promise<void>
  ) => {
    await use(new CreateCasePage(determinePage));
  },
  mediaViewerPage: async (
    { determinePage }: { determinePage: Page },
    use: (value: ExuiMediaViewerPage) => Promise<void>
  ) => {
    await use(new ExuiMediaViewerPage(determinePage));
  },
  idamPage: async (
    { determinePage }: { determinePage: Page },
    use: (value: IdamPage) => Promise<void>
  ) => {
    await use(new IdamPage(determinePage));
  },
};
