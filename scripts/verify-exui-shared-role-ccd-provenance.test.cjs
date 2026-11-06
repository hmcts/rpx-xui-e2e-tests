const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const os=require('node:os');
const {createHash}=require('node:crypto');
const hash=value=>'sha256:'+createHash('sha256').update(value).digest('hex');
const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/ccd/shared-role-ccd-class-witnesses.json')));
function proof(){return {
 schemaVersion:1,kind:'reproduced-shared-role-ccd-source-image',boundary:'six-reviewed-role-consumer-classes; corrected-JAR-reproduced; original-JAR-not-rebuilt',
 ...Object.fromEntries(['sourceCommit','sourceGitTree','rebuiltJarDigest','roleClasses'].map(key=>[key,structuredClone(fixture[key])])),
 sourceArchiveDigest:'sha256:1ee713ac9a171a705304078d344b89a59605312237d0ea0a6078e1f30d6d3944',correctedSourceInventoryDigest:'sha256:0ec9d46c267cbf9c4d8525545abe88797b93fd8b1b864dd2a64f73dde9fd9658',patchDigest:'sha256:41ab60a783ac59754a090cc051ffd7fb738c7d3dd087a42d69730145028088a5',artifactProvenanceDigest:'sha256:15b637ed05be1ac24b26e36b52d0a136915a8ce6d992ec7247c643dc1985d0f8',
 image:{platform:'linux/arm64',archiveDigest:'sha256:2230803a638cc9c5285cbb64ee2992d6db99d4668ee9d386658adf866d299929',manifestDigest:'sha256:0ec6bc39e2ba42645931c4f01f74beb84ff678770ea9c709b8c08cf1eb8c6ff4',configDigest:'sha256:7adc1b81292de0aaec6c316e43e19b4e63e46779d1d5d91671f28150254ebe80',rootfsDiffIds:[hash('unit-base'),hash('unit-copy')]},
 originalImage:{imageId:'sha256:230af88ec4791950396e7a78f2dc330018d1a259242e317f4374ec5a384d30c0',manifestDigest:'sha256:2b1b4208520244122d1ebfdc4fbdf7d1120fc0a1bacecb9bba06583762571e9b',configDigest:'sha256:58a53f7013ff354a312ff4e35a5b2af81d3094600ff30622262c5100554f57da',archiveDigest:'sha256:184a3664f57676c3147211ebcbb5cc162eac795efc15f9a55d9e7df512fb8591',jarDigest:'sha256:1c3afe85796f549b29c14378f22ba9b3069488d04ad93b42983d8a6e79db06fc',sourceBuildCommit:fixture.sourceCommit,platform:'linux/arm64',rootfsDiffIds:[hash('unit-base')]},
 toolchain:{javaVersion:'Temurin-21.0.12+8',javacVersion:'javac 21.0.12',javaExecutableDigest:hash('unit-java'),javacExecutableDigest:hash('unit-javac'),gradleWrapperDigest:hash('unit-gradle')},buildLogDigest:hash('unit-log'),runtimeAcceptance:false,catalogueCredit:false,releaseCredit:false,
};}
function runtime(image,architecture='arm64'){
 const {completeRun}=require('./fixtures/exui-release-evidence.mock.cjs');const manifest=completeRun().manifest;
 manifest.releaseScopeId='exui-ccd-pilot';manifest.identity.dependencyIdentities.ccd={artifactDigest:image,apiContractDigest:hash('api')};manifest.identity.definitionDigests={HarnessNestedPRL:hash('definition')};
 const imported={status:201,images:{data:{id:image,architecture}},fixtureDigest:hash('definition'),observedDefinitionDigest:hash('observed'),definitionVersion:1};
 const bytes=Buffer.from(JSON.stringify(imported));Object.assign(manifest.runtimeMetadata,{definitionImportDigest:hash(bytes),observedDefinitionDigest:hash('observed'),definitionVersion:'1'});
 return{manifest,bytes};
}
test('source archive/tree/class extraction checks are executable offline',()=>{
 const result=spawnSync('python3',['scripts/verify-shared-role-ccd-source.test.py'],{encoding:'utf8',env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});assert.equal(result.status,0,result.stderr);
});
test('exact six consumers bind original or corrected imported runtime without whole-JAR or catalogue claim',async()=>{
 const lib=await import('./lib/exui-shared-role-ccd-provenance.mjs'),p=proof();
 for(const image of [p.originalImage.imageId,p.image.manifestDigest]){const r=runtime(image),result=lib.bindSharedRoleCcdRuntime(p,r.manifest,r.bytes);assert.equal(result.runtimeImageDigest,image);assert.equal(result.catalogueCredit,false);assert.match(result.boundary,/original-JAR-not-rebuilt/);}
});
for(const [name,change] of [
 ['changed class',p=>p.roleClasses[0].classDigest=hash('other')],['missing class',p=>p.roleClasses.pop()],['changed source',p=>p.roleClasses[0].sourceDigest=hash('other')],
 ['wrong commit',p=>p.sourceCommit='1'.repeat(40)],['wrong archive',p=>p.sourceArchiveDigest=hash('other')],['wrong original image',p=>p.originalImage.imageId=hash('other')],['wrong corrected image',p=>p.image.manifestDigest=hash('other')],
 ['wrong original build commit',p=>p.originalImage.sourceBuildCommit='2'.repeat(40)],['implicit credit',p=>p.catalogueCredit=true],['missing toolchain',p=>delete p.toolchain],['extra authority flag',p=>p.verified=true],
])test(`source proof rejects ${name}`,async()=>{const lib=await import('./lib/exui-shared-role-ccd-provenance.mjs'),p=proof();change(p);assert.throws(()=>lib.validateSharedRoleCcdSourceProof(p));});
for(const [name,change] of [
 ['wrong runtime image',r=>r.manifest.identity.dependencyIdentities.ccd.artifactDigest=hash('foreign')],
 ['different import bytes',r=>r.bytes=Buffer.from('{}')],['wrong import digest',r=>r.manifest.runtimeMetadata.definitionImportDigest=hash('foreign')],
 ['wrong fixture',r=>r.manifest.identity.definitionDigests.HarnessNestedPRL=hash('foreign')],['wrong observed definition',r=>r.manifest.runtimeMetadata.observedDefinitionDigest=hash('foreign')],
])test(`runtime binding rejects ${name}`,async()=>{const lib=await import('./lib/exui-shared-role-ccd-provenance.mjs'),p=proof(),r=runtime(p.originalImage.imageId);change(r);assert.throws(()=>lib.bindSharedRoleCcdRuntime(p,r.manifest,r.bytes));});
test('reproduction entrypoint rejects caller receipt or acceptance flags before launching anything',async()=>{
 const {reproduceSharedRoleCcdSource}=await import('./lib/exui-shared-role-ccd-provenance.mjs');
 assert.throws(()=>reproduceSharedRoleCcdSource({proof:proof(),verified:true}),/SHARED_CCD_INPUT_SCHEMA/);
});
test('AMD64 source verifier rejects unsealed source before Docker or Gradle execution',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'shared-amd64-negative-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const archive=path.join(root,'source.tar.gz');fs.writeFileSync(archive,'changed source bytes');
 const output=path.join(root,'proof');
 const result=spawnSync('python3',[path.join(__dirname,'verify-shared-role-amd64-source.py'),'--source-archive',archive,'--java-home',root,'--gradle-home',root,'--output',output],{encoding:'utf8'});
 assert.equal(result.status,2);assert.deepEqual(JSON.parse(result.stdout),{status:'BLOCKED',code:'SHARED_AMD64_ARCHIVE_DIGEST',catalogueCredit:false});
 assert.equal(fs.existsSync(output),false);
});
test('AMD64 proof is validated independently and binds only the exact imported runtime',async()=>{
 const lib=await import('./lib/exui-shared-role-ccd-provenance.mjs');
 const witness=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/ccd/shared-role-amd64-source-witnesses.json')));
 const p={schemaVersion:1,kind:'reproduced-shared-role-amd64-source-image',...witness,runtimeAcceptance:false,catalogueCredit:false,releaseCredit:false};
 delete p.imageConfigDigest;
 const r=runtime(p.imageManifestDigest,'amd64');
 const bound=lib.bindSharedRoleAmd64Runtime(p,r.manifest,r.bytes);
 assert.equal(bound.runtimeImageDigest,p.imageManifestDigest);assert.equal(bound.catalogueCredit,false);
 for(const change of [x=>x.roleClasses[0].classDigest=hash('foreign'),x=>x.catalogueCredit=true,x=>x.jarDigest=hash('foreign')]){
  const altered=structuredClone(p);change(altered);assert.throws(()=>lib.validateSharedRoleAmd64Proof(altered));
 }
 const wrong=runtime(hash('foreign'),'amd64');assert.throws(()=>lib.bindSharedRoleAmd64Runtime(p,wrong.manifest,wrong.bytes));
 const arm=runtime(p.imageManifestDigest);assert.throws(()=>lib.bindSharedRoleAmd64Runtime(p,arm.manifest,arm.bytes));
 assert.throws(()=>lib.reproduceSharedRoleAmd64Source({proof:p,verified:true}),/SHARED_AMD64_INPUT_SCHEMA/);
});

