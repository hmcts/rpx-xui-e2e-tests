import fs from 'node:fs';
import path from 'node:path';

import {expect,type Page,type PlaywrightWorkerArgs} from '@playwright/test';

import {waitForCallbackFirstPage} from './harnessCallbackJourney';
import {bootstrapCcdEventCase,switchCcdEventActor,openCcdEventCase,openServiceOfDocuments,submitServiceOfDocuments,ccdEventPersonas,ccdSessionRequest,observeCcd} from './harnessCcdEvent';

type Row='name'|'address';
type Variant='baseline'|'name-optional'|'address-optional';
const field=(row:Row)=>row==='name'?'emailName':'emailAddress';
const label=(row:Row)=>row==='name'?'Name':'Email address';
const seed=()=>({protectedValue:'mandatory-email-control',sodAdditionalRecipients:['additionalRecipients'],sodAdditionalRecipientsList:[{id:'11111111-1111-4111-8111-111111111111',value:{serveByPostOrEmail:'email',emailInformation:{emailName:'Synthetic mandatory recipient',emailAddress:'mandatory@harness.example.com'},postalInformation:{postalName:null,postalAddress:{AddressLine1:null,AddressLine2:null,AddressLine3:null,PostTown:null,County:null,PostCode:null,Country:null}}}}]});
// Kept unchanged for baseline and fault: the mutation is detected only after
// the real optional field has reached CYA, submitted and persisted empty.
async function requiredDenial(page:Page,caseId:string,row:Row,inputId:string){
  await expect(page,`MANDATORY_EMAIL_${row.toUpperCase()}_REQUIRED_DENIAL`).toHaveURL(new RegExp(`/cases/case-details/HARNESS/HarnessNestedPRL/${caseId}/trigger/serviceOfDocuments/serviceOfDocuments2$`));
  const group=page.locator('ccd-write-text-field').filter({has:page.locator(`input[id="${inputId}"]`)});
  await expect(group).toHaveCount(1);
  await expect(group.locator('label')).toHaveAttribute('for',inputId);
  await expect(group.locator('.error-message')).toHaveText(`${label(row)} is required`);
}
export async function runMandatoryEmailEvent({page,playwright,variant,row,step}:{page:Page;playwright:PlaywrightWorkerArgs['playwright'];variant:Variant;row:Row;step:(title:string,body:()=>Promise<void>)=>Promise<void>}){
  const input=JSON.parse(fs.readFileSync('/output/input.json','utf8'));
  expect(input.variant).toBe(variant);expect(input.mandatoryEmailEventBinding.variant).toBe(variant);
  const directory=process.env.EXUI_CCD_EVIDENCE!;
  const observed:Record<string,unknown>={schemaVersion:1,kind:'mandatory-email-event-observation',variant,row,sourceBinding:input.mandatoryEmailEventBinding,credit:{runtimeAcceptance:false,catalogueCredit:false,releaseCredit:false},completed:false,faultEffective:false};
  const save=()=>fs.writeFileSync(path.join(directory,`mandatory-email-${row}-observation.json`),JSON.stringify(observed,null,2)+'\n',{mode:0o600});
  const control=(r:Row)=>page.locator(`input[id$="_${field(r)}"]`);
  async function prepare(){
    const actor=await ccdSessionRequest(playwright,ccdEventPersonas().sessions.allowed);
    let created;try{created=await bootstrapCcdEventCase(actor,seed());}finally{await actor.dispose();}
    expect(created.trigger.status()).toBe(200);expect(created.created.status()).toBe(201);
    const caseId=String(created.body.id);expect(caseId).toMatch(/^\d{16}$/);
    const before=await observeCcd(caseId);expect(before.state.case_data).toEqual(seed());
    expect((await openCcdEventCase(page,caseId)).status()).toBe(200);
    expect((await openServiceOfDocuments(page,caseId)).status()).toBe(200);await waitForCallbackFirstPage(page,caseId);
    await expect(page.getByText('Protected value',{exact:true})).toBeVisible();
    await expect(page.locator('input#protectedValue,textarea#protectedValue')).toHaveCount(0);
    await page.getByRole('button',{name:'Continue',exact:true}).click();
    await expect(page).toHaveURL(/\/trigger\/serviceOfDocuments\/serviceOfDocuments2$/);
    for(const r of ['name','address'] as const){await expect(control(r)).toHaveCount(1);await expect(control(r)).toHaveAccessibleName(label(r)+(variant===`${r}-optional`?' (Optional)':''));}
    return{caseId,before};
  }
  async function continueToCya(){
    const pending=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/data/case-types/HarnessNestedPRL/validate'&&new URL(r.url()).searchParams.get('pageId')==='serviceOfDocuments2');
    await page.getByRole('button',{name:'Continue',exact:true}).click();expect((await pending).status()).toBe(200);
    await expect(page.getByText('Check your answers',{exact:true})).toBeVisible();
  }
  async function submit(caseId:string){
    const response=await submitServiceOfDocuments(page,caseId);expect(response.status()).toBe(201);
    const sent=response.request().postDataJSON();expect(sent.event.id).toBe('serviceOfDocuments');
    return{method:response.request().method(),path:new URL(response.url()).pathname,status:response.status(),eventId:sent.event.id};
  }
  await switchCcdEventActor(page,'courtadmin');
  const filled=await prepare();
  const nameBeforeAddress=await control('name').evaluate(element=>{const address=document.querySelector('input[id$="_emailAddress"]');return Boolean(address&&(element.compareDocumentPosition(address)&Node.DOCUMENT_POSITION_FOLLOWING));});
  expect(nameBeforeAddress).toBe(true);
  await page.getByLabel('Post',{exact:true}).check();await expect(control('name')).toBeHidden();await expect(control('address')).toBeHidden();
  const inactivePost=await control('name').isHidden()&&await control('address').isHidden();
  await page.getByLabel('Email',{exact:true}).check();await expect(control('name')).toBeVisible();await expect(control('address')).toBeVisible();
  const emailRestored=await control('name').isVisible()&&await control('address').isVisible();
  // Toggling the condition must preserve the filled sibling values.
  await expect(control('name')).toHaveValue('Synthetic mandatory recipient');await expect(control('address')).toHaveValue('mandatory@harness.example.com');
  await expect(control('name')).toHaveAttribute('id',/.+/);await expect(control('address')).toHaveAttribute('id',/.+/);
  const nameId=await control('name').getAttribute('id'),addressId=await control('address').getAttribute('id');
  observed.controls={nameLabel:(await page.locator(`label[for="${nameId}"]`).textContent())!.trim(),addressLabel:(await page.locator(`label[for="${addressId}"]`).textContent())!.trim(),nameBeforeAddress,inactivePost,emailRestored};
  await continueToCya();expect(await observeCcd(filled.caseId)).toEqual(filled.before);
  const filledSubmission=await submit(filled.caseId),filledAfter=await observeCcd(filled.caseId);
  expect(filledAfter.state.case_data).toEqual(seed());expect(filledAfter.state.version).toBe(filled.before.state.version+1);
  observed.filled={...filled,submission:filledSubmission,after:filledAfter};save();
  const empty=await prepare();await control(row).fill('');await expect(control(row)).toHaveValue('');
  const inputId=(await control(row).getAttribute('id'))!;expect(inputId).toBeTruthy();
  const optional=variant===`${row}-optional`;
  if(optional){
    await continueToCya();expect(await observeCcd(empty.caseId)).toEqual(empty.before);
    const submission=await submit(empty.caseId),after=await observeCcd(empty.caseId);
    const recipient=after.state.case_data.sodAdditionalRecipientsList[0].value;
    expect([null,'']).toContain(recipient.emailInformation[field(row)]);
    const intended=seed();intended.sodAdditionalRecipientsList[0].value.emailInformation[field(row)]=recipient.emailInformation[field(row)];
    expect(after.state.case_data).toEqual(intended);expect(after.state.version).toBe(empty.before.state.version+1);
    observed.empty={...empty,inputId,inputValue:'',path:new URL(page.url()).pathname,cya:'Check your answers',error:null,submission,after};observed.faultEffective=true;save();
  }else{
    await page.getByRole('button',{name:'Continue',exact:true}).click();
    const group=page.locator('ccd-write-text-field').filter({has:control(row)});await expect(group).toHaveCount(1);
    const linked=group.locator('.error-message');await expect(linked).toHaveText(`${label(row)} is required`);
    await expect(group.locator('label')).toHaveAttribute('for',inputId);
    await expect(page.getByText('Check your answers',{exact:true})).toHaveCount(0);
    const after=await observeCcd(empty.caseId);expect(after).toEqual(empty.before);
    observed.empty={...empty,inputId,inputValue:'',path:new URL(page.url()).pathname,cya:null,error:{forId:await group.locator('label').getAttribute('for'),text:(await linked.textContent())!.trim()},submission:null,after};save();
  }
  await step(`harness-assertion:source-email-${row}-required`,async()=>requiredDenial(page,empty.caseId,row,inputId));
  observed.completed=true;save();
}
