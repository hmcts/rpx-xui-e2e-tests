const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const digest = text => 'sha256:' + createHash('sha256').update(text).digest('hex');
const identity = () => ({ webappCommit: '1'.repeat(40), artifactDigest: digest('artifact'), dependencyLockDigest: digest('lock'), toolkitVersion: '7.4.25', toolkitDigest: digest('toolkit'), configurationDigest: digest('config'), definitionDigests: { HarnessNestedPRL: digest('definition') }, dependencyIdentities: { ccd: { artifactDigest: digest('ccd'), apiContractDigest: digest('api') } } });
const state = (protectedValue='synthetic-protected-original',version=0) => ({id:1234567890123456,case_type_id:'HarnessNestedPRL',jurisdiction:'HARNESS',state:'Created',version,case_data:{protectedValue,sodAdditionalRecipientsList:[]}});
function inputs() {
 const manifest = { schemaVersion:1, runId:'unit-role-run', harnessCommit:'2'.repeat(40), releaseScopeId:'exui-ccd-pilot', policyDigest:digest('policy'), requiredObligationIds:['ccd-access-integrity'], identity:identity(), runtimeMetadata:{ harnessSourceState:'clean', harnessSourceDigest:digest('source'), definitionImportDigest:digest('import'), observedDefinitionDigest:digest('observed'), definitionVersion:'1', ccdNamespace:'unit-ccd' } };
 const context = { ...Object.fromEntries(['runId','harnessCommit','releaseScopeId','policyDigest','identity'].map(key=>[key,manifest[key]])), invocationId:'baseline', harnessSourceState:'clean', harnessSourceDigest:digest('source') };
 return {manifest,context};
}
test('response projection contains only fixed canary presence, byte count, digest and status', async()=>{
 const lib = await import('./lib/exui-shared-role-observations.mjs');
 const raw='Authorization: bearer-private-secret Cookie=private-cookie synthetic-protected-original';
 const projection=lib.projectSharedRoleResponse(200,raw);
 assert.deepEqual(projection,{status:200,bodyBytes:Buffer.byteLength(raw),bodyDigest:digest(raw),presentMarkers:['protected-original']});
 assert(!JSON.stringify(projection).includes('private-secret'));
 assert(!JSON.stringify(projection).includes('private-cookie'));
 assert.throws(()=>lib.projectSharedRoleResponse(200,'x'.repeat(4*1024*1024+1)),/SHARED_ROLE_RESPONSE_SIZE/);
});
test('observation identity is exact invocation, source and imported definition identity',async()=>{
 const lib=await import('./lib/exui-shared-role-observations.mjs'),{manifest,context}=inputs();
 const result=lib.sharedRoleObservationBinding(manifest,context);
 assert.equal(result.invocationId,'baseline');assert.equal(result.definitionImportDigest,digest('import'));
 for(const key of ['runId','harnessCommit','policyDigest','releaseScopeId','harnessSourceDigest']) {
  assert.throws(()=>lib.sharedRoleObservationBinding(manifest,{...context,[key]:'foreign'}));
 }
 assert.throws(()=>lib.sharedRoleObservationBinding(manifest,{...context,identity:{...context.identity,artifactDigest:digest('foreign')}}));
 assert.throws(()=>lib.sharedRoleObservationBinding(manifest,{...context,invocationId:'foreign'}));
 assert.throws(()=>lib.sharedRoleObservationBinding({...manifest,runtimeMetadata:{...manifest.runtimeMetadata,definitionImportDigest:undefined}},context));
});
test('independent denial replay rejects missing projections, stale identity, disclosure and masked writes',async()=>{
 const lib=await import('./lib/exui-shared-role-observations.mjs'),{manifest,context}=inputs();
 const binding=lib.sharedRoleObservationBinding(manifest,context);
 const value={schemaVersion:1,binding,complete:true,caseId:'1234567890123456',actor:{id:'synthetic-denied',roles:['caseworker']},before:{state:state(),history:[{id:'create'}]},after:{state:state(),history:[{id:'create'}]},deniedRead:403,deniedWrite:403,deniedReadResponse:lib.projectSharedRoleResponse(403,'Forbidden'),deniedWriteResponse:lib.projectSharedRoleResponse(403,'Forbidden'),auditOnlyExceptions:[]};
 const replay=v=>lib.replaySharedRoleDenial(v,{binding,actorId:'synthetic-denied',mutation:null});
 replay(value);
 for(const change of [v=>delete v.deniedReadResponse,v=>v.binding.harnessCommit='3'.repeat(40),v=>v.deniedReadResponse.presentMarkers=['protected-original'],v=>v.after.history.push(2),v=>v.actor.id='other',v=>v.complete=false,v=>v.before.state.id=1111111111111111,v=>v.before.state.case_type_id='Other',v=>v.before.state.jurisdiction='OTHER',v=>v.before.state.case_data.protectedValue='unrelated']) {const v=structuredClone(value);change(v);assert.throws(()=>replay(v));}
 const broadened={...value,complete:false,deniedRead:200,deniedReadResponse:lib.projectSharedRoleResponse(200,'synthetic-protected-original')};
 lib.replaySharedRoleDenial(broadened,{binding,actorId:'synthetic-denied',mutation:'ccd-broaden-access'});
 assert.throws(()=>lib.replaySharedRoleDenial({...broadened,deniedReadResponse:lib.projectSharedRoleResponse(200,'unrelated')},{binding,actorId:'synthetic-denied',mutation:'ccd-broaden-access'}));
 const written=structuredClone(value);written.after={state:state('must-never-persist',1),history:[{id:'update'},{id:'create'}]};
 lib.replaySharedRoleDenial(written,{binding,actorId:'synthetic-denied',mutation:'ccd-write-then-deny'});
 assert.throws(()=>lib.replaySharedRoleDenial(value,{binding,actorId:'synthetic-denied',mutation:'ccd-write-then-deny'}));
 const historyOnly=structuredClone(value);historyOnly.after.history.push({id:'update'});historyOnly.after.state.version++;
 assert.throws(()=>lib.replaySharedRoleDenial(historyOnly,{binding,actorId:'synthetic-denied',mutation:'ccd-write-then-deny'}),/SHARED_ROLE_FAULT_WRITE_VALUE/);
});
test('only the exact reviewed dual collection hashes are accepted; any other delta fails closed',async()=>{
 const lib=await import('./lib/exui-shared-role-toolkit.mjs');
 const sourcePath='projects/ccd-case-ui-toolkit/src/lib/shared/components/palette/collection/write-collection-field.component.ts';
 const pinned=fs.readFileSync(path.join(__dirname,'fixtures/ccd/shared-role-write-collection.source.txt'),'utf8');
 const published=pinned.replace("import { MatLegacyDialog as MatDialog } from '@angular/material/legacy-dialog';\nimport { MatDialogConfig } from '@angular/material/dialog';", "import { MatDialog, MatDialogConfig } from '@angular/material/dialog';");
 assert.equal(lib.bindSharedRoleToolkitFile(sourcePath,pinned).disposition,'exact-source-bytes');
 const binding=lib.bindSharedRoleToolkitFile(sourcePath,published);
 assert.equal(binding.observedDigest,'sha256:bf1da862895bb54e7c1843e777fd0d7868c2cc6cd357527f75056592c6f4e896');
 assert.match(binding.disposition,/dialog-behaviour-excluded/);
 for(const value of [published+'\n',published.replace('return','throw'),pinned.replace('MatLegacyDialog','OtherDialog')])assert.throws(()=>lib.bindSharedRoleToolkitFile(sourcePath,value),/SHARED_ROLE_TOOLKIT_UNREVIEWED_DELTA/);
 assert.throws(()=>lib.bindSharedRoleToolkitMap({sources:['../../../'+sourcePath],sourcesContent:[published]}),/SHARED_ROLE_TOOLKIT_SOURCE_UNIQUE/);
});
test('revocation replay preserves old-bearer 200 limitation and requires fresh-session denial',async()=>{
 const lib=await import('./lib/exui-shared-role-observations.mjs'),{manifest,context}=inputs(),binding=lib.sharedRoleObservationBinding(manifest,context);
 const actor={id:'same-actor',roles:['caseworker','caseworker-harness']}, before={state:state('synthetic-transition-written',1),history:[{id:'update'},{id:'create'}]};
 const value={schemaVersion:1,binding,complete:true,caseId:'1234567890123456',actor,identity:{before:{id:actor.id,roles:[...actor.roles,'caseworker-harness-allowed']},afterAccount:actor,afterAuthentication:actor,tokensDistinct:true},renewedSessionUser:actor,grantedRead:200,legitimateWrite:201,warmedRead:200,warmedResponse:lib.projectSharedRoleResponse(200,'synthetic-transition-written'),freshBearerRead:403,freshBearerResponse:lib.projectSharedRoleResponse(403,'Forbidden'),originalBearerRead:200,originalBearerResponse:lib.projectSharedRoleResponse(200,'synthetic-transition-written'),renewedCandidateRead:403,renewedCandidateResponse:lib.projectSharedRoleResponse(403,'Forbidden'),renewedCandidateWrite:403,renewedWriteResponse:lib.projectSharedRoleResponse(403,'Forbidden'),before,after:before,auditOnlyExceptions:[]};
 const replay=v=>lib.replaySharedRoleRevocation(v,{binding,actorId:actor.id,mutation:null});replay(value);
 for(const change of [v=>v.originalBearerRead=403,v=>v.identity.tokensDistinct=false,v=>v.identity.afterAccount.id='other',v=>v.renewedCandidateResponse.presentMarkers=['transition-written'],v=>delete v.originalBearerResponse,v=>v.after.history.push(3)]){const v=structuredClone(value);v.after=structuredClone(value.after);change(v);assert.throws(()=>replay(v));}
 const mutant={...value,complete:false,renewedCandidateRead:200,renewedCandidateResponse:lib.projectSharedRoleResponse(200,'synthetic-transition-written')};
 lib.replaySharedRoleRevocation(mutant,{binding,actorId:actor.id,mutation:'ccd-stale-revoked-bearer'});
 assert.throws(()=>lib.replaySharedRoleRevocation(value,{binding,actorId:actor.id,mutation:'ccd-stale-revoked-bearer'}));
});
test('all25 requirements bind to their actual phase, proof, invocation and baseline or mutated import',async()=>{
 const {sharedRoleNativePlan}=await import('./lib/exui-shared-role-native-binding.mjs');
 const {buildSharedPolicyContracts}=await import('./lib/exui-shared-policy-contracts.mjs');
 const {getReleasePolicy}=await import('./lib/exui-release-policy.mjs');
 const plan=sharedRoleNativePlan(),role=buildSharedPolicyContracts()[1];
 assert.equal(plan.length,25);
 assert.deepEqual(plan.map(x=>x.id).sort(),[...role.facets,...role.faults,...role.additionalSequences].map(x=>x.id).sort());
 for(const row of plan){
  const policy=getReleasePolicy(row.releaseScopeId);
  if(row.failureId){const mutation=policy.mutationDefinitions.find(x=>x.mutationId===row.invocationId);assert.equal(mutation.mutantProofId,row.proofId);assert.equal(mutation.expectedFailureId,row.failureId);}
  else assert(policy.obligations.some(x=>x.requiredProofIds.includes(row.proofId)));
 }
 assert.equal(plan.find(x=>x.id==='ccd-remove-courtadmin-recipient-read').importPath,'event-read-mutant-runtime/definition-import.json');
 assert.equal(plan.find(x=>x.id==='ccd-broaden-access').importPath,'ccd-runtime/definition-import.json');
});
test('shared role admission cannot use a replay receipt without fresh source-image inputs',async()=>{
 const {admitSharedRoleNative}=await import('./lib/exui-shared-role-native-binding.mjs');
 await assert.rejects(admitSharedRoleNative({replay:{bindingStatus:'verified',acceptedObligationIds:['configuration-shared:role-policy']}}),/SHARED_ROLE_SOURCE_IMAGE_REQUIRED/);
});
async function facetInput(){
 const lib=await import('./lib/exui-shared-role-native-binding.mjs');
 const record=lib.sharedRoleNativePlan()[0],{manifest}=inputs();
 manifest.releaseScopeId=record.releaseScopeId;
 manifest.identity.dependencyIdentities['ccd-definition']={artifactDigest:digest('definition-image'),apiContractDigest:digest('definition-api')};
 const observed={id:'HarnessNestedPRL',version:{number:1}};
 const imported={status:201,fixtureSelection:record.fixtureSelection,fixtureDigest:manifest.identity.definitionDigests.HarnessNestedPRL,observedDefinitionDigest:digest(JSON.stringify(observed)),definitionVersion:1,images:{data:{id:manifest.identity.dependencyIdentities.ccd.artifactDigest},definition:{id:manifest.identity.dependencyIdentities['ccd-definition'].artifactDigest}}};
 const importedBytes=Buffer.from(JSON.stringify(imported));
 manifest.runtimeMetadata.definitionImportDigest=digest(importedBytes);
 manifest.runtimeMetadata.observedDefinitionDigest=imported.observedDefinitionDigest;
 const execution={invocationId:'baseline',runId:manifest.runId,identity:manifest.identity};
 const proof={...execution,proofId:record.proofId,outcome:'passed',failureId:null,complete:true,retryIndex:0};
 return {lib,record,context:{phase:record.phase,manifest,execution,proof,importedBytes,observed}};
}
test('facet binding retains distinct import/run identities without treating binding as acceptance',async()=>{
 const {lib,record,context}=await facetInput();const result=lib.bindSharedRoleFacet(record,context);
 assert.equal(result.definitionImportDigest,digest(context.importedBytes));
 assert.equal(result.runId,context.manifest.runId);assert.equal(result.fixtureSelection,'event-capability-baseline');
 assert(!Object.hasOwn(result,'acceptedObligationIds'));
});
for(const [name,change] of [
 ['missing phase',r=>delete r.context.phase],['foreign phase',r=>r.context.phase='ccd'],
 ['missing import',r=>delete r.context.importedBytes],['changed import',r=>r.context.importedBytes=Buffer.from('{}')],
 ['wrong source import path',r=>r.record.importPath='ccd-runtime/definition-import.json'],
 ['missing proof',r=>delete r.context.proof],['wrong invocation',r=>r.context.execution={...r.context.execution,invocationId:'other'}],
 ['wrong artifact',r=>r.context.execution={...r.context.execution,identity:{...r.context.execution.identity,artifactDigest:digest('other')}}],
 ['wrong definition version',r=>r.context.observed.version.number=2],['failed baseline',r=>r.context.proof.outcome='failed'],
 ['retried proof',r=>r.context.proof.retryIndex=1],['different run',r=>r.context.proof={...r.context.proof,runId:'other'}],
])test(`facet binding rejects ${name}`,async()=>{const r=await facetInput();change(r);assert.throws(()=>r.lib.bindSharedRoleFacet(r.record,r.context));});
test('phase identity permits distinct configuration/import but rejects candidate, producer, source, browser or missing provenance',async()=>{
 const lib=await import('./lib/exui-shared-role-native-binding.mjs'),{manifest:ccd}=inputs();
 ccd.runtimeMetadata.harnessDependencyDigest=digest('dependencies');ccd.runtimeMetadata.browserDigest=digest('browser');
 const event=structuredClone(ccd);event.releaseScopeId='exui-ccd-event-capability-pilot';event.runId='event-run';event.identity.configurationDigest=digest('event-config');event.identity.definitionDigests.HarnessNestedPRL=digest('event-definition');
 lib.assertSharedRolePhaseIdentity(ccd,event);
 for(const change of [v=>v.harnessCommit='3'.repeat(40),v=>v.identity.artifactDigest=digest('other'),v=>v.runtimeMetadata.harnessSourceDigest=digest('other'),v=>v.runtimeMetadata.browserDigest=digest('other'),v=>delete v.runtimeMetadata.harnessDependencyDigest,v=>v.runtimeMetadata.harnessSourceState='dirty']){const v=structuredClone(event);change(v);assert.throws(()=>lib.assertSharedRolePhaseIdentity(ccd,v));}
 await assert.rejects(lib.replaySharedRoleNativeBindings({harnessRoot:process.cwd()}),/SHARED_ROLE_BOTH_PHASES_REQUIRED/);
});
test('observation, actor and context bytes require execution references and reject post-execution changes',async t=>{
 const lib=await import('./lib/exui-shared-role-artifacts.mjs');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'shared-role-bytes-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));fs.mkdirSync(path.join(root,'baseline'));
 for(const name of lib.sharedRoleArtifactNames('baseline'))fs.writeFileSync(path.join(root,'baseline',name),'{}');
 const execution={invocationId:'baseline',sharedRoleArtifacts:lib.captureSharedRoleArtifacts(root,'baseline')};
 for(const name of ['policy-observation.json','personas.json','context.json']){
  assert.equal(lib.readSharedRoleArtifact(root,execution,name).toString(),'{}');
  fs.writeFileSync(path.join(root,'baseline',name),'{"changed":true}');
  assert.throws(()=>lib.readSharedRoleArtifact(root,execution,name),/ARTIFACT_DIGEST_MISMATCH/);
  fs.writeFileSync(path.join(root,'baseline',name),'{}');
 }
 assert.throws(()=>lib.readSharedRoleArtifact(root,{invocationId:'baseline'},'policy-observation.json'),/SHARED_ROLE_EXECUTION_ARTIFACTS_REQUIRED/);
 assert.throws(()=>lib.readSharedRoleArtifact(root,{...execution,sharedRoleArtifacts:execution.sharedRoleArtifacts.slice(1)},'policy-observation.json'),/SHARED_ROLE_EXECUTION_ARTIFACT_SELECTION/);
 fs.unlinkSync(path.join(root,'baseline','policy-observation.json'));fs.symlinkSync(path.join(root,'baseline','personas.json'),path.join(root,'baseline','policy-observation.json'));
 assert.throws(()=>lib.captureSharedRoleArtifacts(root,'baseline'),/SHARED_ROLE_ARTIFACT_ALIAS/);
});
test('standard evidence receipt includes shared-role file bytes and rejects changed projection',async t=>{
 const {writeRunBundle}=require('./fixtures/exui-evidence-bundle.mock.cjs');
 const io=await import('./lib/exui-evidence-io.mjs'),{getReleasePolicy}=await import('./lib/exui-release-policy.mjs');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'shared-role-receipt-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const policy=getReleasePolicy('exui-ccd-pilot'),bundle=writeRunBundle(root,policy);
 const ref=bundle.run.executionArtifacts[0],execution=JSON.parse(fs.readFileSync(path.join(root,ref.path)));
 const dir=path.join(root,execution.invocationId);fs.mkdirSync(dir,{recursive:true});
 const observation=execution.invocationId+'/policy-observation.json';fs.writeFileSync(path.join(root,observation),'{}');
 execution.sharedRoleArtifacts=[{path:observation,digest:digest('{}')}];
 fs.writeFileSync(path.join(root,ref.path),JSON.stringify(execution));ref.digest=digest(JSON.stringify(execution));
 const loaded=io.readExecutionEvidence(root,ref,bundle.run.manifest,policy);
 assert(loaded.references.some(item=>item.path===observation&&item.digest===digest('{}')));
 fs.writeFileSync(path.join(root,observation),'{"tampered":true}');
 assert.throws(()=>io.readExecutionEvidence(root,ref,bundle.run.manifest,policy),/ARTIFACT_DIGEST_MISMATCH/);
});
