const test=require('node:test'),assert=require('node:assert/strict');
const load=()=>import('./lib/exui-event-v3-source-shape-observations.mjs');
test('independent six-shape replay is available without a caller oracle',async()=>{assert.equal(typeof(await load()).replayEventV3SourceShapeObservations,'function');});
const {shapeReplayFixture}=require('./fixtures/exui-event-v3-source-shape-observations.mock.cjs');
const shapes=['recipient-collection','case-field-recipient-selector','required-delivery-radio','conditional-email-complex','postal-recipient-name','optional-postal-line-two'];
const replay=async input=>(await load()).replayEventV3SourceShapeObservations(input);
for(const shape of shapes)test('six healthy source shapes and intended '+shape+' fault replay without authority',async()=>{
 const input=shapeReplayFixture(shape),value=await replay(input);assert.equal(value.baselineShapes,6);assert.equal(value.selectedFaults,1);assert.equal(value.selectedShape,shape);
 for(const key of ['semanticReplay','sourceComplete','nativeAuthority','nativeRuntimeAcceptance','runtimeAcceptance','catalogueCredit','releaseCredit','releaseApproval','promotionAllowed'])assert.equal(value[key],false);
 assert(!JSON.stringify(value).includes('@harness'));assert(!JSON.stringify(value).includes(input.selectedActorIds.courtadmin));
});
const stage=(packet,id)=>packet.ui.stages.find(row=>row.id===id).dom;
const invalid=/^Error: EVENT_V3_SOURCE_SHAPE_OBSERVATION_INVALID$/;
async function reject(shape,change,pairs=0){const input=shapeReplayFixture(shape,pairs);await replay(input);change(input);await assert.rejects(()=>replay(input),invalid);}
test('conditional email fault permits independently observed zero OR one pair and ties exactly the measured fill to persistence',async()=>{
 await replay(shapeReplayFixture('conditional-email-complex',0));await replay(shapeReplayFixture('conditional-email-complex',1));
 for(const change of [
  x=>{const d=stage(x.selected,'email-selected');d.fields.emailName.push({...stage(x.selected,'post-filled').fields.emailName[0]});d.order.push({field:'emailName',id:d.fields.emailName[0].id});},
  x=>stage(x.selected,'post-selected').fields.emailAddress=[],
  x=>{const d=stage(x.selected,'post-selected');for(const key of ['emailName','emailAddress']){const row={...d.fields[key][0],id:d.fields[key][0].id.replace('_0_','_1_')};d.fields[key].push(row);d.order.push({field:key,id:row.id});}},
  x=>x.selected.observation.after.state.case_data.sodAdditionalRecipientsList[0].value.emailInformation.emailAddress='wrong@harness.example.com',
  x=>stage(x.selected,'post-filled').fields.emailName[0].value='wrong name',
 ])await reject('conditional-email-complex',change,1);
 await reject('conditional-email-complex',x=>{x.selected.observation.after.state.case_data.sodAdditionalRecipientsList[0].value.emailInformation={emailName:'Synthetic fault email recipient',emailAddress:'fault-recipient@harness.example.com'};},0);
});
for(const shape of shapes)test('coherent wrong '+shape+' source data/label cannot borrow a recorded verdict',async()=>{
 await reject(shape,x=>{
  const p=x.selected;p.observation.contractSatisfied=true;
  if(shape==='recipient-collection')p.observation.after.state.case_data.sodAdditionalRecipientsList.emailInformation.emailName='wrong name';
  else if(shape==='case-field-recipient-selector')stage(p,'selector-reopened').sourceText[0].text='Select additional recipients who needs to be served';
  else if(shape==='required-delivery-radio')p.observation.after.state.case_data.sodAdditionalRecipientsList=[{id:'12345678-1234-4234-8234-000000009999',value:{serveByPostOrEmail:'email',emailInformation:{emailName:'wrong',emailAddress:'wrong'}}}];
  else if(shape==='conditional-email-complex')p.observation.after.state.case_data.sodAdditionalRecipientsList[0].value.postalInformation.postalAddress.Country='wrong country';
  else if(shape==='postal-recipient-name'){stage(p,'post-filled').fields.postalName[0].labels=['Name'];stage(p,'post-filled').fields.postalName[0].accessibleName='Name';stage(p,'post-filled').fields.AddressLine2[0].labels=['Harness changed postal recipient name'];stage(p,'post-filled').fields.AddressLine2[0].accessibleName='Harness changed postal recipient name';}
  else{p.observation.postalLabel='Address Line 2 (Optional)';stage(p,'post-filled').fields.AddressLine2[0].labels=['Address Line 2 (Optional)'];stage(p,'post-filled').fields.AddressLine2[0].accessibleName='Address Line 2 (Optional)';stage(p,'line2-reopened').fields.AddressLine2[0].labels=['Address Line 2 (Optional)'];stage(p,'line2-reopened').fields.AddressLine2[0].accessibleName='Address Line 2 (Optional)';}
 });
});
test('literal baseline invariants reject missing controls, hidden/foreign labels, wrong order, legend and rows',async()=>{
 const changes=[
  x=>stage(x.baseline[0],'case-opened').control=[],
  x=>{const d=stage(x.baseline[2],'email-filled');d.order.reverse();},
  x=>{const row=stage(x.baseline[2],'email-filled').fields.emailName[0];row.ariaLabel='Foreign accessible name';row.accessibleName='Foreign accessible name';},
  x=>stage(x.baseline[1],'selector-reopened').sourceText[0].fieldId='sodAdditionalRecipientsList_0_postalName',
  x=>stage(x.baseline[1],'selector-reopened').sourceText[0].visible=false,
  x=>stage(x.baseline[2],'radio-unselected').fields.email[0].checked=true,
  x=>stage(x.baseline[2],'first-continue').cya=[{visible:true}],
  x=>stage(x.baseline[2],'first-continue').errors=[],
  x=>stage(x.baseline[3],'email-selected').emailLegends[0].text='Nonblank label',
  x=>stage(x.baseline[3],'post-selected').fields.emailName.push({...stage(x.baseline[3],'email-selected').fields.emailName[0]}),
  x=>{const row=stage(x.baseline[4],'post-filled').fields.postalName[0];row.visible=false;row.accessibleRole=null;row.accessibleName=null;},
  x=>stage(x.baseline[0],'collection-cya').collections[0].rows.reverse(),
  x=>stage(x.baseline[0],'collection-reopened').collections[0].rows[0].leaves.push({text:'Synthetic collection second',visible:false}),
  x=>x.baseline[0].observation.after.state.case_data.sodAdditionalRecipientsList[1].id=x.baseline[0].observation.after.state.case_data.sodAdditionalRecipientsList[0].id,
 ];for(const change of changes)await reject('recipient-collection',change);
});
test('independent collection reopen and two real Line2 observations preserve data, recipient identity, versions and history',async()=>{
 await reject('recipient-collection',x=>x.baseline[0].ui.readbacks[0].observation=x.baseline[0].observation.before);
 await reject('recipient-collection',x=>x.baseline[0].ui.readbacks=[]);
 for(const change of [
  p=>p.observation.filledObservation=p.observation.after,
  p=>p.observation.filledObservation.state.case_data.sodAdditionalRecipientsList[0].id='12345678-1234-4234-8234-000000009999',
  p=>p.observation.filledObservation.state.case_data.sodAdditionalRecipientsList[0].value.postalInformation.postalAddress.Country='foreign',
  p=>p.observation.filledObservation.state.version++,p=>p.observation.filledObservation.history.pop(),
  p=>stage(p,'line2-reopened').fields.AddressLine2[0].value='already filled',
  p=>stage(p,'line2-filled').fields.AddressLine2[0].value='wrong second line',
  p=>stage(p,'second-cya').cya=[],
 ])await reject('optional-postal-line-two',x=>change(x.selected));
});
test('minimal held identities, actual actor aliases, exact stage membership and observed response statuses are mandatory',async()=>{
 for(const change of [
  x=>x.baseline.pop(),x=>x.baseline[0].shape='unknown',x=>x.selected.shape='postal-recipient-name',x=>x.invocationId='ccd-remove-courtadmin-event-create',
  x=>x.baselineActorIds.courtadmin=x.baselineActorIds.allowed,x=>x.baselineActorIds.extra='private-canary',
  x=>x.selected.observation.actor.uid='foreign',x=>x.selected.observation.actor.roles.push('admin'),x=>x.selected.ui.actor.extra='private-canary',
  x=>x.selected.ui.actor.id=x.baselineActorIds.courtadmin,x=>x.selected.ui.caseId='0000000000000000',
  x=>x.selected.ui.stages.reverse(),x=>x.selected.ui.stages.pop(),x=>x.selected.ui.stages.push(x.selected.ui.stages[0]),
  x=>x.selected.ui.responses.pop(),x=>x.selected.ui.responses[4].status=500,x=>x.selected.ui.responses[0].status=200,
  x=>x.selected.ui.stages[0].dom.rawError='private-canary',x=>x.selected.observation.after.state.case_data.protectedValue='foreign',
  x=>x.selected.observation.after.history[0].user_id='foreign',x=>x.selected.observation.after.history[1].created_date='changed',
 ])await reject('recipient-collection',change);
});
test('case-scoped actual journals require exact actor/status/mutation, bounded sequence and separate allowed bootstrap',async()=>{
 for(const change of [
  p=>p.requests.pop(),p=>p.requests[2].actorId='foreign',p=>p.requests[3].status=404,p=>p.requests[4].mutation='unrelated-mutation',
  p=>{[p.requests[2],p.requests[3]]=[p.requests[3],p.requests[2]];},p=>p.requests.push(p.requests[4]),p=>p.requests[0].status=403,p=>p.requests[1].actorId='foreign',
  p=>p.requests[0].headers={Authorization:'private-canary'},
 ])await reject('recipient-collection',x=>change(x.selected));
 await reject('optional-postal-line-two',x=>x.selected.requests.pop());
 await reject('optional-postal-line-two',x=>{const r=x.selected.requests;[r[5],r[7]]=[r[7],r[5]];});
});
test('baseline case uniqueness is intra-namespace; separately bound selected namespace may legitimately reuse an ID',async()=>{
 const x=shapeReplayFixture('recipient-collection'),p=x.selected,old=p.observation.caseId,id=x.baseline[0].observation.caseId;
 p.observation.caseId=id;p.observation.before.state.id=Number(id);p.observation.after.state.id=Number(id);p.ui.caseId=id;
 for(const row of p.requests){row.upstreamPath=row.upstreamPath.replaceAll(old,id);row.path=row.path.replaceAll(old,id);row.receivedPath=row.receivedPath.replaceAll(old,id);}await replay(x);
 await reject('recipient-collection',x=>{const p=x.baseline[1],old=p.observation.caseId,id=x.baseline[0].observation.caseId;p.observation.caseId=id;p.observation.before.state.id=Number(id);p.observation.after.state.id=Number(id);p.ui.caseId=id;for(const row of p.requests){row.upstreamPath=row.upstreamPath.replaceAll(old,id);row.path=row.path.replaceAll(old,id);row.receivedPath=row.receivedPath.replaceAll(old,id);}});
});
test('verdict booleans cannot supply the oracle; unsafe empty branches and callable expectations never pass',async()=>{
 const x=shapeReplayFixture('recipient-collection');for(const p of [...x.baseline,x.selected])p.observation.contractSatisfied=!p.observation.contractSatisfied;await replay(x);
 await reject('recipient-collection',x=>x.selected.observation.after.state.case_data.sodAdditionalRecipientsList.postalInformation={postalName:null,postalAddress:{UnknownEmpty:null}});
 await reject('recipient-collection',x=>x.selected.observation.after.state.case_data.sodAdditionalRecipientsList.emailInformation.extra=null);
 await reject('recipient-collection',x=>x.expected=()=>true);
 for(const value of [undefined,NaN,Infinity,1n])await assert.rejects(()=>replay({...shapeReplayFixture(),unexpected:value}),invalid);
});

