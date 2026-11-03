import fs from "node:fs";

import { test, expect } from "../../../fixtures/harness";

// Reviewed independently of candidate constants and refdata: this fixture defines the pilot obligation.
const families = [
  "CIVIL",
  "EMPLOYMENT",
  "IA",
  "PCS",
  "PRIVATELAW",
  "PUBLICLAW",
  "ST_CIC",
];

test(
  "candidate WA families and selected-family request",
  {
    annotation: {
      type: "harness-proof",
      description: process.env.EXUI_HARNESS_MUTATION
        ? "wa-missing-family"
        : "wa-family-options",
    },
  },
  async ({ page }) => {
    await page.goto("/work/all-work/tasks");
    const service = page.locator("exui-task-manager-filter select").first();
    await expect(service).toBeVisible();

    await test.step("harness-assertion:family-membership", async () => {
      const options = service.locator('option:not([value=""])');
      await expect(options).toHaveCount(families.length);
      expect(
        await options.evaluateAll((items) =>
          items.map((option) => (option as HTMLOptionElement).value).sort(),
        ),
      ).toEqual(families);
    });

    for (const family of families) {
      await service.selectOption(family);
      const request = page.waitForRequest(
        (item) =>
          new URL(item.url()).pathname === "/workallocation/task" &&
          item.method() === "POST",
      );
      await page.getByRole("button", { name: "Apply", exact: true }).click();
      const search = (await request).postDataJSON().searchRequest;

      await test.step("harness-assertion:family-filter", async () => {
        expect(
          search.search_parameters.find(
            (parameter: { key: string }) => parameter.key === "jurisdiction",
          ),
        ).toEqual({ key: "jurisdiction", operator: "IN", values: [family] });
      });

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
                  body: {
                    search_parameters?: { key: string; values: string[] }[];
                  } | null;
                },
            )
            .some(
              (item) =>
                item.path === "/task" &&
                item.body?.search_parameters?.some(
                  (parameter) =>
                    parameter.key === "jurisdiction" &&
                    parameter.values.length === 1 &&
                    parameter.values[0] === family,
                ),
            ),
        )
        .toBeTruthy();
    }
  },
);
