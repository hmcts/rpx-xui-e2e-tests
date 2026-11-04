import assert from "node:assert/strict";
import fs from "node:fs";
import { definitionDigest } from "./exui-definition-references.mjs";

const sourceDigest = "sha256:6e36db1ac7090ee2aaeeaaab48d3be006741984139e2c52ada00255a30f8e770";
const revision = "694b9951e94369f1394380506960c4f04f25755d";
const prefix = "definitions/private-law/json/";
const sourcePaths = ["SearchResultFields.json", "WorkBasketResultFields.json", "CaseField/CaseField.json"];
const target = "HarnessResultsPRL";
const readSource = () => JSON.parse(fs.readFileSync(new URL("../fixtures/ccd/result-columns.source.json", import.meta.url), "utf8"));

// This fixture preserves metadata for later candidate proofs; it cannot award execution credit.
export function buildResultColumnFixture(source = readSource()) {
  assert.equal(definitionDigest(source), sourceDigest, "RESULT_COLUMN_SOURCE_DRIFT");
  assert.equal(source.repository, "hmcts/prl-ccd-definitions", "RESULT_COLUMN_SOURCE_DRIFT");
  assert.equal(source.revision, revision, "RESULT_COLUMN_SOURCE_DRIFT");
  assert.deepEqual(source.sources.map(item => item.path), sourcePaths.map(name => prefix + name), "RESULT_COLUMN_SOURCE_DRIFT");
  for (const item of source.sources) for (const selected of item.rows) {
    assert.equal(definitionDigest(selected.row), selected.rowDigest, "RESULT_COLUMN_SOURCE_DRIFT");
    assert.equal(selected.row.CaseTypeID, "PRLAPPS", "RESULT_COLUMN_SOURCE_DRIFT");
  }
  const [search, workbasket, fields] = source.sources;
  const fieldIds = fields.rows.map(item => item.row.ID);
  assert.equal(new Set(fieldIds).size, fieldIds.length, "RESULT_COLUMN_DEPENDENCY_AMBIGUOUS");
  const metadata = ["[CREATED_DATE]", "[STATE]"];
  const bindings = [search, workbasket].flatMap(item => item.rows.map(selected => {
    const field = selected.row.CaseFieldID;
    assert(fieldIds.includes(field) || metadata.includes(field), "RESULT_COLUMN_DEPENDENCY_MISSING");
    return {
      obligationId: "configuration-shape:" + definitionDigest({ source: "prl-ccd-definitions:" + item.path, row: selected.row }).slice(7),
      sourcePath: item.path, sourceIndex: selected.index, rowDigest: selected.rowDigest,
      field, fieldDependency: fields.rows.find(candidate => candidate.row.ID === field)?.rowDigest ?? null,
    };
  }));
  const normalize = item => item.rows.map(selected => ({ ...structuredClone(selected.row), CaseTypeID: target }));
  return {
    schemaVersion: 1,
    kind: "source-bound-result-column-fixture",
    runtimeAcceptance: false, catalogueCredit: false, releaseCredit: false,
    source: { repository: source.repository, revision, projectionDigest: sourceDigest, dependencyTree: source.dependencyTree },
    sourceCaseType: "PRLAPPS", caseType: target,
    sheets: { SearchResultFields: normalize(search), WorkBasketResultFields: normalize(workbasket), CaseField: normalize(fields) },
    bindings,
    gaps: metadata.map(field => ({ field, kind: "ccd-runtime-metadata-required", fieldType: null })),
    exclusions: [
      "Only CaseTypeID is normalized; source labels including whitespace, ordering, field IDs and types remain unchanged.",
      "The two CCD metadata fields have no PRL CaseField definitions; actual runtime descriptors and formatting must be observed before acceptance.",
      "No CCD workbook, import, ACL, case data or application execution is supplied by this fixture.",
      "Searchability, security classification, live dates, date/time zone formatting and ResultsOrdering are preserved source data, not runtime-proven behavior.",
      "No column, row binding or passing fixture validator awards catalogue or release credit.",
    ],
  };
}

export function validateResultColumnFixture(fixture, source = readSource()) {
  assert.deepEqual(fixture, buildResultColumnFixture(source), "RESULT_COLUMN_FIXTURE_DRIFT");
}
