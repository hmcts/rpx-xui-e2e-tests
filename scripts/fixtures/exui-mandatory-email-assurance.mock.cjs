const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
function fixture(t) {
  const root = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), "assurance-descriptor-"),
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "private"));
  const digest = "sha256:" + "a".repeat(64),
    commit = "b".repeat(40);
  const phases = ["family", "scope", "ccd", "eventCapability", "routing", "recipientCallback", "selectorEventRow"];
  const captured = { harnessCommit: commit, policies: {} };
  const write = (file, value) => {
    const bytes = JSON.stringify(value);
    fs.writeFileSync(path.join(root, "private", file), bytes);
    return (
      "sha256:" +
      require("node:crypto").createHash("sha256").update(bytes).digest("hex")
    );
  };
  for (const phase of phases) {
    fs.mkdirSync(path.join(root, "private", phase));
    captured.policies[phase] = { policyDigest: digest };
    const routingInterpreter =
      phase === "routing"
        ? { contract: { pinDigest: digest }, implementation: { apiBundle: { digest } } }
        : undefined;
    const pre = {
      harnessCommit: commit,
      identity: { artifactDigest: digest },
      policyDigest: digest,
      ...(routingInterpreter ? { routingInterpreter } : {}),
    };
    write(`${phase}/independent-preexecution.json`, {
      ...pre,
      capturedBeforeGate: true,
      capturedAt: "2026-11-03T12:00:00Z",
    });
    const transition =
      phase === "eventCapability"
        ? {
            path: "independent-transition.json",
            digest: write(`${phase}/independent-transition.json`, {
              capturedBeforeFault: true,
            }),
          }
        : undefined;
    const callbackTransition = phase === "recipientCallback"
      ? { path: "independent-callback-transition.json", digest: write(`${phase}/independent-callback-transition.json`, {
          capturedBeforeFault: true,
        }) }
      : undefined;
    let selectorAuthority;
    if(phase==='selectorEventRow'){
      selectorAuthority={...pre,
        selectorEventCapture:{path:'independent-selector-capture.json',digest:write(`${phase}/independent-selector-capture.json`,{schemaVersion:1})},
        selectorControllerTerminal:{path:'independent-controller-terminal.json',digest:write(`${phase}/independent-controller-terminal.json`,{schemaVersion:1,terminal:{code:0,signal:null}})}};
      write(`${phase}/independent-selector-admission.json`,{schemaVersion:1,completedAfterController:true,expected:selectorAuthority});
    }
    write(`${phase}/promotion-expected.json`, {
      ...(transition ? { eventTransition: transition } : {}),
      ...(callbackTransition ? { callbackTransition } : {}),
      ...pre,
      ...(selectorAuthority??{}),
      receiptArtifactDigest: digest,
      evidenceManifestDigest: digest,
    });
    write(`${phase}/controller-terminal.json`, {
      status: "completed",
      cleanupComplete: true,
      exitCode: phase === "ccd" ? 2 : 0,
    });
  }
  write("ci-result.json", {
    jobRunId: "ci-example",
    status: "BLOCKED",
    exitCode: 2,
    cleanupComplete: true,
    phaseResults: phases.map((phase) => ({
      phase,
      status: phase === "ccd" ? "BLOCKED" : "PASS",
      exitCode: phase === "ccd" ? 2 : 0,
      receiptArtifactDigest: digest,
      ...(phase === "eventCapability"
        ? {
            eventTransition: JSON.parse(
              fs.readFileSync(
                path.join(root, "private", phase, "promotion-expected.json"),
              ),
            ).eventTransition,
          }
        : phase === "recipientCallback" ? {
            callbackTransition: JSON.parse(fs.readFileSync(
              path.join(root, "private", phase, "promotion-expected.json"),
            )).callbackTransition,
          } : {}),
    })),
  });
  return {
    root,
    captured,
    job: { output: root, expectedArtifactDigest: digest },
    verdict: { status: "BLOCKED", exitCode: 2, continuationSafe: true },
    write,
  };
}

