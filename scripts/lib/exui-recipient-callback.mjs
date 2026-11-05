import { createHash } from "node:crypto";
import {
  deriveRecipientCallbackFixture,
  RECIPIENT_CALLBACK_PATH,
} from "./exui-recipient-callback-fixture.mjs";

const invocations = Object.freeze({
  "recipient-callback-ui": "validate-normalize",
  "recipient-callback-native": "validate-normalize",
  "recipient-callback-reject": "reject",
  "recipient-callback-normalize": "normalize",
  "recipient-callback-http-error": "http-error",
});
const maxBytes = 65536;
const digest = (bytes) =>
  "sha256:" + createHash("sha256").update(bytes).digest("hex");
const object = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const nonempty = (value) => typeof value === "string" && value.length > 0;
const uuid = (value) =>
  typeof value === "string" &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
function validRecipient(item) {
  if (!object(item) || !uuid(item.id) || !object(item.value)) return false;
  const value = item.value;
  if (value.serveByPostOrEmail === "email")
    return (
      object(value.emailInformation) &&
      nonempty(value.emailInformation.emailName) &&
      nonempty(value.emailInformation.emailAddress) &&
      value.emailInformation.emailAddress.endsWith("@harness.example.com")
    );
  if (value.serveByPostOrEmail === "post")
    return (
      object(value.postalInformation) &&
      nonempty(value.postalInformation.postalName) &&
      object(value.postalInformation.postalAddress) &&
      nonempty(value.postalInformation.postalAddress.AddressLine1) &&
      nonempty(value.postalInformation.postalAddress.PostCode)
    );
  return false;
}
function validDetails(value) {
  return (
    object(value) &&
    Number.isSafeInteger(value.id) &&
    /^\d{16}$/.test(String(value.id)) &&
    value.case_type_id === "HarnessNestedPRL" &&
    value.jurisdiction === "HARNESS" &&
    value.state === "JUDICIAL_REVIEW" &&
    object(value.case_data)
  );
}
function validRequest(value) {
  if (
    !object(value) ||
    Object.keys(value).some(
      (key) =>
        ![
          "event_id",
          "ignore_warning",
          "case_details",
          "case_details_before",
        ].includes(key),
    ) ||
    value.event_id !== "serviceOfDocuments" ||
    value.ignore_warning !== false ||
    !validDetails(value.case_details) ||
    !validDetails(value.case_details_before) ||
    value.case_details.id !== value.case_details_before.id
  )
    return false;
  const current = value.case_details.case_data,
    before = value.case_details_before.case_data;
  const recipients = current.sodAdditionalRecipientsList;
  if (
    JSON.stringify(current.sodAdditionalRecipients) !==
      '["additionalRecipients"]' ||
    !Array.isArray(recipients) ||
    recipients.length !== 2 ||
    !recipients.every(validRecipient) ||
    new Set(recipients.map((item) => item.id)).size !== 2
  )
    return false;
  const previous = before.sodAdditionalRecipientsList;
  return (
    Array.isArray(previous) &&
    previous.every(validRecipient) &&
    new Set(previous.map((item) => item.id)).size === previous.length
  );
}
function readBody(request) {
  return new Promise((resolve) => {
    const chunks = [];
    let bytes = 0,
      settled = false;
    const finish = (kind) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      request.off("data", data);
      request.off("end", end);
      request.off("error", error);
      request.off("aborted", error);
      request.pause();
      resolve({
        kind,
        raw: kind === "complete" ? Buffer.concat(chunks) : null,
      });
    };
    const data = (chunk) => {
      bytes += chunk.length;
      if (bytes > maxBytes) finish("oversized");
      else chunks.push(chunk);
    };
    const end = () => finish("complete"),
      error = () => finish("failed");
    const timer = setTimeout(() => finish("timeout"), 5000);
    request.on("data", data);
    request.once("end", end);
    request.once("error", error);
    request.once("aborted", error);
  });
}

function recipientName(value) {
  return value.serveByPostOrEmail === "email"
    ? value.emailInformation.emailName
    : value.postalInformation.postalName;
}
function normalize(data) {
  const result = structuredClone(data),
    first = result.sodAdditionalRecipientsList[0].value;
  if (first.serveByPostOrEmail === "email")
    first.emailInformation.emailName = "HARNESS_CALLBACK_NORMALIZED";
  else first.postalInformation.postalName = "HARNESS_CALLBACK_NORMALIZED";
  return result;
}

