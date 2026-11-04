import fs from "node:fs";
import path from "node:path";

import { test, expect } from "../../../fixtures/harnessCallback";
import { bootstrapCcdEventCase, switchCcdEventActor, openCcdEventCase, openServiceOfDocuments, submitServiceOfDocuments, ccdEventPersonas, ccdSessionRequest, observeCcd } from "../../../fixtures/harnessCcdEvent";
const directory = process.env.EXUI_CCD_EVIDENCE!;
const journal = () => fs.readFileSync(path.join(directory, "recipient-callback.jsonl"), "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line));
const save = (value: unknown) => fs.writeFileSync(path.join(directory, "callback-ui-observation.json"), JSON.stringify(value, null, 2), { mode: 0o600 });

test("candidate callback rejects edited data, corrects through CYA and persists normalization", async ({ page, playwright }) => {
  const actor = await ccdSessionRequest(playwright, ccdEventPersonas().sessions.allowed);
  const data = { protectedValue: "synthetic-callback-ui", sodAdditionalRecipients: ["additionalRecipients"], sodAdditionalRecipientsList: [
    { id: "11111111-1111-4111-8111-111111111111", value: { serveByPostOrEmail: "email", emailInformation: { emailName: "HARNESS_CALLBACK_ORIGINAL", emailAddress: "first@harness.example.com" } } },
    { id: "22222222-2222-4222-8222-222222222222", value: { serveByPostOrEmail: "email", emailInformation: { emailName: "Synthetic sibling", emailAddress: "second@harness.example.com" } } },
  ] };
  let created;
  try { created = await bootstrapCcdEventCase(actor, data); } finally { await actor.dispose(); }
  expect(created.trigger.status()).toBe(200); expect(created.created.status()).toBe(201);
  const caseId = String(created.body.id); expect(caseId).toMatch(/^\d{16}$/);
  const before = await observeCcd(caseId);
  await switchCcdEventActor(page, "courtadmin");
  expect((await openCcdEventCase(page, caseId)).status()).toBe(200);
  expect((await openServiceOfDocuments(page, caseId)).status()).toBe(200);
  const names = page.locator('input[id$="_emailName"]');
  await expect(names).toHaveCount(2); await names.first().fill("HARNESS_CALLBACK_REJECT");
  const validate = async () => {
    const response = page.waitForResponse(r => r.request().method() === "POST" && new URL(r.url()).pathname === "/data/case-types/HarnessNestedPRL/validate");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    return response;
  };
  const rejected = await validate(); const afterRejected = await observeCcd(caseId);
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
  await page.getByRole("link", { name: /Change/ }).first().click();
  await expect(names.first()).toHaveValue("HARNESS_CALLBACK_NORMALIZED");
  await expect(names.last()).toHaveValue("Synthetic sibling");
  expect((await validate()).status()).toBe(200);
  await expect(page.getByText("Check your answers", { exact: false })).toBeVisible();
  expect((await observeCcd(caseId))).toEqual(before);
  expect((await submitServiceOfDocuments(page, caseId)).status()).toBe(201);
  const after = await observeCcd(caseId), intended = structuredClone(before.state.case_data);
  intended.sodAdditionalRecipientsList[0].value.emailInformation.emailName = "HARNESS_CALLBACK_NORMALIZED";
  expect(after.state.case_data).toEqual(intended); expect(after.state.version).toBe(before.state.version + 1); expect(after.history).toHaveLength(before.history.length + 1);
  expect(journal().every(item => item.invocationId === "recipient-callback-ui" && item.recipientCount === 2 && /^sha256:[a-f0-9]{64}$/.test(item.requestDigest) && /^sha256:[a-f0-9]{64}$/.test(item.responseDigest))).toBe(true);
  expect(journal().some(item => item.outcome === "normalized")).toBe(true);
  expect(journal().some(item => item.outcome === "normalization-unchanged")).toBe(true);
  save({ kind: "callback-ui-feasibility", catalogueCredit: false, caseId, before, afterRejected, after, journal: journal() });
});
