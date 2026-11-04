const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {createHash}=require('node:crypto');
const digest=bytes=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
async function setup(t,id=0){
 const lib=await import('./lib/exui-shared-policy-contracts.mjs');const contract=lib.buildSharedPolicyContracts()[id];
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'shared-contract-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const identity={runId:'synthetic-unit-run',candidateArtifactDigest:digest('candidate'),toolkitDigest:digest('toolkit'),ccdImageSetDigest:digest('ccd'),definitionDigest:digest('definition'),sourceRuntimeBindingDigest:digest('source-binding')};
 const records=[...contract.facets,...contract.faults,...(contract.additionalSequences??[])].map((r,i)=>({id:r.id,artifacts:r.requiredArtifacts.map((kind,j)=>{const name=`${i}-${j}.json`,bytes=JSON.stringify({syntheticUnitOnly:true,kind});fs.writeFileSync(path.join(root,name),bytes);return {kind,path:name,digest:digest(bytes)};})}));
 const envelope={schemaVersion:1,obligationId:contract.id,contractDigest:contract.contractDigest,identity,records};
 return {lib,contract,root,identity,envelope,validate:()=>lib.validateSharedPolicyEvidenceBindings(contract,envelope,{evidenceRoot:root,expectedIdentity:identity})};
}
test('exact existing two IDs, one source caseType, four renderer shapes and sixteen source role cells',async()=>{
 const {buildSharedPolicyContracts,sharedPolicySourceKeys}=await import('./lib/exui-shared-policy-contracts.mjs');const [nested,role]=buildSharedPolicyContracts();
 assert.deepEqual([nested.id,role.id],['configuration-shared:nested-renderer','configuration-shared:role-policy']);assert.equal(nested.facets.length,4);assert.equal(role.facets.length,16);assert(role.facets.every(f=>f.caseType==='PRLAPPS'));assert.equal(role.runtimeCaseType,'HarnessNestedPRL');
 assert(nested.sourceReferences.some(r=>r.repository==='hmcts/ccd-case-ui-toolkit'));assert(role.sourceReferences.some(r=>r.repository==='hmcts/ccd-data-store-api'));assert(sharedPolicySourceKeys(role.id).length>0);assert.equal(role.automaticExistingProofCredit,false);
});
for(const id of [0,1])test(`all sealed references still confer zero acceptance for contract${id}`,async t=>{
 const run=await setup(t,id);const result=run.validate();assert.equal(result.bindingStatus,'verified');assert.equal(result.acceptanceStatus,'native-facet-replay-required');assert.deepEqual(result.acceptedObligationIds,[]);assert.equal(result.catalogueCredit,false);
});
for(const [name,change] of [
 ['missing facet',r=>r.envelope.records.pop()],['duplicate facet',r=>r.envelope.records[1]=r.envelope.records[0]],
 ['boolean observed substitute',r=>r.envelope.records[0]={id:r.envelope.records[0].id,observed:true}],
 ['boolean acceptance',r=>r.envelope.accepted=true],['missing fault application',r=>r.envelope.records.find(x=>x.id==='ccd-drop-child').artifacts.pop()],
 ['wrong candidate',r=>r.envelope.identity={...r.identity,candidateArtifactDigest:digest('other')}],
 ['wrong contract',r=>r.envelope.contractDigest=digest('other')],['forged source pin',r=>r.contract.sourceReferences[0]={...r.contract.sourceReferences[0],revision:'f'.repeat(40)}],
 ['altered artifact',r=>fs.writeFileSync(path.join(r.root,r.envelope.records[0].artifacts[0].path),'changed')],
 ['traversal',r=>r.envelope.records[0].artifacts[0].path='../escape'],
])test(`fail closed: ${name}`,async t=>{const run=await setup(t);change(run);assert.throws(run.validate);});
test('symbolic-link artifact cannot escape owned evidence root',async t=>{const run=await setup(t);const artifact=run.envelope.records[0].artifacts[0],target=path.join(run.root,artifact.path);fs.unlinkSync(target);fs.symlinkSync('/etc/hosts',target);assert.throws(run.validate,/SHARED_POLICY_ARTIFACT_ESCAPE/);});

test('returned contracts cannot mutate canonical pins or artifact requirements',async()=>{const lib=await import('./lib/exui-shared-policy-contracts.mjs');const expected=lib.buildSharedPolicyContracts();const altered=lib.buildSharedPolicyContracts();altered[0].sourceReferences[0].revision='f'.repeat(40);altered[0].facets[0].requiredArtifacts.pop();assert.deepEqual(lib.buildSharedPolicyContracts(),expected);});

for(const [name,change] of [
 ['empty inventory',s=>s.sourceReferences=[]],['missing source',s=>s.sourceReferences.pop()],['foreign repo',s=>s.sourceReferences[0].repository='other/repository'],['foreign revision',s=>s.sourceReferences[0].revision='f'.repeat(40)],['coherently forged source hash',s=>s.sourceReferences[0].digest=digest('forged-source')],['duplicate source',s=>s.sourceReferences[1]=s.sourceReferences[0]],
])test(`independent source seal rejects ${name}`,async()=>{const lib=await import('./lib/exui-shared-policy-contracts.mjs');const source=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/ccd/shared-policy-sources.json')));change(source);assert.throws(()=>lib.validateSharedPolicySources(source));});
