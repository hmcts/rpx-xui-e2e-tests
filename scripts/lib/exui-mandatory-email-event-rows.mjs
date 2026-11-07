import assert from "node:assert/strict";
import fs from "node:fs";
import { definitionDigest } from "./exui-definition-references.mjs";
import { digestBytes } from "./exui-evidence-io.mjs";
import { deriveRecipientCallbackImport } from "./exui-recipient-callback-fixture.mjs";

export const MANDATORY_EMAIL_EVENT_VARIANTS = Object.freeze([
  "baseline",
  "name-optional",
  "address-optional",
]);
const sourcePath =
  "definitions/private-law/json/CaseEventToComplexTypes/ServiceOfDocuments/AdditionalRecipients/CaseEventToComplexTypes.json";
const sourceRevision = "694b9951e94369f1394380506960c4f04f25755d";
const sourceFileDigest =
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
const disposition = {
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
const noCredit = () => ({
  sourceComplete: false,
  runtimeAcceptance: false,
  catalogueCredit: false,
  releaseCredit: false,
  activationClaim: false,
});
const rowFor = (t) => ({
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
    "MANDATORY_EMAIL_SOURCE_BYTES",
  );
  const value = JSON.parse(bytes);
  assert.deepEqual(
    [
      value.schemaVersion,
      value.repository,
      value.revision,
      value.sources.length,
    ],
    [1, "hmcts/prl-ccd-definitions", sourceRevision, 1],
    "MANDATORY_EMAIL_SOURCE_IDENTITY",
  );
  const file = value.sources[0];
  assert.deepEqual(
    [file.path, file.fileDigest],
    [sourcePath, sourceFileDigest],
    "MANDATORY_EMAIL_SOURCE_FILE",
  );
  assert.equal(file.rows.length, 2, "MANDATORY_EMAIL_SOURCE_ROWS");
  const catalogue = JSON.parse(
    fs.readFileSync(
      new URL("../fixtures/exui-configuration-source.json", import.meta.url),
    ),
  );
  const files = catalogue.sources.filter(
    (s) => s.repository === "prl-ccd-definitions" && s.path === sourcePath,
  );
  assert.equal(files.length, 1, "MANDATORY_EMAIL_CATALOGUE_FILE");
  assert.deepEqual(
    [files[0].revision, "sha256:" + files[0].fileDigest],
    [sourceRevision, sourceFileDigest],
    "MANDATORY_EMAIL_CATALOGUE_SOURCE",
  );
  for (const t of targets) {
    const selected = file.rows.filter((r) => r.index === t.sourceIndex);
    assert.equal(selected.length, 1, "MANDATORY_EMAIL_SOURCE_INDEX");
    assert.deepEqual(
      selected[0],
      { index: t.sourceIndex, rowDigest: t.sourceRowDigest, row: rowFor(t) },
      "MANDATORY_EMAIL_SOURCE_ROW",
    );
    assert.equal(
      definitionDigest(selected[0].row),
      t.sourceRowDigest,
      "MANDATORY_EMAIL_SOURCE_ROW_DIGEST",
    );
    assert.deepEqual(
      files[0].document[t.sourceIndex],
      rowFor(t),
      "MANDATORY_EMAIL_CATALOGUE_ROW",
    );
    assert.equal(
      "configuration-shape:" +
        definitionDigest({
          source: "prl-ccd-definitions:" + sourcePath,
          row: rowFor(t),
        }).slice(7),
      t.obligationId,
      "MANDATORY_EMAIL_CATALOGUE_ID",
    );
  }
  return value;
}
export function deriveMandatoryEmailEventRows(variant = "baseline") {
  assert(
    MANDATORY_EMAIL_EVENT_VARIANTS.includes(variant),
    "MANDATORY_EMAIL_VARIANT",
  );
  source();
  const fixture = deriveRecipientCallbackImport(
    "binding-omitted",
    true,
  ).fixture;
  assert.equal(
    definitionDigest(fixture),
    carrierDigest,
    "MANDATORY_EMAIL_CARRIER_DRIFT",
  );
  const rows = targets.map((t) => {
    const raw = rowFor(t),
      matches = fixture.sheets.EventToComplexTypes.filter(
        (r) =>
          r.CaseEventID === raw.CaseEventID &&
          r.CaseFieldID === raw.CaseFieldID &&
          r.ListElementCode === raw.ListElementCode,
      );
    assert.equal(matches.length, 1, "MANDATORY_EMAIL_CARRIER_ROW");
    assert.deepEqual(
      matches[0],
      { ...raw, CaseTypeID: "HarnessNestedPRL" },
      "MANDATORY_EMAIL_NORMALIZATION",
    );
    if (variant === t.id + "-optional") matches[0].DisplayContext = "OPTIONAL";
    return {
      id: t.id,
      obligationId: t.obligationId,
      sourceIndex: t.sourceIndex,
      sourceRowDigest: t.sourceRowDigest,
      sourceRow: raw,
      normalizedRow: structuredClone(matches[0]),
      proofId: "ccd-event-required-email-" + t.id,
      mutantProofId: "ccd-event-optional-email-" + t.id,
      mutationId: "ccd-event-email-" + t.id + "-optional",
      failureId: "source-email-" + t.id + "-required",
      facets: Object.keys(raw).map((attribute) => ({
        attribute,
        sourceValue: raw[attribute],
        normalizedValue: matches[0][attribute],
        disposition: disposition[attribute],
      })),
    };
  });
  const selected = targets.find((t) => variant === t.id + "-optional");
  return {
    fixture,
    binding: {
      schemaVersion: 1,
      kind: "mandatory-email-event-row-source-binding",
      variant,
      sourceRepository: "hmcts/prl-ccd-definitions",
      sourceRevision,
      sourcePath,
      sourceFileDigest,
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
      mutation: selected
        ? {
            rowId: selected.id,
            column: "DisplayContext",
            before: "MANDATORY",
            after: "OPTIONAL",
          }
        : null,
      ...noCredit(),
    },
  };
}
