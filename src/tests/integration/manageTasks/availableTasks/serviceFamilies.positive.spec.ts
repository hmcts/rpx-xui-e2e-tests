import {
  EXUI_CANARY_SERVICE_FAMILIES,
  EXUI_WA_SUPPORTED_SERVICE_FAMILIES,
  sortServiceFamilies,
} from "../../../../data/exui-central-assurance";
import { expect, test } from "../../../../fixtures/ui";
import {
  applyPrewarmedSessionCookies,
  probeUiRouteAvailability,
  setupTaskListBootstrapRoutes,
  taskListRoutePattern,
} from "../../helpers";
import {
  availableActionsList,
  buildTaskListMock,
} from "../../mocks/taskList.mock";

const userIdentifier = "STAFF_ADMIN";

test.beforeEach(async ({ page, request }, testInfo) => {
  const availability = await probeUiRouteAvailability(
    request,
    "/work/my-work/list",
  );
  testInfo.skip(availability.shouldSkip, availability.reason);
  await applyPrewarmedSessionCookies(page, userIdentifier);
});

test.describe(
  `Available task families as ${userIdentifier}`,
  { tag: ["@integration", "@integration-manage-tasks"] },
  () => {
    test("available tasks filter exposes only the centrally supported WA families", async ({
      taskListPage,
      page,
    }) => {
      const taskListMockResponse = buildTaskListMock(
        3,
        "",
        availableActionsList,
      );

      await test.step("Setup task list routes with the agreed WA family list", async () => {
        await setupTaskListBootstrapRoutes(
          page,
          [...EXUI_WA_SUPPORTED_SERVICE_FAMILIES],
        );
        await page.route(
          "**/workallocation/caseworker/getUsersByServiceName*",
          async (route) => {
            await route.fulfill({
              status: 200,
              contentType: "application/json",
              body: JSON.stringify([]),
            });
          },
        );
        await page.route(taskListRoutePattern, async (route) => {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(taskListMockResponse),
          });
        });
      });

      await test.step("Open the available tasks filter panel", async () => {
        await taskListPage.goto();
        await taskListPage.taskTableTabs
          .filter({ hasText: "Available tasks" })
          .first()
          .click();
        await taskListPage.waitForTaskListShellReady("available tasks tab");
        await taskListPage.openFilterPanel();
        await expect(taskListPage.selectAllServicesFilter).toBeVisible();
      });

      await test.step("Verify the filter values match the supported service-family list", async () => {
        const serviceFilterValues =
          await taskListPage.serviceFilterCheckboxes.evaluateAll((elements) =>
            elements
              .map((element) => (element as HTMLInputElement).value)
              .filter(Boolean),
          );

        expect(sortServiceFamilies(serviceFilterValues)).toEqual(
          sortServiceFamilies(EXUI_WA_SUPPORTED_SERVICE_FAMILIES),
        );
        for (const canaryFamily of EXUI_CANARY_SERVICE_FAMILIES) {
          expect(serviceFilterValues).not.toContain(canaryFamily);
        }
      });
    });
  },
);
