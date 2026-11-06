const clone=structuredClone;
exports.authorisationCcdFake=definition=>{
 const accounts=new Map(),tokens=new Map(),cases=new Map();let nextActor=1,nextCase=1000000000000000n;
 const id=()=>`00000000-0000-4000-8000-${String(nextActor++).padStart(12,'0')}`;
 const state={owner:'harness-1234567890abcdef',namespace:'a'.repeat(64),fixtureSelection:'event-capability-baseline',images:{data:{id:'sha256:'+'1'.repeat(64)},definition:{id:'sha256:'+'2'.repeat(64)}}};
 const persona=actor=>actor.roles.find(role=>role.startsWith('caseworker-privatelaw-'))??actor.roles.find(role=>role.startsWith('caseworker-harness-'));
 const can=(actor,event,operation)=>definition.sheets.AuthorisationCaseEvent.some(row=>row.UserRole===persona(actor)&&row.CaseEventID===event&&row.CRUD.includes(operation));
 const typeCan=(actor,operation)=>definition.sheets.AuthorisationCaseType.some(row=>row.UserRole===persona(actor)&&row.CRUD.includes(operation));
 const copyResponse=(status,body)=>({status,body:clone(body)});
 const request=(s,port,route,options={})=>{
  const method=options.method??'GET',body=options.body;
  if(route==='/testing-support/accounts'){
   const actor=accounts.get(body.email)??{id:id(),roles:body.roles.map(row=>row.code)};accounts.set(body.email,actor);return copyResponse(201,{});
  }
  if(route==='/o/token'){const email=new URLSearchParams(body).get('username'),token='synthetic-token-'+email;tokens.set(token,accounts.get(email));return copyResponse(200,{access_token:token});}
  if(port===4502)return copyResponse(200,'synthetic-service');
  const actor=tokens.get(options.headers?.Authorization?.replace('Bearer ',''));if(!actor)throw Error('FAKE_MISSING_ACTOR');
  if(route==='/details')return copyResponse(200,actor);
  if(route.endsWith('/token'))return copyResponse(200,{token:'synthetic-event-token-'+actor.id+'-'+route});
  if(method==='POST'&&/\/case-types\/HarnessNestedPRL\/cases$/.test(route)){
   const caseId=String(++nextCase),data=clone(body.data);data.sodAdditionalRecipientsList.forEach((row,index)=>{row.id=`recipient-${caseId}-${index}`;});
   const value={id:caseId,state:'JUDICIAL_REVIEW',version:1,case_data:data,history:[{id:'create',user_id:actor.id}]};cases.set(caseId,value);return copyResponse(201,value);
  }
  if(route.includes('?access=update'))return copyResponse(200,typeCan(actor,'U')?[{id:'HarnessNestedPRL',events:definition.sheets.CaseEvent.filter(row=>can(actor,row.ID,'U')).map(row=>({id:row.ID}))}]:[]);
  const caseId=route.match(/\/cases\/(\d{16})/)?.[1],value=cases.get(caseId);if(!value)throw Error('FAKE_MISSING_CASE');
  if(route.startsWith('/internal/')){const event=route.match(/event-triggers\/([^?]+)/)[1];return copyResponse(typeCan(actor,'U')&&can(actor,event,'C')?200:404,{event_token:'synthetic-ui-start-token-'+actor.id});}
  if(method==='POST'&&route.endsWith('/events')){
   const event=body.event.id;if(!typeCan(actor,'U')||!can(actor,event,'C'))return copyResponse(404,{});
   value.case_data={...value.case_data,...clone(body.data)};value.version++;value.history.unshift({id:event,user_id:actor.id});return copyResponse(201,value);
  }
  if(route.endsWith('/events'))return copyResponse(200,value.history.filter(entry=>can(actor,entry.id,'R')));
  return copyResponse(200,Object.fromEntries(Object.entries(value).filter(([key])=>key!=='history')));
 };
 return {state,request,cases};
};

