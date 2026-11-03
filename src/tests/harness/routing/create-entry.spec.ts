import { test, expect } from "../../../fixtures/harnessRouting";
import {
  routingJournal,
  routingArrival,
  selectRoutingEvent,
} from "../../../harness/routing";

test(
  "actual Create filter redirects configured external entry and renders ordinary/unmatched local fallback",
  {
    annotation: {
      type: "harness-proof",
      description: process.env.EXUI_HARNESS_MUTATION
        ? "routing-web-url-omission"
        : "routing-create-redirect-fallback",
    },
  },
  async ({ page }) => {
    const before = routingJournal().length;
    await selectRoutingEvent(page, "PCS", "ext:routing-create");
    expect(
      await page.evaluate(() =>
        (() => {
          const user = JSON.parse(
            sessionStorage.getItem("userDetails") ?? "{}",
          );
          return user.id || user.uid || null;
        })(),
      ),
    ).toBe("harness-supervisor");
    await page.getByRole("button", { name: "Start", exact: true }).click();
    const arrival = await routingArrival(before, "ui");

    await test.step("harness-assertion:event-redirect", async () => {
      expect(arrival).toEqual({
        port: 3103,
        method: "GET",
        path: "/pcs-ui/cases/case-create/PCS/PCS/ext%3Arouting-create",
        query: [["expected_sub", "harness-supervisor"]],
        body: null,
      });
      expect(
        routingJournal()
          .slice(before)
          .filter((item) => item.path.startsWith("/internal/case-types/")),
      ).toEqual([]);
    });

    await expect(page).toHaveURL(
      "http://127.0.0.1:3103/pcs-ui/cases/case-create/PCS/PCS/ext%3Arouting-create?expected_sub=harness-supervisor",
    );
    await expect(page.locator("body")).toHaveText(
      "Synthetic PCS routing destination",
    );

    const ordinary = routingJournal().length;
    await selectRoutingEvent(page, "PCS", "routing-local");
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await expect(
      page.getByLabel("Routing marker (Optional)", { exact: true }),
    ).toHaveValue("synthetic");
    await expect(page).toHaveURL(
      /\/cases\/case-create\/PCS\/PCS\/routing-local(?:\/|$)/,
    );
    expect(
      routingJournal()
        .slice(ordinary)
        .filter((item) => item.port === 3103),
    ).toEqual([]);
    expect(routingJournal().slice(ordinary)).toContainEqual({
      port: 3101,
      method: "GET",
      path: "/internal/case-types/PCS/event-triggers/routing-local",
      query: [["ignore-warning", "false"]],
      body: null,
    });

    const unmatched = routingJournal().length;
    await selectRoutingEvent(page, "RoutingUnmapped", "ext:routing-create");
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await expect(
      page.getByLabel("Routing marker (Optional)", { exact: true }),
    ).toHaveValue("synthetic");
    await expect(page).toHaveURL(
      /\/cases\/case-create\/PCS\/RoutingUnmapped\/ext(?::|%3A)routing-create(?:\/|$)/,
    );
    expect(
      routingJournal()
        .slice(unmatched)
        .filter((item) => item.port === 3103),
    ).toEqual([]);
    expect(routingJournal().slice(unmatched)).toContainEqual({
      port: 3101,
      method: "GET",
      path: "/internal/case-types/RoutingUnmapped/event-triggers/ext:routing-create",
      query: [["ignore-warning", "false"]],
      body: null,
    });
  },
);
