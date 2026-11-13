import fs from "node:fs";

import { createIaCapture } from "../../../../scripts/lib/exui-business-scalar-detail.cjs";
import { test, expect } from "../../../fixtures/harness";
const organisationFamily =
  process.env.EXUI_SCOPE_PERSONA === "civil" ? "CIVIL" : "IA";
const caseFamily = organisationFamily === "IA" ? "CIVIL" : "IA";
const serviceCodes: Record<string, string[]> = {
  IA: ["BFA1"],
  CIVIL: ["AAA6", "AAA7"],
};

test(
  "my-work filter only offers organisation-scoped services and emits scoped location query",
  {
    annotation: {
      type: "harness-proof",
      description: process.env.EXUI_HARNESS_MUTATION
        ? "wa-scope-broadened"
        : `wa-org-scope-${organisationFamily.toLowerCase()}`,
    },
  },
  async ({ page }, info) => {
    const context = JSON.parse(
      fs.readFileSync(process.env.EXUI_EVIDENCE_CONTEXT!, "utf8"),
    );
    const capture = createIaCapture(
      organisationFamily,
      info.annotations.find((a) => a.type === "harness-proof")!.description!,
      {
        runId: context.runId,
        invocationId: context.invocationId,
        testId: info.testId,
        retry: info.retry,
      },
    );
    try {
      const tasksLoaded = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === "/workallocation/task" &&
          response.request().method() === "POST" &&
          Boolean(
            response.request().postDataJSON().searchRequest
              .pagination_parameters,
          ),
      );
      await page.goto("/work/my-work/list");
      await (await tasksLoaded).finished();
      await expect(
        page.getByRole("cell", {
          name: "You have no assigned tasks.",
          exact: true,
        }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Show work filter", exact: true })
        .click();
      const filter = page.locator("exui-my-work-filter");

      await test.step("harness-assertion:organisation-scope", async () => {
        capture.attempt(["visibleServices"]);
        const values = await filter
          .locator('input[type="checkbox"][name^="checkbox_services"]')
          .evaluateAll((inputs) =>
            inputs
              .map((input) => (input as HTMLInputElement).value)
              .filter((value) => value !== "services_all"),
          );
        capture.record("visibleServices", values);
        expect(values).toEqual([organisationFamily]);
      });

      await expect(
        filter.locator(`input[type="checkbox"][value="${caseFamily}"]`),
      ).toHaveCount(0);
      const selectedLocation = filter.getByRole("link", {
        name: "Synthetic Hearing Centre",
        exact: true,
      });

      await test.step("harness-assertion:location-selection", async () => {
        await expect(selectedLocation).toBeVisible();
        await selectedLocation.click();
        await expect(selectedLocation).toHaveCount(0);
      });

      const location = filter.getByRole("combobox").first();
      const searchRequest = page.waitForRequest(
        (request) =>
          new URL(request.url()).pathname === "/api/locations/getLocations" &&
          request.method() === "POST",
      );
      const locationResponse = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === "/api/locations/getLocations" &&
          response.request().method() === "POST",
      );
      capture.attempt(["requestServices", "responseStatus"]);
      await location.pressSequentially("Synthetic");
      const payload = (await searchRequest).postDataJSON();
      capture.record(
        "requestServices",
        typeof payload.serviceIds === "string"
          ? payload.serviceIds.split(",")
          : payload.serviceIds,
      );

      await test.step("harness-assertion:organisation-scope-query", async () => {
        expect(payload.serviceIds).toBe(organisationFamily);
      });

      const actualLocationResponse = await locationResponse;
      capture.record("responseStatus", actualLocationResponse.status());
      expect(actualLocationResponse.ok()).toBeTruthy();
      capture.attempt(["providerCodes"]);
      await expect
        .poll(() => {
          const values = fs
            .readFileSync(process.env.EXUI_PROVIDER_REQUESTS!, "utf8")
            .trim()
            .split("\n")
            .map(
              (line) =>
                JSON.parse(line) as {
                  path: string;
                  query: Record<string, string>;
                },
            )
            .filter(
              (item) =>
                item.path === "/refdata/location/court-venues/venue-search",
            )
            .map((item) => item.query.service_code.split(",").sort());
          capture.providerPoll(values);
          return values;
        })
        .toEqual([serviceCodes[organisationFamily].sort()]);

      await test.step("harness-assertion:location-search-results", async () => {
        const suggestion = page.getByRole("option", {
          name: "Synthetic Hearing Centre",
          exact: true,
        });
        await expect(suggestion).toBeVisible();
        await expect(page.getByRole("option")).toHaveText([
          "Synthetic Hearing Centre",
        ]);
        await suggestion.click();
        await filter
          .getByRole("link", { name: "Add location", exact: true })
          .click();
        await expect(selectedLocation).toBeVisible();
      });
    } finally {
      await capture.publish(info);
    }
  },
);
