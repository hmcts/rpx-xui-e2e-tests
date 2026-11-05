import fs from 'node:fs';

import {test,expect} from '../../../fixtures/harnessDivorceProfile';

const facet='divorce-global-search';

test('DIVORCE profile browser consumer',async({page,context})=>{

  const ready=page.waitForResponse(response=>response.url()==='http://127.0.0.1:3100/api/globalSearch/services'&&response.request().method()==='GET');
  await page.goto('/search');const response=await ready;expect(response.status()).toBe(200);const delivered=await response.json();
  const select=page.getByRole('combobox',{name:'Services',exact:true});await expect(select).toBeVisible();await expect(select).toHaveValue('ALL');
  const options=select.locator('option:not([value="ALL"])');await expect(options).toHaveCount(delivered.length);
  const rendered=await options.evaluateAll(items=>items.map(x=>({id:(x as HTMLOptionElement).value,label:x.textContent?.trim()??''})));
  const warmResponse=await context.request.get('/api/globalSearch/services');expect(warmResponse.status()).toBe(200);const warm=await warmResponse.json();
  await page.locator('form').getByLabel('16-digit case reference',{exact:true}).fill('1111222233334444');
  const post=page.waitForResponse(res=>res.url()==='http://127.0.0.1:3100/api/globalsearch/results'&&res.request().method()==='POST');
  const auxiliary=page.waitForResponse(res=>decodeURIComponent(new URL(res.url()).pathname)==='/aggregated/caseworkers/:uid/jurisdictions'&&new URL(res.url()).search==='?access=read');
  await page.locator('form').getByRole('button',{name:'Search',exact:true}).click();const [result,aux]=await Promise.all([post,auxiliary]);expect(result.status()).toBe(200);expect(aux.status()).toBe(200);
  const headers=await result.request().allHeaders();const csrfHeaderPresent=Boolean(headers['x-xsrf-token']?.trim());expect(csrfHeaderPresent).toBe(true);
  const observation={facet,url:'http://127.0.0.1:3100/search',status:response.status(),delivered,warm,rendered,selected:'ALL',postStatus:result.status(),csrfHeaderPresent,upstream:result.request().postDataJSON()};
 fs.writeFileSync(process.env.EXUI_DIVORCE_OUTPUT+'/profile-browser-observation.json',JSON.stringify(observation));
});
