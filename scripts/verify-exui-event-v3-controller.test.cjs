const test = require("node:test"),
  assert = require("node:assert/strict");
const {
  serialParentFixture,
} = require("./fixtures/exui-event-v3-host-writer.mock.cjs");
test("strict fake parent vertical performs baseline and eleven serial ACK/completion/retirement boundaries", async (t) => {
  const f = await serialParentFixture(t),
    { runV3ParentTransition } = await import(
      process.env.EXUI_V3_CONTROLLER_UNDER_TEST ||
        "./run-harness-event-serial-v3.mjs"
    );
  let held;
  try {
    held = await runV3ParentTransition({
      directory: f.root,
      input: f.input,
      expected: f.expected,
      request: f.read("event-transition-request.json"),
      startFault: f.startFault,
      retire: f.retire,
      isTerminated: () => f.errors.length > 0,
    });
  } finally {
    f.stop();
    await Promise.all(f.tasks);
  }
  assert.deepEqual(f.errors, []);
  assert.equal(f.maxLive, 1);
  assert.equal(held.faults.length, 11);
  const { readEventSerialV3Chain } =
    await import("./lib/exui-ccd-event-transition-v3.mjs");
  assert.equal(readEventSerialV3Chain(f.root, held).promotionAllowed, false);
  for (let i = 0; i < held.faults.length; i++) {
    const id = held.faults[i].invocationId,
      prior = i ? held.faults[i - 1].invocationId : "baseline";
    assert(
      f.events.indexOf("retire:" + prior) < f.events.indexOf("start:" + id),
    );
    assert(f.events.indexOf("ack:" + id) < f.events.indexOf("complete:" + id));
    assert(
      f.events.indexOf("complete:" + id) < f.events.indexOf("retire:" + id),
    );
  }
});
test("cancelled parent creates no next fault and cannot relabel incomplete chain", async (t) => {
  const f = await serialParentFixture(t),
    { runV3ParentTransition } = await import(
      process.env.EXUI_V3_CONTROLLER_UNDER_TEST ||
        "./run-harness-event-serial-v3.mjs"
    ),
    signal = AbortSignal.abort();
  await assert.rejects(
    runV3ParentTransition({
      directory: f.root,
      input: f.input,
      expected: f.expected,
      request: f.read("event-transition-request.json"),
      startFault: f.startFault,
      retire: f.retire,
      signal,
    }),
    /EVENT_V3_PARENT_CANCELLED/,
  );
  assert(!f.events.some((value) => value.startsWith("start:")));
});
test("each of eleven start failures prevents ACK, proof and every later allocation", async (t) => {
  const { runV3ParentTransition } = await import(
      process.env.EXUI_V3_CONTROLLER_UNDER_TEST ||
        "./run-harness-event-serial-v3.mjs"
    ),
    { EVENT_V3_IDS } = await import("./lib/exui-event-v3-host-writer.mjs");
  for (const target of EVENT_V3_IDS) {
    const f = await serialParentFixture(t);
    const failure = Error("controlled-start");
    await assert.rejects(
      runV3ParentTransition({
        directory: f.root,
        input: f.input,
        expected: f.expected,
        request: f.read("event-transition-request.json"),
        startFault: async (id, alive) => {
          if (id === target) throw failure;
          return f.startFault(id, alive);
        },
        retire: f.retire,
        isTerminated: () => f.errors.length > 0,
      }),
      (error) => error === failure,
    );
    await Promise.all(f.tasks);
    assert.deepEqual(f.errors, []);
    assert(!f.events.includes("ack:" + target));
    for (const later of EVENT_V3_IDS.slice(EVENT_V3_IDS.indexOf(target) + 1))
      assert(!f.events.includes("start:" + later));
  }
});
test("each retirement failure closes the serial boundary before the next start", async (t) => {
  const { runV3ParentTransition } = await import(
      process.env.EXUI_V3_CONTROLLER_UNDER_TEST ||
        "./run-harness-event-serial-v3.mjs"
    ),
    { EVENT_V3_IDS } = await import("./lib/exui-event-v3-host-writer.mjs");
  for (const target of ["baseline", ...EVENT_V3_IDS]) {
    const f = await serialParentFixture(t),
      failure = Error("controlled-retirement");
    await assert.rejects(
      runV3ParentTransition({
        directory: f.root,
        input: f.input,
        expected: f.expected,
        request: f.read("event-transition-request.json"),
        startFault: f.startFault,
        retire: async (...args) => {
          if (args[0] === target) throw failure;
          return f.retire(...args);
        },
        isTerminated: () => f.errors.length > 0,
      }),
      (error) => error === failure,
    );
    await Promise.all(f.tasks);
    assert.deepEqual(f.errors, []);
    const later =
      target === "baseline"
        ? EVENT_V3_IDS
        : EVENT_V3_IDS.slice(EVENT_V3_IDS.indexOf(target) + 1);
    for (const id of later) assert(!f.events.includes("start:" + id));
  }
});
test("post-completion raw append and unsettled creator cannot cross retirement", async (t) => {
  const { runV3ParentTransition } = await import(
      process.env.EXUI_V3_CONTROLLER_UNDER_TEST ||
        "./run-harness-event-serial-v3.mjs"
    ),
    fs = require("node:fs"),
    path = require("node:path");
  for (const fault of ["append", "creator"]) {
    const f = await serialParentFixture(t);
    await assert.rejects(
      runV3ParentTransition({
        directory: f.root,
        input: f.input,
        expected: f.expected,
        request: f.read("event-transition-request.json"),
        startFault: f.startFault,
        retire: async (...args) => {
          const observed = await f.retire(...args);
          if (fault === "append")
            fs.appendFileSync(path.join(f.root, "baseline/personas.json"), " ");
          else observed.creators[0].terminal.observed = false;
          return observed;
        },
      }),
    );
    await Promise.all(f.tasks);
    assert(!f.events.some((value) => value.startsWith("start:")));
  }
});
test("prototype CLI mode and immutable source output boundaries reject before any producer", async (t) => {
  const fs = require("node:fs"),
    path = require("node:path"),
    os = require("node:os"),
    { spawnSync } = require("node:child_process");
  const root = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), "event-v3-cli-unit-"),
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const env = { PATH: process.env.PATH };
  for (const args of [
    ["--scope", "exui-ccd-pilot", "--event-serial-v3"],
    ["--scope", "exui-ccd-event-capability-pilot", "--event-serial-v3=false"],
    [
      "--scope",
      "exui-ccd-event-capability-pilot",
      "--event-serial-v3",
      "--event-serial-v3",
    ],
  ]) {
    const observed = spawnSync(
      process.execPath,
      ["scripts/run-harness-ccd-candidate.mjs", ...args],
      { encoding: "utf8", env },
    );
    assert.equal(observed.status, 2);
    assert.match(observed.stderr, /EVENT_V3_OPT_IN_SCOPE|EVENT_V3_HOST_FAILED/);
  }
  const candidate = path.join(root, "candidate");
  fs.mkdirSync(candidate);
  const browser = path.join(root, "browser");
  fs.mkdirSync(browser);
  const manifest = path.join(root, "candidate.json");
  fs.writeFileSync(manifest, JSON.stringify({ candidateRoot: candidate }));
  const output = path.resolve("must-not-write-event-v3-test-output");
  const input = path.join(root, "job.json");
  fs.writeFileSync(
    input,
    JSON.stringify({
      schemaVersion: 1,
      candidateManifest: manifest,
      browserCache: browser,
      output,
      expectedArtifactDigest: "sha256:" + "a".repeat(64),
    }),
  );
  const { runEventSerialV3 } =
    await import("./run-harness-event-serial-v3.mjs");
  await assert.rejects(
    runEventSerialV3(input),
    /CI_OUTPUT_IMMUTABLE_INPUT_OVERLAP/,
  );
  assert(!fs.existsSync(output));
});

