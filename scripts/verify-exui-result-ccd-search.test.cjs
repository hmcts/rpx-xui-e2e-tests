const assert=require('node:assert/strict');
const {test}=require('node:test');
const refs=['1700000000000001','1700000000000002','1700000000000003'];
function fixture(){
 const layout={case_type_id:'HarnessResultsPRL',fields:[{case_field_id:'applicantName',label:'Applicant name',order:1,metadata:false},{case_field_id:'[CREATED_DATE]',label:'Created',order:2,metadata:true},{case_field_id:'[STATE]',label:'State',order:3,metadata:true},{case_field_id:'caseSubmittedTimeStamp',label:'Submitted',order:4,metadata:false,sort_order:{direction:'DESC',priority:1}}]};
 const definition={case_fields:[{id:'applicantName',field_type:{id:'Text'}},{id:'caseSubmittedTimeStamp',field_type:{id:'DateTime'}}]};
 const rows=refs.map((reference,i)=>({reference,created_date:'2026-11-04T10:00:00.123000',state:'created',data:{applicantName:`Synthetic ${i}`,caseSubmittedTimeStamp:`2026-01-0${i+1}T10:00:00.000`}}));
 const body={total:3,headers:[{metadata:{jurisdiction:'HARNESS',case_type_id:'HarnessResultsPRL'},cases:refs,fields:layout.fields.map(f=>({...f,case_field_type:{id:f.case_field_id==='caseSubmittedTimeStamp'?'DateTime':'Text'}}))}],cases:[...rows].reverse().map(row=>({case_id:row.reference,fields:{...row.data,'[CREATED_DATE]':'2026-11-04T10:00:00.123','[STATE]':row.state}}))};
 return {body,layout,definition,rows};
}
test('configured request cannot supply sort/source override or guessed case references',async()=>{
 const {resultCcdSearchBody}=await import('./lib/exui-result-ccd-search.mjs');const body=resultCcdSearchBody(refs);assert.deepEqual(body,{native_es_query:{query:{terms:{'reference.keyword':refs}},size:3,from:0}});assert.throws(()=>resultCcdSearchBody([refs[0],refs[0],refs[1]]));
});
test('validates associations and actual metadata types without claiming renderer behavior',async()=>{
 const {validateResultCcdSearch}=await import('./lib/exui-result-ccd-search.mjs');const f=fixture();const result=validateResultCcdSearch(f.body,f.layout,f.definition,f.rows,'WORKBASKET');assert.equal(result.columns[1].type.id,'Text');
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
