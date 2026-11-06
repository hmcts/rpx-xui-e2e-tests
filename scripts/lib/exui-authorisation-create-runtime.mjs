import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {setImmediate as yieldToSignals} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';
import {buildAuthorisationCreateDefinition,AUTHORISATION_CONTROL_EVENT} from './exui-authorisation-row-fixture.mjs';
import {AUTHORISATION_ROW_ACTORS,AUTHORISATION_ROW_NO_CREDIT,AUTHORISATION_ROW_ID} from './exui-authorisation-row-contract.mjs';
import {ccdCredentials,ccdAuthorisationRowCredentials,ccdRequest,verifyCcdContainerIdentity,docker,validateCcdDefinition} from './exui-ccd-runtime.mjs';
import {digestBytes,writeJsonAtomic} from './exui-evidence-io.mjs';

export const AUTH_CREATE_VARIANTS=Object.freeze(['baseline','remove-create']);
// Supporting carrier ACL roles are registered, never added to the five source actors.
const importRoles=Object.freeze([...AUTHORISATION_ROW_ACTORS,'caseworker-harness-observer','caseworker-harness-allowed']);
const event='serviceOfDocuments',type='HarnessNestedPRL';
const personas=AUTHORISATION_ROW_ACTORS.map(role=>role.replace('caseworker-privatelaw-',''));
const roles=persona=>['caseworker','caseworker-harness',`caseworker-privatelaw-${persona}`].sort();
const markers=persona=>({protectedValue:`synthetic-auth-${persona}-protected`,name:`Synthetic ${persona} recipient`,email:`synthetic-auth-${persona}@harness.example.com`});
const prefix=id=>`/caseworkers/${id}/jurisdictions/HARNESS/case-types/${type}`;
const startHeaders={accept:'application/vnd.uk.gov.hmcts.ccd-data-store-api.ui-start-event-trigger.v2+json',experimental:'true'};
const submitHeaders={accept:'application/vnd.uk.gov.hmcts.ccd-data-store-api.create-event.v2+json',experimental:'true'};
const clone=value=>structuredClone(value);
const pythonEnvironment=()=>({PATH:process.env.PATH,HOME:process.env.HOME??os.homedir(),PYTHONDONTWRITEBYTECODE:'1'});
const byRole=rows=>rows.map(row=>({role:row.UserRole,create:row.CRUD.includes('C'),read:row.CRUD.includes('R'),update:row.CRUD.includes('U'),delete:row.CRUD.includes('D')})).sort((a,b)=>a.role.localeCompare(b.role));
export function validateAuthorisationCreateDescriptor(body,definition) {
 assert.equal(body?.id,type,'AUTH_CREATE_IMPORTED_TYPE');assert(Number.isSafeInteger(body.version?.number)&&body.version.number>0,'AUTH_CREATE_IMPORTED_VERSION');validateCcdDefinition(body);
 const actual=rows=>rows.map(({role,create,read,update,delete:remove})=>({role,create,read,update,delete:remove})).sort((a,b)=>a.role.localeCompare(b.role));
 assert.deepEqual(actual(body.acls),byRole(definition.sheets.AuthorisationCaseType),'AUTH_CREATE_TYPE_ACL');
 const state=body.states.filter(row=>row.id==='JUDICIAL_REVIEW');assert.equal(state.length,1,'AUTH_CREATE_STATE');assert.deepEqual(actual(state[0].acls),byRole(definition.sheets.AuthorisationCaseState),'AUTH_CREATE_STATE_ACL');
 for(const id of [event,AUTHORISATION_CONTROL_EVENT]){
  const entries=body.events.filter(row=>row.id===id);assert.equal(entries.length,1,'AUTH_CREATE_EVENT');
  assert.deepEqual(actual(entries[0].acls),byRole(definition.sheets.AuthorisationCaseEvent.filter(row=>row.CaseEventID===id)),'AUTH_CREATE_EVENT_ACL');
 }
 for(const id of ['sodAdditionalRecipients','sodAdditionalRecipientsList','protectedValue']){
  const entries=body.case_fields.filter(row=>row.id===id);assert.equal(entries.length,1,'AUTH_CREATE_FIELD');
  assert.deepEqual(actual(entries[0].acls),byRole(definition.sheets.AuthorisationCaseField.filter(row=>row.CaseFieldID===id)),'AUTH_CREATE_FIELD_ACL');
 }
 return body.version.number;
}
export function prepareAuthorisationCreateWorkbook(output,variant,{compile=spawnSync}={}) {
 const definition=buildAuthorisationCreateDefinition(variant);fs.mkdirSync(output,{mode:0o700});
 const json=path.join(output,'definition.json'),xlsx=path.join(output,'definition.xlsx');writeJsonAtomic(json,definition);
 const script=fileURLToPath(new URL('../fixtures/ccd/workbook.py',import.meta.url));
 const terminal=compile('python3',[script,json,xlsx],{encoding:'utf8',timeout:30000,maxBuffer:1024*1024,env:pythonEnvironment()});
 assert(!terminal.error&&terminal.status===0&&terminal.signal===null,'AUTH_CREATE_WORKBOOK_FAILED');
 assert(fs.lstatSync(xlsx).isFile()&&fs.realpathSync(xlsx)===xlsx,'AUTH_CREATE_WORKBOOK_ALIAS');fs.chmodSync(xlsx,0o600);
 const receipt={variant,definitionDigest:digestBytes(fs.readFileSync(json)),workbookDigest:digestBytes(fs.readFileSync(xlsx)),originalSourceDate:'01/09/2024',...AUTHORISATION_ROW_NO_CREDIT};writeJsonAtomic(path.join(output,'binding.json'),receipt);return receipt;
}
const workbookProjection = `import json,re,sys,zipfile,xml.etree.ElementTree as E
ns={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main','r':'http://schemas.openxmlformats.org/package/2006/relationships'}
with zipfile.ZipFile(sys.argv[1]) as z:
 assert len(z.namelist())==len(set(z.namelist()))
 def read(name):
  assert z.getinfo(name).file_size<1048576
  return E.fromstring(z.read(name))
 workbook=read('xl/workbook.xml');assert workbook.find('s:workbookPr',ns) is None
 styles=read('xl/styles.xml');assert styles.find('s:numFmts',ns) is None
 xfs=styles.find('s:cellXfs',ns);assert xfs.attrib=={'count':'2'} and len(xfs)==2 and xfs[0].attrib=={} and xfs[1].attrib=={'numFmtId':'14','applyNumberFormat':'1'}
 sheets=[s for s in workbook.find('s:sheets',ns) if s.attrib['name']=='AuthorisationCaseEvent'];assert len(sheets)==1
 rid=sheets[0].attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']
 targets=[r.attrib['Target'] for r in read('xl/_rels/workbook.xml.rels') if r.attrib['Id']==rid and r.attrib.get('TargetMode')!='External'];assert len(targets)==1 and re.fullmatch(r'worksheets/sheet[0-9]+[.]xml',targets[0])
 rows=read('xl/'+targets[0]).find('s:sheetData',ns);headers={re.sub('[0-9]','',c.attrib['r']):c.find('s:v',ns).text for c in rows[2]};result=[]
 for row in rows[3:]:
  values={headers[re.sub('[0-9]','',c.attrib['r'])]:c.find('s:v',ns).text for c in row}
  if values.get('CaseEventID')=='serviceOfDocuments' and values.get('UserRole','').startswith('caseworker-privatelaw-'):
   date=[c for c in row if headers[re.sub('[0-9]','',c.attrib['r'])]=='LiveFrom'];assert len(date)==1
   values['LiveFrom']={'value':values['LiveFrom'],'type':date[0].attrib.get('t'),'style':date[0].attrib.get('s')};result.append(values)
 print(json.dumps(result))
`;
export function validateAuthorisationWorkbook(file,variant,{run=spawnSync}={}) {
 assert(fs.lstatSync(file).isFile()&&fs.realpathSync(file)===file&&fs.statSync(file).size<2097152,'AUTH_CREATE_WORKBOOK_ALIAS');
 const result=run('python3',['-B','-c',workbookProjection,file],{encoding:'utf8',timeout:10000,maxBuffer:65536,env:pythonEnvironment()});
 assert(!result.error&&result.status===0&&result.signal===null,'AUTH_CREATE_WORKBOOK_PROJECTION');
 const wanted=buildAuthorisationCreateDefinition(variant).sheets.AuthorisationCaseEvent.filter(row=>row.CaseEventID===event&&AUTHORISATION_ROW_ACTORS.includes(row.UserRole)).map(row=>({...row,LiveFrom:{value:String((Date.UTC(2024,8,1)-Date.UTC(1899,11,30))/86400000),type:'n',style:'1'}}));
 assert.deepEqual(JSON.parse(result.stdout),wanted,'AUTH_CREATE_WORKBOOK_SOURCE_ROWS');return wanted;
}
export function importAuthorisationCreate(state,fixtureDirectory,variant,{request=ccdRequest,inspect=verifyCcdContainerIdentity,onObservation=()=>{}}={}) {
 const definition=buildAuthorisationCreateDefinition(variant),file=path.join(fixtureDirectory,'definition.json'),xlsx=path.join(fixtureDirectory,'definition.xlsx');
 assert.deepEqual(JSON.parse(fs.readFileSync(file)),definition,'AUTH_CREATE_FIXED_WORKBOOK');
 const binding=JSON.parse(fs.readFileSync(path.join(fixtureDirectory,'binding.json')));
 assert.equal(binding.definitionDigest,digestBytes(fs.readFileSync(file)),'AUTH_CREATE_DEFINITION_BYTES');assert.equal(binding.workbookDigest,digestBytes(fs.readFileSync(xlsx)),'AUTH_CREATE_WORKBOOK_BYTES');
 validateAuthorisationWorkbook(xlsx,variant);
 inspect(state);const observer=ccdCredentials(state,'observer',{request});
 for(const role of importRoles){const registered=request(state,4451,'/api/user-role',{method:'PUT',headers:observer.headers,body:{role,security_classification:'PUBLIC'}});onObservation({kind:'role-registration',role,port:4451,method:'PUT',route:'/api/user-role',response:clone(registered)});assert([200,201,205].includes(registered.status),'AUTH_CREATE_ROLE_REGISTRATION');}
 const imported=request(state,4451,'/import',{method:'POST',headers:observer.headers,file:fs.readFileSync(xlsx).toString('base64')});onObservation({kind:'definition-import',port:4451,method:'POST',route:'/import',workbookDigest:binding.workbookDigest,response:clone(imported)});assert.equal(imported.status,201,'AUTH_CREATE_IMPORT_STATUS');
 const observed=request(state,4451,`/api/data/case-type/${type}`,{headers:observer.headers});onObservation({kind:'definition-readback',port:4451,method:'GET',route:`/api/data/case-type/${type}`,response:clone(observed)});assert.equal(observed.status,200,'AUTH_CREATE_DESCRIPTOR_STATUS');
 const version=validateAuthorisationCreateDescriptor(observed.body,definition);inspect(state);
 return {variant,binding,version,observed,imported:clone(imported),owner:state.owner,namespace:state.namespace,images:clone(state.images),...AUTHORISATION_ROW_NO_CREDIT};
}
export function expectedAuthorisationAclRows(version,variant) {
 assert(Number.isSafeInteger(version)&&version>0,'AUTH_CREATE_SQL_VERSION');
 const definition=buildAuthorisationCreateDefinition(variant);
 return byRole(definition.sheets.AuthorisationCaseEvent.filter(row=>AUTHORISATION_ROW_ACTORS.includes(row.UserRole)&&row.CaseEventID===event)).map(row=>({...row,case_type:type,version,event,live_from:null,no_live_to:true,sql_type:'date'}));
}
export function authorisationAclSql(version) {
 assert(Number.isSafeInteger(version)&&version>0,'AUTH_CREATE_SQL_VERSION');
 return `BEGIN READ ONLY; SELECT COALESCE(json_agg(row_to_json(r)), '[]'::json) FROM (
SELECT p.reference AS role,a."create",a."read",a."update",a."delete",ct.reference AS case_type,ct.version,e.reference AS event,
a.live_from::text AS live_from,a.live_to IS NULL AS no_live_to,pg_typeof(a.live_from)::text AS sql_type
FROM event_acl a JOIN event e ON e.id=a.event_id JOIN case_type ct ON ct.id=e.case_type_id JOIN role p ON p.id=a.role_id
WHERE ct.reference='HarnessNestedPRL' AND ct.version=${version} AND e.reference='serviceOfDocuments'
AND p.reference IN (${AUTHORISATION_ROW_ACTORS.map(role=>`'${role}'`).join(',')}) ORDER BY p.reference) r; COMMIT;`;
}
export function readAuthorisationAclDates(state,version,variant,{runDocker=docker,inspect=verifyCcdContainerIdentity}={}) {
 const expected=expectedAuthorisationAclRows(version,variant);inspect(state);
 const sql=authorisationAclSql(version);
 const raw=runDocker(['exec','-i',state.namespace,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','ccd_definition'],sql);inspect(state);
 assert(typeof raw==='string'&&Buffer.byteLength(raw)<16384,'AUTH_CREATE_SQL_RESPONSE');const rows=JSON.parse(raw);
 assert.deepEqual(rows,expected,'AUTH_CREATE_STORED_ACL_ROWS');
 return {owner:state.owner,namespace:state.namespace,images:clone(state.images),variant,version,sourceDate:'01/09/2024',rows,sqlDigest:digestBytes(sql),retentionClaim:false,activationClaim:false,...AUTHORISATION_ROW_NO_CREDIT};
}
export function createAuthorisationJournal(state,{request=ccdRequest,isCancelled=()=>false,onJournal=()=>{}}={}) {
 const journal=[];
 const call=async (label,persona,credential,port,route,options={})=>{
  await yieldToSignals();
  assert(!isCancelled(),'AUTH_CREATE_CANCELLED');
  const response=request(state,port,route,{...options,...(credential?{headers:{...credential.headers,...options.headers}}:{})});
  const body=clone(response.body),requestBody=options.body?clone(options.body):null;
  const tokenDigest=body&&typeof body==='object'&&typeof body.token==='string'?digestBytes(body.token):null;if(tokenDigest)delete body.token;
  const eventTokenDigest=body&&typeof body==='object'&&typeof body.event_token==='string'?digestBytes(body.event_token):null;if(eventTokenDigest)delete body.event_token;
  const sentTokenDigest=requestBody&&typeof requestBody.event_token==='string'?digestBytes(requestBody.event_token):null;if(sentTokenDigest)delete requestBody.event_token;
  journal.push({sequence:journal.length,label,persona,userId:credential?.userId??null,port,route,method:options.method??'GET',body:requestBody,status:response.status,response:body,tokenDigest,eventTokenDigest,sentTokenDigest});onJournal(clone(journal));return response;
 };
 return {journal,call};
}
const dataFor=persona=>{const m=markers(persona);return {protectedValue:m.protectedValue,sodAdditionalRecipients:['additionalRecipients'],sodAdditionalRecipientsList:[{value:{serveByPostOrEmail:'email',emailInformation:{emailName:m.name,emailAddress:m.email}}}]};};
export async function observeAuthorisationCreate(state,variant,{request=ccdRequest,isCancelled=()=>false,onJournal=()=>{}}={}) {
 assert(AUTH_CREATE_VARIANTS.includes(variant),'AUTH_CREATE_VARIANT');const {journal,call}=createAuthorisationJournal(state,{request,isCancelled,onJournal});
 const observer=ccdCredentials(state,'observer',{request}),bootstrap=ccdCredentials(state,'allowed',{request});
 const actors=[];for(const persona of personas){await yieldToSignals();assert(!isCancelled(),'AUTH_CREATE_CANCELLED');const details=[];const credential=ccdAuthorisationRowCredentials(state,persona,{request:(s,p,r,o)=>{const result=request(s,p,r,o);if(r==='/details')details.push(clone(result));return result;}});assert.equal(details.length,1,'AUTH_CREATE_ACTOR_DETAILS');actors.push({persona,credential,details:details[0]});}
 assert.equal(new Set([observer.userId,bootstrap.userId,...actors.map(a=>a.credential.userId)]).size,7,'AUTH_CREATE_DISTINCT_ACTORS');
 const snapshot=async (label,caseId)=>{const root=`${prefix(observer.userId)}/cases/${caseId}`;await call(label+'-state','observer',observer,4452,root);await call(label+'-history','observer',observer,4452,root+'/events');};
 const submit=async (label,persona,actor,caseId,eventId,data)=>{
  await call(label+'-start',persona,actor,4452,`/internal/cases/${caseId}/event-triggers/${eventId}?ignore-warning=false`,{headers:startHeaders});
  const token=await call(label+'-token',persona,actor,4452,`${prefix(actor.userId)}/cases/${caseId}/event-triggers/${eventId}/token`);
  if(token.status===200&&typeof token.body.token==='string')await call(label+'-submit',persona,actor,4452,`/cases/${caseId}/events`,{method:'POST',headers:submitHeaders,body:{data,event:{id:eventId,summary:'Synthetic authorisation create observation'},event_token:token.body.token,ignore_warning:false}});
 };
 const create=async (label,persona)=>{
  const token=await call(label+'-bootstrap-token','bootstrap',bootstrap,4452,`${prefix(bootstrap.userId)}/event-triggers/create/token`);assert.equal(token.status,200,'AUTH_CREATE_BOOTSTRAP_TOKEN');
  const created=await call(label+'-bootstrap-create','bootstrap',bootstrap,4452,`${prefix(bootstrap.userId)}/cases`,{method:'POST',body:{data:dataFor(persona),event:{id:'create',summary:'Synthetic AuthRow bootstrap'},event_token:token.body.token,ignore_warning:false}});
  assert.equal(created.status,201,'AUTH_CREATE_BOOTSTRAP_CASE');const id=String(created.body.id);assert(/^\d{16}$/.test(id),'AUTH_CREATE_CASE_ID');return id;
 };
 const cases=[];
 for(const {persona,credential} of actors){
  const caseId=await create(persona+'-target',persona);await snapshot(persona+'-seed-before',caseId);const seed=journal.find(row=>row.label===persona+'-seed-before-state').response.case_data;const seedData={sodAdditionalRecipients:seed.sodAdditionalRecipients,sodAdditionalRecipientsList:seed.sodAdditionalRecipientsList};await submit(persona+'-seed-target','observer',observer,caseId,event,seedData);await submit(persona+'-seed-control','observer',observer,caseId,AUTHORISATION_CONTROL_EVENT,seedData);
  await snapshot(persona+'-before',caseId);const before=journal.find(row=>row.label===persona+'-before-state').response;
  await call(persona+'-read',persona,credential,4452,`${prefix(credential.userId)}/cases/${caseId}`);
  await call(persona+'-history',persona,credential,4452,`${prefix(credential.userId)}/cases/${caseId}/events`);
  await call(persona+'-update',persona,credential,4452,`/aggregated/caseworkers/${credential.userId}/jurisdictions/HARNESS/case-types?access=update`);
  const changed=clone(before.case_data);changed.sodAdditionalRecipientsList[0].value.emailInformation.emailName=`Synthetic ${persona} edited`;changed.sodAdditionalRecipientsList[0].value.emailInformation.emailAddress=`synthetic-auth-${persona}-edited@harness.example.com`;
  await submit(persona+'-target',persona,credential,caseId,event,{sodAdditionalRecipients:changed.sodAdditionalRecipients,sodAdditionalRecipientsList:changed.sodAdditionalRecipientsList});await snapshot(persona+'-after',caseId);
  let controlId=null;
  if(persona!=='readonly'){
   controlId=await create(persona+'-control',persona);await snapshot(persona+'-control-before',controlId);const control=clone(journal.find(row=>row.label===persona+'-control-before-state').response.case_data);
   control.sodAdditionalRecipientsList[0].value.emailInformation.emailName=`Synthetic ${persona} control edited`;
   await submit(persona+'-control',persona,credential,controlId,AUTHORISATION_CONTROL_EVENT,{sodAdditionalRecipients:control.sodAdditionalRecipients,sodAdditionalRecipientsList:control.sodAdditionalRecipientsList});await snapshot(persona+'-control-after',controlId);
  }
  cases.push({persona,caseId,controlId});
 }
 return {schemaVersion:1,kind:'non-credit-authorisation-create-observation',variant,binding:{owner:state.owner,namespace:state.namespace,images:clone(state.images)},obligationId:AUTHORISATION_ROW_ID,actors:actors.map(({persona,credential,details})=>({persona,userId:credential.userId,roles:credential.roles,details})),observerId:observer.userId,bootstrapId:bootstrap.userId,cases,journal,...AUTHORISATION_ROW_NO_CREDIT};
}

export function validateAuthorisationCreateObservation(value,variant) {
 assert(AUTH_CREATE_VARIANTS.includes(variant),'AUTH_CREATE_VARIANT');assert.equal(value?.kind,'non-credit-authorisation-create-observation','AUTH_CREATE_OBSERVATION_KIND');assert.equal(value.schemaVersion,1,'AUTH_CREATE_SCHEMA');assert.equal(value.variant,variant,'AUTH_CREATE_VARIANT');assert.equal(value.obligationId,AUTHORISATION_ROW_ID,'AUTH_CREATE_OBLIGATION');
 for(const [key,expected] of Object.entries(AUTHORISATION_ROW_NO_CREDIT))assert.equal(value[key],expected,'AUTH_CREATE_NO_CREDIT');
 assert.deepEqual(value.actors.map(row=>row.persona),personas,'AUTH_CREATE_ALL_FIVE_ACTORS');assert.deepEqual(value.cases.map(row=>row.persona),personas,'AUTH_CREATE_ALL_FIVE_CASES');
 const identities=new Map(value.actors.map(actor=>[actor.persona,actor.userId]));identities.set('observer',value.observerId);identities.set('bootstrap',value.bootstrapId);
 assert.equal(new Set(identities.values()).size,7,'AUTH_CREATE_DISTINCT_ACTORS');for(const id of identities.values())assert(/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id),'AUTH_CREATE_ACTOR_UUID');
 for(const actor of value.actors){assert(/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(actor.userId),'AUTH_CREATE_ACTOR_UUID');assert.deepEqual(actor.roles.slice().sort(),roles(actor.persona),'AUTH_CREATE_ACTOR_ROLES');assert.equal(actor.details.status,200,'AUTH_CREATE_ACTOR_DETAILS');assert.equal(actor.details.body.id,actor.userId,'AUTH_CREATE_ACTOR_DETAILS');assert.deepEqual(actor.details.body.roles.slice().sort(),roles(actor.persona),'AUTH_CREATE_ACTOR_DETAILS');}
 assert(Array.isArray(value.journal),'AUTH_CREATE_JOURNAL');assert.deepEqual(value.journal.map(row=>row.sequence),value.journal.map((_,i)=>i),'AUTH_CREATE_JOURNAL_ORDER');
 const labels=new Map(value.journal.map(row=>[row.label,row]));assert.equal(labels.size,value.journal.length,'AUTH_CREATE_DUPLICATE_REQUEST');const used=new Set();
 const take=(label,persona,route,method='GET')=>{
  const row=labels.get(label);assert(row,'AUTH_CREATE_MISSING_REQUEST');assert(!used.has(label),'AUTH_CREATE_REUSED_REQUEST');assert.equal(row.sequence,used.size,'AUTH_CREATE_REQUEST_WINDOW_ORDER');used.add(label);
  assert.equal(row.persona,persona,'AUTH_CREATE_REQUEST_ACTOR');assert.equal(row.userId,identities.get(persona),'AUTH_CREATE_REQUEST_IDENTITY');assert.equal(row.port,4452,'AUTH_CREATE_REQUEST_PORT');assert.equal(row.route,route,'AUTH_CREATE_REQUEST_ROUTE');assert.equal(row.method,method,'AUTH_CREATE_REQUEST_METHOD');return row;
 };
 const snapshot=(label,id)=>{const route=`${prefix(value.observerId)}/cases/${id}`;const state=take(label+'-state','observer',route),history=take(label+'-history','observer',route+'/events');assert.equal(state.status,200,'AUTH_CREATE_OBSERVER_STATUS');assert.equal(history.status,200,'AUTH_CREATE_OBSERVER_STATUS');assert.equal(String(state.response.id),id,'AUTH_CREATE_OBSERVER_CASE');assert(Number.isSafeInteger(state.response.version)&&state.response.version>0,'AUTH_CREATE_OBSERVER_VERSION');assert(Array.isArray(history.response),'AUTH_CREATE_OBSERVER_HISTORY');return {state:state.response,history:history.response};};
 const bootstrap=(label,persona,id)=>{
  const token=take(label+'-bootstrap-token','bootstrap',`${prefix(value.bootstrapId)}/event-triggers/create/token`),created=take(label+'-bootstrap-create','bootstrap',`${prefix(value.bootstrapId)}/cases`,'POST');assert.equal(token.status,200,'AUTH_CREATE_BOOTSTRAP_TOKEN');assert.equal(created.status,201,'AUTH_CREATE_BOOTSTRAP_CASE');assert.equal(String(created.response.id),id,'AUTH_CREATE_BOOTSTRAP_ASSOCIATION');assert.equal(created.sentTokenDigest,token.tokenDigest,'AUTH_CREATE_TOKEN_LINK');assert.match(token.tokenDigest,/^sha256:[a-f0-9]{64}$/,'AUTH_CREATE_TOKEN_LINK');assert.deepEqual(created.body.data,dataFor(persona),'AUTH_CREATE_BOOTSTRAP_PAYLOAD');assert.equal(created.body.event.id,'create','AUTH_CREATE_BOOTSTRAP_EVENT');
 };
 const write=(label,persona,id,eventId,expectedData,allowed,{seed=false}={})=>{
  const actor=identities.get(persona),started=take(label+'-start',persona,`/internal/cases/${id}/event-triggers/${eventId}?ignore-warning=false`),token=take(label+'-token',persona,`${prefix(actor)}/cases/${id}/event-triggers/${eventId}/token`);
  assert.equal(started.status,allowed?200:404,'AUTH_ROW_CREATE_CAPABILITY');
  if(!allowed&&persona==='readonly'&&[403,404].includes(token.status)){assert(!labels.has(label+'-submit'),'AUTH_CREATE_DENIED_TOKEN_NO_SUBMIT');return;}
  assert.equal(token.status,200,'AUTH_CREATE_ACTOR_TOKEN');assert.match(token.tokenDigest,/^sha256:[a-f0-9]{64}$/,'AUTH_CREATE_ACTOR_TOKEN');
  const submitted=take(label+'-submit',persona,`/cases/${id}/events`,'POST');assert.equal(submitted.sentTokenDigest,token.tokenDigest,'AUTH_CREATE_TOKEN_LINK');assert.deepEqual(submitted.body.data,expectedData,'AUTH_CREATE_INTENDED_PAYLOAD');assert.equal(submitted.body.event.id,eventId,'AUTH_CREATE_SUBMIT_EVENT');assert.equal(submitted.status,allowed?201:404,seed?'AUTH_CREATE_SEED_STATUS':'AUTH_ROW_CREATE_CAPABILITY');
 };
 const updated=(before,after,data,eventId,actor)=>{
  assert.deepEqual(after.state.case_data,data,'AUTH_CREATE_PERSISTED_DATA');assert.equal(after.state.version,before.state.version+1,'AUTH_CREATE_PERSISTED_VERSION');
  for(const key of ['id','state','jurisdiction','case_type_id','security_classification'])assert.deepEqual(after.state[key],before.state[key],'AUTH_CREATE_PRESERVED_METADATA');
  assert.equal(after.history.length,before.history.length+1,'AUTH_CREATE_PERSISTED_HISTORY');assert.equal(after.history[0].id,eventId,'AUTH_CREATE_PERSISTED_EVENT');assert.equal(after.history[0].user_id,identities.get(actor),'AUTH_CREATE_PERSISTED_ACTOR');assert.deepEqual(after.history.slice(1),before.history,'AUTH_CREATE_PRESERVED_HISTORY');
 };
 const caseIds=new Set();let successful=0,denied=0;
 for(const {persona,caseId,controlId} of value.cases){
  assert(/^\d{16}$/.test(caseId)&&!caseIds.has(caseId),'AUTH_CREATE_DISTINCT_CASES');caseIds.add(caseId);bootstrap(persona+'-target',persona,caseId);
  const seed=snapshot(persona+'-seed-before',caseId),seedData={sodAdditionalRecipients:seed.state.case_data.sodAdditionalRecipients,sodAdditionalRecipientsList:seed.state.case_data.sodAdditionalRecipientsList};
  write(persona+'-seed-target','observer',caseId,event,seedData,true,{seed:true});write(persona+'-seed-control','observer',caseId,AUTHORISATION_CONTROL_EVENT,seedData,true,{seed:true});
  const before=snapshot(persona+'-before',caseId);assert.equal(before.state.state,'JUDICIAL_REVIEW','AUTH_CREATE_SOURCE_STATE');assert.equal(before.state.case_data.protectedValue,markers(persona).protectedValue,'AUTH_CREATE_HEALTHY_MARKER');
  for(const id of [event,AUTHORISATION_CONTROL_EVENT])assert.equal(before.history.filter(row=>row.id===id).length,1,'AUTH_CREATE_SEEDED_HISTORY');
  const actor=identities.get(persona),read=take(persona+'-read',persona,`${prefix(actor)}/cases/${caseId}`),history=take(persona+'-history',persona,`${prefix(actor)}/cases/${caseId}/events`);assert.equal(read.status,200,'AUTH_CREATE_HEALTHY_READ');assert.deepEqual(read.response.case_data,before.state.case_data,'AUTH_CREATE_HEALTHY_READ');assert.equal(history.status,200,'AUTH_CREATE_HEALTHY_HISTORY');assert.deepEqual(history.response.filter(row=>[event,AUTHORISATION_CONTROL_EVENT].includes(row.id)),before.history.filter(row=>[event,AUTHORISATION_CONTROL_EVENT].includes(row.id)),'AUTH_CREATE_SOURCE_EVENT_READ');
  const definition=take(persona+'-update',persona,`/aggregated/caseworkers/${actor}/jurisdictions/HARNESS/case-types?access=update`);assert.equal(definition.status,200,'AUTH_CREATE_UPDATE_ROUTE');assert(Array.isArray(definition.response),'AUTH_CREATE_UPDATE_SCHEMA');const types=definition.response.filter(row=>row.id===type);
  if(persona==='readonly')assert.deepEqual(types,[],'AUTH_CREATE_READONLY_TYPE_U_MASK');else{assert.equal(types.length,1,'AUTH_CREATE_HEALTHY_UPDATE_TYPE');assert(Array.isArray(types[0].events),'AUTH_CREATE_UPDATE_SCHEMA');const events=types[0].events.map(row=>row.id);assert(events.includes(AUTHORISATION_CONTROL_EVENT),'AUTH_CREATE_UPDATE_CONTROL');assert.equal(events.includes(event),['courtadmin','systemupdate'].includes(persona),'AUTH_CREATE_EVENT_U_BASELINE');}
  const changed=clone(before.state.case_data);changed.sodAdditionalRecipientsList[0].value.emailInformation.emailName=`Synthetic ${persona} edited`;changed.sodAdditionalRecipientsList[0].value.emailInformation.emailAddress=`synthetic-auth-${persona}-edited@harness.example.com`;
  const allowed=variant==='baseline'&&['courtadmin','systemupdate'].includes(persona);
  write(persona+'-target',persona,caseId,event,{sodAdditionalRecipients:changed.sodAdditionalRecipients,sodAdditionalRecipientsList:changed.sodAdditionalRecipientsList},allowed);const after=snapshot(persona+'-after',caseId);
  if(allowed){updated(before,after,changed,event,persona);successful++;}else{assert.deepEqual(after,before,'AUTH_CREATE_DENIED_NO_WRITE');denied++;}
  if(persona==='readonly')assert.equal(controlId,null,'AUTH_CREATE_READONLY_MASK_EXPLICIT');else{
   assert(/^\d{16}$/.test(controlId)&&!caseIds.has(controlId),'AUTH_CREATE_DISTINCT_CASES');caseIds.add(controlId);bootstrap(persona+'-control',persona,controlId);const controlBefore=snapshot(persona+'-control-before',controlId),control=clone(controlBefore.state.case_data);control.sodAdditionalRecipientsList[0].value.emailInformation.emailName=`Synthetic ${persona} control edited`;
   write(persona+'-control',persona,controlId,AUTHORISATION_CONTROL_EVENT,{sodAdditionalRecipients:control.sodAdditionalRecipients,sodAdditionalRecipientsList:control.sodAdditionalRecipientsList},true);updated(controlBefore,snapshot(persona+'-control-after',controlId),control,AUTHORISATION_CONTROL_EVENT,persona);
  }
 }
 assert.equal(used.size,value.journal.length,'AUTH_CREATE_UNEXPECTED_REQUEST');
 return {kind:'non-credit-authorisation-create-replay',variant,actors:5,successfulTargetWrites:successful,deniedTargetWrites:denied,healthyControlWrites:4,groupedSourceCellFaultObserved:variant==='remove-create',readonlyDenial:'prerequisite-masked',remaining:['R-fault','U-fault','date-controls-and-normative-date-contract','remaining-consumer-source-binding','candidate-UI'],...AUTHORISATION_ROW_NO_CREDIT};
}

// Independent post-cleanup replay of the two fixed private observation packets.
// This is not a catalogue admission API and never grants runtime/release credit.
export function readAuthorisationCreatePacket(directory,expected,{inspect}={}) {
 assert(typeof inspect==='function','AUTH_CREATE_REMOVAL_OBSERVER_REQUIRED');assert.equal(fs.realpathSync(directory),directory,'AUTH_CREATE_PACKET_ALIAS');
 const read=relative=>{const file=path.join(directory,relative);assert(fs.lstatSync(file).isFile()&&fs.realpathSync(file)===file,'AUTH_CREATE_PACKET_ALIAS');return JSON.parse(fs.readFileSync(file));};
 const pinned=(relative,wanted)=>{assert(typeof wanted==='string'&&/^sha256:[a-f0-9]{64}$/.test(wanted),'AUTH_CREATE_EXPECTED_PIN_REQUIRED');const file=path.join(directory,relative);assert(fs.lstatSync(file).isFile()&&fs.realpathSync(file)===file,'AUTH_CREATE_PACKET_ALIAS');assert.equal(digestBytes(fs.readFileSync(file)),wanted,'AUTH_CREATE_PARENT_PIN_MISMATCH');};
 assert.deepEqual(expected.contexts?.map(row=>row.variant),AUTH_CREATE_VARIANTS,'AUTH_CREATE_PARENT_CONTEXTS');
 const summary=read('summary.json');assert.deepEqual(summary.producer,expected.producer,'AUTH_CREATE_PACKET_PRODUCER');assert.deepEqual(summary.images,expected.images,'AUTH_CREATE_PACKET_IMAGES');assert.equal(summary.cancelled,false,'AUTH_CREATE_PACKET_CANCELLED');assert.equal(summary.cleanupComplete,true,'AUTH_CREATE_PACKET_CLEANUP');assert.deepEqual(summary.variants.map(row=>row.variant),AUTH_CREATE_VARIANTS,'AUTH_CREATE_PACKET_COMPLETE');
 for(const flag of Object.keys(AUTHORISATION_ROW_NO_CREDIT))assert.equal(summary[flag],false,'AUTH_CREATE_NO_CREDIT');
 const results=[];
 for(const variant of AUTH_CREATE_VARIANTS){
  const held=expected.contexts.find(row=>row.variant===variant);
  for(const name of ['definition.json','definition.xlsx','binding.json'])pinned(`${variant}-fixture/${name}`,held.fixture?.[name]);
  for(const [relative,key] of [[`${variant}-runtime/recovery.json`,'recoveryDigest'],[`${variant}-runtime/creation-attempts.json`,'creationDigest'],[variant+'-import.json','importDigest'],[variant+'-import-requests.json','importRequestsDigest'],[variant+'-stored-acl.json','storedDigest'],[variant+'-observation.json','observationDigest'],[variant+'-requests.json','journalDigest']])pinned(relative,held[key]);
  const fixture=read(`${variant}-fixture/definition.json`),binding=read(`${variant}-fixture/binding.json`),imported=read(variant+'-import.json'),stored=read(variant+'-stored-acl.json'),observation=read(variant+'-observation.json'),runtime=read(variant+'-runtime/runtime.json'),recovery=read(variant+'-runtime/recovery.json'),attempts=read(variant+'-runtime/creation-attempts.json');
  const identityKeys=['owner','namespace','containers','images','output','fixtureSelection','platform'];assert.deepEqual(Object.fromEntries(identityKeys.map(key=>[key,runtime[key]])),Object.fromEntries(identityKeys.map(key=>[key,held.runtime?.[key]])),'AUTH_CREATE_PARENT_RUNTIME_MISMATCH');
  assert.deepEqual(fixture,buildAuthorisationCreateDefinition(variant),'AUTH_CREATE_PACKET_FIXTURE');
  const file=path.join(directory,`${variant}-fixture/definition.xlsx`);assert(fs.lstatSync(file).isFile()&&fs.realpathSync(file)===file,'AUTH_CREATE_PACKET_ALIAS');
  validateAuthorisationWorkbook(file,variant);
  assert.equal(binding.definitionDigest,digestBytes(fs.readFileSync(path.join(directory,`${variant}-fixture/definition.json`))),'AUTH_CREATE_PACKET_DEFINITION_BYTES');assert.equal(binding.workbookDigest,digestBytes(fs.readFileSync(file)),'AUTH_CREATE_PACKET_WORKBOOK_BYTES');assert.deepEqual(imported.binding,binding,'AUTH_CREATE_PACKET_IMPORT');assert.equal(imported.variant,variant,'AUTH_CREATE_PACKET_VARIANT');assert.equal(imported.version,validateAuthorisationCreateDescriptor(imported.observed.body,fixture),'AUTH_CREATE_PACKET_VERSION');assert.equal(imported.observed.status,200,'AUTH_CREATE_PACKET_DESCRIPTOR');assert.equal(imported.imported?.status,201,'AUTH_CREATE_PACKET_IMPORT_STATUS');assert.equal(binding.variant,variant,'AUTH_CREATE_PACKET_VARIANT');assert.equal(binding.originalSourceDate,'01/09/2024','AUTH_CREATE_PACKET_SOURCE_DATE');for(const flag of Object.keys(AUTHORISATION_ROW_NO_CREDIT)){assert.equal(binding[flag],false,'AUTH_CREATE_NO_CREDIT');assert.equal(imported[flag],false,'AUTH_CREATE_NO_CREDIT');assert.equal(stored[flag],false,'AUTH_CREATE_NO_CREDIT');}assert.equal(stored.retentionClaim,false,'AUTH_CREATE_NO_DATE_CLAIM');assert.equal(stored.activationClaim,false,'AUTH_CREATE_NO_DATE_CLAIM');
  assert.deepEqual(Object.fromEntries(Object.entries(runtime.images).map(([name,value])=>[name,value.id])),expected.images,'AUTH_CREATE_PACKET_RUNTIME_IMAGES');assert.deepEqual(imported.images,runtime.images,'AUTH_CREATE_PACKET_RUNTIME_IMAGES');assert.equal(imported.owner,runtime.owner,'AUTH_CREATE_PACKET_OWNER');assert.equal(imported.namespace,runtime.namespace,'AUTH_CREATE_PACKET_NAMESPACE');assert.deepEqual([stored.owner,stored.namespace,stored.images,stored.version,stored.variant],[runtime.owner,runtime.namespace,runtime.images,imported.version,variant],'AUTH_CREATE_PACKET_SQL_BINDING');assert.equal(stored.sourceDate,'01/09/2024','AUTH_CREATE_PACKET_SOURCE_DATE');assert.equal(stored.sqlDigest,digestBytes(authorisationAclSql(imported.version)),'AUTH_CREATE_PACKET_SQL');assert.deepEqual(stored.rows,expectedAuthorisationAclRows(imported.version,variant),'AUTH_CREATE_PACKET_SQL_ROWS');
  assert.deepEqual(recovery,held.recovery,'AUTH_CREATE_PARENT_RECOVERY_MISMATCH');
  assert.equal(recovery.owner,runtime.owner,'AUTH_CREATE_PACKET_RECOVERY');assert.equal(recovery.output,path.join(directory,variant+'-runtime'),'AUTH_CREATE_PACKET_RECOVERY');assert.equal(runtime.output,recovery.output,'AUTH_CREATE_PACKET_RECOVERY');assert.deepEqual(Object.keys(recovery.resources).sort(),Object.keys(expected.images).sort(),'AUTH_CREATE_PACKET_SERVICES');
  const stage=summary.variants.find(row=>row.variant===variant);assert.deepEqual(stage.removal,held.removal,'AUTH_CREATE_PARENT_REMOVAL_MISMATCH');assert.equal(stage.status,'PASS','AUTH_CREATE_PACKET_STAGE');assert.equal(stage.cleanupComplete,true,'AUTH_CREATE_PACKET_CLEANUP');assert.equal(stage.removal.owner,runtime.owner,'AUTH_CREATE_PACKET_REMOVAL');assert.equal(stage.removal.cleanupComplete,true,'AUTH_CREATE_PACKET_REMOVAL');
  const names=Object.keys(expected.images).map(service=>{const resource=recovery.resources[service];assert.equal(resource.name,`${runtime.owner}-${service}`,'AUTH_CREATE_PACKET_RESOURCE_NAME');assert.equal(resource.image,expected.images[service],'AUTH_CREATE_PACKET_RESOURCE_IMAGE');return resource.name;}).sort();
  const ids=[...new Set([...Object.values(runtime.containers),runtime.namespace])].sort();assert(ids.length===Object.keys(expected.images).length&&ids.every(id=>/^[a-f0-9]{64}$/.test(id)),'AUTH_CREATE_PACKET_RESOURCE_IDS');assert.deepEqual(stage.removal.checkedNames.slice().sort(),names,'AUTH_CREATE_PACKET_REMOVAL_NAMES');assert.deepEqual(stage.removal.checkedContainerIds.slice().sort(),ids,'AUTH_CREATE_PACKET_REMOVAL_IDS');
  assert(Array.isArray(attempts)&&attempts.length===ids.length&&attempts.every(row=>row.state==='settled'&&ids.includes(row.containerId)),'AUTH_CREATE_PACKET_CREATE_JOURNAL');assert.equal(new Set(attempts.map(row=>row.containerId)).size,ids.length,'AUTH_CREATE_PACKET_CREATE_JOURNAL');
  for(const identifier of [...names,...ids])assert.equal(inspect(identifier),null,'AUTH_CREATE_PACKET_RESOURCE_SURVIVES');
  assert.deepEqual(observation.binding,{owner:runtime.owner,namespace:runtime.namespace,images:runtime.images},'AUTH_CREATE_PACKET_OBSERVATION_OWNER');
  assert.deepEqual(read(variant+'-requests.json'),observation.journal,'AUTH_CREATE_CAPTURED_JOURNAL_MISMATCH');
  const importRequests=read(variant+'-import-requests.json');assert.deepEqual(importRequests.map(row=>row.kind),[...importRoles.map(()=>'role-registration'),'definition-import','definition-readback'],'AUTH_CREATE_IMPORT_REQUEST_ORDER');
  assert.deepEqual(importRequests.slice(0,importRoles.length).map(row=>row.role),importRoles,'AUTH_CREATE_IMPORT_REGISTRY_ROLES');for(const row of importRequests.slice(0,importRoles.length)){assert.equal(row.port,4451,'AUTH_CREATE_IMPORT_REQUEST');assert.equal(row.route,'/api/user-role','AUTH_CREATE_IMPORT_REQUEST');assert.equal(row.method,'PUT','AUTH_CREATE_IMPORT_REQUEST');assert([200,201,205].includes(row.response.status),'AUTH_CREATE_IMPORT_REQUEST');}
  assert.deepEqual(importRequests[importRoles.length],{kind:'definition-import',port:4451,method:'POST',route:'/import',workbookDigest:binding.workbookDigest,response:imported.imported},'AUTH_CREATE_IMPORT_CAPTURE');
  assert.deepEqual(importRequests[importRoles.length+1],{kind:'definition-readback',port:4451,method:'GET',route:`/api/data/case-type/${type}`,response:imported.observed},'AUTH_CREATE_IMPORT_CAPTURE');
  const replay=validateAuthorisationCreateObservation(observation,variant);assert.deepEqual(stage.replay,replay,'AUTH_CREATE_PACKET_REPLAY_MISMATCH');results.push(replay);
 }
 return {kind:'non-credit-authorisation-create-complete-replay',contexts:results,obligationId:AUTHORISATION_ROW_ID,...AUTHORISATION_ROW_NO_CREDIT};
}
