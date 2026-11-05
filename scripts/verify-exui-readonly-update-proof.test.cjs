const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { expect } = require("@playwright/test");
const ts = require("typescript");
const mutation = "ccd-enable-readonly-recipient-update";
const scope = "exui-ccd-event-capability-pilot";
const eventId = "serviceOfDocuments";
const eventName = "Service of documents";
const oracle = "harness-assertion:readonly-update-isolation";

// Execute the actual proof against independent fake transports. These checks establish
// proof control flow and attribution only; they are not native execution evidence.
async function execute(options = {}) {
  const {sharedRoleEventActor} = await import("./lib/exui-shared-role-event-observations.mjs");
  const scenarios = ["email", "post"].flatMap((channel) =>
    [1, 2].map((count) => ({
      name: `${channel}-${count}`,
      recipients: Array.from({ length: count }, (_, i) => ({
        id: `recipient-${i}`,
        value:
          channel === "email"
            ? {
                serveByPostOrEmail: channel,
                emailInformation: {
                  emailName: `Email ${i}`,
                  emailAddress: `person${i}@harness.example.com`,
                },
              }
            : {
                serveByPostOrEmail: channel,
                postalInformation: {
                  postalName: `Postal ${i}`,
                  postalAddress: {
                    AddressLine1: `Street ${i}`,
                    PostCode: `CODE ${i}`,
                  },
                },
              },
      })),
    })),
  );
  const selected = options.mutation;
  const credentials = Object.fromEntries(
    ["allowed", "courtadmin", "judge", "observer", "readonly"].map((name) => [
      name,
      {
        userId: `${name}-id`,
        roles: [
          "caseworker",
          "caseworker-harness",
          `caseworker-privatelaw-${name}`,
        ],
      },
    ]),
  );
  if (options.alias) credentials.readonly.userId = credentials.allowed.userId;
  if (options.wrongRoles)
    credentials.readonly.roles = credentials.courtadmin.roles;
  let registration, current, error;
  const cases = new Map(),
    calls = [],
    steps = [],
    observations = [];
  const response = (status, body = {}) => ({
    status: () => status,
    json: async () => structuredClone(body),
  });
  const fakeTest = (_name, metadata, callback) => {
    registration = { metadata, callback };
  };
  fakeTest.describe = {
    configure: (configuration) =>
      assert.deepEqual(configuration, { retries: 0 }),
  };
  fakeTest.step = async (name, callback) => {
    steps.push(name);
    return callback();
  };
  const fakeExpect = Object.assign(
    (value) =>
      value?.marker !== undefined
        ? {
            toBeVisible: async () => {
              calls.push(`visible:${value.marker}`);
              assert(
                JSON.stringify(cases.get(current).state.case_data).includes(
                  value.marker,
                ),
              );
              assert.notEqual(value.marker, options.hiddenMarker);
            },
          }
        : expect(value),
    expect,
  );
  const support = {
    sharedRoleEventActor,
    test: fakeTest,
    expect: fakeExpect,
    EVENT_SCOPE: scope,
    EVENT_STATE: "JUDICIAL_REVIEW",
    EVENT_ID: eventId,
    EVENT_NAME: eventName,
    READONLY_UPDATE_MUTATION: mutation,
    EVENT_START_HEADERS: {},
    EVENT_SUBMIT_HEADERS: {},
    courtadminReadScenarios: scenarios,
    eventProofInputs: () => ({
      manifest: { releaseScopeId: scope, runId: "run" },
      context: {
        releaseScopeId: scope,
        runId: "run",
        invocationId: options.invocation ?? selected ?? "baseline",
      },
    }),
    ccdEventPersonas: () => ({
      credentials,
      sessions: { readonly: "own-readonly-session" },
    }),
    bootstrapCcdEventCase: async (_request, data) => {
      current = String(1000000000000000 + cases.size);
      cases.set(current, {
        state: {
          state: "JUDICIAL_REVIEW",
          version: 1,
          case_data: structuredClone(data),
        },
        history: [],
      });
      calls.push("bootstrap:" + current);
      return {
        trigger: response(200),
        triggerBody: { token: "bootstrap-token-never-used" },
        created: response(201),
        body: { id: current },
      };
    },
    observeCcd: async (id) => {
      calls.push("observe:" + id);
      return structuredClone(cases.get(id));
    },
    switchCcdEventActor: async (_page, actor) => {
      assert.equal(actor, "readonly");
      calls.push("actor:" + actor);
    },
    openCcdEventCase: async (_page, id) => {
      current = id;
      return response(200, {
        triggers: selected ? [{ id: eventId, name: eventName }] : [],
        tabs: [{fields: Object.entries(cases.get(id).state.case_data).map(([id,value]) => ({id,value:structuredClone(value)}))}],
      });
    },
    ccdSessionRequest: async (_playwright, session) => {
      assert.equal(session, "own-readonly-session");
      const id = current;
      return {
        get: async (route) => {
          calls.push(route);
          if (route.endsWith("/token")) {
            assert(route.includes("/caseworkers/readonly-id/"));
            return response(200, { token: `own-token-${id}` });
          }
          assert(
            route.startsWith(`/data/internal/cases/${id}/event-triggers/`),
          );
          return response(selected ? 200 : 404);
        },
        post: async (route, request) => {
          assert.equal(route, `/data/cases/${id}/events`);
          assert.equal(request.data.event_token, `own-token-${id}`);
          assert.deepEqual(Object.keys(request.data.data).sort(), [
            "sodAdditionalRecipients",
            "sodAdditionalRecipientsList",
          ]);
          calls.push("submit:" + id);
          const observed = cases.get(id);
          if (selected) {
            Object.assign(
              observed.state.case_data,
              structuredClone(request.data.data),
            );
            observed.state.version++;
            observed.history.push({ id: eventId });
            if (options.badShape === cases.size) {
              if (options.badKind === "history") observed.history = [];
              else
                observed.state.case_data.sodAdditionalRecipientsList[0].value.serveByPostOrEmail =
                  "corrupt";
            }
          }
          return response(selected ? 201 : 404);
        },
        dispose: async () => calls.push("disposed:" + id),
      };
    },
    saveCcdEventObservation: (name, value) => {
      assert.equal(name, "readonly-update");
      observations.push(structuredClone(value));
    },
  };
  const source = fs.readFileSync(
    path.join(__dirname, "../src/tests/harness/ccd/readonly-update.spec.ts"),
    "utf8",
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  });
  const page = {
    request: {
      get: async (route) => {
        assert.equal(route, "/api/user/details");
        return response(200, {
          userInfo: {
            id: credentials.readonly.userId,
            roles: credentials.readonly.roles,
          },
        });
      },
    },
    getByText: (marker) => ({ marker, isVisible: async () => JSON.stringify(cases.get(current).state.case_data).includes(marker) && marker !== options.hiddenMarker }),
    locator: (selector) => {
      assert.equal(selector, "ccd-event-trigger #next-step option");
      return { allTextContents: async () => (selected ? [eventName] : []) };
    },
  };
  try {
    new Function("require", "exports", "process", compiled.outputText)(
      (name) => {
        assert.equal(name, "../../../fixtures/harnessCcdEvent");
        return support;
      },
      {},
      {
        env: selected === undefined ? {} : { EXUI_HARNESS_MUTATION: selected },
      },
    );
    await registration.callback({ page, request: {}, playwright: {} });
  } catch (caught) {
    error = caught;
  }
  return { error, steps, calls, observations, registration };
}

