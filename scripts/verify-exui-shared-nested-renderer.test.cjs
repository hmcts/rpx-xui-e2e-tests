const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const contract=()=>import('./lib/exui-shared-nested-contract.mjs');
const api=()=>import('./lib/exui-shared-nested-observations.mjs');
function text(value){return [value.serveByPostOrEmail==='email'?'Email':'Post',...Object.values(value).flatMap(item=>typeof item==='object'?Object.values(item).flatMap(child=>typeof child==='object'?Object.values(child).filter(Boolean):[child]):[])].join(' ');}
async function observation(channel,count,mutation=null){
 const {sharedNestedValues}=await contract();
 const expected=sharedNestedValues(channel,count),facetId=`nested-${channel}-${count}`,caseId='1234567890123456',actorId='synthetic-actor',binding={invocationId:mutation??'baseline'};
 const items=expected.map((value,index)=>({id:`00000000-0000-0000-0000-00000000000${index+1}`,value}));
 const before={state:{id:caseId,case_type_id:'HarnessNestedPRL',jurisdiction:'HARNESS',state:'Created',version:1,case_data:{protectedValue:'synthetic-protected-original',sodAdditionalRecipientsList:[]}},history:[{id:'create',summary:'initial'}]};
 const persistedItems=structuredClone(mutation==='shared-nested-drop-second-recipient'?items.slice(0,1):items);
 if(mutation==='ccd-drop-child')for(const row of persistedItems)delete row.value.emailInformation.emailAddress;
 if(mutation==='ccd-drop-postal-optional-child')delete persistedItems[1].value.postalInformation.postalAddress.AddressLine2;
 const after=structuredClone(before);after.state.version++;after.state.case_data.sodAdditionalRecipientsList=persistedItems;after.history.unshift({id:'update',summary:'renderer'});
 const fields=['serveByPostOrEmail',...(channel==='email'?['emailName','emailAddress']:['postalName','AddressLine1','AddressLine2','AddressLine3','PostTown','County','PostCode','Country'])];
 const labels={emailName:'Name',emailAddress:'Email address',postalName:'Name',AddressLine1:'Building and Street',AddressLine2:'Address Line 2 (Optional)',AddressLine3:'Address Line 3 (Optional)',PostTown:'Town or City (Optional)',County:'County (Optional)',PostCode:'Postcode/Zipcode',Country:'Country (Optional)'};
 const filledControls=expected.flatMap((value,index)=>fields.map((field,position)=>({index,field,domId:`recipient-${index}-${field}`,label:field==='serveByPostOrEmail'?(channel==='email'?'Email':'Post'):labels[field],domIndex:index*20+position,visible:true,...(field==='serveByPostOrEmail'?{checked:true,oppositeChecked:false}:{}),value:(field==='serveByPostOrEmail'?'on':channel==='email'?value.emailInformation[field]:field==='postalName'?value.postalInformation.postalName:value.postalInformation.postalAddress[field])??'',classes:[]})));
 const blank=structuredClone(expected);if(channel==='post')for(const row of blank){row.postalInformation.postalAddress.AddressLine2='';for(const [key,text] of Object.entries(row.postalInformation.postalAddress))row.postalInformation.postalAddress[key]=text??'';}
 return {schemaVersion:1,binding,facetId,caseId,actorId,before,radioMandatory:{cyaHeadings:[],groups:Array.from({length:count},(_,index)=>({index,selectedEmail:false,selectedPost:false,classes:['form-group-error'],errorText:'Served by is required'}))},legends:Array(count).fill('Served by'),visibility:Array.from({length:count},(_,index)=>({index,email:{emailName:true,emailAddress:true,postalName:false},post:{emailName:false,emailAddress:false,postalName:true}})),postalMandatory:channel==='post'?expected.flatMap((_,index)=>['AddressLine1','PostCode'].map(field=>{const intended=structuredClone(expected);intended[index].postalInformation.postalAddress[field]='';return {index,field,intended,cyaHeadings:[],controls:expected.map((value,controlIndex)=>({index:controlIndex,field,value:controlIndex===index?'':value.postalInformation.postalAddress[field],visible:true,classes:controlIndex===index?['govuk-input--error']:[]}))};})):[],mandatory:{cyaHeadings:[],controls:Array.from({length:count},(_,index)=>(channel==='email'?['emailName','emailAddress']:['postalName','postcodeLookup']).map(field=>({index,field,value:'',visible:true,classes:['govuk-input--error']}))).flat()},optional:channel==='post'?{cyaRows:blank.map(text),restored:blank}:null,filledControls,cyaRows:expected.map(text),request:{method:'POST',path:`/data/cases/${caseId}/events`,body:{data:{protectedValue:'synthetic-protected-original',sodAdditionalRecipientsList:items},event:{id:'update'}}},status:201,after,savedRows:persistedItems.map(row=>text(row.value)),reread:structuredClone(after)};
}
const replay=async value=>(await api()).replaySharedNestedObservation(value,{binding:value.binding,actorId:'synthetic-actor',facetId:value.facetId,mutation:value.binding.invocationId==='baseline'?null:value.binding.invocationId});

