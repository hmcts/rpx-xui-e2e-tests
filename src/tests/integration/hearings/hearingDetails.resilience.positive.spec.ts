import { expect, test } from '../../../fixtures/ui';
import { buildLargeListedHearings, HEARING_MANAGER_CR84_ON_USER, openHearingsTabForScenario } from '../helpers/index.js';
import { HEARINGS_LISTED_HEARING_ID, LISTED_HEARING_SCENARIO, buildHearingsListMock } from '../mocks/hearings.mock.js';

const userIdentifier = HEARING_MANAGER_CR84_ON_USER;

const hearingManagerRoles = ['caseworker-privatelaw', 'caseworker-privatelaw-courtadmin', 'case-allocator', 'hearing-manager'];
const hearingViewerRoles = ['caseworker-privatelaw', 'caseworker-privatelaw-courtadmin', 'case-allocator', 'hearing-viewer'];

test.describe(`Hearings resilience integration as ${userIdentifier}`, { tag: ['@integration', '@integration-hearings'] }, () => {
  test('Hearings - manager can start the request hearing journey from the Hearings tab', async ({
    page,
    caseDetailsPage,
    hearingsTabPage,
  }) => {
    const response = await openHearingsTabForScenario(page, caseDetailsPage, {
      userRoles: hearingManagerRoles,
      hearings: [LISTED_HEARING_SCENARIO],
    });

    expect(response?.status()).toBe(200);
    await expect(hearingsTabPage.requestHearingButton).toBeVisible();
    await hearingsTabPage.openRequestHearing();
    await expect(page).toHaveURL(/\/hearings\/request\/hearing-requirements$/);
  });

  test('Hearings - large dataset renders all hearing rows without crashing', async ({
    page,
    caseDetailsPage,
    hearingsTabPage,
  }) => {
    const largeDataset = buildLargeListedHearings(35);
    await openHearingsTabForScenario(page, caseDetailsPage, {
      userRoles: hearingViewerRoles,
      hearings: largeDataset,
    });

    await hearingsTabPage.waitForReady(largeDataset[0].hearingId);
    const renderedViewDetailsButtons = page.locator('[id^="link-view-details-"]');
    await expect(renderedViewDetailsButtons).toHaveCount(largeDataset.length);
    await expect(page.getByText('ABA5-LISTED-1', { exact: true })).toBeVisible();
    await expect(page.getByText('ABA5-LISTED-35', { exact: true })).toBeVisible();
  });

  test('Hearings - valid payload with optional or null fields still renders without UI failure', async ({
    page,
    caseDetailsPage,
    hearingsTabPage,
  }) => {
    const nullablePayload = buildHearingsListMock([LISTED_HEARING_SCENARIO]) as { caseHearings?: Array<Record<string, unknown>> };
    const firstHearing = nullablePayload.caseHearings?.[0];
    expect(firstHearing).toBeDefined();

    const mutableFirstHearing = firstHearing as Record<string, unknown>;
    mutableFirstHearing.hearingType = null;
    mutableFirstHearing.earliestHearingStartDateTime = null;
    mutableFirstHearing.hearingDaySchedule = null;
    mutableFirstHearing.hearingGroupRequestId = null;

    await openHearingsTabForScenario(page, caseDetailsPage, {
      userRoles: hearingViewerRoles,
      hearingsApiOverrides: {
        getHearings: {
          body: nullablePayload,
        },
      },
    });

    await expect(hearingsTabPage.container).toBeVisible();
    await expect(hearingsTabPage.viewDetailsButton(HEARINGS_LISTED_HEARING_ID)).toBeVisible();
    await expect(page.getByText('Invalid Date', { exact: false })).toHaveCount(0);
  });

  test('Hearings - empty state is rendered when the hearings list is empty', async ({ page, caseDetailsPage }) => {
    await openHearingsTabForScenario(page, caseDetailsPage, {
      userRoles: hearingViewerRoles,
      hearings: [],
    });

    await expect(page.getByText('No current and upcoming hearings found')).toBeVisible();
  });
});