test('postal-name visibility and accessible name cannot be proved by a Line2 label or later filled data',async()=>{
 await reject('postal-recipient-name',x=>{const row=stage(x.selected,'post-selected').fields.postalName[0];row.visible=false;row.accessibleRole=null;row.accessibleName=null;});
 await reject('postal-recipient-name',x=>{const row=stage(x.selected,'post-filled').fields.postalName[0];row.labels=['Name'];row.accessibleName='Name';});
});
test('source-supported blank Line2 serialization is finite and unrelated empty fields remain rejected',async()=>{
 for(const blank of ['',null,'omit']){
  const x=shapeReplayFixture('optional-postal-line-two');for(const p of [x.baseline[5],x.selected]){const a=p.observation.after.state.case_data.sodAdditionalRecipientsList[0].value.postalInformation.postalAddress;if(blank==='omit')delete a.AddressLine2;else a.AddressLine2=blank;}await replay(x);
 }
 await reject('optional-postal-line-two',x=>x.selected.observation.after.state.case_data.sodAdditionalRecipientsList[0].value.postalInformation.postalAddress.AddressLine2={empty:null});
});
test('shared baseline journals and arbitrary unrelated-case scheduling do not create a global order oracle',async()=>{
 const x=shapeReplayFixture('required-delivery-radio'),prefixes=x.baseline.flatMap(p=>p.requests.slice(0,2)),tail=[];
 for(let ordinal=2;ordinal<Math.max(...x.baseline.map(p=>p.requests.length));ordinal++)for(const p of [...x.baseline].reverse())if(p.requests[ordinal])tail.push(p.requests[ordinal]);
 const journal=[...prefixes,...tail];for(const p of x.baseline)p.requests=structuredClone(journal);x.baseline.reverse();
 const before=structuredClone(x);await replay(x);assert.deepEqual(x,before);
});

