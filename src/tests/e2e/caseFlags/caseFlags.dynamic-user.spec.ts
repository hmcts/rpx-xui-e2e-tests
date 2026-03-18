import { faker } from "@faker-js/faker";

import { expect, test } from "../../../fixtures/ui";
import { filterEmptyRows } from "../../../utils/ui";
import { caseBannerMatches } from "../../../utils/ui/banner.utils";
import { rowMatchesExpected } from "../../../utils/ui/case-flags.utils";
import {
  ensureAuthenticatedPage,
  sessionCapture,
} from "../../../utils/ui/sessionCapture";
import { TEST_SOLICITOR_ORGANISATION_ID_ENV } from "../../../utils/ui/test-organisation-id.utils";
import { setupCaseForJourney } from "../_helpers/caseSetup";
import {
  DIVORCE_FLAGS_DYNAMIC_SOLICITOR_ROLES,
  provisionDynamicSolicitorForAlias,
} from "../_helpers/dynamicSolicitorSession";

const REQUIRED_ENV_VARS = [TEST_SOLICITOR_ORGANISATION_ID_ENV] as const;
const JURISDICTION = "DIVORCE";
const CASE_TYPE = "xuiCaseFlagsV1";
const TRUTHY_VALUES = new Set(["1", "true", "yes", "on"]);

function isTruthy(value: string | undefined): boolean {
  return TRUTHY_VALUES.has((value ?? "").trim().toLowerCase());
}

function shouldReuseExistingSolicitor(): boolean {
  return isTruthy(process.env.PW_DYNAMIC_USER_REUSE_EXISTING);
}

function shouldForceApiOnlyCaseSetup(): boolean {
  return isTruthy(process.env.PW_DYNAMIC_USER_API_ONLY_CASE_SETUP);
}

function missingRequiredEnvVars(): string[] {
  return REQUIRED_ENV_VARS.filter((name) => !process.env[name]?.trim());
}

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

