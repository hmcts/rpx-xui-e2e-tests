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
  READONLY_UPDATE_MUTATION,
  courtadminReadScenarios,
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
  mutation === READONLY_UPDATE_MUTATION
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

function changedRecipientData(before: Awaited<ReturnType<typeof observeCcd>>) {
  const intendedData = structuredClone(before.state.case_data);
  for (const [
    index,
    recipient,
  ] of intendedData.sodAdditionalRecipientsList.entries()) {
    if (recipient.value.serveByPostOrEmail === "email") {
      recipient.value.emailInformation.emailAddress = `readonly-change-${index + 1}@harness.example.com`;
    } else {
      recipient.value.postalInformation.postalAddress.AddressLine1 = `Synthetic readonly changed street ${index + 1}`;
    }
  }
  return intendedData;
}

test.describe.configure({ retries: 0 });

test(
  "source readonly cannot update any email or postal one/two-recipient shape",
  {
    annotation: {
      type: "harness-proof",
      description:
        mutation === READONLY_UPDATE_MUTATION
          ? "ccd-readonly-update-recipient-shapes-enabled"
          : "ccd-readonly-update-recipient-shapes-denied",
    },
  },
  async ({ page, request, playwright }) => {
    const { manifest, context } = eventProofInputs();
    expect(manifest.releaseScopeId).toBe(EVENT_SCOPE);
    expect(context.releaseScopeId).toBe(EVENT_SCOPE);
    expect(context.runId).toBe(manifest.runId);
    expect([undefined, READONLY_UPDATE_MUTATION]).toContain(mutation);
    expect(context.invocationId).toBe(
      mutation === READONLY_UPDATE_MUTATION
        ? READONLY_UPDATE_MUTATION
        : "baseline",
    );
    const personas = ccdEventPersonas();
    expect(personas.credentials.readonly.roles?.slice().sort()).toEqual([
      "caseworker",
      "caseworker-harness",
      "caseworker-privatelaw-readonly",
    ]);
    expect(Boolean(personas.sessions.readonly)).toBe(true);
    for (const other of [
      "allowed",
      "courtadmin",
      "judge",
      "observer",
    ] as const) {
      expect(personas.credentials.readonly.userId).not.toBe(
        personas.credentials[other].userId,
      );
    }
    const observations: Array<EventObservation & { scenario: string }> = [];
    for (const scenario of courtadminReadScenarios) {
      const bootstrap = await bootstrapCcdEventCase(request, {
        protectedValue: "synthetic-readonly-update-control",
        sodAdditionalRecipients: ["additionalRecipients"],
        sodAdditionalRecipientsList: scenario.recipients,
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
      expect(before.state.case_data.sodAdditionalRecipientsList).toEqual(
        scenario.recipients,
      );
      await switchCcdEventActor(page, "readonly");
      const sessionResponse = await page.request.get("/api/user/details", {
        maxRedirects: 0,
        maxRetries: 0,
      });
      expect(sessionResponse.status()).toBe(200);
      const sessionUser = (await sessionResponse.json()).userInfo;
      expect(sessionUser.id ?? sessionUser.uid).toBe(
        personas.credentials.readonly.userId,
      );
      expect([...sessionUser.roles].sort()).toEqual([
        "caseworker",
        "caseworker-harness",
        "caseworker-privatelaw-readonly",
      ]);
      const read = await openCcdEventCase(page, caseId);
      expect(read.status()).toBe(200);
      const caseView = await read.json();
      expect(Array.isArray(caseView.triggers)).toBe(true);
      await expect(
        page.getByText("synthetic-readonly-update-control", { exact: true }),
      ).toBeVisible();
      for (const recipient of scenario.recipients) {
        const markers = [
          recipient.value.emailInformation?.emailAddress,
          recipient.value.postalInformation?.postalName,
          recipient.value.postalInformation?.postalAddress.AddressLine1,
          recipient.value.postalInformation?.postalAddress.PostCode,
        ].filter((value): value is string => typeof value === "string");
        for (const marker of markers)
          await expect(page.getByText(marker, { exact: true })).toBeVisible();
      }
      const menuOptions = await page
        .locator("ccd-event-trigger #next-step option")
        .allTextContents();
      const eventOptions = menuOptions
        .map((option) => option.trim())
        .filter((option) => option === EVENT_NAME);
      const eventTriggers = caseView.triggers.filter(
        (event: { id: string }) => event.id === EVENT_ID,
      );
      const readonly = await ccdSessionRequest(
        playwright,
        personas.sessions.readonly,
      );
      try {
        const started = await readonly.get(
          `/data/internal/cases/${caseId}/event-triggers/${EVENT_ID}?ignore-warning=false`,
          {
            headers: EVENT_START_HEADERS,
            maxRedirects: 0,
            maxRetries: 0,
          },
        );
        const tokenResponse = await readonly.get(
          `/data/caseworkers/${personas.credentials.readonly.userId}/jurisdictions/HARNESS/case-types/HarnessNestedPRL/cases/${caseId}/event-triggers/${EVENT_ID}/token`,
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
        const intendedData = changedRecipientData(before);
        // Preserve collection IDs and selector. Only existing source recipient values change.
        const submittedData = {
          sodAdditionalRecipients: intendedData.sodAdditionalRecipients,
          sodAdditionalRecipientsList: intendedData.sodAdditionalRecipientsList,
        };
        const submitted = await readonly.post(`/data/cases/${caseId}/events`, {
          headers: EVENT_SUBMIT_HEADERS,
          data: {
            data: submittedData,
            event: {
              id: EVENT_ID,
              summary: "Synthetic readonly event permission attempt",
            },
            event_token: tokenBody.token,
            ignore_warning: false,
          },
          maxRedirects: 0,
          maxRetries: 0,
        });
        const after = await observeCcd(caseId);
        const observation = {
          scenario: scenario.name,
          actor: {
            userId: personas.credentials.readonly.userId,
            roles: personas.credentials.readonly.roles,
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
        assertApplicability(observation);
        observations.push(observation);
      } finally {
        await readonly.dispose();
      }
    }

    saveCcdEventObservation("readonly-update", observations);

    // Every shape must prove an effective fault before the intended denial oracle fails.
    await test.step("harness-assertion:readonly-update-isolation", async () => {
      expect(observations.map((item) => item.scenario)).toEqual([
        "email-1",
        "email-2",
        "post-1",
        "post-2",
      ]);
      for (const observation of observations) {
        expect(observation.eventTriggers, observation.scenario).toEqual([]);
        expect(observation.eventOptions, observation.scenario).toEqual([]);
        expect(observation.startStatus, observation.scenario).toBe(404);
        expect(observation.submitStatus, observation.scenario).toBe(404);
        expect(observation.after, observation.scenario).toEqual(
          observation.before,
        );
      }
    });
  },
);
