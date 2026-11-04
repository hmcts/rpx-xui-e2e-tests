import fs from "node:fs";
import path from "node:path";

import { test, expect } from "../../../fixtures/harnessCallback";
import { bootstrapCcdEventCase, switchCcdEventActor, openCcdEventCase, openServiceOfDocuments, submitServiceOfDocuments, ccdEventPersonas, ccdSessionRequest, observeCcd } from "../../../fixtures/harnessCcdEvent";
const directory = process.env.EXUI_CCD_EVIDENCE!;
const journal = () => fs.readFileSync(path.join(directory, "recipient-callback.jsonl"), "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line));
// The toolkit materializes these blank conditional controls on submission;
// seed the same explicit shape so whole-data equality never ignores hidden fields.
const emptyPostal = () => ({ postalName: null, postalAddress: { AddressLine1: null, AddressLine2: null, AddressLine3: null, PostTown: null, County: null, PostCode: null, Country: null } });
const save = (value: unknown) => fs.writeFileSync(path.join(directory, "callback-ui-observation.json"), JSON.stringify(value, null, 2), { mode: 0o600 });

test("candidate callback rejects edited data, corrects through CYA and persists normalization", async ({ page, playwright }) => {
  const actor = await ccdSessionRequest(playwright, ccdEventPersonas().sessions.allowed);
  const data = { protectedValue: "synthetic-callback-ui", sodAdditionalRecipients: ["additionalRecipients"], sodAdditionalRecipientsList: [
    { id: "11111111-1111-4111-8111-111111111111", value: { serveByPostOrEmail: "email", emailInformation: { emailName: "HARNESS_CALLBACK_ORIGINAL", emailAddress: "first@harness.example.com" }, postalInformation: emptyPostal() } },
    { id: "22222222-2222-4222-8222-222222222222", value: { serveByPostOrEmail: "email", emailInformation: { emailName: "Synthetic sibling", emailAddress: "second@harness.example.com" }, postalInformation: emptyPostal() } },
  ] };
  let created;
  try { created = await bootstrapCcdEventCase(actor, data); } finally { await actor.dispose(); }
  expect(created.trigger.status()).toBe(200); expect(created.created.status()).toBe(201);
  const caseId = String(created.body.id); expect(caseId).toMatch(/^\d{16}$/);
  const before = await observeCcd(caseId);
  expect(before.state.case_data).toEqual(data);
  await switchCcdEventActor(page, "courtadmin");
  expect((await openCcdEventCase(page, caseId)).status()).toBe(200);
  expect((await openServiceOfDocuments(page, caseId)).status()).toBe(200);
  await expect(page.getByText("Protected value", { exact: true })).toBeVisible();
  await expect(page.locator("input#protectedValue, textarea#protectedValue")).toHaveCount(0);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  const names = page.locator('input[id$="_emailName"]');
  await expect(names).toHaveCount(2);
  await page.getByRole("button", { name: "Previous", exact: true }).click();
  await expect(page.getByText("Protected value", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  const selector = page.getByLabel("Additional recipients (optional)", { exact: true });
  await expect(selector).toBeChecked();
  await selector.uncheck(); await expect(names.first()).toBeHidden();
  await selector.check(); await expect(names.first()).toBeVisible();
  await expect(page.getByText("Recipient", { exact: true }).first()).toBeVisible();
  expect(await selector.evaluate((element) => {
    const recipient = document.querySelector('input[id$="_emailName"]');
    return Boolean(recipient && (element.compareDocumentPosition(recipient) & Node.DOCUMENT_POSITION_FOLLOWING));
  })).toBe(true);
  expect(journal()).toEqual([]);
  await expect(names).toHaveCount(2); await names.first().fill("HARNESS_CALLBACK_REJECT");
  const validate = async () => {
    const response = page.waitForResponse(r => r.request().method() === "POST" && new URL(r.url()).pathname === "/data/case-types/HarnessNestedPRL/validate");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    const observed = await response;
    expect(new URL(observed.url()).searchParams.get("pageId")).toBe("serviceOfDocuments2");
    return observed;
  };
  const rejected = await validate(); const afterRejected = await observeCcd(caseId);
  save({ kind: "callback-ui-feasibility", catalogueCredit: false, phase: "after-validation", caseId, validationStatus: rejected.status(), before, afterRejected, journal: journal() });
  expect(afterRejected).toEqual(before);
  if (process.env.EXUI_CALLBACK_VARIANT === "binding-omitted") {
    expect(rejected.status()).toBe(200);
    await expect(page.getByText("Check your answers", { exact: false })).toBeVisible();
    expect(journal()).toEqual([]);
    save({ kind: "callback-ui-feasibility", catalogueCredit: false, caseId, faultEffective: true, witness: "valid-CYA-without-callback", before, afterRejected });
    expect(journal().some(item => item.outcome === "business-rejected"), "CALLBACK_BINDING_OMISSION_DETECTED").toBe(true);
    return;
  }
  expect(rejected.status()).toBeGreaterThanOrEqual(400); expect(rejected.status()).toBeLessThan(500);
  await expect(page.getByText("HARNESS_CALLBACK_BUSINESS_REJECTION", { exact: false }).first()).toBeVisible();
  expect(journal().some(item => item.outcome === "business-rejected")).toBe(true);
  await names.first().fill("HARNESS_CALLBACK_ORIGINAL");
  expect((await validate()).status()).toBe(200);
  await expect(page.getByText("Check your answers", { exact: false })).toBeVisible();
  await expect(page.getByText("HARNESS_CALLBACK_NORMALIZED", { exact: true })).toBeVisible();
  await expect(page.getByText("Synthetic sibling", { exact: true })).toBeVisible();
  const recipientSummary = page.locator("tr").filter({ has: page.locator("th.case-field-label").filter({ hasText: /^Recipient$/ }) });
  await expect(recipientSummary).toHaveCount(1);
  await recipientSummary.getByRole("link", { name: "Change Recipient", exact: true }).click();
  await expect(names.first()).toHaveValue("HARNESS_CALLBACK_NORMALIZED");
  await expect(names.last()).toHaveValue("Synthetic sibling");
  expect((await validate()).status()).toBe(200);
  await expect(page.getByText("Check your answers", { exact: false })).toBeVisible();
  expect((await observeCcd(caseId))).toEqual(before);
  expect((await submitServiceOfDocuments(page, caseId)).status()).toBe(201);
  const after = await observeCcd(caseId), intended = structuredClone(before.state.case_data);
  intended.sodAdditionalRecipientsList[0].value.emailInformation.emailName = "HARNESS_CALLBACK_NORMALIZED";
  save({ kind: "callback-ui-feasibility", catalogueCredit: false, phase: "after-submission", caseId, before, afterRejected, intended, after, journal: journal() });
  const newEvents = after.history.filter((entry: { id: string; created_date: string }) => !before.history.some((prior: { id: string; created_date: string }) => prior.id === entry.id && prior.created_date === entry.created_date));
  expect(newEvents).toHaveLength(1);
  expect(newEvents[0]).toMatchObject({ id: "serviceOfDocuments", case_type_id: "HarnessNestedPRL", state_id: "JUDICIAL_REVIEW", user_id: ccdEventPersonas().credentials.courtadmin.userId });
  expect(after.state.case_data).toEqual(intended); expect(after.state.version).toBe(before.state.version + 1); expect(after.history).toHaveLength(before.history.length + 1);
  expect(journal().every(item => item.invocationId === "recipient-callback-ui" && item.recipientCount === 2 && /^sha256:[a-f0-9]{64}$/.test(item.requestDigest) && /^sha256:[a-f0-9]{64}$/.test(item.responseDigest))).toBe(true);
  expect(journal().some(item => item.outcome === "normalized")).toBe(true);
  expect(journal().some(item => item.outcome === "normalization-unchanged")).toBe(true);
  save({ kind: "callback-ui-feasibility", catalogueCredit: false, completed: true, caseId, before, afterRejected, after, journal: journal() });
});
