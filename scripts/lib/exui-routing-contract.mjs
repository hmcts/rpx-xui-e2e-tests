import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { digestBytes } from "./exui-evidence-io.mjs";

export const ROUTING_SCOPE = "exui-decentralised-routing-pilot";
export const ROUTING_CONFIGURATION_MODE =
  "complete-node-config-empty-private-directory";
export const ROUTING_ORIGINS = Object.freeze({
  central: "http://127.0.0.1:3101",
  noc: "http://127.0.0.1:3102",
  ui: "http://127.0.0.1:3103",
});
export const ROUTING_CASES = Object.freeze({
  a: "1111222233334444",
  b: "5555666677778888",
});
export const ROUTING_USER = "harness-supervisor";
export const ROUTING_UI_PATH =
  "/pcs-ui/cases/case-create/PCS/PCS/ext%3Arouting-create";
export function routingConfiguration(original, mutation = null) {
  assert(
    [null, "routing-omit-web-url", "routing-omit-noc-base-url"].includes(
      mutation,
    ),
    "UNSUPPORTED_ROUTING_MUTATION",
  );
  const config = structuredClone(original);
  config.services.ccd.caseAssignmentApi = `${ROUTING_ORIGINS.central}/central-assignment`;
  config.decentralisedCaseTypeConfig = {
    PCS: {
      webUrl: `${ROUTING_ORIGINS.ui}/pcs-ui`,
      nocBaseUrl: `${ROUTING_ORIGINS.noc}/pcs-assignment`,
    },
  };
  config.decentralisedServiceMap = {};
  if (mutation)
    delete config.decentralisedCaseTypeConfig.PCS[
      mutation === "routing-omit-web-url" ? "webUrl" : "nocBaseUrl"
    ];
  return config;
}
// Contract source is expectation provenance. The sealed candidate may contain a newer implementation.
export function assertRoutingInterpreter(
  artifact,
  review,
  expectedIdentity,
  candidateRoot = artifact.candidateRoot,
) {
  const pin = review.decentralisedRouting?.interpreterPin;
  assert(
    pin && pin.repository === "hmcts/rpx-xui-webapp",
    "ROUTING_REVIEWED_INTERPRETER_REQUIRED",
  );
  assert.equal(
    pin.revision,
    review.sourceRevisions["rpx-xui-webapp:config/default.json"],
    "ROUTING_REVIEW_REVISION_MISMATCH",
  );
  for (const source of [
    "common/decentralisation/decentralised-redirect.util.ts",
    "src/decentralisation/decentralised-redirect.service.ts",
    "src/cases/store/effects/case-create.effects.ts",
    "api/noc/index.ts",
  ])
    assert(
      /^sha256:[a-f0-9]{64}$/.test(pin.sourceHashes?.[source] ?? ""),
      "ROUTING_PRIMARY_SOURCE_PIN_REQUIRED",
    );
  assert(expectedIdentity, "ROUTING_INDEPENDENT_CANDIDATE_REQUIRED");
  assert.deepEqual(
    artifact.identity,
    expectedIdentity,
    "ROUTING_INDEPENDENT_CANDIDATE_MISMATCH",
  );
  assert.equal(
    artifact.provenance.webappCommit,
    artifact.identity.webappCommit,
    "ROUTING_PRODUCER_COMMIT_MISMATCH",
  );
  assert(
    /^[a-f0-9]{40}$/.test(artifact.provenance.sourceTree),
    "ROUTING_IMPLEMENTATION_TREE_REQUIRED",
  );
  const apiPath = "dist/rpx-exui/api/server.bundle.js";
  return {
    contract: {
      repository: pin.repository,
      revision: pin.revision,
      sourceTree: pin.sourceTree,
      sourceHashes: pin.sourceHashes,
      pinDigest: digestBytes(JSON.stringify(pin)),
    },
    implementation: {
      identity: artifact.identity,
      sourceTree: artifact.provenance.sourceTree,
      apiBundle: {
        path: apiPath,
        digest: digestBytes(fs.readFileSync(path.join(candidateRoot, apiPath))),
      },
    },
    knownBaselineRoutingChunk:
      artifact.identity.artifactDigest === pin.baselineArtifactDigest
        ? pin.browserChunk
        : null,
  };
}

export const routingAnswers = (caseId) => ({
  case_id: caseId,
  answers: [{ question_id: "routing-question", value: "synthetic-answer" }],
});
const fieldType = {
  id: "Text",
  type: "Text",
  min: null,
  max: null,
  regular_expression: null,
  fixed_list_items: [],
  complex_fields: [],
  collection_field_type: null,
};
export function routingQuestions(caseId) {
  return {
    questions: [
      {
        case_type_id: caseId === ROUTING_CASES.a ? "PCS" : "CIVIL",
        order: "1",
        question_text: "Synthetic routing question",
        answer_field_type: fieldType,
        display_context_parameter: "",
        challenge_question_id: "routing-question",
        answer_field: "routing-answer",
        question_id: "routing-question",
      },
    ],
  };
}
const event = (id, name, order) => ({
  id,
  name,
  description: "Synthetic routing event",
  order,
  pre_states: [],
  post_state: "Draft",
  case_fields: [],
});
export function routingJurisdictions() {
  return [
    {
      id: "PCS",
      name: "Synthetic PCS",
      description: "Routing fixture",
      caseTypes: [
        {
          id: "PCS",
          name: "Synthetic PCS case",
          description: "Routing fixture",
          states: [],
          events: [
            event("ext:routing-create", "External routing event", 1),
            event("routing-local", "Local routing event", 2),
          ],
        },
        {
          id: "RoutingUnmapped",
          name: "Synthetic unmapped case",
          description: "Routing fixture",
          states: [],
          events: [event("ext:routing-create", "External routing event", 1)],
        },
      ],
    },
  ];
}
export function routingTrigger(eventId) {
  return {
    id: eventId,
    name: "Synthetic routing editor",
    event_token: "synthetic-routing-event-token",
    show_summary: true,
    can_save_draft: false,
    case_fields: [
      {
        id: "RoutingMarker",
        label: "Routing marker",
        field_type: fieldType,
        display_context: "OPTIONAL",
        value: "synthetic",
      },
    ],
    wizard_pages: [
      {
        id: "routing",
        label: "Routing",
        order: 1,
        wizard_page_fields: [
          { case_field_id: "RoutingMarker", order: 1, page_column_no: 1 },
        ],
      },
    ],
  };
}
export function routingProfile() {
  return {
    user: {
      idam: {
        id: ROUTING_USER,
        email: "supervisor@example.invalid",
        forename: "Synthetic",
        surname: "Supervisor",
        roles: [
          "caseworker",
          "caseworker-ia",
          "caseworker-ia-caseofficer",
          "hmcts-legal-operations",
          "task-supervisor",
        ],
      },
    },
    channels: [],
    jurisdictions: routingJurisdictions(),
    default: {
      workbasket: {
        jurisdiction_id: "PCS",
        case_type_id: "PCS",
        state_id: "Draft",
      },
    },
  };
}
