import { faker } from "@faker-js/faker";

import { expect, test } from "../../../fixtures/ui";
import { caseBannerMatches } from "../../../utils/ui/banner.utils";
import {
  isPageClosingError,
  rowMatchesExpected,
} from "../../../utils/ui/case-flags.utils";
import { filterEmptyRows } from "../../../utils/ui/index";
import {
  ensureAuthenticatedPage,
  ensureSession,
} from "../../../utils/ui/sessionCapture";
import { retryOnTransientFailure } from "../../../utils/ui/transient-failure.utils";
import { setupCaseForJourney } from "../_helpers/caseSetup";

const PARTY_LEVEL_SUITE_TIMEOUT_MS = 300_000;
const SESSION_BOOTSTRAP_TIMEOUT_MS = 300_000;

function isMissingEmploymentCreateCaseOption(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('Option not found for "EMPLOYMENT"') ||
    message.includes('Option not found for "ET_EnglandWales"') ||
    message.includes(
      "Employment create-case flow unavailable: only 'Create draft claim' event is exposed.",
    )
  );
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
    /Test timeout of \d+ms exceeded/i.test(message) ||
    /setup exceeded \d+ms/i.test(message)
  );
}

async function withTimeout<T>(
  action: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
): Promise<T> {
  let timeoutHandle: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      action,
      new Promise<T>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(timeoutMessage));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

test.describe("Case level case flags", () => {
  test.describe.configure({ timeout: 180_000 });
  let caseNumber: string;
  const jurisdiction = "EMPLOYMENT";
  const caseType = "ET_EnglandWales";

  test.beforeAll(async ({ browserName: _browserName }, testInfo) => {
    testInfo.setTimeout(SESSION_BOOTSTRAP_TIMEOUT_MS);
    await ensureSession("SEARCH_EMPLOYMENT_CASE");
  });

  test.beforeEach(
    async ({ page, createCasePage, caseDetailsPage }, testInfo) => {
      try {
        await retryOnTransientFailure(
          async () => {
            await withTimeout(
              (async () => {
                await ensureAuthenticatedPage(page, "SEARCH_EMPLOYMENT_CASE", {
                  waitForSelector: "exui-header",
                  timeoutMs: 45_000,
                });
                const setup = await setupCaseForJourney({
                  scenario: "case-flags-employment-case-level",
                  jurisdiction,
                  caseType,
                  mode: "api-first",
                  allowUiFallback: true,
                  uiCreate: async () => {
                    await createCasePage.createCaseEmployment(
                      jurisdiction,
                      caseType,
                      { allowDraftClaimFallback: true },
                    );
                  },
                  page,
                  createCasePage,
                  caseDetailsPage,
                  testInfo,
                });
                caseNumber = setup.caseNumber;
              })(),
              120_000,
              "Case-level flags setup exceeded 120000ms while creating a case",
            );
          },
          {
            maxAttempts: 2,
            onRetry: async () => {
              if (page.isClosed()) {
                return;
              }
              await page.goto("/").catch(() => undefined);
            },
          },
        );
      } catch (error) {
        if (isMissingEmploymentCreateCaseOption(error)) {
          throw new Error(
            "Employment case-flags tests cannot run: EMPLOYMENT/ET_EnglandWales is not available in this environment.",
          );
        }
        if (isDependencyEnvironmentFailure(error)) {
          throw new Error(
            `Employment case-flags setup failed due to dependency environment instability: ${asMessage(error)}`,
          );
        }
        throw error;
      }
    },
  );

  test("Create a new case level flag and verify the flag is displayed on the case", async ({
    caseDetailsPage,
    tableUtils,
  }) => {
    await test.step("Record existing case level flags", async () => {
      await caseDetailsPage.selectCaseDetailsTab("Flags");
      const flagsTable =
        await caseDetailsPage.waitForTableByName("Case level flags");
      const table = await tableUtils.parseDataTable(flagsTable);
      const visibleRows = filterEmptyRows(table);
      expect.soft(visibleRows.length).toBeGreaterThanOrEqual(0);
    });

    await test.step("Create a new case level flag", async () => {
      await caseDetailsPage.exuiSpinnerComponent.wait();
      await caseDetailsPage.selectCaseAction("Create a case flag");
      await caseDetailsPage.selectCaseFlagTarget("Welsh");
    });

    await test.step("Check the case flag creation messages are seen", async () => {
      await expect
        .poll(async () => {
          if (await caseDetailsPage.hasCallbackValidationErrorAlert()) {
            throw new Error(
              "Callback data failed validation while creating case-level case flag.",
            );
          }
          const bannerVisible = await caseDetailsPage.caseAlertSuccessMessage
            .isVisible()
            .catch(() => false);
          if (!bannerVisible) {
            return false;
          }
          const bannerText =
            await caseDetailsPage.caseAlertSuccessMessage.innerText();
          return caseBannerMatches(
            bannerText,
            caseNumber,
            "has been updated with event: Create a case flag",
          );
        })
        .toBe(true);
      await expect
        .soft(caseDetailsPage.caseNotificationBannerTitle)
        .toBeVisible();
      expect
        .soft(await caseDetailsPage.caseNotificationBannerTitle.innerText())
        .toContain("Important");
      expect
        .soft(await caseDetailsPage.caseNotificationBannerBody.innerText())
        .toContain("There is 1 active flag on this case.");
    });

    await test.step("Verify the case level flag is shown in the flags tab", async () => {
      await caseDetailsPage.selectCaseDetailsTab("Flags");
      const expectedFlag = {
        "Case flags": "Welsh forms and communications",
        Comments: "Welsh",
        "Creation date": await caseDetailsPage.todaysDateFormatted(),
        "Last modified": "",
        "Flag status": "ACTIVE",
      };
      await expect
        .poll(
          async () => {
            if (caseDetailsPage.page.isClosed()) {
              return false;
            }
            try {
              const table = await tableUtils.parseDataTable(
                await caseDetailsPage.getTableByName("Case level flags"),
              );
              const visibleRows = filterEmptyRows(table);
              return visibleRows.some((row) =>
                rowMatchesExpected(row, expectedFlag),
              );
            } catch (error) {
              if (isPageClosingError(error)) {
                return false;
              }
              throw error;
            }
          },
          { timeout: 45000, intervals: [1000, 2000, 3000] },
        )
        .toBe(true);
    });
  });
});

