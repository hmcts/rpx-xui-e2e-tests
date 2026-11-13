import { isDeepStrictEqual } from 'node:util';

// Independent literal oracle for harnessSourceShapes.ts. No file trust, injected oracle,
// producer verdict, expected-data field or runtime authority is supplied by this module.
const shapes=['recipient-collection','case-field-recipient-selector','required-delivery-radio','conditional-email-complex','postal-recipient-name','optional-postal-line-two'];
const roles=['caseworker','caseworker-harness','caseworker-privatelaw-courtadmin'];
const personas=['allowed','courtadmin','judge','observer','readonly'];
const fields=['selector','email','post','emailName','emailAddress','postalName','AddressLine1','AddressLine2','AddressLine3','PostTown','County','Country','PostCode'];
const domKeys=['fields','fieldGroups','order','emailComplexes','emailLegends','addNew','cya','control','sourceText','errors','collections'];
const check=value=>{if(!value)throw Error('SOURCE_SHAPE_OBSERVATION_INVALID');};
const same=(a,b)=>check(isDeepStrictEqual(a,b));
const exact=(value,keys)=>same(Object.keys(value??{}).sort(),keys.slice().sort());
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
const text=value=>typeof value==='string'&&value.length<=4096;
const blank=value=>value===null||value==='';
function safe(value,depth=0,arrayLimit=256){
 check(depth<=24);
 if(value===null||typeof value==='boolean')return;
 if(typeof value==='string'){check(text(value));return;}
 if(typeof value==='number'){check(Number.isFinite(value));return;}
 check(value&&typeof value==='object');
 if(Array.isArray(value)){check(value.length<=arrayLimit&&Object.keys(value).length===value.length);for(let i=0;i<value.length;i++){check(Object.hasOwn(value,i));safe(value[i],depth+1);}return;}
 check(Object.getPrototypeOf(value)===Object.prototype&&Object.keys(value).length<=64);
 for(const [key,item]of Object.entries(value)){check(!/^(?:__proto__|constructor|prototype|authorization|headers|cookie|password|token|secret)$/i.test(key));safe(item,depth+1,key==='requests'?4096:256);}
}
function actorIds(ids){exact(ids,personas);check(Object.values(ids).every(uuid)&&new Set(Object.values(ids)).size===5);}
function actor(value,id,strict){
 check(value&&typeof value==='object');if(strict)exact(value,['id','roles']);
 check(value.id===undefined||value.uid===undefined||value.id===value.uid);
 same(value.id??value.uid,id);check(Array.isArray(value.roles));same(value.roles.slice().sort(),roles);
}
function emptyEmail(value){
 if(value===null)return;
 check(value&&typeof value==='object'&&!Array.isArray(value));
 check(Object.keys(value).every(k=>['emailName','emailAddress'].includes(k))&&Object.values(value).every(blank));
}
function emptyPostal(value){
 if(value===null)return;
 check(value&&typeof value==='object'&&!Array.isArray(value));check(Object.keys(value).every(k=>['postalName','postalAddress'].includes(k)));
 if(Object.hasOwn(value,'postalName'))check(blank(value.postalName));
 if(Object.hasOwn(value,'postalAddress')){const address=value.postalAddress;if(address===null)return;check(address&&typeof address==='object'&&!Array.isArray(address));check(Object.keys(address).every(k=>['AddressLine1','AddressLine2','AddressLine3','PostTown','County','Country','PostCode'].includes(k))&&Object.values(address).every(blank));}
}
const email=(emailName='Synthetic shape recipient',emailAddress='shape-recipient@harness.example.com')=>({emailName,emailAddress});
function recipient(value,channel,expectedEmail,line2=null,extraEmail=null){
 check(value&&typeof value==='object'&&!Array.isArray(value));check(Object.keys(value).every(k=>['serveByPostOrEmail','emailInformation','postalInformation'].includes(k)));same(value.serveByPostOrEmail,channel);
 if(channel==='email'){same(value.emailInformation,expectedEmail);if(Object.hasOwn(value,'postalInformation'))emptyPostal(value.postalInformation);return;}
 exact(value.postalInformation,['postalName','postalAddress']);same(value.postalInformation.postalName,'Synthetic shape recipient');
 const address=value.postalInformation.postalAddress;check(address&&typeof address==='object'&&!Array.isArray(address));
 check(Object.keys(address).every(k=>['AddressLine1','AddressLine2','AddressLine3','PostTown','County','Country','PostCode'].includes(k)));
 same(Object.fromEntries(['AddressLine1','AddressLine3','PostTown','County','Country','PostCode'].map(k=>[k,address[k]])),{AddressLine1:'Synthetic shape street',AddressLine3:'Synthetic third line',PostTown:'Synthetic town',County:'Synthetic county',Country:'United Kingdom',PostCode:'SW1A 1AA'});
 if(line2===null)check(address.AddressLine2===undefined||blank(address.AddressLine2));else same(address.AddressLine2,line2);
 if(extraEmail)same(value.emailInformation,extraEmail);else if(Object.hasOwn(value,'emailInformation'))emptyEmail(value.emailInformation);
}
function state(value,caseId){
 exact(value,['state','history']);check(value.state&&Array.isArray(value.history));same(String(value.state.id),caseId);same(value.state.case_type_id,'HarnessNestedPRL');same(value.state.jurisdiction,'HARNESS');same(value.state.state,'JUDICIAL_REVIEW');check(Number.isSafeInteger(value.state.version)&&value.state.version>=0);
}
function write(before,after,id,eventCount){
 same(after.state.version,before.state.version+1);same(after.history.length,before.history.length+1);
 const events=after.history.filter(e=>e.id==='serviceOfDocuments');same(events.length,eventCount);
 check(events.every(e=>e.user_id===id&&e.case_type_id==='HarnessNestedPRL'));
 check(after.history.some((e,index)=>e.id==='serviceOfDocuments'&&isDeepStrictEqual(after.history.filter((_,i)=>i!==index),before.history)));
}
function dom(value){
 exact(value,domKeys);exact(value.fields,fields);check(Array.isArray(value.order));
 const actual=[];
 for(const field of fields){check(Array.isArray(value.fields[field]));for(const row of value.fields[field]){
  exact(row,['id','type','visible','checked','value','labels','ariaLabel','labelledBy','accessibleRole','accessibleName']);check(text(row.id)&&text(row.type)&&typeof row.visible==='boolean'&&typeof row.checked==='boolean'&&text(row.value)&&Array.isArray(row.labels)&&row.labels.every(text));check(row.ariaLabel===null||text(row.ariaLabel));check(Array.isArray(row.labelledBy));for(const label of row.labelledBy){exact(label,['id','text']);check(text(label.id)&&(label.text===null||text(label.text)));}
  if(['email','post'].includes(field)&&row.visible){same(row.accessibleRole,'radio');same(row.accessibleName,field==='email'?'Email':'Post');}else if(['emailName','postalName','AddressLine2'].includes(field)&&row.visible){same(row.accessibleRole,'textbox');check(text(row.accessibleName));}else{same(row.accessibleRole,null);same(row.accessibleName,null);}
  check(field==='selector'?row.id.startsWith('sodAdditionalRecipients')&&!row.id.includes('sodAdditionalRecipientsList'):row.id.startsWith('sodAdditionalRecipientsList'));
  if(['email','post'].includes(field)){check(new RegExp('^sodAdditionalRecipientsList(?:_\\d+)?_serveByPostOrEmail-'+field+'$').test(row.id));same(row.type,'radio');}
  else if(field==='selector')same(row.type,'checkbox');else check(row.id.endsWith(field));
  actual.push({field,id:row.id});
 }}
 check(new Set(actual.map(r=>r.id)).size===actual.length);same(value.order.slice().sort((a,b)=>a.id.localeCompare(b.id)),actual.slice().sort((a,b)=>a.id.localeCompare(b.id)));
 for(const key of ['addNew','cya','control','errors']){check(Array.isArray(value[key]));for(const row of value[key]){exact(row,['visible']);check(typeof row.visible==='boolean');}}
 check(Array.isArray(value.fieldGroups));for(const group of value.fieldGroups){exact(group,['id','labels']);check(group.id==='sodAdditionalRecipients'||group.id.startsWith('sodAdditionalRecipientsList')&&group.id.endsWith('_serveByPostOrEmail'));for(const label of group.labels){exact(label,['text','visible']);check(text(label.text)&&typeof label.visible==='boolean');}}
 check(Array.isArray(value.emailComplexes));for(const complex of value.emailComplexes){exact(complex,['id','visible','legends']);check(complex.id.startsWith('sodAdditionalRecipientsList')&&complex.id.endsWith('_emailInformation')&&typeof complex.visible==='boolean'&&Array.isArray(complex.legends));for(const legend of complex.legends){exact(legend,['text','visible']);check(text(legend.text)&&typeof legend.visible==='boolean');}}
 same(value.emailLegends,value.emailComplexes.flatMap(row=>row.legends));
 check(Array.isArray(value.emailLegends));for(const label of value.emailLegends){exact(label,['text','visible']);check(text(label.text)&&typeof label.visible==='boolean');}
 check(Array.isArray(value.sourceText));for(const row of value.sourceText){exact(row,['text','visible','id','fieldId']);check(text(row.text)&&text(row.id)&&typeof row.visible==='boolean'&&(row.fieldId===null||text(row.fieldId)));}
 check(Array.isArray(value.collections));for(const table of value.collections){exact(table,['visible','rows']);check(typeof table.visible==='boolean'&&Array.isArray(table.rows));for(const row of table.rows){exact(row,['text','visible','leaves','cells']);check(Array.isArray(row.leaves));for(const leaf of row.leaves){exact(leaf,['text','visible']);check(text(leaf.text)&&typeof leaf.visible==='boolean');}check(text(row.text)&&typeof row.visible==='boolean'&&Array.isArray(row.cells));for(const cell of row.cells){exact(cell,['text','visible']);check(text(cell.text)&&typeof cell.visible==='boolean');}}}
}
// Bind every measured radio pair to its own actual recorded field group.
// Multiple collection rows remain valid; context-specific checks below select row0.
function radioGroups(d){
 const email=d.fields.email,post=d.fields.post;
 const groups=rows=>rows.map(row=>row.id.slice(0,row.id.lastIndexOf('-')));
 same(groups(email).slice().sort(),groups(post).slice().sort());
 check(new Set(groups(email)).size===email.length);
 for(const id of groups(email))same(d.fieldGroups.filter(group=>group.id===id).length,1);
}
function sourceRadioPair(d,groupId='sodAdditionalRecipientsList_0_serveByPostOrEmail'){
 const email=one(d,'email'),post=one(d,'post');same(email.id,groupId+'-email');same(post.id,groupId+'-post');
 const groups=d.fieldGroups.filter(group=>group.id===groupId);same(groups.length,1);return {email,post,group:groups[0]};
}
const shown=(d,field)=>d.fields[field].filter(row=>row.visible);
function one(d,field){const rows=shown(d,field);same(rows.length,1);return rows[0];}
function channel(d,name){const pair=sourceRadioPair(d);same(pair[name].checked,true);same(pair[name==='email'?'post':'email'].checked,false);}
function accessible(row){same(row.accessibleRole,'textbox');check(text(row.accessibleName));return row.accessibleName;}
function order(d,names){const ids=names.map(name=>one(d,name).id),positions=ids.map(id=>d.order.findIndex(row=>row.id===id));check(positions.every((p,index)=>p>=0&&(!index||p>positions[index-1])));}
function soleVisible(rows){same(rows.length,1);check(rows[0].visible);}
function emailFilled(d){channel(d,'email');same(one(d,'emailName').value,'Synthetic shape recipient');same(one(d,'emailAddress').value,'shape-recipient@harness.example.com');}
function emailNameAndOrder(d){check(/Name/.test(accessible(one(d,'emailName'))));order(d,['email','emailName','emailAddress']);}
function postFilled(d,shape,fault){
 channel(d,'post');const name=one(d,'postalName');if(shape==='postal-recipient-name')check((fault?/^Harness changed postal recipient name/:/^Name/).test(accessible(name)));same(name.value,'Synthetic shape recipient');
 for(const [key,value]of Object.entries({AddressLine1:'Synthetic shape street',AddressLine2:'',AddressLine3:'Synthetic third line',PostTown:'Synthetic town',County:'Synthetic county',Country:'United Kingdom',PostCode:'SW1A 1AA'}))same(one(d,key).value,value);
 same(accessible(one(d,'AddressLine2')),shape==='optional-postal-line-two'&&fault?'Harness changed postal line two (Optional)':'Address Line 2 (Optional)');order(d,['AddressLine1','AddressLine2','PostCode']);
}
function collectionRows(d){
 const tables=d.collections.filter(t=>t.rows.some(row=>row.leaves.some(leaf=>leaf.text==='Synthetic collection first')));same(tables.length,1);same(tables[0].rows.length,2);
 const expected=[['Synthetic collection first','first-collection@harness.example.com'],['Synthetic collection second','second-collection@harness.example.com']];
 for(const [index,row]of tables[0].rows.entries()){
  for(const marker of expected[index]){const matches=row.leaves.filter(leaf=>leaf.text===marker);soleVisible(matches);}
  same(row.leaves.filter(leaf=>leaf.text===expected[1-index][0]).length,0);
 }
}
function stages(shape,fault){return ['case-opened','event-opened',...({
 'recipient-collection':fault?['singular-form','singular-cya']:['collection-cya','collection-reopened'],
 'case-field-recipient-selector':['email-filled','cya','selector-reopened'],
 'required-delivery-radio':['radio-unselected','first-continue',...(!fault?['email-filled']:[]),'cya'],
 'conditional-email-complex':['email-selected','post-selected',...(fault?['post-filled']:['email-returned','email-filled']),'cya'],
 'postal-recipient-name':['email-selected','post-selected','post-filled','cya'],
 'optional-postal-line-two':['email-selected','post-selected','post-filled','cya','line2-reopened','line2-filled','second-cya'],
 })[shape]];}
