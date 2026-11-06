import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ccdCredentials, ccdRequest, verifyCcdContainerIdentity } from "./exui-ccd-runtime.mjs";
import { prepareResultColumnDefinition } from "../prepare-harness-result-columns.mjs";
import { validateApplicantResultDefinition } from "./exui-applicant-results.mjs";

const fixtureRoot = fileURLToPath(new URL("../fixtures/ccd/result-columns-import/", import.meta.url));
const caseType = "HarnessResultsPRL", alias = "harnessresultsprl_cases";
// Descriptor route/schema reference: hmcts/ccd-definition-store-api
// c37c9b84e556f22086f1eed7b94468302870eb9e, DisplayApiController,
// SearchResultDefinition/SearchResultsField, WorkBasketResult/WorkBasketResultField.
// This reference is not bound to the retained image; unknown schema fails explicitly.
// DefinitionDataItem.getString at the same source reference calls Apache
// StringUtils.trim -> Java String.trim (only leading/trailing codepoints <= U+0020).
// Real import ONZW8P independently observed the CREATED_DATE trailing-space removal.
// Normalize the expected descriptor only; retained source/workbook bytes stay exact.
const importedLabel = value => value.replace(/^[\u0000-\u0020]+|[\u0000-\u0020]+$/g, "");
export function validateResultDescriptors(definition, observed) {
  assert.equal(observed.definition?.id, caseType, "RESULT_IMPORT_CASE_TYPE");
  assert(Number.isInteger(observed.definition?.version?.number), "RESULT_IMPORT_VERSION_SCHEMA");
  assert(Array.isArray(observed.definition.case_fields), "RESULT_IMPORT_FIELD_SCHEMA");
  for (const field of definition.sheets.CaseField) {
    const matches = observed.definition.case_fields.filter(item => item.id === field.ID);
    assert.equal(matches.length, 1, "RESULT_IMPORT_FIELD_MISSING");
    assert.equal(matches[0].field_type?.id, field.FieldType, "RESULT_IMPORT_FIELD_TYPE");
  }
  for (const [name, sheet] of [["search", "SearchResultFields"], ["workbasket", "WorkBasketResultFields"]]) {
    const value = observed[name];
    assert.equal(value?.case_type_id, caseType, "RESULT_IMPORT_LAYOUT_CASE_TYPE");
    assert(Array.isArray(value.fields), "RESULT_IMPORT_LAYOUT_SCHEMA");
    assert.equal(value.fields.length, definition.sheets[sheet].length, "RESULT_IMPORT_COLUMN_COUNT");
    for (const row of definition.sheets[sheet]) {
      const matches = value.fields.filter(field => field.case_field_id === row.CaseFieldID);
      assert.equal(matches.length, 1, "RESULT_IMPORT_COLUMN_BINDING");
      const field = matches[0];
      assert.equal(field.label, importedLabel(row.Label), "RESULT_IMPORT_COLUMN_LABEL");
      assert.equal(field.order, row.DisplayOrder, "RESULT_IMPORT_COLUMN_ORDER");
      assert.equal(field.metadata, row.CaseFieldID.startsWith("["), "RESULT_IMPORT_COLUMN_METADATA");
      if (row.ResultsOrdering) assert.deepEqual(field.sort_order, { direction: "DESC", priority: 1 }, "RESULT_IMPORT_COLUMN_SORT");
      else assert(field.sort_order == null, "RESULT_IMPORT_UNEXPECTED_SORT");
    }
  }
}

