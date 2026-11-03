import { test as base, expect } from "@playwright/test";

import { CaseDetailsPage } from "../page-objects/pages/exui/caseDetails.po.js";
import { HearingsTabPage } from "../page-objects/pages/exui/hearingsTab.po.js";
import { HearingViewSummaryPage } from "../page-objects/pages/exui/hearingViewSummary.po.js";
import { acceptAnalyticsCookiesOnPage, installAnalyticsAutoAccept } from "../utils/ui/analytics.utils.js";

type DiagnosticFixtures = {
  caseDetailsPage: CaseDetailsPage;
  hearingsTabPage: HearingsTabPage;
  hearingViewSummaryPage: HearingViewSummaryPage;
  autoAcceptAnalytics: void;
};

// These diagnostics use explicit session helpers where needed. Do not issue
// automatic authenticated user-context requests for generated HTML/model pages.
export const test = base.extend<DiagnosticFixtures>({
  caseDetailsPage: async ({ page }, use) => { await use(new CaseDetailsPage(page)); },
  hearingsTabPage: async ({ page }, use) => { await use(new HearingsTabPage(page)); },
  hearingViewSummaryPage: async ({ page }, use) => { await use(new HearingViewSummaryPage(page)); },
  autoAcceptAnalytics: [async ({ page }, use) => {
    const handler = async () => { await acceptAnalyticsCookiesOnPage(page); };
    await installAnalyticsAutoAccept(page);
    page.on("domcontentloaded", handler);
    await acceptAnalyticsCookiesOnPage(page);
    await use(undefined);
    page.off("domcontentloaded", handler);
  }, { auto: true }]
});

export { expect };
