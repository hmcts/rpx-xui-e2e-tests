import {
  test,
  expect,
  observeCcd,
  ccdSessionRequest,
  ccdEventPersonas,
  eventProofInputs,
  bootstrapCcdEventCase,
  switchCcdEventActor,
  openCcdEventCase,
  saveCcdEventObservation,
  EVENT_ID,
  EVENT_NAME,
  EVENT_STATE,
  EVENT_SCOPE,
  EVENT_MUTATION,
  EVENT_START_HEADERS,
  EVENT_SUBMIT_HEADERS,
} from "../../../fixtures/harnessCcdEvent";

const mutation = process.env.EXUI_HARNESS_MUTATION;
type EventObservation = {
  eventTriggers: unknown[];
  eventOptions: string[];
  startStatus: number;
  submitStatus: number;
  before: Awaited<ReturnType<typeof observeCcd>>;
  after: Awaited<ReturnType<typeof observeCcd>>;
  intendedData: unknown;
};

// This callback is selected by the independently checked invocation, not by a response.
// An inapplicable fault fails before the named denial oracle can receive mutation credit.
const assertApplicability =
  mutation === EVENT_MUTATION
    ? (observation: EventObservation) => {
        expect(observation.eventTriggers).toEqual([
          expect.objectContaining({ id: EVENT_ID, name: EVENT_NAME }),
        ]);
        expect(observation.eventOptions).toEqual([EVENT_NAME]);
        expect(observation.startStatus).toBe(200);
        expect(observation.submitStatus).toBe(201);
        expect(observation.after.state.case_data).toEqual(
          observation.intendedData,
        );
        expect(observation.after.state.state).toBe(EVENT_STATE);
        expect(observation.after.state.version).toBe(
          observation.before.state.version + 1,
        );
        expect(observation.after.history).toHaveLength(
          observation.before.history.length + 1,
        );
        expect(
          observation.after.history.filter(
            (event: { id: string }) => event.id === EVENT_ID,
          ),
        ).toHaveLength(1);
      }
    : () => {};

test.describe.configure({ retries: 0 });

