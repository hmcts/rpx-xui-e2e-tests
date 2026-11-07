// Independent synthetic unit inputs only. Never call production capture/oracle code.
const shapes=['recipient-collection','case-field-recipient-selector','required-delivery-radio','conditional-email-complex','postal-recipient-name','optional-postal-line-two'];
const ids=offset=>Object.fromEntries(['allowed','courtadmin','judge','observer','readonly'].map((name,n)=>[name,`12345678-1234-4234-8234-${String(offset+n).padStart(12,'0')}`]));
const roles=['caseworker','caseworker-harness','caseworker-privatelaw-courtadmin'];
const actor=id=>({id,roles:[...roles]});
const initialDom=()=>({fields:Object.fromEntries(['selector','email','post','emailName','emailAddress','postalName','AddressLine1','AddressLine2','AddressLine3','PostTown','County','Country','PostCode'].map(k=>[k,[]])),fieldGroups:[],order:[],emailComplexes:[],emailLegends:[],addNew:[],cya:[],control:[],sourceText:[],errors:[],collections:[]});
function input(d,key,value='',label='',visible=true,checked=false,index=0){
 const id=key==='selector'?'sodAdditionalRecipients_additionalRecipients':`sodAdditionalRecipientsList_${index}_${['email','post'].includes(key)?'serveByPostOrEmail-'+key:key}`;
 d.fields[key].push({id,type:key==='selector'?'checkbox':['email','post'].includes(key)?'radio':'text',visible,checked,value,labels:label?[label]:[],ariaLabel:null,labelledBy:[],accessibleRole:visible&&['email','post'].includes(key)?'radio':visible&&['emailName','postalName','AddressLine2'].includes(key)?'textbox':null,accessibleName:visible&&['emailName','postalName','AddressLine2','email','post'].includes(key)?label:null});d.order.push({field:key,id});
}
function radios(d,selected){d.fieldGroups.push({id:'sodAdditionalRecipientsList_0_serveByPostOrEmail',labels:[{text:'Served by',visible:true}]});input(d,'email','on','Email',true,selected==='email');input(d,'post','on','Post',true,selected==='post');}
function emailForm(d,filled=true){radios(d,'email');input(d,'emailName',filled?'Synthetic shape recipient':'','Name');input(d,'emailAddress',filled?'shape-recipient@harness.example.com':'','Email address');}
function postalForm(d,shape,fault,pairs){
 radios(d,'post');input(d,'postalName','Synthetic shape recipient',shape==='postal-recipient-name'&&fault?'Harness changed postal recipient name':'Name');
 for(const [key,value]of Object.entries({AddressLine1:'Synthetic shape street',AddressLine2:'',PostCode:'SW1A 1AA',AddressLine3:'Synthetic third line',PostTown:'Synthetic town',County:'Synthetic county',Country:'United Kingdom'}))input(d,key,value,key==='AddressLine2'?shape==='optional-postal-line-two'&&fault?'Harness changed postal line two (Optional)':'Address Line 2 (Optional)':key);
 if(pairs){input(d,'emailName','Synthetic fault email recipient','Name');input(d,'emailAddress','fault-recipient@harness.example.com','Email address');}
}
const emailValue=(name='Synthetic shape recipient',address='shape-recipient@harness.example.com')=>({serveByPostOrEmail:'email',emailInformation:{emailName:name,emailAddress:address},postalInformation:null});
const postValue=(extra=false)=>({serveByPostOrEmail:'post',postalInformation:{postalName:'Synthetic shape recipient',postalAddress:{AddressLine1:'Synthetic shape street',AddressLine2:null,AddressLine3:'Synthetic third line',PostTown:'Synthetic town',County:'Synthetic county',Country:'United Kingdom',PostCode:'SW1A 1AA'}},emailInformation:extra?{emailName:'Synthetic fault email recipient',emailAddress:'fault-recipient@harness.example.com'}:null});
const plans={
 'recipient-collection':[['collection-cya','collection-reopened'],['singular-form','singular-cya']],
 'case-field-recipient-selector':[['email-filled','cya','selector-reopened'],['email-filled','cya','selector-reopened']],
 'required-delivery-radio':[['radio-unselected','first-continue','email-filled','cya'],['radio-unselected','first-continue','cya']],
 'conditional-email-complex':[['email-selected','post-selected','email-returned','email-filled','cya'],['email-selected','post-selected','post-filled','cya']],
 'postal-recipient-name':[['email-selected','post-selected','post-filled','cya'],['email-selected','post-selected','post-filled','cya']],
 'optional-postal-line-two':[['email-selected','post-selected','post-filled','cya','line2-reopened','line2-filled','second-cya'],['email-selected','post-selected','post-filled','cya','line2-reopened','line2-filled','second-cya']]};
