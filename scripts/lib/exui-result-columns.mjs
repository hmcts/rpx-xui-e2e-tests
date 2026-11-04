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

// A proof specification, not execution evidence. A future trusted runtime adapter must
// bind observations and effective faults to every facet before accepting a whole row.
export function buildResultColumnFacetContract(fixture = buildResultColumnFixture()) {
  validateResultColumnFixture(fixture);
  const attributeProofs = {
    LiveFrom: { boundary: "ccd", semantics: "unresolved-consumer", proof: "Verify the actual imported live date and establish its supported import/version/runtime consumer from image-bound implementation or controlled import observations before choosing an effect oracle. No future-date removal behavior is assumed." },
    CaseTypeID: { boundary: "ccd", proof: "Imported descriptor and real search response belong to HarnessResultsPRL with the retained PRLAPPS normalization binding." },
    CaseFieldID: { boundary: "candidate+ccd", proof: "Exact real descriptor field binding and unique persisted value in the corresponding candidate column; a binding fault must be detected." },
    Label: { boundary: "candidate+ccd", proof: "Exact source label including whitespace in imported descriptor, plus intended rendered heading; a label fault must be detected." },
    DisplayOrder: { boundary: "candidate+ccd", proof: "Exact descriptor order and complete ordered candidate headings; an order fault must be detected." },
    ResultsOrdering: { boundary: "candidate+ccd", proof: "Real search results and candidate rows follow submitted timestamp descending order across three cases created in a different order; reversed ordering must be detected." },
  };
  const fieldAttributeProofs = {
    LiveFrom: "Verify the actual imported field live date; its import/version/runtime consumer semantics remain unresolved until image-bound implementation or controlled observations establish them.",
    CaseTypeID: "Resolved field belongs to the normalized case type.",
    ID: "Resolved field ID matches the result-column binding.",
    Label: "Imported field label remains source-exact; result heading uses the result-row label.",
    HintText: "Imported field hint remains source-exact; no input-hint rendering claim is made by this table slice.",
    FieldType: "Actual CCD descriptor resolves the pinned type and candidate uses its real renderer; Date and DateTime values are checked with an explicit timezone/locale contract.",
    SecurityClassification: "Actual imported classification and authorized real search projection are observed; a classification/access fault cannot silently expose the value.",
    Searchable: "Verify the actual imported searchable setting, then establish its supported consumer from image-bound implementation and actual generated mapping/query observations. No mapping inclusion, exclusion or queryability effect is assumed from the flag alone.",
  };
  const rows = fixture.bindings.map(binding => {
    const sheet = binding.sourcePath.endsWith("/SearchResultFields.json") ? "SearchResultFields" : "WorkBasketResultFields";
    const row = fixture.sheets[sheet].find(item => item.CaseFieldID === binding.field);
    assert(row, "RESULT_COLUMN_FACET_ROW_MISSING");
    for (const key of Object.keys(row)) assert(Object.hasOwn(attributeProofs, key), "RESULT_COLUMN_UNCLASSIFIED_ATTRIBUTE");
    const dependency = fixture.sheets.CaseField.find(field => field.ID === binding.field);
    if (dependency) for (const key of Object.keys(dependency)) assert(Object.hasOwn(fieldAttributeProofs, key), "RESULT_COLUMN_UNCLASSIFIED_DEPENDENCY_ATTRIBUTE");
    return {
      obligationId: binding.obligationId, sourcePath: binding.sourcePath, sourceIndex: binding.sourceIndex, rowDigest: binding.rowDigest,
      sourceFacets: Object.entries(row).map(([attribute, normalizedValue]) => ({ attribute, sourceValue: attribute === "CaseTypeID" ? fixture.sourceCaseType : normalizedValue, normalizedValue, ...attributeProofs[attribute] })),
      dependency: dependency ? {
        kind: "pinned-field", rowDigest: binding.fieldDependency,
        facets: Object.entries(dependency).map(([attribute, value]) => ({ attribute, value, proof: fieldAttributeProofs[attribute] })),
      } : {
        kind: "unresolved-ccd-metadata", field: binding.field, fieldType: null,
        proof: "Obtain the actual imported CCD descriptor and persisted metadata value; prove its real candidate rendering. Enum membership or a guessed type is insufficient.",
      },
      executionRequirements: ["Real candidate response from real CCD Elasticsearch search; no fixture response substitution.", "Each cell is associated with its exact persisted synthetic case and column, including cross-row uniqueness.", "Retained candidate/import/source identities, observations and effective applicable faults must be bound by a trusted runtime adapter."],
      status: "unproved",
    };
  });
  return { schemaVersion: 1, kind: "result-column-material-facet-contract", source: structuredClone(fixture.source), rows,
    runtimeAcceptance: false, catalogueCredit: false, releaseCredit: false,
    acceptanceRule: "Every material source facet and required dependency behavior must have trusted execution evidence. Partial or excluded material facets leave the whole obligation unsatisfied. This contract cannot grant credit.",
    exclusions: ["Input-hint rendering, production PRL deployment and index synchronization are outside this table claim; their exclusion never waives a material result-row facet."] };
}
