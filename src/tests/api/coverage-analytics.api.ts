import { test, expect } from "@playwright/test";

import {
  acceptAnalyticsCookiesOnPage,
  ensureAnalyticsAccepted
} from "../../utils/ui/analytics.utils";

const createRoleLocator = (options: { visible: boolean; onClick?: () => void }) => ({
  first() {
    return this;
  },
  async waitFor() {
    if (!options.visible) {
      throw new Error("Role button not visible");
    }
  },
  async click() {
    options.onClick?.();
  }
});

test.describe("Analytics helpers coverage", () => {
  test("acceptAnalyticsCookiesOnPage clicks the visible analytics button by role", async () => {
    const clicks: string[] = [];
    const page = {
      getByRole: () => createRoleLocator({ visible: true, onClick: () => clicks.push("role") }),
      evaluate: async () => false
    };

    await expect(acceptAnalyticsCookiesOnPage(page as never)).resolves.toBe(true);
    expect(clicks).toEqual(["role"]);
  });

  test("acceptAnalyticsCookiesOnPage falls back to deep DOM evaluation when role lookup is not visible", async () => {
    const page = {
      getByRole: () => createRoleLocator({ visible: false }),
      evaluate: async () => true
    };

    await expect(acceptAnalyticsCookiesOnPage(page as never)).resolves.toBe(true);
  });

  test("ensureAnalyticsAccepted adds the manage-cases analytics cookie without forcing a reload", async () => {
    const addedCookies: Array<Record<string, unknown>> = [];
    const context = {
      async cookies() {
        return [{ name: "__userid__", value: "user-1" }];
      },
      async addCookies(cookies: Array<Record<string, unknown>>) {
        addedCookies.push(...cookies);
      }
    };

    const page = {
      getByRole: () => createRoleLocator({ visible: false }),
      evaluate: async () => false,
      context: () => context,
      url: () => "https://manage-case.aat.platform.hmcts.net/cases/case-details/PRIVATELAW/PRLAPPS/1690807693531270",
      reload: async () => {
        throw new Error("ensureAnalyticsAccepted should not reload the page");
      }
    };

    await expect(ensureAnalyticsAccepted(page as never)).resolves.toBe(true);
    expect(addedCookies).toHaveLength(1);
    expect(addedCookies[0]).toMatchObject({
      name: "hmcts-exui-cookies-user-1-mc-accepted",
      value: "true",
      secure: false,
      sameSite: "Lax"
    });
  });
});
