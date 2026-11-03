import fs from "node:fs";
import path from "node:path";

import type { APIRequestContext, Page } from "@playwright/test";

import { ccdPersonas, type CcdPersonas, type Credential } from "./harnessCcd";

export { test, expect, observeCcd, ccdSessionRequest } from "./harnessCcd";

export type CcdEventActor = "courtadmin" | "judge";
export const EVENT_ID = "serviceOfDocuments";
export const EVENT_NAME = "Service of documents";
export const EVENT_STATE = "JUDICIAL_REVIEW";
export const EVENT_SCOPE = "exui-ccd-event-capability-pilot";
export const EVENT_MUTATION = "ccd-enable-judge-event";
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
  name: "courtadmin-cell" | "event-capability",
  value: unknown,
) {
  fs.writeFileSync(
    path.join(process.env.EXUI_CCD_EVIDENCE!, `${name}-observation.json`),
    JSON.stringify(value, null, 2),
    { mode: 0o600, flag: "wx" },
  );
}