test('source normalization retains exact PRL child types, choice labels and all25 event overrides',async()=>{
 const {bindSharedNestedSourceFixture}=await contract();const f=JSON.parse(fs.readFileSync('scripts/fixtures/ccd/nested-prl.json'));
 const bound=bindSharedNestedSourceFixture(f);assert.equal(bound.sourceRevision,'694b9951e94369f1394380506960c4f04f25755d');assert.match(bound.normalization,/selector\/business callback excluded/);
 for(const change of [x=>x.sheets.ComplexTypes[0].ElementLabel='Invented',x=>x.sheets.FixedLists[0].ListElement='Invented',x=>x.sheets.CaseField[0].FieldType='Text',x=>x.sheets.EventToComplexTypes[0].FieldDisplayOrder='999']){
  const changed=structuredClone(f);change(changed);assert.throws(()=>bindSharedNestedSourceFixture(changed),/SHARED_NESTED_SOURCE/);
 }
});
for(const channel of ['email','post'])for(const count of [1,2])test(`independent replay requires complete ${channel}/${count} facet`,async()=>{
 const value=await observation(channel,count),result=await replay(value);assert.deepEqual(result,{facetId:`nested-${channel}-${count}`,recipientCount:count,intendedRecipientCount:count,mutation:null});
});
for(const [name,change,code] of [
 ['conditional branch',x=>x.visibility[0].post.emailName=true,'CONDITIONAL_VISIBILITY'],
 ['radio required',x=>x.radioMandatory.groups[0].classes=[],'RADIO_VALIDATION'],
 ['radio omitted value',x=>x.radioMandatory.groups[0].selectedEmail=true,'RADIO_VALUE'],
 ['mandatory error',x=>x.mandatory.controls[0].classes=[],'MANDATORY_ERROR'],
 ['premature CYA',x=>x.mandatory.cyaHeadings=['Check your answers'],'MANDATORY_CYA'],
 ['source label',x=>x.filledControls[1].label='Wrong','SOURCE_LABEL'],
 ['source order',x=>x.filledControls[1].domIndex=-1,'CONTROL_ORDER'],
 ['visible value',x=>x.filledControls[1].value='Wrong','VISIBLE_VALUE'],
 ['CYA sibling swap',x=>x.cyaRows.reverse(),'CYA_ASSOCIATION'],
 ['payload value',x=>x.request.body.data.sodAdditionalRecipientsList[0].value.emailInformation.emailAddress='wrong@harness.example.com','VALUES'],
 ['duplicate IDs',x=>{x.after.state.case_data.sodAdditionalRecipientsList[1].id=x.after.state.case_data.sodAdditionalRecipientsList[0].id;},'IDS'],
 ['lost sibling',x=>x.after.state.case_data.sodAdditionalRecipientsList.pop(),'RECIPIENT_COUNT'],
 ['changed state version',x=>x.after.state.version--,'VERSION'],
 ['lost prior audit',x=>x.after.history.pop(),'AUDIT_PRESERVATION'],
 ['saved view sibling swap',x=>x.savedRows.reverse(),'SAVED_VIEW'],
 ['changed observer reread',x=>x.reread.state.version++,'INDEPENDENT_REREAD'],
 ['credential key',x=>x.request.body.event_token='never-retain-token','CREDENTIAL_KEY'],
 ])test(`rehashed ${name} cannot satisfy renderer facet`,async()=>{
  const value=await observation('email',2);change(value);await assert.rejects(replay(value),new RegExp('SHARED_NESTED_'+code));
 });
