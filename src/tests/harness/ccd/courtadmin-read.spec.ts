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
} from "../../../fixtures/harnessCcdEvent";

const mutation = process.env.EXUI_HARNESS_MUTATION;
const recipient = {
  serveByPostOrEmail: "email",
  emailInformation: {
    emailName: "Synthetic courtadmin read recipient",
    emailAddress: "courtadmin-read@harness.example.com",
  },
};
type CaseViewField = { id: string; value?: unknown };
const assertFaultApplicability = mutation === COURTADMIN_READ_MUTATION
  ? (fields: CaseViewField[], visible: boolean) => {
      expect(fields).toEqual([]);
      expect(visible).toBe(false);
    }
  : () => {};


test.describe.configure({ retries: 0 });

test(
  "source courtadmin reads exactly one seeded email recipient through CCD and the candidate case view",
  {
    annotation: {
      type: "harness-proof",
      description: mutation === COURTADMIN_READ_MUTATION
        ? "ccd-courtadmin-read-hidden"
        : "ccd-courtadmin-read-email-one",
    },
  },
  async ({ page, request }) => {
    const { manifest, context } = eventProofInputs();
    expect(manifest.releaseScopeId).toBe(EVENT_SCOPE);
    expect(context.releaseScopeId).toBe(EVENT_SCOPE);
    expect(context.runId).toBe(manifest.runId);
    expect([undefined, COURTADMIN_READ_MUTATION]).toContain(mutation);
    expect(context.invocationId).toBe(mutation ?? "baseline");
    const personas = ccdEventPersonas();
    const roles = ["caseworker", "caseworker-harness", "caseworker-privatelaw-courtadmin"];
    expect(personas.credentials.courtadmin.roles?.slice().sort()).toEqual(roles);
    expect(personas.credentials.courtadmin.userId).not.toBe(personas.credentials.allowed.userId);
    expect(personas.credentials.courtadmin.userId).not.toBe(personas.credentials.observer.userId);
    const bootstrap = await bootstrapCcdEventCase(request, {
      protectedValue: "synthetic-courtadmin-read-control",
      sodAdditionalRecipients: ["additionalRecipients"],
      sodAdditionalRecipientsList: [{
        id: "46e2ff95-4689-42ea-b38c-d3b9204572b4",
        value: recipient,
      }],
    });
    expect(bootstrap.trigger.status()).toBe(200);
    expect(bootstrap.created.status()).toBe(201);
    const caseId = String(bootstrap.body.id);
    expect(caseId).toMatch(/^\d{16}$/);
    const before = await observeCcd(caseId);
    expect(before.state.state).toBe(EVENT_STATE);
    expect(before.state.case_data.sodAdditionalRecipientsList.map(
      (item: { value: unknown }) => item.value,
    )).toEqual([recipient]);

    await switchCcdEventActor(page, "courtadmin");
    const details = await page.request.get("/api/user/details", { maxRedirects: 0, maxRetries: 0 });
    expect(details.status()).toBe(200);
    const actor = (await details.json()).userInfo;
    expect(actor.id ?? actor.uid).toBe(personas.credentials.courtadmin.userId);
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
    const emailVisible = await page.getByText(recipient.emailInformation.emailAddress, { exact: true }).isVisible();
    const after = await observeCcd(caseId);
    expect(after).toEqual(before);
    saveCcdEventObservation("courtadmin-read", {
      actor: { id: actor.id ?? actor.uid, roles: actor.roles },
      caseId,
      caseViewStatus: read.status(),
      caseView,
      recipientFields,
      emailVisible,
      before,
      after,
    });
    assertFaultApplicability(recipientFields, emailVisible);

    await test.step("harness-assertion:courtadmin-recipient-read-projection", async () => {
      expect(recipientFields).toHaveLength(1);
      expect(Array.isArray(projected) ? projected.map((item: { value: unknown }) => item.value) : projected).toEqual([recipient]);
      await expect(page.getByText(recipient.emailInformation.emailAddress, { exact: true })).toBeVisible();
    });
  },
);