exports.descriptorFixture=fixture;
// Legacy fake entrypoint gains only stubs for the two new imports; off-path behavior stays unchanged.
exports.runEntrypoint=(fixture,options)=>{
 const lib=path.join(fixture.root,'scripts/lib');fs.mkdirSync(lib,{recursive:true});
 fs.writeFileSync(path.join(lib,'exui-mandatory-email-event-contract.mjs'),"export const verifyMandatoryEmailNativeCapture=()=>{throw Error('UNEXPECTED_MANDATORY_CAPTURE');};");
 fs.writeFileSync(path.join(fixture.root,'scripts/run-harness-mandatory-email-event-admission.mjs'),"export const runMandatoryEmailAdmission=()=>{throw Error('UNEXPECTED_MANDATORY_RUN');};");
 return require('./exui-assurance-entrypoint.mock.cjs').runEntrypoint(fixture,options);
};
// Actual orchestration statement slice; only external dependencies/prepare builder are fakes.
exports.actualCallbackSlice=()=>{
 const text=fs.readFileSync(path.join(__dirname,'../run-harness-assurance.mjs'),'utf8'),start=text.indexOf('    result = await runAssuranceSequence({'),end=text.indexOf('\n    });',start);
 if(start<0||end<0)throw Error('ACTUAL_ASSURANCE_CALLBACK_STATEMENT_REQUIRED');return text.slice(start,end+8);
};
exports.mandatoryResult=()=>({admission:{status:'passed',runId:'mandatory-admission-11111111-1111-4111-8111-111111111111'},reportRequest:{path:'/owned/mandatory/admission-request.json',runId:'mandatory-admission-11111111-1111-4111-8111-111111111111',digest:'sha256:'+'a'.repeat(64)}});
exports.ciRunId='ci-22222222-2222-4222-8222-222222222222';

exports.invokeActualCallbacks=async(api,t)=>{
 const f=fixture(t),events=[],captured={},CI=exports.ciRunId,held={binding:{value:'held-before-main'},reference:{path:'private/mandatory-email-native-binding.json',digest:'sha256:'+'a'.repeat(64)}},main={expected:{jobRunId:CI,mandatoryEmailNativeBinding:held.reference}},request=exports.mandatoryResult();let collectorOptions;
 const deps={excludeKnownJurisdictionDefect:false,fs,path,assert,jobPath:'/owned/job.json',job:{output:f.root,candidateManifest:'/owned/candidate.json',browserCache:'/owned/browser'},captured,mandatoryEmailOutput:'/owned/mandatory-output',stCicOutput:undefined,frProfileOutput:undefined,cmcProfileOutput:undefined,profileOutput:undefined,personalOutput:undefined,complexConfiguration:{attempt:{schemaVersion:1,status:'NOT_RUN'}},sharedRoleSourceInputs:undefined,cancellation:new AbortController(),env:{},aat:false,buildSelfCheckHeld:undefined,snapshotAssuranceTiming:undefined,
  runAssuranceSequence:api.runAssuranceSequence,
  runHarnessCi:async(_,options)=>{events.push('native');options.captureNativeCohort({binding:{producer:'held'}});options.capturePersonalNative({binding:{}});options.captureComplexNative({binding:{}});assert.equal(typeof options.captureMandatoryEmailNative,'function');options.captureMandatoryEmailNative(held);held.binding.value='mutated-external';events.push('first-resource');return {status:'PASS',exitCode:0,continuationSafe:true};},
  buildNativeDescriptor:()=>{events.push('prepare');assert.equal(captured.mandatoryEmailNativeCapture.binding.value,'held-before-main');return main;},
  runPersonalServiceAdmission:async()=>({status:'passed',reportRequest:{path:'/personal',runId:'personal',digest:'sha256:'+'b'.repeat(64)}}),
  runMandatoryEmailAdmission:async options=>{events.push('mandatory');assert.equal(options.admissionContext.native,captured.nativeCohortCapture.binding);assert.equal(options.admissionContext.capture,captured.mandatoryEmailNativeCapture);assert.equal(options.admissionContext.expected,main.expected);return request;},
  writeNativeDescriptor:(...args)=>{events.push('descriptor');assert.deepEqual(args[8],request.reportRequest);return '/owned/native-request.json';},
  runHarnessCollection:async(_,options)=>{events.push('collect');collectorOptions=options;return {status:'passed',exitCode:0,personalServiceInclusion:'included',mandatoryEmailInclusion:'included'};},
  reportNativeProgress:(_,operation)=>operation(),Reporter:{resetPublicReport:()=>events.push('withdraw')},publishAssuranceSummary:()=>events.push('publish')};
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;const result=await new AsyncFunction(...Object.keys(deps),'let result,mainDescriptor,published=false;'+exports.actualCallbackSlice()+'return result;')(...Object.values(deps));
 return{result,events,collectorOptions,timing:JSON.parse(fs.readFileSync(path.join(f.root,'private/mandatory-email-phase-timing.json')))};
};

