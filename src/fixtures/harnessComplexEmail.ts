import fs from 'node:fs';

import { expect, type Page, type PlaywrightWorkerArgs } from '@playwright/test';

import { validateComplexEmailObserver, validateComplexEmailRecipientIds } from '../../scripts/lib/exui-complex-email-classification.mjs';

import { ccdPersonas, ccdSessionRequest, createSyntheticCase } from './harnessCcd';
import { collectionRows, openUpdate } from './harnessSharedNested';

const input = (page:Page, field:string, index:number) => page.locator(`input[id$="_${field}"]`).nth(index);

const observerStateFields=['id','jurisdiction','state','version','case_type_id','created_date','last_modified','last_state_modified_date','security_classification','case_data','data_classification'];
const observerHistoryFields=['id','summary','description','user_id','user_last_name','user_first_name','event_name','created_date','case_type_id','case_type_version','state_id','state_name','data','data_classification','security_classification','significant_item','proxied_by','proxied_by_last_name','proxied_by_first_name'];
const observerDataKeys=new Set(['protectedValue','sodAdditionalRecipientsList','id','value','classification','serveByPostOrEmail','emailInformation','emailName','emailAddress','postalInformation','postalName','postalAddress','AddressLine1','AddressLine2','AddressLine3','PostTown','County','PostCode','Country']);
const safeObserverValue=(value:unknown):unknown=>Array.isArray(value)?value.map(safeObserverValue):value&&typeof value==='object'
  ?Object.fromEntries(Object.entries(value).filter(([key])=>observerDataKeys.has(key)).map(([key,item])=>[key,safeObserverValue(item)])):value;
const observerFields=(value:Record<string,unknown>,keys:string[])=>Object.fromEntries(keys.filter(key=>Object.hasOwn(value,key)).map(key=>[key,safeObserverValue(value[key])]));

export function createComplexEmailObserver(directory:string) {
  const file=`${directory}/complex-email-observer.jsonl`;
  fs.writeFileSync(file,'',{flag:'wx',mode:0o600});
  let ordinal=0;
  return async(caseId:string,stage:'before'|'after')=>{
    expect(caseId).toMatch(/^\d{16}$/);
    const observer=ccdPersonas().credentials.observer;
    expect(observer.userId).toMatch(/^[a-zA-Z0-9_-]+$/);
    const prefix=`/caseworkers/${observer.userId}/jurisdictions/HARNESS/case-types/HarnessNestedPRL/cases/${caseId}`;
    const results=[];
    for(const view of ['state','history'] as const) {
      const requestPath=prefix+(view==='history'?'/events':'');
      let status:number|null=null;let body:unknown;
      try {
        const response=await fetch(`http://127.0.0.1:4452${requestPath}`,{method:'GET',headers:observer.headers,redirect:'error'});
        status=response.status;
        if(status===200) {
          const raw:unknown=await response.json();
          if(view==='state'&&raw&&typeof raw==='object'&&!Array.isArray(raw))body=observerFields(raw as Record<string,unknown>,observerStateFields);
          else if(view==='history'&&Array.isArray(raw)&&raw.every(item=>item&&typeof item==='object'&&!Array.isArray(item)))body=raw.map(item=>observerFields(item,observerHistoryFields));
          else body={error:'unexpected-response-shape'};
        }else body={error:'http-error'};
      }catch{body={error:status===null?'transport-failed':'non-json-response'};}
      const record={ordinal:++ordinal,stage,view,caseId,actorId:observer.userId,method:'GET',path:requestPath,status,body};
      fs.appendFileSync(file,JSON.stringify(record)+'\n',{mode:0o600});results.push(record);
    }
    expect(results.map(row=>row.status)).toEqual([200,200]);
    const state=results[0].body as {id:number|string;jurisdiction:string;case_type_id:string;version:number;case_data:{protectedValue:unknown;sodAdditionalRecipientsList:Array<{id:string;value:{emailInformation:{emailName:string;emailAddress:string}}}>};data_classification:Record<string,unknown>};
    const history=results[1].body as Array<{id:string;user_id:string;case_type_id:string}>;
    expect(String(state.id)).toBe(caseId);expect(state.jurisdiction).toBe('HARNESS');expect(state.case_type_id).toBe('HarnessNestedPRL');
    expect(Array.isArray(history)).toBe(true);expect(history.every(row=>row.case_type_id==='HarnessNestedPRL')).toBe(true);
    return {state,history};
  };
}

export async function captureComplexEmailControls(page:Page,count:number) {
  const rows=[];
  for(let index=0;index<count;index++) {
    const snapshot=async(field:string)=>input(page,field,index).evaluate(element=>({
      id:element.id,type:(element as HTMLInputElement).type,value:(element as HTMLInputElement).value,
      label:Array.from((element as HTMLInputElement).labels??[]).map(label=>label.textContent??'').join(' ').trim(),
      domIndex:Array.from(element.ownerDocument.querySelectorAll('input')).indexOf(element as HTMLInputElement),
      classes:Array.from(element.classList),
    }));
    const email=page.getByLabel('Email',{exact:true}).nth(index);
    const post=page.getByLabel('Post',{exact:true}).nth(index);
    const postal=input(page,'postalName',index);
    const postalCount=await postal.count();
    rows.push({...await snapshot('emailAddress'),visible:await input(page,'emailAddress',index).isVisible(),
      emailName:{...await snapshot('emailName'),visible:await input(page,'emailName',index).isVisible()},
      channel:{emailSelected:await email.isChecked(),postSelected:await post.isChecked(),
        emailId:await email.getAttribute('id'),postId:await post.getAttribute('id'),
        emailValue:await email.inputValue(),postValue:await post.inputValue()},
      postal:{count:postalCount,id:postalCount?await postal.getAttribute('id'):null,hidden:await postal.isHidden()},
    });
  }
  return rows;
}