for(const [name,change,code] of [
 ['optional missing',x=>x.optional=null,'OPTIONAL_BLANK_CYA'],
 ['optional changed restored sibling',x=>x.optional.restored[1].postalInformation.postalAddress.AddressLine1='Wrong','OPTIONAL_RESTORE'],
 ['optional missing persisted child',x=>delete x.after.state.case_data.sodAdditionalRecipientsList[1].value.postalInformation.postalAddress.AddressLine2,'VALUES'],
 ])test(`${name} cannot satisfy postal renderer facet`,async()=>{const value=await observation('post',2);change(value);await assert.rejects(replay(value),new RegExp('SHARED_NESTED_'+code));});
test('second-recipient fault requires successful exact first/control persistence before intended cardinality failure',async()=>{
 const {SHARED_NESTED_FAULT}=await contract(),value=await observation('email',2,SHARED_NESTED_FAULT);const result=await replay(value);assert.equal(result.recipientCount,1);assert.equal(result.intendedRecipientCount,2);
 for(const change of [x=>x.status=500,x=>x.after.state.case_data.protectedValue='wrong',x=>x.after.state.case_data.sodAdditionalRecipientsList[0].value.emailInformation.emailName='wrong',x=>x.after.state.case_data.sodAdditionalRecipientsList.push(structuredClone(x.request.body.data.sodAdditionalRecipientsList[1]))]){const changed=structuredClone(value);change(changed);await assert.rejects(replay(changed),/SHARED_NESTED_/);}
});


test('postal DOM values are strings and retain deliberately populated optional Country',async()=>{
 const value=await observation('post',2);
 assert(value.filledControls.every(row=>typeof row.value==='string'));
 assert(value.optional.restored.every(row=>row.postalInformation.postalAddress.Country==='United Kingdom'));
 await replay(value);
});
test('second-recipient mutation preserves exact first/control and is a no-op without two recipients',async()=>{
 const {loseSecondNestedRecipient}=await import('./lib/exui-ccd-browser-runtime.mjs');
 const body={data:{protectedValue:'control',sodAdditionalRecipientsList:[{id:'first',value:{name:'one'}},{id:'second',value:{name:'two'}}]},event:{id:'update'},event_token:'not-evidence'};
 const before=structuredClone(body),changed=loseSecondNestedRecipient(body);
 assert.deepEqual(body,before);assert.deepEqual(changed,{...body,data:{...body.data,sodAdditionalRecipientsList:[body.data.sodAdditionalRecipientsList[0]]}});
 assert.deepEqual(loseSecondNestedRecipient({...body,data:{...body.data,sodAdditionalRecipientsList:[]}}),{...body,data:{...body.data,sodAdditionalRecipientsList:[]}});
});
test('second-recipient gateway forwards one complete recipient and records successful application without event tokens',async t=>{
 const http=require('node:http'),os=require('node:os'),path=require('node:path');
 const {startCcdGateway}=await import('./lib/exui-ccd-browser-runtime.mjs');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'shared-nested-gateway-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const id='11111111-1111-4111-8111-111111111111',token='Bearer synthetic-fixed-bearer',credential={userId:id,headers:{Authorization:token,ServiceAuthorization:'synthetic-service'}};
 let forwarded;
 t.mock.method(global,'fetch',async(url,options)=>{assert.equal(String(url),'http://127.0.0.1:4452/cases/1234567890123456/events');forwarded=JSON.parse(options.body);return new Response(JSON.stringify({id:'1234567890123456'}),{status:201,headers:{'content-type':'application/json'}});});
 const server=await startCcdGateway(root,{allowed:credential,denied:{...credential,userId:'22222222-2222-4222-8222-222222222222',headers:{Authorization:'Bearer synthetic-denied-bearer'}}},'shared-nested-drop-second-recipient');t.after(()=>new Promise(resolve=>server.close(resolve)));
 const body={data:{protectedValue:'control',sodAdditionalRecipientsList:[{id:'first',value:{name:'one'}},{id:'second',value:{name:'two'}}]},event:{id:'update'},event_token:'private-event-token-canary'};
 const status=await new Promise((resolve,reject)=>{const req=http.request('http://127.0.0.1:3101/data/cases/1234567890123456/events',{method:'POST',headers:{authorization:token,'content-type':'application/json'}},response=>{response.resume();response.on('end',()=>resolve(response.statusCode));});req.on('error',reject);req.end(JSON.stringify(body));});
 assert.equal(status,201);assert.deepEqual(forwarded.data,{...body.data,sodAdditionalRecipientsList:[body.data.sodAdditionalRecipientsList[0]]});
 const journal=fs.readFileSync(path.join(root,'fault-actions.jsonl'),'utf8');assert.doesNotMatch(journal,/private-event-token-canary|event_token|Bearer/);
 assert.deepEqual(JSON.parse(journal),{mutation:'shared-nested-drop-second-recipient',method:'POST',upstreamPath:'/cases/1234567890123456/events',status:201,eventId:'update',before:body.data,after:forwarded.data});
 const requests=fs.readFileSync(path.join(root,'ccd-requests.jsonl'),'utf8').trim().split('\n').map(JSON.parse);assert.equal(requests[0].actorId,id);
});