test("transition request byte drift closes before any next allocation", async (t) => {
  const f = await serialParentFixture(t),
    fs = require("node:fs"),
    path = require("node:path"),
    { runV3ParentTransition } =
      await import("./run-harness-event-serial-v3.mjs");
  await assert.rejects(
    runV3ParentTransition({
      directory: f.root,
      input: f.input,
      expected: f.expected,
      request: f.read("event-transition-request.json"),
      startFault: f.startFault,
      retire: async (...args) => {
        const value = await f.retire(...args);
        fs.appendFileSync(
          path.join(f.root, "event-transition-request.json"),
          " ",
        );
        return value;
      },
    }),
    /EVENT_V3_REQUEST_CHANGED/,
  );
  assert(!f.events.some((value) => value.startsWith("start:")));
});

test("actual process waits final parent retirement release before exit and preserves existing transition guard", async (t) => {
  const fs = require("node:fs"),
    path = require("node:path"),
    os = require("node:os");
  const f = await require("./fixtures/exui-event-v3.mock.cjs").eventV3Fixture(
    t,
  );
  const api = await import("./lib/exui-event-v3-host-writer.mjs"),
    { executeCiProcess } = await import("./lib/exui-candidate-ci-process.mjs");
  const root = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), "v3-release-process-"),
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const output = path.join(root, "phase"),
    seed = path.join(root, "seed.json"),
    script = path.join(root, "child.mjs");
  fs.copyFileSync(path.join(f.directory, "input.json"), seed);
  const waitEnabled = process.env.EXUI_V3_FINAL_RELEASE_UNDER_TEST !== "0";
  fs.writeFileSync(
    script,
    `import fs from 'node:fs';import path from 'node:path';import{eventCapabilityTransitionRequest}from${JSON.stringify(path.resolve("scripts/lib/exui-ccd-event-transition.mjs"))};import{waitV3ParentRetirement}from${JSON.stringify(path.resolve("scripts/lib/exui-event-v3-host-writer.mjs"))};const output=process.argv[2],input=JSON.parse(fs.readFileSync(process.argv[3]));fs.mkdirSync(output);fs.copyFileSync(process.argv[3],path.join(output,'input.json'));fs.writeFileSync(path.join(output,'container-launch.json'),'{}');while(!fs.existsSync(path.join(output,'independent-preexecution.json')))await new Promise(r=>setTimeout(r,5));fs.writeFileSync(path.join(output,'event-transition-request.json'),JSON.stringify(eventCapabilityTransitionRequest(input)));while(!fs.existsSync(path.join(output,'callback-entered')))await new Promise(r=>setTimeout(r,5));const exists=fs.existsSync;fs.existsSync=file=>{const present=exists(file);if(file===path.join(output,'v3/held-chain.json')&&!present)fs.writeFileSync(path.join(output,'final-wait-observed.json'),'{}');return present;};if(${waitEnabled})await waitV3ParentRetirement(output,input);process.exitCode=0;`,
  );
  let child,
    terminal,
    callbackClosed = false;
  try {
    const result = await executeCiProcess({
      script,
      args: [output, seed],
      output,
      onPrepared: () => f.expected.baselineExpected,
      onChild: (value) => {
        child = value;
        child.once("exit", (code, signal) => {
          terminal = { code, signal };
        });
      },
      onEventTransition: async (_request, handoff) => {
        fs.writeFileSync(path.join(output, "callback-entered"), "");
        await api.waitV3File(output, "final-wait-observed.json", {
          isCancelled: () => handoff.isTerminated(),
          timeoutMs: 3000,
        });
        assert.equal(
          terminal,
          undefined,
          "child must stay live while final retirement is incomplete",
        );
        for (const name of fs.readdirSync(f.directory)) {
          if (
            [
              "input.json",
              "container-launch.json",
              "event-transition-request.json",
              "independent-preexecution.json",
            ].includes(name)
          )
            continue;
          fs.cpSync(path.join(f.directory, name), path.join(output, name), {
            recursive: true,
          });
        }
        callbackClosed = true;
        api.writeV3File(output, "v3/held-chain.json", f.expected);
        // No await after release: executeCiProcess's unchanged continuation must run before exit delivery.
      },
    });
    assert(callbackClosed);
    assert.deepEqual(result.terminal, { code: 0, signal: null });
    assert.deepEqual(terminal, { code: 0, signal: null });
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) {
      const { terminateOwnedChild } =
        await import("./lib/exui-candidate-runtime.mjs");
      await terminateOwnedChild(child);
    }
  }
});
