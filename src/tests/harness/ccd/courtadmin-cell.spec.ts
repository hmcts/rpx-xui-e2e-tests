import { createHash } from "node:crypto";

import type { Page } from "@playwright/test";

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
  openServiceOfDocuments,
  submitServiceOfDocuments,
  saveCcdEventObservation,
  sharedRoleEventActor,
  observeCcdEventReadback,
  courtadminReadScenarios,
  EVENT_ID,
  EVENT_NAME,
  EVENT_STATE,
  EVENT_SCOPE,
  EVENT_START_HEADERS,
  EVENT_SUBMIT_HEADERS,
  COURTADMIN_UPDATE_MUTATION,
} from "../../../fixtures/harnessCcdEvent";

type Playwright = Parameters<typeof ccdSessionRequest>[0];
const mutation = process.env.EXUI_HARNESS_MUTATION;
type Scenario = (typeof courtadminReadScenarios)[number];
type Observation = Awaited<ReturnType<typeof observeCcd>>;
const control = "synthetic-courtadmin-original";
function values(scenario: Scenario, edited: boolean) {
  return scenario.recipients.map((recipient, index) =>
    recipient.value.serveByPostOrEmail === "email"
      ? {
          serveByPostOrEmail: "email",
          emailInformation: {
            ...recipient.value.emailInformation!,
            emailAddress: edited
              ? `courtadmin-edited-${index + 1}@harness.example.com`
              : recipient.value.emailInformation!.emailAddress,
          },
        }
      : {
          serveByPostOrEmail: "post",
          postalInformation: {
            ...recipient.value.postalInformation!,
            postalAddress: {
              ...recipient.value.postalInformation!.postalAddress,
              AddressLine1: edited
                ? `Synthetic courtadmin edited street ${index + 1}`
                : recipient.value.postalInformation!.postalAddress.AddressLine1,
            },
          },
        },
  );
}
function markers(scenario: Scenario, edited: boolean) {
  return values(scenario, edited).flatMap((value) =>
    value.serveByPostOrEmail === "email"
      ? [
          value.emailInformation!.emailName,
          value.emailInformation!.emailAddress,
        ]
      : [
          value.postalInformation!.postalName,
          value.postalInformation!.postalAddress.AddressLine1,
          value.postalInformation!.postalAddress.PostCode,
        ],
  );
}
async function fillRecipient(page: Page, scenario: Scenario, index: number) {
  const value = values(scenario, false)[index];
  await page
    .getByRole("button", { name: "Add new", exact: true })
    .last()
    .click();
  if (value.serveByPostOrEmail === "email") {
    await page.getByLabel("Email", { exact: true }).nth(index).check();
    await page
      .locator('input[id$="_emailName"]')
      .nth(index)
      .fill(value.emailInformation!.emailName);
    await page
      .locator('input[id$="_emailAddress"]')
      .nth(index)
      .fill(value.emailInformation!.emailAddress);
  } else {
    await page.getByLabel("Post", { exact: true }).nth(index).check();
    await page
      .getByRole("link", { name: "I can't enter a UK postcode", exact: true })
      .last()
      .click();
    await page
      .locator('input[id$="_postalName"]')
      .nth(index)
      .fill(value.postalInformation!.postalName);
    await page
      .locator('input[id$="AddressLine1"]')
      .nth(index)
      .fill(value.postalInformation!.postalAddress.AddressLine1);
    await page
      .locator('input[id$="PostCode"]')
      .nth(index)
      .fill(value.postalInformation!.postalAddress.PostCode);
  }
}
async function assertAndEditRecipient(
  page: Page,
  scenario: Scenario,
  index: number,
) {
  const original = values(scenario, false)[index],
    edited = values(scenario, true)[index];
  if (original.serveByPostOrEmail === "email") {
    await expect(
      page.locator('input[id$="_emailName"]').nth(index),
    ).toHaveValue(original.emailInformation!.emailName);
    const address = page.locator('input[id$="_emailAddress"]').nth(index);
    await expect(address).toHaveValue(original.emailInformation!.emailAddress);
    await address.fill(edited.emailInformation!.emailAddress);
  } else {
    await expect(
      page.locator('input[id$="_postalName"]').nth(index),
    ).toHaveValue(original.postalInformation!.postalName);
    await expect(page.locator('input[id$="PostCode"]').nth(index)).toHaveValue(
      original.postalInformation!.postalAddress.PostCode,
    );
    const street = page.locator('input[id$="AddressLine1"]').nth(index);
    await expect(street).toHaveValue(
      original.postalInformation!.postalAddress.AddressLine1,
    );
    await street.fill(edited.postalInformation!.postalAddress.AddressLine1);
  }
}
async function assertCya(page: Page, scenario: Scenario, edited: boolean) {
  await expect(
    page.getByText("Check your answers", { exact: false }),
  ).toBeVisible();
  for (const marker of markers(scenario, edited))
    await expect(page.getByText(marker, { exact: true })).toBeVisible();
}
async function formJourney(
  page: Page,
  _playwright: Playwright,
  caseId: string,
  scenario: Scenario,
) {
  const started = await openServiceOfDocuments(page, caseId);
  expect(started.status()).toBe(200);
  const selection = page.getByLabel("Additional recipients (optional)", {
    exact: true,
  });
  await selection.check();
  for (let index = 0; index < scenario.recipients.length; index++)
    await fillRecipient(page, scenario, index);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await assertCya(page, scenario, false);
  await page
    .getByRole("link", { name: /Change/ })
    .first()
    .click();
  await expect(selection).toBeChecked();
  await expect(
    page.locator(
      scenario.name.startsWith("email")
        ? 'input[id$="_emailName"]'
        : 'input[id$="_postalName"]',
    ),
  ).toHaveCount(scenario.recipients.length);
  for (let index = 0; index < scenario.recipients.length; index++)
    await assertAndEditRecipient(page, scenario, index);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await assertCya(page, scenario, true);
  for (const marker of markers(scenario, false).filter(
    (value) => !markers(scenario, true).includes(value),
  ))
    await expect(page.getByText(marker, { exact: true })).toHaveCount(0);
  const submitted = await submitServiceOfDocuments(page, caseId);
  expect(submitted.status()).toBe(201);
  const payload = submitted.request().postDataJSON();
  expect(payload.event.id).toBe(EVENT_ID);
  expect(
    typeof payload.event_token === "string" && payload.event_token.length > 0,
  ).toBe(true);
  const csrf = submitted.request().headers()["x-xsrf-token"];
  return {
    formCompleted: true,
    startStatus: started.status(),
    submitStatus: submitted.status(),
    submittedData: payload.data,
    csrfHeaderPresent: Boolean(csrf),
    csrfHeaderDigest: csrf
      ? `sha256:${createHash("sha256").update(csrf).digest("hex")}`
      : null,
    after: await observeCcd(caseId),
    readback: await observeCcdEventReadback(page, caseId, values(scenario, true)),
  };
}
async function deniedJourney(
  _page: Page,
  playwright: Playwright,
  caseId: string,
  scenario: Scenario,
  before: Observation,
) {
  const personas = ccdEventPersonas(),
    actor = await ccdSessionRequest(playwright, personas.sessions.courtadmin);
  try {
    const started = await actor.get(
      `/data/internal/cases/${caseId}/event-triggers/${EVENT_ID}?ignore-warning=false`,
      { headers: EVENT_START_HEADERS, maxRedirects: 0, maxRetries: 0 },
    );
    const token = await actor.get(
      `/data/caseworkers/${personas.credentials.courtadmin.userId}/jurisdictions/HARNESS/case-types/HarnessNestedPRL/cases/${caseId}/event-triggers/${EVENT_ID}/token`,
      { maxRedirects: 0, maxRetries: 0 },
    );
    expect(token.status()).toBe(200);
    const tokenBody = await token.json();
    expect(
      typeof tokenBody.token === "string" && tokenBody.token.length > 0,
    ).toBe(true);
    const data = {
      sodAdditionalRecipients: ["additionalRecipients"],
      sodAdditionalRecipientsList: values(scenario, true).map(
        (value, index) => ({ id: scenario.recipients[index].id, value }),
      ),
    };
    const submitted = await actor.post(`/data/cases/${caseId}/events`, {
      headers: EVENT_SUBMIT_HEADERS,
      data: {
        data,
        event: {
          id: EVENT_ID,
          summary: "Synthetic courtadmin permission attempt",
        },
        event_token: tokenBody.token,
        ignore_warning: false,
      },
      maxRedirects: 0,
      maxRetries: 0,
    });
    const after = await observeCcd(caseId);
    // Actual denial must be effective for every shape before the intended allowed-write oracle.
    expect(started.status()).toBe(404);
    expect(submitted.status()).toBe(404);
    expect(after).toEqual(before);
    return {
      formCompleted: false,
      startStatus: started.status(),
      submitStatus: submitted.status(),
      submittedData: data,
      csrfHeaderPresent: false,
      csrfHeaderDigest: null,
      readback: null,
      after,
    };
  } finally {
    await actor.dispose();
  }
}
const journey =
  mutation === COURTADMIN_UPDATE_MUTATION ? deniedJourney : formJourney;