test('sealed renderer raw artifact reader rejects missing inventory, changed bytes and symlink aliases',async t=>{
 const os=require('node:os'),path=require('node:path');
 const {sharedNestedArtifactNames,captureSharedNestedArtifacts,readSharedNestedArtifact}=await import('./lib/exui-shared-nested-artifacts.mjs');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'shared-nested-artifacts-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.mkdirSync(path.join(root,'baseline'));
 for(const name of sharedNestedArtifactNames('baseline'))fs.writeFileSync(path.join(root,'baseline',name),JSON.stringify({name}));
 const execution={invocationId:'baseline',sharedNestedArtifacts:captureSharedNestedArtifacts(root,'baseline')};
 assert.deepEqual(JSON.parse(readSharedNestedArtifact(root,execution,'nested-post-2-observation.json')),{name:'nested-post-2-observation.json'});
 assert.throws(()=>readSharedNestedArtifact(root,{...execution,sharedNestedArtifacts:execution.sharedNestedArtifacts.slice(1)},'manifest.json'),/ARTIFACT_SELECTION/);
 const file=path.join(root,'baseline','manifest.json'),bytes=fs.readFileSync(file);fs.writeFileSync(file,'changed');
 assert.throws(()=>readSharedNestedArtifact(root,execution,'manifest.json'),/DIGEST/);fs.writeFileSync(file,bytes);
 fs.renameSync(file,file+'.retained');fs.symlinkSync(file+'.retained',file);
 assert.throws(()=>readSharedNestedArtifact(root,execution,'manifest.json'),/ARTIFACT_ALIAS/);
});

test('manual blank postcode cannot be replaced by lookup or AddressLine1 validation',async()=>{const value=await observation('post',2);for(const change of [x=>x.postalMandatory.pop(),x=>x.postalMandatory[1].cyaHeadings=['Check your answers'],x=>x.postalMandatory[1].controls[0].field='AddressLine1',x=>x.postalMandatory[1].intended[0].postalInformation.postalAddress.AddressLine1='']){const changed=structuredClone(value);change(changed);await assert.rejects(replay(changed),/SHARED_NESTED_POSTCODE_/);}});

test('actual radio DOM value on is separated from checked channel semantics and persisted email value',async()=>{
 const value=await observation('email',2);assert.equal(value.filledControls[0].value,'on');await replay(value);
 for(const change of [x=>x.filledControls[0].checked=false,x=>x.filledControls[0].oppositeChecked=true,x=>x.request.body.data.sodAdditionalRecipientsList[0].value.serveByPostOrEmail='on']){const changed=structuredClone(value);change(changed);await assert.rejects(replay(changed),/SHARED_NESTED_/);}
});