// Future integration must bind verifyServiceAuthorization to the independently owned S2S
// validator. A user Authorization header is never an authentication substitute. This
// module does not create listeners, select runtime invocations or grant evidence credit.
export function createRecipientCallbackResponder({
  invocationId,
  verifyServiceAuthorization,
  recordEvidence,
}) {
  if (!Object.hasOwn(invocations, invocationId))
    throw new Error("CALLBACK_INVOCATION_REQUIRED");
  if (
    typeof verifyServiceAuthorization !== "function" ||
    typeof recordEvidence !== "function"
  )
    throw new Error("CALLBACK_TRUST_BINDINGS_REQUIRED");
  const mode = invocations[invocationId];
  const bindingDigest = digest(
    JSON.stringify(deriveRecipientCallbackFixture().binding),
  );
  let sequence = 0;
  return async function recipientCallback(request, response) {
    const requestSequence = ++sequence;
    let status = 400,
      outcome = "invalid-request",
      payload = { code: "HARNESS_CALLBACK_INVALID_REQUEST" },
      requestDigest = null,
      recipientCount = 0;
    let authenticatedService=null,rawRequest=null;
    try {
      const browser = Object.keys(request.headers).some(
        (key) => key === "origin" || key.startsWith("sec-fetch-"),
      );
      let service = null;
      const serviceToken = request.headers.serviceauthorization;
      if (
        !browser &&
        typeof serviceToken === "string" &&
        serviceToken.length > 0
      ) {
        try {
          service = await verifyServiceAuthorization(serviceToken);
        } catch {
          service = null;
        }
      }
      authenticatedService=service;
      if (browser || service !== "ccd_data") {
        status = 403;
        outcome = "unauthorized";
        payload = { code: "HARNESS_CALLBACK_FORBIDDEN" };
      } else if (
        request.url !== RECIPIENT_CALLBACK_PATH ||
        request.method !== "POST"
      ) {
        status = 404;
        outcome = "unexpected-route";
        payload = { code: "HARNESS_CALLBACK_ROUTE_REJECTED" };
      } else if (
        !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(
          request.headers["content-type"] ?? "",
        )
      ) {
        status = 415;
        payload = { code: "HARNESS_CALLBACK_JSON_REQUIRED" };
      } else {
        const received = await readBody(request);
        if (received.kind === "oversized") {
          status = 413;
          outcome = "request-too-large";
          payload = { code: "HARNESS_CALLBACK_TOO_LARGE" };
        } else if (received.kind === "timeout") {
          status = 408;
          outcome = "request-timeout";
          payload = { code: "HARNESS_CALLBACK_REQUEST_TIMEOUT" };
        } else if (received.kind !== "complete") {
          status = 400;
          outcome = "invalid-request";
          payload = { code: "HARNESS_CALLBACK_INCOMPLETE_REQUEST" };
        } else {
          const raw = received.raw;
          let body;
          try {
            body = JSON.parse(raw.toString("utf8"));
          } catch {
            body = null;
          }
          if (validRequest(body)) {
            const data = body.case_details.case_data,
              marker = recipientName(data.sodAdditionalRecipientsList[0].value);
            if (
              ["HARNESS_CALLBACK_ORIGINAL", "HARNESS_CALLBACK_REJECT"].includes(
                marker,
              ) ||
              (["normalize", "validate-normalize"].includes(mode) && marker === "HARNESS_CALLBACK_NORMALIZED")
            ) {
              requestDigest = digest(raw);
              if(invocationId === "recipient-callback-native") rawRequest=raw.toString("utf8");
              recipientCount = data.sodAdditionalRecipientsList.length;
              if (mode === "http-error") {
                status = 503;
                outcome = "transport-failed";
                payload = { code: "HARNESS_CALLBACK_HTTP_FAILURE" };
              } else if (
                ["reject", "validate-normalize"].includes(mode) &&
                marker === "HARNESS_CALLBACK_REJECT"
              ) {
                status = 200;
                outcome = "business-rejected";
                payload = {
                  data: structuredClone(data),
                  errors: ["HARNESS_CALLBACK_BUSINESS_REJECTION"],
                  warnings: [],
                };
              } else {
                status = 200;
                outcome =
                  ["normalize", "validate-normalize"].includes(mode)
                    ? marker === "HARNESS_CALLBACK_NORMALIZED"
                      ? "normalization-unchanged"
                      : "normalized"
                    : "accepted";
                payload = {
                  data:
                    ["normalize", "validate-normalize"].includes(mode)
                      ? normalize(data)
                      : structuredClone(data),
                  errors: [],
                  warnings: [],
                };
              }
            }
          }
        }
      }
    } catch {
      status = 500;
      outcome = "internal-error";
      payload = { code: "HARNESS_CALLBACK_INTERNAL_ERROR" };
      requestDigest = null;
      recipientCount = 0;
    }
    const close = ["request-too-large", "request-timeout"].includes(outcome);
    const send = (code, body) => {
      response.writeHead(code, {
        "content-type": "application/json",
        ...(close ? { connection: "close" } : {}),
      });
      response.end(body, () => {
        if (close) request.destroy();
      });
    };
    const bytes = JSON.stringify(payload);
    try {
      await recordEvidence(
        Object.freeze({
          schemaVersion: 1,
          invocationId,
          sequence: requestSequence,
          bindingDigest,
          status,
          outcome,
          recipientCount,
          requestDigest,
          responseDigest: digest(bytes),
          ...(invocationId === "recipient-callback-native" ? {authenticatedService,rawRequest,rawResponse:bytes,path:RECIPIENT_CALLBACK_PATH,method:request.method} : {}),
        }),
      );
    } catch {
      // Failure to retain the sanitized record must never return a successful callback.
      send(500, '{"code":"HARNESS_CALLBACK_EVIDENCE_FAILED"}');
      return;
    }
    send(status, bytes);
  };
}
