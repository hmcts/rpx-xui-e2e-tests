const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const load = async () =>
  Object.assign(
    {},
    ...(await Promise.all([
      import("./run-harness-ci.mjs"),
      import("./lib/exui-candidate-ci-inputs.mjs"),
      import("./lib/exui-candidate-ci-evidence.mjs"),
      import("./lib/exui-candidate-ci-process.mjs"),
    ])),
  );
const digest = (c) => "sha256:" + c.repeat(64);
const job = {
  schemaVersion: 1,
  candidateManifest: "/inputs/candidate.json",
  expectedArtifactDigest: digest("a"),
  browserCache: "/inputs/browser",
  output: "/outputs/fresh",
};

test("support only: actual CI phase accounting waits for controlled process completion and validated receipt transport", async () => {
  const { executeCiProcess } = await load();
  const directory = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), "ci-coverage-wiring-"),
  );
  try {
    const script = path.join(directory, "phase.cjs"),
      output = path.join(directory, "ccd");
    fs.writeFileSync(
      script,
      `const fs=require('fs'),p=process.argv[2];fs.mkdirSync(p);fs.writeFileSync(p+'/input.json',JSON.stringify({runId:'fresh-controlled-launch'}));fs.writeFileSync(p+'/container-launch.json','{}');const t=setInterval(()=>{if(fs.existsSync(p+'/independent-preexecution.json')){clearInterval(t);fs.writeFileSync(p+'/gate.json','controlled-finalized-receipt');}},5);`,
    );
    const result = await executeCiProcess({
      script,
      args: [output],
      output,
      onPrepared: (input) => ({
        runId: input.runId,
        releaseScopeId: "exui-ccd-pilot",
        identity: { artifactDigest: digest("a") },
        nativeAuthority: true,
      }),
    });
    assert.deepEqual(result.terminal, { code: 0, signal: null });
    assert.equal(
      result.expected.receiptArtifactDigest,
      undefined,
      "pre-execution capture has no receipt digest",
    );
    const source = fs.readFileSync(
      path.resolve("scripts/run-harness-ci.mjs"),
      "utf8",
    );
    const block = source.match(
      /const validated = validateCiPhase\([\s\S]*?return validated;/,
    )?.[0];
    assert(block, "actual phase finalization block exists");
    const finalize = new Function(
      "validateCiPhase",
      "writeConfigurationCoverage",
      "ROOT",
      "path",
      "privateRoot",
      "directory",
      "result",
      "name",
      "phaseResults",
      "context",
      block,
    );
    for (const name of ["ccd", "family"]) {
      const calls = [],
        phases = [];
      const validated = {
        status: "PASS",
        exitCode: 0,
        receiptArtifactDigest: digest("b"),
      };
      finalize(
        (phase, expected, terminal) => {
          calls.push("validate");
          assert.equal(phase, output);
          assert.equal(expected, result.expected);
          assert.deepEqual(terminal, result.terminal);
          return validated;
        },
        (args) => {
          calls.push("account");
          assert.equal(args.phaseDirectory, output);
          assert.equal(args.output, path.join(directory, "configuration"));
          assert.deepEqual(args.expected, {
            ...result.expected,
            receiptArtifactDigest: validated.receiptArtifactDigest,
          });
          assert.deepEqual(args.terminal, result.terminal);
        },
        path.resolve("."),
        path,
        directory,
        output,
        result,
        name,
        phases,
        {},
      );
      assert.deepEqual(
        calls,
        name === "ccd" ? ["validate", "account"] : ["validate"],
      );
      assert.deepEqual(phases, [{ phase: name, ...validated }]);
    }
    assert.throws(
      () =>
        finalize(
          () => {
            throw Error("FOREIGN_OR_MISSING_RECEIPT");
          },
          () => assert.fail("unvalidated evidence reached accounting"),
          path.resolve("."),
          path,
          directory,
          output,
          result,
          "ccd",
          [],
          {},
        ),
      /FOREIGN_OR_MISSING_RECEIPT/,
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("support only: candidate CI requires an explicit strict native-artifact job contract", async () => {
  const { validateCiJob } = await load();
  assert.deepEqual(validateCiJob(job), job);
  for (const altered of [
    { ...job, phases: ["family"] },
    { ...job, output: "relative" },
    { ...job, expectedArtifactDigest: "latest" },
    { ...job, candidateManifest: "/inputs/a\nsecret" },
  ])
    assert.throws(() => validateCiJob(altered));
});

test("support only: CLI missing inputs exits BLOCKED without legacy execution", () => {
  const result = spawnSync(
    process.execPath,
    [path.resolve("scripts/run-harness-ci.mjs")],
    {
      encoding: "utf8",
      env: {
        PATH: process.env.PATH,
        TEST_URL: "https://credential-sentinel.invalid",
      },
    },
  );
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stdout, /BLOCKED/);
  assert.doesNotMatch(
    result.stdout + result.stderr,
    /credential-sentinel|POC proof/,
  );
});

test("support only: cleanup verifies CID, owner, image, network and every writable mount", async () => {
  const { assertCiContainer } = await load();
  const expected = {
    id: "1".repeat(64),
    owner: "candidate-11111111-1111-4111-8111-111111111111",
    image: digest("a"),
    network: "none",
    mounts: [
      { source: "/source", target: "/harness", writable: false },
      { source: "/output", target: "/output", writable: true },
    ],
  };
  const info = {
    Id: expected.id,
    Image: expected.image,
    Config: {
      Labels: {
        "exui.harness.owner": expected.owner,
        "exui.harness.service": "candidate-runtime",
      },
    },
    HostConfig: {
      NetworkMode: "none",
      ReadonlyRootfs: true,
      Privileged: false,
    },
    Mounts: expected.mounts.map((m) => ({
      Type: "bind",
      Source: m.source,
      Destination: m.target,
      RW: m.writable,
    })),
  };
  assertCiContainer(info, expected);
  for (const mutate of [
    (i) => (i.Id = "2".repeat(64)),
    (i) => (i.Image = digest("b")),
    (i) => (i.Config.Labels["exui.harness.owner"] = "foreign"),
    (i) => (i.HostConfig.NetworkMode = "bridge"),
    (i) => (i.Mounts[0].RW = true),
    (i) =>
      i.Mounts.push({
        Type: "bind",
        Source: "/host",
        Destination: "/unexpected",
        RW: true,
      }),
  ]) {
    const changed = structuredClone(info);
    mutate(changed);
    assert.throws(() => assertCiContainer(changed, expected));
  }
});

test("support only: fixed pilot order stops on a validated failure and always cleans owned CCD", async () => {
  const { runFixedCiPilots } = await load();
  for (const failed of [null, "family", "scope", "ccd", "startup", "eventCapability", "eventStartup", "routing", "recipientCallback", "callbackStartup", "selectorEventRow"]) {
    const calls = [];
    const operations = {
      phase: async (name) => {
        calls.push(name);
        return {
          status: failed === name ? "FAIL" : "PASS",
          exitCode: failed === name ? 1 : 0,
        };
      },
      derive: async () => {
        calls.push("derive");
      },
      start: async () => {
        calls.push("start");
        if (failed === "startup") throw Error("startup");
      },
      stop: async () => {
        calls.push("stop");
      },
      startEvent: async () => {
        calls.push("startEvent");
        if (failed === "eventStartup") throw Error("startup");
      },
      stopEvent: async () => calls.push("stopEvent"),
      startCallback: async () => {calls.push("startCallback");if(failed === "callbackStartup") throw Error("startup");},
      stopCallback: async () => calls.push("stopCallback"),
    };
    if (["startup", "eventStartup", "callbackStartup"].includes(failed))
      await assert.rejects(runFixedCiPilots(operations), /startup/);
    else {
      const result = await runFixedCiPilots(operations);
      assert.equal(result.exitCode, failed ? 1 : 0);
      if (!failed) {
        assert.equal(result.timings.length, 14);
        assert.equal(result.timings[0].label, "WA family");
        assert.equal(result.timings.at(-1).label, "Selector CCD baseline preparation");
        assert.ok(result.timings.every((item) => Number.isSafeInteger(item.durationMs) && item.durationMs >= 0 && Number.isFinite(Date.parse(item.startedAt))));
      }
    }
    assert.deepEqual(
      calls,
      failed === "family"
        ? ["family"]
        : failed === "scope"
          ? ["family", "derive", "scope"]
          : failed === "startup"
            ? ["family", "derive", "scope", "start", "stop"]
            : failed === "ccd"
              ? ["family", "derive", "scope", "start", "ccd", "stop"]
              : [
                  "family",
                  "derive",
                  "scope",
                  "start",
                  "ccd",
                  "stop",
                  "startEvent",
                  ...(failed === "eventStartup"
                    ? ["stopEvent"]
                    : ["eventCapability", "stopEvent", ...(failed === "eventCapability" ? [] : ["routing", ...(failed === "routing" ? [] : ["startCallback", ...(failed === "callbackStartup" ? [] : ["recipientCallback"]), "stopCallback", ...(["callbackStartup","recipientCallback"].includes(failed)?[]:["selectorEventRow"])])])]),
                ],
    );
  }
});

test("support only: stale output is rejected without replacing historical evidence", async () => {
  const { createCiOutput } = await load();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ci-stale-"));
  try {
    fs.writeFileSync(path.join(directory, "gate.json"), "historical");
    assert.throws(() => createCiOutput(directory), /FRESH/);
    assert.equal(
      fs.readFileSync(path.join(directory, "gate.json"), "utf8"),
      "historical",
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("support only: independently recognized postal blockage permits the event slice while preserving the worst verdict", async () => {
  const { runFixedCiPilots } = await load();
  for (const continued of [true, false, undefined, { status: "PASS" }]) {
    for (const eventExit of [0, 1, 2]) {
      const calls = [];
      const result = await runFixedCiPilots({
        phase: async (name) => {
          calls.push(name);
          const exitCode = name === "ccd" ? 2 : name === "eventCapability" ? eventExit : 0;
          return { status: ["PASS", "FAIL", "BLOCKED"][exitCode], exitCode };
        },
        derive: async () => {}, start: async () => {},
        stop: async () => calls.push("old-removed"),
        canContinueAfterCcd: () => { calls.push("validate-postal"); return continued; },
        startEvent: async () => calls.push("new-started"),
        stopEvent: async () => calls.push("new-removed"),
        startCallback: async () => calls.push("callback-started"),
        stopCallback: async () => calls.push("callback-removed"),
      });
      assert.equal(result.status, "BLOCKED");
      assert.equal(result.exitCode, 2);
      assert.deepEqual(calls, ["family", "scope", "ccd", "old-removed", "validate-postal",
        ...(continued === true ? ["new-started", "eventCapability", "new-removed", ...(eventExit === 0 ? ["routing", "callback-started", "recipientCallback", "callback-removed", "selectorEventRow"] : [])] : [])]);
      assert.equal(
        result.results.length,
        continued !== true ? 3 : eventExit === 0 ? 7 : 4,
      );
      if (continued === true && eventExit === 0)
        assert.equal(result.results[4].phase, "routing");
    }
  }
});

test("support only: actual event parent captures all eleven fault runtimes before ACK and rejects partial preparation", async (t) => {
  const { digestBytes, writeJsonAtomic } = await import("./lib/exui-evidence-io.mjs");
  const { timeEventRuntimePreparation } = await import('./lib/exui-event-runtime-timing.mjs');
  const { publishEventCapabilityRuntime } = await import("./lib/exui-ccd-event-transition.mjs");
  const { eventCapabilityFaultVariant, EVENT_CAPABILITY_MUTATION, COURTADMIN_READ_MUTATION, READONLY_READ_MUTATION, READONLY_UPDATE_MUTATION, COURTADMIN_UPDATE_MUTATION, SOURCE_SHAPE_MUTATIONS } = await import("./lib/exui-ccd-event-capability.mjs");
  const source = fs.readFileSync(path.join(__dirname, "run-harness-ci.mjs"), "utf8");
  const callback = source.match(/onEventTransition: (async \(request, handoff\) => \{[\s\S]*?)\n\s*\},\n\s*\} : \{\}\)/)?.[1];
  assert(callback, "actual parent transition callback exists");
  for (const stoppedAt of [null, "checkpoint", "native-removed", "ccd-removed", "start-mutant", "owned-mutant", "start-read-mutant", "owned-read-mutant", "start-readonly-read-mutant", "owned-readonly-read-mutant", "start-readonly-update-mutant", "owned-readonly-update-mutant", "start-courtadmin-update-mutant", "owned-courtadmin-update-mutant", ...SOURCE_SHAPE_MUTATIONS.flatMap(id => [`start-shape-${id.slice(10)}-mutant`, `owned-shape-${id.slice(10)}-mutant`]), "cancel-after-read", "reused-owner", "reused-cid"]) {
    const directory = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "parent-event-"));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    fs.writeFileSync(path.join(directory, "input.json"), "immutable baseline input\n");
    const calls = [], preparationTimings = [], resource = { expectedContainer: { invocations: ["baseline"] } };
    let fakeTime = 0;
    let cancelled = false;
    const step = name => { calls.push(name); if (stoppedAt === name) throw Error("controlled-" + name); };
    const request = { runId: "synthetic-run", baselineNamespace: "old" };
    const input = { runId: request.runId, ccd: { namespace: "old", owner: "old-owner", containers: { database: "old", data: "old-data" } } };
    const handoff = { input, expected: { harnessCommit: "commit", harnessSourceDigest: digest("a") }, handoff: {}, isTerminated: () => cancelled };
    const deps = {
      assert, fs, path, digestBytes, writeJsonAtomic, directory, resource, context: {}, cancelled: false,
      timeEventRuntimePreparation: (records, entry) => timeEventRuntimePreparation(records, entry, { clock: () => fakeTime += 1, timestamp: () => `time-${fakeTime}` }),
      EVENT_CAPABILITY_SCOPE: "exui-ccd-event-capability-pilot", EVENT_CAPABILITY_MUTATION, COURTADMIN_READ_MUTATION, READONLY_READ_MUTATION, READONLY_UPDATE_MUTATION, COURTADMIN_UPDATE_MUTATION, SOURCE_SHAPE_MUTATIONS, eventCapabilityFaultVariant,
      resources: new Map([["event-baseline-runtime", "owned-baseline"]]),
      inspectHostContainer: () => assert.fail("inspection delegated to ownership validator"),
      readEventBaselineCheckpoint: () => { step("checkpoint"); return { checkpointDigest: digest("b") }; },
      assertEventBaselineRemoved: () => { step("native-removed"); return { removed: ["native"] }; },
      remove: async (name, owned) => {
        assert.equal(name, "event-baseline-runtime"); assert.equal(owned, "owned-baseline");
        step("ccd-removed"); return { cleanupComplete: true };
      },
      startOwnedCcd: async (name, fixture, alive, owner, _callbackVariant, onTiming) => {
        const variant = fixture.slice("event-capability-".length);
        assert(["mutant", "read-mutant", "readonly-read-mutant", "readonly-update-mutant", "courtadmin-update-mutant", ...SOURCE_SHAPE_MUTATIONS.map(id => `shape-${id.slice(10)}-mutant`)].includes(variant));
        assert.equal(name, `event-${variant}-runtime`);
        assert.equal(owner, resource); assert.equal(alive(), true);
        const runtime = await onTiming("startup", async () => {
          step("start-" + variant);
          if (variant === "read-mutant" && stoppedAt === "cancel-after-read") cancelled = true;
          return { namespace: variant, owner: variant === "read-mutant" && stoppedAt === "reused-owner" ? "mutant" : variant,
          containers: { database: variant, data: variant === "read-mutant" && stoppedAt === "reused-cid" ? "mutant-data" : variant + "-data" } };
        });
        await onTiming("definition-import", () => undefined);
        await onTiming("identity-verification", () => undefined);
        return runtime;
      },
      eventRuntimeData: ccd => ({ ccd, definition: { fixtureDigest: digest("c") } }),
      selectEventCapabilityRuntime: (baseline, invocation, record) => {
        assert.equal(baseline, input); assert.equal(record.invocationId, invocation);
        assert.equal(record.requestDigest, digestBytes(JSON.stringify(request)));
        return { ...baseline, ccd: record.ccd };
      },
      eventIdentity: fault => ({ definitionDigests: { HarnessNestedPRL: fault.ccd.namespace } }),
      captureCiEventFaultOwnership: (selected, _handoff, _context, _directory, invocation) => {
        assert.equal(selected.ccd.namespace, eventCapabilityFaultVariant(invocation));
        step("owned-" + selected.ccd.namespace); return { invocations: [invocation] };
      },
      publishEventCapabilityRuntime: (output, record) => {
        step("ack-" + eventCapabilityFaultVariant(record.invocationId));
        const captured = JSON.parse(fs.readFileSync(path.join(output, "independent-transition.json")));
        assert.deepEqual(resource.expectedContainer.invocations, ["baseline", EVENT_CAPABILITY_MUTATION, COURTADMIN_READ_MUTATION, READONLY_READ_MUTATION, READONLY_UPDATE_MUTATION, COURTADMIN_UPDATE_MUTATION, ...SOURCE_SHAPE_MUTATIONS]);
        assert.equal(resource.eventTransition.digest, digestBytes(fs.readFileSync(path.join(output, "independent-transition.json"))));
        assert.equal(captured.schemaVersion, 2);
        assert.equal(captured.capturedBeforeFault, true);
        assert.equal(captured.baselineInputDigest, digestBytes("immutable baseline input\n"));
        assert.equal(captured.baselineRemoval.digest, digestBytes(fs.readFileSync(path.join(output, "baseline-removal.json"))));
        assert.deepEqual(captured.faults.map(item => item.invocationId), [EVENT_CAPABILITY_MUTATION, COURTADMIN_READ_MUTATION, READONLY_READ_MUTATION, READONLY_UPDATE_MUTATION, COURTADMIN_UPDATE_MUTATION, ...SOURCE_SHAPE_MUTATIONS]);
        const fault = captured.faults.find(item => item.invocationId === record.invocationId);
        assert.equal(fault.runtimeRecord.digest, digestBytes(JSON.stringify(record, null, 2) + "\n"));
        return publishEventCapabilityRuntime(output, record);
      },
    };
    deps.eventRuntimePreparationTimings = preparationTimings;
    const run = new Function(...Object.keys(deps), `return ${callback}\n}`)(...Object.values(deps));
    if (stoppedAt) await assert.rejects(run(request, handoff), /controlled-|CI_EVENT_TRANSITION_CANCELLED|CI_EVENT_FAULT_(?:OWNER|CID)_REUSE/);
    else await run(request, handoff);
    const faultInvocations=[EVENT_CAPABILITY_MUTATION,COURTADMIN_READ_MUTATION,READONLY_READ_MUTATION,READONLY_UPDATE_MUTATION,COURTADMIN_UPDATE_MUTATION,...SOURCE_SHAPE_MUTATIONS];
    const preparationSteps=['startup','definition-import','identity-verification','runtime-observation','ownership-capture','transition-identity'];
    if(stoppedAt===null){
      assert.deepEqual(preparationTimings.map(({runId,invocationId,step,status})=>({runId,invocationId,step,status})),faultInvocations.flatMap(invocationId=>preparationSteps.map(step=>({runId:request.runId,invocationId,step,status:'completed'}))));
    }else if(stoppedAt==='start-mutant'){
      assert.deepEqual(preparationTimings.map(({invocationId,step,status})=>({invocationId,step,status})),[{invocationId:EVENT_CAPABILITY_MUTATION,step:'startup',status:'failed'}]);
    }else if(stoppedAt==='owned-mutant'){
      assert.deepEqual(preparationTimings.map(({invocationId,step,status})=>({invocationId,step,status})),[
        ...preparationSteps.slice(0,4).map(step=>({invocationId:EVENT_CAPABILITY_MUTATION,step,status:'completed'})),
        {invocationId:EVENT_CAPABILITY_MUTATION,step:'ownership-capture',status:'failed'},
      ]);
    }else if(stoppedAt?.startsWith('start-')){
      assert.equal(preparationTimings.at(-1)?.step,'startup');assert.equal(preparationTimings.at(-1)?.status,'failed');
    }else if(stoppedAt?.startsWith('owned-')){
      assert.equal(preparationTimings.at(-1)?.step,'ownership-capture');assert.equal(preparationTimings.at(-1)?.status,'failed');
    }else assert.equal(preparationTimings.some(row=>row.status==='failed'),false);
    for (const mutation of [EVENT_CAPABILITY_MUTATION, COURTADMIN_READ_MUTATION, READONLY_READ_MUTATION, READONLY_UPDATE_MUTATION, COURTADMIN_UPDATE_MUTATION, ...SOURCE_SHAPE_MUTATIONS])
      assert.equal(fs.existsSync(path.join(directory, mutation, "runtime-input.json")), stoppedAt === null);
    const order = ["checkpoint", "native-removed", "ccd-removed", "start-mutant", "owned-mutant", "start-read-mutant", "owned-read-mutant", "start-readonly-read-mutant", "owned-readonly-read-mutant", "start-readonly-update-mutant", "owned-readonly-update-mutant", "start-courtadmin-update-mutant", "owned-courtadmin-update-mutant", ...SOURCE_SHAPE_MUTATIONS.flatMap(id => [`start-shape-${id.slice(10)}-mutant`, `owned-shape-${id.slice(10)}-mutant`]), "ack-mutant", "ack-read-mutant", "ack-readonly-read-mutant", "ack-readonly-update-mutant", "ack-courtadmin-update-mutant", ...SOURCE_SHAPE_MUTATIONS.map(id => `ack-shape-${id.slice(10)}-mutant`)];
    const count = stoppedAt === "cancel-after-read" ? 7 : stoppedAt?.startsWith("reused-") ? 6 : order.indexOf(stoppedAt) + 1;
    assert.deepEqual(calls, stoppedAt === null ? order : order.slice(0, count));
  }
});

test('private event preparation timings preserve substep order and record failed work', async () => {
 const {timeEventRuntimePreparation}=await import('./lib/exui-event-runtime-timing.mjs');
 const records=[];let tick=0;
 const options={clock:()=>tick+=10,timestamp:()=>`time-${tick}`};
 await timeEventRuntimePreparation(records,{runId:'run-1',invocationId:'fault-1',step:'startup',action:async()=>{}},options);
 await assert.rejects(timeEventRuntimePreparation(records,{runId:'run-1',invocationId:'fault-1',step:'definition-import',action:async()=>{throw Error('private failure');}},options),/private failure/);
 assert.deepEqual(records.map(({runId,invocationId,step,status,durationMs})=>({runId,invocationId,step,status,durationMs})),[
  {runId:'run-1',invocationId:'fault-1',step:'startup',status:'completed',durationMs:10},
  {runId:'run-1',invocationId:'fault-1',step:'definition-import',status:'failed',durationMs:10},
 ]);
});

test('private event preparation timing failures never replace or suppress proof actions', async () => {
 const {timeEventRuntimePreparation}=await import('./lib/exui-event-runtime-timing.mjs');
 const value={proof:'result'}, expectedError=Error('proof failed');let actions=0;
 const unavailable=[];
 assert.equal(timeEventRuntimePreparation(unavailable,{runId:'run',invocationId:'fault',step:'startup',action:()=>{actions++;return value;}},{clock:()=>{throw Error('clock failed');},timestamp:()=>{throw Error('timestamp failed');}}),value);
 const brokenRecords=new Proxy([],{set(){throw Error('record storage failed');},get(target,key){if(key==='push')return ()=>{throw Error('record failed');};return Reflect.get(target,key);}});
 assert.equal(timeEventRuntimePreparation(brokenRecords,{runId:'run',invocationId:'fault',step:'startup',action:()=>{actions++;return value;}},{clock:(()=>{let n=0;return()=>n++;})(),timestamp:()=> '2026-11-07T00:00:00.000Z'}),value);
 assert.throws(()=>timeEventRuntimePreparation(unavailable,{runId:'run',invocationId:'fault',step:'startup',action:()=>{actions++;throw expectedError;}},{clock:()=>{throw Error('clock failed');},timestamp:()=> '2026-11-07T00:00:00.000Z'}),error=>error===expectedError);
 assert.equal(actions,3);
});

test("support only: receipt consumption uses independent expected identity and re-evaluates raw evidence", async () => {
  const { validateCiPhase } = await load();
  const { getReleasePolicy } = await import("./lib/exui-release-policy.mjs");
  const { loadRunEvidence } = await import("./lib/exui-evidence-io.mjs");
  const {
    writeRunBundle,
  } = require("./fixtures/exui-evidence-bundle.mock.cjs");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ci-receipt-"));
  try {
    const policy = getReleasePolicy("exui-wa-family-pilot");
    const { runPath, run } = writeRunBundle(directory, policy);
    const { receipt } = loadRunEvidence(runPath, policy);
    fs.writeFileSync(
      path.join(directory, "gate.json"),
      JSON.stringify(receipt),
    );
    const expected = {
      runId: run.manifest.runId,
      harnessCommit: run.manifest.harnessCommit,
      releaseScopeId: policy.releaseScopeId,
      policyDigest: policy.policyDigest,
      identity: run.manifest.identity,
      harnessSourceDigest: run.manifest.runtimeMetadata.harnessSourceDigest,
    };
    assert.equal(
      validateCiPhase(directory, expected, { code: 0, signal: null }).status,
      "PASS",
    );
    assert.throws(
      () =>
        validateCiPhase(
          directory,
          {
            ...expected,
            identity: { ...expected.identity, artifactDigest: digest("7") },
          },
          { code: 0, signal: null },
        ),
      /IDENTITY/,
    );
    assert.throws(
      () =>
        validateCiPhase(directory, expected, { code: null, signal: "SIGTERM" }),
      /TERMINAL/,
    );
    fs.rmSync(path.join(directory, "gate.json"));
    assert.throws(() =>
      validateCiPhase(directory, expected, { code: 0, signal: null }),
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("support only: process controller captures launch expectations before gate and preserves observed child exit", async () => {
  const { executeCiProcess } = await load();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ci-child-"));
  const output = path.join(directory, "phase");
  try {
    const script = path.join(directory, "child.cjs");
    fs.writeFileSync(
      script,
      `const fs=require('fs'),p=process.argv[2];fs.mkdirSync(p);fs.writeFileSync(p+'/input.json',JSON.stringify({runId:'owned-launch'}));fs.writeFileSync(p+'/container-launch.json','{}');const timer=setInterval(()=>{if(fs.existsSync(p+'/independent-preexecution.json')){clearInterval(timer);fs.writeFileSync(p+'/gate.json','{}');process.exit(23);}},5);`,
    );
    const result = await executeCiProcess({
      script,
      args: [output],
      output,
      onPrepared: (input) => ({
        runId: input.runId,
        identity: "independently-declared",
      }),
    });
    assert.equal(result.terminal.code, 23);
    assert.equal(result.terminal.signal, null);
    assert.equal(result.expected.runId, "owned-launch");
    assert.equal(
      JSON.parse(
        fs.readFileSync(path.join(output, "independent-preexecution.json")),
      ).capturedBeforeGate,
      true,
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("support only: launch cannot credit a completed or absent input handoff", async () => {
  const { executeCiProcess } = await load();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ci-child-missing-"));
  try {
    for (const earlyGate of [false, true]) {
      const output = path.join(directory, String(earlyGate)),
        script = path.join(directory, `child-${earlyGate}.cjs`);
      fs.writeFileSync(
        script,
        earlyGate
          ? `const fs=require('fs'),p=process.argv[2];fs.mkdirSync(p);fs.writeFileSync(p+'/gate.json','{}');fs.writeFileSync(p+'/input.json','{}');fs.writeFileSync(p+'/container-launch.json','{}');setTimeout(()=>process.exit(0),100);`
          : "process.exit(0)",
      );
      await assert.rejects(
        executeCiProcess({
          script,
          args: [output],
          output,
          onPrepared: () => ({}),
        }),
        earlyGate ? /PRECEDE_GATE/ : /LAUNCH_INPUTS_REQUIRED/,
      );
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("support only: foreign container cannot reach destructive cleanup; matched CID must be observed removed", async () => {
  const { removeCiContainer } = await load();
  const expected = {
    id: "1".repeat(64),
    owner: "owned",
    image: digest("a"),
    network: "none",
    mounts: [],
  };
  let removed = false;
  const info = {
    Id: expected.id,
    Image: expected.image,
    Config: {
      Labels: {
        "exui.harness.owner": "foreign",
        "exui.harness.service": "candidate-runtime",
      },
    },
    HostConfig: { NetworkMode: "none", ReadonlyRootfs: true },
    Mounts: [],
  };
  assert.throws(
    () =>
      removeCiContainer(expected, {
        inspect: () => info,
        remove: () => {
          removed = true;
        },
      }),
    /OWNER/,
  );
  assert.equal(removed, false);
  info.Config.Labels["exui.harness.owner"] = "owned";
  removeCiContainer(expected, {
    inspect: () => (removed ? null : info),
    remove: (id) => {
      assert.equal(id, expected.id);
      removed = true;
    },
  });
  assert.equal(removed, true);
});

test("support only: observed daemon architecture and pinned image inventory control CI support", async () => {
  const { observeCiToolchain } = await load();
  const { CCD_IMAGES, ccdImagePins } = await import("./lib/exui-ccd-runtime.mjs");
  const { ARM64_BROWSER_RUNTIME } = await import("./lib/exui-oci-runtime.mjs");
  const { nativeRuntimeImages } = await import("./lib/exui-native-containers.mjs");
  let architecture = "arm64",
    wrongImageArchitecture = false,
    missing = false;
  const run = (_command, args) => {
    if (args[0] === "version")
      return JSON.stringify({
        Os: "linux",
        Arch: architecture,
        Version: "29.9.2",
      });
    const image = args[2];
    if (missing) throw Error("missing-cache");
    if (architecture === "amd64") {
      const pin = [...Object.values(nativeRuntimeImages("linux/amd64")), ...Object.values(ccdImagePins("linux/amd64"))].find(pin => pin.reference === image);
      assert(pin, "unrecognised image inspected");
      return JSON.stringify([{ Id: pin.configDigest, Os: "linux", Architecture: wrongImageArchitecture ? "arm64" : "amd64", RepoDigests: [pin.reference] }]);
    }
    return JSON.stringify([
      {
        Id: image,
        Os: "linux",
        Architecture: "arm64",
        RepoDigests: [image.includes("@") ? image : "registry/image@" + image],
      },
    ]);
  };
  const observed = observeCiToolchain({
    run,
    controller: { os: "darwin", architecture: "arm64", node: "v24.22.1" },
  });
  assert.equal(observed.docker.architecture, "arm64");
  assert.equal(observed.browserRuntime.image, ARM64_BROWSER_RUNTIME);
  assert.equal(
    Object.keys(observed.ccdImages).length,
    Object.keys(CCD_IMAGES).length,
  );
  architecture = "amd64";
  const amd = observeCiToolchain({ run });
  assert.equal(amd.nativeRuntime.platform, "linux/amd64");
  assert.equal(amd.browserRuntime.image, nativeRuntimeImages("linux/amd64").browser.configDigest);
  assert.equal(amd.ccdImages.data.image, ccdImagePins("linux/amd64").data.configDigest);
  wrongImageArchitecture = true;
  assert.throws(() => observeCiToolchain({ run }), /PLATFORM_MISMATCH/);
  architecture = "s390x";
  assert.throws(() => observeCiToolchain({ run }), /CI_DOCKER_ARCH_REQUIRED/);
  architecture = "arm64";
  missing = true;
  assert.throws(() => observeCiToolchain({ run }), /missing-cache/);
});

test("support only: mutable handoff cannot substitute another private source snapshot", async () => {
  const { captureCiOwnership } = await load();
  const { digestBytes } = await import("./lib/exui-evidence-io.mjs");
  const directory = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), "ci-owned-snapshot-"),
  );
  try {
    const stage = path.join(directory, "stage");
    fs.mkdirSync(stage);
    const { HARNESS_SOURCE_FILES } =
      await import("./lib/exui-candidate-runtime.mjs");
    for (const file of HARNESS_SOURCE_FILES) {
      const target = path.join(stage, file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.resolve(file), target);
    }
    const sourceDigest = digestBytes(
      JSON.stringify(
        HARNESS_SOURCE_FILES.map((file) => [
          file,
          digestBytes(fs.readFileSync(path.resolve(file))),
        ]),
      ),
    );
    const input = {
      runId: "candidate-11111111-1111-4111-8111-111111111111",
      harnessSources: HARNESS_SOURCE_FILES,
      harnessSourceDigest: sourceDigest,
    };
    const output = path.join(directory, "phase");
    fs.mkdirSync(output);
    const handoff = {
      owner: input.runId,
      cidFile: path.join(output, "container-id"),
      stagedHarness: stage,
    };
    const context = {
      sourceDigests: { family: sourceDigest },
      artifact: { candidateRoot: "/candidate" },
      browserRoot: "/browser",
      job: { output: directory },
    };
    const expected = captureCiOwnership(
      input,
      handoff,
      context,
      output,
      "family",
    );
    assert.equal(expected.owner, input.runId);
    assert.equal(
      expected.id,
      undefined,
      "CID may not yet exist when immutable expectations are captured",
    );
    for (const file of [HARNESS_SOURCE_FILES[0], 'scripts/fixtures/ccd/elasticsearch-images.json']) {
      fs.writeFileSync(path.join(stage, file), "tampered");
      assert.throws(
        () => captureCiOwnership(input, handoff, context, output, "family"),
        /SNAPSHOT_DIGEST/,
      );
      fs.copyFileSync(path.resolve(file), path.join(stage, file));
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("support only: cancellation invalidates public PASS before owned cleanup and records cleanup failure honestly", async () => {
  const { installCiCancellation } = await load();
  const { EventEmitter } = require("node:events");
  const { writePublicSummary } = await import("./lib/exui-evidence-io.mjs");
  for (const failed of [false, true]) {
    const output = fs.mkdtempSync(path.join(os.tmpdir(), "ci-cancel-"));
    const target = new EventEmitter();
    let exit;
    target.exit = (code) => {
      exit = code;
    };
    target.stderr = { write: () => {} };
    try {
      const summary = path.join(
        output,
        "public/release-assurance-summary.json",
      );
      writePublicSummary(summary, { status: "PASS", exitCode: 0 }, true);
      const resources = new Map([["owned-cid", "owner"]]);
      let attempted = false;
      const uninstall = installCiCancellation({
        resources,
        output,
        target,
        remove: () => {
          attempted = true;
          assert.equal(JSON.parse(fs.readFileSync(summary)).status, "BLOCKED");
          if (failed) throw Error("foreign-owner");
        },
      });
      target.emit("SIGTERM");
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(exit, 2);
      assert.equal(attempted, true);
      const result = JSON.parse(
        fs.readFileSync(path.join(output, "private/ci-result.json")),
      );
      assert.equal(result.cleanupComplete, !failed);
      assert.equal(result.interruptedBy, "SIGTERM");
      assert.equal(JSON.parse(fs.readFileSync(summary)).releaseApproval, false);
      uninstall();
    } finally {
      fs.rmSync(output, { recursive: true, force: true });
    }
  }
});

test("support only: child transport preserves the owned temporary root and excludes inherited service credentials", async () => {
  const { executeCiProcess } = await load();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ci-child-env-"));
  const output = path.join(directory, "phase");
  const before = process.env.IDAM_SECRET;
  process.env.IDAM_SECRET = "credential-sentinel";
  try {
    const script = path.join(directory, "child.cjs");
    fs.writeFileSync(
      script,
      `const fs=require('fs'),p=process.argv[2];fs.mkdirSync(p);fs.writeFileSync(p+'/environment.json',JSON.stringify({tmp:process.env.TMPDIR,secret:process.env.IDAM_SECRET}));fs.writeFileSync(p+'/input.json','{}');fs.writeFileSync(p+'/container-launch.json','{}');const timer=setInterval(()=>{if(fs.existsSync(p+'/independent-preexecution.json')){clearInterval(timer);process.exit(0);}},5);`,
    );
    await executeCiProcess({
      script,
      args: [output],
      output,
      onPrepared: () => ({}),
    });
    const env = JSON.parse(
      fs.readFileSync(path.join(output, "environment.json")),
    );
    assert.equal(env.tmp, fs.realpathSync(os.tmpdir()));
    assert.equal(env.secret, undefined);
  } finally {
    if (before === undefined) delete process.env.IDAM_SECRET;
    else process.env.IDAM_SECRET = before;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("support only: independently declared artifact mismatch initializes BLOCKED before any phase can start", async () => {
  const { describeCandidateArtifact } =
    await import("./lib/exui-candidate-artifact.mjs");
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "ci-artifact-input-"),
  );
  try {
    const artifact = path.join(directory, "artifact");
    const files = {
      "dist/rpx-exui/browser/index.html": "ui-fixture",
      "dist/rpx-exui/api/server.bundle.js": "server-fixture",
      "api/package.json": "{}",
      "config/default.json": "{}",
      "config/custom-environment-variables.json": "{}",
      "runtime/node": "node-fixture",
      "package.json":
        '{"dependencies":{"@hmcts/ccd-case-ui-toolkit":"7.4.21"}}',
      "yarn.lock": "lock-fixture",
      "node_modules/@hmcts/ccd-case-ui-toolkit/package.json":
        '{"version":"7.4.21"}',
    };
    for (const [name, contents] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(artifact, name)), {
        recursive: true,
      });
      fs.writeFileSync(path.join(artifact, name), contents);
    }
    const manifest = await describeCandidateArtifact(artifact, {
      sourceMethod: "git-archive",
      webappCommit: "a".repeat(40),
      sourceTree: "b".repeat(40),
      platform: "linux/arm64",
      buildImage: digest("c"),
      install: "immutable-offline",
    });
    const candidateManifest = path.join(directory, "candidate.json");
    fs.writeFileSync(candidateManifest, JSON.stringify(manifest));
    const output = path.join(directory, "fresh"),
      input = path.join(directory, "job.json");
    fs.writeFileSync(
      input,
      JSON.stringify({
        ...job,
        candidateManifest,
        output,
        expectedArtifactDigest: digest("0"),
      }),
    );
    const result = spawnSync(
      process.execPath,
      [path.resolve("scripts/run-harness-ci.mjs"), "--input", input],
      { encoding: "utf8", env: { PATH: process.env.PATH } },
    );
    assert.equal(result.status, 2);
    const summary = JSON.parse(
      fs.readFileSync(
        path.join(output, "public/release-assurance-summary.json"),
      ),
    );
    assert.equal(summary.status, "BLOCKED");
    assert.equal(summary.releaseApproval, false);
    assert.equal(summary.receiptAvailable, false);
    assert.equal(fs.existsSync(path.join(output, "private/family")), false);
    assert.match(
      fs.readFileSync(
        path.join(output, "private/orchestration-error.json"),
        "utf8",
      ),
      /DECLARED_ARTIFACT_DIGEST_MISMATCH/,
    );
    assert.deepEqual(fs.readdirSync(path.join(output, "public")), [
      "release-assurance-summary.json",
    ]);
    const unreviewedOutput = path.join(directory, "unreviewed-configuration");
    fs.writeFileSync(
      input,
      JSON.stringify({
        ...job,
        candidateManifest,
        output: unreviewedOutput,
        expectedArtifactDigest: manifest.identity.artifactDigest,
      }),
    );
    const unreviewed = spawnSync(
      process.execPath,
      [path.resolve("scripts/run-harness-ci.mjs"), "--input", input],
      { encoding: "utf8", env: { PATH: process.env.PATH } },
    );
    assert.equal(unreviewed.status, 2);
    assert.match(
      fs.readFileSync(
        path.join(unreviewedOutput, "private/orchestration-error.json"),
        "utf8",
      ),
      /CANDIDATE_CONFIGURATION_SOURCE_DRIFT/,
    );
    assert.equal(
      fs.existsSync(path.join(unreviewedOutput, "private/family")),
      false,
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("support only: output overlap and canonical symlink aliases are rejected before touching immutable bytes", async () => {
  const { createCiOutput } = await load();
  const { digestCandidateTree } =
    await import("./lib/exui-candidate-artifact.mjs");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ci-overlap-"));
  try {
    const immutable = path.join(directory, "candidate");
    fs.mkdirSync(immutable);
    fs.writeFileSync(path.join(immutable, "sentinel"), "sealed");
    const before = await digestCandidateTree(immutable);
    const alias = path.join(directory, "alias");
    fs.symlinkSync(immutable, alias);
    for (const output of [
      path.join(immutable, "fresh"),
      path.join(alias, "fresh-alias"),
    ]) {
      assert.throws(() => createCiOutput(output, [immutable]), /OVERLAP/);
      assert.equal(fs.existsSync(output), false);
      assert.equal(await digestCandidateTree(immutable), before);
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("support only: public summary reset rejects outside-root directory symlinks", async () => {
  const { writeCiPublicSummary } = await load();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ci-public-link-"));
  const output = path.join(directory, "output"),
    outside = path.join(directory, "outside");
  fs.mkdirSync(output);
  fs.mkdirSync(outside);
  fs.writeFileSync(
    path.join(outside, "release-assurance-summary.json"),
    "outside-sentinel",
  );
  fs.symlinkSync(outside, path.join(output, "public"));
  try {
    assert.throws(
      () =>
        writeCiPublicSummary(fs.realpathSync(output), {
          status: "BLOCKED",
          exitCode: 2,
        }),
      /PUBLIC/,
    );
    assert.equal(
      fs.readFileSync(
        path.join(outside, "release-assurance-summary.json"),
        "utf8",
      ),
      "outside-sentinel",
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("support only: coherent product FAIL propagates one and a forged PASS cannot replace raw mutation evidence", async () => {
  const { validateCiPhase } = await load();
  const { getReleasePolicy } = await import("./lib/exui-release-policy.mjs");
  const { loadRunEvidence } = await import("./lib/exui-evidence-io.mjs");
  const {
    writeRunBundle,
  } = require("./fixtures/exui-evidence-bundle.mock.cjs");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ci-product-fail-"));
  try {
    const policy = getReleasePolicy("exui-wa-scope-pilot");
    const { runPath, run } = writeRunBundle(directory, policy, {
      baselineExit: 1,
      baselineReport: {
        schemaVersion: 1,
        complete: true,
        status: "failed",
        globalErrors: [],
        tests: [
          {
            proofId: "wa-org-scope-ia",
            expectedStatus: "passed",
            status: "passed",
            retry: 0,
            failureId: null,
            unattributedErrors: 0,
          },
          {
            proofId: "wa-org-scope-civil",
            expectedStatus: "passed",
            status: "failed",
            retry: 0,
            failureId: "organisation-scope",
            unattributedErrors: 0,
          },
        ],
      },
    });
    const { receipt } = loadRunEvidence(runPath, policy);
    assert.equal(receipt.verdict.status, "FAIL");
    fs.writeFileSync(
      path.join(directory, "gate.json"),
      JSON.stringify(receipt),
    );
    const expected = {
      runId: run.manifest.runId,
      harnessCommit: run.manifest.harnessCommit,
      releaseScopeId: policy.releaseScopeId,
      policyDigest: policy.policyDigest,
      identity: run.manifest.identity,
      harnessSourceDigest: run.manifest.runtimeMetadata.harnessSourceDigest,
    };
    assert.equal(
      validateCiPhase(directory, expected, { code: 1, signal: null }).exitCode,
      1,
    );
    assert.throws(
      () =>
        validateCiPhase(
          directory,
          { ...expected, runId: "different-current-launch" },
          { code: 1, signal: null },
        ),
      /INDEPENDENT_IDENTITY/,
    );
    fs.writeFileSync(
      path.join(directory, "gate.json"),
      JSON.stringify({
        ...receipt,
        verdict: { status: "PASS", exitCode: 0, reasons: [] },
      }),
    );
    assert.throws(
      () => validateCiPhase(directory, expected, { code: 0, signal: null }),
      /RECOMPUTATION/,
    );
    fs.writeFileSync(
      path.join(directory, "gate.json"),
      JSON.stringify(receipt),
    );
    fs.rmSync(path.join(directory, "baseline-report.json"));
    assert.throws(() =>
      validateCiPhase(directory, expected, { code: 1, signal: null }),
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("support only: partial CCD startup recovers unrecorded server-created containers and tolerates removed services", async () => {
  const { cleanupCiCcd } = await load();
  const { CCD_IMAGES, ccdImagePins } = await import("./lib/exui-ccd-runtime.mjs");
  for (const platform of ["linux/arm64", "linux/amd64"]) {
  const images = platform === "linux/arm64" ? CCD_IMAGES : Object.fromEntries(Object.entries(ccdImagePins(platform)).map(([name,pin])=>[name,pin.configDigest]));
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ci-ccd-recovery-"));
  try {
    const owner = "harness-0123456789abcdef",
      resources = Object.fromEntries(
        Object.entries(images).map(([service, image]) => [
          service,
          { name: `${owner}-${service}`, image },
        ]),
      );
    fs.writeFileSync(
      path.join(directory, "recovery.json"),
      JSON.stringify({ owner, output: directory, resources, platform }),
    );
    fs.writeFileSync(
      path.join(directory, "runtime.json"),
      JSON.stringify({ owner, output: directory, containers: {}, platform }),
    );
    const id = "a".repeat(64),
      existing = {
        Id: id,
        Name: `/${resources.database.name}`,
        Image: images.database,
        Config: {
          Labels: {
            "exui.harness.owner": owner,
            "exui.harness.service": "database",
          },
        },
        HostConfig: { NetworkMode: "none" },
      };
    let stopped, removed = false;
    cleanupCiCcd(directory, {
      inspect: (name) => (!removed && (name === resources.database.name || name === id) ? existing : null),
      stop: (state) => {
        stopped = state;
        removed = true;
      },
    });
    assert.deepEqual(stopped.containers, { database: id });
    assert.equal(stopped.namespace, id);
    for (const change of [
      (i) => (i.Image = digest("f")),
      (i) => (i.Config.Labels["exui.harness.owner"] = "foreign"),
      (i) => (i.HostConfig.NetworkMode = "bridge"),
    ]) {
      const altered = structuredClone(existing);
      change(altered);
      stopped = null;
      assert.throws(() =>
        cleanupCiCcd(directory, {
          inspect: (name) =>
            name === resources.database.name ? altered : null,
          stop: (state) => {
            stopped = state;
          },
        }),
      );
      assert.equal(stopped, null);
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
  }
});

test("support only: cancellation observes a late host handoff and terminal Docker client before cleanup", async () => {
  const { cleanupCiPhase } = await load();
  const { spawn } = require("node:child_process");
  const { once } = require("node:events");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ci-late-handoff-"));
  const owner = "candidate-11111111-1111-4111-8111-111111111111",
    id = "a".repeat(64),
    script = path.join(directory, "child.cjs");
  let child;
  try {
    fs.writeFileSync(
      script,
      `const fs=require('fs'),p=process.argv[2];process.on('SIGTERM',()=>{fs.writeFileSync(p+'/container-launch.json','{}');fs.writeFileSync(p+'/container-id',${JSON.stringify(id)});fs.writeFileSync(p+'/docker-client-shutdown.json',JSON.stringify({owner:${JSON.stringify(owner)},observed:true,forced:false}));process.exit(0);});console.log('ready');setInterval(()=>{},1000);`,
    );
    child = spawn(process.execPath, [script, directory], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { PATH: process.env.PATH },
    });
    await once(child.stdout, "data");
    const expected = { owner, image: digest("a"), network: "none", mounts: [] };
    const info = {
      Id: id,
      Name: `/${owner}`,
      Image: expected.image,
      Config: {
        Labels: {
          "exui.harness.owner": owner,
          "exui.harness.service": "candidate-runtime",
        },
      },
      HostConfig: { NetworkMode: "none", ReadonlyRootfs: true },
      Mounts: [],
    };
    let removed = false;
    await cleanupCiPhase(
      { directory, name: "family", child, expectedContainer: expected },
      {},
      {
        inspect: () => (removed ? null : info),
        remove: () => {
          assert.equal(
            child.exitCode,
            0,
            "host terminal must be observed before Docker removal",
          );
          removed = true;
        },
      },
    );
    assert.equal(removed, true);
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
      await once(child, "exit");
    }
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("support only: missing CID recovers only the planned owned container and unknown creation stays incomplete", async () => {
  const { cleanupCiPhase } = await load();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ci-missing-cid-"));
  const owner = "candidate-11111111-1111-4111-8111-111111111111",
    id = "a".repeat(64),
    expected = { owner, image: digest("a"), network: "none", mounts: [] };
  try {
    fs.writeFileSync(path.join(directory, "container-launch.json"), "{}");
    fs.writeFileSync(
      path.join(directory, "docker-client-shutdown.json"),
      JSON.stringify({ owner, observed: true, forced: false }),
    );
    const info = {
      Id: id,
      Name: `/${owner}`,
      Image: expected.image,
      Config: {
        Labels: {
          "exui.harness.owner": owner,
          "exui.harness.service": "candidate-runtime",
        },
      },
      HostConfig: { NetworkMode: "none", ReadonlyRootfs: true },
      Mounts: [],
    };
    let removed = false;
    await cleanupCiPhase(
      { directory, name: "family", expectedContainer: expected },
      {},
      {
        inspect: (name) => {
          assert([owner, id].includes(name));
          return removed ? null : info;
        },
        remove: (actual) => {
          assert.equal(actual, id);
          removed = true;
        },
        reconcileMs: 0,
      },
    );
    assert.equal(removed, true);
    await assert.rejects(
      cleanupCiPhase(
        { directory, name: "family", expectedContainer: expected },
        {},
        {
          inspect: () => null,
          remove: () => assert.fail("unknown identity cannot be removed"),
          reconcileMs: 0,
        },
      ),
      /CREATION_OUTCOME_UNCERTAIN/,
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("support only: terminal async cancellation overwrites an intervening normal PASS", async () => {
  const { installCiCancellation } = await load();
  const { EventEmitter } = require("node:events");
  const { writePublicSummary } = await import("./lib/exui-evidence-io.mjs");
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "ci-cancel-final-"));
  const target = new EventEmitter();
  let release, exited;
  const done = new Promise((resolve) => {
    exited = resolve;
  });
  target.exit = exited;
  target.stderr = { write: () => {} };
  try {
    const pending = new Promise((resolve) => {
      release = resolve;
    });
    const uninstall = installCiCancellation({
      resources: new Map([["owned", {}]]),
      output,
      target,
      remove: () => pending,
    });
    target.emit("SIGTERM");
    writePublicSummary(
      path.join(output, "public/release-assurance-summary.json"),
      { status: "PASS", exitCode: 0 },
      true,
    );
    release();
    assert.equal(await done, 2);
    assert.equal(
      JSON.parse(
        fs.readFileSync(
          path.join(output, "public/release-assurance-summary.json"),
        ),
      ).status,
      "BLOCKED",
    );
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(output, "private/ci-result.json")))
        .exitCode,
      2,
    );
    uninstall();
  } finally {
    fs.rmSync(output, { recursive: true, force: true });
  }
});

test("support only: phase source membership is parent-owned and rejects empty or changed inventories before hashing", async () => {
  const { captureCiPhaseExpectation } = await load();
  const { digestBytes } = await import("./lib/exui-evidence-io.mjs");
  const { HARNESS_SOURCE_FILES } =
    await import("./lib/exui-candidate-runtime.mjs");
  const directory = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), "ci-source-inventory-"),
  );
  try {
    const identity = { artifactDigest: digest("a") },
      context = {
        commit: "a".repeat(40),
        artifact: { identity },
        dependencies: { digest: digest("b") },
        browserDigest: digest("c"),
        identity,
        ccdIdentity: identity,
      };
    const input = {
      runId: "candidate-11111111-1111-4111-8111-111111111111",
      harnessCommit: context.commit,
      harnessSourceState: "clean",
      artifact: { identity },
      harnessDependencies: context.dependencies,
      browserDigest: context.browserDigest,
      harnessSources: [],
      harnessSourceDigest: digestBytes("[]"),
    };
    const handoff = {
      owner: input.runId,
      cidFile: path.join(directory, "container-id"),
      stagedHarness: directory,
    };
    for (const name of ["family", "scope", "ccd"])
      for (const list of [
        [],
        HARNESS_SOURCE_FILES.slice(1),
        [...HARNESS_SOURCE_FILES].reverse(),
      ])
        assert.throws(
          () =>
            captureCiPhaseExpectation(
              name,
              { ...input, harnessSources: list },
              handoff,
              context,
              directory,
            ),
          /SOURCE_INVENTORY/,
        );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("support only: actual CI stop callback returns owned cleanup completion and propagates rejection", async () => {
  const { runFixedCiPilots } = await load();
  const source = fs.readFileSync(
    path.resolve("scripts/run-harness-ci.mjs"),
    "utf8",
  );
  const match = source.match(/stop:\s*\(\)\s*=>\s*\{([\s\S]*?)\n\s*\},/);
  assert(match, "fixed CCD stop callback exists");
  const stop = new Function("resources", "remove", `return()=>{${match[1]}}`)(
    new Map([["ccd-runtime", {}]]),
    () => Promise.reject(Error("controlled-owned-cleanup-rejection")),
  );
  await assert.rejects(
    runFixedCiPilots({
      phase: async () => ({ status: "PASS", exitCode: 0 }),
      derive: async () => {},
      start: async () => {},
      stop,
    }),
    /controlled-owned-cleanup-rejection/,
  );
});

test("support only: fixed job cancellation at any phase, derivation or CCD startup prevents subsequent work and still stops owned CCD", async () => {
  const { runFixedCiPilots } = await load();
  for (const point of ["family", "derive", "scope", "start", "ccd", "startEvent", "eventCapability", "routing", "startCallback", "recipientCallback", "selectorEventRow"]) {
    const calls = [];
    let cancelled = false;
    await assert.rejects(
      runFixedCiPilots({
        isCancelled: () => cancelled,
        phase: async (name) => {
          calls.push(name);
          if (name === point) cancelled = true;
          return { status: "PASS", exitCode: 0 };
        },
        derive: async () => {
          calls.push("derive");
          if (point === "derive") cancelled = true;
        },
        start: async () => {
          calls.push("start");
          if (point === "start") cancelled = true;
        },
        stop: async () => calls.push("stop"),
        startEvent: async () => {
          calls.push("startEvent");
          if (point === "startEvent") cancelled = true;
        },
        stopEvent: async () => calls.push("stopEvent"),
      startCallback: async () => {calls.push("startCallback");if(point === "startCallback") cancelled=true;},
      stopCallback: async () => calls.push("stopCallback"),
      }),
      /CI_JOB_CANCELLED/,
    );
    const order = ["family", "derive", "scope", "start", "ccd", "stop", "startEvent", "eventCapability", "stopEvent", "routing", "startCallback", "recipientCallback", "stopCallback", "selectorEventRow"];
    const expected = order.slice(
      0,
      order.indexOf(point) + 1,
    );
    if (["start", "ccd"].includes(point)) expected.push("stop");
    if (["startEvent", "eventCapability"].includes(point)) expected.push("stopEvent");
    if (["startCallback","recipientCallback"].includes(point)) expected.push("stopCallback");
    assert.deepEqual(calls, expected);
  }
});

test("support only: an asynchronous cancellation cleanup cannot allow a completed phase to start another phase", async () => {
  const { runFixedCiPilots, installCiCancellation } = await load();
  const { EventEmitter } = require("node:events");
  const output = fs.mkdtempSync(
    path.join(os.tmpdir(), "ci-continuation-cancel-"),
  );
  const target = new EventEmitter();
  target.stderr = { write: () => {} };
  let exit,
    release,
    cancelled = false;
  target.exit = (code) => {
    exit = code;
  };
  const uninstall = installCiCancellation({
    output,
    target,
    resources: new Map([["phase", "owned"]]),
    onCancel: () => {
      cancelled = true;
    },
    remove: () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  });
  try {
    const calls = [];
    await assert.rejects(
      runFixedCiPilots({
        isCancelled: () => cancelled,
        phase: async (name) => {
          calls.push(name);
          target.emit("SIGTERM");
          return { status: "PASS", exitCode: 0 };
        },
        derive: () => assert.fail("cancelled continuation"),
        start: () => assert.fail("cancelled startup"),
        stop: () => {},
      }),
      /CI_JOB_CANCELLED/,
    );
    assert.deepEqual(calls, ["family"]);
    assert.equal(exit, undefined);
    release();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(exit, 2);
    assert.equal(
      JSON.parse(
        fs.readFileSync(
          path.join(output, "public/release-assurance-summary.json"),
        ),
      ).status,
      "BLOCKED",
    );
  } finally {
    uninstall();
    fs.rmSync(output, { recursive: true, force: true });
  }
});


test('native progress reports waiting and terminal verdict without exposing operation data',async t=>{
 const {runFixedCiPilots}=await load();
 const messages=[];t.mock.method(console,'log',message=>messages.push(message));
 t.mock.timers.enable({apis:['setInterval']});
 let release;const pending=new Promise(resolve=>{release=resolve;});
 const run=runFixedCiPilots({progress:(await load()).reportNativeProgress,phase:()=>pending});
 assert.match(messages[0],/WA family: started/);
 t.mock.timers.tick(60_000);
 assert.match(messages[1],/WA family: still running/);
 assert.equal(messages.length,2);
 release({status:'FAIL',exitCode:1,private:'PRIVATE-CANARY'});
 assert.equal((await run).exitCode,1);
 assert.match(messages.at(-1),/WA family: FAIL/);
 const count=messages.length;t.mock.timers.tick(120_000);assert.equal(messages.length,count);
 assert.doesNotMatch(messages.join('\n'),/PRIVATE-CANARY/);
});

test('native progress stops heartbeat after a rejected operation and keeps the error private',async t=>{
 const {runFixedCiPilots}=await load();const messages=[];
 t.mock.method(console,'log',message=>messages.push(message));t.mock.timers.enable({apis:['setInterval']});
 await assert.rejects(runFixedCiPilots({progress:(await load()).reportNativeProgress,phase:async()=>{throw Error('PRIVATE-CANARY');}}),/PRIVATE-CANARY/);
 assert.match(messages.at(-1),/WA family: stopped/);
 const count=messages.length;t.mock.timers.tick(120_000);assert.equal(messages.length,count);
 assert.doesNotMatch(messages.join('\n'),/PRIVATE-CANARY/);
});


test('simulated fixed pilot operations do not print native execution milestones by default',async t=>{
 const {runFixedCiPilots}=await load();const messages=[];
 t.mock.method(console,'log',message=>messages.push(message));
 await runFixedCiPilots({phase:async()=>({status:'FAIL',exitCode:1})});
 assert.deepEqual(messages,[]);
});
test('actual callback parent removes baseline and captures fresh fault ownership before its only ACK',async t=>{
 const {digestBytes,writeJsonAtomic}=await import('./lib/exui-evidence-io.mjs');
 const {publishCallbackRuntime}=await import('./lib/exui-recipient-callback-transition.mjs');
 const {CALLBACK_SCOPE,CALLBACK_MUTATION}=await import('./lib/exui-recipient-callback-contract.mjs');
 const source=fs.readFileSync(path.join(__dirname,'run-harness-ci.mjs'),'utf8');
 const callback=source.match(/onCallbackTransition: (async \(request,handoff\) => \{[\s\S]*?)\n\s*\},\n\s*\} : \{\}\)/)?.[1];assert(callback);
 for(const stoppedAt of [null,'checkpoint','native-removed','ccd-removed','start','owned','cancel-after-start','reused-cid']){
  const directory=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'parent-callback-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));fs.writeFileSync(path.join(directory,'input.json'),'immutable callback baseline');
  const calls=[],resource={expectedContainer:{invocations:['baseline']}};let terminated=false;
  const step=name=>{calls.push(name);if(stoppedAt===name)throw Error('controlled-'+name);};
  const input={runId:'synthetic-run',ccd:{namespace:'old',owner:'old-owner',containers:{database:'old',data:'old-data'}}},request={runId:input.runId};
  const handoff={input,expected:{harnessCommit:'commit',harnessSourceDigest:digest('a')},handoff:{},isTerminated:()=>terminated};
  const deps={assert,fs,path,digestBytes,writeJsonAtomic,directory,resource,context:{},cancelled:false,CALLBACK_SCOPE,CALLBACK_MUTATION,
   resources:new Map([['callback-baseline-runtime','owned-baseline']]),inspectHostContainer:()=>assert.fail(),
   readCallbackBaselineCheckpoint:()=>{step('checkpoint');return {checkpointDigest:digest('b')};},
   assertEventBaselineRemoved:()=>{step('native-removed');return {removed:['native']};},
   remove:async(name,value)=>{assert.equal(name,'callback-baseline-runtime');assert.equal(value,'owned-baseline');step('ccd-removed');return {cleanupComplete:true};},
   startOwnedCcd:async(name,selection,alive,owner,variant)=>{assert.equal(name,'callback-binding-omitted-runtime');assert.equal(selection,'event-capability-baseline');assert.equal(variant,'binding-omitted');assert.equal(owner,resource);assert.equal(alive(),true);step('start');if(stoppedAt==='cancel-after-start')terminated=true;return {namespace:'fresh',owner:'new-owner',containers:{database:'fresh',data:stoppedAt==='reused-cid'?'old-data':'new-data'}};},
   eventRuntimeData:(ccd,scope)=>{assert.equal(scope,CALLBACK_SCOPE);return {ccd,definition:{kind:'native-recipient-callback-definition'}};},
   selectCallbackRuntime:(baseline,id,record)=>{assert.equal(baseline,input);assert.equal(id,CALLBACK_MUTATION);return {...input,...record};},
   captureCiCallbackFaultOwnership:selected=>{assert.equal(selected.ccd.namespace,'fresh');step('owned');return {invocations:[CALLBACK_MUTATION]};},
   eventIdentity:(_fault,scope)=>{assert.equal(scope,CALLBACK_SCOPE);return {synthetic:true};},
   publishCallbackRuntime:(output,record)=>{step('ack');const captured=JSON.parse(fs.readFileSync(path.join(output,'independent-callback-transition.json')));assert.equal(captured.schemaVersion,1);assert.equal(captured.capturedBeforeFault,true);assert.deepEqual(resource.expectedContainer.invocations,['baseline',CALLBACK_MUTATION]);assert.equal(resource.callbackTransition.digest,digestBytes(fs.readFileSync(path.join(output,'independent-callback-transition.json'))));assert.equal(captured.faults[0].runtimeRecord.digest,digestBytes(JSON.stringify(record,null,2)+'\n'));return publishCallbackRuntime(output,record);},
  };
  const run=new Function(...Object.keys(deps),`return ${callback}\n}`)(...Object.values(deps));
  if(stoppedAt)await assert.rejects(run(request,handoff),/controlled-|CI_CALLBACK_TRANSITION_CANCELLED|CI_CALLBACK_FAULT_CID_REUSE/);else await run(request,handoff);
  assert.equal(fs.existsSync(path.join(directory,CALLBACK_MUTATION,'runtime-input.json')),stoppedAt===null);
  if(!stoppedAt)assert.deepEqual(calls,['checkpoint','native-removed','ccd-removed','start','owned','ack']);
  else assert(!calls.includes('ack'));
 }
});

 test('public completion requires all seven ordered phases without inventing selector evidence', async () => {
  const {fixedCiPhasesPassed}=await import('./run-harness-ci.mjs');
  const prior=['family','scope','ccd','eventCapability','routing'].map(phase=>({phase,status:'PASS'}));
  assert.equal(fixedCiPhasesPassed(prior),false);assert.equal(prior.length,5);
  assert.equal(fixedCiPhasesPassed([...prior,{phase:'recipientCallback',status:'BLOCKED'}]),false);
  assert.equal(fixedCiPhasesPassed([...prior,{phase:'recipientCallback',status:'PASS'}]),false);
  assert.equal(fixedCiPhasesPassed([...prior,{phase:'recipientCallback',status:'PASS'},{phase:'selectorEventRow',status:'PASS'}]),true);
  assert.equal(fixedCiPhasesPassed([...prior,{phase:'recipientCallback',status:'PASS'},{phase:'selectorEventRow',status:'BLOCKED'}]),false);
  assert.equal(fixedCiPhasesPassed([...prior,{phase:'routing',status:'PASS'}]),false);
  assert.equal(fixedCiPhasesPassed([...prior].reverse().concat({phase:'recipientCallback',status:'PASS'})),false);
});

function eventPreparationDeferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const eventPreparationTick = () => new Promise(setImmediate);

test('owned CCD cleanup joins the actual callback import, identity and final cancellation boundary', { timeout: 2000 }, async t => {
  const {timeEventRuntimePreparation}=await import('./lib/exui-event-runtime-timing.mjs');
  const source = fs.readFileSync(path.join(__dirname, 'run-harness-ci.mjs'), 'utf8');
  const before = '  const remove = async (_id, resource) => {', middle = '  const startOwnedCcd = async ', after = '  const eventRuntimeData = ';
  for (const marker of [before, middle, after]) assert.equal(source.split(marker).length, 2, 'unique actual owned-start/remove boundary');
  const block = source.slice(source.indexOf(before), source.indexOf(after));
  for (const fault of ['none', 'import', 'identity', 'startup-unknown']) {
    const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'event-owned-import-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const importing = eventPreparationDeferred(), startup = eventPreparationDeferred(), events = [], timings = [];
    let fakeTime=0;
    const expectedError = new Error('controlled-' + fault);
    const dependencies = {
      assert, fs, path, privateRoot: root, context: { artifact: { provenance: { platform: 'linux/arm64' } } },
      docker: () => assert.fail('no actual Docker'), cleanupCiPhase: () => assert.fail('CCD cleanup only'), stopSelectorCiResource: () => assert.fail('CCD cleanup only'),
      writeJsonAtomic: (file, value) => fs.writeFileSync(file, JSON.stringify(value)),
      startCcdRuntime: async (directory, options) => {
        fs.mkdirSync(directory); events.push('start'); await startup.promise;
        if (fault === 'startup-unknown') { options.onCreateUncertainty(); throw expectedError; }
        return { output: directory };
      },
      importCcdDefinition: () => assert.fail('callback branch expected'), verifyCcdRuntimeIdentity: () => assert.fail('callback branch expected'),
      importNativeCallbackDefinition: async () => { events.push('import'); await importing.promise; if (fault === 'import') throw expectedError; },
      verifyNativeCallbackRuntime: () => { events.push('identity'); if (fault === 'identity') throw expectedError; },
      timeEventRuntimePreparation: (_records,entry) => timeEventRuntimePreparation(timings,{runId:'test-run',invocationId:'callback-runtime',...entry},{clock:()=>fakeTime+=1,timestamp:()=>`time-${fakeTime}`}),
      cleanupCiCcd: () => { events.push('cleanup'); return { cleanupComplete: true }; },
    };
    const api = new Function(...Object.keys(dependencies), `let cleanupComplete=true,cancelled=false;const resources=new Map();\n${block}\nreturn {startOwnedCcd,remove,resources,cancel:()=>{cancelled=true;},isClean:()=>cleanupComplete};`)(...Object.values(dependencies));
    const phase = { name: 'eventCapability' }; api.resources.set(phase.name, phase);
    const start = api.startOwnedCcd('callback-runtime', 'event-capability-baseline', () => true, phase, 'baseline',(step,action)=>dependencies.timeEventRuntimePreparation([], {runId:'test-run',invocationId:'callback-runtime',step,action}));
    const observed = start.then(() => ({}), error => ({ error }));
    await eventPreparationTick();
    assert.deepEqual([...api.resources.keys()], ['callback-runtime', 'eventCapability'], 'phase child must remain first in reverse cleanup');
    startup.resolve(); await eventPreparationTick();
    if (fault !== 'startup-unknown') assert.deepEqual(events, ['start', 'import']);
    if (fault === 'none') api.cancel();
    let removed = false;
    const removal = api.remove('callback-runtime', api.resources.get('callback-runtime')).then(() => { removed = true; });
    await eventPreparationTick();
    if (fault !== 'startup-unknown') { assert.equal(removed, false, 'cleanup must not overtake full import'); assert(!events.includes('cleanup')); }
    importing.resolve();
    const result = await observed; await removal;
    assert.equal(removed, true); assert.equal(events.at(-1), 'cleanup');
    assert.deepEqual(timings.map(({step,status})=>({step,status})),[
      {step:'startup',status:fault==='startup-unknown'?'failed':'completed'},
      ...(fault==='startup-unknown'?[]:[{step:'definition-import',status:fault==='import'?'failed':'completed'}]),
      ...(fault==='startup-unknown'||fault==='import'?[]:[{step:'identity-verification',status:fault==='identity'?'failed':'completed'}]),
    ]);
    if (fault === 'none') assert.match(result.error.message, /CI_EVENT_IMPORT_CANCELLED/); else assert.equal(result.error, expectedError);
    assert.equal(api.resources.has('callback-runtime'), false);
    assert.equal(api.isClean(), fault !== 'startup-unknown', 'unknown creation remains fail-closed after a settled promise');
  }
});

test('owned baseline CCD cleanup joins deferred workbasket import and preserves context or failure', { timeout: 2000 }, async t => {
  const source = fs.readFileSync(path.join(__dirname, 'run-harness-ci.mjs'), 'utf8');
  const removeStart = '  const remove = async (_id, resource) => {', removeEnd = '  const startOwnedCcd = async ', start = '      start: async () => {', end = '      stop: () => {';
  for (const marker of [removeStart, removeEnd, start, end]) assert.equal(source.split(marker).length, 2, 'unique baseline startup/cleanup boundary');
  const removeCode = source.slice(source.indexOf(removeStart), source.indexOf(removeEnd));
  const startCode = source.slice(source.indexOf(start), source.indexOf(end)).trim().replace(/^start: /, '').replace(/,$/, '');
  for (const fault of ['none', 'cancel', 'import', 'identity', 'cleanup']) {
    const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'event-baseline-import-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const gate = eventPreparationDeferred(), events = [], expectedError = new Error('controlled-' + fault);
    const context = { artifact: { provenance: { platform: 'linux/arm64' }, identity: {}, candidateRoot: '/candidate' } };
    const dependencies = {
      assert, fs, path, context, privateRoot: root, ROOT: path.resolve(__dirname, '..'),
      docker: () => assert.fail('no Docker'), cleanupCiPhase: () => assert.fail('CCD only'), stopSelectorCiResource: () => assert.fail('CCD only'),
      writeJsonAtomic: (file, value) => fs.writeFileSync(file, JSON.stringify(value)), digestBytes: () => digest('a'),
      startCcdRuntime: async directory => { fs.mkdirSync(directory); events.push('start'); return { output: directory, images: { data: { id: 'data-image' }, definition: { id: 'definition-image' } } }; },
      importCcdDefinition: () => events.push('definition'),
      importWorkbasketInputs: async () => { events.push('workbasket'); await gate.promise; if (fault === 'import') throw expectedError; return { binding: { workbookDigest: 'workbasket-digest' } }; },
      verifyCcdRuntimeIdentity: () => { events.push('identity'); if (fault === 'identity') throw expectedError; return { fixtureDigest: 'definition-digest' }; },
      effectiveCandidateConfiguration: () => ({ config: { jurisdictions: 'SYNTHETIC' } }), ccdRequest: () => ({ status: 200, body: {} }),
      cleanupCiCcd: () => { events.push('cleanup'); if (fault === 'cleanup') throw expectedError; return { cleanupComplete: true }; },
    };
    const api = new Function(...Object.keys(dependencies), `let cancelled=false,cleanupComplete=true;const resources=new Map();\n${removeCode}\nconst start=${startCode};return {start,remove,resources,cancel:()=>{cancelled=true},isClean:()=>cleanupComplete};`)(...Object.values(dependencies));
    const started = api.start().then(() => ({}), error => ({ error }));
    await eventPreparationTick(); assert.deepEqual(events, ['start', 'definition', 'workbasket']);
    if (fault === 'cancel') api.cancel();
    let removed = false;
    const removal = api.remove('ccd-runtime', api.resources.get('ccd-runtime')).then(() => { removed = true; return {}; }, error => ({ error }));
    await eventPreparationTick();
    assert.equal(removed, false); assert(!events.includes('cleanup'), 'cleanup cannot race workbasket import');
    gate.resolve(); const result = await started, cleaned = await removal;
    if (fault === 'import' || fault === 'identity') assert.equal(result.error, expectedError);
    else if (fault === 'cancel') assert.match(result.error.message, /CI_JOB_CANCELLED/);
    else {
      assert.equal(result.error, undefined);
      assert.deepEqual(context.ccdIdentity.definitionDigests, { HarnessNestedPRL: 'definition-digest', HarnessResultsPRL: 'workbasket-digest' });
    }
    if (fault === 'cleanup') { assert.equal(cleaned.error, expectedError); assert.equal(api.isClean(), false); assert(api.resources.has('ccd-runtime')); }
    else { assert.equal(removed, true); assert.equal(api.resources.has('ccd-runtime'), false); }
    assert.equal(events.at(-1), 'cleanup');
  }
});
