import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { digestBytes } from './exui-evidence-io.mjs';
import { validateRunManifest } from './exui-release-evidence.mjs';

const fixtureBytes = fs.readFileSync(new URL('../fixtures/ccd/shared-role-ccd-class-witnesses.json', import.meta.url));
assert.equal(digestBytes(fixtureBytes), 'sha256:4ae153dfdced674ae3b79478515cdd306035c8bea587152d727d1476f72a3851', 'SHARED_CCD_CLASS_INVENTORY_SEAL');
const fixture = JSON.parse(fixtureBytes);
const originalImage = 'sha256:230af88ec4791950396e7a78f2dc330018d1a259242e317f4374ec5a384d30c0';
const correctedImage = 'sha256:0ec6bc39e2ba42645931c4f01f74beb84ff678770ea9c709b8c08cf1eb8c6ff4';
const originalJar = 'sha256:1c3afe85796f549b29c14378f22ba9b3069488d04ad93b42983d8a6e79db06fc';
const boundary = 'six-reviewed-role-consumer-classes; corrected-JAR-reproduced; original-JAR-not-rebuilt';
const exact = (value, keys, code) => assert.deepEqual(Object.keys(value ?? {}).sort(), [...keys].sort(), code);
const digest = value => typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value);
export function validateSharedRoleCcdSourceProof(proof) {
  exact(proof, ['schemaVersion','kind','boundary','sourceCommit','sourceGitTree','sourceArchiveDigest','correctedSourceInventoryDigest','patchDigest','rebuiltJarDigest','artifactProvenanceDigest','roleClasses','originalImage','image','toolchain','buildLogDigest','runtimeAcceptance','catalogueCredit','releaseCredit'], 'SHARED_CCD_PROOF_SCHEMA');
  assert.equal(proof?.schemaVersion, 1, 'SHARED_CCD_PROOF_SCHEMA');
  assert.equal(proof.kind, 'reproduced-shared-role-ccd-source-image', 'SHARED_CCD_PROOF_KIND');
  assert.equal(proof.boundary, boundary, 'SHARED_CCD_PROOF_BOUNDARY');
  for (const key of ['sourceCommit', 'sourceGitTree', 'rebuiltJarDigest', 'roleClasses']) assert.deepEqual(proof[key], fixture[key], 'SHARED_CCD_SOURCE_CLASS_MISMATCH');
  const pins = { sourceArchiveDigest: 'sha256:1ee713ac9a171a705304078d344b89a59605312237d0ea0a6078e1f30d6d3944', correctedSourceInventoryDigest: 'sha256:0ec9d46c267cbf9c4d8525545abe88797b93fd8b1b864dd2a64f73dde9fd9658', patchDigest: 'sha256:41ab60a783ac59754a090cc051ffd7fb738c7d3dd087a42d69730145028088a5', artifactProvenanceDigest: 'sha256:15b637ed05be1ac24b26e36b52d0a136915a8ce6d992ec7247c643dc1985d0f8' };
  for (const [key, value] of Object.entries(pins)) assert.equal(proof[key], value, 'SHARED_CCD_PROOF_INPUT');
  assert.equal(proof.image?.manifestDigest, correctedImage, 'SHARED_CCD_CORRECTED_IMAGE');
  assert.equal(proof.image?.configDigest, 'sha256:7adc1b81292de0aaec6c316e43e19b4e63e46779d1d5d91671f28150254ebe80', 'SHARED_CCD_CORRECTED_CONFIG');
  assert.equal(proof.originalImage?.imageId, originalImage, 'SHARED_CCD_ORIGINAL_IMAGE');
  assert.equal(proof.originalImage?.manifestDigest, 'sha256:2b1b4208520244122d1ebfdc4fbdf7d1120fc0a1bacecb9bba06583762571e9b', 'SHARED_CCD_ORIGINAL_MANIFEST');
  assert.equal(proof.originalImage?.configDigest, 'sha256:58a53f7013ff354a312ff4e35a5b2af81d3094600ff30622262c5100554f57da', 'SHARED_CCD_ORIGINAL_CONFIG');
  assert.equal(proof.originalImage?.jarDigest, originalJar, 'SHARED_CCD_ORIGINAL_JAR');
  assert.equal(proof.originalImage?.sourceBuildCommit, fixture.sourceCommit, 'SHARED_CCD_ORIGINAL_COMMIT');
  assert.equal(proof.image.archiveDigest, 'sha256:2230803a638cc9c5285cbb64ee2992d6db99d4668ee9d386658adf866d299929', 'SHARED_CCD_DERIVED_ARCHIVE');
  assert.equal(proof.originalImage.archiveDigest, 'sha256:184a3664f57676c3147211ebcbb5cc162eac795efc15f9a55d9e7df512fb8591', 'SHARED_CCD_BASE_ARCHIVE');
  exact(proof.image, ['platform','archiveDigest','manifestDigest','configDigest','rootfsDiffIds'], 'SHARED_CCD_IMAGE_SCHEMA');
  exact(proof.originalImage, ['imageId','manifestDigest','configDigest','archiveDigest','jarDigest','sourceBuildCommit','platform','rootfsDiffIds'], 'SHARED_CCD_IMAGE_SCHEMA');
  for (const image of [proof.image, proof.originalImage]) {
    assert.equal(image.platform, 'linux/arm64', 'SHARED_CCD_PLATFORM');
    assert(Array.isArray(image.rootfsDiffIds) && image.rootfsDiffIds.length > 0 && image.rootfsDiffIds.every(digest), 'SHARED_CCD_ROOTFS');
  }
  assert.deepEqual(proof.image.rootfsDiffIds.slice(0,-1), proof.originalImage.rootfsDiffIds, 'SHARED_CCD_ROOTFS_DERIVATION');
  exact(proof.toolchain, ['javaVersion','javacVersion','javaExecutableDigest','javacExecutableDigest','gradleWrapperDigest'], 'SHARED_CCD_TOOLCHAIN');
  assert.equal(proof.toolchain.javaVersion, 'Temurin-21.0.12+8', 'SHARED_CCD_TOOLCHAIN');
  assert.equal(proof.toolchain.javacVersion, 'javac 21.0.12', 'SHARED_CCD_TOOLCHAIN');
  for (const key of ['javaExecutableDigest','javacExecutableDigest','gradleWrapperDigest']) assert(digest(proof.toolchain[key]), 'SHARED_CCD_TOOLCHAIN');
  assert(digest(proof.buildLogDigest), 'SHARED_CCD_BUILD_LOG');
  for (const key of ['runtimeAcceptance', 'catalogueCredit', 'releaseCredit']) assert.equal(proof[key], false, 'SHARED_CCD_NO_IMPLICIT_CREDIT');
}
// Production always executes the reviewed source/JAR/OCI reconstruction. A JSON
// receipt or caller-supplied verified flag is not authority for this entrypoint.
export function reproduceSharedRoleCcdSource(inputs) {
  const keys = ['sourceArchive', 'artifactRoot', 'baseArchive', 'derivedArchive', 'javaHome', 'gradleHome', 'output'];
  assert.deepEqual(Object.keys(inputs ?? {}).sort(), [...keys].sort(), 'SHARED_CCD_INPUT_SCHEMA');
  for (const key of keys) assert(typeof inputs[key] === 'string' && path.isAbsolute(inputs[key]), 'SHARED_CCD_ABSOLUTE_INPUT_REQUIRED');
  assert(!fs.existsSync(inputs.output) && fs.realpathSync(path.dirname(inputs.output)) === path.dirname(inputs.output), 'SHARED_CCD_FRESH_OUTPUT_REQUIRED');
  const script = fileURLToPath(new URL('../verify-shared-role-ccd-source.py', import.meta.url));
  const args = [script, ...keys.flatMap(key => ['--' + key.replace(/[A-Z]/g, char => '-' + char.toLowerCase()), inputs[key]])];
  const result = spawnSync('python3', args, { encoding: 'utf8', timeout: 300000, maxBuffer: 1024 * 1024, env: { PATH: process.env.PATH, HOME: process.env.HOME } });
  assert(!result.error && result.status === 0, 'SHARED_CCD_REPRODUCTION_FAILED');
  const summary = JSON.parse(result.stdout);
  assert.equal(summary.status, 'SOURCE_IMAGE_VERIFIED', 'SHARED_CCD_REPRODUCTION_INCOMPLETE');
  const file = path.join(inputs.output, 'source-image-binding.json');
  assert(fs.lstatSync(file).isFile() && fs.realpathSync(file) === file, 'SHARED_CCD_PROOF_FILE_ALIAS');
  const bytes = fs.readFileSync(file), proof = JSON.parse(bytes);
  validateSharedRoleCcdSourceProof(proof);
  return { proof, proofDigest: digestBytes(bytes) };
}
// Caller must obtain proof by reproduction above, and manifest/import via the
// independently validated native phase reader. This function grants no credit.
export function bindSharedRoleCcdRuntime(proof, manifest, importedBytes) {
  validateSharedRoleCcdSourceProof(proof);
  validateRunManifest(manifest);
  assert(['exui-ccd-pilot', 'exui-ccd-event-capability-pilot'].includes(manifest.releaseScopeId), 'SHARED_CCD_RUNTIME_SCOPE');
  assert(Buffer.isBuffer(importedBytes), 'SHARED_CCD_IMPORT_REQUIRED');
  const imported = JSON.parse(importedBytes), actual = manifest.identity.dependencyIdentities.ccd?.artifactDigest;
  assert([originalImage, correctedImage].includes(actual), 'SHARED_CCD_RUNTIME_IMAGE');
  assert.equal(imported.images?.data?.id, actual, 'SHARED_CCD_IMPORT_IMAGE');
  assert.equal(imported.images.data.architecture, 'arm64', 'SHARED_CCD_IMPORT_PLATFORM');
  assert.equal(digestBytes(importedBytes), manifest.runtimeMetadata.definitionImportDigest, 'SHARED_CCD_IMPORT_DIGEST');
  assert([200, 201].includes(imported.status), 'SHARED_CCD_IMPORT_FAILED');
  assert.equal(imported.fixtureDigest, manifest.identity.definitionDigests.HarnessNestedPRL, 'SHARED_CCD_IMPORT_FIXTURE');
  assert.equal(imported.observedDefinitionDigest, manifest.runtimeMetadata.observedDefinitionDigest, 'SHARED_CCD_IMPORT_OBSERVED');
  assert.equal(String(imported.definitionVersion), manifest.runtimeMetadata.definitionVersion, 'SHARED_CCD_IMPORT_VERSION');
  return { boundary, runtimeImageDigest: actual, jarDigest: actual === originalImage ? originalJar : fixture.rebuiltJarDigest, sourceCommit: fixture.sourceCommit, roleClassInventoryDigest: digestBytes(fixtureBytes), definitionImportDigest: digestBytes(importedBytes), runId: manifest.runId, harnessCommit: manifest.harnessCommit, catalogueCredit: false };
}
