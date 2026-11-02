import fs from "node:fs";

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
  async ({ page }) => {
    const tasksLoaded = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/workallocation/task" &&
        response.request().method() === "POST" &&
        Boolean(
          response.request().postDataJSON().searchRequest.pagination_parameters,
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
      const values = await filter
        .locator('input[type="checkbox"][name^="checkbox_services"]')
        .evaluateAll((inputs) =>
          inputs
            .map((input) => (input as HTMLInputElement).value)
            .filter((value) => value !== "services_all"),
        );
      expect(values).toEqual([organisationFamily]);
    });

    await expect(
      filter.locator(`input[type="checkbox"][value="${caseFamily}"]`),
    ).toHaveCount(0);
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
    await location.pressSequentially("Synthetic");
    const payload = (await searchRequest).postDataJSON();

    await test.step("harness-assertion:organisation-scope-query", async () => {
      expect(payload.serviceIds).toBe(organisationFamily);
    });

    expect((await locationResponse).ok()).toBeTruthy();
    await expect
      .poll(() =>
        fs
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
          .map((item) => item.query.service_code.split(",").sort()),
      )
      .toEqual([serviceCodes[organisationFamily].sort()]);
  },
);
