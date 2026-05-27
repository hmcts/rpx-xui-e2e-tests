import {
  EXUI_HEARINGS_CASE_TYPES_BY_SERVICE_FAMILY,
  EXUI_HEARINGS_SUPPORTED_SERVICE_FAMILIES,
} from '../../../data/exui-central-assurance.js';
import { expect, test } from '../../../fixtures/ui';
import { attachAccessibilityEvidence, attachUiScreenshotEvidence } from '../../../utils/ui/test-evidence.utils.js';
import {
  applySessionCookies,
  caseDetailsUrl,
  HEARING_MANAGER_CR84_ON_USER,
  openHearingsTabForScenario,
  setupHearingsMockRoutes,
} from '../helpers/index.js';
import { HEARINGS_LISTED_HEARING_ID, LISTED_HEARING_SCENARIO } from '../mocks/hearings.mock.js';

const userIdentifier = HEARING_MANAGER_CR84_ON_USER;
const hearingManagerRoles = ['caseworker-privatelaw', 'caseworker-privatelaw-courtadmin', 'case-allocator', 'hearing-manager'];
const privateLawCaseConfig = {
  jurisdictionId: 'PRIVATELAW',
  caseTypeId: 'PRLAPPS',
  serviceId: 'ABA5',
};
const privateLawVariation = {
  jurisdiction: privateLawCaseConfig.jurisdictionId,
  caseType: privateLawCaseConfig.caseTypeId,
};

async function openSupportedPrivateLawHearingSummary({
  page,
  caseDetailsPage,
  hearingsTabPage,
  hearingViewSummaryPage,
}: {
  page: Parameters<typeof openHearingsTabForScenario>[0];
  caseDetailsPage: Parameters<typeof openHearingsTabForScenario>[1];
  hearingsTabPage: {
    waitForReady: (hearingId: string) => Promise<void>;
    viewDetailsButton: (hearingId: string) => ReturnType<typeof page.getByRole>;
    openViewDetails: (hearingId: string) => Promise<void>;
  };
  hearingViewSummaryPage: {
    waitForReady: () => Promise<void>;
    editHearingButton: ReturnType<typeof page.getByRole>;
  };
}) {
  expect(EXUI_HEARINGS_SUPPORTED_SERVICE_FAMILIES).toContain('PRIVATELAW');
  expect(EXUI_HEARINGS_CASE_TYPES_BY_SERVICE_FAMILY.PRIVATELAW).toContain('PRLAPPS');

  await openHearingsTabForScenario(
    page,
    caseDetailsPage,
    {
      userRoles: hearingManagerRoles,
      hearings: [LISTED_HEARING_SCENARIO],
      caseConfig: privateLawCaseConfig,
      enabledCaseVariations: [privateLawVariation],
      amendmentCaseVariations: [privateLawVariation],
    },
    { userIdentifier }
  );

  await hearingsTabPage.waitForReady(HEARINGS_LISTED_HEARING_ID);
  await expect(hearingsTabPage.viewDetailsButton(HEARINGS_LISTED_HEARING_ID)).toBeVisible();

  await hearingsTabPage.openViewDetails(HEARINGS_LISTED_HEARING_ID);

  await expect(page).toHaveURL(/\/hearings\/request\/hearing-view-summary$/);
  await hearingViewSummaryPage.waitForReady();
  await expect(hearingViewSummaryPage.editHearingButton).toBeVisible();
}

async function openUnsupportedDivorceCaseDetails(page: Parameters<typeof applySessionCookies>[0], caseDetailsPage: { waitForCaseDetailsPage: () => Promise<void> }) {
  expect(EXUI_HEARINGS_SUPPORTED_SERVICE_FAMILIES).not.toContain('DIVORCE');

  await applySessionCookies(page, userIdentifier);
  await setupHearingsMockRoutes(page, {
    userRoles: hearingManagerRoles,
    hearings: [LISTED_HEARING_SCENARIO],
    caseConfig: {
      jurisdictionId: 'DIVORCE',
      caseTypeId: 'DIVORCE',
      serviceId: 'ABA1',
    },
    enabledCaseVariations: [privateLawVariation],
    amendmentCaseVariations: [privateLawVariation],
  });

  await page.goto(caseDetailsUrl('DIVORCE', 'DIVORCE'), { waitUntil: 'domcontentloaded' });
  await caseDetailsPage.waitForCaseDetailsPage();
}

test.describe(`EXUI assurance harness hearings families as ${userIdentifier}`, { tag: ['@integration', '@integration-hearings'] }, () => {
  test('supported Private Law PRLAPPS case renders hearing-manager actions', async ({
    page,
    caseDetailsPage,
    hearingsTabPage,
    hearingViewSummaryPage,
  }, testInfo) => {
    await openSupportedPrivateLawHearingSummary({
      page,
      caseDetailsPage,
      hearingsTabPage,
      hearingViewSummaryPage,
    });

    await attachUiScreenshotEvidence(testInfo, page, 'exui-assurance-hearings-private-law-actions.png');
  });

  test('unsupported Divorce case keeps the Hearings tab hidden', async ({ page, caseDetailsPage }, testInfo) => {
    await openUnsupportedDivorceCaseDetails(page, caseDetailsPage);

    await expect(page.getByRole('tab', { name: /hearings/i })).toHaveCount(0);

    await attachUiScreenshotEvidence(testInfo, page, 'exui-assurance-hearings-unsupported-family-hidden.png');
  });

  test('accessibility baseline: supported Private Law hearings action view has no new axe violations', async ({
    page,
    caseDetailsPage,
    hearingsTabPage,
    hearingViewSummaryPage,
  }, testInfo) => {
    await openSupportedPrivateLawHearingSummary({
      page,
      caseDetailsPage,
      hearingsTabPage,
      hearingViewSummaryPage,
    });

    await attachAccessibilityEvidence(testInfo, page, 'Hearings supported-family accessibility report', {
      knownViolations: [
        {
          id: 'dlitem',
          maxNodes: 1,
        },
        {
          id: 'empty-heading',
          maxNodes: 1,
        },
      ],
    });
    await attachUiScreenshotEvidence(testInfo, page, 'exui-assurance-hearings-private-law-actions-a11y.png');
  });

  test('accessibility baseline: unsupported Divorce case details state has no new axe violations', async ({
    page,
    caseDetailsPage,
  }, testInfo) => {
    await openUnsupportedDivorceCaseDetails(page, caseDetailsPage);
    await expect(page.getByRole('tab', { name: /hearings/i })).toHaveCount(0);

    await attachAccessibilityEvidence(testInfo, page, 'Hearings unsupported-family hidden-tab accessibility report', {
      knownViolations: [
        {
          id: 'landmark-one-main',
          maxNodes: 1,
        },
        {
          id: 'page-has-heading-one',
          maxNodes: 1,
        },
      ],
    });
    await attachUiScreenshotEvidence(testInfo, page, 'exui-assurance-hearings-unsupported-family-hidden-a11y.png');
  });
});