test('strict source locators cannot borrow one valid marker among ambiguous duplicate controls or labels',async()=>{
 await reject('recipient-collection',x=>stage(x.selected,'singular-cya').sourceText.push({...stage(x.selected,'singular-cya').sourceText[0],fieldId:null}));
 await reject('recipient-collection',x=>stage(x.selected,'case-opened').control.push({visible:false}));
 await reject('case-field-recipient-selector',x=>stage(x.selected,'selector-reopened').sourceText.push({...stage(x.selected,'selector-reopened').sourceText[0],fieldId:null}));
 await reject('required-delivery-radio',x=>stage(x.selected,'radio-unselected').fieldGroups[0].labels.push({...stage(x.selected,'radio-unselected').fieldGroups[0].labels[0]}));
});

test('schema3 email container count/identity is independent of zero, one or several blank direct legends',async()=>{
 for(const legends of [[],[{text:'',visible:false}],[{text:'',visible:false},{text:'',visible:true}]]){
  const x=shapeReplayFixture(),d=stage(x.baseline[3],'email-selected');d.emailLegends=structuredClone(legends);d.emailComplexes[0].legends=structuredClone(legends);await replay(x);
 }
 for(const change of [
  d=>d.emailComplexes=[],d=>d.emailComplexes.push({...d.emailComplexes[0]}),d=>d.emailComplexes[0].id='foreign_emailInformation',
  d=>{d.emailLegends[0].text='wrong';d.emailComplexes[0].legends[0].text='wrong';},
  d=>d.emailComplexes[0].legends=[],
 ])await reject('recipient-collection',x=>change(stage(x.baseline[3],'email-selected')));
});
test('collection oracle uses exact visible row markers, rejects hidden cross-row matches and never borrows aggregate substrings',async()=>{
 const x=shapeReplayFixture(),d=stage(x.baseline[0],'collection-cya');d.collections[0].rows[0].leaves.push({text:'Aggregate labels Synthetic collection first first-collection@harness.example.com',visible:true});await replay(x);
 for(const change of [
  row=>row.leaves[0].text+=' suffix',row=>row.leaves[1].visible=false,
  row=>row.leaves.push({text:'Synthetic collection second',visible:false}),row=>row.leaves.push({...row.leaves[0]}),
  row=>delete row.leaves,
 ])await reject('recipient-collection',x=>change(stage(x.baseline[0],'collection-cya').collections[0].rows[0]));
});
test('old incomplete receipt schema and absent required complex measurements cannot be promoted by a passing verdict',async()=>{
 await reject('recipient-collection',x=>{for(const p of x.baseline)p.ui.schemaVersion=1;});
 await reject('recipient-collection',x=>delete stage(x.baseline[3],'email-selected').emailComplexes);
});
test('coherent second complex and rendered email suffix do not bypass exact source UI contracts',async()=>{
 await reject('recipient-collection',x=>{const d=stage(x.baseline[3],'email-selected');d.emailComplexes.push({...structuredClone(d.emailComplexes[0]),id:'sodAdditionalRecipientsList_1_emailInformation'});d.emailLegends.push(...structuredClone(d.emailComplexes[0].legends));});
 await reject('recipient-collection',x=>stage(x.baseline[0],'collection-cya').collections[0].rows[0].leaves[1].text+=' suffix');
});