function packet(shape,fault,actors,ordinal,pairs){
 const caseId='32345678901234'+String(ordinal).padStart(2,'0'),before={state:{id:Number(caseId),case_type_id:'HarnessNestedPRL',jurisdiction:'HARNESS',state:'JUDICIAL_REVIEW',version:0,case_data:{protectedValue:'synthetic-source-shape-control',...(shape==='recipient-collection'?{}:{sodAdditionalRecipientsList:[]})}},history:[{id:'create',user_id:actors.allowed,case_type_id:'HarnessNestedPRL',created_date:'synthetic-before'}]};
 const postal=shape==='postal-recipient-name'||shape==='optional-postal-line-two'||shape==='conditional-email-complex'&&fault;
 let values=shape==='recipient-collection'?[emailValue('Synthetic collection first','first-collection@harness.example.com'),emailValue('Synthetic collection second','second-collection@harness.example.com')]:[postal?postValue(shape==='conditional-email-complex'&&pairs===1):emailValue()];
 let recipients=values.map((value,n)=>({id:`12345678-1234-4234-8234-${String(ordinal*10+n).padStart(12,'0')}`,value}));
 if(shape==='required-delivery-radio'&&fault)recipients=[];
 if(shape==='recipient-collection'&&fault)recipients=emailValue('Synthetic singular recipient','singular-recipient@harness.example.com');
 const after=structuredClone(before);after.state.version++;after.state.case_data={protectedValue:'synthetic-source-shape-control',sodAdditionalRecipients:['additionalRecipients'],sodAdditionalRecipientsList:recipients};after.history.unshift({id:'serviceOfDocuments',user_id:actors.courtadmin,case_type_id:'HarnessNestedPRL',created_date:'synthetic-first'});
 const observation={shape,actor:actor(actors.courtadmin),caseId,before,after,contractSatisfied:!fault};
 if(shape==='recipient-collection'&&fault)observation.singularComplex=true;
 if(postal)observation.postalLabel=shape==='optional-postal-line-two'&&fault?'Harness changed postal line two (Optional)':'Address Line 2 (Optional)';
 if(shape==='optional-postal-line-two'){const filled=structuredClone(after);filled.state.version++;filled.state.case_data.sodAdditionalRecipientsList[0].value.postalInformation.postalAddress.AddressLine2='Synthetic second line';filled.history.unshift({id:'serviceOfDocuments',user_id:actors.courtadmin,case_type_id:'HarnessNestedPRL',created_date:'synthetic-second'});observation.filledObservation=filled;}
 const stageIds=['case-opened','event-opened',...plans[shape][fault?1:0]];
 const stages=stageIds.map(id=>{
  const d=initialDom();
  if(id==='case-opened')d.control=[{visible:true}];
  if(id==='event-opened')input(d,'selector','additionalRecipients','Additional recipients (optional)',true,true);
  if(id==='singular-form'){radios(d,null);for(const key of ['email','post']){const old=d.fields[key][0].id;d.fields[key][0].id=old.replace('_0_serve','_serve');d.order.find(r=>r.id===old).id=d.fields[key][0].id;}d.fieldGroups[0].id='sodAdditionalRecipientsList_serveByPostOrEmail';d.addNew=[];}
  if(id==='singular-cya'){d.cya=[{visible:true}];d.sourceText=['Synthetic singular recipient','singular-recipient@harness.example.com'].map(text=>({text,visible:true,id:'',fieldId:'sodAdditionalRecipientsList'}));}
  if(id==='collection-cya'||id==='collection-reopened'){d.cya=id==='collection-cya'?[{visible:true}]:[];d.collections=[{visible:true,rows:[{text:'Synthetic collection first first-collection@harness.example.com',visible:true,leaves:[{text:'Synthetic collection first',visible:true},{text:'first-collection@harness.example.com',visible:true}],cells:[{text:'Synthetic collection first',visible:true},{text:'first-collection@harness.example.com',visible:true}]},{text:'Synthetic collection second second-collection@harness.example.com',visible:true,leaves:[{text:'Synthetic collection second',visible:true},{text:'second-collection@harness.example.com',visible:true}],cells:[{text:'Synthetic collection second',visible:true},{text:'second-collection@harness.example.com',visible:true}]}]}];}
  if(id==='radio-unselected'){radios(d,null);d.fieldGroups=[{id:'sodAdditionalRecipientsList_0_serveByPostOrEmail',labels:[{text:fault?'Served by (Optional)':'Served by',visible:true}]}];}
  if(id==='first-continue'){if(fault)d.cya=[{visible:true}];else d.errors=[{visible:true}];}
  if(id==='email-filled')emailForm(d);
  if(id==='email-selected'){
   radios(d,'email');
   if(shape==='conditional-email-complex'&&!fault){input(d,'emailName','','Name');input(d,'emailAddress','','Email address');d.emailLegends=[{text:'',visible:false}];d.emailComplexes=[{id:'sodAdditionalRecipientsList_0_emailInformation',visible:true,legends:[{text:'',visible:false}]}];}
  }
  if(id==='post-selected'){radios(d,'post');if(shape==='postal-recipient-name')input(d,'postalName','','Name');if(shape==='conditional-email-complex'&&fault&&pairs){input(d,'emailName','','Name');input(d,'emailAddress','','Email address');}}
  if(id==='email-returned')emailForm(d,false);
  if(id==='post-filled')postalForm(d,shape,fault,shape==='conditional-email-complex'?pairs:0);
  if(id==='cya'||id==='second-cya')d.cya=[{visible:true}];
  if(id==='selector-reopened')d.sourceText=[{text:fault?'Harness changed recipient selector':'Select additional recipients who needs to be served',visible:true,id:'selector-label',fieldId:'sodAdditionalRecipients'}];
  if(id==='line2-reopened'||id==='line2-filled')input(d,'AddressLine2',id==='line2-filled'?'Synthetic second line':'',fault?'Harness changed postal line two (Optional)':'Address Line 2 (Optional)');
  return{id,dom:d};
 });
 const responseIds=['bootstrap','user-details','case-opened','event-opened','submit',...(shape==='recipient-collection'&&!fault?['collection-reopened']:[]),...(shape==='case-field-recipient-selector'?['selector-reopened']:[]),...(shape==='optional-postal-line-two'?['line2-case-reopened','line2-event-reopened','second-submit']:[])];
 const ui={schemaVersion:3,kind:'source-shape-ui-observation',shape,actor:actor(actors.courtadmin),caseId,stages,responses:responseIds.map(id=>({id,status:['bootstrap','submit','second-submit'].includes(id)?201:200})),readbacks:shape==='recipient-collection'&&!fault?[{id:'collection-reopened',observation:structuredClone(after)}]:[]};
 const view='/internal/cases/'+caseId,start=view+'/event-triggers/serviceOfDocuments',submit='/cases/'+caseId+'/events',prefix='/caseworkers/'+actors.allowed+'/jurisdictions/HARNESS/case-types/HarnessNestedPRL';
 const requests=[['GET',prefix+'/event-triggers/create/token',200,actors.allowed],['POST',prefix+'/cases',201,actors.allowed],['GET',view,200,actors.courtadmin],['GET',start,200,actors.courtadmin],['POST',submit,201,actors.courtadmin],['GET',view,200,actors.courtadmin],...((shape==='recipient-collection'&&!fault||['case-field-recipient-selector','optional-postal-line-two'].includes(shape))?[['GET',view,200,actors.courtadmin]]:[]),...(shape==='optional-postal-line-two'?[['GET',start,200,actors.courtadmin],['POST',submit,201,actors.courtadmin],['GET',view,200,actors.courtadmin]]:[])].map(([method,upstreamPath,status,actorId])=>({method,upstreamPath,path:'/data'+upstreamPath,receivedPath:'/data'+upstreamPath,status,actorId,mutation:null}));
 return{shape,observation,ui,requests};
}
exports.shapeReplayFixture=(shape='recipient-collection',pairs=0)=>{
 if(!shapes.includes(shape)||![0,1].includes(pairs))throw Error('UNIT_SHAPE_SELECTION');
 const baselineActorIds=ids(100),selectedActorIds=ids(200);
 return{invocationId:'ccd-shape-'+shape,baselineActorIds,selectedActorIds,baseline:shapes.map((s,index)=>packet(s,false,baselineActorIds,index+1,0)),selected:packet(shape,true,selectedActorIds,7,pairs)};
};
