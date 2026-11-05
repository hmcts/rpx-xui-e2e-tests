import fs from "node:fs";
import path from "node:path";

import type { APIRequestContext, Page } from "@playwright/test";

import { sharedRoleEventEnvelope } from "../../scripts/lib/exui-shared-role-event-observations.mjs";
export { sharedRoleEventActor } from "../../scripts/lib/exui-shared-role-event-observations.mjs";

import { ccdPersonas, type CcdPersonas, type Credential } from "./harnessCcd";

export { test, expect, observeCcd, ccdSessionRequest } from "./harnessCcd";

export type CcdEventActor = "courtadmin" | "judge" | "readonly";
export const EVENT_ID = "serviceOfDocuments";
export const EVENT_NAME = "Service of documents";
export const EVENT_STATE = "JUDICIAL_REVIEW";
export const EVENT_SCOPE = "exui-ccd-event-capability-pilot";
export const EVENT_MUTATION = "ccd-enable-judge-event";
export const COURTADMIN_UPDATE_MUTATION = "ccd-remove-courtadmin-event-create";
export const COURTADMIN_READ_MUTATION = "ccd-remove-courtadmin-recipient-read";
export const READONLY_UPDATE_MUTATION = "ccd-enable-readonly-recipient-update";
export const READONLY_READ_MUTATION = "ccd-remove-readonly-recipient-read";
export const EVENT_START_HEADERS = {
  accept:
    "application/vnd.uk.gov.hmcts.ccd-data-store-api.ui-start-event-trigger.v2+json",
  experimental: "true",
};
export const EVENT_SUBMIT_HEADERS = {
  accept:
    "application/vnd.uk.gov.hmcts.ccd-data-store-api.create-event.v2+json",
  experimental: "true",
};
export const ccdEventPersonas = () =>
  ccdPersonas() as CcdPersonas & {
    credentials: Record<CcdEventActor, Credential>;
    sessions: Record<CcdEventActor, string>;
  };

export function eventProofInputs() {
  return {
    manifest: JSON.parse(
      fs.readFileSync(process.env.EXUI_CANDIDATE_RUN_MANIFEST!, "utf8"),
    ),
    context: JSON.parse(
      fs.readFileSync(process.env.EXUI_EVIDENCE_CONTEXT!, "utf8"),
    ),
  };
}

export async function bootstrapCcdEventCase(
  request: APIRequestContext,
  data: Record<string, unknown>,
) {
  const userId = ccdEventPersonas().credentials.allowed.userId;
  const prefix = `/data/caseworkers/${userId}/jurisdictions/HARNESS/case-types/HarnessNestedPRL`;
  const trigger = await request.get(`${prefix}/event-triggers/create/token`, {
    headers: { accept: "application/json", "content-type": "application/json" },
    maxRedirects: 0,
    maxRetries: 0,
  });
  const triggerBody = await trigger.json();
  const created = await request.post(`${prefix}/cases`, {
    data: {
      data,
      event: { id: "create", summary: "Synthetic event-capability bootstrap" },
      event_token: triggerBody.token,
      ignore_warning: false,
    },
    maxRedirects: 0,
    maxRetries: 0,
  });
  return { trigger, triggerBody, created, body: await created.json() };
}

export async function switchCcdEventActor(page: Page, actor: CcdEventActor) {
  await page.context().clearCookies({ name: "xui-webapp" });
  await page.context().addCookies([
    {
      name: "xui-webapp",
      value: ccdEventPersonas().sessions[actor],
      domain: "127.0.0.1",
      path: "/",
      expires: -1,
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    },
  ]);
}

export async function openCcdEventCase(page: Page, caseId: string) {
  const read = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      new URL(response.url()).origin === "http://127.0.0.1:3100" &&
      new URL(response.url()).pathname === `/data/internal/cases/${caseId}`,
  );
  await page.goto(`/cases/case-details/HARNESS/HarnessNestedPRL/${caseId}`);
  return read;
}

export async function openServiceOfDocuments(page: Page, caseId: string) {
  const started = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      new URL(response.url()).origin === "http://127.0.0.1:3100" &&
      new URL(response.url()).pathname ===
        `/data/internal/cases/${caseId}/event-triggers/${EVENT_ID}`,
  );
  const trigger = page.locator("ccd-event-trigger");
  await trigger
    .getByLabel("Next step", { exact: true })
    .selectOption({ label: EVENT_NAME });
  await trigger.getByRole("button", { name: "Go", exact: true }).click();
  return started;
}

