import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

export const CCD_IMAGES = {
 data:'sha256:230af88ec4791950396e7a78f2dc330018d1a259242e317f4374ec5a384d30c0',
 definition:'sha256:4c6b17b06d347d650fb8d26542716e1d723b7c8b8d44eee69908299cc8f4af52',
 profile:'sha256:bc8b584e7e8cfd043211a4940b8c4777a7df3cae6f36fa328e2a5ef8880b0cc3',
 s2s:'sha256:beb0c921e1c42151e24f7a8957c52c382ee41189ba015ba0cd681f582cff7117',
 idam:'sha256:c52d1d8891a215c5358640f8e17754fd828789c5bc3a87ba5ebb1c49341e253f',
 database:'sha256:19edba91a88d4a3d532e11d16c8cfa4b0e26e67d1b90467220cd5672c6cbd0f7',
 client:'sha256:c0122351f25f04facee976f9db7214789eabadb489f4e4aea9cd00a0d6af77c4'
};
const fixtureRoot=fileURLToPath(new URL('../fixtures/ccd/',import.meta.url));
const password='SyntheticHarnessPassword17';
export function docker(args,input) {
 const result=spawnSync('docker',args,{input,encoding:'utf8',maxBuffer:32*1024*1024,timeout:90000});
 if(result.error||result.status!==0) throw new Error(`DOCKER_COMMAND_FAILED ${args.slice(0,2).join(' ')} ${result.error?.message||result.stderr}`);
 return result.stdout.trim();
}
export function validateCcdDefinition(value,key='') {
 if(Array.isArray(value)) return value.forEach(item=>validateCcdDefinition(item,key));
 if(value&&typeof value==='object') return Object.entries(value).forEach(([name,item])=>validateCcdDefinition(item,name));
 if(typeof value==='string'&&value&&(/^[a-z][a-z0-9+.-]*:\/\//i.test(value)||/callback/i.test(key))) {
  let url;try{url=new URL(value);}catch{throw new Error('INVALID_CCD_CALLBACK_DESTINATION');}
  if(url.origin!=='http://127.0.0.1:3101'||url.username||url.password) throw new Error('UNDECLARED_CCD_DESTINATION');
 }
}
export function sidecarArguments({owner,namespace,image,service,env}) {
 if(!/^sha256:[a-f0-9]{64}$/.test(image)) throw new Error('PINNED_CCD_IMAGE_REQUIRED');
 if(!/^[a-f0-9]{64}$/.test(namespace)||!/^harness-[a-z0-9-]+$/.test(owner)||!/^\w+$/.test(service)) throw new Error('OWNED_CCD_NAMESPACE_REQUIRED');
 for(const value of Object.values(env)) if(/^https?:\/\//.test(value)&&new URL(value).hostname!=='127.0.0.1') throw new Error('NONLOCAL_CCD_ENVIRONMENT');
 return ['run','-d','--name',`${owner}-${service}`,'--label',`exui.harness.owner=${owner}`,'--label',`exui.harness.service=${service}`,'--network',`container:${namespace}`,'--cap-drop','ALL','--security-opt','no-new-privileges','--pids-limit','512','--memory','1536m',...Object.entries(env).flatMap(([k,v])=>['-e',`${k}=${v}`]),image];
}
const transport=`const chunks=[];for await(const c of process.stdin)chunks.push(c);const s=JSON.parse(Buffer.concat(chunks));let body=s.body;const headers=s.headers||{};if(s.file){delete headers['content-type'];const f=new FormData();f.set('file',new Blob([Buffer.from(s.file,'base64')]),'nested-prl.xlsx');body=f;}else if(body&&typeof body!=='string'){headers['content-type']='application/json';body=JSON.stringify(body);}const r=await fetch(s.url,{method:s.method||'GET',headers,body,signal:AbortSignal.timeout(15000)});console.log(JSON.stringify({status:r.status,body:await r.text()}));`;
export function ccdRequest(state,port,route,options={}) {
 if(![4451,4452,4453,4502,5000].includes(port)||!route.startsWith('/')) throw new Error('INVALID_CCD_REQUEST_DESTINATION');
 const result=JSON.parse(docker(['exec','-i',state.containers.client,'node','--input-type=module','-e',transport],JSON.stringify({url:`http://127.0.0.1:${port}${route}`,...options})));
 try {result.body=JSON.parse(result.body);}catch{} return result;
}
const save=(state)=>fs.writeFileSync(path.join(state.output,'runtime.json'),JSON.stringify(state,null,2)+'\n');
export async function startCcdRuntime(output,{runDocker=docker}={}) {
 fs.mkdirSync(path.dirname(path.resolve(output)),{recursive:true});
 try{fs.mkdirSync(output);}catch(error){if(error.code==='EEXIST')throw new Error('CCD_FRESH_OUTPUT_REQUIRED');throw error;}
 const state={schemaVersion:1,ready:false,owner:`harness-${crypto.randomBytes(8).toString('hex')}`,output:path.resolve(output),containers:{},images:{},caseType:'HarnessNestedPRL',jurisdiction:'HARNESS',policy:'real CCD RBAC; synthetic IDAM simulator; no ABAC/provider credit'};
 const resources=Object.fromEntries(Object.entries(CCD_IMAGES).map(([service,image])=>[service,{name:`${state.owner}-${service}`,image}]));
 fs.writeFileSync(path.join(state.output,'recovery.json'),JSON.stringify({owner:state.owner,output:state.output,resources},null,2)+'\n',{flag:'wx'});
 save(state);
 prepareCcdImport();
 for(const [service,image] of Object.entries(CCD_IMAGES)) {
  const info=JSON.parse(runDocker(['image','inspect',image]))[0];
  if(info.Id!==image||info.Architecture!=='arm64'||!info.RepoDigests?.some(d=>d.endsWith('@'+image))) throw new Error('CCD_IMAGE_IDENTITY_MISMATCH');
  state.images[service]={id:info.Id,architecture:info.Architecture,repoDigests:info.RepoDigests};
 }
 state.namespace=runDocker(['create','--name',`${state.owner}-database`,'--label',`exui.harness.owner=${state.owner}`,'--label','exui.harness.service=database','--network','none','--tmpfs','/var/lib/postgresql/data:rw,nosuid,size=512m,uid=999,gid=999,mode=0700','-e','POSTGRES_HOST_AUTH_METHOD=trust','-e',`DB_USERNAME=ccd`,'-e',`DB_PASSWORD=${password}`,CCD_IMAGES.database,'postgres','-c','listen_addresses=127.0.0.1']);
 state.containers.database=state.namespace; save(state);runDocker(['start',state.namespace]);
 function run(service,env,args=[]) { const command=sidecarArguments({owner:state.owner,namespace:state.namespace,image:CCD_IMAGES[service],service,env});command.splice(0,2,'create');state.containers[service]=runDocker([...command,...args]);save(state);runDocker(['start',state.containers[service]]); }
 run('client',{},['node','-e','setInterval(()=>{},2147483647)']);
 const probes=JSON.parse(runDocker(['exec',state.containers.client,'node','-e',`const net=require('net');Promise.all(['1.1.1.1','192.168.65.254','host.docker.internal'].map(host=>new Promise(resolve=>{const s=net.connect({host,port:443});s.setTimeout(700);s.on('connect',()=>{s.destroy();resolve({host,connected:true})});s.on('error',()=>resolve({host,connected:false}));s.on('timeout',()=>{s.destroy();resolve({host,connected:false})});}))).then(v=>console.log(JSON.stringify(v)));`]));
 if(probes.some(p=>p.connected)) throw new Error('CCD_NETWORK_ESCAPE');state.forbiddenProbes=probes;save(state);
 for(let i=0;i<90;i++) {try{runDocker(['exec',state.namespace,'pg_isready','-U','postgres']);break;}catch{await new Promise(r=>setTimeout(r,1000));}}
 runDocker(['exec',state.namespace,'psql','-U','postgres','-c',`ALTER USER ccd WITH PASSWORD '${password}';`]);
 const common={SERVER_ADDRESS:'127.0.0.1',JAVA_TOOL_OPTIONS:'-XX:MaxRAMPercentage=65',REFORM_ENVIRONMENT:'local',REFORM_TEAM:'ccd',APPINSIGHTS_INSTRUMENTATIONKEY:'',APPLICATIONINSIGHTS_CONNECTION_STRING:'',IDAM_S2S_URL:'http://127.0.0.1:4502',IDAM_USER_URL:'http://127.0.0.1:5000'};
 run('idam',{...common,SERVER_PORT:'5000',SIMULATOR_OPENID_BASE_URL:'http://127.0.0.1:5000',SIMULATOR_OPENID_BASE_URL_OUTSIDE_NETWORK:'http://127.0.0.1:5000'});
 run('s2s',{...common,SERVER_PORT:'4502',JWT_KEY:'U3ludGhldGljSGFybmVzc0tleUZvckxvY2FsVXNlT25seVN5bnRoZXRpY0hhcm5lc3NLZXlGb3JMb2NhbFVzZU9ubHk=',TESTING_SUPPORT_ENABLED:'true',MICROSERVICEKEYS_CCD_GW:'AAAAAAAAAAAAAAAA',MICROSERVICEKEYS_CCD_DATA:'AAAAAAAAAAAAAAAA',MICROSERVICEKEYS_CCD_DEFINITION:'AAAAAAAAAAAAAAAA',MICROSERVICEKEYS_CCD_ADMIN:'AAAAAAAAAAAAAAAA',MICROSERVICEKEYS_XUI_WEBAPP:'AAAAAAAAAAAAAAAA'});
 const db=(prefix)=>({[prefix+'_DB_HOST']:'127.0.0.1',[prefix+'_DB_PORT']:'5432',[prefix+'_DB_USERNAME']:'ccd',[prefix+'_DB_PASSWORD']:password,[prefix+'_DB_USE_SSL']:'false'});
 run('profile',{...common,...db('USER_PROFILE'),REFORM_SERVICE_NAME:'ccd-user-profile-api'});
 run('definition',{...common,...db('DEFINITION_STORE'),DEFINITION_STORE_IDAM_KEY:'AAAAAAAAAAAAAAAA',DEFINITION_STORE_S2S_AUTHORISED_SERVICES:'ccd_data,ccd_gw,ccd_admin,xui_webapp',USER_PROFILE_HOST:'http://127.0.0.1:4453',REFORM_SERVICE_NAME:'ccd-definition-store-api',ELASTIC_SEARCH_ENABLED:'false'});
 run('data',{...common,...db('DATA_STORE'),DATA_STORE_IDAM_KEY:'AAAAAAAAAAAAAAAA',DATA_STORE_TOKEN_SECRET:'synthetic-isolated-ccd-event-token-secret',DATA_STORE_S2S_AUTHORISED_SERVICES:'ccd_gw,xui_webapp,ccd_data',DEFINITION_STORE_HOST:'http://127.0.0.1:4451',USER_PROFILE_HOST:'http://127.0.0.1:4453',IDAM_API_BASE_URL:'http://127.0.0.1:5000',IDAM_OIDC_URL:'http://127.0.0.1:5000',REFORM_SERVICE_NAME:'ccd-data-store-api',ELASTIC_SEARCH_ENABLED:'false',ENABLE_ATTRIBUTE_BASED_ACCESS_CONTROL:'false',ENABLE_PSEUDO_ROLE_ASSIGNMENTS_GENERATION:'false',ENABLE_PSEUDO_ACCESS_PROFILES_GENERATION:'false',TESTING_SUPPORT_ENABLED:'true',MIGRATIONS_ENDPOINT_ENABLED:'false',CCD_DEFAULTPRINTURL:'http://127.0.0.1:3101/print',CASE_DOCUMENT_AM_URL:'http://127.0.0.1:3101',REFERENCE_DATA_API_URL:'http://127.0.0.1:3101',ROLE_ASSIGNMENT_URL:'http://127.0.0.1:3101'});
 for(const port of [5000,4502,4453,4451,4452]) {let healthy=false;for(let i=0;i<120;i++){try{if(ccdRequest(state,port,port===4452?'/health/readiness':'/health').status===200){healthy=true;break;}}catch{}await new Promise(r=>setTimeout(r,1000));}if(!healthy)throw new Error(`CCD_UNHEALTHY_${port}`);}
 state.ready=true;save(state);return state;
}
const digest=(value)=>'sha256:'+crypto.createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
export function assertObservedCcdDefinition(receipt,observed) {
 assert.equal(digest(observed),receipt.observedDefinitionDigest,'CCD_IMPORTED_DEFINITION_DRIFT');
 assert.equal(observed.version?.number,receipt.definitionVersion,'CCD_IMPORTED_VERSION_DRIFT');
}
export function verifyCcdContainerIdentity(state,inspectContainer=(id)=>JSON.parse(docker(['inspect',id]))[0]) {
 assert.deepEqual(Object.keys(state.containers).sort(),Object.keys(CCD_IMAGES).sort(),'CCD_RUNTIME_SERVICE_INVENTORY_MISMATCH');
 assert.equal(state.containers.database,state.namespace,'CCD_RUNTIME_NAMESPACE_MISMATCH');
 for(const [service,id] of Object.entries(state.containers)) {
  const info=inspectContainer(id);
  assert.equal(info.Image,CCD_IMAGES[service],'CCD_RUNTIME_IMAGE_MISMATCH');
  assert.equal(info.Config.Labels?.['exui.harness.owner'],state.owner,'CCD_RUNTIME_OWNER_MISMATCH');
  assert.equal(info.Config.Labels?.['exui.harness.service'],service,'CCD_RUNTIME_SERVICE_MISMATCH');
  assert.equal(info.HostConfig.Privileged||false,false,'CCD_RUNTIME_PRIVILEGED');
  assert.notEqual(info.HostConfig.PidMode,'host','CCD_RUNTIME_HOST_PID');
  assert((info.Mounts||[]).every(m=>m.Type==='tmpfs'),'CCD_RUNTIME_STORAGE_MOUNT');
  assert.equal(info.HostConfig.NetworkMode,service==='database'?'none':`container:${state.namespace}`,'CCD_RUNTIME_NAMESPACE_MISMATCH');
  assert.equal(info.State.Running,true,'CCD_RUNTIME_NOT_RUNNING');
  assert.deepEqual(info.HostConfig.Binds||[],[],'CCD_RUNTIME_HOST_MOUNT');
  assert.deepEqual(info.HostConfig.PortBindings||{}, {}, 'CCD_RUNTIME_PUBLISHED_PORT');
 }
}
export function loadCcdRuntimeForReuse(output,inspectContainer) {
 const state=JSON.parse(fs.readFileSync(path.join(output,'runtime.json')));
 assert.equal(path.resolve(state.output||output),path.resolve(output),'CCD_RUNTIME_OUTPUT_MISMATCH');
 verifyCcdContainerIdentity(state,inspectContainer);
 return state;
}
export function verifyCcdRuntimeIdentity(state) {
 prepareCcdImport();
 verifyCcdContainerIdentity(state);
 const receipt=JSON.parse(fs.readFileSync(path.join(state.output,'definition-import.json')));
 assert.equal(digest(fs.readFileSync(path.join(fixtureRoot,'nested-prl.xlsx'))),receipt.fixtureDigest,'CCD_FIXTURE_DRIFT');
 const observer=ccdCredentials(state,'observer');
 const observed=ccdRequest(state,4451,'/api/data/case-type/HarnessNestedPRL',{headers:observer.headers});
 validateCcdDefinition(observed.body);
 assert.equal(observed.status,200,'CCD_DEFINITION_UNAVAILABLE');
 assertObservedCcdDefinition(receipt,observed.body);
 return {fixtureDigest:receipt.fixtureDigest,observedDefinitionDigest:receipt.observedDefinitionDigest,definitionVersion:receipt.definitionVersion,images:state.images};
}
export function stopCcdRuntime(state) {
 for(const id of Object.values(state.containers).reverse()) {
  const info=JSON.parse(docker(['inspect',id]))[0];
  if(info.Config.Labels?.['exui.harness.owner']!==state.owner) throw new Error('CCD_CLEANUP_OWNER_MISMATCH');
  docker(['rm','-f','-v',id]);
 }
 state.ready=false;state.stoppedAt=new Date().toISOString();save(state);
}
export function ccdCredentials(state,persona='allowed') {
 const email=`${persona}@harness.example.com`;
 const roles=['caseworker','caseworker-harness',`caseworker-harness-${persona}`, ...(persona==='observer'?['ccd-import','ccd-import-all']:[])];
 const created=ccdRequest(state,5000,'/testing-support/accounts',{method:'POST',body:{email,forename:'Synthetic',surname:persona,password,roles:roles.map(code=>({code}))}});
 if(![201,200,409].includes(created.status)) throw new Error(`CCD_IDENTITY_FAILED_${created.status}`);
 const token=ccdRequest(state,5000,'/o/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'password',client_id:'ccd_gateway',client_secret:'ccd_gateway_secret',username:email,password,scope:'openid profile roles',redirect_uri:'http://127.0.0.1:3100/oauth2/callback'}).toString()});
 if(!token.body.access_token)throw new Error(`CCD_TOKEN_FAILED_${token.status}`);
 const user=ccdRequest(state,5000,'/details',{headers:{Authorization:`Bearer ${token.body.access_token}`}});
 const service=ccdRequest(state,4502,'/testing-support/lease',{method:'POST',body:{microservice:'ccd_gw'}});
 if(service.status!==200)throw new Error(`CCD_S2S_FAILED_${service.status}`);
 return {userId:user.body.id,headers:{Authorization:`Bearer ${token.body.access_token}`,ServiceAuthorization:service.body,'content-type':'application/json','accept':'application/json'},email};
}
export function prepareCcdImport(directory=fixtureRoot) {
 const source=fs.readFileSync(path.join(directory,'nested-prl.json'));
 const file=fs.readFileSync(path.join(directory,'nested-prl.xlsx'));
 const binding=JSON.parse(fs.readFileSync(path.join(directory,'nested-prl.binding.json')));
 assert.equal(binding.schemaVersion,1,'CCD_IMPORT_BINDING_VERSION');
 assert.equal(digest(source),binding.sourceDigest,'CCD_SOURCE_BINDING_MISMATCH');
 assert.equal(digest(file),binding.workbookDigest,'CCD_WORKBOOK_BINDING_MISMATCH');
 validateCcdDefinition(JSON.parse(source).sheets);
 return {file,binding};
}
export function importCcdDefinition(state,{fixtureDirectory=fixtureRoot,inspectContainer}={}) {
 const {file,binding}=prepareCcdImport(fixtureDirectory);
 verifyCcdContainerIdentity(state,inspectContainer);
 const observer=ccdCredentials(state,'observer');
 for(const role of ['caseworker','caseworker-harness','caseworker-harness-allowed','caseworker-harness-observer','caseworker-harness-denied','ccd-import']) { const registered=ccdRequest(state,4451,'/api/user-role',{method:'PUT',headers:observer.headers,body:{role,security_classification:'PUBLIC'}}); if(![200,201,205].includes(registered.status))throw new Error(`CCD_ROLE_FAILED_${registered.status}`); }
 const imported=ccdRequest(state,4451,'/import',{method:'POST',headers:observer.headers,file:file.toString('base64')});
 fs.writeFileSync(path.join(state.output,'definition-import.json'),JSON.stringify({binding,status:imported.status,body:imported.body,fixtureDigest:'sha256:'+crypto.createHash('sha256').update(file).digest('hex'),images:state.images,sourceRevision:'694b9951e94369f1394380506960c4f04f25755d'},null,2));
 if(imported.status!==201&&imported.status!==200)throw new Error(`CCD_IMPORT_FAILED_${imported.status}`);
 const observed=ccdRequest(state,4451,'/api/data/case-type/HarnessNestedPRL',{headers:observer.headers});validateCcdDefinition(observed.body);assert.equal(observed.status,200);assert.equal(observed.body.id,state.caseType);
 const nested=observed.body.case_fields.find(f=>f.id==='sodAdditionalRecipientsList');assert.equal(nested.field_type.collection_field_type.id,'ServeOrgDetails');
 const event=observed.body.events.find(e=>e.id==='create');assert(event.case_fields.find(f=>f.case_field_id==='sodAdditionalRecipientsList').case_fields_complex.some(f=>f.showCondition==='sodAdditionalRecipientsList.serveByPostOrEmail="email"'),'CCD_NESTED_CONDITION_MISSING');
 const receiptFile=path.join(state.output,'definition-import.json');const receipt=JSON.parse(fs.readFileSync(receiptFile));Object.assign(receipt,{observedDefinitionDigest:digest(observed.body),definitionVersion:observed.body.version.number});fs.writeFileSync(receiptFile,JSON.stringify(receipt,null,2)+'\n');fs.writeFileSync(path.join(state.output,'observed-definition.json'),JSON.stringify(observed.body,null,2)+'\n');
 state.definitionImported=true;save(state);return imported;
}
export function proveCcdPolicy(state) {
 verifyCcdContainerIdentity(state);
 const actor=ccdCredentials(state),observer=ccdCredentials(state,'observer'),denied=ccdCredentials(state,'denied');
 const trigger=ccdRequest(state,4452,`/caseworkers/${actor.userId}/jurisdictions/HARNESS/case-types/HarnessNestedPRL/event-triggers/create/token`,{headers:actor.headers});
 assert.equal(trigger.status,200,JSON.stringify(trigger.body));
 const data={protectedValue:'synthetic-protected-original',sodAdditionalRecipientsList:[{value:{serveByPostOrEmail:'email',emailInformation:{emailName:'Synthetic recipient',emailAddress:'recipient@harness.example.com'}}}]};
 const created=ccdRequest(state,4452,`/caseworkers/${actor.userId}/jurisdictions/HARNESS/case-types/HarnessNestedPRL/cases`,{method:'POST',headers:actor.headers,body:{data,event:{id:'create',summary:'Synthetic Harness case'},event_token:trigger.body.token,ignore_warning:false}});
 assert.equal(created.status,201,JSON.stringify(created.body));
 state.caseId=String(created.body.id);save(state);
 const route=`/caseworkers/${observer.userId}/jurisdictions/HARNESS/case-types/HarnessNestedPRL/cases/${state.caseId}`;
 const before=ccdRequest(state,4452,route,{headers:observer.headers});assert.equal(before.status,200);
 assert.deepEqual(before.body.case_data.sodAdditionalRecipientsList.map(r=>r.value),data.sodAdditionalRecipientsList.map(r=>r.value));
 const historyBefore=ccdRequest(state,4452,route+'/events',{headers:observer.headers});assert.equal(historyBefore.status,200);
 const noRead=ccdRequest(state,4452,route.replace(observer.userId,denied.userId),{headers:denied.headers});assert([403,404].includes(noRead.status));assert(!JSON.stringify(noRead.body).includes(data.protectedValue));
 const deniedEvent=ccdRequest(state,4452,`/caseworkers/${denied.userId}/jurisdictions/HARNESS/case-types/HarnessNestedPRL/cases/${state.caseId}/event-triggers/update/token`,{headers:denied.headers});assert([200,403,404].includes(deniedEvent.status));if(deniedEvent.status===200)assert.deepEqual(deniedEvent.body.case_details.case_data,{});
 const write=ccdRequest(state,4452,`/caseworkers/${denied.userId}/jurisdictions/HARNESS/case-types/HarnessNestedPRL/cases/${state.caseId}/events`,{method:'POST',headers:denied.headers,body:{data:{protectedValue:'must-never-persist'},event:{id:'update'},event_token:deniedEvent.body.token,ignore_warning:false}});assert([403,404].includes(write.status),JSON.stringify(write));
 const after=ccdRequest(state,4452,route,{headers:observer.headers});assert.equal(after.status,200);assert.deepEqual(after.body,before.body);
 const historyAfter=ccdRequest(state,4452,route+'/events',{headers:observer.headers});assert.equal(historyAfter.status,200);assert.deepEqual(historyAfter.body,historyBefore.body);
 const identity=verifyCcdRuntimeIdentity(state);
 const receipt={identity,historyBefore:historyBefore.body,historyAfter:historyAfter.body,legitimateAuditOnlyChanges:[],caseId:state.caseId,boundary:'real-ccd',policy:state.policy,allowedCreate:created.status,observerRead:before.status,deniedRead:noRead.status,deniedEvent:deniedEvent.status,deniedWrite:write.status,independentStateUnchanged:true,readback:after.body};
 fs.writeFileSync(path.join(state.output,'policy-proof.json'),JSON.stringify(receipt,null,2)+'\n');return receipt;
}
