import fs from 'node:fs';

import {test,expect} from '../../../fixtures/harnessDivorceProfile';

const facet='divorce-jurisdiction';
const label=process.env.EXUI_HARNESS_MUTATION?'Synthetic read IA':'Synthetic read DIVORCE';

test('DIVORCE profile browser consumer',async({page})=>{
  const ready=page.waitForResponse(response=>decodeURIComponent(new URL(response.url()).pathname)==='/aggregated/caseworkers/:uid/jurisdictions'&&new URL(response.url()).search==='?access=read'&&response.request().method()==='GET');
  await page.goto('/cases/case-search');
  const response=await ready;expect(response.status()).toBe(200);
  const select=page.getByRole('combobox',{name:/^Jurisdiction/});
  await expect(select).toBeVisible();await expect(select).toBeEnabled();
  await select.selectOption({label});
  await expect(select.locator('option:checked')).toHaveText(label);
  const rendered=await select.locator('option').evaluateAll(items=>items.map(x=>x.textContent?.trim()??'').filter(Boolean));
  const observation={facet,url:page.url(),status:response.status(),delivered:await response.json(),rendered,selectedLabel:await select.locator('option:checked').innerText(),enabled:await select.isEnabled()};

 fs.writeFileSync(process.env.EXUI_DIVORCE_OUTPUT+'/profile-browser-observation.json',JSON.stringify(observation));
});