test('named postal child attribution requires isolated source-bound blank and actual associated CYA',async()=>{
 const {validatePostcodeAttempt}=await import('./lib/exui-shared-nested-attempt.mjs');
 const value=await observation('post',2),binding=value.binding;
 const intended=structuredClone(value.request.body.data.sodAdditionalRecipientsList.map(row=>row.value));intended[0].postalInformation.postalAddress.PostCode='';
 const packet={schemaVersion:1,binding,facetId:value.facetId,caseId:value.caseId,actorId:value.actorId,before:value.before,checks:[{...value.postalMandatory[0],cyaRows:[]},{index:0,field:'PostCode',intended,cyaHeadings:['Check your answers'],controls:[],cyaRows:intended.map(text)}]};
 const args={binding,actorId:value.actorId,facetId:value.facetId,failureId:'shared-nested-PostCode-required-0'};
 assert.equal(validatePostcodeAttempt(packet,args).failedRecipientIndex,0);
 for(const change of [x=>x.checks[1].intended[0].postalInformation.postalAddress.AddressLine1='',x=>x.checks[1].cyaHeadings=[],x=>x.checks[1].cyaRows.reverse(),x=>x.checks[0].controls[0].classes=[],x=>x.checks[1].controls=[{field:'PostCode',classes:[]}],x=>x.actorId='other',x=>x.binding={invocationId:'other'}]){const changed=structuredClone(packet);change(changed);assert.throws(()=>validatePostcodeAttempt(changed,args),/SHARED_NESTED_ATTEMPT_INVALID/);}
 assert.throws(()=>validatePostcodeAttempt(packet,{...args,failureId:'some-other-failure'}),/SHARED_NESTED_ATTEMPT_INVALID/);
 assert.throws(()=>validatePostcodeAttempt(packet,{...args,failureId:'shared-nested-PostCode-required-1'}),/SHARED_NESTED_ATTEMPT_INVALID/);
});

test('blocked attempt lifecycle remains bound to independent container ID, image, mounts and launch process',async t=>{
 const os=require('node:os'),path=require('node:path');const {assertSharedNestedInvocationAuthority}=await import('./lib/exui-shared-nested-attempt.mjs');
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'shared-nested-authority-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));fs.mkdirSync(path.join(directory,'baseline'));
 const owner='ccd-11111111-1111-4111-8111-111111111111',namespace='1'.repeat(64),image='sha256:'+'a'.repeat(64),mounts=[{source:'/private/tmp/sealed-candidate',target:'/candidate',writable:false}];
 const plan={namespace,candidate:{name:owner+'-baseline-api',image,mounts,launchProcess:{entrypoint:['node'],command:['/candidate/app.js']}},tools:{name:owner+'-baseline-tools',image:'sha256:'+'b'.repeat(64),mounts:[]}};
 const ownership={owner,invocations:[{invocationId:'baseline',plan}]},registry=[['candidate',plan.candidate,'2'.repeat(64)],['browser-provider',plan.tools,'3'.repeat(64)]].map(([service,resource,id])=>({name:resource.name,id,owner,service,image:resource.image,namespace,mounts:resource.mounts,removed:true}));
 const info={Id:registry[0].id,Name:'/'+plan.candidate.name,Image:image,Config:{Entrypoint:['node'],Cmd:['/candidate/app.js'],Labels:{'exui.harness.owner':owner,'exui.harness.service':'candidate'}},HostConfig:{NetworkMode:'container:'+namespace,ReadonlyRootfs:true,Init:true,Privileged:false,PidMode:'',CapDrop:['ALL'],SecurityOpt:['no-new-privileges'],PidsLimit:256,Memory:4294967296,NanoCpus:2000000000,PortBindings:{}},Mounts:mounts.map(row=>({Type:'bind',Source:row.source,Destination:row.target,RW:row.writable})),State:{Running:true,ExitCode:0,OOMKilled:false}};
 const lifecycle={requestedStop:true,before:info,after:{...structuredClone(info),State:{Running:false,ExitCode:143,OOMKilled:false}}},denial={candidateId:info.Id,attempts:[{path:'/output/report.json',denied:true},{path:'/harness/controller.mjs',denied:true}],controllerSourceVisible:false};
 const save=value=>fs.writeFileSync(path.join(directory,'baseline/candidate-lifecycle.json'),JSON.stringify(value));save(lifecycle);fs.writeFileSync(path.join(directory,'baseline/candidate-write-denial.json'),JSON.stringify(denial));
 const check=()=>assertSharedNestedInvocationAuthority({directory,execution:{invocationId:'baseline'},ownership,registry});check();
 for(const change of [x=>x.before.Id='4'.repeat(64),x=>x.before.Image='sha256:'+'f'.repeat(64),x=>x.before.HostConfig.NetworkMode='none',x=>x.before.Mounts[0].Source='/private/tmp/foreign-candidate',x=>x.before.Config.Cmd=['/candidate/foreign.js'],x=>x.after.Name='/foreign-container']){const changed=structuredClone(lifecycle);change(changed);save(changed);assert.throws(check);}
 save(lifecycle);registry[1].mounts=[{source:'/foreign',target:'/candidate',writable:true}];assert.throws(check,/SHARED_NESTED_ATTEMPT_INVALID/);
});

