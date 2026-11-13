import fs from "node:fs";

import {
  test,
  expect,
  observeCcd,
  submitCcdCreate,
} from "../../../fixtures/harnessCcd";

test(
  "source-backed postal recipients validate postcode lookup and preserve manual addresses",
  {
    annotation: {
      type: "harness-proof",
      description: process.env.EXUI_HARNESS_MUTATION
        ? "ccd-postal-child-loss"
        : "ccd-postal-two-roundtrip",
    },
  },
  async ({ page }) => {
    await test.step("harness-detail:postal-open-create", async () => {
      await page.goto("/cases/case-create/HARNESS/HarnessNestedPRL/create");
    });

    await test.step("harness-detail:postal-select-two-recipients", async () => {
      await page.getByRole("button", { name: "Add new", exact: true }).click();
      await page.getByLabel("Post", { exact: true }).check();
      await page
        .getByRole("button", { name: "Add new", exact: true })
        .last()
        .click();
      await page.getByLabel("Post", { exact: true }).last().check();
    });

    const postcodeLookups = page.locator('input[id$="postcodeInput"]');
    const names = page.locator('input[id$="_postalName"]');
    const address1 = page.locator('input[id$="AddressLine1"]');
    const address2 = page.locator('input[id$="AddressLine2"]');
    const postcodes = page.locator('input[id$="PostCode"]');

    await test.step("harness-detail:postal-check-conditional-fields", async () => {
      await expect(names).toHaveCount(2);
      await expect(names.first()).toBeVisible();
      await expect(names.last()).toBeVisible();
      await expect(
        page.locator('input[id$="_emailName"]').first(),
      ).toBeHidden();
      await expect(page.locator('input[id$="_emailName"]').last()).toBeHidden();
      await expect(
        page.locator('input[id$="_emailAddress"]').first(),
      ).toBeHidden();
      await expect(
        page.locator('input[id$="_emailAddress"]').last(),
      ).toBeHidden();
      await expect(postcodeLookups).toHaveCount(2);
    });

    await test.step("harness-detail:postal-submit-empty-lookups", async () => {
      await page.getByRole("button", { name: "Continue", exact: true }).click();
    });

    await test.step("harness-assertion:postal-required-fields", async () => {
      await expect(postcodeLookups.first()).toHaveClass(/govuk-input--error/);
      await expect(postcodeLookups.last()).toHaveClass(/govuk-input--error/);
      await expect(
        page.getByText("Check your answers", { exact: false }),
      ).toBeHidden();
    });

    await test.step("harness-detail:postal-enter-manual-addresses", async () => {
      await page
        .getByRole("link", { name: "I can't enter a UK postcode", exact: true })
        .first()
        .click();
      await page
        .getByRole("link", { name: "I can't enter a UK postcode", exact: true })
        .last()
        .click();
      await names.first().fill("Synthetic postal first");
      await names.last().fill("Synthetic postal second");
      await address1.first().fill("First synthetic street");
      await address1.last().fill("Second synthetic street");
      await address2.first().fill("First synthetic suite");
      await address2.last().fill("Second synthetic suite");
      await postcodes.first().fill("SW1A 1AA");
      await postcodes.last().fill("M1 1AA");
      await page.locator("#protectedValue").fill("synthetic-postal-sequence");
    });

    await test.step("harness-detail:postal-check-first-summary", async () => {
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await expect(
        page.getByText("Check your answers", { exact: false }),
      ).toBeVisible();
      await expect(
        page.getByText("Synthetic postal first", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText("Synthetic postal second", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText("First synthetic suite", { exact: false }).last(),
      ).toBeVisible();
      await expect(
        page.getByText("Second synthetic suite", { exact: false }).last(),
      ).toBeVisible();
    });

    await test.step("harness-detail:postal-edit-second-address", async () => {
      await page
        .getByRole("link", { name: /Change/ })
        .first()
        .click();
      await expect(names).toHaveCount(2);
      await expect(postcodes.first()).toHaveValue("SW1A 1AA");
      await expect(postcodes.last()).toHaveValue("M1 1AA");
      await address2.last().fill("Second synthetic suite edited");
      await page.getByRole("button", { name: "Continue", exact: true }).click();
    });

    await test.step("harness-detail:postal-check-previous-roundtrip", async () => {
      await page.getByRole("button", { name: "Previous", exact: true }).click();
      await expect(names.first()).toHaveValue("Synthetic postal first");
      await expect(address2.first()).toHaveValue("First synthetic suite");
      await expect(address2.last()).toHaveValue(
        "Second synthetic suite edited",
      );
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await expect(
        page
          .getByText("Second synthetic suite edited", { exact: false })
          .last(),
      ).toBeVisible();
    });

    const observed =
      await test.step("harness-detail:postal-submit-and-readback", async () => {
        const submitted = await submitCcdCreate(page);
        expect(submitted.status()).toBe(201);
        return await observeCcd(String((await submitted.json()).id));
      });

    await test.step("harness-detail:postal-write-readback-artifact", async () => {
      fs.writeFileSync(
        `${process.env.EXUI_CCD_EVIDENCE}/postal-readback.json`,
        JSON.stringify(observed, null, 2),
      );
    });

    await test.step("harness-assertion:postal-persistence", async () => {
      const recipients = observed.state.case_data.sodAdditionalRecipientsList;
      expect(recipients).toHaveLength(2);
      expect(
        recipients.map(
          (item: {
            value: { serveByPostOrEmail: string; postalInformation: unknown };
          }) => ({
            serveByPostOrEmail: item.value.serveByPostOrEmail,
            postalInformation: item.value.postalInformation,
          }),
        ),
      ).toEqual([
        {
          serveByPostOrEmail: "post",
          postalInformation: {
            postalName: "Synthetic postal first",
            postalAddress: {
              AddressLine1: "First synthetic street",
              AddressLine2: "First synthetic suite",
              AddressLine3: null,
              PostTown: null,
              County: null,
              PostCode: "SW1A 1AA",
              Country: null,
            },
          },
        },
        {
          serveByPostOrEmail: "post",
          postalInformation: {
            postalName: "Synthetic postal second",
            postalAddress: {
              AddressLine1: "Second synthetic street",
              AddressLine2: "Second synthetic suite edited",
              AddressLine3: null,
              PostTown: null,
              County: null,
              PostCode: "M1 1AA",
              Country: null,
            },
          },
        },
      ]);
      expect(observed.state.case_data.protectedValue).toBe(
        "synthetic-postal-sequence",
      );
      // Unselected email subtrees are retained in the raw artifact, with no deletion or PRL-role claim inferred from visibility.
    });
  },
);
