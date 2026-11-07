const assert = require("node:assert/strict");
// Finite names reviewed against the core proof specs and their fixture journeys.
const allowed = {
  "wa-family-options": ["family-membership", "family-filter"],
  "wa-org-scope-ia": [
    "organisation-scope",
    "location-selection",
    "organisation-scope-query",
    "location-search-results",
  ],
  "wa-org-scope-civil": [
    "organisation-scope",
    "location-selection",
    "organisation-scope-query",
    "location-search-results",
  ],
  "ccd-nested-roundtrip": ["nested-persistence"],
  "ccd-role-revocation": ["revoked-data-isolation", "revoked-state-integrity"],
  "ccd-role-policy": ["denied-data-isolation", "denied-state-integrity"],
  "ccd-postal-two-roundtrip": ["postal-required-fields", "postal-persistence"],
  "ccd-prl-workbasket-inputs": [
    "workbasket-page-load",
    "workbasket-navigation",
    "workbasket-source-field",
  ],
  "ccd-courtadmin-update-recipient-shapes": ["courtadmin-update-persistence"],
  "ccd-event-create-denied": ["event-capability-isolation"],
  "ccd-courtadmin-read-recipient-shapes": [
    "courtadmin-recipient-read-projection",
  ],
  "ccd-readonly-read-recipient-shapes": ["readonly-recipient-read-projection"],
  "ccd-readonly-update-recipient-shapes-denied": ["readonly-update-isolation"],
  "routing-create-redirect-fallback": ["event-redirect"],
  "routing-noc-session-cache": ["noc-session-routing"],
  "callback-recipient-row": [
    "recipient-callback-identity",
    "recipient-callback-binding",
  ],
  "ccd-selector-event-row": [
    "selector-event-identity",
    "selector-event-summary-row",
  ],
};
const aliases = {
  "wa-missing-family": "wa-family-options",
  "wa-scope-broadened": "wa-org-scope-ia",
  "ccd-child-loss": "ccd-nested-roundtrip",
  "ccd-stale-revoked-bearer": "ccd-role-revocation",
  "ccd-access-broadened": "ccd-role-policy",
  "ccd-write-then-deny": "ccd-role-policy",
  "ccd-prl-workbasket-inputs-fault": "ccd-prl-workbasket-inputs",
  "ccd-postal-child-loss": "ccd-postal-two-roundtrip",
  "ccd-event-create-enabled": "ccd-event-create-denied",
  "ccd-courtadmin-read-shapes-hidden": "ccd-courtadmin-read-recipient-shapes",
  "ccd-readonly-read-shapes-hidden": "ccd-readonly-read-recipient-shapes",
  "ccd-readonly-update-recipient-shapes-enabled":
    "ccd-readonly-update-recipient-shapes-denied",
  "ccd-courtadmin-update-recipient-shapes-denied":
    "ccd-courtadmin-update-recipient-shapes",
  "routing-web-url-omission": "routing-create-redirect-fallback",
  "routing-noc-url-omission": "routing-noc-session-cache",
  "callback-recipient-binding-omitted": "callback-recipient-row",
  "ccd-selector-summary-hidden": "ccd-selector-event-row",
};
for (const id of [
  "recipient-collection",
  "case-field-recipient-selector",
  "required-delivery-radio",
  "conditional-email-complex",
  "postal-recipient-name",
  "optional-postal-line-two",
]) {
  const proof = "ccd-source-shape-" + id;
  allowed[proof] = ["source-shape-" + id];
  aliases[proof + "-fault"] = proof;
}
const reasons = [
  "UNKNOWN_STAGE",
  "INVALID_STAGE_TELEMETRY",
  "STAGE_NOT_ENDED",
  "NO_NAMED_STAGES",
];
const unavailable = (reason) => ({
  schemaVersion: 1,
  availability: "unavailable",
  reason,
});
const keys = (value, names) =>
  value &&
  Object.keys(value).sort().join(",") === names.slice().sort().join(",");
const duration = (value) =>
  Number.isFinite(value) && value >= 0 && value <= 24 * 60 * 60 * 1000;
