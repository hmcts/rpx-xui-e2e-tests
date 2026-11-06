const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
async function setup(t){
 const lib=await import('./lib/exui-local-ccd-runtime-profile.mjs');const root=fs.mkdtempSync(path.join(os.tmpdir(),'local-runtime-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const receipt={kind:'verified-local-oci-ccd-derivative',profile:'ccd-results-internal-id-fix-feasibility',runtimeAcceptance:false,catalogueCredit:false,releaseCredit:false,configDigest:'sha256:config',manifestDigest:'sha256:manifest',rootfsDiffIds:['base','jar'],executionConfig:{User:'hmcts'}};
 const profile={...receipt,status:'loaded-and-verified',imageId:receipt.manifestDigest,baseArchive:root+'/base',derivedArchive:root+'/derived',artifactRoot:root+'/artifact'};
 const file=root+'/profile.json';fs.writeFileSync(file,JSON.stringify(profile));
 const info={Id:profile.imageId,Os:'linux',Architecture:'arm64',RootFS:{Layers:receipt.rootfsDiffIds},Config:receipt.executionConfig};
 return {lib,root,receipt,profile,file,info};
}
test('local profile requires fresh artifact verification and actual immutable image identity',async t=>{
 const r=await setup(t);let verified=0,inspected=0;
 const deps={verify:()=>{verified++;return r.receipt;},docker:args=>{inspected++;assert.deepEqual(args,['image','inspect',r.profile.imageId]);return JSON.stringify([r.info]);}};
 assert.equal(r.lib.verifyLocalCcdRuntimeProfile(r.file,deps).imageId,r.profile.imageId);assert.equal(verified,1);assert.equal(inspected,1);
 assert.throws(()=>r.lib.verifyLocalCcdRuntimeProfile(r.file,{docker:()=>assert.fail('missing real artifact bytes must never inspect Docker')}));
 assert.throws(()=>r.lib.verifyLocalCcdRuntimeProfile(r.file,{...deps,verify:()=>{throw Error('missing/tampered archive');}}));
 assert.throws(()=>r.lib.verifyLocalCcdRuntimeProfile(r.file,{...deps,docker:()=>JSON.stringify([{...r.info,Id:'foreign'}])}));
 assert.throws(()=>r.lib.verifyLocalCcdRuntimeProfile(r.file,{...deps,docker:()=>JSON.stringify([{...r.info,Config:{User:'root'}}])}));
 fs.writeFileSync(r.file,JSON.stringify({...r.profile,catalogueCredit:true}));assert.throws(()=>r.lib.verifyLocalCcdRuntimeProfile(r.file,deps),/PROFILE_DRIFT/);
});
test('local profile cannot be implicit or broaden fixture/platform and cannot grant native acceptance',async t=>{
 const r=await setup(t);assert.throws(()=>r.lib.verifyLocalCcdRuntimeProfile(undefined));
 for(const options of [{platform:'linux/amd64',elasticsearch:true},{elasticsearch:false},{elasticsearch:true,fixtureSelection:'event-capability-baseline'}])assert.throws(()=>r.lib.assertLocalCcdRuntimeScope(options));
 const runtime=await import('./lib/exui-ccd-runtime.mjs');assert.throws(()=>runtime.verifyCcdRuntimeIdentity({localCcdProfile:r.file}),/NATIVE_ACCEPTANCE_FORBIDDEN/);
 fs.mkdirSync(r.root+'/runtime');fs.writeFileSync(r.root+'/runtime/runtime.json',JSON.stringify({localCcdProfile:r.file}));assert.throws(()=>runtime.loadCcdRuntimeForReuse(r.root+'/runtime'),/EXPLICIT_REUSE_REQUIRED/);
 assert.throws(()=>runtime.assertCcdImageIdentity(r.info,{manifestDigest:r.profile.imageId},'linux/arm64'),/CCD_IMAGE_IDENTITY_MISMATCH/);
});
test('local CLI probe preserves unchanged search helper sequence and always cleans up failed startup/search',async t=>{
 const {runLocalCcdResults}=await import('./run-local-ccd-results.mjs');const r=await setup(t);
 for(const failure of ['none','startup','search','cancelled']) {
  const calls=[];const out=r.root+'/'+failure;
  const dependencies={start:async(_output,options)=>{calls.push('startup');assert.equal(options.localCcdProfile,r.file);if(failure==='startup')throw Error();if(failure==='cancelled'){process.emit('SIGTERM');assert.equal(options.isCancelled(),true);throw Error('LOCAL_CCD_RESULTS_CANCELLED');}return{};},importColumns:async()=>calls.push('import'),seed:()=>calls.push('seed'),search:()=>{calls.push('search');if(failure==='search')throw Error();},cleanup:async()=>{await Promise.resolve();calls.push('cleanup');return{cleanupComplete:true};}};
  if(failure==='none')assert.equal((await runLocalCcdResults({profile:r.file,output:out},dependencies)).catalogueCredit,false);
  else await assert.rejects(runLocalCcdResults({profile:r.file,output:out},dependencies));
  assert.equal(calls.at(-1),'cleanup');if(!['startup','cancelled'].includes(failure))assert.deepEqual(calls,['startup','import','seed','search','cleanup']);
 }
});

test('local result diagnostics preserve fixed codes and reject arbitrary raw errors',async()=>{
 const {localResultFailureCode}=await import('./run-local-ccd-results.mjs');
 assert.equal(localResultFailureCode(Error('LOCAL_CCD_RESULTS_CANCELLED')),'LOCAL_CCD_RESULTS_CANCELLED');
 assert.equal(localResultFailureCode(Error('RESULT_CCD_SEARCH_TOTAL\nprivate detail')),'RESULT_CCD_SEARCH_TOTAL');
 assert.equal(localResultFailureCode(Error('RESULT_SECRET_PASSWORD_ABC')),'LOCAL_CCD_RESULTS_FEASIBILITY_FAILED');
});
