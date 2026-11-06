const assert=require('node:assert/strict');
const {test}=require('node:test');
const refs=['1700000000000001','1700000000000002','1700000000000003'];
function fixture(){
 const layout={case_type_id:'HarnessResultsPRL',fields:[{case_field_id:'applicantName',label:'Applicant name',order:1,metadata:false},{case_field_id:'[CREATED_DATE]',label:'Created',order:2,metadata:true},{case_field_id:'[STATE]',label:'State',order:3,metadata:true},{case_field_id:'caseSubmittedTimeStamp',label:'Submitted',order:4,metadata:false,sort_order:{direction:'DESC',priority:1}}]};
 const definition={case_fields:[{id:'applicantName',field_type:{id:'Text',type:'Text'}},{id:'caseSubmittedTimeStamp',field_type:{id:'DateTime',type:'DateTime'}}]};
 const rows=refs.map((reference,i)=>({reference,created_date:'2026-11-04T10:00:00.123000',state:'ResultsReady',data:{applicantName:`Synthetic ${i}`,caseSubmittedTimeStamp:`2026-01-0${i+1}T10:00:00.000`}}));
 const body={total:3,headers:[{metadata:{jurisdiction:'HARNESS',case_type_id:'HarnessResultsPRL'},cases:refs,fields:layout.fields.map(f=>({...f,case_field_type:f.case_field_id==='[STATE]'?{id:'FixedList-HarnessResultsPRL[STATE]',type:'FixedList',fixed_list_items:[{code:'ResultsReady',label:'Synthetic results ready',order:null}]}:['caseSubmittedTimeStamp','[CREATED_DATE]'].includes(f.case_field_id)?{id:'DateTime',type:'DateTime'}:{id:'Text',type:'Text'}}))}],cases:[...rows].reverse().map(row=>({case_id:row.reference,fields:{...row.data,'[CREATED_DATE]':'2026-11-04T10:00:00.123','[STATE]':row.state}}))};
 return {body,layout,definition,rows};
}
test('configured request cannot supply sort/source override or guessed case references',async()=>{
 const {resultCcdSearchBody}=await import('./lib/exui-result-ccd-search.mjs');const body=resultCcdSearchBody(refs);assert.deepEqual(body,{native_es_query:{query:{terms:{'reference.keyword':refs}},size:3,from:0}});assert.throws(()=>resultCcdSearchBody([refs[0],refs[0],refs[1]]));
});
test('validates associations and actual metadata types without claiming renderer behavior',async()=>{
 const {validateResultCcdSearch}=await import('./lib/exui-result-ccd-search.mjs');const f=fixture();const result=validateResultCcdSearch(f.body,f.layout,f.definition,f.rows,'WORKBASKET');assert.equal(result.columns[1].type.id,'DateTime');
});
for(const [name,change] of [
 ['foreign case',f=>f.body.cases[0].case_id='1700000000000009'],
 ['duplicate case',f=>f.body.cases[1]=f.body.cases[0]],
 ['wrong association',f=>f.body.cases[0].fields.applicantName='Synthetic 0'],
 ['default order reversed',f=>f.body.cases.reverse()],
 ['missing column',f=>f.body.headers[0].fields.pop()],
 ['wrong column label',f=>f.body.headers[0].fields[0].label='Other'],
 ['missing date type',f=>delete f.body.headers[0].fields[3].case_field_type],
 ['wrong date',f=>f.body.cases[0].fields['[CREATED_DATE]']='2026-11-04T11:00:00'],
 ['wrong state',f=>f.body.cases[0].fields['[STATE]']='other'],
 ['foreign header refs',f=>f.body.headers[0].cases=['foreign']],
])test(`rejects ${name}`,async()=>{const {validateResultCcdSearch}=await import('./lib/exui-result-ccd-search.mjs');const f=fixture();change(f);assert.throws(()=>validateResultCcdSearch(f.body,f.layout,f.definition,f.rows,'WORKBASKET'));});
test('SEARCH does not invent configured ordering',async()=>{const {validateResultCcdSearch}=await import('./lib/exui-result-ccd-search.mjs');const f=fixture();f.body.cases.reverse();assert.doesNotThrow(()=>validateResultCcdSearch(f.body,f.layout,f.definition,f.rows,'SEARCH'));});

