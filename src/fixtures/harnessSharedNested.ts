import type { APIRequestContext, Page } from '@playwright/test';

import { SHARED_NESTED_FAULT, SHARED_NESTED_MUTATIONS, sharedNestedValues, type SharedNestedFacet, type SharedNestedValue } from '../../scripts/lib/exui-shared-nested-contract.mjs';
import { currentSharedNestedBinding, replaySharedNestedObservation, saveSharedNestedObservation } from '../../scripts/lib/exui-shared-nested-observations.mjs';

import { test, expect, ccdPersonas, createSyntheticCase, observeCcd } from './harnessCcd';

const mutation=process.env.EXUI_HARNESS_MUTATION??null;
const input=(page:Page,field:string,index:number)=>page.locator(`input[id$="${field==='postcodeLookup'?'postcodeInput':field}"]`).nth(index);
const nameOf=(value:SharedNestedValue)=>value.emailInformation?.emailName??value.postalInformation!.postalName;
async function controls(page:Page,fields:string[],count:number,channel?:'email'|'post') {
  const result=[];
  for(let index=0;index<count;index++)for(const field of fields) {
    const control=field==='serveByPostOrEmail'?page.getByLabel(channel==='email'?'Email':'Post',{exact:true}).nth(index):input(page,field,index);
    await expect(control).toHaveCount(1);
    const raw=await control.evaluate(element=>({domId:element.id,label:Array.from((element as HTMLInputElement).labels??[]).map(label=>label.textContent??'').join(' ').replace(/\s+/g,' ').trim(),domIndex:Array.from(element.ownerDocument.querySelectorAll('input')).indexOf(element as HTMLInputElement),value:(element as HTMLInputElement).value,classes:Array.from(element.classList)}));
    const selection=field==='serveByPostOrEmail'?{checked:await control.isChecked(),oppositeChecked:await page.getByLabel(channel==='email'?'Post':'Email',{exact:true}).nth(index).isChecked()}:{};
    result.push({index,field,...raw,...selection,visible:await control.isVisible()});
  }
  return result;
}
async function branch(page:Page,index:number,channel:'email'|'post') {
  await page.getByLabel(channel==='email'?'Email':'Post',{exact:true}).nth(index).check();
  const visible=channel==='email'?['emailName','emailAddress']:['postalName'];
  const hidden=channel==='email'?['postalName']:['emailName','emailAddress'];
  for(const field of visible)await expect(input(page,field,index)).toBeVisible();
  for(const field of hidden)await expect(input(page,field,index)).toBeHidden();
  return {emailName:await input(page,'emailName',index).isVisible(),emailAddress:await input(page,'emailAddress',index).isVisible(),postalName:await input(page,'postalName',index).isVisible()};
}
async function collectionRows(page:Page,firstName:string,count:number) {
  // The sealed toolkit collection renderer gives each recipient one direct row.
  const table=page.locator('table.collection-field-table').filter({has:page.getByText(firstName,{exact:true})});
  await expect(table).toHaveCount(1);
  const rows=table.locator(':scope > tbody > tr');
  await expect(rows).toHaveCount(count);
  return (await rows.allTextContents()).map(row=>row.replace(/\s+/g,' ').trim());
}
async function openUpdate(page:Page,caseId:string) {
  const read=page.waitForResponse(response=>response.request().method()==='GET'&&new URL(response.url()).pathname===`/data/internal/cases/${caseId}`);
  await page.goto(`/cases/case-details/HARNESS/HarnessNestedPRL/${caseId}`);
  expect((await read).status()).toBe(200);
  await expect(page.getByText('synthetic-protected-original',{exact:true})).toBeVisible();
  const started=page.waitForResponse(response=>response.request().method()==='GET'&&new URL(response.url()).pathname===`/data/internal/cases/${caseId}/event-triggers/update`);
  const trigger=page.locator('ccd-event-trigger');
  await trigger.getByLabel('Next step',{exact:true}).selectOption({label:'Update synthetic case'});
  await trigger.getByRole('button',{name:'Go',exact:true}).click();
  expect((await started).status()).toBe(200);
  await expect(page.getByRole('button',{name:'Add new',exact:true})).toBeVisible();
}
async function fillValues(page:Page,values:SharedNestedValue[],blankOptional=false) {
  for(const [index,value] of values.entries()) {
    if(value.emailInformation) {
      await input(page,'emailName',index).fill(value.emailInformation.emailName);
      await input(page,'emailAddress',index).fill(value.emailInformation.emailAddress);
    } else {
      await input(page,'postalName',index).fill(value.postalInformation!.postalName);
      for(const [field,text] of Object.entries(value.postalInformation!.postalAddress))
        await input(page,field,index).fill(field==='AddressLine2'&&blankOptional?'':text??'');
    }
  }
}
async function postalValues(page:Page,count:number):Promise<SharedNestedValue[]> {
  const result:SharedNestedValue[]=[];
  for(let index=0;index<count;index++) {
    const address:Record<string,string>={};
    for(const field of ['AddressLine1','AddressLine2','AddressLine3','PostTown','County','PostCode','Country'])address[field]=await input(page,field,index).inputValue();
    result.push({serveByPostOrEmail:'post',postalInformation:{postalName:await input(page,'postalName',index).inputValue(),postalAddress:address}});
  }
  return result;
}
export async function runSharedNestedFacet(facet:SharedNestedFacet,page:Page,request:APIRequestContext) {
  expect([null,...SHARED_NESTED_MUTATIONS]).toContain(mutation);
  const binding=currentSharedNestedBinding();
  const details=await page.request.get('/api/user/details',{maxRedirects:0});
  expect(details.status()).toBe(200);
  const user=(await details.json()).userInfo;
  const actorId=user.id??user.uid;
  expect(actorId).toBe(ccdPersonas().credentials.allowed.userId);
  const caseId=await createSyntheticCase(request);
  const before=await observeCcd(caseId);
  await openUpdate(page,caseId);
  const values=sharedNestedValues(facet.channel,facet.recipientCount);
  const next=page.getByRole('button',{name:'Continue',exact:true});
  const cya=page.getByText('Check your answers',{exact:false});
  for(let index=0;index<facet.recipientCount;index++)await page.getByRole('button',{name:'Add new',exact:true}).last().click();
  await next.click();
  await expect(cya).toBeHidden();
  const groups=[];
  for(let index=0;index<facet.recipientCount;index++) {
    const email=page.getByLabel('Email',{exact:true}).nth(index);
    const post=page.getByLabel('Post',{exact:true}).nth(index);
    groups.push({index,selectedEmail:await email.isChecked(),selectedPost:await post.isChecked(),...await email.evaluate(element=>{const group=element.closest('.form-group')!;return {classes:Array.from(group.classList),errorText:group.querySelector('.error-message')?.textContent?.trim()??''};})});
  }
  const radioMandatory={cyaHeadings:await cya.allTextContents(),groups};
  const visibility=[];
  for(let index=0;index<facet.recipientCount;index++) {
    const email=await branch(page,index,'email');
    const post=await branch(page,index,'post');
    visibility.push({index,email,post});
    if(facet.channel==='email')await branch(page,index,'email');
  }
  await next.click();
  await expect(cya).toBeHidden();
  const mandatory={cyaHeadings:await cya.allTextContents(),controls:await controls(page,facet.channel==='email'?['emailName','emailAddress']:['postalName','postcodeLookup'],facet.recipientCount)};
  if(facet.channel==='post')for(let index=0;index<facet.recipientCount;index++)
    await page.getByRole('link',{name:"I can't enter a UK postcode",exact:true}).first().click();
  const postalMandatory=[];
  const mandatoryAttempts:unknown[]=[];
  const saveMandatoryAttempt=()=>saveSharedNestedObservation(`${process.env.EXUI_CCD_EVIDENCE}/${facet.id}-mandatory-attempt.json`,{schemaVersion:1,binding,facetId:facet.id,caseId,actorId,before,checks:mandatoryAttempts});
  if(facet.channel==='post')for(let index=0;index<facet.recipientCount;index++)for(const field of ['AddressLine1','PostCode']) {
    await fillValues(page,values);
    await input(page,field,index).fill('');
    const intended=await postalValues(page,facet.recipientCount);
    await next.click();

    try {
      await test.step(`harness-assertion:shared-nested-${field}-required-${index}`,async()=>{
        await expect(cya).toBeHidden();
        await expect(input(page,field,index)).toHaveClass(/govuk-input--error/);
      });
    } catch(error) {
      const present=await page.locator(`input[id$="${field}"]`).count();
      const observedControls=present===facet.recipientCount?await controls(page,[field],facet.recipientCount):[];
      const tables=page.locator('table.collection-field-table');
      mandatoryAttempts.push({index,field,intended,cyaHeadings:await cya.allTextContents(),controls:observedControls,cyaRows:await tables.locator(':scope > tbody > tr').allTextContents()});
      saveMandatoryAttempt();
      throw error;
    }
    const checked={index,field,intended,cyaHeadings:await cya.allTextContents(),controls:await controls(page,[field],facet.recipientCount)};
    postalMandatory.push(checked);mandatoryAttempts.push({...checked,cyaRows:[]});saveMandatoryAttempt();
  }
  await fillValues(page,values,facet.channel==='post');
  let optional=null;
  if(facet.channel==='post') {
    await next.click();
    await expect(cya).toBeVisible();
    const cyaRows=await collectionRows(page,nameOf(values[0]),facet.recipientCount);
    await page.getByRole('link',{name:/Change/}).first().click();
    optional={cyaRows,restored:await postalValues(page,facet.recipientCount)};
    await fillValues(page,values);
  }
  const filledControls=await controls(page,['serveByPostOrEmail',...(facet.channel==='email'?['emailName','emailAddress']:['postalName','AddressLine1','AddressLine2','AddressLine3','PostTown','County','PostCode','Country'])],facet.recipientCount,facet.channel);
  const legends=(await page.getByText('Served by',{exact:true}).allTextContents()).map(text=>text.trim());
  await next.click();
  await expect(cya).toBeVisible();
  const cyaRows=await collectionRows(page,nameOf(values[0]),facet.recipientCount);
  const submitted=page.waitForResponse(response=>response.request().method()==='POST'&&new URL(response.url()).pathname===`/data/cases/${caseId}/events`);
  await page.getByRole('button',{name:'Submit',exact:true}).click();
  const response=await submitted;
  expect(response.status()).toBe(201);
  const raw=response.request().postDataJSON();
  // Retain intended synthetic data and event only; never the event token or headers.
  const sent={method:'POST',path:new URL(response.url()).pathname,body:{data:raw.data,event:{id:raw.event.id}}};
  const after=await observeCcd(caseId);
  const count=mutation===SHARED_NESTED_FAULT?1:facet.recipientCount;
  await page.goto(`/cases/case-details/HARNESS/HarnessNestedPRL/${caseId}`);
  await expect(page.getByText('synthetic-protected-original',{exact:true})).toBeVisible();
  const savedRows=await collectionRows(page,nameOf(values[0]),count);
  const observation={schemaVersion:1,binding,facetId:facet.id,caseId,actorId,before,radioMandatory,legends,visibility,mandatory,postalMandatory,optional,filledControls,cyaRows,request:sent,status:response.status(),after,savedRows,reread:await observeCcd(caseId)};
  saveSharedNestedObservation(`${process.env.EXUI_CCD_EVIDENCE}/${facet.id}-observation.json`,observation);
  const replay=replaySharedNestedObservation(observation,{binding,actorId,facetId:facet.id,mutation});

  await test.step(`harness-assertion:${mutation===SHARED_NESTED_FAULT?'nested-sibling-preservation':mutation==='ccd-drop-child'?'nested-persistence':mutation==='ccd-drop-postal-optional-child'?'postal-persistence':facet.id}`,async()=>{
    expect(replay.recipientCount).toBe(replay.intendedRecipientCount);
    expect(after.state.case_data.sodAdditionalRecipientsList.map((row:{value:unknown})=>row.value)).toEqual(values);
  });
}
