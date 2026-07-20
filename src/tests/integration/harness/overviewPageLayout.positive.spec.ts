import { expect, test } from "../../../fixtures/ui";
import { attachAccessibilityEvidence, attachUiScreenshotEvidence } from "../../../utils/ui/test-evidence.utils.js";
import {
  applySessionCookies,
  caseDetailsUrl,
  HEARING_MANAGER_CR84_ON_USER,
  setupHearingsMockRoutes,
} from "../helpers/index.js";
import { buildAsylumCaseMock } from "../mocks/cases/asylumCase.mock.js";

const overviewCaseConfig = {
  caseReference: "1701861283367022",
  jurisdictionId: "IA",
  caseTypeId: "Asylum",
  serviceId: "BFA1",
};
const overviewUserRoles = [
  "caseworker",
  "caseworker-ia",
  "caseworker-ia-admofficer",
  "caseworker-ia-homeofficeapc",
];

async function openOverviewCaseDetails({
  page,
  caseDetailsPage,
}: {
  page: Parameters<typeof applySessionCookies>[0];
  caseDetailsPage: { waitForReady: () => Promise<void> };
}): Promise<void> {
  await applySessionCookies(page, HEARING_MANAGER_CR84_ON_USER);
  await setupHearingsMockRoutes(page, {
    userRoles: overviewUserRoles,
    caseConfig: overviewCaseConfig,
    caseDetailsBody: buildAsylumCaseMock({
      caseId: overviewCaseConfig.caseReference,
      caseTypeId: overviewCaseConfig.caseTypeId,
      jurisdictionId: overviewCaseConfig.jurisdictionId,
    }),
    hearings: [],
  });

  await page.goto(
    caseDetailsUrl(
      overviewCaseConfig.jurisdictionId,
      overviewCaseConfig.caseTypeId,
      overviewCaseConfig.caseReference
    ),
    { waitUntil: "domcontentloaded" }
  );
  await caseDetailsPage.waitForReady();
  await expect(page.getByRole("tab", { name: /^Overview\b/ })).toBeVisible();
}

test.describe("EXUI assurance harness overview layout", { tag: ["@integration", "@integration-harness"] }, () => {
  test("overview route keeps agreed IA heading, tab, and key field layout", async ({
    page,
    caseDetailsPage,
  }, testInfo) => {
    await openOverviewCaseDetails({ page, caseDetailsPage });

    await expect(page.getByRole("heading", { name: "1701-8612-8336-7022" })).toBeVisible();
    await expect(page.getByRole("tab", { name: /^Overview\b/ })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tabpanel", { name: /^Overview\b/ })).toBeVisible();
    await expect(page.getByText("Appeal reference number")).toBeVisible();
    await expect(page.getByText("PA/50001/2024")).toBeVisible();
    await expect(page.getByText("Journey type")).toBeVisible();
    await expect(page.getByText("Submission out of time")).toBeVisible();

    await attachUiScreenshotEvidence(testInfo, page, "exui-assurance-overview-layout.png");
  });

  test("accessibility baseline: IA overview case details has no new axe violations", async ({
    page,
    caseDetailsPage,
  }, testInfo) => {
    await openOverviewCaseDetails({ page, caseDetailsPage });

    await attachAccessibilityEvidence(testInfo, page, "Overview layout accessibility report", {
      knownViolations: [
        {
          id: "landmark-one-main",
          maxNodes: 1,
        },
        {
          id: "page-has-heading-one",
          maxNodes: 1,
        },
        {
          id: "region",
          maxNodes: 4,
        },
        {
          id: "scope-attr-valid",
          maxNodes: 3,
        },
      ],
    });
    await attachUiScreenshotEvidence(testInfo, page, "exui-assurance-overview-layout-a11y.png");
  });
});