for(const [name,change] of [
 ['created date downgraded to Text',f=>f.body.headers[0].fields[1].case_field_type={id:'Text',type:'Text'}],
 ['state downgraded to Text',f=>f.body.headers[0].fields[2].case_field_type={id:'Text',type:'Text'}],
 ['DateTime id with Text runtime type',f=>f.body.headers[0].fields[3].case_field_type.type='Text'],
 ['coherently changed imported and header type',f=>{f.definition.case_fields[1].field_type={id:'Text',type:'Text'};f.body.headers[0].fields[3].case_field_type={id:'Text',type:'Text'};}],
 ['state code changed',f=>f.body.headers[0].fields[2].case_field_type.fixed_list_items[0].code='Other'],
 ['state label changed',f=>f.body.headers[0].fields[2].case_field_type.fixed_list_items[0].label='Wrong label'],
 ['extra fixed item',f=>f.body.headers[0].fields[2].case_field_type.fixed_list_items.push({code:'Other',label:'Other',order:null})],
 ['missing fixed items',f=>delete f.body.headers[0].fields[2].case_field_type.fixed_list_items],
 ['fixed item order drift',f=>f.body.headers[0].fields[2].case_field_type.fixed_list_items[0].order=2],
])test(`independent type contract rejects ${name}`,async()=>{const {validateResultCcdSearch}=await import('./lib/exui-result-ccd-search.mjs');const f=fixture();change(f);assert.throws(()=>validateResultCcdSearch(f.body,f.layout,f.definition,f.rows,'WORKBASKET'));});

function mappedResponse(body) {
 // Sealed webapp3734 api/searchCases/index.ts: handleElasticSearchResponse.
 // The browser receives columns/results, not the CCD headers/cases envelope.
 return {columns:structuredClone(body.headers[0].fields),results:body.cases.map(({fields,fields_formatted,...rest})=>({...rest,case_fields:structuredClone(fields),case_fields_formatted:fields_formatted})),total:body.total};
}
for(const view of ['SEARCH','WORKBASKET'])test(`candidate type oracle validates the mapped ${view} envelope`,async()=>{
 const {validateResultCandidateColumns}=await import('./lib/exui-result-field-types.mjs');
 const f=fixture(),mapped=mappedResponse(f.body);
 assert.equal(mapped.headers,undefined);assert.equal(mapped.cases,undefined);
 assert.equal(mapped.results.length,3);assert.deepEqual(mapped.results[0].case_fields,f.body.cases[0].fields);
 assert.doesNotThrow(()=>validateResultCandidateColumns(mapped,f.body.headers[0].fields));
});
for(const [name,change] of [
 ['backend envelope',(mapped,f)=>Object.assign(mapped,{columns:undefined,headers:f.body.headers})],
 ['missing column',mapped=>mapped.columns.pop()],
 ['duplicate column',mapped=>mapped.columns[1]=structuredClone(mapped.columns[0])],
 ['wrong label',mapped=>mapped.columns[0].label='Other'],
 ['wrong order',mapped=>mapped.columns[0].order=9],
 ['wrong metadata binding',mapped=>mapped.columns[1].metadata=false],
 ['created date downgraded to Text',mapped=>mapped.columns[1].case_field_type={id:'Text',type:'Text'}],
 ['state label drift',mapped=>mapped.columns[2].case_field_type.fixed_list_items[0].label='Other'],
 ['coherent expected and mapped type drift',(mapped,f)=>{mapped.columns[3].case_field_type={id:'Text',type:'Text'};f.body.headers[0].fields[3].case_field_type={id:'Text',type:'Text'};}],
])test(`mapped candidate oracle rejects ${name}`,async()=>{
 const {validateResultCandidateColumns}=await import('./lib/exui-result-field-types.mjs');const f=fixture(),mapped=mappedResponse(f.body);change(mapped,f);
 assert.throws(()=>validateResultCandidateColumns(mapped,f.body.headers[0].fields));
});
