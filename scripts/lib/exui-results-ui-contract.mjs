import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const RESULTS_UI_KIND='result-columns-ui-feasibility';
export function resultsConfiguration(config) {return {...structuredClone(config),jurisdictions:'HARNESS'};}
export function resultTransportRoute(method,pathname,url,body,actor) {
 if(!actor)return null;
 const bare=pathname.startsWith('/data/')?pathname.slice(5):pathname;
 const user=encodeURIComponent(actor.userId),worker=`/caseworkers/${user}`;
 if(method==='GET') {
  if([`${worker}/jurisdictions`,`${worker}/jurisdictions/HARNESS/case-types`].includes(bare.replace(/^\/aggregated/,''))) {
   assert.deepEqual([...url.searchParams.keys()],['access'],'RESULT_UI_DISCOVERY_QUERY');assert.equal(url.searchParams.get('access'),'read','RESULT_UI_DISCOVERY_ACCESS');
   return {path:pathname,upstreamPath:'/aggregated'+bare.replace(/^\/aggregated/,'')};
  }
  if(['/internal/case-types/HarnessResultsPRL/search-inputs','/internal/case-types/HarnessResultsPRL/work-basket-inputs'].includes(bare)) {
   assert.equal(url.search,'','RESULT_UI_DESCRIPTOR_QUERY');return {path:'/data'+bare,upstreamPath:bare};
  }
 }
 if(method==='POST'&&bare==='/internal/searchCases') {
  assert([...url.searchParams.keys()].every(key=>['ctid','use_case','view','page'].includes(key)),'RESULT_UI_QUERY_KEYS');
  for(const key of ['ctid','use_case','view','page'])assert(url.searchParams.getAll(key).length<=1,'RESULT_UI_QUERY_DUPLICATE');
  assert.equal(url.searchParams.get('ctid'),'HarnessResultsPRL','RESULT_UI_CASE_TYPE');
  assert(['SEARCH','WORKBASKET'].includes(url.searchParams.get('use_case')),'RESULT_UI_USE_CASE');
  assert.equal(url.searchParams.get('view'),url.searchParams.get('use_case'),'RESULT_UI_VIEW');
  assert([null,'1'].includes(url.searchParams.get('page')),'RESULT_UI_PAGE');
  const parsed=JSON.parse(body);assert.deepEqual(Object.keys(parsed).sort(),['native_es_query','supplementary_data'],'RESULT_UI_BODY_KEYS');
  assert.deepEqual(parsed.supplementary_data,['*'],'RESULT_UI_SUPPLEMENTARY');
  const query=parsed.native_es_query;assert.deepEqual(Object.keys(query).sort(),['from','query','size','sort'],'RESULT_UI_NATIVE_QUERY_KEYS');
  assert.equal(query.from,0,'RESULT_UI_FROM');assert(Number.isInteger(query.size)&&query.size>=3&&query.size<=100,'RESULT_UI_SIZE');
  assert.deepEqual(query.sort,[],'RESULT_UI_INITIAL_SORT');assert.deepEqual(query.query,{match_all:{}},'RESULT_UI_MATCH_ALL');
  return {path:'/data'+bare,upstreamPath:bare};
 }
 return null;
}

export function resultsSupportingScaffold() {
 return {name:'synthetic-results-no-organisation',method:'GET',path:'/refdata/external/v1/organisations',query:'',requestBody:'',status:200,responseBody:'{}',prdClaim:false,organisationClaim:false,roleClaim:false,sourceProfileClaim:false};
}
export function resultsSupportingScaffoldDigest() {return createHash('sha256').update(JSON.stringify(resultsSupportingScaffold())).digest('hex');}
export function resultSupportingResponse(enabled,method,url,body,actor) {
 const scaffold=resultsSupportingScaffold();
 return enabled===true&&actor&&method===scaffold.method&&url.pathname===scaffold.path&&url.search===scaffold.query&&body===scaffold.requestBody?scaffold:null;
}
