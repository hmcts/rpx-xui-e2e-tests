const { createHash } = require("node:crypto");
const objectDigest = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object"
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const workbasketSource = require("./fixtures/ccd/workbasket-input.source.json").sources[0];
const workbasketRows = new Set(workbasketSource.rows.map(({ row }) => "configuration-shape:" +
  objectDigest(canonical({ source: "prl-ccd-definitions:" + workbasketSource.path, row }))));
const { escape } = require("./harness-report-coverage.cjs");

// Reviewed labels describe the fixed proof, never infer per-service execution from a PASS.
const proofs = {
  "wa-family-options": {
    phase: "family",
    slice: "WA service families",
    behaviour:
      "Render the supported services and submit the selected service to Work Allocation.",
    services:
      "Civil, Employment, Immigration and Asylum, Possession, Private Law, Public Law, Criminal Injuries Compensation",
    jurisdiction: "CIVIL, EMPLOYMENT, IA, PCS, PRIVATELAW, PUBLICLAW, ST_CIC",
    caseType: "Not case-specific",
    lane: "Actual EXUI Node + Angular",
    limits:
      "Synthetic session and declared provider responses; no production tasks or service-by-service workflow claim.",
  },
  "wa-org-scope-ia": {
    phase: "scope",
    slice: "Organisation-scoped WA filters — IA",
    behaviour:
      "Offer only organisation-assigned services and submit the selected location query.",
    services: "Immigration and Asylum",
    jurisdiction: "IA",
    caseType: "Not case-specific",
    lane: "Actual EXUI Node + Angular",
    limits:
      "Synthetic role assignments and provider responses; checks the filter and request composition.",
  },
  "wa-org-scope-civil": {
    phase: "scope",
    slice: "Organisation-scoped WA filters — Civil",
    behaviour:
      "Offer only organisation-assigned services and submit the selected location query.",
    services: "Civil",
    jurisdiction: "CIVIL",
    caseType: "Not case-specific",
    lane: "Actual EXUI Node + Angular",
    limits:
      "Synthetic role assignments and provider responses; checks the filter and request composition.",
  },
  "ccd-nested-roundtrip": {
    phase: "ccd",
    slice: "Nested recipients and Check your answers",
    behaviour:
      "Preserve nested email recipients through empty/non-empty forms, add/remove, Change/Previous and real CCD submission/readback.",
    services: "Private Law source-shaped fixture",
    jurisdiction: "HARNESS (actual synthetic jurisdiction)",
    caseType: "HarnessNestedPRL (actual synthetic case type)",
    lane: "Actual EXUI + isolated CCD",
    limits:
      "Selected entry/CYA accessibility checks only. No deployed PRL case, business callback, reorder or full accessibility parity claim.",
  },
  "ccd-role-policy": {
    phase: "ccd",
    slice: "Case access and denied-write integrity",
    behaviour:
      "Deny protected case reads and writes, with independent authorised state/version/history observations.",
    services: "Shared CCD policy fixture",
    jurisdiction: "HARNESS (actual synthetic jurisdiction)",
    caseType: "HarnessNestedPRL (actual synthetic case type)",
    lane: "Actual EXUI + isolated CCD",
    limits:
      "Real CCD RBAC with synthetic identity. No ABAC or production persona claim.",
  },
  "ccd-role-revocation": {
    phase: "ccd",
    slice: "Same-actor role removal",
    behaviour:
      "Remove a previously granted role, renew the same actor's synthetic session, and deny subsequent access and writes.",
    services: "Shared CCD policy fixture",
    jurisdiction: "HARNESS (actual synthetic jurisdiction)",
    caseType: "HarnessNestedPRL (actual synthetic case type)",
    lane: "Actual EXUI + isolated CCD",
    limits:
      "Fresh bearer/session after observed role removal. Does not claim immediate revocation of an old cached bearer or real OIDC login.",
  },
  "ccd-postal-two-roundtrip": {
    phase: "ccd",
    slice: "Two postal recipients",
    behaviour:
      "Require postcode entry in lookup mode, then preserve both manual postal addresses through Check your answers and CCD submission/readback.",
    services: "Private Law source-shaped fixture",
    jurisdiction: "HARNESS (actual synthetic jurisdiction)",
    caseType: "HarnessNestedPRL (actual synthetic case type)",
    lane: "Actual EXUI + isolated CCD",
    limits:
      "A validation failure blocks later navigation/persistence credit. No deployed PRL or full profile claim.",
  },
  "ccd-prl-workbasket-inputs": {
    phase: "ccd",
    slice: "Private Law Work Basket inputs",
    behaviour: "Render all 10 pinned PRL input rows, including dependent courts, through EXUI and the CCD V2 descriptor.",
    services: "Private Law source rows",
    jurisdiction: "HARNESS (isolated CCD)",
    caseType: "HarnessResultsPRL (synthetic case type)",
    lane: "Actual EXUI + isolated CCD",
    limits: "Source rows on a synthetic case type; no deployed PRL profile or search-result claim.",
  },
};
proofs["ccd-courtadmin-update-recipient-shapes"] = {
  phase: "eventCapability",
  slice: "Court administrator — email/post, one/two recipients",
  behaviour:
    "Enter all four recipient shapes, preserve their values through Check your answers and Change, then submit and independently read exact values and history from CCD.",
  services: "Private Law source-shaped fixture",
  jurisdiction: "HARNESS (actual synthetic jurisdiction)",
  caseType: "HarnessNestedPRL (actual synthetic case type)",
  lane: "Actual EXUI + isolated CCD",
  limits:
    "Literal source role caseworker-privatelaw-courtadmin with synthetic identity; source-shaped serviceOfDocuments event in JUDICIAL_REVIEW. No deployed PRL, Access Management, ABAC, OIDC or CSRF credit.",
};
proofs["ccd-courtadmin-read-recipient-shapes"] = {
  phase: "eventCapability",
  slice: "Court administrator — read email/post, one/two recipients",
  behaviour: "Read all four seeded email/post and one/two-recipient shapes through the candidate case view; verify every recipient and independently confirm unchanged CCD data and history.",
  services: "Private Law source-shaped fixture",
  jurisdiction: "HARNESS (actual synthetic jurisdiction)",
  caseType: "HarnessNestedPRL (actual synthetic case type)",
  lane: "Actual EXUI + isolated CCD",
  limits: "Literal source courtadmin role. The deliberate fault removes only recipient-field read permission in a fresh CCD import. No deployed PRL or production authorisation claim.",
};
proofs["ccd-readonly-read-recipient-shapes"] = {
  phase: "eventCapability",
  slice: "Read-only source role — email/post, one/two recipients",
  behaviour: "Read every recipient value and postal address through the candidate case view, with independent unchanged CCD state and history checks.",
  services: "Private Law source-shaped fixture",
  jurisdiction: "HARNESS (actual synthetic jurisdiction)",
  caseType: "HarnessNestedPRL (actual synthetic case type)",
  lane: "Actual EXUI + isolated CCD",
  limits: "Literal source readonly role with R type/state/event/field ACLs. A fresh import removes only recipient-field R; every shape must disappear. No deployed PRL or update-denial credit.",
};
proofs["ccd-readonly-update-recipient-shapes-denied"] = {
  phase: "eventCapability",
  slice: "Read-only update denial — email/post, one/two recipients",
  behaviour: "Read every recipient and control value, reject event start and update submission, and independently verify unchanged CCD data and history for all four shapes.",
  services: "Private Law source-shaped fixture",
  jurisdiction: "HARNESS (actual synthetic jurisdiction)",
  caseType: "HarnessNestedPRL (actual synthetic case type)",
  lane: "Actual EXUI + isolated CCD",
  limits: "Literal source readonly role. A fresh fault adds only type/state/recipient-field U and event C; every shape must persist its intended edit before the denial oracle fails. No deployed PRL authorisation claim.",
};
for (const [id,slice,behaviour] of [
  ['case-field-recipient-selector','Additional recipient field — source label','Select an additional recipient, persist the choice and verify the source-defined label on the case view.'],
  ['required-delivery-radio','Delivery method — required selection','Show Served by, reject an omitted method, then persist a selected email recipient.'],
  ['conditional-email-complex','Email details — conditional complex','Toggle email/post, verify email controls appear only for email, and persist entered recipient data.'],
  ['postal-recipient-name','Postal recipient name — source label','Show the source postal-name field for Post, submit its value and confirm CCD persistence.'],
  ['optional-postal-line-two','Postal address — optional second line','Save a blank second line, edit the same recipient to a filled second line, and verify both writes with unchanged siblings.'],
]) proofs[`ccd-source-shape-${id}`] = {
  phase:'eventCapability',slice,behaviour,services:'Private Law source-shaped fixture',
  jurisdiction:'HARNESS (actual synthetic jurisdiction)',caseType:'HarnessNestedPRL (actual synthetic case type)',
  lane:'Actual EXUI + isolated CCD',limits:id === 'case-field-recipient-selector'
    ? 'Exact imported CaseField label/type and single-label fault; candidate case view after a real CCD write. No deployed PRL or whole-profile credit.'
    : 'Exact event override context, imported label/order/condition and single-facet fault. LiveFrom is an import-only date, not a date-gated UI claim. No deployed PRL or callback credit.',
};
proofs["ccd-event-create-denied"] = {
  phase: "eventCapability",
  slice: "Readable case — event creation forbidden",
  behaviour:
    "Read the case as a judge, deny serviceOfDocuments start and submission, and independently observe unchanged data and history.",
  services: "Private Law source-shaped fixture",
  jurisdiction: "HARNESS (actual synthetic jurisdiction)",
  caseType: "HarnessNestedPRL (actual synthetic case type)",
  lane: "Actual EXUI + isolated CCD",
  limits:
    "Literal source role caseworker-privatelaw-judge with event R permission. The legacy token read remains allowed. The deliberate fault changes only that event permission to CR in a separately imported fresh namespace. No production authorisation claim.",
};
proofs["routing-create-redirect-fallback"] = {
  phase: "routing",
  slice: "PCS external create and local fallback",
  behaviour:
    "Route an external PCS create event to its configured destination; preserve local dispatch when the external destination is absent or the event is local.",
  services: "Private Law (synthetic PCS routing fixture)",
  jurisdiction: "PCS",
  caseType: "PCS (synthetic case type)",
  lane: "Actual EXUI Node + Angular with synthetic CCD providers",
  limits:
    "Uses synthetic case and provider responses. It does not prove deployed PCS profiles, environment overlays, or other decentralised service entries.",
};
proofs["routing-noc-session-cache"] = {
  phase: "routing",
  slice: "PCS NoC route by requested case",
  behaviour:
    "Resolve the NoC destination for each requested case ID and use the matching case type cached in that session; retain central fallback for unmapped cases.",
  services: "Private Law (synthetic PCS routing fixture)",
  jurisdiction: "PCS",
  caseType: "PCS and unmapped synthetic cases",
  lane: "Actual EXUI Node + Angular with synthetic CCD providers",
  limits:
    "Uses synthetic case and provider responses. It does not prove deployed PCS profiles, environment overlays, or other decentralised service entries.",
};
proofs["callback-recipient-row"] = {
  phase: "recipientCallback",
  slice: "Additional recipient callback row",
  behaviour: "Render the source-shaped recipient row, invoke its mid-event callback through real CCD, and verify all eleven bounded row facets with candidate and stored-definition evidence.",
  services: "Private Law source-shaped fixture",
  jurisdiction: "HARNESS (actual synthetic jurisdiction)",
  caseType: "HarnessNestedPRL (actual synthetic case type)",
  lane: "Actual EXUI + isolated CCD + synthetic callback responder",
  limits: "Only the named source row is covered. Callback business logic is synthetic; no production PRL behaviour, deployed service, role-policy, date activation or full release approval is established.",
};
const faults = {
  "ccd-omit-recipient-mid-event": "Omit only the recipient mid-event callback URL and observe the required binding failure",
  "ccd-remove-courtadmin-event-create": "Remove only source courtadmin event creation permission; preserve readable controls and deny writes",
  "ccd-enable-readonly-recipient-update": "Enable only the four readonly ACL permissions required for recipient updates",
  "ccd-remove-readonly-recipient-read": "Remove only the source read-only role’s recipient-field read permission",
  "ccd-remove-courtadmin-recipient-read": "Remove only the court administrator’s recipient-field read permission",
  "ccd-enable-judge-event":
    "Grant the judge create permission for the readable case’s source event",
  "wa-drop-family": "Omit Immigration and Asylum from supported WA services",
  "wa-broaden-scope": "Broaden organisation choices with case-role assignments",
  "ccd-drop-child": "Drop a nested email address on submission",
  "ccd-broaden-access": "Grant the denied actor protected-case access",
  "ccd-write-then-deny": "Persist a protected change before returning a denial",
  "ccd-stale-revoked-bearer":
    "Substitute the actor's old warmed bearer after role removal",
  "ccd-drop-postal-optional-child":
    "Drop the second postal recipient's optional address line",
  "ccd-drop-workbasket-field": "Remove the PRL case-name input from the CCD V2 descriptor",
  "routing-omit-web-url": "Omit the PCS external web destination",
  "routing-omit-noc-base-url": "Omit the PCS NoC destination",
};
Object.assign(faults, {
  'ccd-shape-case-field-recipient-selector':'Change only the imported CaseField label; prove the candidate renders the changed label after a real CCD write before the source-label oracle fails',
  'ccd-shape-required-delivery-radio':'Remove the mandatory delivery-method constraint; prove an omitted method persists before the required-method oracle fails',
  'ccd-shape-conditional-email-complex':'Change only email-complex visibility to post; prove the altered visible branch and a real write before the email-condition oracle fails',
  'ccd-shape-postal-recipient-name':'Change only the postal-name event label; prove the changed candidate label and a real CCD write before the source-label oracle fails',
  'ccd-shape-optional-postal-line-two':'Change only the second address line label; prove the changed candidate label and filled persistence before the source-label oracle fails',
});
const phaseLabels = {
  family: "WA families",
  scope: "WA organisation scope",
  ccd: "CCD data and access",
  eventCapability: "Source role and event capability",
  routing: "PCS decentralised routing",
  recipientCallback: "Recipient callback configuration",
};
const badge = (text, passed) =>
  `<span class="harness-status ${passed ? "passed" : "failed"}">${escape(text)}</span>`;