// Full actual API with only native launch, public writer and Git expectation capture faked.
exports.isolatedActualApi=async t=>{
 const {pathToFileURL}=require('node:url'),previous=process.cwd(),base=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'mandatory-api-boundary-'))),root=path.join(base,'source'),scripts=path.join(root,'scripts');fs.mkdirSync(scripts,{recursive:true});t.after(()=>{process.chdir(previous);fs.rmSync(base,{recursive:true,force:true});});
 const fakeCi=path.join(scripts,'fake-ci.mjs'),callsFile=path.join(base,'native-calls');fs.writeFileSync(fakeCi,"import fs from 'node:fs';export const reportNativeProgress=(_,op)=>op();export async function runHarnessCi(){fs.appendFileSync("+JSON.stringify(callsFile)+",'native');throw Error('CONTROLLED_NATIVE_BOUNDARY');}");fs.writeFileSync(path.join(scripts,'fake-reporter.cjs'),'module.exports={resetPublicReport:()=>{}};');fs.writeFileSync(path.join(scripts,'run-harness-local-aat.cjs'),"exports.runHarnessCollection=()=>{throw Error('UNEXPECTED_COLLECTION');};");
 let source=fs.readFileSync(path.join(__dirname,'../run-harness-assurance.mjs'),'utf8');source=source.replace('from "./run-harness-ci.mjs"','from '+JSON.stringify(pathToFileURL(fakeCi).href)).replace('from "./harness-public-odhin-reporter.cjs"','from '+JSON.stringify(pathToFileURL(path.join(scripts,'fake-reporter.cjs')).href));source=source.replace(/from (["'])(\.\/[^"']+)\1/g,(_,quote,relative)=>'from '+JSON.stringify(pathToFileURL(path.resolve(__dirname,'..',relative)).href));
 const captureStart=source.indexOf('export function captureAssuranceExpectations('),captureEnd=source.indexOf('export function publishAssuranceSummary(',captureStart);assert(captureStart>=0&&captureEnd>captureStart);source=source.slice(0,captureStart)+"export function captureAssuranceExpectations(){return{harnessCommit:'"+'b'.repeat(40)+"',policies:{}};}\n"+source.slice(captureEnd);
 const file=path.join(scripts,'run-harness-assurance.mjs');fs.writeFileSync(file,source);const deps=path.join(base,'fake-deps'),candidate=path.join(base,'candidate'),browser=path.join(base,'browser'),owned=path.join(base,'owned');for(const dir of [deps,candidate,browser,owned])fs.mkdirSync(dir);fs.symlinkSync(deps,path.join(root,'node_modules'));
 const candidateManifest=path.join(base,'candidate.json'),jobPath=path.join(base,'job.json'),nativeOutput=path.join(base,'native-output');fs.writeFileSync(candidateManifest,JSON.stringify({candidateRoot:candidate}));fs.writeFileSync(jobPath,JSON.stringify({schemaVersion:1,candidateManifest,browserCache:browser,output:nativeOutput,expectedArtifactDigest:'sha256:'+'a'.repeat(64)}));const api=await import(pathToFileURL(file).href);process.chdir(root);return{api,base,root,candidate,browser,owned,jobPath,nativeOutput,calls:()=>fs.existsSync(callsFile)?fs.readFileSync(callsFile,'utf8'):''};
};