test('source singular collection fault finishes at its actual submit, with no invented reopen',async()=>{
 const x=shapeReplayFixture('recipient-collection');assert.equal(x.selected.requests.at(-2).method,'POST');assert.equal(x.selected.requests.at(-1).upstreamPath,'/internal/cases/'+x.selected.observation.caseId);await replay(x);
});
test('source required and conditional email name assertions use unanchored Name regex',async()=>{
 for(const index of [2,3]){
  const x=shapeReplayFixture('required-delivery-radio'),id=index===2?'email-filled':'email-returned';stage(x.baseline[index],id).fields.emailName[0].ariaLabel='Recipient Name';stage(x.baseline[index],id).fields.emailName[0].accessibleName='Recipient Name';await replay(x);
 }
});
test('source case-field selector fill does not invent email-name label or control-order assertions',async()=>{
 const x=shapeReplayFixture('case-field-recipient-selector');for(const p of [x.baseline[1],x.selected]){const d=stage(p,'email-filled');d.fields.emailName[0].ariaLabel='Recipient contact';d.fields.emailName[0].accessibleName='Recipient contact';d.order.reverse();}await replay(x);
});
test('source post-channel shape branches only assert postal-name labels for the postal-name shape',async()=>{
 for(const selected of ['conditional-email-complex','optional-postal-line-two']){
  const x=shapeReplayFixture(selected);stage(x.selected,'post-filled').fields.postalName[0].ariaLabel='Recipient contact';stage(x.selected,'post-filled').fields.postalName[0].accessibleName='Recipient contact';await replay(x);
 }
 await reject('postal-recipient-name',x=>{const row=stage(x.baseline[4],'post-filled').fields.postalName[0];row.ariaLabel='Recipient Name';row.accessibleName='Recipient Name';});
});