// Feasibility only: never changes runtime.caseType/definitionImported or issues a gate receipt.
export async function importResultColumns(state, { fixtureDirectory = fixtureRoot, variant="baseline", request = ccdRequest, inspectContainer } = {}) {
  const temporary = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "result-import-seal-"));
  let definition, binding, workbook;
  try {
    const canonical = path.join(temporary, "canonical");
    await prepareResultColumnDefinition(canonical,{variant});
    for (const file of ["definition.json", "definition.xlsx", "binding.json"])
      assert.deepEqual(fs.readFileSync(path.join(fixtureDirectory, file)), fs.readFileSync(path.join(canonical, file)), "RESULT_IMPORT_SEAL_MISMATCH");
    definition = JSON.parse(fs.readFileSync(path.join(fixtureDirectory, "definition.json")));
    validateApplicantResultDefinition(definition,variant);
    binding = JSON.parse(fs.readFileSync(path.join(fixtureDirectory, "binding.json")));
    workbook = fs.readFileSync(path.join(fixtureDirectory, "definition.xlsx"));
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
  assert.equal(state.elasticsearch, true, "RESULT_IMPORT_REAL_ES_REQUIRED");
  verifyCcdContainerIdentity(state, inspectContainer);
  const output = path.join(state.output, "result-columns-import");
  fs.mkdirSync(output, { mode: 0o700 }); // Refuse replay/overwrite before any import side effect.
  const receipt = { schemaVersion: 1, kind: "result-columns-import-feasibility", caseType, alias, variant,
    binding, owner: state.owner, namespace: state.namespace, images: state.images,
    descriptorNormalizations: ["SearchResultFields", "WorkBasketResultFields"].flatMap(sheet => definition.sheets[sheet]
      .filter(row => importedLabel(row.Label) !== row.Label)
      .map(row => ({ sheet, field: row.CaseFieldID, attribute: "Label", sourceValue: row.Label, descriptorValue: importedLabel(row.Label), rule: "CCD DefinitionDataItem.getString / StringUtils.trim (U+0000 through U+0020 edges)" }))),
    runtimeAcceptance: false, catalogueCredit: false, releaseCredit: false, status: "in-progress", observations: {} };
  const persist = () => fs.writeFileSync(path.join(output, "receipt.json"), JSON.stringify(receipt, null, 2) + "\n", { mode: 0o600 });
  persist();
  try {
    const observer = ccdCredentials(state, "observer", { request });
    for (const role of ["caseworker", "caseworker-harness", "ccd-import"]) {
      const response = request(state, 4451, "/api/user-role", { method: "PUT", headers: observer.headers, body: { role, security_classification: "PUBLIC" } });
      assert([200, 201, 205].includes(response.status), "RESULT_IMPORT_ROLE_FAILED");
    }
    receipt.observations.import = request(state, 4451, "/import", { method: "POST", headers: observer.headers, file: workbook.toString("base64") });
    persist();
    assert([200, 201].includes(receipt.observations.import.status), "RESULT_IMPORT_REJECTED");
    for (const [name, port, route] of [
      ["definition", 4451, `/api/data/case-type/${caseType}`],
      ["search", 4451, `/api/display/search-result-definition/${caseType}`],
      ["workbasket", 4451, `/api/display/work-basket-definition/${caseType}`],
      ["alias", 9200, `/_alias/${alias}`],
      ["mapping", 9200, `/${alias}/_mapping`],
    ]) {
      receipt.observations[name] = request(state, port, route, port === 4451 ? { headers: observer.headers } : {});
      persist();
      assert.equal(receipt.observations[name].status, 200, "RESULT_IMPORT_READBACK_FAILED");
    }
    const observed = Object.fromEntries(Object.entries(receipt.observations).map(([name, value]) => [name, value.body]));
    validateResultDescriptors(definition, observed);
    const indices = Object.keys(observed.alias ?? {});
    assert(indices.length > 0 && indices.every(index => Object.hasOwn(observed.alias[index].aliases ?? {}, alias)), "RESULT_IMPORT_ALIAS_SCHEMA");
    assert.deepEqual(Object.keys(observed.mapping).sort(), indices.sort(), "RESULT_IMPORT_MAPPING_INDICES");
    assert(indices.every(index => observed.mapping[index]?.mappings?.properties && typeof observed.mapping[index].mappings.properties === "object"), "RESULT_IMPORT_MAPPING_SCHEMA");
    receipt.status = "import-and-readback-observed";
    receipt.unresolved = ["Actual metadata renderer descriptors", "LiveFrom and Searchable consumer semantics", "Candidate table/search behavior and per-row material facets", "CCD source reference to runtime image binding"];
    persist();
    return receipt;
  } catch (error) {
    receipt.status = "failed";
    // Keep raw transport observations private, but never serialize thrown request/credential details.
    receipt.failure = "RESULT_IMPORT_FEASIBILITY_FAILED";
    persist();
    throw error;
  }
}
