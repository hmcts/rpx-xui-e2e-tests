import { createHash } from "node:crypto";

import {
  test,
  expect,
  observeCcd,
  ccdEventPersonas,
  eventProofInputs,
  bootstrapCcdEventCase,
  switchCcdEventActor,
  openCcdEventCase,
  openServiceOfDocuments,
  submitServiceOfDocuments,
  saveCcdEventObservation,
  EVENT_ID,
  EVENT_NAME,
  EVENT_STATE,
  EVENT_SCOPE,
} from "../../../fixtures/harnessCcdEvent";

test.describe.configure({ retries: 0 });

test(
  "source courtadmin edits exactly one email recipient through form, CYA, Change and real CCD submission",
  {
    annotation: {
      type: "harness-proof",
      description: "ccd-courtadmin-email-one",
    },
  },
  async ({ page, request }) => {
    const { manifest, context } = eventProofInputs();
    expect(manifest.releaseScopeId).toBe(EVENT_SCOPE);
    expect(context.releaseScopeId).toBe(EVENT_SCOPE);
    expect(context.runId).toBe(manifest.runId);
    expect(context.invocationId).toBe("baseline");
    expect(process.env.EXUI_HARNESS_MUTATION).toBeUndefined();
    const personas = ccdEventPersonas();
    expect(personas.credentials.courtadmin.roles?.slice().sort()).toEqual([
      "caseworker",
      "caseworker-harness",
      "caseworker-privatelaw-courtadmin",
    ]);
    expect(Boolean(personas.sessions.courtadmin)).toBe(true);
    expect(personas.credentials.courtadmin.userId).not.toBe(
      personas.credentials.allowed.userId,
    );
    const bootstrap = await bootstrapCcdEventCase(request, {
      protectedValue: "synthetic-courtadmin-original",
      sodAdditionalRecipientsList: [],
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
    expect(before.state.case_data.sodAdditionalRecipientsList ?? []).toEqual(
      [],
    );

    await switchCcdEventActor(page, "courtadmin");
    const sessionResponse = await page.request.get("/api/user/details", {
      maxRedirects: 0,
      maxRetries: 0,
    });
    expect(sessionResponse.status()).toBe(200);
    const sessionUser = (await sessionResponse.json()).userInfo;
    expect(sessionUser.id ?? sessionUser.uid).toBe(
      personas.credentials.courtadmin.userId,
    );
    expect([...sessionUser.roles].sort()).toEqual([
      "caseworker",
      "caseworker-harness",
      "caseworker-privatelaw-courtadmin",
    ]);
    const read = await openCcdEventCase(page, caseId);
    expect(read.status()).toBe(200);
    const caseView = await read.json();
    expect(caseView.triggers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: EVENT_ID, name: EVENT_NAME }),
      ]),
    );
    await expect(
      page.getByText("synthetic-courtadmin-original", { exact: true }),
    ).toBeVisible();
    const started = await openServiceOfDocuments(page, caseId);
    expect(started.status()).toBe(200);
    const recipientSelection = page.getByLabel(
      "Additional recipients (optional)",
      { exact: true },
    );
    await recipientSelection.check();
    await page.getByRole("button", { name: "Add new", exact: true }).click();
    await page.getByLabel("Email", { exact: true }).check();
    const name = page.locator('input[id$="_emailName"]');
    const address = page.locator('input[id$="_emailAddress"]');
    await expect(name).toHaveCount(1);
    await expect(address).toHaveCount(1);
    await name.fill("Synthetic courtadmin recipient");
    await address.fill("courtadmin-original@harness.example.com");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(
      page.getByText("Check your answers", { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByText("Synthetic courtadmin recipient", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("courtadmin-original@harness.example.com", {
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("link", { name: /Change/ })
      .first()
      .click();
    await expect(recipientSelection).toBeChecked();
    await expect(name).toHaveCount(1);
    await expect(name).toHaveValue("Synthetic courtadmin recipient");
    await expect(address).toHaveValue(
      "courtadmin-original@harness.example.com",
    );
    await address.fill("courtadmin-edited@harness.example.com");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(
      page.getByText("Check your answers", { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByText("Synthetic courtadmin recipient", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("courtadmin-edited@harness.example.com", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("courtadmin-original@harness.example.com", {
        exact: true,
      }),
    ).toHaveCount(0);
    const submitted = await submitServiceOfDocuments(page, caseId);
    expect(submitted.status()).toBe(201);
    const submittedBody = submitted.request().postDataJSON();
    expect(submittedBody.event.id).toBe(EVENT_ID);
    expect(
      typeof submittedBody.event_token === "string" &&
        submittedBody.event_token.length > 0,
    ).toBe(true);
    const after = await observeCcd(caseId);
    const csrfHeader = submitted.request().headers()["x-xsrf-token"];
    saveCcdEventObservation("courtadmin-cell", {
      actor: {
        userId: personas.credentials.courtadmin.userId,
        roles: personas.credentials.courtadmin.roles,
      },
      sessionUser: {
        id: sessionUser.id ?? sessionUser.uid,
        roles: sessionUser.roles,
      },
      caseId,
      eventId: EVENT_ID,
      caseViewStatus: read.status(),
      caseTriggers: caseView.triggers,
      startStatus: started.status(),
      submitStatus: submitted.status(),
      submittedData: submittedBody.data,
      eventTokenPresent: true,
      csrfHeaderPresent: Boolean(csrfHeader),
      csrfHeaderDigest: csrfHeader
        ? `sha256:${createHash("sha256").update(csrfHeader).digest("hex")}`
        : null,
      before,
      after,
    });

    await test.step("harness-assertion:courtadmin-email-one", async () => {
      expect(after.state.case_data.sodAdditionalRecipients).toEqual([
        "additionalRecipients",
      ]);
      const recipients = after.state.case_data.sodAdditionalRecipientsList;
      expect(recipients).toHaveLength(1);
      expect(
        recipients.map(
          (item: {
            value: { serveByPostOrEmail: string; emailInformation: unknown };
          }) => ({
            serveByPostOrEmail: item.value.serveByPostOrEmail,
            emailInformation: item.value.emailInformation,
          }),
        ),
      ).toEqual([
        {
          serveByPostOrEmail: "email",
          emailInformation: {
            emailName: "Synthetic courtadmin recipient",
            emailAddress: "courtadmin-edited@harness.example.com",
          },
        },
      ]);
      // Hidden subtrees remain in the raw observation; visibility does not establish deletion.
      expect(after.state.case_data.protectedValue).toBe(
        "synthetic-courtadmin-original",
      );
      expect(after.state.state).toBe(EVENT_STATE);
      expect(after.state.version).toBe(before.state.version + 1);
      expect(after.history).toHaveLength(before.history.length + 1);
      expect(
        after.history.filter((event: { id: string }) => event.id === EVENT_ID),
      ).toHaveLength(1);
    });
  },
);