exports.authorisationPacket=async directory=>{
 const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
 const api=await import('../lib/exui-authorisation-create-runtime.mjs'),{buildAuthorisationCreateDefinition}=await import('../lib/exui-authorisation-row-fixture.mjs'),{CCD_IMAGES}=await import('../lib/exui-ccd-runtime.mjs');
 const hash=value=>'sha256:'+createHash('sha256').update(value).digest('hex'),write=(name,value)=>fs.writeFileSync(path.join(directory,name),JSON.stringify(value,null,2)+'\n',{mode:0o600});
 const expected={producer:{commit:'1'.repeat(40),sourceDigest:hash('fixed source'),files:{}},images:clone(CCD_IMAGES),contexts:[]},flags={runtimeAcceptance:false,sourceComplete:false,catalogueCredit:false,releaseCredit:false};
 const summary={producer:expected.producer,images:expected.images,status:'PASS',cancelled:false,cleanupComplete:true,variants:[],...flags};
 const acl=rows=>rows.map(row=>({role:row.UserRole,create:row.CRUD.includes('C'),read:row.CRUD.includes('R'),update:row.CRUD.includes('U'),delete:row.CRUD.includes('D')}));
 for(const variant of api.AUTH_CREATE_VARIANTS){
  const definition=buildAuthorisationCreateDefinition(variant),fixture=path.join(directory,variant+'-fixture'),binding=api.prepareAuthorisationCreateWorkbook(fixture,variant);
  const runtimePath=path.join(directory,variant+'-runtime');fs.mkdirSync(runtimePath);const owner='harness-'+(variant==='baseline'?'a':'b').repeat(16),containers=Object.fromEntries(Object.keys(CCD_IMAGES).map(service=>[service,hash(variant+':'+service).slice(7)])),images=Object.fromEntries(Object.entries(CCD_IMAGES).map(([service,id])=>[service,{id,architecture:'arm64'}]));
  const runtime={owner,output:runtimePath,namespace:containers.database,containers,images,fixtureSelection:'event-capability-baseline'};
  const recovery={owner,output:runtimePath,resources:Object.fromEntries(Object.entries(CCD_IMAGES).map(([service,image])=>[service,{name:`${owner}-${service}`,image}]))};
  const observed={id:'HarnessNestedPRL',version:{number:3},acls:acl(definition.sheets.AuthorisationCaseType),states:[{id:'JUDICIAL_REVIEW',acls:acl(definition.sheets.AuthorisationCaseState)}],events:definition.sheets.CaseEvent.map(row=>({id:row.ID,acls:acl(definition.sheets.AuthorisationCaseEvent.filter(item=>item.CaseEventID===row.ID))})),case_fields:definition.sheets.CaseField.map(row=>({id:row.ID,acls:acl(definition.sheets.AuthorisationCaseField.filter(item=>item.CaseFieldID===row.ID))}))};
  const imported={variant,binding,version:3,imported:{status:201,body:{}},observed:{status:200,body:observed},owner,namespace:runtime.namespace,images,...flags};
  const stored={owner,namespace:runtime.namespace,images,variant,version:3,sourceDate:'01/09/2024',rows:api.expectedAuthorisationAclRows(3,variant),sqlDigest:hash(api.authorisationAclSql(3)),retentionClaim:false,activationClaim:false,...flags};
  const fake=exports.authorisationCcdFake(definition);Object.assign(fake.state,runtime);const observation=await api.observeAuthorisationCreate(fake.state,variant,{request:fake.request});
  write(variant+'-runtime/runtime.json',runtime);write(variant+'-runtime/recovery.json',recovery);write(variant+'-runtime/creation-attempts.json',Object.entries(containers).map(([service,containerId])=>({service,name:`${owner}-${service}`,state:'settled',containerId})));
  const importRequests=[...definition.sheets.AuthorisationCaseEvent.filter(row=>row.CaseEventID==='serviceOfDocuments'&&row.UserRole.startsWith('caseworker-privatelaw-')).map(row=>({kind:'role-registration',role:row.UserRole,port:4451,method:'PUT',route:'/api/user-role',response:{status:201,body:{}}})),{kind:'definition-import',port:4451,method:'POST',route:'/import',workbookDigest:binding.workbookDigest,response:imported.imported},{kind:'definition-readback',port:4451,method:'GET',route:'/api/data/case-type/HarnessNestedPRL',response:imported.observed}];
  write(variant+'-import.json',imported);write(variant+'-import-requests.json',importRequests);write(variant+'-stored-acl.json',stored);write(variant+'-observation.json',observation);write(variant+'-requests.json',observation.journal);
  summary.variants.push({variant,status:'PASS',cleanupComplete:true,removal:{owner,cleanupComplete:true,checkedNames:Object.values(recovery.resources).map(row=>row.name),checkedContainerIds:Object.values(containers).sort()},replay:api.validateAuthorisationCreateObservation(observation,variant)});
  expected.contexts.push({variant,fixture:Object.fromEntries(['definition.json','definition.xlsx','binding.json'].map(name=>[name,hash(fs.readFileSync(path.join(fixture,name)))])),runtime:clone(runtime),recovery:clone(recovery),removal:clone(summary.variants.at(-1).removal),...Object.fromEntries([[variant+'-runtime/recovery.json','recoveryDigest'],[variant+'-runtime/creation-attempts.json','creationDigest'],[variant+'-import.json','importDigest'],[variant+'-import-requests.json','importRequestsDigest'],[variant+'-stored-acl.json','storedDigest'],[variant+'-observation.json','observationDigest'],[variant+'-requests.json','journalDigest']].map(([file,key])=>[key,hash(fs.readFileSync(path.join(directory,file)))]))});
 }
 write('summary.json',summary);return {expected,write,read:name=>JSON.parse(fs.readFileSync(path.join(directory,name)))};
};