const assertTriggers =
  mutation === COURTADMIN_UPDATE_MUTATION
    ? (triggers: Array<{ id: string }>) =>
        expect(triggers.filter((event) => event.id === EVENT_ID)).toEqual([])
    : (triggers: Array<{ id: string }>) =>
        expect(triggers).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ id: EVENT_ID, name: EVENT_NAME }),
          ]),
        );

test.describe.configure({ retries: 0 });

test(
  "source courtadmin updates all email/post one/two-recipient shapes through form, CYA, Change and CCD readback",
  {
    annotation: {
      type: "harness-proof",
      description:
        mutation === COURTADMIN_UPDATE_MUTATION
          ? "ccd-courtadmin-update-recipient-shapes-denied"
          : "ccd-courtadmin-update-recipient-shapes",
    },
  },
  async ({ page, request, playwright }) => {
    const { manifest, context } = eventProofInputs();
    expect(manifest.releaseScopeId).toBe(EVENT_SCOPE);
    expect(context.releaseScopeId).toBe(EVENT_SCOPE);
    expect(context.runId).toBe(manifest.runId);
    expect([undefined, COURTADMIN_UPDATE_MUTATION]).toContain(mutation);
    expect(context.invocationId).toBe(mutation ?? "baseline");
    const personas = ccdEventPersonas(),
      roles = [
        "caseworker",
        "caseworker-harness",
        "caseworker-privatelaw-courtadmin",
      ];
    expect(personas.credentials.courtadmin.roles?.slice().sort()).toEqual(
      roles,
    );
    expect(Boolean(personas.sessions.courtadmin)).toBe(true);
    for (const other of ["allowed", "observer", "judge", "readonly"] as const)
      expect(personas.credentials.courtadmin.userId).not.toBe(
        personas.credentials[other].userId,
      );
    const observations: Array<
      Awaited<ReturnType<typeof journey>> & {
        scenario: string;
        expectedValues: ReturnType<typeof values>;
        actor: unknown;
        caseViewStatus: number;
        eventTriggers: Array<{id: string; name: string}>;
        protectedValue: unknown;
        controlVisible: boolean;
        caseId: string;
        before: Observation;
      }
    > = [];
    for (const scenario of courtadminReadScenarios) {
      const bootstrap = await bootstrapCcdEventCase(request, {
        protectedValue: control,
        sodAdditionalRecipientsList: [],
      });
      expect(bootstrap.trigger.status()).toBe(200);
      expect(bootstrap.created.status()).toBe(201);
      const caseId = String(bootstrap.body.id);
      expect(caseId).toMatch(/^\d{16}$/);
      const before = await observeCcd(caseId);
      expect(before.state.state).toBe(EVENT_STATE);
      expect(before.state.case_data.sodAdditionalRecipientsList ?? []).toEqual(
        [],
      );
      await switchCcdEventActor(page, "courtadmin");
      const details = await page.request.get("/api/user/details", {
        maxRedirects: 0,
        maxRetries: 0,
      });
      expect(details.status()).toBe(200);
      const actor = sharedRoleEventActor((await details.json()).userInfo);
      expect(actor.id).toBe(
        personas.credentials.courtadmin.userId,
      );
      expect([...actor.roles].sort()).toEqual(roles);
      const read = await openCcdEventCase(page, caseId);
      expect(read.status()).toBe(200);
      const view = await read.json();
      expect(Array.isArray(view.triggers)).toBe(true);
      assertTriggers(view.triggers);
      await expect(page.getByText(control, { exact: true })).toBeVisible();
      observations.push({
        scenario: scenario.name,
        expectedValues: values(scenario, true),
        actor,
        caseViewStatus: read.status(),
        eventTriggers: view.triggers.filter((event: {id: string}) => event.id === EVENT_ID),
        protectedValue: view.tabs.flatMap((tab: {fields: Array<{id: string; value?: unknown}>}) => tab.fields).find((field: {id: string}) => field.id === "protectedValue")?.value,
        controlVisible: await page.getByText(control, {exact: true}).isVisible(),
        caseId,
        before,
        ...(await journey(page, playwright, caseId, scenario, before)),
      });
    }
    saveCcdEventObservation("courtadmin-cell", observations);

    await test.step("harness-assertion:courtadmin-update-persistence", async () => {
      expect(observations.map((item) => item.scenario)).toEqual([
        "email-1",
        "email-2",
        "post-1",
        "post-2",
      ]);
      for (const item of observations) {
        expect(item.formCompleted, item.scenario).toBe(true);
        expect(item.after.state.case_data.sodAdditionalRecipients).toEqual([
          "additionalRecipients",
        ]);
        const recipients =
          item.after.state.case_data.sodAdditionalRecipientsList;
        expect(recipients).toHaveLength(item.expectedValues.length);
        expect(
          recipients.map(
            (recipient: {
              value: {
                serveByPostOrEmail: string;
                emailInformation?: unknown;
                postalInformation?: unknown;
              };
            }) =>
              recipient.value.serveByPostOrEmail === "email"
                ? {
                    serveByPostOrEmail: "email",
                    emailInformation: recipient.value.emailInformation,
                  }
                : {
                    serveByPostOrEmail: "post",
                    postalInformation: recipient.value.postalInformation,
                  },
          ),
        ).toEqual(item.expectedValues);
        expect(item.after.state.case_data.protectedValue).toBe(control);
        expect(item.after.state.state).toBe(EVENT_STATE);
        expect(item.after.state.version).toBe(item.before.state.version + 1);
        expect(item.after.history).toHaveLength(item.before.history.length + 1);
        expect(
          item.after.history.filter(
            (event: { id: string }) => event.id === EVENT_ID,
          ),
        ).toHaveLength(1);
      }
    });
  },
);
