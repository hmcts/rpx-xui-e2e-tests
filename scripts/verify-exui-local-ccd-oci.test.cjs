const assert=require('node:assert/strict');
const {test}=require('node:test');
const {spawnSync}=require('node:child_process');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {createHash}=require('node:crypto');
const digest=b=>'sha256:'+createHash('sha256').update(b).digest('hex');
test('local OCI verifier exercises positive raw/gzip archives and bounded tamper cases without Docker',()=>{
 const result=spawnSync('python3',['scripts/verify-local-ccd-oci.test.py'],{encoding:'utf8',env:{PATH:process.env.PATH,HOME:process.env.HOME,PYTHONDONTWRITEBYTECODE:'1'}});assert.equal(result.status,0,result.stderr);
});
async function setup(t){
 const lib=await import('./lib/exui-local-ccd-oci.mjs');const root=fs.mkdtempSync(path.join(os.tmpdir(),'local-ccd-oci-test-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const archive=path.join(root,'archive.tar');fs.writeFileSync(archive,'synthetic-unit-archive');
 const receipt={schemaVersion:1,kind:'verified-local-oci-ccd-derivative',profile:'ccd-results-internal-id-fix-feasibility',platform:'linux/arm64',archiveDigest:digest(fs.readFileSync(archive)),configDigest:digest('config'),rootfsDiffIds:[digest('base'),digest('jar')],executionConfig:{User:'1000',Entrypoint:['java'],Env:['A=B']},runtimeAcceptance:false,catalogueCredit:false,releaseCredit:false};
 const inspect={Id:receipt.configDigest,Os:'linux',Architecture:'arm64',RootFS:{Layers:receipt.rootfsDiffIds},Config:receipt.executionConfig,RepoDigests:[]};
 return {lib,root,archive,receipt,inspect};
}
test('local identity uses verified config/rootfs without forging repository digests',async t=>{
 const r=await setup(t);assert.doesNotThrow(()=>r.lib.assertLocalCcdLoadedIdentity(r.inspect,r.receipt));
 for(const key of ['manifestDigest','indexDocumentDigest']) { const receipt={...r.receipt,[key]:digest(key)};assert.doesNotThrow(()=>r.lib.assertLocalCcdLoadedIdentity({...r.inspect,Id:receipt[key]},receipt)); }
 for(const altered of [{...r.inspect,Id:digest('other')},{...r.inspect,Architecture:'amd64'},{...r.inspect,RootFS:{Layers:[]}},{...r.inspect,Config:{...r.inspect.Config,User:'root'}}])assert.throws(()=>r.lib.assertLocalCcdLoadedIdentity(altered,r.receipt));
});
test('load re-verifies archive before Docker then inspects immutable config ID',async t=>{
 const r=await setup(t);const calls=[];
 const loaded=r.lib.loadLocalCcdDerivative({baseArchive:r.archive,derivedArchive:r.archive,artifactRoot:r.root,output:r.root},{verify:()=>r.receipt,docker:args=>{calls.push(args);return args[0]==='load'?'Loaded':JSON.stringify([r.inspect]);}});
 assert.deepEqual(calls,[['load','--input',r.archive],['image','inspect',r.receipt.configDigest]]);assert.equal(loaded.releaseCredit,false);assert.equal(loaded.status,'loaded-and-verified');
});
test('failed verification never loads, modified archive never loads, no baseline pin substitution',async t=>{
 const r=await setup(t),args={baseArchive:r.archive,derivedArchive:r.archive,artifactRoot:r.root,output:r.root};
 assert.throws(()=>r.lib.loadLocalCcdDerivative(args,{verify:()=>{throw Error('bad artifact')},docker:()=>assert.fail('no Docker')}));
 assert.throws(()=>r.lib.loadLocalCcdDerivative(args,{verify:()=>({...r.receipt,archiveDigest:digest('other')}),docker:()=>assert.fail('no Docker')}));
 const runtime=await import('./lib/exui-ccd-runtime.mjs');assert.throws(()=>runtime.assertCcdImageIdentity(r.inspect,{manifestDigest:r.receipt.configDigest},'linux/arm64'),/CCD_IMAGE_IDENTITY_MISMATCH/);
});
test('Python verifier failure cannot be replaced with caller metadata',async()=>{const {verifyLocalCcdDerivative}=await import('./lib/exui-local-ccd-oci.mjs');assert.throws(()=>verifyLocalCcdDerivative({baseArchive:'/tmp/base',derivedArchive:'/tmp/derived',artifactRoot:'/tmp/artifact'},{run:()=>({status:1,stdout:'{"verified":true}'})}),/VERIFICATION_FAILED/);});
