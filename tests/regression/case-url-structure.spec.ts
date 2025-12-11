import { expect } from "@playwright/test";

import { test } from "../../fixtures/test";

const FALLBACK_CASE_AAT = "1746778909032144";
const FALLBACK_CASE_DEMO = "1662020492250902";
const CASE_REFERENCE =
  process.env.URL_CASE_REFERENCE ??
  (process.env.APP_BASE_URL?.includes("demo") ? FALLBACK_CASE_DEMO : FALLBACK_CASE_AAT);
const EXPECTED_JURISDICTION = process.env.URL_JURISDICTION_SEGMENT;
const EXPECTED_CASETYPE = process.env.URL_CASETYPE_SEGMENT;

test.describe("@regression @navigation Case URL structure", () => {
  test.beforeEach(async ({ loginAs }) => {
    await loginAs("SOLICITOR");
  });

  test("Global search builds jurisdiction/caseType aware URL", async ({ page, axeUtils }) => {
    await page.getByRole("link", { name: "Search" }).click();
    await expect(page.getByRole("heading", { name: /Search cases/i })).toBeVisible();
    const caseInput = page.getByLabel("16-digit case reference", { exact: true });
    await caseInput.fill(CASE_REFERENCE);
    await page.getByRole("button", { name: "Search" }).click();

    await expect(page.getByRole("link", { name: "Print" })).toBeVisible();
    await axeUtils.audit();

    const { pathname } = new URL(page.url());
    const parts = pathname.split("/").filter(Boolean);
    const hasSegments = parts.length >= 6; // e.g. cases/case-details/<jurisdiction>/<caseType>/<id>
    expect(hasSegments).toBeTruthy();
    const jurisdictionSegment = parts.at(-3);
    const caseTypeSegment = parts.at(-2);
    expect(parts.at(-1)).toContain(CASE_REFERENCE);
    if (EXPECTED_JURISDICTION) {
      expect(jurisdictionSegment).toContain(EXPECTED_JURISDICTION);
    } else {
      expect(jurisdictionSegment?.length).toBeGreaterThan(0);
    }
    if (EXPECTED_CASETYPE) {
      expect(caseTypeSegment).toContain(EXPECTED_CASETYPE);
    } else {
      expect(caseTypeSegment?.length).toBeGreaterThan(0);
    }
  });
});
