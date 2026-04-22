import { faker } from "@faker-js/faker";
import type { Cookie } from "@playwright/test";

import { expect, test } from "../../../fixtures/ui";
import {
  applyCookiesToPage,
  assertSessionCapabilities,
  ensureSessionCookies,
} from "../../../utils/integration/session.utils.js";
import { caseBannerMatches } from "../../../utils/ui/banner.utils.js";
import {
  isPageClosingError,
  rowMatchesExpected,
} from "../../../utils/ui/case-flags.utils.js";
import { filterEmptyRows } from "../../../utils/ui/table.utils.js";
import { retryOnTransientFailure } from "../../../utils/ui/transient-failure.utils.js";

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

test.describe("Case level case flags", () => {
  test.describe.configure({ timeout: 240_000 });
  let caseNumber = "";
  let searchEmploymentCookies: Cookie[] = [];

  const jurisdiction = "EMPLOYMENT";
  const caseType = "ET_EnglandWales";

  test.beforeAll(async () => {
    const session = await ensureSessionCookies("SEARCH_EMPLOYMENT_CASE", {
      strict: true,
    });
    searchEmploymentCookies = session.cookies;
  });

  test.beforeEach(async ({ page, createCasePage, caseDetailsPage }) => {
    await retryOnTransientFailure(
      async () => {
        await applyCookiesToPage(page, searchEmploymentCookies);
        await page.goto("/");
        await createCasePage.createCaseEmployment(jurisdiction, caseType);
        caseNumber = await caseDetailsPage.getCaseNumberFromUrl();
      },
      {
        maxAttempts: 3,
        shouldRetry: (error) => {
          const message = toErrorMessage(error);
          return (
            message.includes("Validation error after after receipt details") ||
            message.includes("Date of Receipt is required") ||
            message.includes("Tribunal Office is required")
          );
        },
        onRetry: async () => {
          if (page.isClosed()) {
            return;
          }
          await page.goto("/cases/case-filter").catch(() => undefined);
        },
      },
    );
  });

  test("Create a new case level flag and verify the flag is displayed on the case", async ({
    caseDetailsPage,
    tableUtils,
  }) => {
    await test.step("Record existing case level flags", async () => {
      await caseDetailsPage.selectCaseDetailsTab("Flags");
      const table = await tableUtils.mapExuiTable(
        await caseDetailsPage.getTableByName("Case level flags"),
      );
      const visibleRows = filterEmptyRows(table);
      expect.soft(visibleRows.length).toBeGreaterThanOrEqual(0);
    });

    await test.step("Create a new case level flag", async () => {
      await caseDetailsPage.exuiSpinnerComponent.wait();
      await caseDetailsPage.selectCaseAction("Create a case flag", {
        expectedLocator: caseDetailsPage.page.getByLabel("Case level"),
      });
      await caseDetailsPage.selectCaseFlagTarget("Welsh");
    });

    await test.step("Check the case flag creation messages are seen", async () => {
      await expect
        .poll(
          async () => {
            const callbackValidationError = caseDetailsPage.page.getByText(
              "callback data failed validation",
              {
                exact: false,
              },
            );
            if (await callbackValidationError.isVisible().catch(() => false)) {
              throw new Error(
                "Callback data failed validation while creating case-level case flag.",
              );
            }
            const eventErrorVisible =
              await caseDetailsPage.eventCreationErrorHeading
                .isVisible()
                .catch(() => false);
            if (eventErrorVisible) {
              throw new Error(
                "CCD event creation failed while creating case-level case flag.",
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
          },
          { timeout: 60_000, intervals: [1_000, 2_000, 3_000] },
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
              const table = await tableUtils.mapExuiTable(
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
          { timeout: 45_000, intervals: [1_000, 2_000, 3_000] },
        )
        .toBe(true);
    });
  });
});

test.describe("Party level case flags", () => {
  test.describe.configure({ timeout: 240_000 });
  const testValue = faker.person.firstName();
  let caseNumber = "";
  let selectedPartyLabel = "";
  let caseDetailsUrl = "";
  let flagsCookies: Cookie[] = [];

  const jurisdiction = "DIVORCE";
  const caseType = "xuiCaseFlagsV1";

  test.beforeAll(async ({ request }) => {
    const session = await ensureSessionCookies("USER_WITH_FLAGS", {
      strict: true,
    });
    await assertSessionCapabilities(request, session, {
      requireOrganisationAccess: true,
      requiredCreateCaseTypes: [caseType],
    });
    flagsCookies = session.cookies;
  });

  test.beforeEach(async ({ page, createCasePage, caseDetailsPage }) => {
    await retryOnTransientFailure(
      async () => {
        await applyCookiesToPage(page, flagsCookies);
        await page.goto("/");
        await createCasePage.createDivorceCaseFlag(
          testValue,
          jurisdiction,
          caseType,
        );
        caseNumber = await caseDetailsPage.getCaseNumberFromUrl();
        caseDetailsUrl = `/cases/case-details/${jurisdiction}/${caseType}/${caseNumber}`;
      },
      {
        maxAttempts: 3,
        onRetry: async () => {
          if (page.isClosed()) {
            return;
          }
          await page.goto("/cases/case-filter").catch(() => undefined);
        },
      },
    );
  });

  test("Create a new party level flag and verify the flag is displayed on the case", async ({
    caseDetailsPage,
  }) => {
    test.setTimeout(540_000);

    await test.step("Create a new party level flag", async () => {
      await caseDetailsPage.exuiSpinnerComponent.wait();
      await caseDetailsPage.selectCaseAction("Create a case flag", {
        expectedLocator: caseDetailsPage.page.getByRole("heading", {
          name: /where should this flag be added\?/i,
        }),
        timeoutMs: 90_000,
      });
      selectedPartyLabel = await caseDetailsPage.selectPartyFlagTarget(
        testValue,
        "Welsh",
      );
    });

    await test.step("Check the case flag creation messages are seen", async () => {
      const callbackError = caseDetailsPage.page.getByText(
        "callback data failed validation",
        {
          exact: false,
        },
      );
      const callbackVisible = await callbackError
        .isVisible()
        .catch(() => false);
      const callbackText = (
        (await callbackError
          .first()
          .textContent()
          .catch(() => "")) ?? ""
      )
        .replaceAll(/\s+/g, " ")
        .trim();
      expect(
        callbackVisible,
        callbackText
          ? `Callback data failed validation after party flag submit: ${callbackText}`
          : "Callback data failed validation after party flag submit.",
      ).toBe(false);

      const eventCreationErrorVisible =
        await caseDetailsPage.eventCreationErrorHeading
          .isVisible()
          .catch(() => false);
      expect(
        eventCreationErrorVisible,
        "CCD event creation failed while creating party-level case flag.",
      ).toBe(false);

      await expect
        .poll(
          async () => {
            const bannerVisible = await caseDetailsPage.caseAlertSuccessMessage
              .isVisible()
              .catch(() => false);
            if (!bannerVisible) {
              return false;
            }
            const bannerText =
              (await caseDetailsPage.caseAlertSuccessMessage
                .innerText()
                .catch(() => "")) ?? "";
            const createCaseFlagMessageMatches = caseBannerMatches(
              bannerText,
              caseNumber,
              "has been updated with event: Create case flag",
            );
            const createACaseFlagMessageMatches = caseBannerMatches(
              bannerText,
              caseNumber,
              "has been updated with event: Create a case flag",
            );
            return (
              createCaseFlagMessageMatches || createACaseFlagMessageMatches
            );
          },
          { timeout: 90_000, intervals: [1_000, 2_000, 4_000] },
        )
        .toBe(true);
      await expect
        .soft(caseDetailsPage.caseNotificationBannerTitle)
        .toBeVisible();
      await expect
        .soft(caseDetailsPage.caseNotificationBannerBody)
        .toBeVisible();
      expect
        .soft(await caseDetailsPage.caseNotificationBannerTitle.innerText())
        .toContain("Important");
      expect
        .soft(await caseDetailsPage.caseNotificationBannerBody.innerText())
        .toMatch(/active flag/i);
    });

    await test.step("Verify the party level case flag is shown in the flags tab", async () => {
      const selectedPartyText = selectedPartyLabel.split("(")[0]?.trim() ?? "";
      const expectedPartyText = selectedPartyText.toLowerCase();
      await expect(async () => {
        await caseDetailsPage.page.goto(caseDetailsUrl, {
          waitUntil: "domcontentloaded",
        });
        await caseDetailsPage.waitForReady(60_000);
        await expect(caseDetailsPage.caseActionsDropdown).toBeVisible({
          timeout: 60_000,
        });
        await caseDetailsPage.selectCaseDetailsTab("Flags");
      }).toPass({ timeout: 120_000, intervals: [1_000, 2_000, 4_000] });

      await expect
        .poll(
          async () => {
            const selectedTabLabel = (
              (await caseDetailsPage.page
                .getByRole("tab", { selected: true })
                .first()
                .innerText()
                .catch(() => "")) ?? ""
            )
              .replaceAll(/\s+/g, " ")
              .trim()
              .toLowerCase();
            if (!selectedTabLabel.includes("flag")) {
              return false;
            }

            const caseViewerTable = caseDetailsPage.page
              .getByRole("table", { name: "case viewer table" })
              .first();
            const tableVisible = await caseViewerTable
              .isVisible()
              .catch(() => false);
            if (!tableVisible) {
              return false;
            }
            const tableText = (
              (await caseViewerTable.innerText().catch(() => "")) ?? ""
            )
              .replaceAll(/\s+/g, " ")
              .trim()
              .toLowerCase();
            const partyMentioned =
              expectedPartyText.length === 0 ||
              tableText.includes(expectedPartyText);

            return (
              partyMentioned &&
              tableText.includes("i want to speak welsh at a hearing") &&
              tableText.includes("comments welsh") &&
              tableText.includes("status active")
            );
          },
          { timeout: 120_000, intervals: [1_000, 2_000, 4_000] },
        )
        .toBe(true);
    });
  });
});
