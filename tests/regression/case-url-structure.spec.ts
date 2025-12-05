import { expect } from "@playwright/test";

import { test } from "../../fixtures/test";

const CASE_REFERENCE = process.env.URL_CASE_REFERENCE;
const EXPECTED_JURISDICTION = process.env.URL_JURISDICTION_SEGMENT;
const EXPECTED_CASETYPE = process.env.URL_CASETYPE_SEGMENT;

const hasConfig =
  Boolean(CASE_REFERENCE?.trim()) &&
  Boolean(EXPECTED_JURISDICTION?.trim()) &&
  Boolean(EXPECTED_CASETYPE?.trim());

test.describe("@regression @navigation Case URL structure", () => {
  // eslint-disable-next-line playwright/no-skipped-test
  test.skip(!hasConfig, "URL_CASE_* env vars not configured for this environment");

  test.beforeEach(async ({ loginAs }) => {
    await loginAs("SOLICITOR");
  });

  test("Global search builds jurisdiction/caseType aware URL", async ({ page, axeUtils }) => {
    await page.getByRole("link", { name: "Search" }).click();
    await expect(page.getByRole("heading", { name: "Search cases" })).toBeVisible();
    const caseInput = page.getByLabel("16-digit case reference", { exact: true });
    await caseInput.fill(CASE_REFERENCE!);
    await page.getByRole("button", { name: "Search" }).click();

    await expect(page.getByRole("link", { name: "Print" })).toBeVisible();
    await axeUtils.audit();

    const { pathname } = new URL(page.url());
    expect(pathname).toContain(EXPECTED_JURISDICTION!);
    expect(pathname).toContain(EXPECTED_CASETYPE!);
    expect(pathname).toContain(CASE_REFERENCE!);
  });
});
