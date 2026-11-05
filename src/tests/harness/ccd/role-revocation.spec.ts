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
  ccdSessionRequest,
  createSyntheticCase,
  observeCcd,
  observeActorCcdRead,
  renewRevokedCcdActor,
} from "../../../fixtures/harnessCcd";

const caseViewHeaders = {
  accept:
    "application/vnd.uk.gov.hmcts.ccd-data-store-api.ui-case-view.v2+json",
  experimental: "true",
};
const eventHeaders = {
  accept:
    "application/vnd.uk.gov.hmcts.ccd-data-store-api.create-event.v2+json",
  experimental: "true",
};

test(
  "same CCD actor loses case access after real role removal and synthetic session renewal",
  {
    annotation: {
      type: "harness-proof",
      description:
        process.env.EXUI_HARNESS_MUTATION === "ccd-stale-revoked-bearer"
          ? "ccd-stale-revoked-bearer"
          : "ccd-role-revocation",
    },
  },
  async ({ page, request, playwright }) => {
    const caseId = await createSyntheticCase(request);
    await page.goto(`/cases/case-details/${caseId}`);
    await expect(
      page.getByText("synthetic-protected-original", { exact: true }),
    ).toBeVisible();
    const personas = ccdPersonas();
    const initial = personas.credentials.transitioning!;
    expect(
      initial,
      "fresh transitioning actor was provisioned by Tools",
    ).toBeTruthy();
    const granted = await ccdSessionRequest(
      playwright,
      personas.sessions.transitioning,
    );
    let renewed;
    try {
      const read = await granted.get(`/data/internal/cases/${caseId}`, {
        headers: caseViewHeaders,
        maxRedirects: 0,
        maxRetries: 0,
      });
      expect(read.status()).toBe(200);
      expect(await read.text()).toContain("synthetic-protected-original");
      const beforeWrite = await observeCcd(caseId);
      const prefix = `/data/caseworkers/${initial.userId}/jurisdictions/HARNESS/case-types/HarnessNestedPRL/cases/${caseId}`;
      const trigger = await granted.get(
        `${prefix}/event-triggers/update/token`,
        { maxRedirects: 0, maxRetries: 0 },
      );
      expect(trigger.status()).toBe(200);
      const written = await granted.post(`/data/cases/${caseId}/events`, {
        headers: eventHeaders,
        maxRedirects: 0,
        maxRetries: 0,
        data: {
          data: { protectedValue: "synthetic-transition-written" },
          event: { id: "update", summary: "Legitimate same-actor update" },
          event_token: (await trigger.json()).token,
          ignore_warning: false,
        },
      });
      expect(written.status()).toBe(201);
      const before = await observeCcd(caseId);
      expect(before.state.case_data.protectedValue).toBe(
        "synthetic-transition-written",
      );
      expect(before.history).not.toEqual(beforeWrite.history);
      const warm = await observeActorCcdRead(caseId, initial);
      expect(warm.status).toBe(200);
      expect(warm.body).toContain("synthetic-transition-written");

      const transition = await renewRevokedCcdActor(caseId);
      expect(transition.observations.before.id).toBe(initial.userId);
      expect(transition.observations.afterAccount.id).toBe(initial.userId);
      expect(transition.observations.before.roles).toContain(
        "caseworker-harness-allowed",
      );
      expect(transition.observations.afterAccount.roles).toEqual([
        "caseworker",
        "caseworker-harness",
      ]);
      expect(transition.observations.afterAuthentication).toEqual(
        transition.observations.afterAccount,
      );
      expect(transition.observations.tokensDistinct).toBe(true);
      // Source-backed cache applicability is observed here, outside the consequential oracle.
      // This proof makes no claim that an old bearer/session is immediately invalidated.
      const freshDirect = await observeActorCcdRead(
        caseId,
        transition.credential,
      );
      expect([403, 404]).toContain(freshDirect.status);
      expect(freshDirect.body).not.toContain("synthetic-transition-written");
      const staleDirect = await observeActorCcdRead(caseId, initial);
      expect(
        staleDirect.status,
        "original warmed bearer retains the real CCD cached grant",
      ).toBe(200);
      expect(staleDirect.body).toContain("synthetic-transition-written");
      renewed = await ccdSessionRequest(playwright, transition.cookie);
      const details = await renewed.get("/api/user/details", {
        maxRedirects: 0,
        maxRetries: 0,
      });
      expect(details.status()).toBe(200);
      const user = (await details.json()).userInfo;
      expect(user.id ?? user.uid).toBe(initial.userId);
      expect([...user.roles].sort()).toEqual([
        "caseworker",
        "caseworker-harness",
      ]);
      const deniedRead = await renewed.get(`/data/internal/cases/${caseId}`, {
        headers: caseViewHeaders,
        maxRedirects: 0,
        maxRetries: 0,
      });
      const observation = {
        schemaVersion: 1,
        binding: currentSharedRoleObservationBinding(),
        complete: false,
        caseId,
        actor: { id: user.id ?? user.uid, roles: [...user.roles].sort() },
        identity: transition.observations,
        grantedRead: read.status(),
        legitimateWrite: written.status(),
        warmedRead: warm.status,
        freshBearerRead: freshDirect.status,
        originalBearerRead: staleDirect.status,
        warmedResponse: projectSharedRoleResponse(warm.status, warm.body),
        freshBearerResponse: projectSharedRoleResponse(freshDirect.status, freshDirect.body),
        originalBearerResponse: projectSharedRoleResponse(staleDirect.status, staleDirect.body),
        renewedSessionUser: { id: user.id ?? user.uid, roles: [...user.roles].sort() },
        renewedCandidateRead: deniedRead.status(),
        renewedCandidateResponse: projectSharedRoleResponse(deniedRead.status(), await deniedRead.text()),
        before,
        boundary:
          "real CCD RBAC; same synthetic IDAM actor; explicitly renewed synthetic EXUI session; no OIDC-login or immediate stale-session revocation claim",
      };
      const evidence = `${process.env.EXUI_CCD_EVIDENCE}/role-revocation-observation.json`;
      saveSharedRoleObservation(evidence, observation);

      await test.step("harness-assertion:revoked-data-isolation", async () => {
        expect([403, 404]).toContain(deniedRead.status());
        expect(await deniedRead.text()).not.toContain(
          "synthetic-transition-written",
        );
      });

      const revokedTrigger = await renewed.get(
        `${prefix}/event-triggers/update/token`,
        { maxRedirects: 0, maxRetries: 0 },
      );
      expect(revokedTrigger.status()).toBe(200);
      expect((await revokedTrigger.json()).case_details.case_data).toEqual({});
      const deniedWrite = await renewed.post(`/data/cases/${caseId}/events`, {
        headers: eventHeaders,
        maxRedirects: 0,
        maxRetries: 0,
        data: {
          data: { protectedValue: "revoked-write-must-not-persist" },
          event: { id: "update" },
          event_token: (await revokedTrigger.json()).token,
          ignore_warning: false,
        },
      });
      const renewedWriteResponse = projectSharedRoleResponse(deniedWrite.status(), await deniedWrite.text());
      saveSharedRoleObservation(evidence, { ...observation, renewedCandidateWrite: deniedWrite.status(), renewedWriteResponse });
      expect([403, 404]).toContain(deniedWrite.status());
      expect(await deniedWrite.text()).not.toContain(
        "revoked-write-must-not-persist",
      );
      const after = await observeCcd(caseId);
      const journal = fs
        .readFileSync(
          `${process.env.EXUI_CCD_EVIDENCE}/ccd-requests.jsonl`,
          "utf8",
        )
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
      expect(
        journal.some(
          (item) =>
            item.method === "POST" &&
            item.path === `/data/cases/${caseId}/events` &&
            [403, 404].includes(item.status),
        ),
      ).toBeTruthy();
      saveSharedRoleObservation(evidence, {
        ...observation,
        complete: true,
        renewedCandidateWrite: deniedWrite.status(),
        renewedWriteResponse,
        after,
        auditOnlyExceptions: [],
      });

      await test.step("harness-assertion:revoked-state-integrity", async () => {
        expect(after).toEqual(before);
      });
    } finally {
      await renewed?.dispose();
      await granted.dispose();
    }
  },
);
