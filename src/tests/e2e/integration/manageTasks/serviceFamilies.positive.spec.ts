import type { Cookie } from "@playwright/test";

import {
  EXUI_CANARY_SERVICE_FAMILIES,
  EXUI_WA_SUPPORTED_SERVICE_FAMILIES,
  sortServiceFamilies,
} from "../../../../data/exui-central-assurance.js";
import { expect, test } from "../../../../fixtures/ui";
import { probeUiRouteAvailability } from "../../../../utils/ui/uiHostAvailability.js";
import { loadSessionCookies } from "../utils/session.utils.js";
import { setupAvailableTaskListRoutes } from "../utils/taskListRoutes.js";

const userIdentifier = "STAFF_ADMIN";
let sessionCookies: Cookie[] = [];

test.beforeAll(() => {
  const { cookies } = loadSessionCookies(userIdentifier);
  sessionCookies = cookies;
});

test.beforeEach(async ({ page, request }, testInfo) => {
  const availability = await probeUiRouteAvailability(request, "/work/my-work/list");
  testInfo.skip(availability.shouldSkip, availability.reason);

  if (sessionCookies.length) {
    await page.context().addCookies(sessionCookies);
  }

  await setupAvailableTaskListRoutes(page, EXUI_WA_SUPPORTED_SERVICE_FAMILIES);
});

test.describe(`Available task families as ${userIdentifier}`, () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("available tasks filter exposes only the centrally supported WA families", async ({
    page,
    taskListPage,
  }) => {
    await test.step("Open the available tasks tab and filter panel", async () => {
      await taskListPage.goto();
      await page.getByRole("tab", { name: /available tasks/i }).first().click();
      await taskListPage.waitForReady();
      await taskListPage.taskListFilterToggle.click();
      await expect(taskListPage.selectAllServicesFilter).toBeVisible();
    });

    await test.step("Verify the service filter IDs match the supported service-family list", async () => {
      const serviceFilterValues = await page
        .locator('input[id^="checkbox_services"]')
        .evaluateAll((elements) =>
          elements
            .map((element) => (element as HTMLInputElement).id)
            .map((id) =>
              id === "checkbox_servicesservices_all"
                ? undefined
                : id.replace(/^checkbox_services/, ""),
            )
            .filter((value): value is string => Boolean(value)),
        );

      expect(sortServiceFamilies(serviceFilterValues)).toEqual(
        sortServiceFamilies(EXUI_WA_SUPPORTED_SERVICE_FAMILIES),
      );

      for (const canaryFamily of EXUI_CANARY_SERVICE_FAMILIES) {
        expect(serviceFilterValues).not.toContain(canaryFamily);
      }
    });
  });
});
