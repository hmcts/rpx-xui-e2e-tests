const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { expect } = require("@playwright/test");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const scope = "exui-hearing-publication-pilot";
const mutation = "hearing-amendments-use-enabled-map";
const url = "http://127.0.0.1:3100/external/config/ui";
const stepName = "harness-assertion:hearing-amendment-capability-map";

function compile(file, dependencies, environment = {}) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
    },
    reportDiagnostics: true,
  });
  assert.equal(compiled.diagnostics.length, 0);
  const module = { exports: {} };
  const load = (name) => {
    assert(Object.hasOwn(dependencies, name), `Unexpected proof dependency: ${name}`);
    return dependencies[name];
  };
  // Execute only this repository's proof/support source, with no candidate or transport module.
  new Function("require", "module", "exports", "process", compiled.outputText)(
    load, module, module.exports, { env: environment },
  );
  return module.exports;
}

function support() {
  return compile("src/harness/hearingPublication.ts", { "node:assert/strict": assert });
}

function validBody(api, fault = false) {
  return {
    hearingJurisdictionConfig: {
      hearingJurisdictions: structuredClone(api.EXPECTED_PROD_ENABLED4),
      hearingAmendment: structuredClone(fault ? api.EXPECTED_PROD_ENABLED4 : api.EXPECTED_PROD_AMENDMENTS2),
    },
  };
}

async function runProof(options = {}) {
  const api = support();
  const selectedMutation = Object.hasOwn(options, "mutation") ? options.mutation : undefined;
  const manifest = { releaseScopeId: scope, runId: "synthetic-run", ...options.manifest };
  const context = {
    releaseScopeId: scope,
    runId: "synthetic-run",
    invocationId: selectedMutation ? mutation : "baseline",
    ...options.context,
  };
  const calls = [], steps = [], observations = [];
  let registration, error;
  const fakeTest = (_title, details, callback) => { registration = { details, callback }; };
  fakeTest.step = async (name, callback) => {
    steps.push(name);
    return callback();
  };
  const env = {
    EXUI_CANDIDATE_RUN_MANIFEST: "/fake/manifest.json",
    EXUI_EVIDENCE_CONTEXT: "/fake/context.json",
    ...(selectedMutation === undefined ? {} : { EXUI_HARNESS_MUTATION: selectedMutation }),
  };
  const body = Object.hasOwn(options, "body") ? options.body : validBody(api, Boolean(selectedMutation));
  const raw = Object.hasOwn(options, "raw") ? options.raw : JSON.stringify(body);
  try {
    compile("src/tests/harness/hearing-publication/capabilities.spec.ts", {
      "node:fs": {
        readFileSync(file, encoding) {
          assert.equal(encoding, "utf8");
          assert([env.EXUI_CANDIDATE_RUN_MANIFEST, env.EXUI_EVIDENCE_CONTEXT].includes(file));
          return JSON.stringify(file === env.EXUI_CANDIDATE_RUN_MANIFEST ? manifest : context);
        },
        writeFileSync(file, data, writeOptions) {
          observations.push({ file, options: writeOptions, value: JSON.parse(data) });
        },
      },
      "node:path": path,
      "../../../fixtures/harnessIdentity": { test: fakeTest, expect },
      "../../../harness/hearingPublication": api,
    }, env);
    assert(registration, "Actual proof must register one callback");
    await registration.callback({
      request: {
        async get(route, requestOptions) {
          calls.push({ route, options: requestOptions });
          return {
            status: () => options.status ?? 200,
            url: () => options.url ?? url,
            text: async () => raw,
          };
        },
      },
    });
  } catch (caught) { error = caught; }
  return { error, calls, steps, observations, details: registration?.details };
}

test("support only: actual API proof passes the independent prod maps and records an exact direct GET", async () => {
  const result = await runProof();
  assert.equal(result.error, undefined);
  assert.deepEqual(result.calls, [{ route: "/external/config/ui", options: { maxRedirects: 0, maxRetries: 0 } }]);
  assert.deepEqual(result.steps, [stepName]);
  assert.deepEqual(result.details.annotation, { type: "harness-proof", description: "hearing-prod-capabilities" });
  assert.equal(result.observations.length, 1);
  assert.deepEqual(result.observations[0], {
    file: "/fake/hearing-publication-response.json",
    options: { mode: 0o600, flag: "wx" },
    value: { url, status: 200, body: JSON.stringify(validBody(support())) },
  });
});

