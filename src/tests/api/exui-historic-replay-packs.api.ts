import {
  EXUI_HISTORIC_FAILURE_COVERAGE,
  EXUI_WA_SUPPORTED_SERVICE_FAMILIES,
  buildHistoricFailureCoverageSummary,
  sortServiceFamilies
} from "../../data/exui-central-assurance.js";
import {
  assertRequiredCcdSearchMetadataFieldsPresent,
  buildCyaRows,
  buildEventHistoryRowsForPersona,
  buildManageCaseSubmitPayload,
  canFetchEventDetails,
  CCD_SEARCH_WORKBASKET_METADATA_REPLAY,
  EVENT_HISTORY_REPLAY,
  EVENT_START_SPINNER_REPLAY,
  findTaskToComplete,
  flattenCyaRows,
  IDAM_PASSPORT_SESSION_REPLAY,
  isAnonymousProtectedEndpointResponseSafe,
  isAuthSmokeSessionValid,
  isEventHistoryLayoutUsable,
  isSpinnerContractSatisfied,
  MANAGE_CASE_DATA_INTEGRITY_REPLAY,
  mutateCcdSearchMetadataForDemo,
  PROTECTED_ENDPOINT_REPLAY,
  resolveCaseworkerJurisdictions,
  resolveRoleCategory,
  WORK_ALLOCATION_REPLAY,
  assertPrivateLawConfigAnchors
} from "../../data/exui-historic-replay-packs.js";

import { test, expect } from "./fixtures";

type AttachmentSink = {
  attach(name: string, options: { body: string; contentType: string }): Promise<void>;
};

async function attachCcdSearchMutationEvidence(testInfo: AttachmentSink): Promise<void> {
  if (process.env.EXUI_ASSURANCE_MUTATION !== "drop-ccd-case-reference-search-input") {
    return;
  }

  await testInfo.attach("exui-assurance-mutation.txt", {
    body:
      "drop-ccd-case-reference-search-input: Demo fault: simulate a service CCD definition change removing the PRL case-reference search input EXUI relies on.",
    contentType: "text/plain"
  });
}

