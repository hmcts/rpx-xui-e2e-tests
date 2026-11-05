import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {validateCiPhase} from './exui-candidate-ci-evidence.mjs';
import {digestBytes} from './exui-evidence-io.mjs';
import {APPLICANT_RESULTS_SCOPE} from './exui-applicant-results-contract.mjs';

const fail='APPLICANT_REPORT_EVIDENCE_INVALID';
function read(file) {
 assert(path.isAbsolute(file)&&path.normalize(file)===file&&fs.realpathSync(file)===file,fail);
 assert(fs.lstatSync(file).isFile(),fail);
 const bytes=fs.readFileSync(file);return {value:JSON.parse(bytes),digest:digestBytes(bytes)};
}
function exactKeys(value,keys) {assert.deepEqual(Object.keys(value??{}).sort(),keys.slice().sort(),fail);}
// This attachment has its own candidate/producer/dependency cohort. It never enters catalogue accounting.
export function readApplicantCompatibilityEvidence(descriptorPath) {
 const descriptor=read(descriptorPath),request=descriptor.value;
 exactKeys(request,['schemaVersion','kind','directory','expected']);
 assert.equal(request.schemaVersion,1,fail);assert.equal(request.kind,'applicant-results-compatibility-request',fail);
 const directory=request.directory;
 assert(path.isAbsolute(directory)&&path.normalize(directory)===directory&&fs.realpathSync(directory)===directory&&fs.lstatSync(directory).isDirectory(),fail);
 const pins=request.expected;
 exactKeys(pins,['runId','producerCommit','candidateArtifactDigest','receiptArtifactDigest','admissionDigest','controllerTerminalDigest','summaryDigest']);
 const admission=read(path.join(directory,'independent-results-admission.json'));
 const observed=read(path.join(directory,'independent-controller-terminal.json'));
 const summary=read(path.join(directory,'../summary.json'));
 assert.equal(admission.digest,pins.admissionDigest,fail);assert.equal(observed.digest,pins.controllerTerminalDigest,fail);assert.equal(summary.digest,pins.summaryDigest,fail);
 assert.equal(admission.value.schemaVersion,1,fail);assert.equal(admission.value.completedAfterController,true,fail);
 const expected=admission.value.expected;
 assert.equal(expected.releaseScopeId,APPLICANT_RESULTS_SCOPE,fail);
 assert.equal(expected.runId,pins.runId,fail);assert.equal(expected.harnessCommit,pins.producerCommit,fail);assert.equal(expected.identity.artifactDigest,pins.candidateArtifactDigest,fail);
 assert.equal(summary.value.kind,'standalone-applicant-results-pilot',fail);
 for(const [key,value] of Object.entries({status:'PASS',nativeRuntimeAcceptance:true,cleanupComplete:true,catalogueCredit:false,releaseCredit:false,invocations:4,proposedCatalogueRows:2}))assert.equal(summary.value[key],value,fail);
 const verdict=validateCiPhase(directory,expected,observed.value.terminal);
 assert.equal(verdict.status,'PASS',fail);assert.equal(verdict.receiptArtifactDigest,pins.receiptArtifactDigest,fail);
 assert.equal(summary.value.receiptArtifactDigest,pins.receiptArtifactDigest,fail);
 const capture=read(path.join(directory,'independent-results-capture.json'));
 assert.equal(capture.digest,expected.applicantResultsCapture.digest,fail);
 const baselineRecord=read(path.join(directory,'independent-results-baseline.json'));
 assert.equal(baselineRecord.digest,capture.value.invocations[0].expectation.digest,fail);
 const baseline=baselineRecord.value;
 assert.equal(baseline.ccd.images.data.architecture,'arm64',fail);
 assert.equal(baseline.correctedDependency.imageId,expected.identity.dependencyIdentities.ccd.artifactDigest,fail);
 return {
  schemaVersion:1,kind:'applicant-results-compatibility',status:'PASS',
  runId:expected.runId,producerCommit:expected.harnessCommit,candidateCommit:expected.identity.webappCommit,
  candidateArtifactDigest:expected.identity.artifactDigest,sourceDigest:expected.harnessSourceDigest,
  dataImageDigest:baseline.correctedDependency.imageId,profileDigest:baseline.correctedDependency.profileDigest,
  descriptorDigest:descriptor.digest,receiptArtifactDigest:verdict.receiptArtifactDigest,
  baselineProofs:1,effectiveFaults:3,sourceRows:2,cleanupComplete:true,catalogueCredit:false,releaseCredit:false,
 };
}
