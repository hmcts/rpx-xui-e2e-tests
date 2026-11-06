import fs from "node:fs";
import path from "node:path";

import { expect, type Page, type PlaywrightWorkerArgs } from "@playwright/test";

import { waitForCallbackFirstPage } from "./harnessCallbackJourney";
import { bootstrapCcdEventCase, switchCcdEventActor, openCcdEventCase, openServiceOfDocuments, submitServiceOfDocuments, ccdEventPersonas, ccdSessionRequest, observeCcd } from "./harnessCcdEvent";

const heading = "Select additional recipients who needs to be served";
const selectorName = "Additional recipients (optional)";
const summaryRow = (page: Page, label: string) => page.locator("tr").filter({ has: page.locator("th.case-field-label").filter({ hasText: new RegExp(`^${label}$`) }) });

export async function runSelectorEventRow({ page, playwright, variant, step, mode = "feasibility", invocationId }: {
  page: Page; playwright: PlaywrightWorkerArgs["playwright"];
  variant: "baseline" | "summary-hidden";
  step: (title: string, body: () => Promise<void>) => Promise<void>;
  mode?: "feasibility" | "native"; invocationId?: string;
}) {
  const directory = process.env.EXUI_CCD_EVIDENCE!;
  const initialInput = JSON.parse(fs.readFileSync("/output/input.json", "utf8"));
  const input = mode === "native" && variant !== "baseline"
    ? JSON.parse(fs.readFileSync(path.join(directory,"runtime-input.json"),"utf8")).runtime
    : initialInput;
  const observation: Record<string, unknown> = { schemaVersion: 1, kind: mode === "native" ? "native-selector-event-row-observation" : "selector-event-row-observation", ...(mode === "native" ? { invocationId } : {}), variant, sourceBinding: input.selectorEventBinding, catalogueCredit: false, releaseCredit: false, completed: false };
  const ui: Record<string, unknown> = {}; observation.ui = ui;
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
    const navigation = [new URL(page.url()).pathname];
    ui.predecessorLabel = await page.getByText("Protected value", { exact: true }).textContent();
    ui.predecessorEditableControls = await page.locator("input#protectedValue, textarea#protectedValue").count();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/trigger/serviceOfDocuments/serviceOfDocuments2$`));
    navigation.push(new URL(page.url()).pathname);
    return { caseId, navigation };
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
  const empty = await prepare({ protectedValue: "selector-empty-control", sodAdditionalRecipients: [], sodAdditionalRecipientsList: [] });
  const emptyBefore = await observeCcd(empty.caseId);
  await expect(page.getByLabel(selectorName, { exact: true })).not.toBeChecked();
  observation.optionalEmpty = await continueToCya();
  observation.optionalEmptyState = { caseId: empty.caseId, before: emptyBefore, after: await observeCcd(empty.caseId), cyaHeading: await page.getByText("Check your answers", { exact: false }).textContent(), cyaPath: new URL(page.url()).pathname };
  save();

  const data = { protectedValue: "selector-persistence-control", sodAdditionalRecipients: [] as string[], sodAdditionalRecipientsList: [
    { id: "11111111-1111-4111-8111-111111111111", value: { serveByPostOrEmail: "email", emailInformation: { emailName: "Selector recipient", emailAddress: "selector@harness.example.com" }, postalInformation: { postalName: null, postalAddress: { AddressLine1: null, AddressLine2: null, AddressLine3: null, PostTown: null, County: null, PostCode: null, Country: null } } } },
  ] };
  const selected = await prepare(data), { caseId, navigation } = selected;
  ui.navigation = navigation; observation.caseId = caseId;
  const before = await observeCcd(caseId);
  expect(before.state.case_data).toEqual(data);
  const selector = page.getByLabel(selectorName, { exact: true });
  await expect(selector).not.toBeChecked();
  ui.selectorInitiallyChecked = await selector.isChecked();
  await selector.check();
  await expect(selector).toBeChecked();
  ui.selectorAfterCheck = await selector.isChecked();
  await page.getByRole("button", { name: "Previous", exact: true }).click();
  await waitForCallbackFirstPage(page, caseId);
  navigation.push(new URL(page.url()).pathname);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page).toHaveURL(/\/trigger\/serviceOfDocuments\/serviceOfDocuments2$/);
  navigation.push(new URL(page.url()).pathname);
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
  ui.siblingLabel = await sibling.locator("th.case-field-label").textContent();
  ui.siblingValue = await sibling.getByText("Selector recipient", { exact: true }).textContent();
  ui.cyaHeading = await page.getByText("Check your answers", { exact: false }).textContent();
  ui.cyaPath = new URL(page.url()).pathname;
  const row = summaryRow(page, heading);
  observation.selectedCya = { validation, selectorChecked: true, selectorPrecedesRecipient, predecessorRoundTrip: true, healthySiblingCount: await sibling.count(), selectorSummaryCount: await row.count() };
  observation.before = before;
  save();
  if (variant === "summary-hidden") {
    await expect(row).toHaveCount(0);
    observation.afterFault = await observeCcd(caseId);
    expect(observation.afterFault).toEqual(before);
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
  ui.selectorSummaryLabel = await row.locator("th.case-field-label").textContent();
  ui.selectorSummaryValue = await row.getByText(selectorName, { exact: true }).textContent();
  const change = row.getByRole("link", { name: `Change ${heading}`, exact: true });
  await expect(change).toHaveAccessibleName(`Change ${heading}`);
  const name = /^- link ("[^"\n]+")(?::|$)/.exec(await change.ariaSnapshot());
  expect(name).not.toBeNull(); ui.changeAccessibleName = JSON.parse(name![1]) as string;
  await change.click();
  await expect(page).toHaveURL(/\/trigger\/serviceOfDocuments\/serviceOfDocuments2$/);
  await expect(selector).toBeChecked(); await expect(names.first()).toHaveValue("Selector recipient");
  ui.changeTarget = new URL(page.url()).pathname; ui.selectedAfterChange = await selector.isChecked();
  observation.changeRoundTrip = true;
  await continueToCya();
  observation.beforeSubmit = await observeCcd(caseId);
  expect(observation.beforeSubmit).toEqual(before);
  const submitted = await submitServiceOfDocuments(page, caseId);
  expect(submitted.status()).toBe(201);
  const payload = submitted.request().postDataJSON();
  // Retain only synthetic semantic data. Never persist event_token or headers.
  observation.submission = { method: submitted.request().method(), path: new URL(submitted.url()).pathname, status: submitted.status(), eventId: payload.event.id, data: payload.data };
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
