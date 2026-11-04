import type { Page, APIRequestContext, Locator } from '@playwright/test';

import {
  test, expect, observeCcd, bootstrapCcdEventCase, switchCcdEventActor,
  openCcdEventCase, openServiceOfDocuments, submitServiceOfDocuments,
  saveCcdEventObservation, ccdEventPersonas, eventProofInputs, EVENT_SCOPE,
} from './harnessCcdEvent';

export const shapes = ['required-delivery-radio', 'conditional-email-complex', 'optional-postal-line-two'] as const;
const mutation = process.env.EXUI_HARNESS_MUTATION;
const control = 'synthetic-source-shape-control';
const emailName = 'Synthetic shape recipient';
const emailAddress = 'shape-recipient@harness.example.com';
const optionalValue = 'Synthetic second line';

export async function assertSourceShapeHiddenControls(...controls: Locator[]) {
  // CCD retains inactive complex fields as hidden inputs. Visibility is the contract.
  for (const control of controls) await expect(control).toBeHidden();
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
    const bootstrap = await bootstrapCcdEventCase(request, {protectedValue:control,sodAdditionalRecipientsList:[]});
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
    expect((await openCcdEventCase(page,caseId)).status()).toBe(200);
    await expect(page.getByText(control,{exact:true})).toBeVisible();
    expect((await openServiceOfDocuments(page,caseId)).status()).toBe(200);
    await page.getByLabel('Additional recipients (optional)',{exact:true}).check();
    await page.getByRole('button',{name:'Add new',exact:true}).last().click();
    const email = page.getByLabel('Email',{exact:true});
    const post = page.getByLabel('Post',{exact:true});
    const name = page.locator('input[id$="_emailName"]');
    const address = page.locator('input[id$="_emailAddress"]');
    const line2 = page.locator('input[id$="AddressLine2"]');
    const continueButton = page.getByRole('button',{name:'Continue',exact:true});
    const cya = page.getByText('Check your answers',{exact:false});
    let contractSatisfied = false;
    let expectedChannel: string | null = null;
    let expectedLine2: string | null = null;
    let faultEmailPresent = false;

    if (shape === 'required-delivery-radio') {
      await expect(page.getByText('Served by',{exact:true})).toBeVisible();
      await continueButton.click();
      if (mutation) {
        // The missing required selection must genuinely reach CYA and persist.
        await expect(cya).toBeVisible();
      } else {
        await expect(cya).toHaveCount(0);
        await expect(page.locator('.error-summary, .govuk-error-summary')).toBeVisible();
        contractSatisfied = true;
        await email.check();
        await expect(name).toHaveAccessibleName(/Name/);
        await assertControlOrder([email,name,address]);
        await name.fill(emailName);
        await address.fill(emailAddress);
        expectedChannel = 'email';
        await continueButton.click();
      }
    } else if (shape === 'conditional-email-complex') {
      await email.check();
      if (mutation) {
        await assertSourceShapeHiddenControls(name, address);
        await post.check();
        const visibleFaultNames = page.locator('input[id$="_emailName"]:visible');
        const visibleFaultAddresses = page.locator('input[id$="_emailAddress"]:visible');
        await expect(visibleFaultNames).toHaveCount(await visibleFaultAddresses.count());
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
        await post.check();
        await assertSourceShapeHiddenControls(name, address);
        await email.check();
        await expect(name).toHaveAccessibleName(/Name/);
        await assertControlOrder([email,name,address]);
        await name.fill(emailName);
        await address.fill(emailAddress);
        contractSatisfied = true;
        expectedChannel = 'email';
      }
    } else {
      await email.check();
      await assertSourceShapeHiddenControls(line2);
      await post.check();
      expectedChannel = 'post';
    }
    if (expectedChannel === 'post') {
      await page.getByRole('link',{name:"I can't enter a UK postcode",exact:true}).last().click();
      await page.locator('input[id$="_postalName"]').fill(emailName);
      await page.locator('input[id$="AddressLine1"]').fill('Synthetic shape street');
      await page.locator('input[id$="PostCode"]').fill('SW1A 1AA');
      await fillSourceShapePostalSiblings(page);
      await expect(line2).toBeVisible();
      await expect(line2).toHaveAccessibleName(/Address Line 2/);
      await assertControlOrder([page.locator('input[id$="AddressLine1"]'),line2,page.locator('input[id$="PostCode"]')]);
      await line2.fill('');
      await continueButton.click();
      if (shape === 'optional-postal-line-two' && mutation) {
        await expect(cya).toHaveCount(0);
        await expect(page.locator('.error-summary, .govuk-error-summary')).toBeVisible();
        await line2.fill(optionalValue);
        expectedLine2 = optionalValue;
        await continueButton.click();
      } else if (shape === 'optional-postal-line-two') {
        contractSatisfied = true;
      }
    } else if (shape === 'conditional-email-complex') {
      await continueButton.click();
    }
    await expect(cya).toBeVisible();
    const submitted = await submitServiceOfDocuments(page,caseId);
    expect(submitted.status()).toBe(201);
    const after = await observeCcd(caseId);
    expect(after.state.state).toBe(before.state.state);
    expect(after.state.case_data.protectedValue).toBe(control);
    const recipients = after.state.case_data.sodAdditionalRecipientsList;
    expect(recipients).toHaveLength(1);
    expect(recipients[0].id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(recipients[0].value.serveByPostOrEmail ?? null).toBe(expectedChannel);
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
    if (shape === 'optional-postal-line-two' && !mutation) {
      expect((await openCcdEventCase(page,caseId)).status()).toBe(200);
      expect((await openServiceOfDocuments(page,caseId)).status()).toBe(200);
      await expect(line2).toBeVisible();
      await line2.fill(optionalValue);
      await continueButton.click();
      await expect(cya).toBeVisible();
      expect((await submitServiceOfDocuments(page,caseId)).status()).toBe(201);
      filledObservation = await observeCcd(caseId);
      const filledRecipients = filledObservation.state.case_data.sodAdditionalRecipientsList;
      expect(filledRecipients).toHaveLength(1);
      expect(filledRecipients[0].id).toBe(recipients[0].id);
      expect(filledRecipients[0].value).toEqual({...recipients[0].value,postalInformation:{
        ...recipients[0].value.postalInformation,postalAddress:{...recipients[0].value.postalInformation.postalAddress,AddressLine2:optionalValue}}});
      expect(filledObservation.state.case_data.protectedValue).toBe(control);
      expect(filledObservation.state.version).toBe(after.state.version + 1);
      expect(filledObservation.history).toHaveLength(after.history.length + 1);
      expect(filledObservation.history.filter((event: {id:string}) => event.id === 'serviceOfDocuments')).toHaveLength(2);
    }

    saveCcdEventObservation(`source-shape-${shape}`,{shape,actor,caseId,before,after,filledObservation,contractSatisfied});

    await test.step(`harness-assertion:source-shape-${shape}`,async () => {
      expect(contractSatisfied).toBe(true);
    });
}
