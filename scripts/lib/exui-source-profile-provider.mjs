import fs from 'node:fs';
import { createHmac, randomUUID } from 'node:crypto';
import { startProviderSeams, seedSyntheticSession } from './exui-provider-seams.mjs';
import { profileJurisdictionRows } from './exui-source-profile-jurisdictions.mjs';

// Transport fixtures only. Filtering, authenticated UID rewriting and session caching remain candidate code.
export async function startProfileJurisdictionProviders(output,{seed=seedSyntheticSession,start=startProviderSeams,health=false}={}) {
  const server=await start(output);
  try {
    const persona=seed(undefined,`harness-source-profile-${randomUUID()}`);
    const cookie=`s:${persona.id}.${createHmac('sha256','synthetic-session-value').update(persona.id).digest('base64').replace(/=+$/,'')}`;
    const original=server.listeners('request')[0],journal=[];
    if(health)fs.writeFileSync(`${output}/profile-health-destinations.json`,'[]',{mode:0o600});
    const route='/aggregated/caseworkers/harness-supervisor/jurisdictions';
    const accesses=new Map([[route,'default'],[`${route}?access=read`,'read'],[`${route}?access=create`,'create']]);
    server.removeListener('request',original);
    server.on('request',async(request,response)=>{
      const url=new URL(request.url,'http://127.0.0.1:3101');
      if(health&&request.method==='GET'&&request.url==='/health'){journal.push({method:'GET',path:'/health'});fs.writeFileSync(`${output}/profile-health-destinations.json`,JSON.stringify(journal),{mode:0o600});return original(request,response);}
      const authGets=new Set(['/o/.well-known/openid-configuration','/health','/health/liveness','/am/role-assignments/actors/harness-supervisor']);
      if(!url.search&&(request.method==='GET'&&authGets.has(url.pathname)||request.method==='POST'&&url.pathname==='/lease'))return original(request,response);
      const access=accesses.get(request.url);
      if(request.method==='GET'&&access) {
        journal.push({method:'GET',path:url.pathname,access});
        fs.writeFileSync(`${output}/profile-jurisdiction-destinations.json`,JSON.stringify(journal),{mode:0o600});
        response.writeHead(200,{'content-type':'application/json'});response.end(JSON.stringify(profileJurisdictionRows(access)));return;
      }
      fs.appendFileSync(`${output}/provider-rejections.jsonl`,JSON.stringify({code:'UNDECLARED_PROFILE_REQUEST',method:request.method,path:url.pathname})+'\n');
      response.writeHead(501,{'content-type':'application/json'});response.end('{"code":"UNDECLARED_PROFILE_REQUEST"}');
    });
    return {server,cookie,readJournal:()=>structuredClone(journal)};
  } catch(error) {await new Promise(resolve=>server.close(resolve));throw error;}
}