test.describe("Party level case flags", () => {
  test.describe.configure({ timeout: PARTY_LEVEL_SUITE_TIMEOUT_MS });
  const testValue = faker.person.firstName();
  let caseNumber: string;
  const jurisdiction = "DIVORCE";
  const caseType = "xuiCaseFlagsV1";

  test.beforeAll(async ({ browserName: _browserName }, testInfo) => {
    testInfo.setTimeout(SESSION_BOOTSTRAP_TIMEOUT_MS);
    await ensureSession("USER_WITH_FLAGS");
  });

  test.beforeEach(
    async ({ page, createCasePage, caseDetailsPage }, testInfo) => {
      try {
        await retryOnTransientFailure(
          async () => {
            await withTimeout(
              (async () => {
                await ensureAuthenticatedPage(page, "USER_WITH_FLAGS", {
                  waitForSelector: "exui-header",
                });
                const setup = await setupCaseForJourney({
                  scenario: "case-flags-divorce-party-level",
                  jurisdiction,
                  caseType,
                  mode: "api-first",
                  allowUiFallback: true,
                  apiPayload: {
                    fieldValues: {
                      testValue,
                    },
                  },
                  uiCreate: async () => {
                    await createCasePage.createDivorceCaseFlag(
                      testValue,
                      jurisdiction,
                      caseType,
                    );
                  },
                  page,
                  createCasePage,
                  caseDetailsPage,
                  testInfo,
                });
                caseNumber = setup.caseNumber;
              })(),
              120_000,
              "Party-level flags setup exceeded 120000ms while creating a case",
            );
          },
          {
            maxAttempts: 2,
            onRetry: async () => {
              if (page.isClosed()) {
                return;
              }
              await page.goto("/").catch(() => undefined);
            },
          },
        );
      } catch (error) {
        if (isDependencyEnvironmentFailure(error)) {
          throw new Error(
            `Party-level case-flags setup failed due to dependency environment instability: ${asMessage(error)}`,
          );
        }
        throw error;
      }
    },
  );

  test("Create a new party level flag and verify the flag is displayed on the case", async ({
    caseDetailsPage,
    tableUtils,
  }) => {
    await test.step("Record existing party level flags", async () => {
      await caseDetailsPage.selectCaseDetailsTab("Flags");
      const flagsTable = await caseDetailsPage.waitForTableByName(testValue);
      const table = await tableUtils.parseDataTable(flagsTable);
      const visibleRows = filterEmptyRows(table);
      expect.soft(visibleRows.length).toBeGreaterThanOrEqual(0);
    });

    await test.step("Create a new party level flag", async () => {
      await caseDetailsPage.exuiSpinnerComponent.wait();
      await caseDetailsPage.selectCaseAction("Create case flag");
      await caseDetailsPage.selectPartyFlagTarget(testValue, "Welsh");
    });

    await test.step("Check the case flag creation messages are seen", async () => {
      await expect
        .poll(
          async () => {
            if (await caseDetailsPage.hasCallbackValidationErrorAlert()) {
              throw new Error(
                "Callback data failed validation while creating party-level case flag.",
              );
            }
            if (
              await caseDetailsPage.eventCreationErrorHeading
                .isVisible()
                .catch(() => false)
            ) {
              throw new Error(
                "CCD event creation failed while creating party-level case flag.",
              );
            }
            const bannerVisible = await caseDetailsPage.caseAlertSuccessMessage
              .isVisible()
              .catch(() => false);
            if (!bannerVisible) {
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
      await expect
        .soft(caseDetailsPage.caseNotificationBannerTitle)
        .toBeVisible();
      expect
        .soft(await caseDetailsPage.caseNotificationBannerTitle.innerText())
        .toContain("Important");
      expect
        .soft(await caseDetailsPage.caseNotificationBannerBody.innerText())
        .toContain("There is 1 active flag on this case.");
    });

    await test.step("Verify the party level case flag is shown in the flags tab", async () => {
      await caseDetailsPage.selectCaseDetailsTab("Flags");
      const expectedFlag = {
        "Party level flags": "I want to speak Welsh at a hearing",
        Comments: `Welsh ${testValue}`,
        "Creation date": await caseDetailsPage.todaysDateFormatted(),
        "Last modified": "",
        "Flag status": "ACTIVE",
      };
      await expect
        .poll(
          async () => {
            if (caseDetailsPage.page.isClosed()) {
              return false;
            }
            if (await caseDetailsPage.hasCallbackValidationErrorAlert()) {
              throw new Error(
                "Callback data failed validation while creating party-level case flag.",
              );
            }
            if (
              await caseDetailsPage.eventCreationErrorHeading
                .isVisible()
                .catch(() => false)
            ) {
              throw new Error(
                "CCD event creation failed while creating party-level case flag.",
              );
            }
            try {
              const partyFlagsTable = await caseDetailsPage.waitForTableByName(
                testValue,
                {
                  timeoutMs: 15_000,
                },
              );
              await partyFlagsTable.waitFor({ state: "visible" });
              const table = await tableUtils.parseDataTable(partyFlagsTable);
              const visibleRows = filterEmptyRows(table);
              return visibleRows.some((row) =>
                rowMatchesExpected(row, expectedFlag),
              );
            } catch (error) {
              if (isPageClosingError(error)) {
                return false;
              }
              throw error;
            }
          },
          { timeout: 60_000, intervals: [1000, 2000, 3000] },
        )
        .toBe(true);
    });
  });
});
