import fs from "node:fs";

import AxeBuilder from "@axe-core/playwright";

import {
  test,
  expect,
  observeCcd,
  submitCcdCreate,
} from "../../../fixtures/harnessCcd";

test(
  "real nested collection CYA and CCD persistence",
  {
    annotation: {
      type: "harness-proof",
      description: process.env.EXUI_HARNESS_MUTATION
        ? "ccd-child-loss"
        : "ccd-nested-roundtrip",
    },
  },
  async ({ page }) => {
    await page.goto("/cases/case-create/HARNESS/HarnessNestedPRL/create");
    await expect(
      page.getByRole("button", { name: "Add new", exact: true }),
    ).toBeVisible();
    await expect(page.locator('input[id$="_emailAddress"]')).toHaveCount(0);
    await page.locator("#protectedValue").fill("synthetic-empty-collection");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(
      page.getByText("Check your answers", { exact: false }),
    ).toBeVisible();
    const emptyResult = await submitCcdCreate(page);
    expect(emptyResult.status()).toBe(201);
    const empty = await observeCcd(String((await emptyResult.json()).id));
    expect(empty.state.case_data.sodAdditionalRecipientsList ?? []).toEqual([]);
    expect(empty.state.case_data.protectedValue).toBe(
      "synthetic-empty-collection",
    );
    await page.goto("/cases/case-create/HARNESS/HarnessNestedPRL/create");
    await page.getByRole("button", { name: "Add new", exact: true }).click();
    await page.getByLabel("Email", { exact: true }).check();
    await page
      .locator('input[id$="_emailName"]')
      .fill("Removed synthetic recipient");
    await page
      .locator('input[id$="_emailAddress"]')
      .fill("removed@harness.example.com");
    await expect(page.locator('input[id$="_postalName"]')).toBeHidden();
    await page
      .getByRole("button", { name: "Add new", exact: true })
      .last()
      .click();
    await expect(
      page.getByRole("button", { name: "Remove Recipient 2", exact: true }),
    ).toBeVisible();
    await page.getByLabel("Email", { exact: true }).last().check();
    await page
      .locator('input[id$="_emailName"]')
      .last()
      .fill("Synthetic nested recipient");
    await page
      .locator('input[id$="_emailAddress"]')
      .last()
      .fill("recipient@harness.example.com");
    await page
      .getByRole("button", { name: "Remove Recipient", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Remove", exact: true })
      .click();
    await expect(page.locator('input[id$="_emailAddress"]')).toHaveCount(1);
    await expect(page.locator('input[id$="_emailAddress"]')).toHaveValue(
      "recipient@harness.example.com",
    );
    await page.locator("#protectedValue").fill("synthetic-browser-original");
    const accessibility = await new AxeBuilder({ page })
      .include("#caseEditForm")
      .withRules([
        "aria-valid-attr",
        "aria-valid-attr-value",
        "button-name",
        "label",
      ])
      .analyze();
    fs.writeFileSync(
      `${process.env.EXUI_CCD_EVIDENCE}/nested-accessibility.json`,
      JSON.stringify(accessibility, null, 2),
    );
    expect(accessibility.violations).toEqual([]);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(
      page.getByText("Check your answers", { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByText("recipient@harness.example.com", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("link", { name: /Change/ })
      .first()
      .click();
    await expect(page.locator('input[id$="_emailAddress"]')).toHaveValue(
      "recipient@harness.example.com",
    );
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByRole("button", { name: "Previous", exact: true }).click();
    await expect(page.locator('input[id$="_emailName"]')).toHaveValue(
      "Synthetic nested recipient",
    );
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.screenshot({
      path: `${process.env.EXUI_CCD_EVIDENCE}/nested-cya.png`,
      fullPage: true,
    });
    const result = await submitCcdCreate(page);

    expect(result.status()).toBe(201);
    const id = String((await result.json()).id);
    const observed = await observeCcd(id);
    fs.writeFileSync(
      `${process.env.EXUI_CCD_EVIDENCE}/nested-readback.json`,
      JSON.stringify(
        {
          empty,
          nonempty: observed,
          collectionReorder:
            "unsupported by installed collection editor; add/remove/order preservation exercised",
        },
        null,
        2,
      ),
    );

    await test.step("harness-assertion:nested-persistence", async () => {
      expect(
        observed.state.case_data.sodAdditionalRecipientsList.map(
          (item: { value: unknown }) => item.value,
        ),
      ).toEqual([
        {
          serveByPostOrEmail: "email",
          emailInformation: {
            emailName: "Synthetic nested recipient",
            emailAddress: "recipient@harness.example.com",
          },
          // Hidden controls retain their empty AddressUK shape; visibility does not imply deletion.
          postalInformation: {
            postalName: null,
            postalAddress: {
              AddressLine1: null,
              AddressLine2: null,
              AddressLine3: null,
              PostTown: null,
              County: null,
              PostCode: null,
              Country: null,
            },
          },
        },
      ]);
    });
  },
);
