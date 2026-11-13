const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createHash, randomUUID } = require("node:crypto");

const digest = (value) =>
  "sha256:" + createHash("sha256").update(value).digest("hex");
const hash = (letter) => "sha256:" + letter.repeat(64);
const canary = "PRIVATE_cookie_account_case_payload_123456789";
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
function write(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});const bytes=JSON.stringify(value);fs.writeFileSync(file,bytes);return digest(bytes);}
async function fixture(
  t,
  { postalFailure = false, unknownFailure = false, sourceDigest, candidate, recordedStages = false, postalDetail = false, businessScalars = false, actualDenialReporter = false } = {},
) {
  const root = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), "native-report-"),
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const directory = path.join(root, "run");
  const { getReleasePolicy } = await import("../lib/exui-release-policy.mjs");
  const { nativeInvocations } = await import("../lib/exui-native-contract.mjs");
  const { loadRunEvidence } = await import("../lib/exui-evidence-io.mjs");
  const event =
    await require("./exui-event-transition-evidence.mock.cjs").createEventTransitionFixture(
      t,
      { root: path.join(directory, "private"), sourceDigest, candidate },
    );
  const identity = structuredClone(event.expected.identity);
  if (unknownFailure) {
    event.baseline.report.status = "failed";
    event.baseline.report.tests[0].status = "failed";
    event.baseline.report.tests[0].failureId = canary;
    event.baseline.execution.runnerExitCode = 1;
    event.write();
  }
  const expected = {
    jobRunId: "ci-" + randomUUID(),
    harnessCommit: "b".repeat(40),
    candidateArtifactDigest: identity.artifactDigest,
    phases: [],
  };
  const binding = read(
    path.join(__dirname, "ccd/nested-prl.binding.json"),
  );
  identity.definitionDigests.HarnessNestedPRL = binding.workbookDigest;
  const observed = { id: "HarnessNestedPRL", version: { number: 1 } };
  const imported = {
    status: 201,
    sourceRevision: "694b9951e94369f1394380506960c4f04f25755d",
    binding,
    fixtureDigest: binding.workbookDigest,
    observedDefinitionDigest: digest(JSON.stringify(observed)),
    definitionVersion: 1,
    images: {
      data: { id: identity.dependencyIdentities.ccd.artifactDigest },
      definition: {
        id: identity.dependencyIdentities["ccd-definition"].artifactDigest,
      },
    },
  };
  const importDigest = write(
    path.join(directory, "private/ccd-runtime/definition-import.json"),
    imported,
  );
  write(
    path.join(directory, "private/ccd-runtime/observed-definition.json"),
    observed,
  );
  const phaseResults = [];
  for (const [phase, releaseScopeId] of Object.entries({
    family: "exui-wa-family-pilot",
    scope: "exui-wa-scope-pilot",
    ccd: "exui-ccd-pilot",
  })) {
    const policy = getReleasePolicy(releaseScopeId);
    const dir = path.join(directory, "private", phase);
    const manifest = {
      schemaVersion: 1,
      runId: (phase === "ccd" ? "ccd-" : "candidate-") + randomUUID(),
      harnessCommit: expected.harnessCommit,
      releaseScopeId,
      policyDigest: policy.policyDigest,
      identity,
      requiredObligationIds: policy.requiredObligationIds,
      runtimeMetadata: {
        harnessSourceState: "clean",
        harnessSourceDigest: event.expected.harnessSourceDigest,
        harnessDependencyDigest: event.expected.harnessDependencyDigest,
        browserDigest: event.expected.browserDigest,
        isolation: "native-separate-api-owned-network-none",
        privateCanary: canary,
        ...(phase === "ccd"
          ? {
              definitionImportDigest: importDigest,
              observedDefinitionDigest: imported.observedDefinitionDigest,
              definitionVersion: "1",
              ccdNamespace: "unit-ccd-namespace",
            }
          : {}),
      },
    };
    const run = {
      schemaVersion: 1,
      manifest,
      executionArtifacts: [],
      mutations: [],
    };
    const put = (relative, value) => ({
      path: relative,
      digest: write(path.join(dir, relative), value),
    });
    for (const invocation of nativeInvocations(releaseScopeId)) {
      const definition = policy.mutationDefinitions.find(
        (d) => d.mutationId === invocation.mutation,
      );
      const changedIdentity = definition
        ? { ...identity, configurationDigest: digest(definition.mutationId) }
        : identity;
      const proofIds = definition
        ? [definition.mutantProofId]
        : policy.obligations
            .flatMap((o) => o.requiredProofIds)
            .filter((p) => phase !== "scope" || p.endsWith(invocation.persona));
      const tests = proofIds.map((proofId) => {
        const postal =
          postalFailure &&
          ["ccd-postal-two-roundtrip", "ccd-postal-child-loss"].includes(
            proofId,
          );
        const status = definition || postal || false ? "failed" : "passed";
        const failureId = postal
          ? "postal-required-fields"
          : (definition?.expectedFailureId ?? null);
        return {
          proofId,
          expectedStatus: "passed",
          status,
          retry: 0,
          failureId,
          unattributedErrors: 0,
          ...(businessScalars && ['ccd-nested-roundtrip','ccd-child-loss','wa-org-scope-ia','wa-scope-broadened'].includes(proofId)?{businessScalars:businessScalars==='invalid'?{schemaVersion:1,availability:'recorded',PRIVATE_TOKEN:'secret'}:require('./exui-business-scalar-detail.mock.cjs').recorded(proofId)}:{}),
          ...(postalDetail && ['ccd-postal-two-roundtrip','ccd-postal-child-loss'].includes(proofId) ? {recordedDetail:{
            schemaVersion:1,availability:'recorded',scope:'postal-action-check-groups',testDurationMs:90,
            groups:require('./exui-native-stage-telemetry.mock.cjs').postalGroups.slice(0,postal?5:12).map((id,index)=>({ordinal:index+1,groupId:postalDetail==='invalid'?'PRIVATE_CANARY':id,outcome:status==='failed'&&index===(postal?4:11)?'reported-error':'completed-without-reported-error',durationMs:index+1}))
          }}:{}),
          ...(recordedStages && phase === 'family' ? {recordedExecution: {
            schemaVersion:1, availability:'recorded', scope:'named-assertion-stages', testDurationMs:recordedStages==='oversized'?1:90,
            stages: recordedStages==='empty'?[]:(definition ? ['family-membership'] : ['family-membership',...Array(7).fill('family-filter')]).map((id,index)=>({ordinal:index+1,stageId:recordedStages==='invalid'?'PRIVATE_cookie_canary':id,instance:id==='family-filter'?index:1,outcome:definition?'reported-error':'completed-without-reported-error',durationMs:recordedStages==='oversized'?1000:index+2}))
          }} : {}),
        };
      });
      const status = tests.some((p) => p.status === "failed")
        ? "failed"
        : "passed";
      const execution = {
        invocationId: invocation.invocationId,
        runId: manifest.runId,
        identity: changedIdentity,
        kind: invocation.kind,
        terminalState: "completed",
        runnerExitCode: status === "passed" ? 0 : 1,
        unexpectedGlobalErrors: [],
      };
      if(phase==='ccd'&&['baseline','ccd-broaden-access','ccd-write-then-deny'].includes(invocation.invocationId)){
        const {sharedRoleArtifactNames}=await import('../lib/exui-shared-role-artifacts.mjs');
        const {sharedRoleObservationBinding,replaySharedRoleDenial}=await import('../lib/exui-shared-role-observations.mjs');
        const roleManifest={...manifest,identity:changedIdentity,runtimeMetadata:{...manifest.runtimeMetadata,ccdNamespace:'unit-ccd-namespace'}};
        const roleContext={runId:manifest.runId,invocationId:invocation.invocationId,identity:changedIdentity,harnessCommit:manifest.harnessCommit,releaseScopeId,policyDigest:policy.policyDigest,harnessSourceState:'clean',harnessSourceDigest:event.expected.harnessSourceDigest};
        const actorId='unit-denied-actor',roleBinding=sharedRoleObservationBinding(roleManifest,roleContext),mutation=invocation.invocationId==='baseline'?null:invocation.invocationId;
        const observation=require('./exui-business-scalar-detail.mock.cjs').sealedDenialObservation({binding:roleBinding,mutation,actorId});
        replaySharedRoleDenial(observation,{binding:roleBinding,mutation,actorId});
        const roleValues={'manifest.json':roleManifest,'context.json':roleContext,'personas.json':{credentials:{denied:{userId:actorId}}},'policy-observation.json':observation,'role-revocation-observation.json':{syntheticUnusedRoleArtifact:true}};
        execution.sharedRoleArtifacts=sharedRoleArtifactNames(invocation.invocationId,releaseScopeId).map(name=>{
          const relative=invocation.invocationId+'/'+name;
          if(name==='ccd-requests.jsonl'||name==='fault-actions.jsonl'){
            const bytes=name==='ccd-requests.jsonl'?'':JSON.stringify({mutation,caseId:observation.caseId,status:201})+'\n',file=path.join(dir,relative);
            fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes);return {path:relative,digest:digest(bytes)};
          }
          return put(relative,roleValues[name]);
        });
      }
      execution.resultArtifact = put(invocation.invocationId + "/report.json", {
        schemaVersion: 1,
        context: {
          runId: manifest.runId,
          invocationId: invocation.invocationId,
          identity: changedIdentity,
          harnessCommit: manifest.harnessCommit,
          releaseScopeId,
          policyDigest: policy.policyDigest,
          harnessSourceState: "clean",
          harnessSourceDigest: event.expected.harnessSourceDigest,
        },
        complete: true,
        status,
        tests,
        globalErrors: [],
        privateCanary: canary,
      });
      if(actualDenialReporter&&phase==='ccd'&&['baseline','ccd-broaden-access','ccd-write-then-deny'].includes(invocation.invocationId)){
        const emitted=await require('./exui-business-scalar-detail.mock.cjs').emitActualDenialReport({contextPath:path.join(dir,invocation.invocationId,'context.json'),reportPath:path.join(dir,invocation.invocationId,'report.json'),tests,status});
        execution.resultArtifact=put(invocation.invocationId+'/report.json',emitted);
      }
      run.executionArtifacts.push(
        put(invocation.invocationId + "/execution.json", execution),
      );
      put(invocation.invocationId + "/candidate-write-denial.json", {
        attempts: [
          { path: "/output/report.json", denied: true },
          { path: "/harness/controller.mjs", denied: true },
        ],
        controllerSourceVisible: false,
      });
      put(invocation.invocationId + "/candidate-lifecycle.json", {
        requestedStop: true,
        before: { State: { Running: true } },
        after: { State: { Running: false, ExitCode: 143 } },
        privateCanary: canary,
      });
      if (definition)
        run.mutations.push({
          mutationId: definition.mutationId,
          baselineInvocationId: phase === "scope" ? "scope-ia" : "baseline",
          mutantInvocationId: invocation.invocationId,
          derivationArtifact: put(
            invocation.invocationId + "/derivation.json",
            {
              baselineIdentity: identity,
              mutantIdentity: changedIdentity,
              mutationDefinitionDigest: definition.definitionDigest,
            },
          ),
        });
    }
    put("run.json", run);
    const loaded = loadRunEvidence(path.join(dir, "run.json"), policy);
    const receiptArtifactDigest = put("gate.json", loaded.receipt).digest;
    put("controller-terminal.json", {
      status: "completed",
      exitCode: loaded.receipt.verdict.exitCode,
      cleanupComplete: true,
    });
    expected.phases.push({
      phase,
      policy,
      terminal: { code: loaded.receipt.verdict.exitCode, signal: null },
      expected: {
        runId: manifest.runId,
        harnessCommit: manifest.harnessCommit,
        releaseScopeId,
        policyDigest: policy.policyDigest,
        identity,
        harnessSourceDigest: event.expected.harnessSourceDigest,
        harnessDependencyDigest: event.expected.harnessDependencyDigest,
        browserDigest: event.expected.browserDigest,
        nativeAuthority: true,
        evidenceManifestDigest: loaded.evidenceManifestDigest,
        receiptArtifactDigest,
      },
    });
    phaseResults.push({
      phase,
      ...loaded.receipt.verdict,
      receiptArtifactDigest,
    });
    delete phaseResults.at(-1).reasons;
  }
  expected.phases.push({
    phase: "eventCapability",
    policy: event.policy,
    terminal: { code: unknownFailure ? 2 : 0, signal: null },
    expected: event.expected,
  });
  phaseResults.push({
    phase: "eventCapability",
    status: unknownFailure ? "BLOCKED" : "PASS",
    exitCode: unknownFailure ? 2 : 0,
    receiptArtifactDigest: event.expected.receiptArtifactDigest,
    eventTransition: event.expected.eventTransition,
  });
  const { createRoutingPhaseFixture } = require(
    "./exui-routing-phase-evidence.mock.cjs",
  );
  const routing = await createRoutingPhaseFixture({
    root: path.join(directory, "private"), candidate,
    harnessCommit: expected.harnessCommit,
    sourceDigest: event.expected.harnessSourceDigest,
    dependencyDigest: event.expected.harnessDependencyDigest,
    browserDigest: event.expected.browserDigest,
  });
  expected.phases.push({
    phase: "routing",
    policy: routing.policy,
    terminal: routing.terminal,
    expected: routing.expected,
  });
  phaseResults.push(routing.result);
  const {createCallbackPhaseFixture}=require('./exui-recipient-callback-phase-evidence.mock.cjs');
  const callback=await createCallbackPhaseFixture({
    root:path.join(directory,'private'),candidate,harnessCommit:expected.harnessCommit,
    sourceDigest:event.expected.harnessSourceDigest,dependencyDigest:event.expected.harnessDependencyDigest,
    browserDigest:event.expected.browserDigest,
  });
  expected.phases.push({phase:'recipientCallback',policy:callback.policy,terminal:callback.terminal,expected:callback.expected});
  phaseResults.push(callback.result);
  const {createSelectorPhaseFixture}=require('./exui-selector-phase-evidence.mock.cjs');
  const selector=await createSelectorPhaseFixture({
    root:path.join(directory,'private'),candidate,harnessCommit:expected.harnessCommit,
    sourceDigest:event.expected.harnessSourceDigest,dependencyDigest:event.expected.harnessDependencyDigest,
    browserDigest:event.expected.browserDigest,
  });
  expected.phases.push({phase:'selectorEventRow',policy:selector.policy,terminal:selector.terminal,expected:selector.expected});
  phaseResults.push(selector.result);


  const last = phaseResults.reduce((worst, item) =>
    item.exitCode > worst.exitCode ? item : worst,
  );
  expected.ciResultDigest = write(
    path.join(directory, "private/ci-result.json"),
    {
      classification: "fixed-pilot-suite-no-full-release-approval",
      jobRunId: expected.jobRunId,
      status: last.status,
      exitCode: last.exitCode,
      cleanupComplete: true,
      phaseResults,
    },
  );
  const descriptor = { schemaVersion: 1, directory, expected };
  const descriptorPath = path.join(root, "descriptor.json");
  write(descriptorPath, descriptor);
  return {
    root,
    directory,
    event,
    routing,
    callback,
    selector,
    descriptor,
    descriptorPath,
    save: () => write(descriptorPath, descriptor),
  };
}