test.describe("EXUI historic SRT replay packs", { tag: ["@svc-node-app", "@svc-harness"] }, () => {
  test("Private Law replay pack is anchored to current central-assurance config", () => {
    expect(() => assertPrivateLawConfigAnchors()).not.toThrow();
    expect(MANAGE_CASE_DATA_INTEGRITY_REPLAY).toEqual(
      expect.objectContaining({
        serviceFamily: "PRIVATELAW",
        jurisdiction: "PRIVATELAW",
        caseType: "PRLAPPS",
        serviceCode: "ABA5"
      })
    );
  });

  test("manage-case data-integrity replay keeps hidden complex data and drops stale hidden-page data", () => {
    const payload = buildManageCaseSubmitPayload(MANAGE_CASE_DATA_INTEGRITY_REPLAY);
    const cyaRows = buildCyaRows(MANAGE_CASE_DATA_INTEGRITY_REPLAY);

    expect(payload).toMatchObject({
      route: "safeguarding",
      safeguardingReason: "Risk identified from application",
      childCollection: [{ firstName: "Alex", riskFlag: "Yes" }],
      sodAdditionalRecipients: "additionalRecipients",
      sodAdditionalRecipientsList: [
        {
          serveByPostOrEmail: "email",
          emailInformation: {
            emailName: "Example organisation",
            emailAddress: "example.organisation@example.invalid"
          }
        }
      ],
      confidentialDirections: {
        directionId: "dir-001",
        sealedReason: "Judicial direction"
      },
      reviewOutcome: "Continue"
    });
    expect(payload).not.toHaveProperty("staleReferralTaskId");

    expect(cyaRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldId: "safeguardingReason",
          changeLinkVisible: true
        }),
        expect.objectContaining({
          fieldId: "childCollection",
          changeLinkVisible: true
        }),
        expect.objectContaining({
          fieldId: "sodAdditionalRecipientsList",
          changeLinkVisible: true
        })
      ])
    );

    const flattenedCyaRows = flattenCyaRows(cyaRows);
    expect(flattenedCyaRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldId: "emailInformation",
          showCondition: "sodAdditionalRecipientsList.serveByPostOrEmail=\"email\""
        }),
        expect.objectContaining({
          fieldId: "emailInformation.emailName",
          showCondition: "sodAdditionalRecipientsList.serveByPostOrEmail=\"email\"",
          value: "Example organisation"
        }),
        expect.objectContaining({
          fieldId: "emailInformation.emailAddress",
          showCondition: "sodAdditionalRecipientsList.serveByPostOrEmail=\"email\"",
          value: "example.organisation@example.invalid"
        })
      ])
    );
    expect(cyaRows.map((row) => row.fieldId)).not.toContain("confidentialDirections");
  });

  test("work-allocation replay covers null-service roles, persona tabs, locations, and task correlation", () => {
    const serviceFamilies = resolveCaseworkerJurisdictions(WORK_ALLOCATION_REPLAY.roleAssignments);

    expect(serviceFamilies).toEqual(sortServiceFamilies(EXUI_WA_SUPPORTED_SERVICE_FAMILIES));
    expect(resolveRoleCategory(WORK_ALLOCATION_REPLAY.roleAssignments)).toBe("LEGAL_OPERATIONS");

    for (const persona of WORK_ALLOCATION_REPLAY.personas) {
      expect(persona.expectedTabs.length, `${persona.id} should have at least one expected work tab`).toBeGreaterThan(0);
      expect(persona.expectedLocationIds).toContain("366559");
    }

    expect(
      findTaskToComplete(WORK_ALLOCATION_REPLAY.tasks, {
        taskId: "task-review-referral",
        caseId: "1700000000000001",
        eventId: "reviewReferral"
      })
    ).toEqual(expect.objectContaining({ id: "task-review-referral" }));

    expect(
      findTaskToComplete(WORK_ALLOCATION_REPLAY.tasks, {
        taskId: "task-review-referral",
        caseId: "1700000000000001",
        eventId: "updateReferral"
      })
    ).toBeUndefined();
  });

  test("CCD search/workbasket metadata replay keeps service-owned definition changes inside the EXUI contract", async ({}, testInfo) => {
    const replay = mutateCcdSearchMetadataForDemo(CCD_SEARCH_WORKBASKET_METADATA_REPLAY);

    await attachCcdSearchMutationEvidence(testInfo);

    expect(() => assertRequiredCcdSearchMetadataFieldsPresent(replay)).not.toThrow();
    expect(replay.searchInputFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          caseTypeId: "PRLAPPS",
          fieldId: "[CASE_REFERENCE]",
          source: "SearchInputFields"
        })
      ])
    );
    expect(replay.workbasketInputFields.length).toBeGreaterThan(0);
  });

  test("protected endpoint replay rejects anonymous staff-data exposure", () => {
    for (const endpoint of PROTECTED_ENDPOINT_REPLAY) {
      expect(
        isAnonymousProtectedEndpointResponseSafe(401, { message: "Unauthorized" }, endpoint.sensitiveFields),
        `${endpoint.method} ${endpoint.path} should accept 401 as guarded`
      ).toBe(true);
      expect(
        isAnonymousProtectedEndpointResponseSafe(302, undefined, endpoint.sensitiveFields),
        `${endpoint.method} ${endpoint.path} should accept auth redirect as guarded`
      ).toBe(true);
      expect(
        isAnonymousProtectedEndpointResponseSafe(
          200,
          {
            email: "case.worker@example.invalid",
            firstName: "Case",
            lastName: "Worker",
            roleCategory: "LEGAL_OPERATIONS"
          },
          endpoint.sensitiveFields
        ),
        `${endpoint.method} ${endpoint.path} must not expose staff data anonymously`
      ).toBe(false);
    }
  });

  test("event-history replay gates external users and keeps embedded component layout usable", () => {
    const internalPersona = EVENT_HISTORY_REPLAY.personas.find((persona) => persona.id === "internal-caseworker");
    const externalPersona = EVENT_HISTORY_REPLAY.personas.find((persona) => persona.id === "external-solicitor");

    expect(internalPersona).toBeDefined();
    expect(externalPersona).toBeDefined();

    const internalRows = buildEventHistoryRowsForPersona(internalPersona!, EVENT_HISTORY_REPLAY.eventRows);
    const externalRows = buildEventHistoryRowsForPersona(externalPersona!, EVENT_HISTORY_REPLAY.eventRows);

    expect(internalRows.every((row) => row.href)).toBe(true);
    expect(externalRows.every((row) => row.href === undefined)).toBe(true);
    expect(canFetchEventDetails(internalPersona!)).toBe(true);
    expect(canFetchEventDetails(externalPersona!)).toBe(false);
    expect(
      isEventHistoryLayoutUsable(
        EVENT_HISTORY_REPLAY.viewportWidthPx,
        EVENT_HISTORY_REPLAY.minimumEmbeddedComponentWidthPx
      )
    ).toBe(true);
  });

  test("event-start spinner and IDAM/passport smoke contracts are executable", () => {
    expect(isSpinnerContractSatisfied(EVENT_START_SPINNER_REPLAY)).toBe(true);
    expect(isAuthSmokeSessionValid(IDAM_PASSPORT_SESSION_REPLAY)).toBe(true);
  });

  test("historic coverage status only claims covered-now where an executable replay pack exists", () => {
    const summary = buildHistoricFailureCoverageSummary();

    expect(summary["covered-now"]).toEqual(
      expect.arrayContaining([
        "manage-case-previous-navigation-data-loss",
        "cya-complex-show-condition-summary",
        "nested-complex-fieldshowcondition-cya",
        "hidden-complex-retention",
        "wa-task-lifecycle-correlation",
        "wa-tab-location-availability",
        "role-assignment-null-service",
        "protected-endpoint-auth-negative",
        "event-history-external-role-gate",
        "event-history-layout-width",
        "event-start-spinner-latency",
        "idam-passport-session-smoke"
      ])
    );

    const coveredNow = EXUI_HISTORIC_FAILURE_COVERAGE.filter((failure) => failure.coverageStatus === "covered-now");
    expect(coveredNow.every((failure) => failure.currentPocEvidence.includes("Executable replay pack"))).toBe(true);
    expect(summary["out-of-scope"]).toEqual(["media-viewer-redaction-coordinate"]);
  });
});
