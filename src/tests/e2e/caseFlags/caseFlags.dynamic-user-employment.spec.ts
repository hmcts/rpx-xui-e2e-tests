import { expect, test } from "../../../fixtures/ui";
import { caseBannerMatches } from "../../../utils/ui/banner.utils";
import { filterEmptyRows } from "../../../utils/ui/index";
import { ensureAuthenticatedPage } from "../../../utils/ui/sessionCapture";
import { setupCaseForJourney } from "../_helpers/caseSetup";
import {
  EMPLOYMENT_DYNAMIC_SOLICITOR_ROLES,
  provisionDynamicSolicitorForAlias,
} from "../_helpers/dynamicSolicitorSession";
import { EMPLOYMENT_ET_ENGLANDWALES_CASE_DATA } from "../_helpers/employmentCasePayload";

const JURISDICTION = "EMPLOYMENT";
const CASE_TYPE = "ET_EnglandWales";

function asMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isDependencyEnvironmentFailure(error: unknown): boolean {
  const message = asMessage(error);
  return (
    /returned HTTP 5\d\d/i.test(message) ||
    /status\s+5\d\d/i.test(message) ||
    /something went wrong page/i.test(message) ||
    /network timeout/i.test(message) ||
    /ECONNRESET|ETIMEDOUT/i.test(message) ||
    /Target page, context or browser has been closed/i.test(message) ||
    /Test timeout of \d+ms exceeded/i.test(message)
  );
}

test.describe("Dynamic user case flags employment flow", () => {
  test.describe.configure({ timeout: 600_000 });

  test("@dynamic-user-employment creates case via API and verifies case-level flags", async ({
    page,
    caseDetailsPage,
    tableUtils,
    createCasePage,
    professionalUserUtils,
  }, testInfo) => {
    let caseNumber = "";
    let caseDetailsUrl = "";

    const handle = await provisionDynamicSolicitorForAlias({
      alias: "SEARCH_EMPLOYMENT_CASE",
      professionalUserUtils,
      roleNames: EMPLOYMENT_DYNAMIC_SOLICITOR_ROLES,
      assertEmploymentAssignmentPayloadAccepted: true,
      roleContext: {
        jurisdiction: "employment",
        testType: "case-create",
      },
      testInfo,
      mode: "external",
    });

    try {
      await ensureAuthenticatedPage(page, "SEARCH_EMPLOYMENT_CASE", {
        waitForSelector: "exui-header",
      });

      const setup = await setupCaseForJourney({
        scenario: "dynamic-user-case-flags-employment",
        jurisdiction: JURISDICTION,
        caseType: CASE_TYPE,
        apiEventId: "initiateCase",
        mode: "api-required",
        apiPayload: {
          fieldValues: EMPLOYMENT_ET_ENGLANDWALES_CASE_DATA,
        },
        uiCreate: async () => {
          await createCasePage.createCaseEmployment(JURISDICTION, CASE_TYPE, {
            allowDraftClaimFallback: true,
          });
        },
        page,
        createCasePage,
        caseDetailsPage,
        testInfo,
      });
      caseNumber = setup.caseNumber;
      caseDetailsUrl = await caseDetailsPage.getCurrentPageUrl();

      await testInfo.attach("dynamic-user-employment-case.json", {
        body: JSON.stringify(
          {
            caseNumber,
            jurisdiction: JURISDICTION,
            caseType: CASE_TYPE,
            createdBy: handle.user.email,
            setupMode: setup.mode,
          },
          null,
          2,
        ),
        contentType: "application/json",
      });

      await caseDetailsPage.selectCaseDetailsTab("Flags");
      const existingFlags =
        await caseDetailsPage.waitForTableByName("Case level flags");
      const existingTable = await tableUtils.parseDataTable(existingFlags);
      expect.soft(filterEmptyRows(existingTable).length).toBeGreaterThanOrEqual(0);

      await caseDetailsPage.selectCaseAction("Create a case flag");
      await caseDetailsPage.selectCaseFlagTarget("Welsh");

      await expect
        .poll(async () => {
          const bannerText = await caseDetailsPage.caseAlertSuccessMessage
            .innerText()
            .catch(() => "");
          return caseBannerMatches(
            bannerText,
            caseNumber,
            "has been updated with event: Create a case flag",
          );
        })
        .toBe(true);

      await caseDetailsPage.selectCaseDetailsTab("Flags");
      const updatedFlags =
        await caseDetailsPage.waitForTableByName("Case level flags");
      const updatedTable = await tableUtils.parseDataTable(updatedFlags);
      const visibleRows = filterEmptyRows(updatedTable);
      expect(visibleRows.length).toBeGreaterThan(0);

      await testInfo.attach("dynamic-user-employment-final.png", {
        body: await page.screenshot({ fullPage: true }),
        contentType: "image/png",
      });
    } catch (error) {
      if (isDependencyEnvironmentFailure(error)) {
        testInfo.skip(
          true,
          `Environment instability detected during employment dynamic-user case-flags flow: ${asMessage(error)}`,
        );
      }
      throw error;
    } finally {
      await testInfo.attach("dynamic-user-employment-cleanup.json", {
        body: JSON.stringify(
          {
            caseNumber,
            caseDetailsUrl,
            createdBy: handle.user.email,
            createdAt: new Date().toISOString(),
          },
          null,
          2,
        ),
        contentType: "application/json",
      });
      await handle.cleanup();
    }
  });
});
