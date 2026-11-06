import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {hostDocker} from './exui-host-invocation.mjs';
import {verifyLocalCcdDerivative,assertLocalCcdLoadedIdentity} from './exui-local-ccd-oci.mjs';
export function verifyLocalCcdRuntimeProfile(profilePath,{verify=verifyLocalCcdDerivative,docker=hostDocker}={}) {
 assert(typeof profilePath==='string'&&path.isAbsolute(profilePath),'LOCAL_CCD_EXPLICIT_PROFILE_REQUIRED');
 assert(fs.lstatSync(profilePath).isFile()&&!fs.lstatSync(profilePath).isSymbolicLink(),'LOCAL_CCD_PROFILE_FILE_REQUIRED');
 const profile=JSON.parse(fs.readFileSync(profilePath,'utf8'));
 assert.equal(profile.status,'loaded-and-verified','LOCAL_CCD_LOADED_PROFILE_REQUIRED');
 for(const key of ['baseArchive','derivedArchive','artifactRoot'])assert(typeof profile[key]==='string'&&path.isAbsolute(profile[key]),'LOCAL_CCD_PROFILE_PATH_REQUIRED');
 const fresh=verify(profile);
 for(const [key,value] of Object.entries(fresh))assert.deepEqual(profile[key],value,'LOCAL_CCD_PROFILE_DRIFT');
 assert([fresh.configDigest,fresh.manifestDigest,fresh.indexDocumentDigest].includes(profile.imageId),'LOCAL_CCD_IMAGE_ID_REQUIRED');
 const info=JSON.parse(docker(['image','inspect',profile.imageId]))[0];
 assertLocalCcdLoadedIdentity(info,fresh);
 assert.equal(info.Id,profile.imageId,'LOCAL_CCD_IMAGE_ID_REQUIRED');
 return {profilePath:path.resolve(profilePath),imageId:info.Id,verification:fresh,info};
}
export function assertLocalCcdRuntimeScope({platform='linux/arm64',elasticsearch,fixtureSelection='nested-prl'}) {
 assert.equal(platform,'linux/arm64','LOCAL_CCD_ARM64_REQUIRED');
 assert.equal(elasticsearch,true,'LOCAL_CCD_RESULTS_ES_REQUIRED');
 assert.equal(fixtureSelection,'nested-prl','LOCAL_CCD_RESULTS_BASELINE_REQUIRED');
}
