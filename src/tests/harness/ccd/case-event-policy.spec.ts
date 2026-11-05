import fs from "node:fs";

import {
  currentSharedRoleObservationBinding,
  projectSharedRoleResponse,
  saveSharedRoleObservation,
} from "../../../../scripts/lib/exui-shared-role-observations.mjs";
import {
  test,
  expect,
  ccdPersonas,
  createSyntheticCase,
  observeCcd,
} from "../../../fixtures/harnessCcd";

test(
  "real CCD policy denies data and mutation with independent observer",
  {
    annotation: {
      type: "harness-proof",
      description:
        process.env.EXUI_HARNESS_MUTATION === "ccd-broaden-access"
          ? "ccd-access-broadened"
          : process.env.EXUI_HARNESS_MUTATION === "ccd-write-then-deny"
            ? "ccd-write-then-deny"
            : "ccd-role-policy",
    },
  },
  async ({ page, request, playwright }) => {
    const caseId = await createSyntheticCase(request);
    await page.goto(`/cases/case-details/${caseId}`);
    await expect(
      page.getByText("synthetic-protected-original", { exact: true }),
    ).toBeVisible();
    const before = await observeCcd(caseId);
    const personas = ccdPersonas();
    const denied = await playwright.request.newContext({
      baseURL: "http://127.0.0.1:3100",
      extraHTTPHeaders: {
        "content-type": "application/json",
        accept: "application/json",
      },
      storageState: {
        cookies: [
          {
            name: "xui-webapp",
            value: personas.sessions.denied,
            domain: "127.0.0.1",
            path: "/",
            expires: -1,
            httpOnly: true,
            secure: false,
            sameSite: "Lax",
          },
        ],
        origins: [],
      },
    });
    try {
      const details = await denied.get("/api/user/details", { maxRedirects: 0 });
      expect(details.status()).toBe(200);
      const user = (await details.json()).userInfo;
      expect(user.id ?? user.uid).toBe(personas.credentials.denied.userId);
      const read = await denied.get(`/data/internal/cases/${caseId}`, {
        headers: {
          accept:
            "application/vnd.uk.gov.hmcts.ccd-data-store-api.ui-case-view.v2+json",
          experimental: "true",
        },
      });
      const evidence = `${process.env.EXUI_CCD_EVIDENCE}/policy-observation.json`;
      const observation = {
        schemaVersion: 1,
        binding: currentSharedRoleObservationBinding(),
        complete: false,
        caseId,
        actor: { id: user.id ?? user.uid, roles: [...user.roles].sort() },
        before,
        deniedRead: read.status(),
        deniedReadResponse: projectSharedRoleResponse(read.status(), await read.text()),
      };
      // Persist before the consequential oracle so an effective access fault is replayable.
      saveSharedRoleObservation(evidence, observation);
      expect([200, 403, 404]).toContain(read.status());

      await test.step("harness-assertion:denied-data-isolation", async () => {
        expect([403, 404]).toContain(read.status());
        expect(await read.text()).not.toContain("synthetic-protected-original");
      });

      const prefix = `/data/caseworkers/${personas.credentials.denied.userId}/jurisdictions/HARNESS/case-types/HarnessNestedPRL/cases/${caseId}`;
      const trigger = await denied.get(`${prefix}/event-triggers/update/token`);
      expect(trigger.status()).toBe(200);
      expect((await trigger.json()).case_details.case_data).toEqual({});
      const write = await denied.post(`/data/cases/${caseId}/events`, {
        headers: {
          accept:
            "application/vnd.uk.gov.hmcts.ccd-data-store-api.create-event.v2+json",
          experimental: "true",
        },
        data: {
          data: { protectedValue: "must-never-persist" },
          event: { id: "update", summary: "Denied synthetic update" },
          event_token: (await trigger.json()).token,
          ignore_warning: false,
        },
      });
      const deniedWriteResponse = projectSharedRoleResponse(write.status(), await write.text());
      saveSharedRoleObservation(evidence, { ...observation, deniedWrite: write.status(), deniedWriteResponse });
      expect([403, 404]).toContain(write.status());
      expect(await write.text()).not.toContain("must-never-persist");
      const forwarded = fs
        .readFileSync(
          `${process.env.EXUI_CCD_EVIDENCE}/ccd-requests.jsonl`,
          "utf8",
        )
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
      expect(
        forwarded.some(
          (item) =>
            item.method === "POST" &&
            item.path === `/data/cases/${caseId}/events` &&
            [403, 404].includes(item.status),
        ),
        "denied write reached the declared real CCD boundary",
      ).toBeTruthy();
      const after = await observeCcd(caseId);
      saveSharedRoleObservation(evidence, {
        ...observation,
        complete: true,
        after,
        deniedWrite: write.status(),
        deniedWriteResponse,
        auditOnlyExceptions: [],
      });

      await test.step("harness-assertion:denied-state-integrity", async () => {
        expect(after).toEqual(before);
      });
    } finally {
      await denied.dispose();
    }
  },
);
