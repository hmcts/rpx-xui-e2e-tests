import {expect,type Page} from '@playwright/test';

import {applicantResultContract,applicantResultObserved} from '../../scripts/lib/exui-applicant-results.mjs';
import {expectedResultFieldType,validateResultCandidateColumns} from '../../scripts/lib/exui-result-field-types.mjs';

export type ResultView='SEARCH'|'WORKBASKET';
export interface ResultColumn {case_field_id:string;label:string;order:number}
export interface ExpectedResults {headers:Array<{fields:ResultColumn[]}>;cases:Array<{case_id:string;fields:Record<string,string>}>}
function displayDate(value: string,type: string) {
 const match=/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2}))?/.exec(value);
 expect(match).not.toBeNull();
 const [,year,month,day,hour,minute,second]=match!;
 const date=`${Number(day)} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Number(month)-1]} ${year}`;
 return type==='Date'?date:`${date}, ${Number(hour)%12||12}:${minute}:${second} ${Number(hour)>=12?'PM':'AM'}`;
}
function expectedRow(view: string,cases: Array<{case_id:string;fields:Record<string,string>}>,index:number,reference:string) {
 return view==='WORKBASKET'?cases[index]:cases.find(item=>item.case_id===reference);
}
function displayValue(raw: string,field: {case_field_id:string}) {
 const independentType=expectedResultFieldType(field.case_field_id);
 const type=independentType.type;
 if(type==='Date'||type==='DateTime')return displayDate(raw,type);
 if(type==='FixedList')return independentType.fixed_list_items.find(item=>item.code===raw)!.label;
 return String(raw);
}

export async function observeResultTable(page:Page,useCase:ResultView,expected:ExpectedResults) {
  await page.goto(useCase==='SEARCH'?'/cases/case-search':'/cases');
  await page.getByLabel(useCase==='SEARCH'?'Jurisdiction*':'Jurisdiction',{exact:true}).selectOption({label:'Disposable Harness'});
  await page.getByLabel(useCase==='SEARCH'?'Case type*':'Case type',{exact:true}).selectOption({label:'Harness result columns'});
  const response=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/data/internal/searchCases'&&new URL(r.url()).searchParams.get('use_case')===useCase);
  await page.getByRole('button',{name:/^Apply(?: filter)?$/}).click();
  const observed=await response;expect(observed.status()).toBe(200);
  const body=await observed.json();expect(body.total).toBe(3);
  validateResultCandidateColumns(body,expected.headers[0].fields);
  const table=page.locator('ccd-search-result table');await expect(table).toBeVisible();
  const columns=[...expected.headers[0].fields].sort((a,b)=>a.order-b.order);
  await expect(table.locator('th.search-result-column-header .search-result-column-label')).toHaveText(columns.map(c=>c.label));
  const rows=table.locator('tbody tr');await expect(rows).toHaveCount(3);
  const references: string[]=[];
  for(let index=0;index<3;index++) {
   const actual=rows.nth(index);
   const href=await actual.locator('td.search-result-column-cell').first().getByRole('link').getAttribute('href');
   const reference=href?.split('/').at(-1);expect(reference).toMatch(/^\d{16}$/);references.push(reference!);
   const row=expectedRow(useCase,expected.cases,index,reference!);
   expect(row).toBeDefined();
   await expect(actual.locator('td.search-result-column-cell').first().getByRole('link')).toHaveAttribute('href',new RegExp(`/HARNESS/HarnessResultsPRL/${row!.case_id}$`));
   for(let col=0;col<columns.length;col++) {
    const field=columns[col],raw=row!.fields[field.case_field_id];
    const text=displayValue(raw,field);
    await expect(actual.locator('td.search-result-column-cell').nth(col)).toHaveText(text);
   }
  }
  expect([...references].sort()).toEqual(expected.cases.map((item: {case_id:string})=>item.case_id).sort());
  return {useCase,applicantObserved:applicantResultObserved(useCase,body.columns),applicantExpected:applicantResultContract(useCase),columns:columns.map(c=>c.case_field_id),cells:21,rows:3,references};
}
