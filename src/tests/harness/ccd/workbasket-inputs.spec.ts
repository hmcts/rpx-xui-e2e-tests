import fs from "node:fs";
import { test, expect } from "../../../fixtures/harnessCcd";

const source = JSON.parse(fs.readFileSync("scripts/fixtures/ccd/workbasket-input.source.json", "utf8"));
const rows = source.sources[0].rows.map((entry: { row: { CaseFieldID: string; FieldShowCondition?: string } }) => entry.row);
const courtByArea = new Map([
  ["SWANSEA", "swanseaDFJCourt"],
  ["HUMBERSIDE", "humbersideDFJCourt"],
  ["ESSEX_AND_SUFFOLK", "essexAndSuffolkDFJCourt"],
  ["WOLVERHAMPTON", "wolverhamptonDFJCourt"],
]);

test("PRL source workbasket inputs render through the candidate and CCD", {
  annotation: { type: "harness-proof", description: process.env.EXUI_HARNESS_MUTATION
    ? "ccd-prl-workbasket-inputs-fault" : "ccd-prl-workbasket-inputs" },
}, async ({ page }) => {
  const jurisdictionsPromise = page.waitForResponse(response => response.url().includes("/jurisdictions") && response.url().includes("aggregated"), { timeout: 15_000 });
  const responsePromise = page.waitForResponse(response => response.url().includes("work-basket-inputs"), { timeout: 15_000 });
  await test.step("harness-assertion:workbasket-page-load", async () => {
    await page.goto("/cases/case-list", { waitUntil: "domcontentloaded", timeout: 15_000 });
  }, { timeout: 20_000 });
  await test.step("harness-assertion:workbasket-navigation", async () => {
    const jurisdictions = await jurisdictionsPromise;
    expect(jurisdictions.status()).toBe(200);
    const body = await jurisdictions.json();
    expect(body[0]?.id).toBe("HARNESS");
    expect(body[0]?.caseTypes[0]?.id).toBe("HarnessResultsPRL");
    await expect(page.getByRole("combobox", { name: "Case type" })).toBeVisible({ timeout: 10_000 });
  });
  const response = await responsePromise;
  await test.step("harness-assertion:workbasket-source-field", async () => {
    expect(response.status()).toBe(200);
    const descriptor = await response.json();
    expect(descriptor.workbasketInputs.map((input: { field: { id: string } }) => input.field.id))
      .toEqual(rows.map((row: { CaseFieldID: string }) => row.CaseFieldID));
    const area = page.getByRole("combobox", { name: "DFJ Area" });
    await expect(area).toBeVisible();
    for (const label of ["Case name", "Familyman number", "CCD number", "Day", "Month", "Year"])
      await expect(page.getByRole("textbox", { name: label })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Court" })).toHaveCount(0);
    for (const application of ["C100 Child Arrangements Application", "FL401 Non-Molestation &/or Occupation Order Application"])
      await expect(page.getByRole("radio", { name: application })).toBeVisible();
    for (const [area, court] of courtByArea) {
      const label = source.sources[3].rows.find((item: { row: { ID: string; ListElementCode: string; ListElement: string } }) =>
        item.row.ID === "DFJArea" && item.row.ListElementCode === area)?.row.ListElement;
      expect(label).toBeTruthy();
      await page.getByRole("combobox", { name: "DFJ Area" }).selectOption({ label }, { timeout: 5_000 });
      const selectedCourt = page.getByRole("combobox", { name: "Court" });
      await expect(selectedCourt).toHaveCount(1);
      await expect(selectedCourt).toHaveAttribute("id", court);
      expect(rows.some((row: { CaseFieldID: string; FieldShowCondition?: string }) =>
        row.CaseFieldID === court && row.FieldShowCondition?.includes(area))).toBe(true);
    }
  }, { timeout: 30_000 });
});