test("support only: readonly update baseline proves four shapes with own session/token and unchanged observations", async () => {
  const result = await execute();
  assert.equal(result.error, undefined);
  assert.deepEqual(result.steps, [oracle]);
  assert.equal(result.observations[0].length, 4);
  for (const item of result.observations[0])
    assert.deepEqual(item.after, item.before);
  assert.equal(
    result.calls.filter((call) => call.startsWith("submit:")).length,
    4,
  );
  for (const marker of [
    "Postal 0",
    "Postal 1",
    "Street 0",
    "Street 1",
    "CODE 0",
    "CODE 1",
  ])
    assert(result.calls.includes("visible:" + marker));
});
test("support only: effective readonly update fault persists every shape before the named denial failure", async () => {
  const result = await execute({ mutation });
  assert(result.error);
  assert.deepEqual(result.steps, [oracle]);
  assert.equal(result.observations[0].length, 4);
  assert.equal(
    result.registration.metadata.annotation.description,
    "ccd-readonly-update-recipient-shapes-enabled",
  );
  for (const item of result.observations[0]) {
    assert.notDeepEqual(
      item.after.state.case_data,
      item.before.state.case_data,
    );
    assert.equal(item.after.state.version, item.before.state.version + 1);
  }
});
for (const badShape of [1, 2, 3, 4])
  for (const badKind of ["data", "history"])
    test(`support only: ineffective readonly update ${badKind} shape ${badShape} cannot reach denial oracle`, async () => {
      const result = await execute({ mutation, badShape, badKind });
      assert(result.error);
      assert.deepEqual(result.steps, []);
      assert.deepEqual(result.observations, []);
    });
for (const options of [
  { alias: true },
  { wrongRoles: true },
  { mutation: "ccd-enable-judge-event" },
  { mutation, invocation: "baseline" },
  { hiddenMarker: "CODE 1" },
])
  test(
    "support only: readonly update actor, invocation and visible-control guard " +
      JSON.stringify(options),
    async () => {
      const result = await execute(options);
      assert(result.error);
      assert.deepEqual(result.steps, []);
    },
  );
