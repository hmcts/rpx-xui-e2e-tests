const assert=require('node:assert/strict');
const {test}=require('node:test');
const mock=require('./fixtures/exui-complex-email-mapping.mock.cjs');

test('mapping proof detects only the one source-cell effect after both healthy controls',async()=>{
 const {validateComplexEmailMapping,compareComplexEmailMappings}=await import('./lib/exui-complex-email-mapping.mjs');
 const baseline=validateComplexEmailMapping(mock.observed(),'baseline');
 const fault=validateComplexEmailMapping(mock.observed('searchable'),'searchable');
 assert.equal(compareComplexEmailMappings(baseline,fault).faultEffective,true);
 assert.throws(()=>validateComplexEmailMapping(mock.observed('searchable'),'baseline'),/COMPLEX_MAPPING_SOURCE_N/);
 for(const change of [x=>delete x.mapping.harnessnestedprl_cases['mappings'],x=>x.alias.foreign=x.alias.harnessnestedprl_cases]) {
  const value=mock.observed('searchable','harnessnestedprl_cases');change(value);
  assert.throws(()=>validateComplexEmailMapping(value,'searchable'));
 }
 const wrong=mock.observed('searchable');wrong.mapping['harnessnestedprl_cases-000001'].mappings.properties.data.properties.protectedValue={type:'keyword'};
 assert.throws(()=>validateComplexEmailMapping(wrong,'searchable'),/COMPLEX_MAPPING_CONTROL/);
 const unrelated=structuredClone(fault);unrelated.mapping.properties.unrelated={type:'keyword'};
 assert.throws(()=>compareComplexEmailMappings(baseline,unrelated),/COMPLEX_MAPPING_UNRELATED_DELTA/);
 assert.throws(()=>compareComplexEmailMappings(baseline,baseline),/COMPLEX_MAPPING_SOURCE_Y/);
});

test('mapping transport requires actual enabled owned runtime and fresh alias before import',async()=>{
 const {observeComplexEmailMapping}=await import('./lib/exui-complex-email-mapping.mjs');
 const state={owner:'harness-owner',namespace:'a'.repeat(64),elasticsearch:true,images:{definition:'definition',elasticsearch:'es'},containers:{definition:'def'}};
 const calls=[];const inspect=()=>calls.push('owner');
 const inspectDefinition=()=>({Config:{Env:['ELASTIC_SEARCH_ENABLED=true','ELASTIC_SEARCH_FAIL_ON_IMPORT=true']}});
 const request=(_state,_port,route)=>{calls.push(route);if(route.includes('*/_mapping'))return {status:200,body:{}};if(route==='/')return {status:200,body:{cluster_name:state.owner,version:{number:'7.17.0'}}};return {status:404,body:{}};};
 await observeComplexEmailMapping(state,{beforeImport:true,inspect,inspectDefinition,request});
 assert.equal(calls.filter(x=>x==='owner').length,2);
 assert.throws(()=>observeComplexEmailMapping({...state,elasticsearch:false},{beforeImport:true,inspect,inspectDefinition,request}),/COMPLEX_MAPPING_ES_REQUIRED/);
 assert.throws(()=>observeComplexEmailMapping(state,{beforeImport:true,inspect,inspectDefinition:()=>({Config:{Env:['ELASTIC_SEARCH_ENABLED=true']}}),request}),/COMPLEX_MAPPING_FAIL_IMPORT_REQUIRED/);
 assert.throws(()=>observeComplexEmailMapping(state,{beforeImport:true,inspect,inspectDefinition,request:()=>({status:500,body:{}})}),/COMPLEX_MAPPING_CLUSTER_REQUIRED/);
 assert.throws(()=>observeComplexEmailMapping(state,{beforeImport:true,inspect,inspectDefinition,request:(s,p,r)=>r==='/'?request(s,p,r):{status:200,body:mock.observed().alias}}),/COMPLEX_MAPPING_FRESH_ALIAS/);
});