export async function submitServiceOfDocuments(page: Page, caseId: string) {
  const submitted = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).origin === "http://127.0.0.1:3100" &&
      new URL(response.url()).pathname === `/data/cases/${caseId}/events`,
  );
  // EndButtonLabel comes from the pinned PRL serviceOfDocuments event row.
  await page
    .getByRole("button", { name: "Save and continue", exact: true })
    .click();
  return submitted;
}

export function saveCcdEventObservation(
  name: "courtadmin-cell" | "event-capability" | "courtadmin-read" | "readonly-read" | "readonly-update" | "source-shape-case-field-recipient-selector" | "source-shape-required-delivery-radio" | "source-shape-conditional-email-complex" | "source-shape-optional-postal-line-two",
  value: unknown,
) {
  fs.writeFileSync(
    path.join(process.env.EXUI_CCD_EVIDENCE!, `${name}-observation.json`),
    JSON.stringify(["courtadmin-cell", "courtadmin-read", "readonly-read", "readonly-update"].includes(name) ? sharedRoleEventEnvelope(
      name, value, eventProofInputs().manifest, eventProofInputs().context, ccdEventPersonas(),
    ) : value, null, 2),
    { mode: 0o600, flag: "wx" },
  );
}

export const courtadminReadScenarios = ["email", "post"].flatMap(channel =>
  [1, 2].map(count => ({
    name: `${channel}-${count}`,
    recipients: Array.from({ length: count }, (_, index) => ({
      id: `46e2ff95-4689-42ea-b38c-d3b9204572b${index}`,
      value: channel === "email" ? {
        serveByPostOrEmail: "email",
        emailInformation: {
          emailName: `Synthetic read recipient ${index + 1}`,
          emailAddress: `read-recipient-${index + 1}@harness.example.com`,
        },
      } : {
        serveByPostOrEmail: "post",
        postalInformation: {
          postalName: `Synthetic postal read ${index + 1}`,
          postalAddress: {
            AddressLine1: `Synthetic read street ${index + 1}`,
            AddressLine2: null, AddressLine3: null, PostTown: null,
            County: null, PostCode: ["SW1A 1AA", "M1 1AA"][index], Country: null,
          },
        },
      },
    })),
  })),
);

// Retain only the synthetic case-view projection and visible markers needed by
// role replay; never serialize the user-details response or session headers.
export async function observeCcdEventReadback(
  page: Page,
  caseId: string,
  expected: Array<{
    emailInformation?: { emailName: string; emailAddress: string };
    postalInformation?: { postalName: string; postalAddress: { AddressLine1: string; PostCode: string } };
  }>,
) {
  const finished = page.waitForEvent("requestfinished", {
    predicate: request => request.method() === "GET" &&
      new URL(request.url()).origin === "http://127.0.0.1:3100" &&
      new URL(request.url()).pathname === `/data/internal/cases/${caseId}`,
    timeout: 30_000,
  });
  await page.goto(`/cases/case-details/HARNESS/HarnessNestedPRL/${caseId}`);
  const response = await (await finished).response();
  if (response?.status() !== 200) throw new Error(`CCD_READBACK_STATUS_${response?.status()}`);
  const body = await response.json();
  const fields: Array<{id: string; value?: unknown}> = body.tabs.flatMap(
    (tab: {fields: Array<{id: string; value?: unknown}>}) => tab.fields,
  );
  const protectedValue = fields.find(field => field.id === "protectedValue")?.value;
  const recipientFields = fields.filter(field => field.id === "sodAdditionalRecipientsList")
    .map(field => ({id: field.id, value: field.value}));
  const visible = [];
  const markerVisibility = [];
  if (typeof protectedValue === "string") await page.getByText(protectedValue, {exact: true}).waitFor({state: "visible"});
  for (const value of expected) {
    const markers = [value.emailInformation?.emailName, value.emailInformation?.emailAddress,
      value.postalInformation?.postalName, value.postalInformation?.postalAddress.AddressLine1,
      value.postalInformation?.postalAddress.PostCode].filter((marker): marker is string => typeof marker === "string");
    const states = [];
    for (const marker of markers) {
      const locator = page.getByText(marker, {exact: true});
      await locator.waitFor({state: "visible"});
      states.push({marker, visible: await locator.isVisible()});
    }
    markerVisibility.push(states);
    visible.push(states.length > 0 && states.every(item => item.visible));
  }
  return {caseViewStatus: response.status(), protectedValue,
    controlVisible: typeof protectedValue === "string" && await page.getByText(protectedValue, {exact: true}).isVisible(),
    recipientFields, projected: recipientFields[0]?.value ?? null, visible, markerVisibility};
}
