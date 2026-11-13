import assert from "node:assert/strict";
import fs from "node:fs";
import { definitionDigest } from "./exui-definition-references.mjs";
import { digestBytes } from "./exui-evidence-io.mjs";
import { deriveRecipientCallbackImport } from "./exui-recipient-callback-fixture.mjs";
// Independent fixed expectations: never call the new derivation as the oracle.
const sourcePath =
  "definitions/private-law/json/CaseEventToComplexTypes/ServiceOfDocuments/AdditionalRecipients/CaseEventToComplexTypes.json";
const revision = "694b9951e94369f1394380506960c4f04f25755d";
const fileDigest =
  "sha256:74d798a7a4898843685274d5b92b35e74bdda339a1bb478d81b17a006bd55f59";
const snapshotDigest =
  "sha256:bac7cb15710a95c026b5da9710c4d4543b178365ece7faa4d2ed90dc346818ab";
const carrierDigest =
  "sha256:1f5d8d953cc913eef4ecfe9e36a82f08924f6245bac4852bb1d408dfbbd600e0";
const targets = [
  {
    id: "name",
    sourceIndex: 14,
    reference: "emailInformation.emailName",
    order: "3",
    obligationId:
      "configuration-shape:d0189498d796f462bbd150341384aaf1743ec24491af04fc5176dc8e7e72439e",
    sourceRowDigest:
      "sha256:15be218a2ec9b5e16174ad6b350558a2f777ff9f2776ce6541cc5889624bd4b4",
  },
  {
    id: "address",
    sourceIndex: 13,
    reference: "emailInformation.emailAddress",
    order: "4",
    obligationId:
      "configuration-shape:afb8b838dc9de1bb8314cbf494ff26a987aa3edb845b2fa0a45c378834d2b74d",
    sourceRowDigest:
      "sha256:84fc6347ddd5f5250fa841380bf5329337ce5b70c864926e2c3d11515cfcec3d",
  },
];
const dispositions = {
  LiveFrom: "typed-date-retention-not-activation",
  CaseTypeID: "explicit-case-type-normalization",
  ID: "exact-complex-type",
  CaseEventID: "exact-event",
  CaseFieldID: "exact-parent-collection",
  ListElementCode: "exact-nested-control-and-persisted-leaf",
  FieldShowCondition: "email-active-post-inactive",
  EventElementLabel: "blank-override-and-underlying-label-fallback",
  FieldDisplayOrder: "retained-order-and-relative-render-order",
  DisplayContext: "required-empty-denial-filled-save-and-optional-fault",
};
const original = (t) => ({
  LiveFrom: "01/09/2024",
  CaseTypeID: "PRLAPPS",
  ID: "ServeOrgDetails",
  CaseEventID: "serviceOfDocuments",
  CaseFieldID: "sodAdditionalRecipientsList",
  ListElementCode: t.reference,
  FieldShowCondition: 'sodAdditionalRecipientsList.serveByPostOrEmail="email"',
  EventElementLabel: " ",
  FieldDisplayOrder: t.order,
  DisplayContext: "MANDATORY",
});
function source() {
  const bytes = fs.readFileSync(
    new URL(
      "../fixtures/ccd/mandatory-email-event-rows.source.json",
      import.meta.url,
    ),
  );
  assert.equal(
    digestBytes(bytes),
    snapshotDigest,
    "MANDATORY_EMAIL_READER_SOURCE_BYTES",
  );
  const s = JSON.parse(bytes);
  assert.deepEqual(
    s,
    {
      schemaVersion: 1,
      repository: "hmcts/prl-ccd-definitions",
      revision,
      sources: [
        {
          path: sourcePath,
          fileDigest,
          rows: [targets[1], targets[0]].map((t) => ({
            index: t.sourceIndex,
            rowDigest: t.sourceRowDigest,
            row: original(t),
          })),
        },
      ],
    },
    "MANDATORY_EMAIL_READER_SOURCE",
  );
  const catalogue = JSON.parse(
    fs.readFileSync(
      new URL("../fixtures/exui-configuration-source.json", import.meta.url),
    ),
  );
  const selected = catalogue.sources.filter(
    (s) => s.repository === "prl-ccd-definitions" && s.path === sourcePath,
  );
  assert.equal(selected.length, 1, "MANDATORY_EMAIL_READER_CATALOGUE");
  assert.deepEqual(
    [selected[0].revision, "sha256:" + selected[0].fileDigest],
    [revision, fileDigest],
    "MANDATORY_EMAIL_READER_REVISION",
  );
  for (const t of targets) {
    assert.deepEqual(
      selected[0].document[t.sourceIndex],
      original(t),
      "MANDATORY_EMAIL_READER_SOURCE_ROW",
    );
    assert.equal(
      definitionDigest(original(t)),
      t.sourceRowDigest,
      "MANDATORY_EMAIL_READER_ROW_DIGEST",
    );
    assert.equal(
      "configuration-shape:" +
        definitionDigest({
          source: "prl-ccd-definitions:" + sourcePath,
          row: original(t),
        }).slice(7),
      t.obligationId,
      "MANDATORY_EMAIL_READER_CATALOGUE_ID",
    );
  }
}
function expected(variant) {
  assert(
    ["baseline", "name-optional", "address-optional"].includes(variant),
    "MANDATORY_EMAIL_READER_VARIANT",
  );
  source();
  const fixture = deriveRecipientCallbackImport(
    "binding-omitted",
    true,
  ).fixture;
  assert.equal(
    definitionDigest(fixture),
    carrierDigest,
    "MANDATORY_EMAIL_READER_CARRIER",
  );
  const rows = targets.map((t) => {
    const sourceRow = original(t),
      matches = fixture.sheets.EventToComplexTypes.filter(
        (r) =>
          r.CaseEventID === "serviceOfDocuments" &&
          r.CaseFieldID === "sodAdditionalRecipientsList" &&
          r.ListElementCode === t.reference,
      );
    assert.equal(matches.length, 1, "MANDATORY_EMAIL_READER_CONTEXT");
    assert.deepEqual(
      matches[0],
      { ...sourceRow, CaseTypeID: "HarnessNestedPRL" },
      "MANDATORY_EMAIL_READER_NORMALIZATION",
    );
    if (variant === t.id + "-optional") matches[0].DisplayContext = "OPTIONAL";
    return {
      id: t.id,
      obligationId: t.obligationId,
      sourceIndex: t.sourceIndex,
      sourceRowDigest: t.sourceRowDigest,
      sourceRow,
      normalizedRow: structuredClone(matches[0]),
      proofId: "ccd-event-required-email-" + t.id,
      mutantProofId: "ccd-event-optional-email-" + t.id,
      mutationId: "ccd-event-email-" + t.id + "-optional",
      failureId: "source-email-" + t.id + "-required",
      facets: Object.keys(sourceRow).map((attribute) => ({
        attribute,
        sourceValue: sourceRow[attribute],
        normalizedValue: matches[0][attribute],
        disposition: dispositions[attribute],
      })),
    };
  });
  const t = targets.find((t) => variant === t.id + "-optional");
  return {
    fixture,
    binding: {
      schemaVersion: 1,
      kind: "mandatory-email-event-row-source-binding",
      variant,
      sourceRepository: "hmcts/prl-ccd-definitions",
      sourceRevision: revision,
      sourcePath,
      sourceFileDigest: fileDigest,
      sourceSnapshotDigest: snapshotDigest,
      sourceCaseType: "PRLAPPS",
      caseType: "HarnessNestedPRL",
      carrierDigest,
      fixtureDigest: definitionDigest(fixture),
      rows,
      scaffold: {
        callback: "omitted-in-all-variants-no-business-callback-claim",
        predecessor: "synthetic-protectedValue-readonly-page1",
        grants: "unchanged-canonical-carrier-no-new-source-role-claim",
        types:
          "unchanged-carrier-ServeOrgDetails-and-EmailInformation-no-extra-row-credit",
      },
      mutation: t
        ? {
            rowId: t.id,
            column: "DisplayContext",
            before: "MANDATORY",
            after: "OPTIONAL",
          }
        : null,
      sourceComplete: false,
      runtimeAcceptance: false,
      catalogueCredit: false,
      releaseCredit: false,
      activationClaim: false,
    },
  };
}
export function validateMandatoryEmailEventDerivation(
  value,
  variant = "baseline",
) {
  assert.deepEqual(
    value,
    expected(variant),
    "MANDATORY_EMAIL_CANONICAL_DERIVATION",
  );
  return {
    kind: "mandatory-email-event-source-derivation-validated",
    variant,
    sourceComplete: false,
    runtimeAcceptance: false,
    catalogueCredit: false,
    releaseCredit: false,
  };
}
export function validateMandatoryEmailEventFaultPair(
  baseline,
  mutant,
  variant,
) {
  assert(
    ["name-optional", "address-optional"].includes(variant),
    "MANDATORY_EMAIL_FAULT_VARIANT",
  );
  validateMandatoryEmailEventDerivation(baseline, "baseline");
  validateMandatoryEmailEventDerivation(mutant, variant);
  const t = targets.find((t) => variant === t.id + "-optional"),
    fixture = structuredClone(baseline.fixture),
    rows = fixture.sheets.EventToComplexTypes.filter(
      (r) =>
        r.CaseEventID === "serviceOfDocuments" &&
        r.CaseFieldID === "sodAdditionalRecipientsList" &&
        r.ListElementCode === t.reference,
    );
  assert.equal(rows.length, 1, "MANDATORY_EMAIL_FAULT_CONTEXT");
  rows[0].DisplayContext = "OPTIONAL";
  assert.deepEqual(mutant.fixture, fixture, "MANDATORY_EMAIL_ONE_CELL_FAULT");
  return {
    kind: "mandatory-email-event-source-fault-validated",
    variant,
    changedSourceCells: 1,
    obligationId: t.obligationId,
    sourceComplete: false,
    runtimeAcceptance: false,
    catalogueCredit: false,
    releaseCredit: false,
  };
}
// Same typed DATE/version/identity semantics as exui-source-shape-dates.mjs;
// this is a pure validator for the two NEW rows, not a database/runtime reader.
export function validateMandatoryEmailEventDates(rows, version) {
  assert(
    Number.isSafeInteger(version) && version > 0,
    "MANDATORY_EMAIL_DATE_VERSION",
  );
  source();
  assert.deepEqual(
    rows,
    [targets[1], targets[0]].map((t) => ({
      case_type: "HarnessNestedPRL",
      version,
      event: "serviceOfDocuments",
      field: "sodAdditionalRecipientsList",
      reference: t.reference,
      live_from: "2024-09-01",
      sql_type: "date",
    })),
    "MANDATORY_EMAIL_STORED_DATES",
  );
  return {
    kind: "mandatory-email-event-dates-validated",
    definitionVersion: version,
    sourceComplete: false,
    runtimeAcceptance: false,
    catalogueCredit: false,
    releaseCredit: false,
    activationClaim: false,
  };
}