for(const [channel,mutation]of [['email','ccd-drop-child'],['post','ccd-drop-postal-optional-child']])test(`exact persisted ${mutation} is required before consequential named fault`,async()=>{
 const value=await observation(channel,2,mutation);const result=await replay(value);assert.equal(result.recipientCount,2);
 for(const change of [x=>x.status=422,x=>x.after.state.case_data.protectedValue='wrong',x=>x.after.state.case_data.sodAdditionalRecipientsList[0].value.serveByPostOrEmail='wrong',x=>{x.after.state.case_data.sodAdditionalRecipientsList=structuredClone(x.request.body.data.sodAdditionalRecipientsList);x.reread=structuredClone(x.after);x.savedRows=x.after.state.case_data.sodAdditionalRecipientsList.map(row=>text(row.value));}]){const changed=structuredClone(value);change(changed);await assert.rejects(replay(changed),/SHARED_NESTED_/);}
});

test('a surviving private native state directory cannot publish a safe runtime attempt',async()=>{
 const os=require('node:os'),path=require('node:path');const {assertSharedNestedStateRemoved}=await import('./lib/exui-shared-nested-attempt.mjs');
 const state=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'harness-native-state-'));
 try{assert.throws(()=>assertSharedNestedStateRemoved(state),/SHARED_NESTED_ATTEMPT_INVALID/);}finally{fs.rmSync(state,{recursive:true,force:true});}
 assertSharedNestedStateRemoved(state);assert.throws(()=>assertSharedNestedStateRemoved('harness-native-state-relative'),/SHARED_NESTED_ATTEMPT_INVALID/);
});

test('standalone cleanup removes only its captured owned state and rejects foreign owner or mounts',async t=>{
 const os=require('node:os'),path=require('node:path');const {removeSharedNestedState}=await import('./run-harness-shared-nested.mjs');
 const state=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'harness-native-state-'));t.after(()=>fs.rmSync(state,{recursive:true,force:true}));fs.writeFileSync(path.join(state,'owned-canary'),'synthetic');
 const handoff={owner:'synthetic-owner',mode:'native-separate-api',output:'/private/tmp/synthetic-output',stateRoot:state};
 const ownership={owner:handoff.owner,directory:handoff.output,invocations:['baseline','ccd-drop-child','ccd-drop-postal-optional-child','shared-nested-drop-second-recipient'].map(invocationId=>{const sessions={source:path.join(state,invocationId,'sessions'),target:'/tmp/.sessions',writable:true};return {invocationId,plan:{tools:{mounts:[sessions]},candidate:{mounts:[sessions,{source:path.join(state,invocationId,'diagnostics'),target:'/diagnostics',writable:true}]}}};})};
 const alias=state+'-alias';fs.symlinkSync(state,alias);t.after(()=>fs.rmSync(alias,{force:true}));
 assert.throws(()=>removeSharedNestedState({...handoff,stateRoot:alias},ownership),/STATE_PATH/);assert(fs.existsSync(state));
 const foreign=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'foreign-native-state-'));t.after(()=>fs.rmSync(foreign,{recursive:true,force:true}));fs.writeFileSync(path.join(foreign,'foreign-canary'),'preserve');
 assert.throws(()=>removeSharedNestedState({...handoff,stateRoot:foreign},ownership),/STATE_PATH/);assert(fs.existsSync(path.join(foreign,'foreign-canary')));
 assert.throws(()=>removeSharedNestedState({...handoff,owner:'foreign'},ownership),/STATE_OWNER/);assert(fs.existsSync(state));
 const wrong=structuredClone(ownership);wrong.invocations[0].plan.candidate.mounts[0].source='/foreign';assert.throws(()=>removeSharedNestedState(handoff,wrong),/STATE_MOUNT/);assert(fs.existsSync(state));
 removeSharedNestedState(handoff,ownership);assert(!fs.existsSync(state));
});
