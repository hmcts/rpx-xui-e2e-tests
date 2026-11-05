import fs from 'node:fs';

import { expect, type Page, type PlaywrightWorkerArgs } from '@playwright/test';

import { ccdPersonas, ccdSessionRequest, createSyntheticCase, observeCcd } from './harnessCcd';
import { collectionRows, openUpdate } from './harnessSharedNested';
import { validateComplexEmailObserver } from '../../scripts/lib/exui-complex-email-classification.mjs';

const input = (page:Page, field:string, index:number) => page.locator(`input[id$="_${field}"]`).nth(index);

export async function runComplexEmailText({page,playwright,variant,step}: {
  page:Page; playwright:PlaywrightWorkerArgs['playwright']; variant:'baseline'|'email-type';
  step:(title:string,body:()=>Promise<void>)=>Promise<void>;
}) {
  const directory=process.env.EXUI_CCD_EVIDENCE!;
  const actor=await ccdSessionRequest(playwright,ccdPersonas().sessions.allowed);
  await page.context().clearCookies({name:'xui-webapp'});
  await page.context().addCookies([{name:'xui-webapp',value:ccdPersonas().sessions.allowed,domain:'127.0.0.1',path:'/',expires:-1,httpOnly:true,secure:false,sameSite:'Lax'}]);
  const userResponse=await page.request.get('/api/user/details',{maxRedirects:0});
  expect(userResponse.status()).toBe(200);
  const user=(await userResponse.json()).userInfo;
  const actorId=user.id??user.uid;
  expect(actorId).toBe(ccdPersonas().credentials.allowed.userId);
  const submissions:string[]=[];
  page.on('request',request=>{const path=new URL(request.url()).pathname;if(request.method()==='POST'&&/^\/data\/cases\/\d{16}\/events$/.test(path))submissions.push(path);});
  async function journey(addresses:string[],reject:boolean) {
    const caseId=await createSyntheticCase(actor);
    const before=await observeCcd(caseId);
    fs.writeFileSync(`${directory}/complex-email-${reject?'probe':'control'}-${caseId}-before.json`,JSON.stringify(before),{mode:0o600});
    validateComplexEmailObserver(before.state);
    expect(before.state.case_data.sodAdditionalRecipientsList).toEqual([]);
    await openUpdate(page,caseId);
    const names=addresses.map((_,index)=>`Synthetic contact ${reject?'probe':'control'} ${index+1}`);
    for(let index=0;index<addresses.length;index++) {
      await page.getByRole('button',{name:'Add new',exact:true}).last().click();
      await page.getByLabel('Email',{exact:true}).nth(index).check();
      await expect(input(page,'postalName',index)).toBeHidden();
      await input(page,'emailName',index).fill(names[index]);
      await input(page,'emailAddress',index).fill(addresses[index]);
    }
    const controls=[];
    for(let index=0;index<addresses.length;index++) {
      const field=input(page,'emailAddress',index);
      await expect(field).toHaveAccessibleName('Email address');
      await expect(field).toHaveAttribute('type',variant==='baseline'?'text':'email');
      controls.push(await field.evaluate(element=>({id:element.id,type:(element as HTMLInputElement).type,value:(element as HTMLInputElement).value,label:Array.from((element as HTMLInputElement).labels??[]).map(label=>label.textContent??'').join(' ').trim()})));
    }
    expect(new Set(controls.map(control=>control.id)).size).toBe(addresses.length);
    const validate=async()=>{
      const pending=page.waitForResponse(response=>response.request().method()==='POST'&&new URL(response.url()).pathname==='/data/case-types/HarnessNestedPRL/validate');
      await page.getByRole('button',{name:'Continue',exact:true}).click();
      const response=await pending;
      const sent=response.request().postDataJSON();
      return {status:response.status(),body:await response.json(),request:{path:new URL(response.url()).pathname,data:sent.data,event:{id:sent.event.id}}};
    };
    const startSubmissions=submissions.length;
    const validation=await validate();
    const cya=page.getByText('Check your answers',{exact:false});
    if(reject) {
      expect(validation.status).toBe(422);
      expect(validation.body.details.field_errors).toHaveLength(1);
      expect(validation.body.details.field_errors[0].id).toBe('sodAdditionalRecipientsList.0.emailInformation.emailAddress');
      expect([
        'The data entered is not valid for this type of field, please delete and re-enter using only valid data',
        `${addresses[0]} is not a valid Email address`,
      ]).toContain(validation.body.details.field_errors[0].message);
      await expect(cya).toBeHidden();
      await expect(input(page,'emailAddress',0)).toHaveClass(/govuk-input--error/);
      expect(submissions.slice(startSubmissions)).toHaveLength(0);
      const after=await observeCcd(caseId);expect(after).toEqual(before);
      return {caseId,before,controls,validation,after,submissions:submissions.slice(startSubmissions),status:null,cyaRows:[],restored:[],sent:null};
    }
    expect(validation.status).toBe(200);
    await expect(cya).toBeVisible();
    const cyaRows=await collectionRows(page,names[0],addresses.length);
    for(const [index,row] of cyaRows.entries()){expect(row).toContain(names[index]);expect(row).toContain(addresses[index]);expect(row).toContain('Email address');}
    await page.getByRole('link',{name:/Change/}).first().click();
    const restored=[];
    for(let index=0;index<addresses.length;index++) {
      await expect(input(page,'emailAddress',index)).toHaveValue(addresses[index]);
      await expect(input(page,'emailName',index)).toHaveValue(names[index]);
      restored.push({name:await input(page,'emailName',index).inputValue(),address:await input(page,'emailAddress',index).inputValue()});
    }
    expect((await validate()).status).toBe(200);await expect(cya).toBeVisible();
    const pending=page.waitForResponse(response=>response.request().method()==='POST'&&new URL(response.url()).pathname===`/data/cases/${caseId}/events`);
    await page.getByRole('button',{name:'Submit',exact:true}).click();const response=await pending;expect(response.status()).toBe(201);
    const raw=response.request().postDataJSON();
    expect(Object.hasOwn(raw,'data_classification')).toBe(false);
    const sent={data:raw.data,event:{id:raw.event.id}};
    expect(sent.event.id).toBe('update');
    const after=await observeCcd(caseId);
    fs.writeFileSync(`${directory}/complex-email-${caseId}-after.json`,JSON.stringify(after),{mode:0o600});
    validateComplexEmailObserver(after.state);
    expect(after.state.version).toBe(before.state.version+1);
    expect(after.state.case_data.protectedValue).toBe(before.state.case_data.protectedValue);
    expect(after.history.filter((row:{id:string})=>row.id!=='update')).toEqual(before.history);
    const updates=after.history.filter((row:{id:string})=>row.id==='update');
    expect(updates).toHaveLength(1);
    expect(updates[0].user_id).toBe(actorId);
    const saved=after.state.case_data.sodAdditionalRecipientsList;
    expect(saved).toHaveLength(addresses.length);
    for(let index=0;index<addresses.length;index++) {
      expect(saved[index].value.emailInformation).toEqual({emailName:names[index],emailAddress:addresses[index]});
      expect(saved[index].id).toBe(sent.data.sodAdditionalRecipientsList[index].id);
    }
    expect(new Set(saved.map((row:{id:string})=>row.id)).size).toBe(addresses.length);
    expect(submissions.slice(startSubmissions)).toHaveLength(1);
    return {caseId,before,controls,validation,after,submissions:submissions.slice(startSubmissions),status:response.status(),cyaRows,restored,sent};
  }
  try {
    const healthy=await journey(['alpha@harness.example.com','beta@harness.example.com'],false);
    const probe=await journey(['Synthetic recipient contact alpha','control@harness.example.com'],variant==='email-type');
    const observation={schemaVersion:1,kind:'complex-email-text-observation',variant,actorId,healthy,probe,runtimeAcceptance:false,catalogueCredit:false,releaseCredit:false};
    fs.writeFileSync(`${directory}/complex-email-text-observation.json`,JSON.stringify(observation,null,2)+'\n',{mode:0o600});
    await step('harness-assertion:complex-email-source-text',async()=>{
      expect(probe.validation.status,'COMPLEX_EMAIL_SOURCE_TYPE_TIGHTENED').toBe(200);
    });
  } finally {await actor.dispose();}
}
