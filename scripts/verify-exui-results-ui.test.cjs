const {test}=require('node:test');const assert=require('node:assert/strict');
const load=()=>import('./lib/exui-results-ui-contract.mjs');
const actor={userId:'11111111-1111-4111-8111-111111111111'};
const payload=()=>({native_es_query:{from:0,size:10,sort:[],query:{match_all:{}}},supplementary_data:['*']});
test('results scaffold is explicit and does not mutate source defaults',async()=>{const {resultsConfiguration}=await load();const base={jurisdictions:'IA,CIVIL',other:{same:true}};const configured=resultsConfiguration(base);assert.deepEqual(configured,{jurisdictions:'HARNESS',other:{same:true}});assert.deepEqual(configured.jurisdictions.split(','),['HARNESS']);assert.equal(base.jurisdictions,'IA,CIVIL');});
test('results gateway accepts only candidate baseline POST and real typed discovery routes',async()=>{
 const {resultTransportRoute:route}=await load();
 for(const view of ['SEARCH','WORKBASKET']) {const url=new URL('http://local/internal/searchCases?ctid=HarnessResultsPRL&use_case='+view+'&view='+view+'&page=1');assert.equal(route('POST',url.pathname,url,JSON.stringify(payload()),actor).upstreamPath,'/internal/searchCases');}
 for(const prefix of ['', '/aggregated']) {const url=new URL('http://local'+prefix+'/caseworkers/'+actor.userId+'/jurisdictions?access=read');assert.equal(route('GET',url.pathname,url,'',actor).upstreamPath,'/aggregated/caseworkers/'+actor.userId+'/jurisdictions');}
 const url=new URL('http://local/internal/case-types/HarnessResultsPRL/search-inputs');assert.equal(route('GET',url.pathname,url,'',actor).upstreamPath,url.pathname);
});
test('results gateway rejects foreign cases, actors, broad query bodies and sort overrides',async()=>{
 const {resultTransportRoute:route}=await load();const url=new URL('http://local/internal/searchCases?ctid=HarnessResultsPRL&use_case=SEARCH&view=SEARCH');
 assert.equal(route('POST',url.pathname,url,JSON.stringify(payload()),null),null);
 for(const query of ['ctid=PRLAPPS&use_case=SEARCH','ctid=HarnessResultsPRL&use_case=FOREIGN','ctid=HarnessResultsPRL&use_case=SEARCH&page=2','ctid=HarnessResultsPRL&use_case=SEARCH&ctid=PRLAPPS','ctid=HarnessResultsPRL&use_case=SEARCH&foreign=true'])assert.throws(()=>route('POST',url.pathname,new URL('http://local/internal/searchCases?'+query),JSON.stringify(payload()),actor));
 for(const change of [{sort:[{field:'asc'}]},{query:{bool:{must:[]}}},{size:1000},{from:3},{script_fields:{evil:{}}}])assert.throws(()=>route('POST',url.pathname,url,JSON.stringify({...payload(),native_es_query:{...payload().native_es_query,...change}}),actor));
 assert.equal(route('GET','/internal/cases/1234567890123456',new URL('http://local/internal/cases/1234567890123456'),'',actor),null);
 assert.equal(route('GET','/caseworkers/foreign/jurisdictions',new URL('http://local/caseworkers/foreign/jurisdictions?access=read'),'',actor),null);
});

test('supporting PRD scaffold is exact, authenticated and results-only',async()=>{
 const {resultSupportingResponse:route,resultsSupportingScaffold:scaffold,resultsSupportingScaffoldDigest:digest}=await load();
 const url=new URL('http://local/refdata/external/v1/organisations');
 assert.deepEqual(route(true,'GET',url,'',actor),scaffold());assert.equal(scaffold().responseBody,'{}');
 assert.equal(digest(),require('node:crypto').createHash('sha256').update(JSON.stringify(scaffold())).digest('hex'));
 for(const args of [[false,'GET',url,'',actor],[true,'POST',url,'',actor],[true,'GET',new URL(url+'?x=1'),'',actor],[true,'GET',new URL(url+'/users'),'',actor],[true,'GET',url,'{}',actor],[true,'GET',url,'',null]])assert.equal(route(...args),null);
 for(const prefix of ['', '/aggregated'])for(const tail of ['/jurisdictions','/jurisdictions/HARNESS/case-types']) {
  const target=new URL('http://local'+prefix+'/caseworkers/'+actor.userId+tail+'?access=read');
  assert.equal((await load()).resultTransportRoute('GET',target.pathname,target,'',actor).upstreamPath,'/aggregated/caseworkers/'+actor.userId+tail);
 }
});

test('candidate view is mandatory, unique and agrees with use_case without rewriting body',async()=>{
 const {resultTransportRoute:route}=await load();const body=JSON.stringify(payload());
 for(const view of ['SEARCH','WORKBASKET']) {
  const base='http://local/internal/searchCases?ctid=HarnessResultsPRL&use_case='+view;
  const url=new URL(base+'&view='+view+'&page=1');
  assert.equal(route('POST',url.pathname,url,body,actor).upstreamPath,'/internal/searchCases');
  assert.equal(body,JSON.stringify(payload()));assert.equal(url.searchParams.get('view'),view);
  for(const suffix of ['', '&view=FOREIGN','&view='+view+'&view='+view,'&view='+(view==='SEARCH'?'WORKBASKET':'SEARCH')]) {
   const invalid=new URL(base+suffix);assert.throws(()=>route('POST',invalid.pathname,invalid,body,actor),/RESULT_UI_VIEW|RESULT_UI_QUERY_DUPLICATE/);
  }
 }
});
