import fs from 'node:fs';
import {handleProfileSystemAuth} from './exui-profile-system-auth-provider.mjs';
import { createHmac, randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { startProviderSeams, seedSyntheticSession } from './exui-provider-seams.mjs';
import {handleDivorceBrowserProvider} from './exui-divorce-profile-browser-provider.mjs';
import {handleDivorceProvider} from './exui-source-profile-divorce-provider.mjs';
import {handleStCicProvider} from './exui-st-cic-profile-provider.mjs';
import {stCicFacet as validateStCicFacet} from './exui-st-cic-profile-contract.mjs';
import { profileJurisdictionRows } from './exui-source-profile-jurisdictions.mjs';

// Transport fixtures only. Filtering, authenticated UID rewriting and session caching remain candidate code.
export async function startProfileJurisdictionProviders(output,{seed=seedSyntheticSession,start=startProviderSeams,health=false,membership=false,divorce=null,frFacet=null,iaPositive=false,membershipFamily='CMC',browserFacet=null,stCicFacet=null}={}) {
  if(stCicFacet!==null)validateStCicFacet(stCicFacet);
  const server=await start(output);
  try {
    const persona=seed(undefined,`harness-source-profile-${randomUUID()}`);
    const cookie=`s:${persona.id}.${createHmac('sha256','synthetic-session-value').update(persona.id).digest('base64').replace(/=+$/,'')}`;
    const original=server.listeners('request')[0],journal=[],support=[];
    if(stCicFacet)for(const name of ['destinations','support'])fs.writeFileSync(`${output}/profile-st-cic-${name}.json`,'[]',{mode:0o600});
    if(browserFacet){fs.writeFileSync(`${output}/profile-browser-support.json`,'[]',{mode:0o600});if(browserFacet==='divorce-global-search')fs.writeFileSync(`${output}/profile-global-destinations.json`,'[]',{mode:0o600});}
    if(health)fs.writeFileSync(`${output}/profile-health-destinations.json`,'[]',{mode:0o600});
    if(iaPositive)fs.writeFileSync(`${output}/profile-ia-wa-destinations.json`,'[]',{mode:0o600});
    if(membership)fs.writeFileSync(`${output}/profile-wa-membership-destinations.json`,'[]',{mode:0o600});
    // Independent synthetic transport fixtures; the membership oracle does not import these responses.
    const tasks=iaPositive?[
      [{case_id:'3333444455556666',case_jurisdiction:'IA',case_type:'HarnessPositiveIA',event_id:'positiveRouteIA'},'positive-ia-route'],
      [{case_id:'7777888899990000',case_jurisdiction:'CIVIL',case_type:'HarnessPositiveCIVIL',event_id:'positiveRouteCIVIL'},'positive-civil-route'],
      [{case_id:'5555666677778888',case_jurisdiction:'IA',case_type:'HarnessPositiveIA',event_id:'positivePostIA'},'positive-ia-post'],
      [{case_id:'8888999900001111',case_jurisdiction:'CIVIL',case_type:'HarnessPositiveCIVIL',event_id:'positivePostCIVIL'},'positive-civil-post'],
    ]:[
      [{case_id:'1111222233334444',case_jurisdiction:'CMC',case_type:'HarnessMembershipCMC',event_id:'profilePostCMC'},'membership-cmc-post'],
      [{case_id:'5555666677778888',case_jurisdiction:'IA',case_type:'HarnessMembershipIA',event_id:'profilePostIA'},'membership-ia-post'],
      [{case_id:'9999000011112222',case_jurisdiction:'CMC',case_type:'HarnessMembershipCMC',event_id:'profileRouteCMC'},'membership-cmc-route'],
      [{case_id:'3333444455556666',case_jurisdiction:'IA',case_type:'HarnessMembershipIA',event_id:'profileRouteIA'},'membership-ia-route'],
    ].map(([body,marker])=>membershipFamily==='DIVORCE'&&body.case_jurisdiction==='CMC'?[{...body,case_jurisdiction:'DIVORCE',case_type:'HarnessMembershipDIVORCE'},marker.replace('cmc','divorce')]:[body,marker]);
    if(divorce)fs.writeFileSync(`${output}/profile-divorce-destinations.json`,'[]',{mode:0o600});
    if(frFacet)fs.writeFileSync(`${output}/profile-fr-destinations.json`,'[]',{mode:0o600});
    const route='/aggregated/caseworkers/harness-supervisor/jurisdictions';
    const accesses=new Map([[route,'default'],[`${route}?access=read`,'read'],[`${route}?access=create`,'create']]);
    server.removeListener('request',original);
    server.on('request',async(request,response)=>{
      const url=new URL(request.url,'http://127.0.0.1:3101');
      if(health&&request.method==='GET'&&request.url==='/health'){journal.push({method:'GET',path:'/health'});fs.writeFileSync(`${output}/profile-health-destinations.json`,JSON.stringify(journal),{mode:0o600});return original(request,response);}
      if(stCicFacet==='st-cic-wa-health'&&request.method==='GET'&&request.url==='/health'){if(await handleStCicProvider(request,response,{facet:stCicFacet,journal,output,support}))return;}
      if(['st-cic-staff','st-cic-mapping'].includes(stCicFacet)&&await handleProfileSystemAuth(request,response))return;
      const authGets=new Set(['/o/.well-known/openid-configuration','/health','/health/liveness','/am/role-assignments/actors/harness-supervisor']);
      if(!(stCicFacet==='st-cic-wa-health'&&url.pathname==='/health')&&!url.search&&(request.method==='GET'&&authGets.has(url.pathname)||request.method==='POST'&&url.pathname==='/lease'))return original(request,response);
      if(stCicFacet&&stCicFacet!=='st-cic-wa-health'&&await handleStCicProvider(request,response,{facet:stCicFacet,journal,output,support}))return;
      if(browserFacet&&await handleDivorceBrowserProvider(request,response,{facet:browserFacet,journal,output,support}))return;
      if(divorce&&await handleDivorceProvider(request,response,{facet:divorce,journal,output}))return;
      if(frFacet&&await handleDivorceProvider(request,response,{facet:frFacet==='fr-staff'?'staff':'mapping',family:'FR',serviceCode:'ABA2',journal,output}))return;
      if((membership||iaPositive)&&request.method==='POST'&&request.url==='/task/search-for-completable') {
        let raw='',size=0,body;
        for await(const chunk of request){size+=chunk.length;if(size<=4096)raw+=chunk;}
        if(size<=4096)try{body=JSON.parse(raw);}catch{/* Reject without publishing the request body. */}
        const task=tasks.find(([expected])=>isDeepStrictEqual(body,expected));
        if(task){
          journal.push({method:'POST',path:url.pathname,body:task[0]});
          fs.writeFileSync(`${output}/${iaPositive?'profile-ia-wa-destinations.json':'profile-wa-membership-destinations.json'}`,JSON.stringify(journal),{mode:0o600});
          response.writeHead(200,{'content-type':'application/json'});response.end(JSON.stringify([{id:task[1],name:iaPositive?'Synthetic positive membership task':'Synthetic membership task'}]));return;
        }
      }
      const access=accesses.get(request.url);
      if(frFacet==='fr-jurisdiction'&&request.method==='GET'&&access){journal.push({method:'GET',path:url.pathname,access});fs.writeFileSync(`${output}/profile-fr-destinations.json`,JSON.stringify(journal),{mode:0o600});response.writeHead(200,{'content-type':'application/json'});response.end(JSON.stringify(profileJurisdictionRows(access)));return;}
      if(!stCicFacet&&!membership&&!divorce&&!frFacet&&!iaPositive&&browserFacet!=='divorce-global-search'&&request.method==='GET'&&access) {
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
