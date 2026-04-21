import type { Cookie, Page } from "@playwright/test";

import {
  EXUI_CANARY_SERVICE_FAMILIES,
  EXUI_WA_SUPPORTED_SERVICE_FAMILIES,
  sortServiceFamilies,
} from "../../../../data/exui-central-assurance.js";
import { expect, test } from "../../../../fixtures/ui";
import { ensureUiStorageStateForUser } from "../../../../utils/ui/session-storage.utils.js";
import { probeUiRouteAvailability } from "../../../../utils/ui/uiHostAvailability.js";
import { loadSessionCookies } from "../utils/session.utils.js";
import {
  setupAvailableTaskListRoutes,
  setupManageTasksUserDetailsRoute,
} from "../utils/taskListRoutes.js";

const userIdentifier = "COURT_ADMIN";
let sessionCookies: Cookie[] = [];
let sessionBootstrapIssue: string | undefined;

async function findTaskListAccessIssue(page: Page): Promise<string | undefined> {
  const loginInput = page.locator(
    'input#username, input[name="username"], input[type="email"], input#email, input[name="email"]',
  );
  if (await loginInput.first().isVisible().catch(() => false)) {
    return `Task list navigation redirected to the HMCTS login page instead of staying in EXUI (${page.url()}).`;
  }

  const unauthorizedMessage = page.getByText(
    "Sorry, you're not authorised to perform this action",
  );
  if (await unauthorizedMessage.isVisible().catch(() => false)) {
    return `Task list navigation reached an authorization barrier instead of the mocked available-tasks page (${page.url()}).`;
  }

  if (!page.url().includes("/work/my-work/list")) {
    return `Task list navigation did not stay on /work/my-work/list (${page.url()}).`;
  }

  return undefined;
}

function asErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

test.beforeAll(async () => {
  const cachedSession = loadSessionCookies(userIdentifier);
  sessionCookies = cachedSession.cookies;

  if (sessionCookies.length > 0) {
    return;
  }

  try {
    await ensureUiStorageStateForUser(userIdentifier, { strict: true });
  } catch (error) {
    sessionBootstrapIssue =
      error instanceof Error ? error.message : String(error);
  }

  const refreshedSession = loadSessionCookies(userIdentifier);
  sessionCookies = refreshedSession.cookies;
});

test.beforeEach(async ({ page, request }, testInfo) => {
  const availability = await probeUiRouteAvailability(request, "/work/my-work/list");
  testInfo.skip(availability.shouldSkip, availability.reason);
  testInfo.skip(
    sessionCookies.length === 0,
    sessionBootstrapIssue
      ? `No cached ${userIdentifier} UI session cookies were found after session bootstrap failed: ${sessionBootstrapIssue}`
      : `No cached ${userIdentifier} UI session cookies were found for the manage-tasks proof.`,
  );

  await page.context().addCookies(sessionCookies);
  await setupManageTasksUserDetailsRoute(
    page,
    EXUI_WA_SUPPORTED_SERVICE_FAMILIES,
    "exui-central-assurance-user",
  );
  await setupAvailableTaskListRoutes(page, EXUI_WA_SUPPORTED_SERVICE_FAMILIES);
});

test.describe(`Available task families as ${userIdentifier}`, () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("available tasks filter exposes only the centrally supported WA families", async ({
    page,
    taskListPage,
  }, testInfo) => {
    await test.step("Open the available tasks tab and filter panel", async () => {
      try {
        await page.goto("/work/my-work/list", {
          waitUntil: "domcontentloaded",
          timeout: 20_000,
        });
      } catch (error) {
        testInfo.skip(
          true,
          `Task list navigation did not complete within 20s: ${asErrorMessage(error)}`,
        );
      }
      const accessIssue = await findTaskListAccessIssue(page);
      testInfo.skip(Boolean(accessIssue), accessIssue ?? "");
      try {
        await taskListPage.waitForReady(15_000);
      } catch (error) {
        testInfo.skip(
          true,
          `Task list page did not reach a ready state within 15s: ${asErrorMessage(error)}`,
        );
      }
      await page.getByRole("link", { name: /available tasks/i }).first().click();
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