const standardWitness=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/ccd/shared-role-standard-arm-source-witnesses.json')));
function standardProof(){return {
 schemaVersion:1,kind:'reproduced-standard-arm-role-source-image',boundary:'eight-reviewed-role-consumer-classes; original-standard-ARM-JAR-bytes; no-whole-image-claim',
 ...structuredClone(standardWitness),compilerRecipe:['-J-Xmx1G','-J-XX:ActiveProcessorCount=2','-g','-parameters','-encoding','UTF-8','--release','21','-implicit:none'],
 orderedClasspath:[{entry:'application',digest:hash('stripped application')},{entry:'BOOT-INF/lib/support.jar',digest:hash('stripped support')}],
 inputManifestDigest:hash('before/after inputs'),compilerExitCode:0,inputsUnchanged:true,sourceComplete:false,runtimeAcceptance:false,catalogueCredit:false,releaseCredit:false,
};}
test('original ARM eight consumers preserve the six-class seal and bind only original imported runtime',async()=>{
 const lib=await import('./lib/exui-shared-role-ccd-provenance.mjs'),p=standardProof();
 assert.deepEqual(p.roleClasses.slice(0,6),fixture.roleClasses);
 const r=runtime(p.originalImage.imageId),bound=lib.bindSharedRoleStandardArmRuntime(p,r.manifest,r.bytes);
 assert.equal(bound.jarDigest,p.originalImage.jarDigest);assert.equal(bound.catalogueCredit,false);
 assert.match(bound.boundary,/eight-reviewed/);
 for(const image of [proof().image.manifestDigest,hash('AMD64')]){
  const wrong=runtime(image);assert.throws(()=>lib.bindSharedRoleStandardArmRuntime(p,wrong.manifest,wrong.bytes),/STANDARD_ROLE_RUNTIME_IMAGE/);
 }
 const wrong=runtime(p.originalImage.imageId,'amd64');assert.throws(()=>lib.bindSharedRoleStandardArmRuntime(p,wrong.manifest,wrong.bytes),/STANDARD_ROLE_IMPORT_PLATFORM/);
 assert.throws(()=>lib.validateSharedRoleCcdSourceProof(p),/SHARED_CCD_PROOF_SCHEMA/);
 assert.throws(()=>lib.validateSharedRoleStandardArmProof(proof()),/STANDARD_ROLE_PROOF_SCHEMA/);
 assert.throws(()=>lib.reproduceSharedRoleStandardArmSource({proof:p,verified:true}),/STANDARD_ROLE_INPUT_SCHEMA/);
});
for(const [name,change] of [
 ['source bytes',p=>p.roleClasses[7].sourceDigest=hash('changed')],['nested family bytes',p=>p.roleClasses[0].classes[0].digest=hash('changed')],
 ['missing family',p=>p.roleClasses.pop()],['wrong JAR',p=>p.originalImage.jarDigest=hash('changed')],['wrong image',p=>p.originalImage.imageId=hash('changed')],
 ['processor bytes',p=>p.toolchainDigests['lombok-1.18.46.jar']=hash('changed')],['processor configuration',p=>p.processorConfigurationDigest=hash('changed')],
 ['compiler flags',p=>p.compilerRecipe.push('-proc:none')],['duplicate classpath',p=>p.orderedClasspath.push(p.orderedClasspath[0])],
 ['changed inputs',p=>p.inputsUnchanged=false],['partial compile',p=>p.compilerExitCode=1],['whole source claim',p=>p.sourceComplete=true],
 ['implicit runtime',p=>p.runtimeAcceptance=true],['implicit catalogue',p=>p.catalogueCredit=true],
])test(`original ARM source proof rejects ${name}`,async()=>{
 const lib=await import('./lib/exui-shared-role-ccd-provenance.mjs'),p=standardProof();change(p);assert.throws(()=>lib.validateSharedRoleStandardArmProof(p));
});
test('original ARM producer rejects wrong archive before creating output or invoking compiler',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'standard-role-negative-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const archive=path.join(root,'source.tar.gz'),base=path.join(root,'base.tar'),processor=path.join(root,'processor.jar'),output=path.join(root,'proof');
 for(const file of [archive,base,processor])fs.writeFileSync(file,'foreign input');
 const result=spawnSync('python3',['-B',path.join(__dirname,'verify-shared-role-standard-arm-source.py'),'--source-archive',archive,'--base-archive',base,'--java-home',root,'--lombok-jar',processor,'--output',output],{encoding:'utf8'});
 assert.equal(result.status,2);assert.deepEqual(JSON.parse(result.stdout),{status:'rejected',code:'STANDARD_ROLE_REPRODUCTION_FAILED'});assert.equal(fs.existsSync(output),false);
});
test('production shadow scan rejects target top, nested and multi-release families in any support or processor ZIP',()=>{
 const script=`import importlib.util,tempfile,zipfile,pathlib
s=importlib.util.spec_from_file_location('standard','scripts/verify-shared-role-standard-arm-source.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
with tempfile.TemporaryDirectory() as temporary:
 p=pathlib.Path(temporary).resolve()/'support.jar'
 for entry in ['a/Role.class','a/Role$Nested.class','META-INF/versions/21/a/Role.class','META-INF/versions/21/a/Role$Nested.class']:
  with zipfile.ZipFile(p,'w') as z:z.writestr(entry,b'shadow')
  try:m.assert_no_shadow([p],['a/Role'])
  except ValueError as error:assert str(error)=='STANDARD_ROLE_SHADOW_CLASS'
  else:raise AssertionError('shadow accepted: '+entry)
 with zipfile.ZipFile(p,'w') as z:z.writestr('a/RoleOther.class',b'support')
 m.assert_no_shadow([p],['a/Role'])
`;
 const result=spawnSync('python3',['-B','-c',script],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);
});
test('production manifest capture cannot rebaseline a tool changed after its fixed witness check',()=>{
 const script=`import importlib.util,tempfile,pathlib
s=importlib.util.spec_from_file_location('standard','scripts/verify-shared-role-standard-arm-source.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
with tempfile.TemporaryDirectory() as temporary:
 p=pathlib.Path(temporary).resolve()/'compiler';p.write_bytes(b'original verified compiler')
 expected={str(p):m.hash_file(p)}
 p.write_bytes(b'changed after initial verification')
 try:m.capture_inputs([p],expected)
 except ValueError as error:assert str(error)=='STANDARD_ROLE_INPUT_CHANGED_BEFORE_COMPILATION'
 else:raise AssertionError('changed tool rebaselined')
`;
 const result=spawnSync('python3',['-B','-c',script],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);
});
