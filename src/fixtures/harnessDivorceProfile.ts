import fs from 'node:fs';

import {test as base,expect} from '@playwright/test';

import {verifyRoutingAsset} from '../harness/routing';

export const test=base.extend<{profileAssets:void}>({profileAssets:[async({context},use)=>{
 const output=process.env.EXUI_DIVORCE_OUTPUT!;
 const manifest=JSON.parse(fs.readFileSync(output+'/manifest.json','utf8'));
 const runtime=JSON.parse(fs.readFileSync(output+'/runtime-identity.json','utf8'));
 expect(runtime.identity).toEqual(manifest.identity);
 const served:{path:string;digest:string}[]=[],checks:Promise<void>[]=[];
 context.on('response',response=>{
  const url=new URL(response.url());
  if(url.origin==='http://127.0.0.1:3100'&&(response.request().resourceType()==='script'||/\.m?js$/.test(url.pathname)))checks.push((async()=>{served.push(verifyRoutingAsset('/candidate/dist/rpx-exui/browser',url.pathname,await response.body()));})());
 });
 const rejected:string[]=[],flagCalls:{host:string;kind:string;method:string;path?:string;response:unknown}[]=[];
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.origin==='http://127.0.0.1:3100'){await route.continue();return;}
  if(['clientstream.launchdarkly.com','clientsdk.launchdarkly.com','events.launchdarkly.com','app.launchdarkly.com'].includes(url.hostname)){
   const method=route.request().method();
   const kind=url.pathname.startsWith('/sdk/evalx/')?'evaluation':url.pathname.includes('goals')?'goals':'auxiliary',response=kind==='goals'?[]:{};
   flagCalls.push({host:url.hostname,kind,method,...(kind==='evaluation'?{path:url.pathname+url.search}:{}),response});
   await route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(response)});return;
  }
  rejected.push(`UNDECLARED_BROWSER_DESTINATION:${url.origin}`);await route.abort('blockedbyclient');
 });
 try{await use();}finally{
  await Promise.all(checks);
  fs.writeFileSync(output+'/profile-browser-flags.json',JSON.stringify({flag:'feature-global-search',evaluationFlags:{},routeFallback:true,liveProvider:false,calls:flagCalls}));
  fs.writeFileSync(output+'/profile-browser-assets.json',JSON.stringify(served));
  fs.writeFileSync(output+'/profile-browser-rejections.json',JSON.stringify(rejected));
  expect(served.length).toBeGreaterThan(0);expect(rejected).toEqual([]);
 }
},{auto:true}]});
export {expect};
