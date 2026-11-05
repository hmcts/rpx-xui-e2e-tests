import fs from "node:fs";
import path from "node:path";

import { expect, type Page, type PlaywrightWorkerArgs } from "@playwright/test";

import { waitForCallbackFirstPage } from "./harnessCallbackJourney";
import { bootstrapCcdEventCase, switchCcdEventActor, openCcdEventCase, openServiceOfDocuments, submitServiceOfDocuments, ccdEventPersonas, ccdSessionRequest, observeCcd } from "./harnessCcdEvent";

const heading = "Select additional recipients who needs to be served";
const selectorName = "Additional recipients (optional)";
const summaryRow = (page: Page, label: string) => page.locator("tr").filter({ has: page.locator("th.case-field-label").filter({ hasText: new RegExp(`^${label}$`) }) });

export async function runSelectorEventRow({ page, playwright, variant, step }: {
  page: Page; playwright: PlaywrightWorkerArgs["playwright"];
  variant: "baseline" | "summary-hidden";
  step: (title: string, body: () => Promise<void>) => Promise<void>;
}) {
  const directory = process.env.EXUI_CCD_EVIDENCE!;
  const input = JSON.parse(fs.readFileSync("/output/input.json", "utf8"));
  const observation: Record<string, unknown> = { schemaVersion: 1, kind: "selector-event-row-observation", variant, sourceBinding: input.selectorEventBinding, catalogueCredit: false, releaseCredit: false, completed: false };
  const save = () => fs.writeFileSync(path.join(directory, "selector-event-row-observation.json"), JSON.stringify(observation, null, 2), { mode: 0o600 });
  const prepare = async (data: Record<string, unknown>) => {
    const actor = await ccdSessionRequest(playwright, ccdEventPersonas().sessions.allowed);
    let created;
    try { created = await bootstrapCcdEventCase(actor, data); } finally { await actor.dispose(); }
    expect(created.trigger.status()).toBe(200); expect(created.created.status()).toBe(201);
    const caseId = String(created.body.id); expect(caseId).toMatch(/^\d{16}$/);
    await switchCcdEventActor(page, "courtadmin");
    expect((await openCcdEventCase(page, caseId)).status()).toBe(200);
    expect((await openServiceOfDocuments(page, caseId)).status()).toBe(200);
    await waitForCallbackFirstPage(page, caseId);
    await expect(page.getByText("Protected value", { exact: true })).toBeVisible();
    await expect(page.locator("input#protectedValue, textarea#protectedValue")).toHaveCount(0);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/trigger/serviceOfDocuments/serviceOfDocuments2$`));
    return caseId;
  };
  const continueToCya = async () => {
    const response = page.waitForResponse(r => r.request().method() === "POST" && new URL(r.url()).pathname === "/data/case-types/HarnessNestedPRL/validate");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    const validation = await response;
    expect(new URL(validation.url()).searchParams.get("pageId")).toBe("serviceOfDocuments2");
    expect(validation.status()).toBe(200);
    await expect(page.getByText("Check your answers", { exact: false })).toBeVisible();
    return { status: validation.status(), pageId: "serviceOfDocuments2" };
  };

  // Separate cases keep the optional-empty observation independent of the
  // toolkit's hidden-field clearing behaviour during the selected-value proof.
  await prepare({ protectedValue: "selector-empty-control", sodAdditionalRecipients: [], sodAdditionalRecipientsList: [] });
  await expect(page.getByLabel(selectorName, { exact: true })).not.toBeChecked();
  observation.optionalEmpty = await continueToCya();
  save();

  const data = { protectedValue: "selector-persistence-control", sodAdditionalRecipients: [] as string[], sodAdditionalRecipientsList: [
    { id: "11111111-1111-4111-8111-111111111111", value: { serveByPostOrEmail: "email", emailInformation: { emailName: "Selector recipient", emailAddress: "selector@harness.example.com" }, postalInformation: { postalName: null, postalAddress: { AddressLine1: null, AddressLine2: null, AddressLine3: null, PostTown: null, County: null, PostCode: null, Country: null } } } },
  ] };
  const caseId = await prepare(data);
  const before = await observeCcd(caseId);
  expect(before.state.case_data).toEqual(data);
  const selector = page.getByLabel(selectorName, { exact: true });
  await expect(selector).not.toBeChecked();
  await selector.check();
  await expect(selector).toBeChecked();
  await page.getByRole("button", { name: "Previous", exact: true }).click();
  await waitForCallbackFirstPage(page, caseId);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page).toHaveURL(/\/trigger\/serviceOfDocuments\/serviceOfDocuments2$/);
  await expect(selector).toBeChecked();
  const names = page.locator('input[id$="_emailName"]');
  await expect(names).toHaveCount(1); await expect(names.first()).toHaveValue("Selector recipient");
  const selectorPrecedesRecipient = await selector.evaluate(element => {
    const recipient = document.querySelector('input[id$="_emailName"]');
    return Boolean(recipient && (element.compareDocumentPosition(recipient) & Node.DOCUMENT_POSITION_FOLLOWING));
  });
  expect(selectorPrecedesRecipient).toBe(true);
  const validation = await continueToCya();
  const sibling = summaryRow(page, "Recipient");
  await expect(sibling).toHaveCount(1);
  await expect(sibling.getByText("Selector recipient", { exact: true })).toBeVisible();
  const row = summaryRow(page, heading);
  observation.selectedCya = { validation, selectorChecked: true, selectorPrecedesRecipient, predecessorRoundTrip: true, healthySiblingCount: await sibling.count(), selectorSummaryCount: await row.count() };
  observation.before = before;
  save();
  if (variant === "summary-hidden") {
    await expect(row).toHaveCount(0);
    observation.faultEffective = true; observation.witness = "healthy-cya-without-selector-row"; save();
    await step("harness-assertion:selector-event-summary-row", async () => {
      await expect(row, "SELECTOR_SOURCE_SUMMARY_ROW_REQUIRED").toHaveCount(1);
    });
    return;
  }
  await step("harness-assertion:selector-event-summary-row", async () => {
    await expect(row).toHaveCount(1);
    await expect(row.getByText(selectorName, { exact: true })).toBeVisible();
  });
  await row.getByRole("link", { name: `Change ${heading}`, exact: true }).click();
  await expect(page).toHaveURL(/\/trigger\/serviceOfDocuments\/serviceOfDocuments2$/);
  await expect(selector).toBeChecked(); await expect(names.first()).toHaveValue("Selector recipient");
  observation.changeRoundTrip = true;
  await continueToCya();
  expect(await observeCcd(caseId)).toEqual(before);
  expect((await submitServiceOfDocuments(page, caseId)).status()).toBe(201);
  const after = await observeCcd(caseId);
  observation.after = after; save();
  const intended = { ...before.state.case_data, sodAdditionalRecipients: ["additionalRecipients"] };
  observation.intended = intended; save();
  expect(after.state.case_data).toEqual(intended);
  const added = after.history.filter((entry: { id: string; created_date: string }) => !before.history.some((prior: { id: string; created_date: string }) => prior.id === entry.id && prior.created_date === entry.created_date));
  expect(added).toHaveLength(1);
  expect(added[0]).toMatchObject({ id: "serviceOfDocuments", case_type_id: "HarnessNestedPRL", state_id: "JUDICIAL_REVIEW", user_id: ccdEventPersonas().credentials.courtadmin.userId });
  expect(after.state.state).toBe(before.state.state);
  expect(after.state.version).toBe(before.state.version + 1);
  expect(after.history).toHaveLength(before.history.length + 1);
  observation.completed = true; observation.submissionStatus = 201; save();
}