module.exports={fixture};

// Publication tests must prepare the real strict packet, including absence of
// scalar observations. Never mint a synthetic held reference for a view model.
module.exports.preparePublication = async (t,reporter,options={}) => {
 const packet=await fixture(t,options);
 await reporter.prepareNativeEvidence(packet.descriptorPath);
 return packet;
};

// Existing full-reader profile seam, only for source-owned synthetic profile
// fixtures. The actual reporter/prepare body changes only this import literal.
module.exports.reporterForReaderOptions = (t,readerOptions) => {
 const {Module}=require('node:module'),{pathToFileURL}=require('node:url');
 const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'strict-reader-options-'));
 const key='harness-fixture-reader-'+randomUUID();globalThis[key]=readerOptions;
 t.after(()=>{delete globalThis[key];fs.rmSync(root,{recursive:true,force:true});});
 const reader=pathToFileURL(path.join(__dirname,'../lib/exui-native-report-evidence.mjs')).href,wrapper=path.join(root,'reader.mjs');
 fs.writeFileSync(wrapper,`import{readNativeReportEvidence as actual}from${JSON.stringify(reader)};export const readNativeReportEvidence=path=>actual(path,globalThis[${JSON.stringify(key)}]);`);
 const file=path.join(__dirname,'../harness-public-odhin-reporter.cjs'),source=fs.readFileSync(file,'utf8'),literal='"./lib/exui-native-report-evidence.mjs"',relocated=JSON.stringify(pathToFileURL(wrapper).href);
 assert.equal(source.split(literal).length,2,'EXACT_SINGLE_READER_IMPORT');
 const body=source.replace(literal,relocated);assert.equal(body.replace(relocated,literal),source,'ONLY_READER_IMPORT_RELOCATION');
 const loaded=new Module(file,module);loaded.filename=file;loaded.paths=Module._nodeModulePaths(path.dirname(file));loaded._compile(body,file);
 return loaded.exports;
};