test("support only: the valid wrong-capability body reaches and fails only the named amendment assertion", async () => {
  const result = await runProof({ mutation });
  assert(result.error);
  assert.deepEqual(result.steps, [stepName]);
  assert.deepEqual(result.details.annotation, { type: "harness-proof", description: "hearing-amendment-map-broadened" });
  assert.match(result.error.message, /toEqual/);
});

test("support only: a baseline amendment regression is detected by the named product assertion", async () => {
  const result = await runProof({ body: validBody(support(), true) });
  assert(result.error);
  assert.deepEqual(result.steps, [stepName]);
});

test("support only: unchanged, extra, AAT and malformed mutants cannot earn the named witness", async () => {
  const api = support();
  const extra = validBody(api, true);
  extra.hearingJurisdictionConfig.hearingAmendment[".+"].push({ jurisdiction: "DIVORCE", caseType: "DIVORCE" });
  const aat = validBody(api, true);
  aat.hearingJurisdictionConfig.hearingAmendment[".+"][3].includeCaseTypes.push("(Civil-|CIVIL-)\\d+");
  const selfEqual = validBody(api, true);
  selfEqual.hearingJurisdictionConfig.hearingJurisdictions[".+"].pop();
  selfEqual.hearingJurisdictionConfig.hearingAmendment = structuredClone(selfEqual.hearingJurisdictionConfig.hearingJurisdictions);
  const missingRoles = validBody(api, true);
  delete missingRoles.hearingJurisdictionConfig.hearingAmendment[".+"][0].roles;
  const extraConfigKey = validBody(api, true);
  extraConfigKey.hearingJurisdictionConfig.unexpected = {};
  for (const [label, body] of [
    ["unchanged", validBody(api)], ["extra", extra], ["AAT", aat],
    ["body self-equality", selfEqual], ["missing roles", missingRoles],
    ["extra configuration key", extraConfigKey], ["null", null],
    ["missing map", { hearingJurisdictionConfig: { hearingJurisdictions: api.EXPECTED_PROD_ENABLED4 } }],
    ["malformed map", { hearingJurisdictionConfig: { hearingJurisdictions: api.EXPECTED_PROD_ENABLED4, hearingAmendment: { ".+": "wrong" } } }],
  ]) {
    const result = await runProof({ mutation, body });
    assert(result.error, label);
    assert.deepEqual(result.steps, [], label);
  }
});

test("support only: non-200, redirects, wrong final URLs and invalid JSON fail before attribution with raw evidence", async () => {
  for (const options of [
    { status: 500 },
    // Correct bodies on a 302 are still ineligible, for both baseline and mutant.
    { status: 302, mutation: undefined },
    { status: 302 },
    { url: "http://127.0.0.1:3100/other-config" },
    { url: "http://127.0.0.1:3101/external/config/ui" },
    { raw: "not JSON" },
  ]) {
    const result = await runProof({ mutation, ...options });
    assert(result.error, JSON.stringify(options));
    assert.deepEqual(result.steps, []);
    assert.deepEqual(result.calls[0].options, { maxRedirects: 0, maxRetries: 0 });
    assert.equal(result.observations.length, 1);
    assert.equal(result.observations[0].value.status, options.status ?? 200);
    assert.equal(result.observations[0].value.url, options.url ?? url);
  }
});

test("support only: exact scope, invocation and mutation mappings are required before any request", async () => {
  for (const options of [
    { manifest: { releaseScopeId: "exui-wa-family-pilot" } },
    { context: { releaseScopeId: "exui-wa-family-pilot" } },
    { context: { invocationId: mutation } },
    { context: { runId: "other-run" } },
    { mutation, context: { invocationId: "baseline" } },
    { mutation: "unknown-mutation" },
    { mutation: "" },
  ]) {
    const result = await runProof(options);
    assert(result.error, JSON.stringify(options));
    assert.deepEqual(result.calls, []);
    assert.deepEqual(result.steps, []);
  }
});
