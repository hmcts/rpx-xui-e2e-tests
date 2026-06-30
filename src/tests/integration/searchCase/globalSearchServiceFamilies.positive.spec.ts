import {
  EXUI_ALL_CONFIGURED_SERVICE_FAMILIES,
  EXUI_GLOBAL_SEARCH_SERVICE_FAMILIES,
  EXUI_SERVICE_LABELS,
  sortServiceFamilies,
} from "../../../data/exui-central-assurance.js";
import { expect, test } from "../../../fixtures/ui";
import { attachUiScreenshotEvidence } from "../../../utils/ui/test-evidence.utils.js";
import {
  applySearchCaseSessionCookies,
  ensureSearchCaseSessionAccess,
  setupGlobalSearchMockRoutes,
} from "../helpers/index.js";
import {
  buildGlobalSearchJurisdictionsMock,
  buildGlobalSearchNoResultsMock,
} from "../mocks/globalSearch.mock.js";
import { TEST_USERS } from "../testData/index.js";

const userIdentifier = TEST_USERS.SEARCH_CASE;
const globalSearchServices = EXUI_GLOBAL_SEARCH_SERVICE_FAMILIES.map((serviceId) => ({
  serviceId,
  serviceName: EXUI_SERVICE_LABELS[serviceId],
}));
const globalSearchServiceFamilySet = new Set<string>(EXUI_GLOBAL_SEARCH_SERVICE_FAMILIES);
const nonGlobalSearchServiceFamilies = EXUI_ALL_CONFIGURED_SERVICE_FAMILIES.filter(
  (serviceFamily) => !globalSearchServiceFamilySet.has(serviceFamily)
);

test.beforeAll(async ({}, testInfo) => {
  await ensureSearchCaseSessionAccess(testInfo);
});

test.beforeEach(async ({ page }, testInfo) => {
  await applySearchCaseSessionCookies(page, testInfo);
  await setupGlobalSearchMockRoutes(page, {
    jurisdictions: buildGlobalSearchJurisdictionsMock(),
    services: globalSearchServices,
    searchResultsHandler: async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(buildGlobalSearchNoResultsMock()),
      });
    },
  });
});

test.describe(
  `Global search service families as ${userIdentifier}`,
  { tag: ["@integration-bucket-1", "@integration", "@integration-search-case", "@integration-harness"] },
  () => {
    test("global search service selector exposes only the central supported service families", async ({
      page,
      globalSearchPage,
    }, testInfo) => {
      await page.goto("/search", { waitUntil: "domcontentloaded" });
      await expect(globalSearchPage.servicesOption).toBeVisible();

      const renderedServices = await globalSearchPage.servicesOption.locator("option").evaluateAll((options) =>
        options
          .map((option) => ({
            label: option.textContent?.trim() ?? "",
            value: (option as HTMLOptionElement).value,
          }))
          .filter((option) => option.value && option.value !== "ALL")
      );
      const renderedServiceIds = renderedServices.map((service) => service.value);

      expect(sortServiceFamilies(renderedServiceIds)).toEqual(sortServiceFamilies(EXUI_GLOBAL_SEARCH_SERVICE_FAMILIES));
      expect(renderedServices).toEqual(
        expect.arrayContaining(
          globalSearchServices.map((service) =>
            expect.objectContaining({
              label: service.serviceName,
              value: service.serviceId,
            })
          )
        )
      );
      for (const serviceFamily of nonGlobalSearchServiceFamilies) {
        expect(renderedServiceIds).not.toContain(serviceFamily);
      }

      await attachUiScreenshotEvidence(testInfo, page, "exui-assurance-global-search-service-families.png");
    });
  }
);
