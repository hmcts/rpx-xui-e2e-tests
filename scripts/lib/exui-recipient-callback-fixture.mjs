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
