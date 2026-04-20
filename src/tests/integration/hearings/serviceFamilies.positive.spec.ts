import type { Page } from "@playwright/test";

import { expect, test } from "../../../fixtures/ui";
import {
  applyPrewarmedSessionCookies,
  probeUiRouteAvailability,
  setupHearingsMockRoutes,
} from "../helpers";
import {
  HEARINGS_CASE_REFERENCE,
  LISTED_HEARING_SCENARIO,
} from "../mocks/hearings.mock";

const userIdentifier = "HEARING_MANAGER_CR84_ON";

const hearingManagerRoles = [
  "caseworker-privatelaw",
  "caseworker-privatelaw-courtadmin",
  "case-allocator",
  "hearing-manager",
];

const caseDetailsUrl = (jurisdictionId: string, caseTypeId: string) =>
  `/cases/case-details/${jurisdictionId}/${caseTypeId}/${HEARINGS_CASE_REFERENCE}`;

async function openCaseDetails(
  page: Page,
  options: {
    jurisdictionId: string;
    caseTypeId: string;
    enabledCaseVariations: Array<{ jurisdiction: string; caseType: string }>;
    amendmentCaseVariations: Array<{ jurisdiction: string; caseType: string }>;
  },
): Promise<void> {
  await applyPrewarmedSessionCookies(page, userIdentifier);
  await setupHearingsMockRoutes(page, {
    userRoles: hearingManagerRoles,
    hearings: [LISTED_HEARING_SCENARIO],
    summaryHearing: LISTED_HEARING_SCENARIO,
    caseConfig: {
      jurisdictionId: options.jurisdictionId,
      caseTypeId: options.caseTypeId,
    },
    enabledCaseVariations: options.enabledCaseVariations,
    amendmentCaseVariations: options.amendmentCaseVariations,
  });
  await page.goto(caseDetailsUrl(options.jurisdictionId, options.caseTypeId), {
    waitUntil: "domcontentloaded",
  });
}

test.beforeEach(async ({ request }, testInfo) => {
  const availability = await probeUiRouteAvailability(
    request,
    caseDetailsUrl("PRIVATELAW", "PRLAPPS"),
  );
  testInfo.skip(availability.shouldSkip, availability.reason);
});

test.describe(
  `Hearings service families as ${userIdentifier}`,
  { tag: ["@integration", "@integration-hearings"] },
  () => {
    test("supported PRIVATELAW PRLAPPS family exposes the hearings manager action", async ({
      page,
      caseDetailsPage,
      hearingsTabPage,
    }) => {
      await openCaseDetails(page, {
        jurisdictionId: "PRIVATELAW",
        caseTypeId: "PRLAPPS",
        enabledCaseVariations: [
          { jurisdiction: "PRIVATELAW", caseType: "PRLAPPS" },
        ],
        amendmentCaseVariations: [
          { jurisdiction: "PRIVATELAW", caseType: "PRLAPPS" },
        ],
      });

      await expect(
        page.getByRole("tab", { name: /hearings/i }).first(),
      ).toBeVisible();
      await caseDetailsPage.selectCaseDetailsTab("Hearings");
      await hearingsTabPage.waitForReady(
        LISTED_HEARING_SCENARIO.hearingId,
        "view-or-edit",
      );
      await expect(
        hearingsTabPage.viewOrEditButton(LISTED_HEARING_SCENARIO.hearingId),
      ).toBeVisible();
      await expect(
        hearingsTabPage.viewDetailsButton(LISTED_HEARING_SCENARIO.hearingId),
      ).toHaveCount(0);
    });

    test("unsupported DIVORCE family hides the hearings tab", async ({
      page,
    }) => {
      await openCaseDetails(page, {
        jurisdictionId: "DIVORCE",
        caseTypeId: "DIVORCE",
        enabledCaseVariations: [
          { jurisdiction: "PRIVATELAW", caseType: "PRLAPPS" },
        ],
        amendmentCaseVariations: [
          { jurisdiction: "PRIVATELAW", caseType: "PRLAPPS" },
        ],
      });

      await expect(
        page.getByRole("tab", { name: /hearings/i }).first(),
      ).toHaveCount(0);
    });
  },
);