test('literal six-journey source matrix distinguishes the singular early return and Line2 second write',()=>{
 const expected={
  'recipient-collection':[['view','start','submit','view','view'],['view','start','submit','view']],
  'case-field-recipient-selector':[['view','start','submit','view','view'],['view','start','submit','view','view']],
  'required-delivery-radio':[['view','start','submit','view'],['view','start','submit','view']],
  'conditional-email-complex':[['view','start','submit','view'],['view','start','submit','view']],
  'postal-recipient-name':[['view','start','submit','view'],['view','start','submit','view']],
  'optional-postal-line-two':[['view','start','submit','view','view','start','submit','view'],['view','start','submit','view','view','start','submit','view']],
 };
 for(const [shape,flows]of Object.entries(expected)){const x=shapeReplayFixture(shape),baseline=x.baseline.find(p=>p.shape===shape);for(const [index,p]of [baseline,x.selected].entries()){
  const actual=p.requests.slice(2).map(row=>row.method==='POST'?'submit':row.upstreamPath.endsWith('/event-triggers/serviceOfDocuments')?'start':'view');assert.deepEqual(actual,flows[index]);
 }}
});

test('browser-computed name controls assertions, never aria-label/textContent reconstruction',async()=>{
 await reject('required-delivery-radio',x=>{const r=stage(x.baseline[2],'email-filled').fields.emailName[0];r.ariaLabel='Name';r.labelledBy=[{id:'actual-source-label',text:'Unrelated recipient'}];r.accessibleName='Unrelated recipient';});
 for(const computed of ['Hidden reference Name','Computed Name','Name "quoted" \\slash']){
  const x=shapeReplayFixture('required-delivery-radio'),r=stage(x.baseline[2],'email-filled').fields.emailName[0];r.ariaLabel='Fallback';r.labelledBy=[{id:'reference',text:'Raw text differs from computed accessible name'}];r.accessibleName=computed;await replay(x);
 }
 for(const change of [r=>r.accessibleRole='button',r=>r.accessibleName=null,r=>delete r.accessibleName])await reject('required-delivery-radio',x=>change(stage(x.baseline[2],'email-filled').fields.emailName[0]));
});
test('schema1 and schema2 cannot bypass required actual computed names',async()=>{for(const version of [1,2])await reject('required-delivery-radio',x=>{for(const p of [...x.baseline,x.selected])p.ui.schemaVersion=version;});});

