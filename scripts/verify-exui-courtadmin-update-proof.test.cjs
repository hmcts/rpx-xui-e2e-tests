const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { expect } = require("@playwright/test");
const ts = require("typescript");
const mutation = "ccd-remove-courtadmin-event-create";
const eventId = "serviceOfDocuments",
  eventName = "Service of documents";
const scope = "exui-ccd-event-capability-pilot",
  oracle = "harness-assertion:courtadmin-update-persistence";

// Execute the actual source proof with independent in-memory UI and CCD transports.
// This validates proof behavior, never claims actual candidate or CCD execution.
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
                    AddressLine2: null,
                    AddressLine3: null,
                    PostTown: null,
                    County: null,
                    PostCode: `CODE ${i}`,
                    Country: null,
                  },
                },
              },
      })),
    })),
  );
  const selected = options.mutation,
    cases = new Map(),
    calls = [],
    steps = [],
    observations = [];
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
  if (options.alias) credentials.courtadmin.userId = credentials.allowed.userId;
  if (options.wrongRoles)
    credentials.courtadmin.roles = credentials.readonly.roles;
  let current,
    form = [],
    selection = false,
    registration,
    error;
  const response = (status, body = {}) => ({
    status: () => status,
    json: async () => structuredClone(body),
  });
  const fakeTest = (_name, metadata, callback) => {
    registration = { metadata, callback };
  };
  fakeTest.setTimeout = (milliseconds) => assert.equal(milliseconds, 180_000);
  fakeTest.describe = {
    configure: (value) => assert.deepEqual(value, { retries: 0 }),
  };
  fakeTest.step = async (name, callback) => {
    steps.push(name);
    return callback();
  };
  const inputName = (selector) => {
    const suffix = selector.match(/\$="([^"]+)"/)[1];
    return suffix.startsWith("_") ? suffix.slice(1) : suffix;
  };
  const field = (name, index) => ({
    field: name,
    index,
    nth: (i) => field(name, i),
    last: () => field(name, form.length - 1),
    fill: async (value) => {
      form[index][name] = value;
      calls.push(`fill:${name}:${index}:${value}`);
    },
  });
  const visibleValues = () => [
    "synthetic-courtadmin-original",
    "Check your answers",
    ...form.flatMap((item) => Object.values(item)),
  ];
  const fakeExpect = Object.assign((value) => {
    if (value?.marker !== undefined)
      return {
        toBeVisible: async () => {
          calls.push(`visible:${value.marker}`);
          assert(visibleValues().includes(value.marker));
          assert.notEqual(value.marker, options.hiddenMarker);
        },
        toHaveCount: async (count) =>
          assert.equal(
            visibleValues().filter((item) => item === value.marker).length,
            count,
          ),
      };
    if (value?.field !== undefined)
      return {
        toHaveValue: async (expected) =>
          assert.equal(form[value.index][value.field], expected),
        toHaveCount: async (expected) => assert.equal(form.length, expected),
      };
    if (value?.selection)
      return { toBeChecked: async () => assert.equal(selection, true) };
    return expect(value);
  }, expect);
  function uiValues() {
    return form.map((item) => ({
      value:
        item.channel === "email"
          ? {
              serveByPostOrEmail: "email",
              emailInformation: {
                emailName: item.emailName,
                emailAddress: item.emailAddress,
              },
            }
          : {
              serveByPostOrEmail: "post",
              postalInformation: {
                postalName: item.postalName,
                postalAddress: {
                  AddressLine1: item.AddressLine1,
                  AddressLine2: null,
                  AddressLine3: null,
                  PostTown: null,
                  County: null,
                  PostCode: item.PostCode,
                  Country: null,
                },
              },
            },
    }));
  }
  const page = {
    request: {
      get: async (route) => {
        assert.equal(route, "/api/user/details");
        return response(200, {
          userInfo: {
            id: credentials.courtadmin.userId,
            roles: credentials.courtadmin.roles,
          },
        });
      },
    },
    getByText: (marker) => ({ marker, isVisible: async () => visibleValues().includes(marker) && marker !== options.hiddenMarker }),
    locator: (selector) => field(inputName(selector), 0),
    getByLabel: (label) => {
      if (label === "Additional recipients (optional)")
        return {
          selection: true,
          check: async () => {
            selection = true;
          },
        };
      const control = (index) => ({
        nth: control,
        check: async () => {
          form[index].channel = label.toLowerCase();
        },
      });
      return control(0);
    },
    getByRole: (_role, { name }) => {
      const control = {
        first: () => control,
        last: () => control,
        click: async () => {
          calls.push("click:" + String(name));
          if (name === "Add new") form.push({});
          if (String(name) === "/Change/" && options.loseChange)
            form[0].emailAddress = "lost";
        },
      };
      return control;
    },
  };
  const support = {
    sharedRoleEventActor,
    test: fakeTest,
    expect: fakeExpect,
    COURTADMIN_UPDATE_MUTATION: mutation,
    EVENT_SCOPE: scope,
    EVENT_STATE: "JUDICIAL_REVIEW",
    EVENT_ID: eventId,
    EVENT_NAME: eventName,
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
      sessions: { courtadmin: "own-courtadmin-session" },
    }),
    bootstrapCcdEventCase: async (_request, data) => {
      current = String(1000000000000000 + cases.size);
      form = [];
      selection = false;
      cases.set(current, {
        state: {
          state: "JUDICIAL_REVIEW",
          version: 1,
          case_data: structuredClone(data),
        },
        history: [],
      });
      return {
        trigger: response(200),
        created: response(201),
        body: { id: current },
      };
    },
    observeCcd: async (id) => structuredClone(cases.get(id)),
    switchCcdEventActor: async (_page, actor) =>
      assert.equal(actor, "courtadmin"),
    openCcdEventCase: async () =>
      response(200, {
        triggers: selected ? [] : [{ id: eventId, name: eventName }],
        tabs: [{fields: [{id: "protectedValue", value: "synthetic-courtadmin-original"}]}],
      }),
    observeCcdEventReadback: async (_page, id, expected) => {
      calls.push("case-view-readback:" + id);
      const persisted = structuredClone(cases.get(id).state.case_data.sodAdditionalRecipientsList);
      return {caseViewStatus: 200, protectedValue: "synthetic-courtadmin-original", controlVisible: true,
        recipientFields: [{id: "sodAdditionalRecipientsList", value: persisted}], projected: persisted,
        visible: expected.map(() => true)};
    },
    openServiceOfDocuments: async () => response(200),
    submitServiceOfDocuments: async () => {
      calls.push("ui-submit:" + current);
      const data = {
        sodAdditionalRecipients: selection ? ["additionalRecipients"] : [],
        sodAdditionalRecipientsList: uiValues(),
      };
      const after = cases.get(current);
      Object.assign(after.state.case_data, structuredClone(data));
      after.state.version++;
      after.history.push({ id: eventId });
      if (options.corruptShape === cases.size) {
        if (options.corruptKind === "history") after.history = [];
        else after.state.case_data.sodAdditionalRecipientsList.pop();
      }
      return {
        ...response(201),
        request: () => ({
          postDataJSON: () => ({
            event: { id: eventId },
            event_token: "ui-token",
            data,
          }),
          headers: () => ({}),
        }),
      };
    },
    ccdSessionRequest: async (_playwright, session) => {
      assert.equal(session, "own-courtadmin-session");
      const id = current;
      return {
        get: async (route) => {
          if (route.endsWith("/token")) {
            assert(route.includes("/caseworkers/courtadmin-id/"));
            return response(200, { token: `own-token-${id}` });
          }
          assert(
            route.startsWith(`/data/internal/cases/${id}/event-triggers/`),
          );
          return response(404);
        },
        post: async (route, request) => {
          calls.push("denied-submit:" + id);
          assert.equal(route, `/data/cases/${id}/events`);
          assert.equal(request.data.event_token, `own-token-${id}`);
          if (options.ineffectiveShape === cases.size) return response(201);
          if (options.writeThenDenyShape === cases.size)
            cases.get(id).state.version++;
          return response(404);
        },
        dispose: async () => calls.push("disposed:" + id),
      };
    },
    saveCcdEventObservation: (name, value) => {
      assert.equal(name, "courtadmin-cell");
      observations.push(structuredClone(value));
    },
  };
  const source = fs.readFileSync(
    path.join(__dirname, "../src/tests/harness/ccd/courtadmin-cell.spec.ts"),
    "utf8",
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  });
  try {
    new Function("require", "exports", "process", compiled.outputText)(
      (name) => {
        if (name === "node:crypto") return require("node:crypto");
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

test("support only: courtadmin baseline proves all form/CYA/Change/persisted shapes", async () => {
  const result = await execute();
  assert.equal(result.error, undefined);
  assert.deepEqual(result.steps, [oracle]);
  assert.equal(result.observations[0].length, 4);
  assert.equal(
    result.calls.filter((x) => x.startsWith("ui-submit:")).length,
    4,
  );
  assert.equal(result.calls.filter((x) => x === "click:/Change/").length, 4);
  assert.equal(result.calls.filter((x) => x.startsWith("case-view-readback:")).length, 4);
  for (const marker of [
    "Postal 0",
    "Postal 1",
    "CODE 0",
    "CODE 1",
    "Synthetic courtadmin edited street 1",
    "Synthetic courtadmin edited street 2",
  ])
    assert(result.calls.includes("visible:" + marker));
});
test("support only: event permission fault denies every shape unchanged before intended allowed-write failure", async () => {
  const result = await execute({ mutation });
  assert(result.error);
  assert.deepEqual(result.steps, [oracle]);
  assert.equal(result.observations[0].length, 4);
  assert.equal(
    result.calls.filter((x) => x.startsWith("denied-submit:")).length,
    4,
  );
  assert.equal(
    result.registration.metadata.annotation.description,
    "ccd-courtadmin-update-recipient-shapes-denied",
  );
  for (const item of result.observations[0])
    assert.deepEqual(item.after, item.before);
});
for (const shape of [1, 2, 3, 4]) {
  for (const kind of ["ineffectiveShape", "writeThenDenyShape"])
    test(`support only: courtadmin ${kind} ${shape} cannot reach the intended oracle`, async () => {
      const result = await execute({ mutation, [kind]: shape });
      assert(result.error);
      assert.deepEqual(result.steps, []);
      assert.deepEqual(result.observations, []);
    });
  for (const corruptKind of ["data", "history"])
    test(`support only: courtadmin baseline rejects persisted ${corruptKind} loss for shape ${shape}`, async () => {
      const result = await execute({ corruptShape: shape, corruptKind });
      assert(result.error);
      assert.deepEqual(result.steps, [oracle]);
    });
}
for (const options of [
  { alias: true },
  { wrongRoles: true },
  { mutation: "ccd-enable-judge-event" },
  { mutation, invocation: "baseline" },
  { loseChange: true },
  { hiddenMarker: "CODE 1" },
])
  test(
    "support only: courtadmin source guard " + JSON.stringify(options),
    async () => {
      const result = await execute(options);
      assert(result.error);
      assert.deepEqual(result.steps, []);
    },
  );
