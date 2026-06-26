import {
  EXUI_HISTORIC_FAILURE_COVERAGE,
  EXUI_WA_SUPPORTED_SERVICE_FAMILIES,
  buildHistoricFailureCoverageSummary,
  sortServiceFamilies
} from "../../data/exui-central-assurance.js";
import {
  assertRequiredCcdSearchMetadataFieldsPresent,
  assertAuthJourneyGuardrailScenarios,
  buildCyaRows,
  buildAuthJourneyClassificationSummary,
  buildEventHistoryRowsForPersona,
  buildExui4493NestedComplexCyaEvidence,
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
  resolveAuthJourneyOutcome,
  resolveLegacyAuthJourneyOutcome,
  resolveCaseworkerJurisdictions,
  resolveRoleCategory,
  WORK_ALLOCATION_REPLAY,
  assertExui4493NestedComplexCyaRowsPresent,
  assertPrivateLawConfigAnchors,
  AUTH_JOURNEY_GUARDRAIL_REPLAY
} from "../../data/exui-historic-replay-packs.js";
import {
  assertExui4493ToolkitContract,
  buildExui4493ToolkitContractEvidence
} from "../../data/exui-toolkit-cya-contract.js";

import { test, expect } from "./fixtures";

type AttachmentSink = {
  attach(name: string, options: { body: string; contentType: string }): Promise<void>;
};