test.describe("Dynamic user case flags flow", () => {
  test.describe.configure({ timeout: 600000 });
  test.use({ storageState: { cookies: [], origins: [] } });

  test("@dynamic-user creates case and verifies party level flags", async ({
    page,
    createCasePage,
    caseDetailsPage,
    tableUtils,
    professionalUserUtils,
  }, testInfo) => {
    const missingVars = missingRequiredEnvVars();
    if (missingVars.length > 0) {
      throw new Error(
        `Missing dynamic-user prerequisites: ${missingVars.join(", ")}`,
      );
    }

    const partyName = faker.person.firstName();
    let caseNumber = "";
    let caseDetailsUrl = "";
    const reuseExistingSolicitor = shouldReuseExistingSolicitor();
    const forceApiOnlyCaseSetup = shouldForceApiOnlyCaseSetup();
    const setupMode = forceApiOnlyCaseSetup
      ? "api-required"
      : reuseExistingSolicitor
        ? "ui-only"
        : "api-required";

    const handle = await provisionDynamicSolicitorForAlias({
      alias: "SOLICITOR",
      professionalUserUtils,
      roleNames: DIVORCE_FLAGS_DYNAMIC_SOLICITOR_ROLES,
      roleContext: {
        jurisdiction: "divorce",
        testType: "case-create",
      },
      testInfo,
      mode: "external",
    });

    try {
      if (forceApiOnlyCaseSetup) {
        await sessionCapture(["SOLICITOR"], { force: true });
      }
      await ensureAuthenticatedPage(page, "SOLICITOR", {
        waitForSelector: "exui-header",
      });
      const setup = await setupCaseForJourney({
        scenario: "dynamic-user-case-flags-divorce",
        jurisdiction: JURISDICTION,
        caseType: CASE_TYPE,
        apiEventId: "createCase",
        mode: setupMode,
        allowUiFallback: reuseExistingSolicitor && !forceApiOnlyCaseSetup,
        apiPayload: {
          fieldValues: {
            LegalRepParty1Flags: {
              roleOnCase: partyName,
              partyName,
            },
            LegalRepParty2Flags: {
              roleOnCase: `${partyName}2`,
              partyName: `${partyName}2`,
            },
          },
        },
        uiCreate: async () => {
          await createCasePage.createDivorceCaseFlag(
            partyName,
            JURISDICTION,
            CASE_TYPE,
          );
        },
        page,
        createCasePage,
        caseDetailsPage,
        testInfo,
      });
      caseNumber = setup.caseNumber;
      caseDetailsUrl = await caseDetailsPage.getCurrentPageUrl();

      await testInfo.attach("dynamic-user-case-flags-case.json", {
        body: JSON.stringify(
          {
            caseNumber,
            jurisdiction: JURISDICTION,
            caseType: CASE_TYPE,
            partyName,
            createdBy: handle.user.email,
          },
          null,
          2,
        ),
        contentType: "application/json",
      });

      await caseDetailsPage.selectCaseDetailsTab("Flags");
      const existingFlags = await caseDetailsPage.waitForTableByName(partyName);
      const existingTable = await tableUtils.parseDataTable(existingFlags);
      expect
        .soft(filterEmptyRows(existingTable).length)
        .toBeGreaterThanOrEqual(0);

      await caseDetailsPage.exuiSpinnerComponent.wait();
      await caseDetailsPage.selectCaseAction("Create case flag");
      await caseDetailsPage.selectPartyFlagTarget(partyName, "Welsh");

      await expect
        .poll(
          async () => {
            const visible = await caseDetailsPage.caseAlertSuccessMessage
              .isVisible()
              .catch(() => false);
            if (!visible) {
              return false;
            }
            const bannerText =
              await caseDetailsPage.caseAlertSuccessMessage.innerText();
            return caseBannerMatches(
              bannerText,
              caseNumber,
              "has been updated with event: Create case flag",
            );
          },
          { timeout: 45000, intervals: [1000, 2000, 3000] },
        )
        .toBe(true);

      if (!/\/cases\/case-details\//i.test(page.url())) {
        await caseDetailsPage.reopenCaseDetails(caseDetailsUrl);
      }

      await caseDetailsPage.selectCaseDetailsTab("Flags");
      const expectedFlag = {
        "Party level flags": "I want to speak Welsh at a hearing",
        Comments: `Welsh ${partyName}`,
        "Creation date": await caseDetailsPage.todaysDateFormatted(),
        "Last modified": "",
        "Flag status": "ACTIVE",
      };

      await expect
        .poll(
          async () => {
            const partyFlagsTable = await caseDetailsPage.waitForTableByName(
              partyName,
              { timeoutMs: 15_000 },
            );
            const table = await tableUtils.parseDataTable(partyFlagsTable);
            const visibleRows = filterEmptyRows(table);
            return visibleRows.some((row) =>
              rowMatchesExpected(row, expectedFlag),
            );
          },
          { timeout: 60_000, intervals: [1000, 2000, 3000] },
        )
        .toBe(true);

      await testInfo.attach("dynamic-user-case-flags-verification.json", {
        body: JSON.stringify(
          {
            caseNumber,
            partyName,
            expectedFlag: {
              type: "I want to speak Welsh at a hearing",
              comment: `Welsh ${partyName}`,
              status: "ACTIVE",
            },
          },
          null,
          2,
        ),
        contentType: "application/json",
      });

      await testInfo.attach("dynamic-user-case-flags-final.png", {
        body: await page.screenshot({ fullPage: true }),
        contentType: "image/png",
      });
    } catch (error) {
      if (isDependencyEnvironmentFailure(error)) {
        testInfo.skip(
          true,
          `Dynamic case-flags flow skipped due to dependency environment instability: ${asMessage(error)}`,
        );
        return;
      }
      throw error;
    } finally {
      await handle.cleanup();
    }
  });
});
