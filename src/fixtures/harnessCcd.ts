import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  test as base,
  expect,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

import {
  assertRuntimeIdentity,
  loadCandidateManifest,
} from "../harness/candidate";

interface Credential {
  userId: string;
  email: string;
  headers: Record<string, string>;
}
export interface CcdPersonas {
  credentials: Record<"allowed" | "denied" | "observer", Credential>;
  sessions: Record<string, string>;
}
export const ccdPersonas = (): CcdPersonas =>
  JSON.parse(fs.readFileSync(process.env.EXUI_CCD_PERSONAS!, "utf8"));
export async function submitCcdCreate(page: Page) {
  const submitted = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      /\/case-types\/HarnessNestedPRL\/cases(?:\?|$)/.test(response.url()),
  );
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  return submitted;
}
export async function observeCcd(caseId: string) {
  if (!/^\d{16}$/.test(caseId)) throw new Error("SYNTHETIC_CASE_ID_REQUIRED");
  const headers = ccdPersonas().credentials.observer.headers;
  const state = await fetch(
    `http://127.0.0.1:4452/caseworkers/${ccdPersonas().credentials.observer.userId}/jurisdictions/HARNESS/case-types/HarnessNestedPRL/cases/${caseId}`,
    { headers },
  );
  const history = await fetch(
    `http://127.0.0.1:4452/caseworkers/${ccdPersonas().credentials.observer.userId}/jurisdictions/HARNESS/case-types/HarnessNestedPRL/cases/${caseId}/events`,
    { headers },
  );
  if (!state.ok || !history.ok)
    throw new Error(`CCD_OBSERVER_FAILED_${state.status}_${history.status}`);
  return { state: await state.json(), history: await history.json() };
}
export async function createSyntheticCase(request: APIRequestContext) {
  const { userId } = ccdPersonas().credentials.allowed;
  const prefix = `/data/caseworkers/${userId}/jurisdictions/HARNESS/case-types/HarnessNestedPRL`;
  const trigger = await request.get(`${prefix}/event-triggers/create/token`, {
    headers: { "content-type": "application/json", accept: "application/json" },
  });
  if (trigger.status() !== 200)
    throw new Error(`CCD_START_FAILED_${trigger.status()}`);
  const created = await request.post(`${prefix}/cases`, {
    data: {
      data: {
        protectedValue: "synthetic-protected-original",
        sodAdditionalRecipientsList: [],
      },
      event: { id: "create", summary: "Harness policy case" },
      event_token: (await trigger.json()).token,
      ignore_warning: false,
    },
  });
  if (created.status() !== 201)
    throw new Error(
      `CCD_CREATE_FAILED_${created.status()}_${await created.text()}`,
    );
  return String((await created.json()).id);
}

export const test = base.extend<{ ccdIdentity: void }>({
  ccdIdentity: [
    async ({ context, page }, use, testInfo) => {
      const manifest = loadCandidateManifest(
        process.env.EXUI_CANDIDATE_RUN_MANIFEST!,
      );
      const observed = JSON.parse(
        fs.readFileSync(process.env.EXUI_RUNTIME_IDENTITY!, "utf8"),
      );
      assertRuntimeIdentity(manifest.identity, observed.identity);
      const rejected: string[] = [];
      const assets: Promise<void>[] = [];
      context.on("response", (response) => {
        const url = new URL(response.url());
        if (
          url.origin === "http://127.0.0.1:3100" &&
          /^\/main-[A-Za-z0-9]+\.js$/.test(url.pathname)
        )
          assets.push(
            (async () => {
              const bytes = await response.body();
              expect(createHash("sha256").update(bytes).digest("hex")).toBe(
                createHash("sha256")
                  .update(
                    fs.readFileSync(
                      path.join(
                        process.env.EXUI_CANDIDATE_ASSETS!,
                        path.basename(url.pathname),
                      ),
                    ),
                  )
                  .digest("hex"),
              );
            })(),
          );
      });
      const flags = Object.fromEntries(
        Object.entries({
          MC_Work_Allocation: false,
          "feature-global-search": false,
        }).map(([key, value]) => [key, { value, version: 1 }]),
      );
      await context.route("**/*", async (route) => {
        const url = new URL(route.request().url());
        if (url.origin === "http://127.0.0.1:3100") return route.continue();
        if (
          [
            "clientstream.launchdarkly.com",
            "clientsdk.launchdarkly.com",
            "events.launchdarkly.com",
            "app.launchdarkly.com",
          ].includes(url.hostname)
        )
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            headers: { "access-control-allow-origin": "*" },
            body: JSON.stringify(url.pathname.includes("goals") ? [] : flags),
          });
        rejected.push(
          `UNDECLARED_BROWSER_DESTINATION ${url.origin}${url.pathname}`,
        );
        return route.abort("blockedbyclient");
      });
      await use();
      if (testInfo.status !== testInfo.expectedStatus) {
        fs.writeFileSync(
          testInfo.outputPath("failure.json"),
          JSON.stringify(
            {
              errors: testInfo.errors,
              url: page.url(),
              body: await page.locator("body").innerText(),
              inputs: await page.locator("input").evaluateAll((elements) =>
                elements.map((element) => ({
                  id: element.id,
                  type: (element as HTMLInputElement).type,
                  value: (element as HTMLInputElement).value,
                })),
              ),
            },
            null,
            2,
          ),
        );
        await page.screenshot({
          path: testInfo.outputPath("failure.png"),
          fullPage: true,
        });
      }
      try {
        expect(
          assets.length,
          "real candidate Angular entry observed",
        ).toBeGreaterThan(0);
        await Promise.all(assets);
        expect(
          rejected,
          "undeclared browser destination prevents evidence credit",
        ).toEqual([]);
      } catch (error) {
        fs.writeFileSync(
          testInfo.outputPath("identity-failure.json"),
          JSON.stringify(
            { error: String(error), rejected, assets: assets.length },
            null,
            2,
          ),
        );
        throw error;
      }
    },
    { auto: true },
  ],
});
export { expect };
