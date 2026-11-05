import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {NATIVE_HARNESS_SOURCE_FILES} from './exui-native-sources.mjs';

// This is a separate feasibility closure. It does not extend any release selector.
export const PROFILE_SOURCE_FILES=Object.freeze([...NATIVE_HARNESS_SOURCE_FILES,
  'scripts/lib/exui-source-profile-jurisdictions.mjs',
  'scripts/lib/exui-source-profile-provider.mjs',
  'scripts/lib/exui-source-profile-wa-health.mjs',
  'scripts/lib/exui-source-profile-wa-membership.mjs',
  'scripts/lib/exui-source-profile-divorce-consumers.mjs',
  'scripts/lib/exui-source-profile-divorce-provider.mjs',
  'scripts/lib/exui-source-profile-sources.mjs',
  'scripts/lib/exui-divorce-profile-contract.mjs',
  'scripts/lib/exui-divorce-profile-browser.mjs',
  'scripts/lib/exui-divorce-profile-browser-provider.mjs',
  'playwright.divorce-profile.config.mjs',
  'src/fixtures/harnessDivorceProfile.ts',
  'src/tests/harness/divorce-profile/jurisdiction.spec.ts',
  'src/tests/harness/divorce-profile/global-search.spec.ts',
  'scripts/run-harness-source-profile-jurisdictions.mjs',
  'scripts/source-profile-jurisdictions-worker.mjs',
]);
const digest=bytes=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
export function stageProfileSources(destination,sourceRoot) {
  assert(!fs.existsSync(destination),'SOURCE_PROFILE_FRESH_SOURCES_REQUIRED');
  fs.mkdirSync(destination,{mode:0o755});const seals={};
  for(const name of PROFILE_SOURCE_FILES) {
    const source=path.join(sourceRoot,name);
    assert(fs.lstatSync(source).isFile()&&fs.realpathSync(source)===source,'SOURCE_PROFILE_SOURCE_ALIAS');
    const bytes=fs.readFileSync(source),target=path.join(destination,name);
    fs.mkdirSync(path.dirname(target),{recursive:true,mode:0o755});
    fs.writeFileSync(target,bytes,{flag:'wx',mode:0o444});seals[name]=digest(bytes);
  }
  fs.writeFileSync(path.join(destination,'profile-source-seals.json'),JSON.stringify(seals),{flag:'wx',mode:0o444});
  return {files:seals,digest:digest(JSON.stringify(seals))};
}
export function verifyProfileSources(directory,expectedDigest) {
  const seals=JSON.parse(fs.readFileSync(path.join(directory,'profile-source-seals.json')));
  assert.deepEqual(Object.keys(seals).sort(),[...PROFILE_SOURCE_FILES].sort(),'SOURCE_PROFILE_SOURCE_INVENTORY');
  for(const name of PROFILE_SOURCE_FILES) {
    const file=path.join(directory,name),info=fs.lstatSync(file);
    assert(info.isFile()&&fs.realpathSync(file)===file,'SOURCE_PROFILE_SOURCE_ALIAS');
    assert.equal(digest(fs.readFileSync(file)),seals[name],'SOURCE_PROFILE_SOURCE_CHANGED');
    assert.equal(info.mode&0o222,0,'SOURCE_PROFILE_SOURCE_CHANGED');
  }
  const actual=digest(JSON.stringify(seals));
  if(expectedDigest)assert.equal(actual,expectedDigest,'SOURCE_PROFILE_SOURCE_CHANGED');
  return {digest:actual};
}
const codes=new Set(`DIVORCE_PROFILE_BROWSER_FLAGS DIVORCE_PROFILE_FACET DIVORCE_PROFILE_BROWSER_REQUIRED DIVORCE_PROFILE_BROWSER_OBSERVATION DIVORCE_PROFILE_BROWSER_JOURNAL DIVORCE_PROFILE_BROWSER_TERMINAL DIVORCE_PROFILE_BROWSER_REPORT DIVORCE_PROFILE_BROWSER_ASSETS DIVORCE_PROFILE_BROWSER_EGRESS DIVORCE_PROFILE_GLOBAL_ASSERTION
SOURCE_PROFILE_DIVORCE_CONFIG SOURCE_PROFILE_DIVORCE_OBSERVATIONS SOURCE_PROFILE_DIVORCE_JOURNAL SOURCE_PROFILE_DIVORCE_TRANSPORT SOURCE_PROFILE_DIVORCE_CSRF SOURCE_PROFILE_DIVORCE_STAFF_ASSERTION SOURCE_PROFILE_DIVORCE_MAPPING_ASSERTION
SOURCE_PROFILE_MEMBERSHIP_CONFIG SOURCE_PROFILE_MEMBERSHIP_OBSERVATIONS SOURCE_PROFILE_MEMBERSHIP_TRANSPORT SOURCE_PROFILE_MEMBERSHIP_RESPONSE SOURCE_PROFILE_MEMBERSHIP_JOURNAL SOURCE_PROFILE_MEMBERSHIP_CSRF SOURCE_PROFILE_WA_MEMBERSHIP_ASSERTION
SOURCE_PROFILE_HEALTH_CONFIG SOURCE_PROFILE_HEALTH_TRANSPORT SOURCE_PROFILE_HEALTH_DEPENDENCIES SOURCE_PROFILE_HEALTH_UNHEALTHY SOURCE_PROFILE_HEALTH_DESTINATIONS SOURCE_PROFILE_HEALTH_JOURNAL_CHANGED SOURCE_PROFILE_WA_HEALTH_ASSERTION SOURCE_PROFILE_UNKNOWN_FAULT SOURCE_PROFILE_CONFIG_DRIFT SOURCE_PROFILE_REVISION_DRIFT
SOURCE_PROFILE_JURISDICTION_SOURCE SOURCE_PROFILE_WA_DEFAULT SOURCE_PROFILE_ACCESS SOURCE_PROFILE_OBSERVATION_COUNT
SOURCE_PROFILE_UPSTREAM_COUNT SOURCE_PROFILE_ACCESS_PARTITION SOURCE_PROFILE_TRANSPORT SOURCE_PROFILE_CACHE_CHANGED
SOURCE_PROFILE_UID_OR_CACHE SOURCE_PROFILE_FAULT_NOT_EFFECTIVE SOURCE_PROFILE_INTERPRETATION SOURCE_PROFILE_JURISDICTION_ASSERTION
SOURCE_PROFILE_SESSION_REQUIRED SOURCE_PROFILE_SESSION_NOT_FRESH SOURCE_PROFILE_JOURNAL_REQUIRED SOURCE_PROFILE_SOURCE_INVENTORY SOURCE_PROFILE_SOURCE_CHANGED
SOURCE_PROFILE_SOURCE_ALIAS SOURCE_PROFILE_INPUT_INVALID SOURCE_PROFILE_INVOCATION_INVALID SOURCE_PROFILE_ARTIFACT_CHANGED
SOURCE_PROFILE_WORKER_RESULT SOURCE_PROFILE_FRAMEWORK_TERMINAL SOURCE_PROFILE_OBSERVATION_BINDING SOURCE_PROFILE_CANCELLED
SOURCE_PROFILE_CLEANUP_REQUIRED SOURCE_PROFILE_RUNTIME_PLATFORM SOURCE_PROFILE_MODULE_MISSING
HOST_PROVIDER_STARTUP_EXIT HOST_PROVIDER_STARTUP_TIMEOUT HOST_NAMESPACE_EGRESS_AVAILABLE HOST_UNDECLARED_DESTINATION
HOST_FRAMEWORK_TERMINATION_MISMATCH HOST_PROVIDER_SHUTDOWN_FAILED HOST_OWNED_RESOURCE_CLEANUP_FAILED
HOST_CANDIDATE_SEALED_NODE_VERSION HOST_INVOCATION_CANCELLED NATIVE_API_RUNTIME_OS NATIVE_API_RUNTIME_ARCH
NATIVE_API_RUNTIME_PROVENANCE NATIVE_RUNTIME_PLATFORM_MISMATCH NATIVE_RUNTIME_IMAGE_MISMATCH
NATIVE_RUNTIME_PROVENANCE_REQUIRED HOST_DOCKER_IMAGE_FAILED`.split(/\s+/));
export function profileFailureCode(error) {const token=error?.message?.split(/[\s:]/,1)[0];return codes.has(token)?token:error?.code==='ERR_MODULE_NOT_FOUND'?'SOURCE_PROFILE_MODULE_MISSING':'SOURCE_PROFILE_UNCLASSIFIED';}
