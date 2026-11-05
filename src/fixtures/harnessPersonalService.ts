import fs from "node:fs";
import path from "node:path";

import { expect, type Page, type PlaywrightWorkerArgs } from "@playwright/test";

import { waitForCallbackFirstPage } from "./harnessCallbackJourney";
import { bootstrapCcdEventCase, switchCcdEventActor, openCcdEventCase, openServiceOfDocuments, submitServiceOfDocuments, ccdEventPersonas, ccdSessionRequest, observeCcd } from "./harnessCcdEvent";
const label = "Does this document need to be personally served on the respondent?";
const field = "sodServeToRespondentOptions";
const seed = (empty: boolean) => ({ protectedValue: empty ? "personal-service-empty-control" : "personal-service-filled-control", sodAdditionalRecipients: [], sodAdditionalRecipientsList: [], sodServeToRespondentOptions: null });
const summaryRow = (page: Page, heading: string) => page.locator("tr").filter({ has: page.locator("th.case-field-label").filter({ hasText: new RegExp(`^${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) }) });
export async function runPersonalService({ page, playwright, variant, step }: {
 page: Page; playwright: PlaywrightWorkerArgs["playwright"]; variant: "baseline" | "optional";
 step: (title: string, body: () => Promise<void>) => Promise<void>;
}) {
 const directory = process.env.EXUI_CCD_EVIDENCE!;
 const input = JSON.parse(fs.readFileSync("/output/input.json", "utf8"));
 const observed: Record<string, unknown> = {schemaVersion:1,kind:"personal-service-observation",variant,sourceBinding:input.personalServiceBinding,catalogueCredit:false,releaseCredit:false,completed:false};
 const save = () => fs.writeFileSync(path.join(directory,"personal-service-observation.json"),JSON.stringify(observed,null,2),{mode:0o600});
 const group = () => page.locator(`#${field}`);
 const prepare = async (empty: boolean) => {
  const actor = await ccdSessionRequest(playwright,ccdEventPersonas().sessions.allowed);
  let created;try {created=await bootstrapCcdEventCase(actor,seed(empty));} finally {await actor.dispose();}
  expect(created.trigger.status()).toBe(200);expect(created.created.status()).toBe(201);
  const caseId=String(created.body.id);expect(caseId).toMatch(/^\d{16}$/);
  await switchCcdEventActor(page,"courtadmin");expect((await openCcdEventCase(page,caseId)).status()).toBe(200);
  expect((await openServiceOfDocuments(page,caseId)).status()).toBe(200);await waitForCallbackFirstPage(page,caseId);
  await expect(page.getByText("Protected value",{exact:true})).toBeVisible();
  const predecessorLabel=await page.getByText("Protected value",{exact:true}).textContent();
  const predecessorControls=page.locator("input#protectedValue,textarea#protectedValue");await expect(predecessorControls).toHaveCount(0);
  const predecessorEditable=await predecessorControls.count();
  await page.getByRole("button",{name:"Continue",exact:true}).click();
  await expect(page).toHaveURL(/\/trigger\/serviceOfDocuments\/serviceOfDocuments2$/);
  await expect(group().locator("legend .form-label")).toHaveText(label);
  await expect(group().getByRole("radio")).toHaveCount(3);
  const options=await group().locator('.multiple-choice label').allTextContents();expect(options.map(x=>x.trim())).toEqual(["Yes","No","Not applicable"]);
  const selectedControls=group().locator('input[type="radio"]:checked');await expect(selectedControls).toHaveCount(0);
  const initialSelected=await selectedControls.count();
  const before=await observeCcd(caseId);expect(before.state.case_data).toEqual(seed(empty));
  return {caseId,before,predecessorLabel:predecessorLabel!.trim(),predecessorEditable,initialSelected,options:options.map(x=>x.trim())};
 };
 const continueToCya=async()=>{
  const response=page.waitForResponse(r=>r.request().method()==="POST"&&new URL(r.url()).pathname==="/data/case-types/HarnessNestedPRL/validate"&&new URL(r.url()).searchParams.get("pageId")==="serviceOfDocuments2");
  await page.getByRole("button",{name:"Continue",exact:true}).click();expect((await response).status()).toBe(200);
  const heading=page.getByText("Check your answers",{exact:true});await expect(heading).toBeVisible();
  return {heading:(await heading.textContent())!.trim(),path:new URL(page.url()).pathname};
 };
 // Both variants must complete the real persistence control before testing empty input.
 const prepared=await prepare(false),{caseId,before}=prepared;
 const filled: Record<string,unknown>={caseId,before};observed.filled=filled;
 const precedesSelector=await group().evaluate(element=>{const sibling=document.getElementById("sodAdditionalRecipients");return Boolean(sibling&&(element.compareDocumentPosition(sibling)&Node.DOCUMENT_POSITION_FOLLOWING));});expect(precedesSelector).toBe(true);
 await group().getByRole("radio",{name:"No",exact:true}).check();
 filled.cya=await continueToCya();
 const row=summaryRow(page,label);await expect(row).toHaveCount(1);await expect(row.getByText("No",{exact:true})).toBeVisible();
 const sibling=summaryRow(page,"Protected value");await expect(sibling).toHaveCount(1);await expect(sibling.getByText("personal-service-filled-control",{exact:true})).toBeVisible();
 const change=row.getByRole("link",{name:`Change ${label}`,exact:true});await expect(change).toBeVisible();await change.click();
 await expect(page).toHaveURL(/\/trigger\/serviceOfDocuments\/serviceOfDocuments2$/);await expect(group().getByRole("radio",{name:"No",exact:true})).toBeChecked();
 filled.ui={initialSelected:prepared.initialSelected,options:prepared.options,selected:"No",label,precedesSelector,predecessorLabel:prepared.predecessorLabel,predecessorEditable:prepared.predecessorEditable,changeName:`Change ${label}`,changePath:new URL(page.url()).pathname,afterChange:"No",healthySibling:"Protected value"};
 await continueToCya();filled.beforeSubmit=await observeCcd(caseId);expect(filled.beforeSubmit).toEqual(before);
 const submission=await submitServiceOfDocuments(page,caseId);expect(submission.status()).toBe(201);const payload=submission.request().postDataJSON();
 filled.submission={method:submission.request().method(),path:new URL(submission.url()).pathname,status:submission.status(),eventId:payload.event.id,data:payload.data};
 const after=await observeCcd(caseId);filled.after=after;save();
 expect(after.state.case_data).toEqual({...seed(false),sodServeToRespondentOptions:"No"});expect(after.state.version).toBe(before.state.version+1);expect(after.history).toHaveLength(before.history.length+1);
 const added=after.history.filter((h:{id:string;created_date:string})=>!before.history.some((p:{id:string;created_date:string})=>h.id===p.id&&h.created_date===p.created_date));
 expect(added).toHaveLength(1);expect(added[0]).toMatchObject({id:"serviceOfDocuments",case_type_id:"HarnessNestedPRL",state_id:"JUDICIAL_REVIEW",user_id:ccdEventPersonas().credentials.courtadmin.userId});
 const blank=await prepare(true);const empty: Record<string,unknown>={caseId:blank.caseId,before:blank.before,initialSelected:blank.initialSelected};observed.empty=empty;
 const healthySibling=page.getByText("Select additional recipients who needs to be served",{exact:true});await expect(healthySibling).toBeVisible();empty.healthySibling=(await healthySibling.textContent())!.trim();
 if(variant==="optional"){
  empty.cya=await continueToCya();
  const control=summaryRow(page,"Protected value");await expect(control).toHaveCount(1);await expect(control.getByText("personal-service-empty-control",{exact:true})).toBeVisible();
  empty.cyaControl={label:(await control.locator("th.case-field-label").textContent())!.trim(),value:(await control.getByText("personal-service-empty-control",{exact:true}).textContent())!.trim(),rowCount:await control.count()};
  empty.requiredError=null;empty.after=await observeCcd(blank.caseId);expect(empty.after).toEqual(blank.before);
  observed.faultEffective=true;save();
  await step("harness-assertion:personal-service-required",async()=>{await expect(page,"PERSONAL_SERVICE_REQUIRED_ANSWER").toHaveURL(/\/trigger\/serviceOfDocuments\/serviceOfDocuments2$/);});
  return;
 }
 await page.getByRole("button",{name:"Continue",exact:true}).click();
 const error=group().locator(".error-message");await expect(error).toHaveText(`${label} is required`);
 await expect(page.getByText("Check your answers",{exact:true})).toHaveCount(0);empty.cya=null;empty.requiredError=(await error.textContent())!.trim();empty.pagePath=new URL(page.url()).pathname;
 empty.after=await observeCcd(blank.caseId);expect(empty.after).toEqual(blank.before);
 await step("harness-assertion:personal-service-required",async()=>{await expect(page,"PERSONAL_SERVICE_REQUIRED_ANSWER").toHaveURL(/\/trigger\/serviceOfDocuments\/serviceOfDocuments2$/);});
 observed.completed=true;save();
}
