import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { hostDocker } from './exui-host-invocation.mjs';
import { digestBytes, writeJsonAtomic } from './exui-evidence-io.mjs';

const verifierCodes=new Set(["LOCAL_OCI_NONDEFAULT_CONFIG_OMITTED","LOCAL_OCI_ARCHIVE_SIZE", "LOCAL_OCI_ARTIFACT_SEAL", "LOCAL_OCI_BASE_DIFF_PREFIX", "LOCAL_OCI_BASE_IDENTITY", "LOCAL_OCI_BASE_INDEX_IDENTITY", "LOCAL_OCI_BASE_LAYER_PREFIX", "LOCAL_OCI_BASE_MANIFEST_IDENTITY", "LOCAL_OCI_BASE_PARENT_TYPE", "LOCAL_OCI_BLOB_DIGEST", "LOCAL_OCI_BLOB_SIZE", "LOCAL_OCI_COPY_HISTORY", "LOCAL_OCI_DERIVATIVE_LAYER_COUNT", "LOCAL_OCI_DESCRIPTOR", "LOCAL_OCI_DESCRIPTOR_DIGEST", "LOCAL_OCI_DESCRIPTOR_SIZE", "LOCAL_OCI_DIFF_ID", "LOCAL_OCI_DUPLICATE_ENTRY", "LOCAL_OCI_DUPLICATE_JSON_KEY", "LOCAL_OCI_DUPLICATE_LAYER", "LOCAL_OCI_ENTRY_PATH", "LOCAL_OCI_ENTRY_TYPE", "LOCAL_OCI_EXECUTION_CONFIG_CHANGED", "LOCAL_OCI_EXPANSION_LIMIT", "LOCAL_OCI_EXTRA_DIRECTORY", "LOCAL_OCI_EXTRA_ENTRY", "LOCAL_OCI_HISTORY_CHANGED", "LOCAL_OCI_INDEX_SCHEMA", "LOCAL_OCI_JAR_DIGEST", "LOCAL_OCI_JAR_MISSING", "LOCAL_OCI_JAR_SIZE", "LOCAL_OCI_JAR_TYPE_MODE", "LOCAL_OCI_JSON_SIZE", "LOCAL_OCI_LAYER_COUNT", "LOCAL_OCI_LAYER_DUPLICATE", "LOCAL_OCI_LAYER_EXTENDED_ATTRIBUTES", "LOCAL_OCI_LAYER_EXTRA_PATH", "LOCAL_OCI_LAYER_PARENT_TYPE", "LOCAL_OCI_LAYOUT_VERSION", "LOCAL_OCI_MANIFEST_COUNT", "LOCAL_OCI_MANIFEST_SCHEMA", "LOCAL_OCI_PARENT_METADATA_CHANGED", "LOCAL_OCI_PLATFORM", "LOCAL_OCI_PROVENANCE_SEAL", "LOCAL_OCI_PROVENANCE_SEALS", "LOCAL_OCI_REGULAR_FILE_REQUIRED", "LOCAL_OCI_ROOTFS", "LOCAL_OCI_SHORT_ENTRY", "LOCAL_OCI_SOURCE_PROVENANCE", "LOCAL_OCI_TOTAL_EXPANSION_LIMIT", "LOCAL_OCI_TOTAL_SIZE", "LOCAL_OCI_UNREFERENCED_BLOB", "LOCAL_OCI_VERIFICATION_FAILED"]);
export function safeLocalCcdFailure(error) { return verifierCodes.has(error?.message)?error.message:'LOCAL_CCD_OCI_COMMAND_FAILED'; }
const verifier=fileURLToPath(new URL('../verify-local-ccd-oci.py',import.meta.url));
const dockerfile='# ccd_base must be a verified immutable OCI-layout named build context.\nFROM ccd_base\nCOPY --chmod=0644 core-case-data.jar /opt/app/core-case-data.jar\n';
export function verifyLocalCcdDerivative({baseArchive,derivedArchive,artifactRoot,materializeBase}, {run=spawnSync}={}) {
 const args=[verifier,'--base',path.resolve(baseArchive),'--artifact-root',path.resolve(artifactRoot)];
 if(derivedArchive)args.push('--derived',path.resolve(derivedArchive));
 if(materializeBase)args.push('--materialize-base',path.resolve(materializeBase));
 const result=run('python3',args,{encoding:'utf8',timeout:300000,maxBuffer:4*1024*1024,env:{PATH:process.env.PATH,HOME:process.env.HOME}});
 if(result.error||result.status!==0) {
  let code;try { code=JSON.parse(result.stdout).error; } catch { /* Never publish raw process output. */ }
  throw new Error(verifierCodes.has(code)?code:'LOCAL_CCD_OCI_VERIFICATION_FAILED');
 }
 const receipt=JSON.parse(result.stdout);
 assert(!receipt.error,'LOCAL_CCD_OCI_VERIFICATION_FAILED');
 return receipt;
}
export function assertLocalCcdLoadedIdentity(info,receipt) {
 assert.equal(receipt.kind,'verified-local-oci-ccd-derivative','LOCAL_CCD_PROFILE_REQUIRED');
 assert.equal(receipt.profile,'ccd-results-internal-id-fix-feasibility','LOCAL_CCD_PROFILE_REQUIRED');
 assert.equal(receipt.runtimeAcceptance,false,'LOCAL_CCD_NO_ACCEPTANCE');
 assert.equal(receipt.catalogueCredit,false,'LOCAL_CCD_NO_ACCEPTANCE');
 assert.equal(receipt.releaseCredit,false,'LOCAL_CCD_NO_ACCEPTANCE');
 assert([receipt.configDigest,receipt.manifestDigest,receipt.indexDocumentDigest].filter(Boolean).includes(info?.Id),'LOCAL_CCD_CONFIG_ID');
 assert.equal(`${info.Os}/${info.Architecture}`,'linux/arm64','LOCAL_CCD_PLATFORM');
 assert.deepEqual(info.RootFS?.Layers,receipt.rootfsDiffIds,'LOCAL_CCD_ROOTFS');
 const keys=['User','Entrypoint','Cmd','Env','WorkingDir','ExposedPorts','Volumes','Healthcheck','Labels','StopSignal','OnBuild','Shell','ArgsEscaped'];
 for(const key of keys)assert.deepEqual(info.Config?.[key]??null,receipt.executionConfig[key]??null,'LOCAL_CCD_EXECUTION_CONFIG');
}
export function buildLocalCcdDerivative({baseArchive,artifactRoot,output,builder},{docker=hostDocker,verify=verifyLocalCcdDerivative}={}) {
 assert(typeof builder==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,62}$/.test(builder),'LOCAL_CCD_EXISTING_BUILDER_REQUIRED');
 assert.equal(digestBytes(dockerfile),'sha256:f92a350909b51190262f26d7b22346d390a886603d7c2dc9137cd2ad1a863d11','LOCAL_CCD_DOCKERFILE_SEAL');
 output=path.resolve(output);fs.mkdirSync(output,{mode:0o700});
 const baseLayout=path.join(output,'verified-base');
 const base=verify({baseArchive,artifactRoot,materializeBase:baseLayout});
 const context=path.join(output,'context');fs.mkdirSync(context,{mode:0o700});
 fs.copyFileSync(path.join(artifactRoot,'core-case-data.jar'),path.join(context,'core-case-data.jar'),fs.constants.COPYFILE_EXCL);
 fs.writeFileSync(path.join(context,'Dockerfile'),dockerfile,{flag:'wx'});
 const archive=path.join(output,'corrected-ccd.oci.tar');
 const planned={schemaVersion:1,status:'planned',profile:'ccd-results-internal-id-fix-feasibility',baseArchive:path.resolve(baseArchive),artifactRoot:path.resolve(artifactRoot),base,derivedArchive:archive,dockerfileDigest:digestBytes(dockerfile),runtimeAcceptance:false,catalogueCredit:false,releaseCredit:false};
 writeJsonAtomic(path.join(output,'build-receipt.json'),planned);
 try {
  docker(['buildx','build','--builder',builder,'--platform','linux/arm64','--provenance=false','--sbom=false','--build-context',`ccd_base=oci-layout://${baseLayout}@${base.baseManifestDigest}`,'--output',`type=oci,dest=${archive}`,context],{timeout:600000});
  const receipt=verify({baseArchive,derivedArchive:archive,artifactRoot});
  assert.equal(receipt.baseArchiveDigest,base.baseArchiveDigest,'LOCAL_CCD_BASE_CHANGED');
  assert.equal(receipt.artifactProvenanceDigest,base.artifactProvenanceDigest,'LOCAL_CCD_PROVENANCE_CHANGED');
  const result={...planned,status:'verified',verification:receipt};writeJsonAtomic(path.join(output,'build-receipt.json'),result);return result;
 } catch(error) {
  const code=verifierCodes.has(error?.message)?error.message:'LOCAL_CCD_BUILD_OR_VERIFY_FAILED';
  writeJsonAtomic(path.join(output,'build-receipt.json'),{...planned,status:'failed',error:code});
  throw new Error(code);
 }
}
export function loadLocalCcdDerivative({baseArchive,derivedArchive,artifactRoot,output},{docker=hostDocker,verify=verifyLocalCcdDerivative}={}) {
 // Re-verify bytes now; a self-reported profile or prior successful receipt is not load authority.
 const receipt=verify({baseArchive,derivedArchive,artifactRoot});
 const archiveDigest=digestBytes(fs.readFileSync(derivedArchive));
 assert.equal(archiveDigest,receipt.archiveDigest,'LOCAL_CCD_ARCHIVE_CHANGED');
 docker(['load','--input',path.resolve(derivedArchive)],{timeout:300000});
 assert.equal(digestBytes(fs.readFileSync(derivedArchive)),receipt.archiveDigest,'LOCAL_CCD_ARCHIVE_CHANGED');
 let info;
 for(const identity of [receipt.manifestDigest,receipt.configDigest,receipt.indexDocumentDigest].filter(Boolean)) {
  try { info=JSON.parse(docker(['image','inspect',identity]))[0]; break; } catch { /* An untagged image may be addressed by its manifest or config identity. */ }
 }
 assert(info,'LOCAL_CCD_LOADED_IDENTITY_UNAVAILABLE');
 assertLocalCcdLoadedIdentity(info,receipt);
 const profile={...receipt,status:'loaded-and-verified',imageId:info.Id,baseArchive:path.resolve(baseArchive),derivedArchive:path.resolve(derivedArchive),artifactRoot:path.resolve(artifactRoot)};
 writeJsonAtomic(path.join(output,'local-ccd-profile.json'),profile);return profile;
}
