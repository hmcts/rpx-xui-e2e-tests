import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import {
  buildEventCapabilityFixtures,
  EVENT_CAPABILITY_SOURCE_DIGEST,
} from "./exui-ccd-event-capability.mjs";

export const RECIPIENT_CALLBACK_PATH =
  "/service-of-documents/validate-additional-recipients";
const sourcePath =
  "definitions/private-law/json/CaseEventToFields/ServiceOfDocuments/Page2/CaseEventToFields.json";
const rowDigest =
  "sha256:867df74fb320620da2249eb754aea68faecfb8cc2de18ab5298c2239179b6196";
const digest = (value) =>
  "sha256:" + createHash("sha256").update(value).digest("hex");
const readSource = () =>
  JSON.parse(
    fs.readFileSync(
      new URL("../fixtures/ccd/event-capability.source.json", import.meta.url),
    ),
  );

// A private preparatory derivative only. No existing fixture/import selection or gate uses this.
export function deriveRecipientCallbackFixture(source = readSource()) {
  const fixture = buildEventCapabilityFixtures(source).baseline;
  const file = source.sources.find((file) => file.path === sourcePath);
  const selected = file.rows.find(
    (item) => item.row.CaseFieldID === "sodAdditionalRecipientsList",
  );
  assert.equal(selected.rowDigest, rowDigest, "CALLBACK_SOURCE_ROW_REQUIRED");
  const sourceUrl = "${CCD_DEF_COS_URL}" + RECIPIENT_CALLBACK_PATH;
  assert.equal(
    selected.row.CallBackURLMidEvent,
    sourceUrl,
    "CALLBACK_SOURCE_URL_REQUIRED",
  );
  assert.equal(selected.row.PageID, 2, "CALLBACK_SOURCE_PAGE_REQUIRED");
  const normalizedUrl = "http://127.0.0.1:3101" + RECIPIENT_CALLBACK_PATH;
  const binding = {
    schemaVersion: 1,
    sourceRepository: source.repository,
    sourceRevision: source.revision,
    sourceProjectionDigest: EVENT_CAPABILITY_SOURCE_DIGEST,
    sourcePath,
    sourceFileDigest: file.fileDigest,
    sourceRowDigest: rowDigest,
    sourceAttribute: "CallBackURLMidEvent",
    stage: "MID_EVENT",
    eventId: "serviceOfDocuments",
    fieldId: "sodAdditionalRecipientsList",
    pageId: 2,
    sourceUrl,
    normalizedUrl,
    responderSourceDigest: digest(
      fs.readFileSync(
        new URL("./exui-recipient-callback.mjs", import.meta.url),
      ),
    ),
    releaseCredit: false,
  };
  const rows = fixture.sheets.CaseEventToFields.filter(
    (row) =>
      row.CaseEventID === binding.eventId &&
      row.CaseFieldID === binding.fieldId,
  );
  assert.equal(rows.length, 1, "CALLBACK_TARGET_ROW_REQUIRED");
  assert.deepEqual(
    rows[0],
    Object.fromEntries(
      Object.entries({
        ...selected.row,
        CaseTypeID: "HarnessNestedPRL",
      }).filter(([key]) => key !== binding.sourceAttribute),
    ),
    "CALLBACK_TARGET_METADATA_MISMATCH",
  );
  rows[0].CallBackURLMidEvent = normalizedUrl;
  fixture.provenance.omittedCallbacks =
    fixture.provenance.omittedCallbacks.filter(
      (item) =>
        !(
          item.sourcePath === sourcePath && item.key === binding.sourceAttribute
        ),
    );
  fixture.provenance.restoredCallbacks = [structuredClone(binding)];
  return { fixture, binding };
}
export function validateRecipientCallbackFixture(value, source = readSource()) {
  assert.deepEqual(
    value,
    deriveRecipientCallbackFixture(source),
    "CALLBACK_FIXTURE_MISMATCH",
  );
  return structuredClone(value.binding);
}

// Definition-store c37c9b84 DisplayGroupAdapterService85-89 collects these
// fields through Collectors.toSet(); presentation order is the retained order
// property assigned at100, not the JSON array's iteration order. Preserve every
// field value and all other arrays, including complex_field_overrides.
export function canonicalRecipientCallbackPages(pages) {
  assert(Array.isArray(pages?.wizard_pages), "CALLBACK_PAGE_SCHEMA");
  const canonical = structuredClone(pages);
  for (const page of canonical.wizard_pages) {
    assert(Array.isArray(page.wizard_page_fields), "CALLBACK_PAGE_SCHEMA");
    const fields = page.wizard_page_fields;
    assert(fields.every(field => typeof field.case_field_id === "string" && field.case_field_id.length > 0 && Number.isInteger(field.order)), "CALLBACK_PAGE_FIELD_ORDER_SCHEMA");
    assert.equal(new Set(fields.map(field => field.case_field_id)).size, fields.length, "CALLBACK_PAGE_FIELD_ID_DUPLICATE");
    assert.equal(new Set(fields.map(field => field.order)).size, fields.length, "CALLBACK_PAGE_FIELD_ORDER_DUPLICATE");
    fields.sort((left, right) => left.order - right.order);
  }
  return canonical;
}

// The two fixed workbook variants shared by feasibility and native acceptance.
export function deriveRecipientCallbackImport(variant = 'baseline', rowFacets = false) {
  assert(['baseline','binding-omitted'].includes(variant),'CALLBACK_IMPORT_VARIANT_REQUIRED');
  assert.equal(typeof rowFacets,'boolean','CALLBACK_FACETS_OPTION_REQUIRED');
  const derivative=deriveRecipientCallbackFixture();
  validateRecipientCallbackFixture(derivative);
  if(variant==='binding-omitted') {
    const rows=derivative.fixture.sheets.CaseEventToFields.filter(row=>row.CaseFieldID===derivative.binding.fieldId&&row.CaseEventID===derivative.binding.eventId);
    assert.equal(rows.length,1,'CALLBACK_PAGE_REQUIRED');delete rows[0].CallBackURLMidEvent;
  }
  if(rowFacets) derivative.fixture.sheets.CaseEventToFields.push({LiveFrom:'01/01/2020',CaseTypeID:'HarnessNestedPRL',CaseEventID:derivative.binding.eventId,CaseFieldID:'protectedValue',DisplayContext:'READONLY',PageID:'harnessBefore',PageDisplayOrder:1,PageFieldDisplayOrder:1,ShowSummaryChangeOption:'N'});
  return derivative;
}
