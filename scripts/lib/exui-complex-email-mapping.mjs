import assert from 'node:assert/strict';
import {ccdRequest,docker,verifyCcdContainerIdentity} from './exui-ccd-runtime.mjs';

export const COMPLEX_MAPPING_ALIAS='harnessnestedprl_cases';
export const COMPLEX_MAPPING_SOURCE_CONTEXT=Object.freeze({definitionImage:'sha256:4c6b17b06d347d650fb8d26542716e1d723b7c8b8d44eee69908299cc8f4af52',jarDigest:'sha256:8c4d4e13a61a7d2486e45631fc81d542a3ee8cc02689ae460b45ba9d7d768432',imageReportedCommit:'120b9a232f7b617d03faf68ad2d8e63a0afb0442',sourceClassEquivalence:false});
const textMapping={type:'text',fields:{keyword:{type:'keyword',ignore_above:256,normalizer:'lowercase_normalizer'}}};
const disabled={type:'object',enabled:false};
const keyword={type:'keyword'};
const leaves=m=>[m?.properties?.data?.properties?.harnessEmailTypeProbe?.properties,m?.properties?.data_classification?.properties?.harnessEmailTypeProbe?.properties?.value?.properties];

export function observeComplexEmailMapping(state,{beforeImport=false,inspect=verifyCcdContainerIdentity,inspectDefinition=id=>JSON.parse(docker(['inspect',id]))[0],request=ccdRequest}={}) {
 assert.equal(state.elasticsearch,true,'COMPLEX_MAPPING_ES_REQUIRED');inspect(state);
 const environment=inspectDefinition(state.containers.definition).Config?.Env??[];
 assert.equal(environment.filter(x=>x.startsWith('ELASTIC_SEARCH_ENABLED=')).join(),'ELASTIC_SEARCH_ENABLED=true','COMPLEX_MAPPING_ES_REQUIRED');
 assert.equal(environment.filter(x=>x.startsWith('ELASTIC_SEARCH_FAIL_ON_IMPORT=')).join(),'ELASTIC_SEARCH_FAIL_ON_IMPORT=true','COMPLEX_MAPPING_FAIL_IMPORT_REQUIRED');
 const cluster=request(state,9200,'/');
 assert.equal(cluster.status,200,'COMPLEX_MAPPING_CLUSTER_REQUIRED');
 assert.equal(cluster.body?.cluster_name,state.owner,'COMPLEX_MAPPING_CLUSTER_OWNER');
 assert.equal(cluster.body?.version?.number,'7.17.0','COMPLEX_MAPPING_ES_VERSION');
 const alias=request(state,9200,`/_alias/${COMPLEX_MAPPING_ALIAS}`);
 if(beforeImport) {
  assert.equal(alias.status,404,'COMPLEX_MAPPING_FRESH_ALIAS');
  const indices=request(state,9200,`/${COMPLEX_MAPPING_ALIAS}*/_mapping`);
  assert.equal(indices.status,200,'COMPLEX_MAPPING_FRESH_INDICES');
  assert.deepEqual(indices.body,{},'COMPLEX_MAPPING_FRESH_INDICES');
  inspect(state);return {cluster,alias,indices};
 }
 assert.equal(alias.status,200,'COMPLEX_MAPPING_ALIAS_REQUIRED');
 const mapping=request(state,9200,`/${COMPLEX_MAPPING_ALIAS}/_mapping`);
 assert.equal(mapping.status,200,'COMPLEX_MAPPING_READ_REQUIRED');inspect(state);
 return {cluster,alias:alias.body,mapping:mapping.body};
}

export function validateComplexEmailMapping(observed,variant) {
 assert(['baseline','searchable'].includes(variant),'COMPLEX_MAPPING_VARIANT');
 const names=Object.keys(observed.alias??{});
 assert.equal(names.length,1,'COMPLEX_MAPPING_ONE_INDEX');
 const index=names[0];assert.equal(index,`${COMPLEX_MAPPING_ALIAS}-000001`,'COMPLEX_MAPPING_FRESH_INDEX');
 assert.deepEqual(observed.alias[index].aliases,{[COMPLEX_MAPPING_ALIAS]:{is_write_index:true}},'COMPLEX_MAPPING_WRITE_ALIAS');
 assert.deepEqual(Object.keys(observed.mapping??{}),[index],'COMPLEX_MAPPING_INDEX_BINDING');
 const mapping=observed.mapping[index]?.mappings;
 assert.deepEqual(mapping?.properties?.data?.properties?.protectedValue,textMapping,'COMPLEX_MAPPING_CONTROL');
 assert.deepEqual(mapping?.properties?.data_classification?.properties?.protectedValue,keyword,'COMPLEX_MAPPING_CONTROL');
 for(const branch of ['data','data_classification'])assert.deepEqual(mapping.properties[branch].properties.sodAdditionalRecipientsList,disabled,'COMPLEX_MAPPING_MASKED_PARENT');
 const [data,classification]=leaves(mapping);
 assert(data&&classification,'COMPLEX_MAPPING_DIRECT_PARENT');
 assert.deepEqual(mapping.properties.data_classification.properties.harnessEmailTypeProbe.properties.classification,keyword,'COMPLEX_MAPPING_PARENT_CLASSIFICATION');
 const reason=variant==='baseline'?'COMPLEX_MAPPING_SOURCE_N':'COMPLEX_MAPPING_SOURCE_Y';
 assert.deepEqual(data.emailAddress,variant==='baseline'?disabled:textMapping,reason);
 assert.deepEqual(classification.emailAddress,variant==='baseline'?disabled:keyword,reason);
 return {variant,index,mapping:structuredClone(mapping)};
}

export function compareComplexEmailMappings(baseline,fault) {
 const wrap=value=>({alias:{[value.index]:{aliases:{[COMPLEX_MAPPING_ALIAS]:{is_write_index:true}}}},mapping:{[value.index]:{mappings:value.mapping}}});
 validateComplexEmailMapping(wrap(baseline),'baseline');validateComplexEmailMapping(wrap(fault),'searchable');
 const expected=structuredClone(baseline.mapping),[data,classification]=leaves(expected);
 data.emailAddress=structuredClone(textMapping);classification.emailAddress=structuredClone(keyword);
 assert.deepEqual(fault.mapping,expected,'COMPLEX_MAPPING_UNRELATED_DELTA');
 assert.throws(()=>validateComplexEmailMapping(wrap(fault),'baseline'),{code:'ERR_ASSERTION',message:/^COMPLEX_MAPPING_SOURCE_N/},'COMPLEX_MAPPING_N_FAULT_NOT_DETECTED');
 return {faultEffective:true,namedAssertion:'COMPLEX_MAPPING_SOURCE_N',changedSourceCells:1,observedMappingPaths:['data.harnessEmailTypeProbe.emailAddress','data_classification.harnessEmailTypeProbe.value.emailAddress'],runtimeAcceptance:false,catalogueCredit:false,releaseCredit:false};
}