test('post-save navigation GETs preserve exact write causality and authenticated status',async()=>{
 for(const change of [
  p=>{p.requests[5].status=403;},p=>{p.requests[5].actorId='foreign';},p=>{p.requests[5].mutation='foreign';},
  p=>{p.requests.splice(3,1);},p=>{p.requests.push(structuredClone(p.requests[4]));},
  p=>{[p.requests[3],p.requests[4]]=[p.requests[4],p.requests[3]];},
  p=>{const rows=p.requests.splice(4,2);p.requests.splice(2,0,...rows);},
 ])await reject('required-delivery-radio',x=>change(x.selected));
});

test('radio channel identity uses pinned code suffix, computed role/name and actual checked state, never raw DOM value',async()=>{
 const x=shapeReplayFixture('required-delivery-radio');for(const p of [...x.baseline,x.selected])for(const s of p.ui.stages)for(const field of ['email','post'])for(const row of s.dom.fields[field])row.value='on';await replay(x);
 for(const change of [r=>r.id=r.id.replace('-email','-foreign'),r=>r.accessibleRole='textbox',r=>r.accessibleName='Post',r=>r.checked=false])await reject('required-delivery-radio',p=>change(stage(p.baseline[2],'email-filled').fields.email[0]));
 await reject('required-delivery-radio',p=>{stage(p.baseline[2],'email-filled').fields.email=[];});
});

test('radio pairs and required display-context group cannot be borrowed from another recipient row',async()=>{
 const move=(d,field)=>{const row=d.fields[field][0],old=row.id;row.id=old.replace('_0_serve','_1_serve');d.order.find(r=>r.id===old).id=row.id;};
 for(const stageId of ['email-filled','radio-unselected'])await reject('required-delivery-radio',x=>move(stage(x.baseline[2],stageId),'post'));
 await reject('required-delivery-radio',x=>{const d=stage(x.baseline[2],'email-filled');move(d,'email');move(d,'post');for(const g of d.fieldGroups)g.id=g.id.replace('_0_serve','_1_serve');});
 await reject('required-delivery-radio',x=>{const d=stage(x.baseline[2],'radio-unselected');d.fieldGroups[0].id=d.fieldGroups[0].id.replace('_0_serve','_1_serve');});
 for(const change of [d=>d.fields.post=[],d=>d.fields.post.push(structuredClone(d.fields.post[0])),d=>d.fieldGroups=[],d=>d.fieldGroups.push(structuredClone(d.fieldGroups[0]))])await reject('required-delivery-radio',x=>change(stage(x.baseline[2],'radio-unselected')));
});

test('both moved radios cannot borrow the old group, while two collection radio groups remain independent',async()=>{
 const x=shapeReplayFixture('required-delivery-radio'),d=stage(x.baseline[2],'radio-unselected');
 for(const field of ['email','post']){const old=d.fields[field][0].id;d.fields[field][0].id=old.replace('_0_serve','_1_serve');d.order.find(r=>r.id===old).id=d.fields[field][0].id;}
 await assert.rejects(()=>replay(x));
 const healthy=shapeReplayFixture('recipient-collection'),source=stage(healthy.baseline[2],'radio-unselected'),target=stage(healthy.baseline[0],'collection-reopened');
 for(const index of [0,1]){for(const field of ['email','post']){const row=structuredClone(source.fields[field][0]);row.id=row.id.replace('_0_serve','_'+index+'_serve');target.fields[field].push(row);target.order.push({field,id:row.id});}const group=structuredClone(source.fieldGroups[0]);group.id=group.id.replace('_0_serve','_'+index+'_serve');target.fieldGroups.push(group);}
 await replay(healthy);
});