const ids = (proof) => {
  const key = Object.hasOwn(aliases, proof) ? aliases[proof] : proof;
  return Object.hasOwn(allowed, key) ? allowed[key] : undefined;
};
const ignored = (step) => {
  for (let p = step; p; p = p.parent)
    if (p.category === "hook" || p.category === "fixture") return true;
  return false;
};
class NativeStageRecorder {
  constructor() {
    this.records = new WeakMap();
  }
  state(result) {
    if (!this.records.has(result))
      this.records.set(result, {
        entries: new Map(),
        reason: null,
        instances: new Map(),
      });
    return this.records.get(result);
  }
  begin(proof, result, step) {
    if (
      ignored(step) ||
      step.category !== "test.step" ||
      !step.title.startsWith("harness-assertion:")
    )
      return;
    const state = this.state(result),
      stageId = step.title.slice("harness-assertion:".length);
    if (!ids(proof)?.includes(stageId)) {
      state.reason = "UNKNOWN_STAGE";
      return;
    }
    if (state.entries.has(step) || state.entries.size >= 512) {
      state.reason = "INVALID_STAGE_TELEMETRY";
      return;
    }
    const instance = (state.instances.get(stageId) ?? 0) + 1;
    state.instances.set(stageId, instance);
    state.entries.set(step, {
      ordinal: state.entries.size + 1,
      stageId,
      instance,
    });
  }
  end(proof, result, step) {
    if (
      ignored(step) ||
      step.category !== "test.step" ||
      !step.title.startsWith("harness-assertion:")
    )
      return;
    const state = this.state(result),
      entry = state.entries.get(step);
    if (!entry || entry.outcome || !duration(step.duration)) {
      state.reason = ids(proof)?.includes(
        step.title.slice("harness-assertion:".length),
      )
        ? "INVALID_STAGE_TELEMETRY"
        : "UNKNOWN_STAGE";
      return;
    }
    entry.outcome = step.error
      ? "reported-error"
      : step.annotations?.some((a) => a.type === "skip")
        ? "skipped"
        : "completed-without-reported-error";
    entry.durationMs = step.duration;
  }
  finish(proof, result) {
    const state = this.state(result);
    if (state.reason) return unavailable(state.reason);
    if ([...state.entries.values()].some((s) => !s.outcome))
      return unavailable("STAGE_NOT_ENDED");
    if (state.entries.size === 0) return unavailable("NO_NAMED_STAGES");
    if (!duration(result.duration))
      return unavailable("INVALID_STAGE_TELEMETRY");
    return readStageTelemetry(proof, {
      schemaVersion: 1,
      availability: "recorded",
      scope: "named-assertion-stages",
      testDurationMs: result.duration,
      stages: [...state.entries.values()],
    });
  }
}
function assertStageTelemetry(proof, value) {
  assert(ids(proof), "PUBLIC_NATIVE_STAGE_PROOF");
  assert.equal(value?.schemaVersion, 1, "PUBLIC_NATIVE_STAGE_SCHEMA");
  if (value.availability === "unavailable") {
    assert(
      keys(value, ["schemaVersion", "availability", "reason"]) &&
        reasons.includes(value.reason),
      "PUBLIC_NATIVE_STAGE_UNAVAILABLE",
    );
    return value;
  }
  assert(
    keys(value, [
      "schemaVersion",
      "availability",
      "scope",
      "testDurationMs",
      "stages",
    ]) &&
      value.availability === "recorded" &&
      value.scope === "named-assertion-stages" &&
      duration(value.testDurationMs) &&
      Array.isArray(value.stages) &&
      value.stages.length > 0 &&
      value.stages.length <= 512,
    "PUBLIC_NATIVE_STAGE_RECORD",
  );
  const instances = new Map();
  value.stages.forEach((s, i) => {
    assert(
      keys(s, ["ordinal", "stageId", "instance", "outcome", "durationMs"]) &&
        s.ordinal === i + 1 &&
        ids(proof).includes(s.stageId) &&
        duration(s.durationMs) &&
        // Playwright1.65 uses integer Date.now() deltas for steps, and
        // truncates monotonic elapsed time for tests; allow at most1ms rounding.
        s.durationMs <= value.testDurationMs + 1 &&
        [
          "completed-without-reported-error",
          "reported-error",
          "skipped",
        ].includes(s.outcome),
      "PUBLIC_NATIVE_STAGE_ENTRY",
    );
    const n = (instances.get(s.stageId) ?? 0) + 1;
    assert.equal(s.instance, n, "PUBLIC_NATIVE_STAGE_INSTANCE");
    instances.set(s.stageId, n);
  });
  return value;
}
function readStageTelemetry(proof, value) {
  if (value === undefined) return undefined;
  try {
    assertStageTelemetry(proof, value);
    return structuredClone(value);
  } catch {
    return unavailable("INVALID_STAGE_TELEMETRY");
  }
}
module.exports = {
  NativeStageRecorder,
  readStageTelemetry,
  assertStageTelemetry,
};
