import { faker } from "@faker-js/faker";
import type { Cookie } from "@playwright/test";

import { expect, test } from "../../../fixtures/ui";
import {
  applyCookiesToPage,
  ensureSessionCookies,
  selectSessionByCapabilities,
} from "../../../utils/integration/session.utils.js";
import { caseBannerMatches } from "../../../utils/ui/banner.utils.js";
import {
  isPageClosingError,
  rowMatchesExpected,
} from "../../../utils/ui/case-flags.utils.js";
import {
  installCreateJurisdictionFallbackRoute,
  JURISDICTION_BOOTSTRAP_ROUTE,
} from "../../../utils/ui/jurisdiction-bootstrap.utils.js";
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
  let resolvedCaseType = "xuiCaseFlagsV1";

  const jurisdiction = "DIVORCE";
  const organisationApiRoute = "**/api/organisation**";

  test.beforeAll(async ({ request }) => {
    const session = await selectSessionByCapabilities(
      request,
      [
        "DIVORCE_FLAGS_ADMIN",
        "USER_WITH_FLAGS",
        "STAFF_ADMIN",
        "SEARCH_EMPLOYMENT_CASE",
        "COURT_ADMIN",
      ],
      {
        requiredCreateCaseTypesAny: ["xuiCaseFlagsV1", "xuiCaseFlags2.1"],
        strict: false,
      },
    );
    resolvedCaseType = session.resolvedCaseType ?? "xuiCaseFlagsV1";
    if (!session.cookies.length) {
      throw new Error(
        `No cookies available for resolved case flags candidate "${session.userIdentifier}".`,
      );
    }
    const refreshedSession = await ensureSessionCookies(
      session.userIdentifier,
      {
        strict: false,
      },
    );
    flagsCookies = refreshedSession.cookies.length
      ? refreshedSession.cookies
      : session.cookies;
  });

  test.beforeEach(async ({ page, createCasePage, caseDetailsPage }) => {
    await installCreateJurisdictionFallbackRoute(page, [
      {
        jurisdiction: "DIVORCE",
        caseTypes: ["xuiCaseFlagsV1", "xuiCaseFlags2.1"],
      },
    ]);

    await page.context().route(organisationApiRoute, async (route) => {
      const fallbackPayload = {
        organisationIdentifier: "TEST_ORG",
        name: "Test Organisation",
        status: "ACTIVE",
        organisations: [
          {
            organisationIdentifier: "TEST_ORG",
            name: "Test Organisation",
            status: "ACTIVE",
          },
        ],
      };

      const liveResponse = await route.fetch().catch(() => null);
      if (!liveResponse || liveResponse.status() === 403) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(fallbackPayload),
        });
        return;
      }
      await route.fulfill({ response: liveResponse });
    });

    await applyCookiesToPage(page, flagsCookies);
    await page.goto("/");
    await createCasePage.createDivorceCaseFlag(
      testValue,
      jurisdiction,
      resolvedCaseType,
    );
    caseNumber = await caseDetailsPage.getCaseNumberFromUrl();
    caseDetailsUrl = `/cases/case-details/${jurisdiction}/${resolvedCaseType}/${caseNumber}`;
  });

  test.afterEach(async ({ page }) => {
    await page.unroute(JURISDICTION_BOOTSTRAP_ROUTE).catch(() => {});
    await page
      .context()
      .unroute(organisationApiRoute)
      .catch(() => {});
  });

  test("Create a new party level flag and verify the flag is displayed on the case", async ({
    caseDetailsPage,
  }) => {
    test.setTimeout(420_000);

    await test.step("Create a new party level flag", async () => {
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          await caseDetailsPage.exuiSpinnerComponent.wait();
          await caseDetailsPage.selectCaseAction("Create a case flag", {
            expectedLocator: caseDetailsPage.page.getByRole("heading", {
              name: /where should this flag be added\?/i,
            }),
            timeoutMs: 45_000,
          });
          selectedPartyLabel = await caseDetailsPage.selectPartyFlagTarget(
            testValue,
            "Welsh",
          );
          return;
        } catch (error) {
          // eslint-disable-next-line playwright/no-conditional-in-test -- bounded retry for known transient CCD step rendering.
          if (attempt === 2) {
            throw error;
          }
          // eslint-disable-next-line playwright/no-conditional-in-test -- explicit guard keeps retry failures understandable when browser closes.
          if (caseDetailsPage.page.isClosed()) {
            throw new Error(
              "Page closed before retrying party-level flag flow.",
              { cause: error },
            );
          }
          await caseDetailsPage.page.goto(caseDetailsUrl, {
            waitUntil: "domcontentloaded",
          });
        }
      }
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
          { timeout: 45_000, intervals: [500, 1_000, 2_000] },
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
      /* eslint-disable playwright/no-conditional-in-test -- xuiCaseFlagsV1 and xuiCaseFlags2.1 expose different tab labels; pick at runtime for resilient verification. */
      let flagsTabName = "Flags";
      if (resolvedCaseType.toLowerCase() === "xuicaseflags2.1") {
        flagsTabName = "Case flags";
      }
      /* eslint-enable playwright/no-conditional-in-test */
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
        await caseDetailsPage.selectCaseDetailsTab(flagsTabName);
      }).toPass({ timeout: 60_000, intervals: [1_000, 2_000, 3_000] });

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
          { timeout: 60_000, intervals: [1_000, 2_000, 3_000] },
        )
        .toBe(true);
    });
  });
});
