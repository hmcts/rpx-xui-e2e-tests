import fs from "node:fs";
import path from "node:path";

import { expect, type Page, type Locator, type PlaywrightWorkerArgs } from "@playwright/test";

import { bootstrapCcdEventCase, switchCcdEventActor, openCcdEventCase, openServiceOfDocuments, submitServiceOfDocuments, ccdEventPersonas, ccdSessionRequest, observeCcd } from "./harnessCcdEvent";
const directory = process.env.EXUI_CCD_EVIDENCE!;
const journal = () => fs.readFileSync(path.join(directory, "recipient-callback.jsonl"), "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line));
// The toolkit materializes these blank conditional controls on submission;
// seed the same explicit shape so whole-data equality never ignores hidden fields.
const emptyPostal = () => ({ postalName: null, postalAddress: { AddressLine1: null, AddressLine2: null, AddressLine3: null, PostTown: null, County: null, PostCode: null, Country: null } });
const save = (value: unknown) => fs.writeFileSync(path.join(directory, "callback-ui-observation.json"), JSON.stringify(value, null, 2), { mode: 0o600 });

export async function waitForCallbackFirstPage(page: Page,caseId:string) {
 expect(caseId).toMatch(/^\d{16}$/);
 await expect(page).toHaveURL(new RegExp(`/cases/case-details/HARNESS/HarnessNestedPRL/${caseId}/trigger/serviceOfDocuments/serviceOfDocumentsharnessBefore$`));
}
export async function callbackChangeAccessibleName(link: Locator) {
 await expect(link).toHaveAccessibleName('Change Recipient');
 const snapshot=await link.ariaSnapshot();
 const matched=/^- link ("[^"\n]+")(?::|$)/.exec(snapshot);
 expect(matched).not.toBeNull();
 return JSON.parse(matched![1]) as string;
}

export async function runRecipientCallbackJourney({page,playwright,mode,variant,invocationId,step}: {
 page: Page; playwright: PlaywrightWorkerArgs["playwright"]; mode: "native"|"feasibility";
 variant: "baseline"|"binding-omitted"; invocationId?: string;
 step: (title:string,body:()=>Promise<void>)=>Promise<void>;
}) {
 const metadata=mode==='native'?{schemaVersion:1,kind:'native-recipient-callback-observation',invocationId}:{kind:'callback-ui-feasibility',catalogueCredit:false};
 const validation:Array<{pageId:string|null;status:number}>=[];
 const navigation:string[]=[];
 const ui: {
 predecessor:{navigation:string[];label?:string|null;editableControlCount?:number};
 recipientLabel?:string|null;selectorPrecedesRecipient?:boolean;selectorInitiallyChecked?:boolean;
 hiddenWhenDeselected?:boolean;visibleWhenReselected?:boolean;faultCyaHeading?:string|null;faultCyaPathname?:string;
 cya?:{recipientLabel:string|null;changeAccessibleName:string|null;summaryRecipientNames:Array<string|null>;changedRecipientNames?:string[]};
 }={predecessor:{navigation}};
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
  await waitForCallbackFirstPage(page,caseId);
  await expect(page.getByText("Protected value", { exact: true })).toBeVisible();
  navigation.push(new URL(page.url()).pathname);
  ui.predecessor.label=await page.getByText("Protected value",{exact:true}).textContent();
  ui.predecessor.editableControlCount=await page.locator("input#protectedValue, textarea#protectedValue").count();
  await expect(page.locator("input#protectedValue, textarea#protectedValue")).toHaveCount(0);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  const names = page.locator('input[id$="_emailName"]');
  await expect(names).toHaveCount(2);
  navigation.push(new URL(page.url()).pathname);
  await page.getByRole("button", { name: "Previous", exact: true }).click();
  await expect(page.getByText("Protected value", { exact: true })).toBeVisible();
  navigation.push(new URL(page.url()).pathname);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  const selector = page.getByLabel("Additional recipients (optional)", { exact: true });
  await expect(selector).toBeChecked();
  navigation.push(new URL(page.url()).pathname);
  ui.selectorInitiallyChecked=await selector.isChecked();
  await selector.uncheck(); await expect(names.first()).toBeHidden();
  ui.hiddenWhenDeselected=await names.first().isHidden();
  await selector.check(); await expect(names.first()).toBeVisible();
  ui.visibleWhenReselected=await names.first().isVisible();
  await expect(page.getByText("Recipient", { exact: true }).first()).toBeVisible();
  ui.recipientLabel=await page.getByText("Recipient",{exact:true}).first().textContent();
  ui.selectorPrecedesRecipient=await selector.evaluate((element) => {
    const recipient = document.querySelector('input[id$="_emailName"]');
    return Boolean(recipient && (element.compareDocumentPosition(recipient) & Node.DOCUMENT_POSITION_FOLLOWING));
  });
  expect(ui.selectorPrecedesRecipient).toBe(true);
  expect(journal()).toEqual([]);
  await expect(names).toHaveCount(2); await names.first().fill("HARNESS_CALLBACK_REJECT");
  const validate = async () => {
    const response = page.waitForResponse(r => r.request().method() === "POST" && new URL(r.url()).pathname === "/data/case-types/HarnessNestedPRL/validate");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    const observed = await response;
    expect(new URL(observed.url()).searchParams.get("pageId")).toBe("serviceOfDocuments2");
    validation.push({pageId:new URL(observed.url()).searchParams.get("pageId"),status:observed.status()});
    return observed;
  };
  const rejected = await validate(); const afterRejected = await observeCcd(caseId);
  save({ ...metadata, validation, ui, phase: "after-validation", caseId, validationStatus: rejected.status(), before, afterRejected, journal: journal() });
  expect(afterRejected).toEqual(before);
  if (variant === "binding-omitted") {
    expect(rejected.status()).toBe(200);
    await expect(page.getByText("Check your answers", { exact: false })).toBeVisible();
    ui.faultCyaHeading=await page.getByText("Check your answers",{exact:false}).textContent();
    ui.faultCyaPathname=new URL(page.url()).pathname;
    expect(journal()).toEqual([]);
    save({ ...metadata, validation, ui, caseId, completed:false, journal:journal(), faultEffective: true, witness: "valid-CYA-without-callback", before, afterRejected });
    await step("harness-assertion:recipient-callback-binding",async()=>{
      expect(journal().some(item => item.outcome === "business-rejected"), "CALLBACK_BINDING_OMISSION_DETECTED").toBe(true);
    });
    return;
  }
  expect(rejected.status()).toBeGreaterThanOrEqual(400); expect(rejected.status()).toBeLessThan(500);
  await expect(page.getByText("HARNESS_CALLBACK_BUSINESS_REJECTION", { exact: false }).first()).toBeVisible();
  await step("harness-assertion:recipient-callback-binding",async()=>{
    expect(journal().some(item => item.outcome === "business-rejected")).toBe(true);
  });
  await names.first().fill("HARNESS_CALLBACK_ORIGINAL");
  expect((await validate()).status()).toBe(200);
  await expect(page.getByText("Check your answers", { exact: false })).toBeVisible();
  await expect(page.getByText("HARNESS_CALLBACK_NORMALIZED", { exact: true })).toBeVisible();
  await expect(page.getByText("Synthetic sibling", { exact: true })).toBeVisible();
  const recipientSummary = page.locator("tr").filter({ has: page.locator("th.case-field-label").filter({ hasText: /^Recipient$/ }) });
  await expect(recipientSummary).toHaveCount(1);
  ui.cya={recipientLabel:await recipientSummary.locator('th.case-field-label').textContent(),changeAccessibleName:await callbackChangeAccessibleName(recipientSummary.getByRole('link',{name:'Change Recipient',exact:true})),summaryRecipientNames:[await page.getByText('HARNESS_CALLBACK_NORMALIZED',{exact:true}).textContent(),await page.getByText('Synthetic sibling',{exact:true}).textContent()]};
  await recipientSummary.getByRole("link", { name: "Change Recipient", exact: true }).click();
  await expect(names.first()).toHaveValue("HARNESS_CALLBACK_NORMALIZED");
  await expect(names.last()).toHaveValue("Synthetic sibling");
  ui.cya.changedRecipientNames=await names.evaluateAll(elements=>elements.map(element=>(element as HTMLInputElement).value));
  expect((await validate()).status()).toBe(200);
  await expect(page.getByText("Check your answers", { exact: false })).toBeVisible();
  const beforeSubmit=await observeCcd(caseId);
  expect(beforeSubmit).toEqual(before);
  expect((await submitServiceOfDocuments(page, caseId)).status()).toBe(201);
  const after = await observeCcd(caseId), intended = structuredClone(before.state.case_data);
  intended.sodAdditionalRecipientsList[0].value.emailInformation.emailName = "HARNESS_CALLBACK_NORMALIZED";
  save({ ...metadata, validation, ui, phase: "after-submission", caseId, before, afterRejected, intended, after, journal: journal() });
  const newEvents = after.history.filter((entry: { id: string; created_date: string }) => !before.history.some((prior: { id: string; created_date: string }) => prior.id === entry.id && prior.created_date === entry.created_date));
  expect(newEvents).toHaveLength(1);
  expect(newEvents[0]).toMatchObject({ id: "serviceOfDocuments", case_type_id: "HarnessNestedPRL", state_id: "JUDICIAL_REVIEW", user_id: ccdEventPersonas().credentials.courtadmin.userId });
  expect(after.state.case_data).toEqual(intended); expect(after.state.version).toBe(before.state.version + 1); expect(after.history).toHaveLength(before.history.length + 1);
  expect(journal().every(item => item.invocationId === (mode==='native'?'recipient-callback-native':'recipient-callback-ui') && item.recipientCount === 2 && /^sha256:[a-f0-9]{64}$/.test(item.requestDigest) && /^sha256:[a-f0-9]{64}$/.test(item.responseDigest))).toBe(true);
  expect(journal().some(item => item.outcome === "normalized")).toBe(true);
  expect(journal().some(item => item.outcome === "normalization-unchanged")).toBe(true);
  save({ ...metadata, validation, ui, completed: true, caseId, before, afterRejected, beforeSubmit, after, journal: journal() });
}