test('mapping pair stops after baseline setup failure and always verifies cleanup before fault',async t=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
 const {runComplexEmailMappingPair}=await import('./run-harness-complex-email-mapping.mjs');
 const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'mapping-pair-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 for(const scenario of ['healthy','baseline-import-failure','cleanup-failure','wrong-image']) {
  const output=path.join(root,scenario);fs.mkdirSync(output);const calls=[];
  const operations={start:async directory=>{calls.push('start');return {output:directory,owner:'synthetic',namespace:'a'.repeat(64),images:{definition:{id:scenario==='wrong-image'?'sha256:foreign':'sha256:4c6b17b06d347d650fb8d26542716e1d723b7c8b8d44eee69908299cc8f4af52',architecture:'arm64',repoDigests:[]}}};},prepare:async()=>{},import:async(_state,{variant})=>{calls.push('import-'+variant);if(scenario==='baseline-import-failure')throw Error('SETUP');return {status:'import-and-complex-metadata-observed'};},observe:(_state,{beforeImport}={})=>beforeImport?{}:mock.observed(calls.filter(x=>x==='start').length===1?'baseline':'searchable'),cleanup:()=>{calls.push('cleanup');if(scenario==='cleanup-failure')throw Error('CLEANUP');}};
  const result=await runComplexEmailMappingPair(output,{operations});
  assert.equal(result.status,scenario==='healthy'?'observed':'BLOCKED');
  assert.deepEqual([result.runtimeAcceptance,result.catalogueCredit,result.releaseCredit],[false,false,false]);
  assert.equal(calls.filter(x=>x==='start').length,scenario==='healthy'?2:1);
  if(scenario==='healthy'){assert.deepEqual(calls,['start','import-baseline','cleanup','start','import-searchable','cleanup']);assert.equal(result.fault.faultEffective,true);}
  else assert.equal(result.cleanupComplete,scenario!=='cleanup-failure');
  if(scenario==='wrong-image'){assert.deepEqual(calls,['start','cleanup']);assert.equal(result.invocations[0].diagnostic.reason,'COMPLEX_MAPPING_DEFINITION_IMAGE');}
 }
});

test('mapping reader rejects masked leaf, wrong classification, foreign alias and stale controls',async()=>{
 const {validateComplexEmailMapping,observeComplexEmailMapping}=await import('./lib/exui-complex-email-mapping.mjs');
 for(const mutate of [
  x=>x.mapping['harnessnestedprl_cases-000001'].mappings.properties.data.properties.harnessEmailTypeProbe={type:'object',enabled:false},
  x=>x.mapping['harnessnestedprl_cases-000001'].mappings.properties.data_classification.properties.harnessEmailTypeProbe.properties.value.properties.emailAddress={type:'keyword'},
  x=>x.alias['harnessnestedprl_cases-000001'].aliases.harnessnestedprl_cases.is_write_index=false,
  x=>x.mapping['harnessnestedprl_cases-000001'].mappings.properties.data.properties.sodAdditionalRecipientsList={type:'text'},
 ]){const bad=mock.observed();mutate(bad);assert.throws(()=>validateComplexEmailMapping(bad,'baseline'),/COMPLEX_MAPPING_/);}
 const state={owner:'synthetic',elasticsearch:true,containers:{definition:'def'}};
 const options={inspect:()=>{},inspectDefinition:()=>({Config:{Env:['ELASTIC_SEARCH_ENABLED=true','ELASTIC_SEARCH_FAIL_ON_IMPORT=true']}}),request:(_s,_p,r)=>r==='/'?{status:200,body:{cluster_name:'foreign',version:{number:'7.17.0'}}}:{status:404,body:{}}};
 assert.throws(()=>observeComplexEmailMapping(state,options),/COMPLEX_MAPPING_CLUSTER_OWNER/);
 options.request=()=>({status:200,body:{cluster_name:state.owner,version:{number:'9.1.2'}}});
 assert.throws(()=>observeComplexEmailMapping(state,options),/COMPLEX_MAPPING_ES_VERSION/);
});

test('mapping pair cancellation never advances to a second owned namespace',async t=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
 const {runComplexEmailMappingPair}=await import('./run-harness-complex-email-mapping.mjs');
 const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'mapping-cancel-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 let cancelled=false,starts=0,cleanups=0;
 const result=await runComplexEmailMappingPair(root,{isCancelled:()=>cancelled,operations:{start:async()=>{starts++;cancelled=true;return {images:{definition:{id:'sha256:4c6b17b06d347d650fb8d26542716e1d723b7c8b8d44eee69908299cc8f4af52',architecture:'arm64',repoDigests:[]}}};},observe:()=>({}),cleanup:()=>{cleanups++;},prepare:()=>assert.fail('must not prepare after cancellation')}});
 assert.equal(result.status,'BLOCKED');assert.equal(starts,1);assert.equal(cleanups,1);assert.equal(result.cleanupComplete,true);
});
