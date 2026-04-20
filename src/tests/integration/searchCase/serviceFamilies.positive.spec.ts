import {
  buildGlobalSearchServicesCatalog,
  EXUI_CANARY_SERVICE_FAMILIES,
  EXUI_GLOBAL_SEARCH_SERVICE_FAMILIES,
  sortServiceFamilies,
} from "../../../data/exui-central-assurance";
import { expect, test } from "../../../fixtures/ui";
import {
  applyPrewarmedSessionCookies,
  probeUiRouteAvailability,
  setupGlobalSearchMockRoutes,
} from "../helpers";
import { buildGlobalSearchJurisdictionsMock } from "../mocks/globalSearch.mock";
import { TEST_USERS } from "../testData";

const userIdentifier = TEST_USERS.FPL_GLOBAL_SEARCH;

test.beforeEach(async ({ page, request }, testInfo) => {
  const availability = await probeUiRouteAvailability(request, "/cases");
  testInfo.skip(availability.shouldSkip, availability.reason);
  await applyPrewarmedSessionCookies(page, userIdentifier);

  await setupGlobalSearchMockRoutes(page, {
    jurisdictions: buildGlobalSearchJurisdictionsMock(),
    services: buildGlobalSearchServicesCatalog(),
    searchResultsHandler: async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          resultInfo: {
            casesReturned: 0,
            moreResultsToGo: false,
          },
          results: [],
        }),
      });
    },
  });
});

test.describe(
  `Global search service families as ${userIdentifier}`,
  { tag: ["@integration", "@integration-search-case"] },
  () => {
    test("global search dropdown exposes the centrally supported service families", async ({
      caseListPage,
      globalSearchPage,
      page,
    }) => {
      await test.step("Navigate to the search page", async () => {
        await caseListPage.navigateTo();
        await globalSearchPage.searchLinkOnMenuBar.click();
        await page.waitForURL(/\/search/, { timeout: 30_000 });
        await expect(globalSearchPage.searchForm).toBeVisible();
      });

      await test.step("Verify the dropdown values match the agreed family list", async () => {
        const optionValues = await globalSearchPage.servicesOption
          .locator("option")
          .evaluateAll((options) =>
            options
              .map((option) => (option as HTMLOptionElement).value)
              .filter(Boolean),
          );

        expect(sortServiceFamilies(optionValues)).toEqual(
          sortServiceFamilies(EXUI_GLOBAL_SEARCH_SERVICE_FAMILIES),
        );
        for (const canaryFamily of EXUI_CANARY_SERVICE_FAMILIES) {
          expect(optionValues).not.toContain(canaryFamily);
        }
      });
    });
  },
);
