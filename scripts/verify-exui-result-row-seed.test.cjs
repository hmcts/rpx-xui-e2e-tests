const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const refs = ['1700000000000001','1700000000000002','1700000000000003'];
const index = 'harnessresultsprl_cases-000001';
const aliases = {[index]:{aliases:{harnessresultsprl_cases:{is_write_index:true}}}};
const mappings = {[index]:{mappings:{properties:{id:{type:'long'},reference:{type:'text'},data:{properties:{dateSubmitted:{type:'date'},caseSubmittedTimeStamp:{type:'date'}}}}}}};
async function rows() {
 const {resultSeedCases} = await import('./lib/exui-result-row-seed.mjs');
 return refs.map((reference,i)=>({id:String(i+1),reference,case_type_id:'HarnessResultsPRL',jurisdiction:'HARNESS',state:'created',created_date:'2026-11-04T10:23:45',last_modified:'2026-11-04T10:23:46',last_state_modified_date:'2026-11-04T10:23:45',data:structuredClone(resultSeedCases[i]),data_classification:{applicantName:'PUBLIC'},security_classification:'PUBLIC',supplementary_data:null}));
}
for(const [name,change] of [
 ['missing row',r=>r.pop()],['duplicate row',r=>r[1]=r[0]],['foreign reference',r=>r[0].reference='1700000000000009'],['foreign case type',r=>r[0].case_type_id='PRLAPPS'],['foreign jurisdiction',r=>r[0].jurisdiction='PRIVATELAW'],['duplicate SQL id',r=>r[1].id=r[0].id],['missing security',r=>delete r[0].security_classification],['global clone',r=>r[0].data.SearchCriteria={}],
]) test(`row ownership rejects ${name}`,async()=>{const {validateResultSeedRows}=await import('./lib/exui-result-row-seed.mjs');const r=await rows();change(r);assert.throws(()=>validateResultSeedRows(r,refs));});
test('SQL projection preserves persisted metadata and constrains only returned refs',async()=>{
 const {readResultSeedRows,validateResultSeedRows}=await import('./lib/exui-result-row-seed.mjs');const expected=await rows();let sql;
 const actual=readResultSeedRows({namespace:'owned'},refs,(args,input)=>{assert(args.includes('ccd_data'));sql=input;return JSON.stringify(expected)});
 assert.deepEqual(validateResultSeedRows(actual,refs),expected);assert(sql.includes('BEGIN READ ONLY'));assert(sql.includes(`reference IN (${refs.join(',')})`));assert(!sql.includes('UPDATE'));
 for(const invalid of [[...refs.slice(0,2),refs[0]],['1); DROP TABLE case_data',...refs.slice(1)]])assert.throws(()=>readResultSeedRows({},invalid,()=>assert.fail('must not execute SQL')));
});
test('mapping rejects multiple/foreign index and changed date type',async()=>{
 const {resultSeedIndex}=await import('./lib/exui-result-row-seed.mjs');assert.equal(resultSeedIndex(aliases,mappings),index);
 assert.throws(()=>resultSeedIndex({...aliases,foreign:aliases[index]},mappings));
 const changed=structuredClone(mappings);changed[index].mappings.properties.data.properties.dateSubmitted.type='text';assert.throws(()=>resultSeedIndex(aliases,changed));
});
async function setup(t,failWrite=false, referenceTransform=value=>value){
 const runtime=await import('./lib/exui-ccd-runtime.mjs');const output=fs.mkdtempSync(path.join(os.tmpdir(),'result-seed-test-'));t.after(()=>fs.rmSync(output,{recursive:true,force:true}));
 const pins=runtime.ccdImagePins('linux/arm64',{elasticsearch:true});
 const state={output,owner:'harness-seed-test',namespace:'a'.repeat(64),elasticsearch:true,images:Object.fromEntries(Object.entries(pins).map(([name,pin])=>[name,{id:pin.configDigest??pin.manifestDigest,architecture:'arm64',repoDigests:[pin.reference]}])),containers:Object.fromEntries(Object.keys(pins).map(name=>[name,name==='database'?'a'.repeat(64):name]))};
 const images=runtime.ccdRuntimeImageIds(state);const inspectContainer=id=>{const service=Object.keys(state.containers).find(key=>state.containers[key]===id);return {Image:images[service],Config:{Labels:{'exui.harness.owner':state.owner,'exui.harness.service':service}},HostConfig:{NetworkMode:service==='database'?'none':`container:${state.namespace}`},State:{Running:true}}};
 let creates=0;const writes=[];const persisted=await rows();
 const request=(_state,_port,route,options={})=>{
  if(route==='/testing-support/accounts')return {status:201};
  if(route==='/o/token')return {status:200,body:{access_token:'synthetic-token'}};
  if(route==='/details')return {status:200,body:{id:'observer'}};
  if(route==='/testing-support/lease')return {status:200,body:'synthetic-token'};
  if(route.startsWith('/_alias/'))return {status:200,body:aliases};
  if(route.endsWith('/_mapping'))return {status:200,body:mappings};
  if(route.endsWith('/token'))return {status:200,body:{token:'synthetic-create-token'}};
  if(route.endsWith('/cases'))return {status:201,body:{id:referenceTransform(refs[creates++])}};
  if(route.includes('/_create/')){writes.push({route,body:options.body});return {status:failWrite?503:201,body:{_index:index,_id:options.body.id}};}
  if(route.endsWith('/_search'))return {status:200,body:{timed_out:false,_shards:{failed:0},hits:{total:{value:3,relation:'eq'},hits:persisted.map(row=>({_index:index,_id:row.id,_source:row}))}}};
  if(route.includes('/_doc/'))return {status:200,body:{found:true,_source:persisted.find(row=>row.id===route.split('/').at(-1))}};
  throw Error('unexpected test route');
 };
 return {state,request,inspectContainer,readRows:()=>persisted,writes};
}
test('actual API sequence seeds only persisted rows using SQL IDs, never reference IDs, and grants no credit',async t=>{
 const {seedResultRows}=await import('./lib/exui-result-row-seed.mjs');const run=await setup(t);const receipt=seedResultRows(run.state,run);
 assert.equal(receipt.status,'persisted-rows-indexed');assert.equal(receipt.runtimeAcceptance,false);assert.equal(receipt.catalogueCredit,false);
 assert.equal(run.writes.length,3);assert(run.writes.every(w=>w.route.includes('require_alias=true')));assert.deepEqual(run.writes.map(w=>w.body),await rows());
 assert.throws(()=>seedResultRows(run.state,run));assert.equal(run.writes.length,3);
});
test('ES failure leaves owned refs in private failed receipt without acceptance',async t=>{
 const {seedResultRows}=await import('./lib/exui-result-row-seed.mjs');const run=await setup(t,true);assert.throws(()=>seedResultRows(run.state,run),/RESULT_SEED_FEASIBILITY_FAILED/);
 const receipt=JSON.parse(fs.readFileSync(path.join(run.state.output,'result-row-seed/receipt.json')));assert.deepEqual(receipt.references,refs);assert.equal(receipt.status,'failed');assert.equal(receipt.releaseCredit,false);assert.equal(run.writes.length,1);
});

test('safe numeric CCD references canonicalize without precision loss',async t=>{
 const {seedResultRows}=await import('./lib/exui-result-row-seed.mjs');const run=await setup(t,false,Number);assert.deepEqual(seedResultRows(run.state,run).references,refs);
});
test('unsafe numeric CCD references cannot reach SQL or Elasticsearch',async t=>{
 const {seedResultRows}=await import('./lib/exui-result-row-seed.mjs');const run=await setup(t,false,()=>9007199254740992);run.readRows=()=>assert.fail('must not read SQL');assert.throws(()=>seedResultRows(run.state,run),/RESULT_SEED_FEASIBILITY_FAILED/);assert.equal(run.writes.length,0);
});