function escapeSvgText(value: unknown): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildExui4493CyaEvidenceSvg(evidence: ReturnType<typeof buildExui4493NestedComplexCyaEvidence>): string {
  const actualFieldIds = new Set(evidence.flattenedRows.map((row) => row.fieldId));
  const statusLabel = evidence.missingFieldIds.length > 0 ? "FAILING: missing nested CYA rows" : "PASSING: CYA rows present";
  const statusColour = evidence.missingFieldIds.length > 0 ? "#b10e1e" : "#00703c";
  const actualRows = evidence.requiredFieldIds
    .map((fieldId, index) => {
      const row = evidence.flattenedRows.find((candidate) => candidate.fieldId === fieldId);
      const y = 358 + index * 54;
      const isMissing = !actualFieldIds.has(fieldId);
      const fill = isMissing ? "#f6d7d2" : "#d8f0df";
      const stroke = isMissing ? "#b10e1e" : "#00703c";
      const value = row ? escapeSvgText(row.value) : "MISSING";
      return `
        <rect x="720" y="${y - 28}" width="400" height="40" rx="4" fill="${fill}" stroke="${stroke}" />
        <text x="740" y="${y - 4}" class="body ${isMissing ? "missing" : "ok"}">${escapeSvgText(fieldId)}: ${value}</text>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1160" height="520" viewBox="0 0 1160 520" role="img" aria-label="EXUI-4493 CYA evidence">
    <style>
      .title { font: 700 26px Arial, sans-serif; fill: #0b0c0c; }
      .subtitle { font: 400 15px Arial, sans-serif; fill: #505a5f; }
      .heading { font: 700 18px Arial, sans-serif; fill: #0b0c0c; }
      .body { font: 400 15px Arial, sans-serif; fill: #0b0c0c; }
      .mono { font: 400 14px "Menlo", "Consolas", monospace; fill: #0b0c0c; }
      .status { font: 700 16px Arial, sans-serif; fill: ${statusColour}; }
      .missing { fill: #942514; font-weight: 700; }
      .ok { fill: #005a30; font-weight: 700; }
    </style>
    <rect width="1160" height="520" fill="#ffffff" />
    <text x="32" y="44" class="title">EXUI-4493 harness evidence</text>
    <text x="32" y="72" class="subtitle">Config-driven CYA replay for PRL Service of Documents nested complex FieldShowCondition</text>
    <text x="32" y="104" class="status">${statusLabel}</text>

    <rect x="32" y="132" width="340" height="320" rx="6" fill="#f3f2f1" stroke="#b1b4b6" />
    <text x="56" y="168" class="heading">Source CCD shape</text>
    <text x="56" y="206" class="body">Event</text>
    <text x="56" y="230" class="mono">${escapeSvgText(evidence.sourceShape.eventId)}</text>
    <text x="56" y="264" class="body">Collection</text>
    <text x="56" y="288" class="mono">${escapeSvgText(evidence.sourceShape.collectionFieldId)}</text>
    <text x="56" y="322" class="body">Nested complex</text>
    <text x="56" y="346" class="mono">${escapeSvgText(evidence.sourceShape.nestedComplexFieldId)}</text>
    <text x="56" y="380" class="body">Show condition</text>
    <text x="56" y="404" class="mono">${escapeSvgText(evidence.sourceShape.showCondition)}</text>

    <rect x="404" y="132" width="284" height="320" rx="6" fill="#f8f8f8" stroke="#b1b4b6" />
    <text x="428" y="168" class="heading">Expected CYA rows</text>
    <rect x="428" y="330" width="236" height="40" rx="4" fill="#e8f1f8" stroke="#1d70b8" />
    <text x="448" y="354" class="mono">${escapeSvgText(evidence.requiredFieldIds[0])}</text>
    <rect x="428" y="384" width="236" height="40" rx="4" fill="#e8f1f8" stroke="#1d70b8" />
    <text x="448" y="408" class="mono">${escapeSvgText(evidence.requiredFieldIds[1])}</text>

    <rect x="704" y="132" width="432" height="320" rx="6" fill="#fff7bf" stroke="#b1b4b6" />
    <text x="728" y="168" class="heading">Actual harness projection</text>
    <text x="728" y="204" class="subtitle">Projection: ${escapeSvgText(evidence.projection)}</text>
    ${actualRows}

    <text x="32" y="492" class="subtitle">This artefact is attached by the API replay test so the Odhín report shows the defect visually without needing a full browser journey.</text>
  </svg>`;
}

function buildExui4493ToolkitEvidenceSvg(evidence: ReturnType<typeof buildExui4493ToolkitContractEvidence>): string {
  const actualFieldIds = new Set(evidence.rows.filter((row) => !row.hidden).map((row) => row.fieldId));
  const statusLabel =
    evidence.missingSourceMarkers.length > 0 || evidence.missingVisibleFieldIds.length > 0
      ? "FAILING: installed toolkit does not satisfy EXUI-4493 CYA contract"
      : "PASSING: installed toolkit renders nested CYA rows";
  const statusColour =
    evidence.missingSourceMarkers.length > 0 || evidence.missingVisibleFieldIds.length > 0 ? "#b10e1e" : "#00703c";
  const rowCards = evidence.requiredVisibleFieldIds
    .map((fieldId, index) => {
      const row = evidence.rows.find((candidate) => candidate.fieldId === fieldId);
      const y = 308 + index * 58;
      const isMissing = !actualFieldIds.has(fieldId);
      const fill = isMissing ? "#f6d7d2" : "#d8f0df";
      const stroke = isMissing ? "#b10e1e" : "#00703c";
      const value = row ? escapeSvgText(row.value) : "MISSING";
      return `
        <rect x="704" y="${y - 32}" width="432" height="44" rx="4" fill="${fill}" stroke="${stroke}" />
        <text x="728" y="${y - 6}" class="body ${isMissing ? "missing" : "ok"}">${escapeSvgText(fieldId)}: ${value}</text>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1160" height="520" viewBox="0 0 1160 520" role="img" aria-label="EXUI-4493 installed toolkit evidence">
    <style>
      .title { font: 700 26px Arial, sans-serif; fill: #0b0c0c; }
      .subtitle { font: 400 15px Arial, sans-serif; fill: #505a5f; }
      .heading { font: 700 18px Arial, sans-serif; fill: #0b0c0c; }
      .body { font: 400 15px Arial, sans-serif; fill: #0b0c0c; }
      .mono { font: 400 13px "Menlo", "Consolas", monospace; fill: #0b0c0c; }
      .status { font: 700 16px Arial, sans-serif; fill: ${statusColour}; }
      .missing { fill: #942514; font-weight: 700; }
      .ok { fill: #005a30; font-weight: 700; }
    </style>
    <rect width="1160" height="520" fill="#ffffff" />
    <text x="32" y="44" class="title">EXUI-4493 installed toolkit proof</text>
    <text x="32" y="72" class="subtitle">PRL nested-complex CYA shape executed against the toolkit package installed by rpx-xui-webapp</text>
    <text x="32" y="104" class="status">${statusLabel}</text>

    <rect x="32" y="132" width="640" height="320" rx="6" fill="#f3f2f1" stroke="#b1b4b6" />
    <text x="56" y="168" class="heading">Dependency under test</text>
    <text x="56" y="206" class="body">Webapp root</text>
    <text x="56" y="230" class="mono">${escapeSvgText(evidence.webappRoot)}</text>
    <text x="56" y="264" class="body">Installed toolkit version</text>
    <text x="56" y="288" class="mono">${escapeSvgText(evidence.toolkitPackageVersion)}</text>
    <text x="56" y="322" class="body">Toolkit bundle</text>
    <text x="56" y="346" class="mono">${escapeSvgText(evidence.toolkitBundlePath)}</text>
    <text x="56" y="388" class="body">Required fix markers</text>
    <text x="56" y="412" class="mono">${escapeSvgText(evidence.requiredSourceMarkers.join(", "))}</text>

    <rect x="704" y="132" width="432" height="320" rx="6" fill="#fff7bf" stroke="#b1b4b6" />
    <text x="728" y="168" class="heading">Rendered CYA rows</text>
    <text x="728" y="204" class="subtitle">Both rows must be visible for the email branch.</text>
    ${rowCards}

    <text x="32" y="492" class="subtitle">This proof catches webapp dependency drift: old dependency red, current fixed state green.</text>
  </svg>`;
}

function buildAuthJourneyGuardrailSvg(evidence: typeof AUTH_JOURNEY_GUARDRAIL_REPLAY): string {
  const rows = evidence.scenarios
    .map((scenario, index) => {
      const y = 160 + index * 74;
      const outcome = resolveAuthJourneyOutcome(scenario);
      const legacyOutcome = resolveLegacyAuthJourneyOutcome(scenario);
      const changed = outcome !== legacyOutcome;
      const fill = outcome === scenario.expectedOutcome ? "#d8f0df" : "#f6d7d2";
      const stroke = outcome === scenario.expectedOutcome ? "#00703c" : "#b10e1e";
      return `
        <rect x="32" y="${y - 34}" width="1096" height="58" rx="5" fill="${fill}" stroke="${stroke}" />
        <text x="52" y="${y - 10}" class="row-title">${escapeSvgText(scenario.id)}</text>
        <text x="52" y="${y + 12}" class="row-body">entrypoint=${escapeSvgText(scenario.entrypoint)} | roles=${escapeSvgText(
          scenario.roles.join(", ") || "none"
        )} | expected=${escapeSvgText(scenario.expectedOutcome)} | actual=${escapeSvgText(outcome)}${
          changed ? ` | legacy=${escapeSvgText(legacyOutcome)}` : ""
        }</text>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1160" height="500" viewBox="0 0 1160 500" role="img" aria-label="EXUI auth journey guardrail evidence">
    <style>
      .title { font: 700 26px Arial, sans-serif; fill: #0b0c0c; }
      .subtitle { font: 400 15px Arial, sans-serif; fill: #505a5f; }
      .row-title { font: 700 15px Arial, sans-serif; fill: #0b0c0c; }
      .row-body { font: 400 13px "Menlo", "Consolas", monospace; fill: #0b0c0c; }
    </style>
    <rect width="1160" height="500" fill="#ffffff" />
    <text x="32" y="44" class="title">Auth journey guardrails</text>
    <text x="32" y="72" class="subtitle">Central replay for SSO login-hint state creation and post-auth role mismatch access denied.</text>
    <text x="32" y="100" class="subtitle">This is an EXUI/node-lib contract, not a service-specific end-to-end login journey.</text>
    ${rows}
  </svg>`;
}

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

  test("EXUI-4493 config-driven replay keeps nested complex FieldShowCondition values on CYA", async ({}, testInfo) => {
    const evidence = buildExui4493NestedComplexCyaEvidence();

    await testInfo.attach("exui-4493-cya-evidence.json", {
      body: JSON.stringify(evidence, null, 2),
      contentType: "application/json"
    });
    await testInfo.attach("exui-4493-cya-evidence.svg", {
      body: buildExui4493CyaEvidenceSvg(evidence),
      contentType: "image/svg+xml"
    });

    expect(evidence.sourceShape).toMatchObject({
      serviceFamily: "PRIVATELAW",
      jurisdiction: "PRIVATELAW",
      caseType: "PRLAPPS",
      eventId: "serviceOfDocuments",
      collectionFieldId: "sodAdditionalRecipientsList",
      nestedComplexFieldId: "emailInformation",
      showCondition: "sodAdditionalRecipientsList.serveByPostOrEmail=\"email\""
    });
    assertExui4493NestedComplexCyaRowsPresent(evidence);
  });

  test("EXUI-4493 installed webapp toolkit renders nested complex FieldShowCondition values on CYA", async ({}, testInfo) => {
    const evidence = buildExui4493ToolkitContractEvidence();

    await testInfo.attach("exui-4493-installed-toolkit-contract.json", {
      body: JSON.stringify(evidence, null, 2),
      contentType: "application/json"
    });
    await testInfo.attach("exui-4493-installed-toolkit-contract.svg", {
      body: buildExui4493ToolkitEvidenceSvg(evidence),
      contentType: "image/svg+xml"
    });

    assertExui4493ToolkitContract(evidence);
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

  test("auth journey replay covers SSO login-hint and post-auth role-mismatch guardrails", async ({}, testInfo) => {
    const classificationSummary = buildAuthJourneyClassificationSummary(AUTH_JOURNEY_GUARDRAIL_REPLAY);

    await testInfo.attach("auth-journey-guardrail-replay.json", {
      body: JSON.stringify(AUTH_JOURNEY_GUARDRAIL_REPLAY, null, 2),
      contentType: "application/json"
    });
    await testInfo.attach("auth-journey-guardrail-replay.svg", {
      body: buildAuthJourneyGuardrailSvg(AUTH_JOURNEY_GUARDRAIL_REPLAY),
      contentType: "image/svg+xml"
    });

    expect(() => assertAuthJourneyGuardrailScenarios(AUTH_JOURNEY_GUARDRAIL_REPLAY)).not.toThrow();
    expect(classificationSummary["auth-entrypoint-owned"]).toEqual([
      "exui-4744-direct-idam-no-state-bookmark",
      "exui-4744-exui-auth-login-hint"
    ]);
    expect(classificationSummary["post-auth-authorisation-owned"]).toEqual([
      "exui-4697-authenticated-user-missing-caseworker-role",
      "exui-4697-authenticated-user-with-caseworker-role"
    ]);

    const exuiAuthLogin = AUTH_JOURNEY_GUARDRAIL_REPLAY.scenarios.find(
      (scenario) => scenario.id === "exui-4744-exui-auth-login-hint"
    );
    const missingRole = AUTH_JOURNEY_GUARDRAIL_REPLAY.scenarios.find(
      (scenario) => scenario.id === "exui-4697-authenticated-user-missing-caseworker-role"
    );

    expect(exuiAuthLogin).toBeDefined();
    expect(missingRole).toBeDefined();
    expect(resolveAuthJourneyOutcome(exuiAuthLogin!)).toBe("redirect-sso");
    expect(resolveLegacyAuthJourneyOutcome(exuiAuthLogin!)).toBe("login-bookmark");
    expect(resolveAuthJourneyOutcome(missingRole!)).toBe("access-denied");
    expect(resolveLegacyAuthJourneyOutcome(missingRole!)).toBe("logout-root-loop");
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
        "idam-passport-session-smoke",
        "sso-login-hint-entrypoint-state",
        "post-auth-role-mismatch-access-denied"
      ])
    );

    const coveredNow = EXUI_HISTORIC_FAILURE_COVERAGE.filter((failure) => failure.coverageStatus === "covered-now");
    expect(coveredNow.every((failure) => failure.currentPocEvidence.includes("Executable replay pack"))).toBe(true);
    expect(summary["learning-case"]).toEqual(["overview-page-layout-regression-classification"]);
    expect(summary.partial).toEqual([]);
    expect(summary["out-of-scope"]).toEqual(["media-viewer-redaction-coordinate"]);
  });
});
