import {
  test,
  expect,
  observeCcd,
  ccdEventPersonas,
  eventProofInputs,
  bootstrapCcdEventCase,
  switchCcdEventActor,
  openCcdEventCase,
  saveCcdEventObservation,
  EVENT_SCOPE,
  EVENT_STATE,
  COURTADMIN_READ_MUTATION,
  READONLY_READ_MUTATION,
  courtadminReadScenarios,
} from "../../../fixtures/harnessCcdEvent";

const mutation = process.env.EXUI_HARNESS_MUTATION;
type CaseViewField = { id: string; value?: unknown };
const assertFaultApplicability = [COURTADMIN_READ_MUTATION, READONLY_READ_MUTATION].includes(mutation ?? "")
  ? (fields: CaseViewField[], visible: boolean) => {
      expect(fields).toEqual([]);
      expect(visible).toBe(false);
    }
  : () => {};


test.describe.configure({ retries: 0 });

for (const [persona, fault] of [["courtadmin", COURTADMIN_READ_MUTATION], ["readonly", READONLY_READ_MUTATION]] as const) {
  if (mutation && mutation !== fault) continue;

  test(
  `source ${persona} reads all email and postal one/two-recipient shapes without modifying CCD`,
  {
    annotation: {
      type: "harness-proof",
      description: mutation ? `ccd-${persona}-read-shapes-hidden` : `ccd-${persona}-read-recipient-shapes`,
    },
  },
  async ({ page, request }) => {
    const { manifest, context } = eventProofInputs();
    expect(manifest.releaseScopeId).toBe(EVENT_SCOPE);
    expect(context.releaseScopeId).toBe(EVENT_SCOPE);
    expect(context.runId).toBe(manifest.runId);
    expect([undefined, fault]).toContain(mutation);
    expect(context.invocationId).toBe(mutation ?? "baseline");
    const personas = ccdEventPersonas();
    const roles = ["caseworker", "caseworker-harness", `caseworker-privatelaw-${persona}`];
    expect(personas.credentials[persona].roles?.slice().sort()).toEqual(roles);
    expect(personas.credentials[persona].userId).not.toBe(personas.credentials.allowed.userId);
    expect(personas.credentials[persona].userId).not.toBe(personas.credentials.observer.userId);
    const observations: Array<{
      scenario: string; caseId: string; actor: unknown; caseViewStatus: number;
      recipientFields: CaseViewField[]; projected: unknown; expectedRecipients: unknown[];
      visible: boolean[]; before: unknown; after: unknown;
    }> = [];
    for (const scenario of courtadminReadScenarios) {
      const expectedRecipients = scenario.recipients.map(item => item.value);
      const bootstrap = await bootstrapCcdEventCase(request, {
        protectedValue: "synthetic-courtadmin-read-control",
        sodAdditionalRecipients: ["additionalRecipients"],
        sodAdditionalRecipientsList: scenario.recipients,
      });
      expect(bootstrap.trigger.status()).toBe(200);
      expect(bootstrap.created.status()).toBe(201);
      const caseId = String(bootstrap.body.id);
      expect(caseId).toMatch(/^\d{16}$/);
      const before = await observeCcd(caseId);
      expect(before.state.state).toBe(EVENT_STATE);
      expect(before.state.case_data.sodAdditionalRecipientsList.map(
        (item: { value: unknown }) => item.value,
      )).toEqual(expectedRecipients);
      await switchCcdEventActor(page, persona);
      const details = await page.request.get("/api/user/details", { maxRedirects: 0, maxRetries: 0 });
      expect(details.status()).toBe(200);
      const actor = (await details.json()).userInfo;
      expect(actor.id ?? actor.uid).toBe(personas.credentials[persona].userId);
      expect([...actor.roles].sort()).toEqual(roles);
      const read = await openCcdEventCase(page, caseId);
      expect(read.status()).toBe(200);
      const caseView = await read.json();
      expect(Array.isArray(caseView.tabs)).toBe(true);
      const fields: CaseViewField[] = caseView.tabs.flatMap((tab: { fields: CaseViewField[] }) => tab.fields);
      expect(fields.find(field => field.id === "protectedValue")?.value).toBe("synthetic-courtadmin-read-control");
      await expect(page.getByText("synthetic-courtadmin-read-control", { exact: true })).toBeVisible();
      const recipientFields = fields.filter(field => field.id === "sodAdditionalRecipientsList");
      const projected = recipientFields[0]?.value ?? null;
      const visible = [];
      for (const recipient of expectedRecipients) {
        const markers = [
          recipient.emailInformation?.emailAddress,
          recipient.postalInformation?.postalName,
          recipient.postalInformation?.postalAddress.AddressLine1,
          recipient.postalInformation?.postalAddress.PostCode,
        ].filter((value): value is string => typeof value === "string");
        const markerVisibility = [];
        for (const marker of markers) {
          const locator = page.getByText(marker, { exact: true });
          await expect(locator).toBeVisible({ visible: !mutation });
          markerVisibility.push(await locator.isVisible());
        }
        visible.push(markerVisibility.every(Boolean));
      }
      const after = await observeCcd(caseId);
      expect(after).toEqual(before);
      assertFaultApplicability(recipientFields, visible.some(Boolean));
      observations.push({ scenario: scenario.name, caseId, actor, caseViewStatus: read.status(),
        recipientFields, projected, expectedRecipients, visible, before, after });
    }
    saveCcdEventObservation(`${persona}-read`, observations);

    // Check every fault shape before the intentional failure can terminate the proof.
    await test.step(`harness-assertion:${persona}-recipient-read-projection`, async () => {
      expect(observations.map(item => item.scenario)).toEqual(["email-1", "email-2", "post-1", "post-2"]);
      for (const observation of observations) {
        expect(observation.recipientFields, observation.scenario).toHaveLength(1);
        const projected = observation.projected;
        expect(Array.isArray(projected) ? projected.map((item: { value: unknown }) => item.value) : projected,
          observation.scenario).toEqual(observation.expectedRecipients);
        expect(observation.visible, observation.scenario).toEqual(observation.expectedRecipients.map(() => true));
      }
    });
  },
);
}