function replay(packet,ids,fault){
 exact(packet,['shape','observation','ui','requests']);const {shape,observation:o,ui,requests}=packet;check(shapes.includes(shape));
 const postal=shape==='postal-recipient-name'||shape==='optional-postal-line-two'||shape==='conditional-email-complex'&&fault;
 exact(o,['shape','actor','caseId','before','after','contractSatisfied',...(shape==='recipient-collection'&&fault?['singularComplex']:[]),...(postal?['postalLabel']:[]),...(shape==='optional-postal-line-two'?['filledObservation']:[])]);
 same(o.shape,shape);check(/^\d{16}$/.test(o.caseId)&&typeof o.contractSatisfied==='boolean');if(Object.hasOwn(o,'singularComplex'))check(typeof o.singularComplex==='boolean');actor(o.actor,ids.courtadmin,false);
 state(o.before,o.caseId);state(o.after,o.caseId);same(o.before.history.map(e=>e.id),['create']);same(o.before.history[0].user_id,ids.allowed);same(o.before.history[0].case_type_id,'HarnessNestedPRL');
 same(o.before.state.case_data,shape==='recipient-collection'?{protectedValue:'synthetic-source-shape-control'}:{protectedValue:'synthetic-source-shape-control',sodAdditionalRecipientsList:[]});
 exact(ui,['schemaVersion','kind','shape','actor','caseId','stages','responses','readbacks']);same(ui.schemaVersion,3);same(ui.kind,'source-shape-ui-observation');same(ui.shape,shape);same(ui.caseId,o.caseId);actor(ui.actor,ids.courtadmin,true);
 same(ui.stages.map(r=>r.id),stages(shape,fault));const observed={};for(const row of ui.stages){exact(row,['id','dom']);dom(row.dom);radioGroups(row.dom);observed[row.id]=row.dom;}
 soleVisible(observed['case-opened'].control);const selected=shown(observed['event-opened'],'selector');same(selected.length,1);same(selected[0].checked,true);same(selected[0].value,'additionalRecipients');
 const responseIds=['bootstrap','user-details','case-opened','event-opened','submit',...(shape==='recipient-collection'&&!fault?['collection-reopened']:[]),...(shape==='case-field-recipient-selector'?['selector-reopened']:[]),...(shape==='optional-postal-line-two'?['line2-case-reopened','line2-event-reopened','second-submit']:[])];
 same(ui.responses.map(r=>r.id),responseIds);for(const row of ui.responses){exact(row,['id','status']);same(row.status,['bootstrap','submit','second-submit'].includes(row.id)?201:200);}
 const first=observed['cya']??observed[fault?'singular-cya':'collection-cya'];soleVisible(first.cya);
 if(shape==='recipient-collection'){
  if(fault){same(observed['singular-form'].addNew.length,0);sourceRadioPair(observed['singular-form'],'sodAdditionalRecipientsList_serveByPostOrEmail');for(const marker of ['Synthetic singular recipient','singular-recipient@harness.example.com']){const matches=first.sourceText.filter(r=>r.text===marker);same(matches.length,1);check(matches[0].visible&&matches[0].fieldId?.startsWith('sodAdditionalRecipientsList'));}}
  else{collectionRows(first);collectionRows(observed['collection-reopened']);}
 }else if(shape==='required-delivery-radio'){
  const start=observed['radio-unselected'],pair=sourceRadioPair(start);same(pair.email.checked,false);same(pair.post.checked,false);
  const label=fault?'Served by (Optional)':'Served by';const labels=pair.group.labels.filter(r=>r.text===label);soleVisible(labels);
  const next=observed['first-continue'];if(fault)soleVisible(next.cya);else{same(next.cya.length,0);soleVisible(next.errors);emailNameAndOrder(observed['email-filled']);emailFilled(observed['email-filled']);}
 }else if(shape==='conditional-email-complex'){
  channel(observed['email-selected'],'email');channel(observed['post-selected'],'post');
  if(fault){same(shown(observed['email-selected'],'emailName').length,0);same(shown(observed['email-selected'],'emailAddress').length,0);const count=shown(observed['post-selected'],'emailName').length;same(shown(observed['post-selected'],'emailAddress').length,count);check(count===0||count===1);same(shown(observed['post-filled'],'emailName').length,count);same(shown(observed['post-filled'],'emailAddress').length,count);if(count){same(one(observed['post-filled'],'emailName').value,'Synthetic fault email recipient');same(one(observed['post-filled'],'emailAddress').value,'fault-recipient@harness.example.com');}}
  else{same(shown(observed['email-selected'],'emailName').length,1);same(shown(observed['email-selected'],'emailAddress').length,1);same(observed['email-selected'].emailComplexes.length,1);same(observed['email-selected'].emailComplexes[0].legends.map(r=>r.text).join('').trim(),'');same(shown(observed['post-selected'],'emailName').length,0);same(shown(observed['post-selected'],'emailAddress').length,0);channel(observed['email-returned'],'email');emailNameAndOrder(observed['email-returned']);emailFilled(observed['email-filled']);}
 }else if(shape==='case-field-recipient-selector'){
  emailFilled(observed['email-filled']);const label=fault?'Harness changed recipient selector':'Select additional recipients who needs to be served';const matches=observed['selector-reopened'].sourceText.filter(r=>r.text===label);same(matches.length,1);check(matches[0].visible&&matches[0].fieldId==='sodAdditionalRecipients');
 }else{channel(observed['email-selected'],'email');same(shown(observed['email-selected'],shape==='postal-recipient-name'?'postalName':'AddressLine2').length,0);channel(observed['post-selected'],'post');if(shape==='postal-recipient-name')one(observed['post-selected'],'postalName');}
 if(postal){postFilled(observed['post-filled'],shape,fault);same(o.postalLabel,shape==='optional-postal-line-two'&&fault?'Harness changed postal line two (Optional)':'Address Line 2 (Optional)');}
 const data=o.after.state.case_data;exact(data,['protectedValue','sodAdditionalRecipients','sodAdditionalRecipientsList']);same(data.protectedValue,'synthetic-source-shape-control');same(data.sodAdditionalRecipients,['additionalRecipients']);const rows=data.sodAdditionalRecipientsList;
 if(shape==='required-delivery-radio'&&fault)same(rows,[]);
 else if(shape==='recipient-collection'&&fault)recipient(rows,'email',email('Synthetic singular recipient','singular-recipient@harness.example.com'));
 else{
  same(rows.length,shape==='recipient-collection'?2:1);check(Array.isArray(rows));check(new Set(rows.map(r=>r.id)).size===rows.length);for(const [index,row]of rows.entries()){exact(row,['id','value']);check(uuid(row.id));let expected=email();if(shape==='recipient-collection')expected=email(index?'Synthetic collection second':'Synthetic collection first',index?'second-collection@harness.example.com':'first-collection@harness.example.com');const extra=shape==='conditional-email-complex'&&fault&&shown(observed['post-filled'],'emailName').length?email('Synthetic fault email recipient','fault-recipient@harness.example.com'):null;recipient(row.value,postal?'post':'email',expected,null,extra);}
 }
 write(o.before,o.after,ids.courtadmin,1);
 if(shape==='optional-postal-line-two'){
  const reopened=observed['line2-reopened'];same(accessible(one(reopened,'AddressLine2')),fault?'Harness changed postal line two (Optional)':'Address Line 2 (Optional)');same(one(reopened,'AddressLine2').value,'');same(one(observed['line2-filled'],'AddressLine2').value,'Synthetic second line');soleVisible(observed['second-cya'].cya);
  state(o.filledObservation,o.caseId);const filled=o.filledObservation.state.case_data;exact(filled,['protectedValue','sodAdditionalRecipients','sodAdditionalRecipientsList']);same(filled.protectedValue,'synthetic-source-shape-control');same(filled.sodAdditionalRecipients,['additionalRecipients']);same(filled.sodAdditionalRecipientsList.length,1);const row=filled.sodAdditionalRecipientsList[0];exact(row,['id','value']);same(row.id,rows[0].id);recipient(row.value,'post',null,'Synthetic second line');const unchanged=structuredClone(filled);unchanged.sodAdditionalRecipientsList[0].value.postalInformation.postalAddress.AddressLine2=rows[0].value.postalInformation.postalAddress.AddressLine2;if(!Object.hasOwn(rows[0].value.postalInformation.postalAddress,'AddressLine2'))delete unchanged.sodAdditionalRecipientsList[0].value.postalInformation.postalAddress.AddressLine2;same(unchanged,data);write(o.after,o.filledObservation,ids.courtadmin,2);
 }
 same(ui.readbacks.length,shape==='recipient-collection'&&!fault?1:0);if(ui.readbacks.length){exact(ui.readbacks[0],['id','observation']);same(ui.readbacks[0].id,'collection-reopened');same(ui.readbacks[0].observation,o.after);}
 journal(requests,o.caseId,ids,shape,fault);
 return o.caseId;
}
function journal(requests,caseId,ids,shape,fault){
 check(Array.isArray(requests)&&requests.length>0);
 const view='/internal/cases/'+caseId,start=view+'/event-triggers/serviceOfDocuments',submit='/cases/'+caseId+'/events';
 for(const row of requests){check(row&&typeof row==='object');check(Object.keys(row).every(k=>['method','path','receivedPath','upstreamPath','actorId','status','mutation'].includes(k)));check(text(row.method)&&text(row.upstreamPath)&&Number.isInteger(row.status));}
 const relevant=requests.map((row,index)=>({...row,index})).filter(row=>row.upstreamPath.includes('/'+caseId));
 // Pinned toolkit CaseEditPage.submitted navigates to case-details after each save.
 // That authenticated read is distinct from the fixture's explicit reopen.
 const paths=[['GET',view,200],['GET',start,200],['POST',submit,201],['GET',view,200],...((shape==='recipient-collection'&&!fault||['case-field-recipient-selector','optional-postal-line-two'].includes(shape))?[['GET',view,200]]:[]),...(shape==='optional-postal-line-two'?[['GET',start,200],['POST',submit,201],['GET',view,200]]:[])];
 same(relevant.map(r=>[r.method,r.upstreamPath,r.status]),paths);check(relevant.every(r=>r.actorId===ids.courtadmin&&r.mutation===null));
 const prefix='/caseworkers/'+ids.allowed+'/jurisdictions/HARNESS/case-types/HarnessNestedPRL';
 const creates=requests.map((row,index)=>({...row,index})).filter(r=>r.method==='POST'&&r.upstreamPath===prefix+'/cases'&&r.index<relevant[0].index);
 check(creates.length>0&&creates.every(r=>r.actorId===ids.allowed&&r.status===201&&r.mutation===null));
 const last=creates.at(-1);check(requests.some((r,index)=>index<last.index&&r.method==='GET'&&r.upstreamPath===prefix+'/event-triggers/create/token'&&r.status===200&&r.actorId===ids.allowed&&r.mutation===null));
 // Journal has no returned bootstrap case ID/body: never infer that missing link.
}
export function replayEventV3SourceShapeObservations(input){
 try{
  safe(input);exact(input,['invocationId','baselineActorIds','selectedActorIds','baseline','selected']);
  check(typeof input.invocationId==='string'&&input.invocationId.startsWith('ccd-shape-'));const shape=input.invocationId.slice('ccd-shape-'.length);check(shapes.includes(shape));actorIds(input.baselineActorIds);actorIds(input.selectedActorIds);
  check(Array.isArray(input.baseline)&&input.baseline.length===6);same(input.baseline.map(p=>p.shape).slice().sort(),shapes.slice().sort());same(input.selected.shape,shape);
  const cases=input.baseline.map(packet=>replay(packet,input.baselineActorIds,false));check(new Set(cases).size===6);replay(input.selected,input.selectedActorIds,true);
  return {schemaVersion:1,status:'experimental-source-shape-observations-replayed',baselineShapes:6,selectedFaults:1,selectedShape:shape,experimental:true,semanticReplay:false,sourceComplete:false,nativeAuthority:false,nativeRuntimeAcceptance:false,runtimeAcceptance:false,catalogueCredit:false,releaseCredit:false,releaseApproval:false,promotionAllowed:false};
 }catch{throw Error('EVENT_V3_SOURCE_SHAPE_OBSERVATION_INVALID');}
}