test(
  "source judge can read a case but event R cannot start or submit serviceOfDocuments",
  {
    annotation: {
      type: "harness-proof",
      description:
        mutation === EVENT_MUTATION
          ? "ccd-event-create-enabled"
          : "ccd-event-create-denied",
    },
  },
  async ({ page, request, playwright }) => {
    const { manifest, context } = eventProofInputs();
    expect(manifest.releaseScopeId).toBe(EVENT_SCOPE);
    expect(context.releaseScopeId).toBe(EVENT_SCOPE);
    expect(context.runId).toBe(manifest.runId);
    expect([undefined, EVENT_MUTATION]).toContain(mutation);
    expect(context.invocationId).toBe(
      mutation === EVENT_MUTATION ? EVENT_MUTATION : "baseline",
    );
    const personas = ccdEventPersonas();
    expect(personas.credentials.judge.roles?.slice().sort()).toEqual([
      "caseworker",
      "caseworker-harness",
      "caseworker-privatelaw-judge",
    ]);
    expect(Boolean(personas.sessions.judge)).toBe(true);
    expect(personas.credentials.judge.userId).not.toBe(
      personas.credentials.allowed.userId,
    );
    expect(personas.credentials.judge.userId).not.toBe(
      personas.credentials.courtadmin.userId,
    );
    const bootstrap = await bootstrapCcdEventCase(request, {
      protectedValue: "synthetic-judge-readable",
      sodAdditionalRecipients: ["additionalRecipients"],
      sodAdditionalRecipientsList: [
        {
          id: "723a508f-9e84-41a1-b39e-fde9d7e06ed2",
          value: {
            serveByPostOrEmail: "email",
            emailInformation: {
              emailName: "Synthetic event recipient",
              emailAddress: "event@harness.example.com",
            },
          },
        },
      ],
    });
    expect(bootstrap.trigger.status()).toBe(200);
    expect(
      typeof bootstrap.triggerBody.token === "string" &&
        bootstrap.triggerBody.token.length > 0,
    ).toBe(true);
    expect(bootstrap.created.status()).toBe(201);
    const caseId = String(bootstrap.body.id);
    expect(caseId).toMatch(/^\d{16}$/);
    const before = await observeCcd(caseId);
    expect(before.state.state).toBe(EVENT_STATE);
    expect(before.state.case_data.sodAdditionalRecipientsList).toHaveLength(1);
    expect(
      before.state.case_data.sodAdditionalRecipientsList[0].value,
    ).toMatchObject({
      serveByPostOrEmail: "email",
      emailInformation: {
        emailName: "Synthetic event recipient",
        emailAddress: "event@harness.example.com",
      },
    });
    await switchCcdEventActor(page, "judge");
    const sessionResponse = await page.request.get("/api/user/details", {
      maxRedirects: 0,
      maxRetries: 0,
    });
    expect(sessionResponse.status()).toBe(200);
    const sessionUser = (await sessionResponse.json()).userInfo;
    expect(sessionUser.id ?? sessionUser.uid).toBe(
      personas.credentials.judge.userId,
    );
    expect([...sessionUser.roles].sort()).toEqual([
      "caseworker",
      "caseworker-harness",
      "caseworker-privatelaw-judge",
    ]);
    const read = await openCcdEventCase(page, caseId);
    expect(read.status()).toBe(200);
    const caseView = await read.json();
    expect(Array.isArray(caseView.triggers)).toBe(true);
    await expect(
      page.getByText("event@harness.example.com", { exact: true }),
    ).toBeVisible();
    const menuOptions = await page
      .locator("ccd-event-trigger #next-step option")
      .allTextContents();
    const eventOptions = menuOptions
      .map((option) => option.trim())
      .filter((option) => option === EVENT_NAME);
    const eventTriggers = caseView.triggers.filter(
      (event: { id: string }) => event.id === EVENT_ID,
    );
    const judge = await ccdSessionRequest(playwright, personas.sessions.judge);
    try {
      const started = await judge.get(
        `/data/internal/cases/${caseId}/event-triggers/${EVENT_ID}?ignore-warning=false`,
        {
          headers: EVENT_START_HEADERS,
          maxRedirects: 0,
          maxRetries: 0,
        },
      );
      const tokenResponse = await judge.get(
        `/data/caseworkers/${personas.credentials.judge.userId}/jurisdictions/HARNESS/case-types/HarnessNestedPRL/cases/${caseId}/event-triggers/${EVENT_ID}/token`,
        {
          maxRedirects: 0,
          maxRetries: 0,
        },
      );
      expect(tokenResponse.status()).toBe(200);
      const tokenBody = await tokenResponse.json();
      expect(
        typeof tokenBody.token === "string" && tokenBody.token.length > 0,
      ).toBe(true);
      const intendedData = structuredClone(before.state.case_data);
      intendedData.sodAdditionalRecipientsList[0].value.emailInformation.emailAddress =
        "judge-change@harness.example.com";
      // Submit only the source event fields; protectedValue is read-only observation scaffolding for judge.
      const submittedData = {
        sodAdditionalRecipients: intendedData.sodAdditionalRecipients,
        sodAdditionalRecipientsList: intendedData.sodAdditionalRecipientsList,
      };
      const submitted = await judge.post(`/data/cases/${caseId}/events`, {
        headers: EVENT_SUBMIT_HEADERS,
        data: {
          data: submittedData,
          event: {
            id: EVENT_ID,
            summary: "Synthetic judge event permission attempt",
          },
          event_token: tokenBody.token,
          ignore_warning: false,
        },
        maxRedirects: 0,
        maxRetries: 0,
      });
      const after = await observeCcd(caseId);
      const observation = {
        actor: {
          userId: personas.credentials.judge.userId,
          roles: personas.credentials.judge.roles,
        },
        sessionUser: {
          id: sessionUser.id ?? sessionUser.uid,
          roles: sessionUser.roles,
        },
        caseId,
        eventId: EVENT_ID,
        caseViewStatus: read.status(),
        caseTriggers: caseView.triggers,
        menuOptions,
        eventTriggers,
        eventOptions,
        startStatus: started.status(),
        legacyTokenStatus: tokenResponse.status(),
        eventTokenPresent: true,
        submitStatus: submitted.status(),
        intendedData,
        submittedData,
        before,
        after,
      };
      saveCcdEventObservation("event-capability", observation);
      assertApplicability(observation);

      await test.step("harness-assertion:event-capability-isolation", async () => {
        expect(eventTriggers).toEqual([]);
        expect(eventOptions).toEqual([]);
        expect(started.status()).toBe(404);
        expect(submitted.status()).toBe(404);
        expect(after).toEqual(before);
      });
    } finally {
      await judge.dispose();
    }
  },
);
