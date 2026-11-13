import type { Page, APIRequestContext, Locator } from '@playwright/test';

import {
  test, expect, observeCcd, bootstrapCcdEventCase, switchCcdEventActor,
  openCcdEventCase, openServiceOfDocuments, submitServiceOfDocuments,
  saveCcdEventObservation, ccdEventPersonas, eventProofInputs, EVENT_SCOPE,
} from './harnessCcdEvent';
import { sourceShapeCapture, type SourceShapeCapture } from './harnessSourceShapeCapture';

export const shapes = ['recipient-collection', 'case-field-recipient-selector', 'required-delivery-radio', 'conditional-email-complex', 'postal-recipient-name', 'optional-postal-line-two'] as const;
const mutation = process.env.EXUI_HARNESS_MUTATION;
const control = 'synthetic-source-shape-control';
const emailName = 'Synthetic shape recipient';
const emailAddress = 'shape-recipient@harness.example.com';
const optionalValue = 'Synthetic second line';

export async function assertSourceShapeHiddenControls(...controls: Locator[]) {
  // CCD retains inactive complex fields as hidden inputs. Visibility is the contract.
  for (const control of controls) await expect(control).toBeHidden();
}

export async function assertSourceShapeRadioLabel(page: Page, optional: boolean) {
  await expect(page.getByText(optional ? 'Served by (Optional)' : 'Served by', {exact:true})).toBeVisible();
}

export async function assertSourceShapePostalLabel(control: Locator, changed: boolean) {
  await expect(control).toHaveAccessibleName(changed ? 'Harness changed postal line two (Optional)' : 'Address Line 2 (Optional)');
  return control.evaluate(element => Array.from((element as HTMLInputElement).labels ?? []).map(label => label.textContent ?? '').join(' ').replace(/\s+/g,' ').trim());
}

export const postalSiblingValues = {
  AddressLine3: 'Synthetic third line', PostTown: 'Synthetic town',
  County: 'Synthetic county', Country: 'United Kingdom',
};

export async function fillSourceShapePostalSiblings(page: Page) {
  // Deliberately populated siblings make preservation independent of empty/null serialization.
  for (const [field, value] of Object.entries(postalSiblingValues)) {
    await page.locator(`input[id$="${field}"]`).fill(value);
  }
}

type RadioObservation = {state:{state:string;version:number;case_data:Record<string,unknown>};history:Array<Record<string,unknown>>};
export function assertRadioValidationBypass(status:number,before:RadioObservation,after:RadioObservation) {
  expect(status).toBe(201);
  expect(after.state.state).toBe(before.state.state);
  expect(after.state.case_data).toEqual({...before.state.case_data,sodAdditionalRecipients:['additionalRecipients'],sodAdditionalRecipientsList:[]});
  expect(after.state.version).toBe(before.state.version+1);
  expect(after.history).toHaveLength(before.history.length+1);
  expect(after.history.filter(event=>event.id==='serviceOfDocuments')).toHaveLength(1);
  expect(after.history.filter(event=>event.id!=='serviceOfDocuments')).toEqual(before.history);
}