export async function runComplexEmailText({page,playwright,variant,step}: {
  page:Page; playwright:PlaywrightWorkerArgs['playwright']; variant:'baseline'|'email-type';
  step:(title:string,body:()=>Promise<void>)=>Promise<void>;
}) {
  const directory=process.env.EXUI_CCD_EVIDENCE!;
  const observe=createComplexEmailObserver(directory);
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
    const before=await observe(caseId,'before');
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
    for(let index=0;index<addresses.length;index++) {
      const field=input(page,'emailAddress',index);
      await expect(field).toHaveAccessibleName('Email address');
      await expect(field).toHaveAttribute('type',variant==='baseline'?'text':'email');
    }
    const controls=await captureComplexEmailControls(page,addresses.length);
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
    const validationResponses=[validation];
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
      const after=await observe(caseId,'after');expect(after).toEqual(before);
      return {caseId,before,controls,validation,validationResponses,after,submissions:submissions.slice(startSubmissions),status:null,cyaRows:[],
        cya:{visible:await cya.isVisible(),rows:[]},restored:[],restoredControls:[],secondCya:null,
        rejectedControls:await captureComplexEmailControls(page,addresses.length),outgoing:null,sent:null};
    }
    expect(validation.status).toBe(200);
    await expect(cya).toBeVisible();
    const cyaRows=await collectionRows(page,names[0],addresses.length);
    const firstCya={visible:await cya.isVisible(),rows:cyaRows};
    for(const [index,row] of cyaRows.entries()){expect(row).toContain(names[index]);expect(row).toContain(addresses[index]);expect(row).toContain('Email address');}
    await page.getByRole('link',{name:/Change/}).first().click();
    const restored=[];
    for(let index=0;index<addresses.length;index++) {
      await expect(input(page,'emailAddress',index)).toHaveValue(addresses[index]);
      await expect(input(page,'emailName',index)).toHaveValue(names[index]);
      restored.push({name:await input(page,'emailName',index).inputValue(),address:await input(page,'emailAddress',index).inputValue()});
    }
    const restoredControls=await captureComplexEmailControls(page,addresses.length);
    const secondValidation=await validate();validationResponses.push(secondValidation);
    expect(secondValidation.status).toBe(200);await expect(cya).toBeVisible();
    const secondCya={visible:await cya.isVisible(),rows:await collectionRows(page,names[0],addresses.length)};
    const pending=page.waitForResponse(response=>response.request().method()==='POST'&&new URL(response.url()).pathname===`/data/cases/${caseId}/events`);
    await page.getByRole('button',{name:'Submit',exact:true}).click();const response=await pending;expect(response.status()).toBe(201);
    const raw=response.request().postDataJSON();
    const outgoing={method:response.request().method(),path:new URL(response.url()).pathname,
      classificationPresent:Object.hasOwn(raw,'data_classification'),dataClassificationPresent:Object.hasOwn(raw.data,'data_classification')};
    expect(outgoing.classificationPresent).toBe(false);
    const sent={data:raw.data,event:{id:raw.event.id}};
    fs.writeFileSync(`${directory}/complex-email-${caseId}-submitted.json`,JSON.stringify(sent),{mode:0o600});
    expect(sent.event.id).toBe('update');
    const after=await observe(caseId,'after');
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
    validateComplexEmailRecipientIds(saved,sent.data.sodAdditionalRecipientsList);
    for(let index=0;index<addresses.length;index++) {
      expect(saved[index].value.emailInformation).toEqual({emailName:names[index],emailAddress:addresses[index]});
    }
    expect(new Set(saved.map((row:{id:string})=>row.id)).size).toBe(addresses.length);
    expect(submissions.slice(startSubmissions)).toHaveLength(1);
    return {caseId,before,controls,validation,validationResponses,after,submissions:submissions.slice(startSubmissions),status:response.status(),
      cyaRows,cya:firstCya,restored,restoredControls,secondCya,rejectedControls:[],outgoing,sent};
  }
  try {
    const healthy=await journey(['alpha@harness.example.com','beta@harness.example.com'],false);
    const probe=await journey(['Synthetic recipient contact alpha','control@harness.example.com'],variant==='email-type');
    const observation={schemaVersion:1,kind:'complex-email-text-observation',variant,actorId,healthy,probe,sourceComplete:false,runtimeAcceptance:false,catalogueCredit:false,releaseCredit:false};
    fs.writeFileSync(`${directory}/complex-email-text-observation.json`,JSON.stringify(observation,null,2)+'\n',{mode:0o600});
    await step('harness-assertion:complex-email-source-text',async()=>{
      expect(probe.validation.status,'COMPLEX_EMAIL_SOURCE_TYPE_TIGHTENED').toBe(200);
    });
  } finally {await actor.dispose();}
}