function labelFor(proofId, phase) {
  const label = proofs[proofId];
  if (!label || label.phase !== phase)
    throw new Error("PUBLIC_ODHIN_UNKNOWN_NATIVE_PROOF");
  return label;
}
function nativeCounts(evidence) {
  return {
    baselines: evidence.phases.reduce((n, p) => n + p.baselineProofs.length, 0),
    faults: evidence.phases.reduce((n, p) => n + p.faults.length, 0),
  };
}
function scopeCells(label) {
  return `<td>${escape(label.services)}<br><small>${escape(label.jurisdiction)}</small></td><td>${escape(label.caseType)}</td>`;
}
function proofDetails(label, proof, phase) {
  return `<details><summary>Evidence and limits</summary><p>${escape(label.lane)}. ${escape(label.limits)}</p><dl><dt>Proof</dt><dd>${escape(proof.proofId)}</dd><dt>Invocation</dt><dd>${escape(proof.invocationId)}</dd><dt>Phase run</dt><dd>${escape(phase.runId)}</dd><dt>Receipt digest</dt><dd>${escape(phase.receiptArtifactDigest)}</dd></dl></details>`;
}
function renderNativeEvidence(evidence) {
  if (!evidence) return "";
  if (
    evidence.kind !== "native-policy-proof-outcomes" ||
    evidence.releaseApproval !== false ||
    !["PASS", "FAIL", "BLOCKED"].includes(evidence.status)
  )
    throw new Error("PUBLIC_ODHIN_INVALID_NATIVE_EVIDENCE");
  const coverage = evidence.catalogueCoverage;
  if (
    !coverage ||
    coverage.releaseCredit !== false ||
    !Array.isArray(coverage.creditedObligationIds) ||
    new Set(coverage.creditedObligationIds).size !==
      coverage.creditedObligationIds.length ||
    ![
      coverage.selected,
      coverage.candidate,
      coverage.ccd,
      coverage.missing,
    ].every((value) => Number.isSafeInteger(value) && value >= 0) ||
    coverage.candidate + coverage.ccd !==
      coverage.creditedObligationIds.length ||
    coverage.selected - coverage.missing !==
      coverage.creditedObligationIds.length ||
    !coverage.phaseReferences ||
    coverage.creditedObligationIds.some((id) => {
      const phase =
        id === "configuration-shared:role-policy" ? "ccd" :
        id ===
        "configuration-sequence:5e3fa818f42a05cf53c18623577ef91e26ceaff4ee829692ad7cf5e305ce22ed"
          ? "ccd"
          : workbasketRows.has(id) ? "ccd"
          : ["configuration-shape:2ec5abfbce91a706d031d903e3381ea76eabe174cd71ee48f7eecbb02d57da6f","configuration-shape:69bcacf62a9db6f81914356612c4c4d770865dd287bc48704f88be54013bbe49","configuration-shape:02958e8aee4cc1376f6b6607883e90293d8d2c765b4e9796884a61e24123919e","configuration-shape:9ece0d15adfefeabf964c0905981f1343b26487ad4e68f47a9d7bcbf73aaa757","configuration-shape:0d8d6aca578c8ab32c6e2b5e794db038a1f232a15489d40fc6a58e7790b03894","configuration-cell:a6d5e8421152eca670bc39912f6781824bfc3190d2b78ed9ea7757b5f168e313",
              "configuration-cell:1413f10a8d3caf763c82b901d8cc627bb73e555ee4c57aaea5a53ef5e378bc66",
              "configuration-cell:6e8617ff5fd98ab11df8d26d96f3d420e0f4eadfe5a36b23e10095a0e2ec6bf3",
              "configuration-cell:2b80551e385239c5c2e13878ae7645cbeb938e68dda2bcabe52d1ad68046dc65",
              "configuration-cell:8c1a3f11d156a5557c5400305414da596d644a4d2378aa539753a7e9fc88d76a",
              "configuration-cell:a4563399414365b47e8e8358355038fa5a3398127584c2b821674be2525462ba",
              "configuration-cell:5e6b7152607a4c223cb1cb1c8912d4837a71fca9e27e5fd5ef3cd8f60d7096a6",
              "configuration-cell:d418df10fcef3e7a349c270d06a975ac9d1381ea428cf1fc4e955ea968680397",
              "configuration-cell:8b58b9887954abf5777c3e444bd4876fcdae07c4955880fedf50582aefb3e58a",
              "configuration-cell:fbf6c3058a52de86c9a6323bbb4428c0fe9b9faf0d72c33080b945397418f8ec",
              "configuration-cell:b0d9eefe2d358d1516cb7d564c171fd623357dcb32a90a4d8989ecf7a61e14cf",
              "configuration-cell:8d000fcc1cafb9115e2702da1907d9e6e843d9add4c9c03f8fb49d52d769f337",
              "configuration-cell:2a2bf38052f112d7dbe5982d38785085948e100327169e49300047def7a224ea",
              "configuration-cell:8c9effa57e804623271da0fc5d054a2fa69389cb8b2bb4fa179f35e75fa38a59",
              "configuration-cell:32b597279bd96db1646aaf4bfb440504a79d327907018d89d30253f6b02315de",
              "configuration-cell:f7f66f942a035e26181e64394e37d1a02fb113bff32db52c94906c1842222bbb"].includes(id)
            ? "eventCapability"
            : id ===
                "configuration-decentralisation:52f63ce0d43f0422438b698894746ce1dc0e7062288fc8a09fcfd93b84cf2f1c"
              ? "routing"
              : id === "configuration-shape:4872034ffec23e993a49315123c3a22472baf5411d8010f31d3d01644f23cd94"
                ? "recipientCallback"
            : null;
      const accepted = evidence.phases.find((item) => item.phase === phase);
      const ref = coverage.phaseReferences[phase];
      return (
        !phase ||
        accepted?.status !== "PASS" ||
        !ref ||
        ref.status !== "PASS" ||
        ref.receiptArtifactDigest !== accepted.receiptArtifactDigest ||
        ref.runId !== accepted.runId ||
        ref.releaseScopeId !== accepted.releaseScopeId
      );
    })
  )
    throw new Error("PUBLIC_ODHIN_NATIVE_CATALOGUE_MISMATCH");
  const roleCredited = coverage.creditedObligationIds.includes("configuration-shared:role-policy");
  const role = coverage.sharedRoleAdmission;
  if (roleCredited !== Boolean(role) || (role && (
    JSON.stringify(Object.keys(role).sort()) !== JSON.stringify(['boundary','candidateArtifactDigest','ccdRunId','eventObservationCount','eventRunId','obligationId','roleFacetCount','sourceBindingCount','sourceImageProofDigest','status']) ||
    role.obligationId !== "configuration-shared:role-policy" || role.boundary !== "ccd" || role.status !== "passed" ||
    role.roleFacetCount !== 25 || role.sourceBindingCount !== 25 || role.eventObservationCount !== 8 ||
    !/^sha256:[a-f0-9]{64}$/.test(role.sourceImageProofDigest) ||
    role.candidateArtifactDigest !== evidence.source.candidateArtifactDigest ||
    role.ccdRunId !== coverage.phaseReferences.ccd?.runId ||
    role.eventRunId !== coverage.phaseReferences.eventCapability?.runId ||
    evidence.phases.find(item => item.phase === 'eventCapability')?.status !== 'PASS'
  ))) throw new Error("PUBLIC_ODHIN_NATIVE_SHARED_ROLE_MISMATCH");
  if (
    JSON.stringify(evidence.phases.map((phase) => phase.phase)) !==
    JSON.stringify(Object.keys(phaseLabels))
  )
    throw new Error("PUBLIC_ODHIN_COMPLETE_NATIVE_PHASES_REQUIRED");
  const baselineIds = evidence.phases
    .flatMap((phase) => phase.baselineProofs.map((proof) => proof.proofId))
    .sort();
  const mutationIds = evidence.phases
    .flatMap((phase) => phase.faults.map((fault) => fault.mutationId))
    .sort();
  if (
    JSON.stringify(baselineIds) !==
      JSON.stringify(Object.keys(proofs).sort()) ||
    JSON.stringify(mutationIds) !== JSON.stringify(Object.keys(faults).sort())
  )
    throw new Error("PUBLIC_ODHIN_COMPLETE_NATIVE_PROOFS_REQUIRED");
  const count = nativeCounts(evidence);
  const baselineRows = [],
    faultRows = [];
  let postalBlocked = false;
  for (const phase of evidence.phases) {
    if (!phaseLabels[phase.phase])
      throw new Error("PUBLIC_ODHIN_UNKNOWN_NATIVE_PHASE");
    for (const proof of phase.baselineProofs) {
      const label = labelFor(proof.proofId, phase.phase);
      postalBlocked ||= proof.failureId === "postal-required-fields";
      baselineRows.push(
        `<tr data-native-row data-native-phase="${escape(phase.phase)}" data-native-kind="baseline"><th scope="row">${escape(label.slice)}<p>${escape(label.behaviour)}</p></th>${scopeCells(label)}<td>${badge(proof.status, proof.status === "passed")} ${proof.failureId ? `<small>Failure: ${escape(proof.failureId)}</small>` : ""}</td><td>${proofDetails(label, proof, phase)}</td></tr>`,
      );
    }
    for (const fault of phase.faults) {
      const label = labelFor(fault.baselineProofId, phase.phase);
      if (!faults[fault.mutationId])
        throw new Error("PUBLIC_ODHIN_UNKNOWN_NATIVE_FAULT");
      const observed = fault.outcome === "expected-failure-observed";
      faultRows.push(
        `<tr data-native-row data-native-phase="${escape(phase.phase)}" data-native-kind="fault"><th scope="row">${escape(label.slice)}<p>${escape(faults[fault.mutationId])}</p></th>${scopeCells(label)}<td>${badge(observed ? "Expected failure observed" : "BLOCKED — invalid witness", observed)}<p>Baseline: ${escape(fault.baselineStatus)}<br>Required failure: ${escape(fault.expectedFailureId)}<br>Observed failure: ${escape(fault.observedFailureId || "not established")}</p></td><td>${proofDetails(label, fault, phase)}</td></tr>`,
      );
    }
  }
  const table = (id, title, rows) =>
    `<section data-native-table="${id}"><h3>${title}</h3><div class="table-responsive"><table class="table harness-native-table"><thead><tr><th>Slice / tested behaviour</th><th>Service / jurisdiction</th><th>Actual case type</th><th>Result</th><th>Evidence</th></tr></thead><tbody>${rows.join("")}</tbody></table></div></section>`;
  return `<section id="harness-native-evidence" data-native-status="${escape(evidence.status)}" data-native-evidence-sha256="${objectDigest(evidence)}"><h2>Actual candidate and CCD evidence ${badge(evidence.status, evidence.status === "PASS")}</h2><p>${count.baselines} baseline proof results + ${count.faults} deliberate fault checks, counted separately from diagnostic tests. Expected failures demonstrate that a check detects a declared fault; they are not product test failures. Invalid witnesses provide no fault-detection credit.</p>${postalBlocked ? '<div class="alert alert-danger" data-native-postal-blocked><strong>Postal proof BLOCKED.</strong> The second recipient reached Check your answers with its required postcode blank. Later postal navigation/persistence and the intended postal-persistence fault check are not established.</div>' : ""}<div class="harness-filters"><label>Native slice<select data-native-filter="phase"><option value="">All native slices</option>${Object.entries(
    phaseLabels,
  )
    .map(([id, label]) => `<option value="${id}">${label}</option>`)
    .join(
      "",
    )}</select></label><label>Evidence kind<select data-native-filter="kind"><option value="">Baseline and deliberate faults</option><option value="baseline">Baseline proofs</option><option value="fault">Deliberate fault checks</option></select></label></div><p data-native-count role="status">${count.baselines} baseline results and ${count.faults} deliberate fault checks</p>${table("baseline", "Baseline proofs", baselineRows)}${table("fault", "Deliberate fault checks", faultRows)}<details class="harness-native-identity"><summary>Native run and source identity</summary><dl><dt>Job run</dt><dd>${escape(evidence.jobRunId)}</dd><dt>Harness producer commit</dt><dd>${escape(evidence.source.harnessCommit)}</dd><dt>Harness source digest</dt><dd>${escape(evidence.source.harnessSourceDigest)}</dd><dt>EXUI source commit</dt><dd>${escape(evidence.source.webappCommit)}</dd><dt>Candidate artifact digest</dt><dd>${escape(evidence.source.candidateArtifactDigest)}</dd><dt>Explicit evidence descriptor digest</dt><dd>${escape(evidence.descriptorDigest)}</dd></dl><p>Validated from the supplied independent expectations, private raw reports, receipts and process finalization. This is a separate execution from the diagnostic tests. No timing, live deployment identity, full profile coverage or release approval is inferred.</p></details></section>`;
}
module.exports = { renderNativeEvidence, nativeCounts, objectDigest };