async function assertControlOrder(controls: Locator[]) {
  for (let index = 1; index < controls.length; index++) {
    await expect(controls[index]).toHaveAttribute('id', /.+/);
    const nextId = await controls[index].getAttribute('id');
    expect(await controls[index - 1].evaluate((element,id) => {
      const next=element.ownerDocument.getElementById(id!);
      return Boolean(next && element.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING);
    },nextId)).toBe(true);
  }
}
async function assertRecipientCollectionReadback(page: Page, values: {emailName:string,emailAddress:string}[]) {
  // The toolkit renders each collection item in one direct table row.
  const table = page.locator('table.collection-field-table').filter({has:page.getByText(values[0].emailName,{exact:true})});
  await expect(table).toHaveCount(1);
  const rows = table.locator(':scope > tbody > tr');
  await expect(rows).toHaveCount(values.length);
  for (const [index,value] of values.entries()) {
    await expect(rows.nth(index).getByText(value.emailName,{exact:true})).toBeVisible();
    await expect(rows.nth(index).getByText(value.emailAddress,{exact:true})).toBeVisible();
    await expect(rows.nth(index).getByText(values[1-index].emailName,{exact:true})).toHaveCount(0);
  }
}
async function runRecipientCollection(page: Page, caseId: string, actor: unknown, before: Awaited<ReturnType<typeof observeCcd>>, capture: SourceShapeCapture) {
  const add = page.getByRole('button', {name:'Add new',exact:true});
  if (mutation) {
    await expect(page.getByLabel('Email',{exact:true})).toBeVisible();
    await expect(add).toHaveCount(0);
    await capture.stage('singular-form',page);
    await page.getByLabel('Email',{exact:true}).check();
    await page.locator('input[id$="_emailName"]').fill('Synthetic singular recipient');
    await page.locator('input[id$="_emailAddress"]').fill('singular-recipient@harness.example.com');
    await page.getByRole('button',{name:'Continue',exact:true}).click();
    await expect(page.getByText('Check your answers',{exact:false})).toBeVisible();
    await expect(page.getByText('Synthetic singular recipient',{exact:true})).toBeVisible();
    await expect(page.getByText('singular-recipient@harness.example.com',{exact:true})).toBeVisible();
    await capture.stage('singular-cya',page);
    expect(capture.response('submit',await submitServiceOfDocuments(page,caseId)).status()).toBe(201);
    const after = await observeCcd(caseId);
    expect(after.state.case_data.sodAdditionalRecipientsList).toMatchObject({serveByPostOrEmail:'email',emailInformation:{emailName:'Synthetic singular recipient',emailAddress:'singular-recipient@harness.example.com'}});
    expect(after.state.case_data.protectedValue).toBe(control);
    expect(after.state.state).toBe(before.state.state);
    expect(after.state.version).toBe(before.state.version+1);
    expect(after.history.filter((event: {id:string})=>event.id!=='serviceOfDocuments')).toEqual(before.history);
    expect(after.history.filter((event: {id:string})=>event.id==='serviceOfDocuments')).toHaveLength(1);
    saveCcdEventObservation('source-shape-recipient-collection',{shape:'recipient-collection',actor,caseId,before,after,singularComplex:true,contractSatisfied:false});
    capture.save(process.env.EXUI_CCD_EVIDENCE!);

    await test.step('harness-assertion:source-shape-recipient-collection',async()=>{expect(Array.isArray(after.state.case_data.sodAdditionalRecipientsList)).toBe(true);});

    return;
  }
  const values = [
    {emailName:'Synthetic collection first',emailAddress:'first-collection@harness.example.com'},
    {emailName:'Synthetic collection second',emailAddress:'second-collection@harness.example.com'},
  ];
  for (const [index,value] of values.entries()) {
    await add.last().click();
    await page.getByLabel('Email',{exact:true}).nth(index).check();
    await page.locator('input[id$="_emailName"]').nth(index).fill(value.emailName);
    await page.locator('input[id$="_emailAddress"]').nth(index).fill(value.emailAddress);
  }
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await expect(page.getByText('Check your answers',{exact:false})).toBeVisible();
  await assertRecipientCollectionReadback(page,values);
  await capture.stage('collection-cya',page);
  expect(capture.response('submit',await submitServiceOfDocuments(page,caseId)).status()).toBe(201);
  const after = await observeCcd(caseId);
  const recipients = after.state.case_data.sodAdditionalRecipientsList;
  expect(recipients).toHaveLength(2);
  expect(new Set(recipients.map((row: {id:string})=>row.id)).size).toBe(2);
  for (const [index,value] of values.entries()) {
    expect(recipients[index].id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(recipients[index].value.serveByPostOrEmail).toBe('email');
    expect(recipients[index].value.emailInformation).toEqual(value);
  }
  expect(after.state.case_data.protectedValue).toBe(control);
  expect(after.state.state).toBe(before.state.state);
  expect(after.state.version).toBe(before.state.version+1);
  expect(after.history.filter((event: {id:string})=>event.id!=='serviceOfDocuments')).toEqual(before.history);
  expect(after.history.filter((event: {id:string})=>event.id==='serviceOfDocuments')).toHaveLength(1);
  expect(capture.response('collection-reopened',await openCcdEventCase(page,caseId)).status()).toBe(200);
  await assertRecipientCollectionReadback(page,values);
  await capture.stage('collection-reopened',page);
  const reopenedObservation = await observeCcd(caseId);
  expect(reopenedObservation).toEqual(after);
  capture.readback('collection-reopened',reopenedObservation);
  saveCcdEventObservation('source-shape-recipient-collection',{shape:'recipient-collection',actor,caseId,before,after,contractSatisfied:true});
  capture.save(process.env.EXUI_CCD_EVIDENCE!);

  await test.step('harness-assertion:source-shape-recipient-collection',async()=>{expect(recipients).toHaveLength(2);});
}
export async function runSourceShape(shape: (typeof shapes)[number], page: Page, request: APIRequestContext) {
    const {manifest, context} = eventProofInputs();
    expect(manifest.releaseScopeId).toBe(EVENT_SCOPE);
    expect(context.releaseScopeId).toBe(EVENT_SCOPE);
    expect(context.runId).toBe(manifest.runId);
    expect(context.invocationId).toBe(mutation ?? 'baseline');
    expect([undefined, `ccd-shape-${shape}`]).toContain(mutation);
    const personas = ccdEventPersonas();
    const roles = ['caseworker', 'caseworker-harness', 'caseworker-privatelaw-courtadmin'];
    expect(personas.credentials.courtadmin.roles?.slice().sort()).toEqual(roles);
    for (const other of ['allowed','observer','judge','readonly'] as const)
      expect(personas.credentials.courtadmin.userId).not.toBe(personas.credentials[other].userId);
    const bootstrap = await bootstrapCcdEventCase(request, {protectedValue:control,...(shape === 'recipient-collection' ? {} : {sodAdditionalRecipientsList:[]})});
    expect(bootstrap.created.status()).toBe(201);
    const caseId = String(bootstrap.body.id);
    expect(caseId).toMatch(/^\d{16}$/);
    const before = await observeCcd(caseId);
    await switchCcdEventActor(page,'courtadmin');
    const details = await page.request.get('/api/user/details',{maxRedirects:0,maxRetries:0});
    expect(details.status()).toBe(200);
    const actor = (await details.json()).userInfo;
    expect(actor.id ?? actor.uid).toBe(personas.credentials.courtadmin.userId);
    expect([...actor.roles].sort()).toEqual(roles);
    const capture = sourceShapeCapture(shape,actor,caseId,mutation);
    capture.response('bootstrap',bootstrap.created);
    capture.response('user-details',details);
    expect(capture.response('case-opened',await openCcdEventCase(page,caseId)).status()).toBe(200);
    await expect(page.getByText(control,{exact:true})).toBeVisible();
    await capture.stage('case-opened',page);
    expect(capture.response('event-opened',await openServiceOfDocuments(page,caseId)).status()).toBe(200);
    await page.getByLabel('Additional recipients (optional)',{exact:true}).check();
    await capture.stage('event-opened',page);
    if (shape === 'recipient-collection') {
      await runRecipientCollection(page, caseId, actor, before, capture);
      return;
    }
    await page.getByRole('button',{name:'Add new',exact:true}).last().click();
    const email = page.getByLabel('Email',{exact:true});
    const post = page.getByLabel('Post',{exact:true});
    const name = page.locator('input[id$="_emailName"]');
    const address = page.locator('input[id$="_emailAddress"]');
    const postalName = page.locator('input[id$="_postalName"]');
    const line2 = page.locator('input[id$="AddressLine2"]');
    const continueButton = page.getByRole('button',{name:'Continue',exact:true});
    const cya = page.getByText('Check your answers',{exact:false});
    let contractSatisfied = false;
    let expectedChannel: string | null = null;
    const expectedLine2: string | null = null;
    let postalLabel: string | undefined;
    let faultEmailPresent = false;

    if (shape === 'required-delivery-radio') {
      await assertSourceShapeRadioLabel(page, Boolean(mutation));
      await capture.stage('radio-unselected',page);
      await continueButton.click();
      if (mutation) {
        // The missing required selection must genuinely reach CYA and persist.
        await expect(cya).toBeVisible();
        await capture.stage('first-continue',page);
      } else {
        await expect(cya).toHaveCount(0);
        await expect(page.locator('.error-summary, .govuk-error-summary')).toBeVisible();
        await capture.stage('first-continue',page);
        contractSatisfied = true;
        await email.check();
        await expect(name).toHaveAccessibleName(/Name/);
        await assertControlOrder([email,name,address]);
        await name.fill(emailName);
        await address.fill(emailAddress);
        expectedChannel = 'email';
        await capture.stage('email-filled',page);
        await continueButton.click();
      }
    } else if (shape === 'case-field-recipient-selector') {
      await email.check();
      await expect(name).toBeVisible();
      await name.fill(emailName);
      await address.fill(emailAddress);
      expectedChannel = 'email';
      await capture.stage('email-filled',page);
    } else if (shape === 'conditional-email-complex') {
      await email.check();
      if (mutation) {
        await assertSourceShapeHiddenControls(name, address);
        await capture.stage('email-selected',page);
        await post.check();
        const visibleFaultNames = page.locator('input[id$="_emailName"]:visible');
        const visibleFaultAddresses = page.locator('input[id$="_emailAddress"]:visible');
        await expect(visibleFaultNames).toHaveCount(await visibleFaultAddresses.count());
        await capture.stage('post-selected',page);
        if (await visibleFaultNames.count()) {
          await expect(visibleFaultNames).toHaveCount(1);
          await visibleFaultNames.fill('Synthetic fault email recipient');
          await visibleFaultAddresses.fill('fault-recipient@harness.example.com');
          faultEmailPresent = true;
        }
        expectedChannel = 'post';
      } else {
        await expect(name).toBeVisible();
        await expect(address).toBeVisible();
        const complex = page.locator('div.form-group[id$="_emailInformation"]');
        await expect(complex).toHaveCount(1);
        expect((await complex.locator(':scope > fieldset > legend').allTextContents()).join('').trim()).toBe('');
        await capture.stage('email-selected',page);
        await post.check();
        await assertSourceShapeHiddenControls(name, address);
        await capture.stage('post-selected',page);
        await email.check();
        await expect(name).toHaveAccessibleName(/Name/);
        await assertControlOrder([email,name,address]);
        await capture.stage('email-returned',page);
        await name.fill(emailName);
        await address.fill(emailAddress);
        await capture.stage('email-filled',page);
        contractSatisfied = true;
        expectedChannel = 'email';
      }
    } else if (shape === 'postal-recipient-name') {
      await email.check();
      await assertSourceShapeHiddenControls(postalName);
      await capture.stage('email-selected',page);
      await post.check();
      await expect(postalName).toBeVisible();
      await capture.stage('post-selected',page);
      expectedChannel = 'post';
    } else {
      await email.check();
      await assertSourceShapeHiddenControls(line2);
      await capture.stage('email-selected',page);
      await post.check();
      await capture.stage('post-selected',page);
      expectedChannel = 'post';
    }
    if (expectedChannel === 'post') {
      await page.getByRole('link',{name:"I can't enter a UK postcode",exact:true}).last().click();
      if (shape === 'postal-recipient-name') {
        await expect(postalName).toHaveAccessibleName(mutation ? /^Harness changed postal recipient name/ : /^Name/);
        contractSatisfied = !mutation;
      }
      await postalName.fill(emailName);
      await page.locator('input[id$="AddressLine1"]').fill('Synthetic shape street');
      await page.locator('input[id$="PostCode"]').fill('SW1A 1AA');
      await fillSourceShapePostalSiblings(page);
      await expect(line2).toBeVisible();
      postalLabel=await assertSourceShapePostalLabel(line2,shape === 'optional-postal-line-two' && Boolean(mutation));
      await assertControlOrder([page.locator('input[id$="AddressLine1"]'),line2,page.locator('input[id$="PostCode"]')]);
      await line2.fill('');
      await capture.stage('post-filled',page);
      await continueButton.click();
      if (shape === 'optional-postal-line-two') {
        contractSatisfied = postalLabel === 'Address Line 2 (Optional)';
      }
    } else if (shape === 'conditional-email-complex' || shape === 'case-field-recipient-selector') {
      await continueButton.click();
    }
    await expect(cya).toBeVisible();
    await capture.stage('cya',page);
    const submitted = capture.response('submit',await submitServiceOfDocuments(page,caseId));
    expect(submitted.status()).toBe(201);
    const after = await observeCcd(caseId);
    expect(after.state.state).toBe(before.state.state);
    expect(after.state.case_data.protectedValue).toBe(control);
    const recipients = after.state.case_data.sodAdditionalRecipientsList;
    if(shape==='required-delivery-radio' && mutation) {
      assertRadioValidationBypass(submitted.status(),before,after);
    } else {
      expect(recipients).toHaveLength(1);
      expect(recipients[0].id).toMatch(/^[0-9a-f-]{36}$/i);
      expect(recipients[0].value.serveByPostOrEmail ?? null).toBe(expectedChannel);
    }
    if (expectedChannel === 'email') {
      expect(recipients[0].value.emailInformation).toMatchObject({emailName,emailAddress});
    }
    if (expectedChannel === 'post') {
      expect(recipients[0].value.postalInformation).toMatchObject({postalName:emailName,
        postalAddress:{AddressLine1:'Synthetic shape street',PostCode:'SW1A 1AA',...postalSiblingValues}});
      expect(recipients[0].value.postalInformation.postalAddress.AddressLine2 || null).toBe(expectedLine2);
      if (faultEmailPresent) {
        expect(recipients[0].value.emailInformation).toMatchObject({emailName:'Synthetic fault email recipient',emailAddress:'fault-recipient@harness.example.com'});
      }
    }
    expect(after.state.version).toBe(before.state.version + 1);
    expect(after.history).toHaveLength(before.history.length + 1);
    expect(after.history.filter((event: {id: string}) => event.id === "serviceOfDocuments")).toHaveLength(1);
    expect(after.history.filter((event: {id: string}) => event.id !== "serviceOfDocuments")).toEqual(before.history);

    let filledObservation;
    if (shape === 'optional-postal-line-two') {
      expect(capture.response('line2-case-reopened',await openCcdEventCase(page,caseId)).status()).toBe(200);
      expect(capture.response('line2-event-reopened',await openServiceOfDocuments(page,caseId)).status()).toBe(200);
      await expect(line2).toBeVisible();
      await assertSourceShapePostalLabel(line2,Boolean(mutation));
      await capture.stage('line2-reopened',page);
      await line2.fill(optionalValue);
      await capture.stage('line2-filled',page);
      await continueButton.click();
      await expect(cya).toBeVisible();
      await capture.stage('second-cya',page);
      expect(capture.response('second-submit',await submitServiceOfDocuments(page,caseId)).status()).toBe(201);
      filledObservation = await observeCcd(caseId);
      const filledRecipients = filledObservation.state.case_data.sodAdditionalRecipientsList;
      expect(filledRecipients).toHaveLength(1);
      expect(filledRecipients[0].id).toBe(recipients[0].id);
      expect(filledRecipients[0].value).toEqual({...recipients[0].value,postalInformation:{
        ...recipients[0].value.postalInformation,postalAddress:{...recipients[0].value.postalInformation.postalAddress,AddressLine2:optionalValue}}});
      const expectedFilledData=structuredClone(after.state.case_data);
      expectedFilledData.sodAdditionalRecipientsList[0].value.postalInformation.postalAddress.AddressLine2=optionalValue;
      expect(filledObservation.state.case_data).toEqual(expectedFilledData);
      expect(filledObservation.state.state).toBe(after.state.state);
      expect(filledObservation.state.case_data.protectedValue).toBe(control);
      expect(filledObservation.state.version).toBe(after.state.version + 1);
      expect(filledObservation.history).toHaveLength(after.history.length + 1);
      expect(filledObservation.history.filter((event: {id:string}) => event.id === 'serviceOfDocuments')).toHaveLength(2);
    }

    if (shape === 'case-field-recipient-selector') {
      expect(capture.response('selector-reopened',await openCcdEventCase(page,caseId)).status()).toBe(200);
      await expect(page.getByText(mutation ? 'Harness changed recipient selector' : 'Select additional recipients who needs to be served', {exact:true})).toBeVisible();
      contractSatisfied = !mutation;
      await capture.stage('selector-reopened',page);
    }

    saveCcdEventObservation(`source-shape-${shape}`,{shape,actor,caseId,before,after,filledObservation,postalLabel,contractSatisfied});
    capture.save(process.env.EXUI_CCD_EVIDENCE!);

    await test.step(`harness-assertion:source-shape-${shape}`,async () => {
      expect(contractSatisfied).toBe(true);
    });
}
