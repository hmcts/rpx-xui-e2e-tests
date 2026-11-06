import {complexTransportProjection} from './exui-complex-email-transport.mjs';
const SELECTOR_EVENT_SCOPE = "exui-ccd-selector-event-row-pilot";
import {SHARED_NESTED_SCOPE} from './exui-shared-nested-scope.mjs';
import {resultTransportRoute,resultSupportingResponse} from './exui-results-ui-contract.mjs';
import {APPLICANT_RESULTS_SCOPE} from './exui-applicant-results-contract.mjs';
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import { createHmac, createHash } from "node:crypto";
import { validateRoleTransition } from "./exui-ccd-role-transition.mjs";
import { createRecipientCallbackResponder } from "./exui-recipient-callback.mjs";
import { CALLBACK_SCOPE, RECIPIENT_CALLBACK_PATH } from "./exui-recipient-callback-fixture.mjs";
import { createOwnedCallbackServiceVerifier } from "./exui-recipient-callback-auth.mjs";
import { EVENT_CAPABILITY_SCOPE } from "./exui-ccd-event-capability.mjs";

export function selectorValidationProjection(body, url) {
  let payload;
  try { payload = JSON.parse(body); } catch { payload = {}; }
  const selected = payload?.data?.sodAdditionalRecipients;
  return {
    pageId: ["serviceOfDocumentsharnessBefore", "serviceOfDocuments2"].includes(url.searchParams.get("pageId")) ? url.searchParams.get("pageId") : null,
    eventId: payload?.event?.id === "serviceOfDocuments" ? "serviceOfDocuments" : null,
    controlValue: ["selector-empty-control", "selector-persistence-control"].includes(payload?.data?.protectedValue) ? payload.data.protectedValue : null,
    selected: Array.isArray(selected) && (selected.length === 0 || (selected.length === 1 && selected[0] === "additionalRecipients")) ? selected : null,
  };
}

// Only the fixed synthetic personal-service row is journalled; no arbitrary payloads.
export function personalServiceValidationProjection(body,url) {
 let payload;try{payload=JSON.parse(body);}catch{payload={};}
 const answer=payload?.data?.sodServeToRespondentOptions;
 return {pageId:['serviceOfDocumentsharnessBefore','serviceOfDocuments2'].includes(url.searchParams.get('pageId'))?url.searchParams.get('pageId'):null,eventId:payload?.event?.id==='serviceOfDocuments'?'serviceOfDocuments':null,answer:answer==null?null:['Yes','No','NotApplicable'].includes(answer)?answer:'invalid-answer'};
}

export function seedCcdSession(persona, credential, sessionRoot = "/tmp/.sessions") {
  if (!/^[a-z-]+$/.test(persona)) throw new Error("CCD_SESSION_PERSONA_INVALID");
  if (persona.startsWith("transitioning") && !Array.isArray(credential.roles))
    throw new Error("CCD_OBSERVED_ROLES_REQUIRED");
  if (["courtadmin", "judge", "readonly"].includes(persona))
    assert.deepEqual(credential.roles?.slice().sort(), [
      "caseworker", "caseworker-harness", `caseworker-privatelaw-${persona}`,
    ], "CCD_SOURCE_ACTOR_ROLES_REQUIRED");
  const id = `harness-ccd-${persona}`;
  const token = credential.headers.Authorization.replace(/^Bearer /, "");
  fs.mkdirSync(sessionRoot, { recursive: true });
  fs.writeFileSync(
    `${sessionRoot}/${id}.json`,
    JSON.stringify({
      cookie: {
        originalMaxAge: null,
        expires: null,
        httpOnly: true,
        path: "/",
        secure: false,
      },
      passport: {
        user: {
          userinfo: {
            id: credential.userId,
            uid: credential.userId,
            email: credential.email,
            forename: "Synthetic",
            surname: persona,
            roles: credential.roles ?? [
              "caseworker",
              "caseworker-harness",
              `caseworker-harness-${persona}`,
            ],
            roleCategory: "LEGAL_OPERATIONS",
            roleCategories: ["LEGAL_OPERATIONS"],
          },
          tokenset: { accessToken: token, refreshToken: token },
        },
      },
      roleAssignmentResponse: [],
      __lastAccess: Date.now(),
    }),
    { mode: 0o600 },
  );
  return `s:${id}.${createHmac("sha256", "synthetic-session-value").update(id).digest("base64").replace(/=+$/, "")}`;
}

export async function realCcdRequest(route, credential, options = {}) {
  if (!route.startsWith("/") || route.startsWith("//"))
    throw new Error("INVALID_CCD_ROUTE");
  const response = await fetch(`http://127.0.0.1:4452${route}`, {
    ...options,
    headers: { ...credential.headers, ...options.headers },
    redirect: "error",
  });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: response.status, body };
}

export function loseNestedChild(body) {
  const changed = structuredClone(body);
  const data = changed.data ?? changed.case_data;
  for (const item of data?.sodAdditionalRecipientsList ?? []) {
    if (item.value.emailInformation)
      delete item.value.emailInformation.emailAddress;
  }
  return changed;
}

export function losePostalOptionalChild(body) {
  const changed = structuredClone(body);
  const recipient = changed.data?.sodAdditionalRecipientsList?.[1]?.value;
  if (
    recipient?.serveByPostOrEmail === "post" &&
    recipient.postalInformation?.postalAddress
  )
    delete recipient.postalInformation.postalAddress.AddressLine2;
  return changed;
}

export function loseSecondNestedRecipient(body) {
  const changed=structuredClone(body),data=changed.data??changed.case_data;
  if(Array.isArray(data?.sodAdditionalRecipientsList)&&data.sodAdditionalRecipientsList.length===2)
    data.sodAdditionalRecipientsList=data.sodAdditionalRecipientsList.slice(0,1);
  return changed;
}

const userId =
  "[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}";
const caseworker = `/caseworkers/${userId}/jurisdictions/HARNESS/case-types/HarnessNestedPRL`;
const ccdRoutes = {
  GET: [
    /^\/internal\/profile$/,
    new RegExp(`^${caseworker}/event-triggers/create/token$`),
    /^\/internal\/case-types\/HarnessNestedPRL\/event-triggers\/create$/,
    /^\/internal\/cases\/[0-9]{16}$/,
  ],
  POST: [
    new RegExp(`^${caseworker}/cases$`),
    /^\/case-types\/HarnessNestedPRL\/cases$/,
    /^\/case-types\/HarnessNestedPRL\/validate$/,
    /^\/cases\/[0-9]{16}\/events$/,
  ],
};

const recipientEventRoutes = [
    new RegExp(`^${caseworker}/cases/[0-9]{16}/event-triggers/serviceOfDocuments/token$`),
    /^\/internal\/cases\/[0-9]{16}\/event-triggers\/serviceOfDocuments$/,
];
const eventRoutes = {
  "exui-ccd-pilot": [new RegExp(`^${caseworker}/cases/[0-9]{16}/event-triggers/update/token$`)],
  [EVENT_CAPABILITY_SCOPE]: recipientEventRoutes,
  [CALLBACK_SCOPE]: recipientEventRoutes,
  [SELECTOR_EVENT_SCOPE]: recipientEventRoutes,
};
eventRoutes[SHARED_NESTED_SCOPE]=[...eventRoutes["exui-ccd-pilot"],/^\/internal\/cases\/[0-9]{16}\/event-triggers\/update$/];
const inputRoute = /^\/internal\/case-types\/HarnessResultsPRL\/work-basket-inputs$/;

function ccdTransportRoute(method, pathname, scope) {
  // Current EXUI removes /data at its proxy mount; older bundles retain it.
  const upstreamPath = pathname.startsWith("/data/")
    ? pathname.slice(5)
    : pathname;
  const routes = [...(ccdRoutes[method] ?? []), ...(method === "GET" ? eventRoutes[scope] : []),
    ...(method === "GET" && scope === "exui-ccd-pilot" ? [inputRoute] : [])];
  if (routes.some((route) => route.test(upstreamPath)))
    return { path: `/data${upstreamPath}`, upstreamPath };
  if (
    method === "GET" &&
    new RegExp(`^/aggregated/caseworkers/${userId}/jurisdictions$`).test(
      pathname,
    )
  )
    return { path: pathname, upstreamPath: pathname.slice(11) };
  return null;
}

// CCD owns every baseline case/event response. The explicit callback opt-in adds
// only the bounded synthetic recipient transport responder, never production PRL logic.
export async function startCcdGateway(output, credentials, mutation = null, scope = "exui-ccd-pilot", options = {}) {
  assert(options && typeof options === "object" && !Array.isArray(options) && Object.keys(options).every(key => ["recipientCallback", "workbasket", "resultColumns", "personalService", "complexEmail"].includes(key)), "CCD_GATEWAY_OPTIONS_INVALID");
  const { recipientCallback, workbasket, resultColumns, personalService, complexEmail } = options;
  if(complexEmail!==undefined){assert.equal(complexEmail,true,"COMPLEX_GATEWAY_OPT_IN");assert.equal(scope,SHARED_NESTED_SCOPE,"COMPLEX_GATEWAY_SCOPE");assert.equal(mutation,null,"COMPLEX_GATEWAY_DEFINITION_ONLY");assert([recipientCallback,workbasket,resultColumns,personalService].every(v=>v===undefined),"COMPLEX_GATEWAY_EXCLUSIVE");}
  let complexOrdinal=0;
  if(complexEmail)fs.writeFileSync(`${output}/complex-email-transport.jsonl`,'',{flag:'wx',mode:0o600});
  if(personalService!==undefined){assert.equal(personalService,true,'PERSONAL_SERVICE_GATEWAY_OPT_IN');assert.equal(scope,EVENT_CAPABILITY_SCOPE,'PERSONAL_SERVICE_GATEWAY_SCOPE');assert.equal(resultColumns,undefined,'PERSONAL_SERVICE_GATEWAY_EXCLUSIVE');assert.equal(workbasket,undefined,'PERSONAL_SERVICE_GATEWAY_EXCLUSIVE');assert.equal(mutation,null,'PERSONAL_SERVICE_DEFINITION_FAULT_ONLY');}
  if(resultColumns!==undefined){assert.equal(resultColumns,true,"RESULT_UI_GATEWAY_OPT_IN");assert.equal(recipientCallback,undefined,"RESULT_UI_GATEWAY_EXCLUSIVE");assert.equal(workbasket,undefined,"RESULT_UI_GATEWAY_EXCLUSIVE");assert.equal(mutation,null,"RESULT_UI_BASELINE_ONLY");}
  assert(["exui-ccd-pilot", EVENT_CAPABILITY_SCOPE, CALLBACK_SCOPE, APPLICANT_RESULTS_SCOPE, SELECTOR_EVENT_SCOPE, SHARED_NESTED_SCOPE].includes(scope), "CCD_GATEWAY_SCOPE_REQUIRED");
  if (scope === SELECTOR_EVENT_SCOPE) {
    assert.equal(mutation,null,"SELECTOR_DEFINITION_FAULT_NOT_GATEWAY_MUTATION");
    assert.equal(recipientCallback,undefined,"SELECTOR_CALLBACK_OMITTED");
    assert.equal(resultColumns,undefined,"SELECTOR_RESULTS_EXCLUDED");
  }
  if (scope === APPLICANT_RESULTS_SCOPE) assert.equal(resultColumns,true,"APPLICANT_RESULTS_GATEWAY_REQUIRED");
  assert(workbasket === undefined || (workbasket === true && scope === "exui-ccd-pilot"), "CCD_WORKBASKET_SCOPE_REQUIRED");
  if (mutation === "ccd-drop-workbasket-field") assert.equal(workbasket, true, "CCD_WORKBASKET_FAULT_SCOPE_REQUIRED");
  if ([EVENT_CAPABILITY_SCOPE, CALLBACK_SCOPE].includes(scope))
    assert.equal(mutation, null, "CCD_DEFINITION_FAULT_NOT_GATEWAY_MUTATION");
  if (scope === CALLBACK_SCOPE) assert(recipientCallback !== undefined, "CCD_NATIVE_CALLBACK_REQUIRED");
  let callback;
  if (recipientCallback !== undefined) {
    assert([EVENT_CAPABILITY_SCOPE, CALLBACK_SCOPE].includes(scope), "CCD_CALLBACK_EVENT_SCOPE_REQUIRED");
    assert(recipientCallback && typeof recipientCallback === "object" && !Array.isArray(recipientCallback), "CCD_CALLBACK_OPTIONS_INVALID");
    assert.deepEqual(Object.keys(recipientCallback), ["invocationId"], "CCD_CALLBACK_OPTIONS_INVALID");
    if (scope === CALLBACK_SCOPE) assert.equal(recipientCallback.invocationId, "recipient-callback-native", "CCD_NATIVE_CALLBACK_INVOCATION_REQUIRED");
    else assert.notEqual(recipientCallback.invocationId, "recipient-callback-native", "CCD_NATIVE_CALLBACK_SCOPE_REQUIRED");
    const callbackEvidenceFile = `${output}/recipient-callback.jsonl`;
    callback = createRecipientCallbackResponder({
      invocationId: recipientCallback.invocationId,
      verifyServiceAuthorization: createOwnedCallbackServiceVerifier(),
      recordEvidence: evidence => fs.appendFileSync(callbackEvidenceFile, JSON.stringify(evidence) + "\n", { mode: 0o600 }),
    });
    // One fresh evidence journal per owned gateway invocation; never mix a reused run.
    fs.writeFileSync(callbackEvidenceFile, "", { flag: "wx", mode: 0o600 });
  }
  let workbasketJurisdictions;
  if (workbasket) {
    const imported = await fetch("http://127.0.0.1:4451/api/data/case-type/HarnessResultsPRL", {
      headers: credentials.observer.headers, redirect: "error",
    });
    assert.equal(imported.status, 200, "CCD_WORKBASKET_DEFINITION_REQUIRED");
    const caseType = await imported.json();
    assert.equal(caseType.id, "HarnessResultsPRL", "CCD_WORKBASKET_CASE_TYPE_REQUIRED");
    assert.equal(caseType.jurisdiction?.id, "HARNESS", "CCD_WORKBASKET_JURISDICTION_REQUIRED");
    assert(Array.isArray(caseType.states) && caseType.states.length > 0, "CCD_WORKBASKET_STATES_REQUIRED");
    workbasketJurisdictions = [{ id: caseType.jurisdiction.id, name: caseType.jurisdiction.name,
      caseTypes: [{ id: caseType.id, name: caseType.name, states: caseType.states.map(({ id, name }) => ({ id, name })) }] }];
  }
  const server = http.createServer(async (request, response) => {
    try {
      if (callback && request.url.split("?")[0] === RECIPIENT_CALLBACK_PATH) {
        await callback(request, response);
        return;
      }
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      let body = Buffer.concat(chunks).toString();
      const url = new URL(request.url, "http://127.0.0.1:3101");
      const receivedPath = request.url.split("?")[0];
      const transitionPath = `${output}/role-transition.json`;
      const transition = scope === "exui-ccd-pilot" && fs.existsSync(transitionPath)
        ? JSON.parse(fs.readFileSync(transitionPath, "utf8"))
        : null;
      const renewed = transition
        ? validateRoleTransition(transition, credentials.transitioning)
        : null;
      const actor = [...Object.values(credentials), ...(renewed ? [renewed] : [])].find(
        (credential) =>
          credential.headers.Authorization === request.headers.authorization,
      );
      const transportedPath = actor
        ? url.pathname.replace(
            "/caseworkers/:uid/",
            `/caseworkers/${actor.userId}/`,
          )
        : url.pathname;
      if (workbasket && request.method === "GET" &&
        new RegExp(`^/aggregated/caseworkers/${userId}/jurisdictions$`).test(url.pathname) &&
        actor?.userId === url.pathname.split("/")[3]) {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify(workbasketJurisdictions));
        return;
      }
      if (workbasket && request.method === "GET" && url.pathname === "/refdata/external/v1/organisations") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end("[]");
        return;
      }
      if (workbasket && request.method === "POST" && url.pathname === "/internal/searchCases" &&
        url.searchParams.get("ctid") === "HarnessResultsPRL" &&
        url.searchParams.get("use_case") === "WORKBASKET" &&
        url.searchParams.get("view") === "WORKBASKET" && actor) {
        response.writeHead(200, { "content-type": "application/json" });
        response.end('{"headers":[{"fields":[]}],"total":0,"cases":[]}');
        return;
      }
      const headers = {};
      for (const key of [
        "authorization",
        "serviceauthorization",
        "accept",
        "content-type",
        "experimental",
        "client-context",
      ]) {
        if (request.headers[key]) headers[key] = request.headers[key];
      }
      const supporting = resultSupportingResponse(resultColumns,request.method,url,body,actor);
      if (supporting && receivedPath === url.pathname) {
        response.writeHead(supporting.status, {"content-type":"application/json"});
        response.end(supporting.responseBody);
        return;
      }
      const ccdRoute =
        receivedPath === url.pathname
          ? (resultColumns ? resultTransportRoute(request.method,transportedPath,url,body,actor) : ccdTransportRoute(request.method, transportedPath, scope))
          : null;
      const journal = {
        path: ccdRoute?.path ?? receivedPath,
        receivedPath,
        upstreamPath: ccdRoute?.upstreamPath ?? url.pathname,
        ...([EVENT_CAPABILITY_SCOPE, SELECTOR_EVENT_SCOPE, "exui-ccd-pilot", SHARED_NESTED_SCOPE].includes(scope) && ccdRoute ? { actorId: actor?.userId ?? null } : {}),
        ...(scope === SELECTOR_EVENT_SCOPE && ccdRoute && request.method === "POST" && ccdRoute.upstreamPath === "/case-types/HarnessNestedPRL/validate"
          ? { selectorValidation: selectorValidationProjection(body, url) } : {}),
        ...(personalService && ccdRoute && request.method==='POST' && ccdRoute.upstreamPath==='/case-types/HarnessNestedPRL/validate' ? {personalService:personalServiceValidationProjection(body,url)} : {}),
      };
      let target;
      if (ccdRoute)
        target = `http://127.0.0.1:4452${ccdRoute.upstreamPath}${url.search}`;
      else if (url.pathname === "/lease") {
        response.writeHead(200, { "content-type": "text/plain" });
        response.end(credentials.allowed.headers.ServiceAuthorization);
        return;
      } else if (url.pathname.startsWith("/am/role-assignments/actors/")) {
        response.writeHead(200, { "content-type": "application/json" });
        response.end('{"roleAssignmentResponse":[]}');
        return;
      } else if (
        url.pathname.startsWith("/o/") ||
        ["/details", "/userinfo"].includes(url.pathname)
      ) {
        target = `http://127.0.0.1:5000${url.pathname}${url.search}`;
      } else if (
        url.pathname === "/health" ||
        url.pathname === "/health/liveness"
      ) {
        response.writeHead(200, { "content-type": "application/json" });
        response.end('{"status":"UP"}');
        return;
      } else {
        fs.appendFileSync(
          `${output}/unhandled-provider.jsonl`,
          JSON.stringify({ method: request.method, path: receivedPath }) + "\n",
        );
        response.writeHead(501, { "content-type": "application/json" });
        response.end('{"code":"UNDECLARED_CCD_GATEWAY_REQUEST"}');
        return;
      }
      const revokedCaseRead = transition && request.method === "GET" &&
        ccdRoute?.upstreamPath === `/internal/cases/${transition.caseId}`;
      if (revokedCaseRead && !actor)
        throw new Error("CCD_TRANSITION_ACTOR_REQUIRED");
      const staleGrant = mutation === "ccd-stale-revoked-bearer" &&
        revokedCaseRead && headers.authorization === renewed.headers.Authorization;
      if (staleGrant)
        headers.authorization = credentials.transitioning.headers.Authorization;
      const denied = scope === "exui-ccd-pilot" &&
        headers.authorization === credentials.denied.headers.Authorization;
      const isWrite =
        request.method === "POST" && /\/(?:cases|events)$/.test(url.pathname);
      const beforeNestedFault=isWrite&&body&&['ccd-drop-child','ccd-drop-postal-optional-child','shared-nested-drop-second-recipient'].includes(mutation)?JSON.parse(body):null;
      if (mutation === 'shared-nested-drop-second-recipient' && isWrite && body)
        body=JSON.stringify(loseSecondNestedRecipient(JSON.parse(body)));
      if (mutation === "ccd-drop-child" && isWrite && body)
        body = JSON.stringify(loseNestedChild(JSON.parse(body)));
      if (mutation === "ccd-drop-postal-optional-child" && isWrite && body)
        body = JSON.stringify(losePostalOptionalChild(JSON.parse(body)));
      if (
        mutation === "ccd-broaden-access" &&
        denied &&
        request.method === "GET" &&
        /\/cases\/\d+$/.test(url.pathname)
      )
        headers.authorization = credentials.allowed.headers.Authorization;
      if (mutation === "ccd-write-then-deny" && denied && isWrite) {
        const caseId = url.pathname.match(/\/cases\/(\d+)\/events$/)?.[1];
        if (!caseId) throw new Error("FAULT_REQUIRES_CASE_EVENT");
        const trigger = await realCcdRequest(
          `/caseworkers/${credentials.allowed.userId}/jurisdictions/HARNESS/case-types/HarnessNestedPRL/cases/${caseId}/event-triggers/update/token`,
          credentials.allowed,
        );
        if (trigger.status !== 200) throw new Error("FAULT_EVENT_START_FAILED");
        const payload = JSON.parse(body);
        payload.event_token = trigger.body.token;
        const writePath = `/caseworkers/${credentials.allowed.userId}/jurisdictions/HARNESS/case-types/HarnessNestedPRL/cases/${caseId}/events`;
        const written = await realCcdRequest(writePath, credentials.allowed, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        fs.appendFileSync(
          `${output}/fault-actions.jsonl`,
          JSON.stringify({ mutation, caseId, status: written.status }) + "\n",
        );
        if (written.status !== 201) throw new Error("FAULT_WRITE_FAILED");
        fs.appendFileSync(
          `${output}/ccd-requests.jsonl`,
          JSON.stringify({
            method: request.method,
            ...journal,
            upstreamPath: writePath,
            status: 403,
            mutation,
            faultWriteStatus: written.status,
          }) + "\n",
        );
        response.writeHead(403, { "content-type": "application/json" });
        response.end('{"status":403,"message":"Forbidden"}');
        return;
      }
      const upstream = await fetch(target, {
        method: request.method,
        headers,
        ...(body ? { body } : {}),
        redirect: "error",
      });
      let bytes = Buffer.from(await upstream.arrayBuffer());
      if(beforeNestedFault) {
        const changed=JSON.parse(body),beforeData=beforeNestedFault.data??beforeNestedFault.case_data,afterData=changed.data??changed.case_data;
        if(JSON.stringify(beforeData)!==JSON.stringify(afterData))
          fs.appendFileSync(`${output}/fault-actions.jsonl`,JSON.stringify({mutation,method:request.method,upstreamPath:ccdRoute.upstreamPath,status:upstream.status,eventId:beforeNestedFault.event?.id,before:beforeData,after:afterData})+'\n');
      }
      if (mutation === "ccd-drop-workbasket-field" && ccdRoute?.upstreamPath === "/internal/case-types/HarnessResultsPRL/work-basket-inputs") {
        assert.equal(upstream.status, 200, "CCD_WORKBASKET_FAULT_RESPONSE_REQUIRED");
        const result = JSON.parse(bytes.toString());
        const before = result.workbasketInputs;
        assert(Array.isArray(before) && before.filter(item => item.field?.id === "applicantCaseName").length === 1,
          "CCD_WORKBASKET_FAULT_FIELD_REQUIRED");
        result.workbasketInputs = before.filter(item => item.field.id !== "applicantCaseName");
        bytes = Buffer.from(JSON.stringify(result));
        fs.appendFileSync(`${output}/fault-actions.jsonl`, JSON.stringify({ mutation, removedField: "applicantCaseName",
          before: before.length, after: result.workbasketInputs.length }) + "\n");
      }
      if (staleGrant)
        fs.appendFileSync(`${output}/fault-actions.jsonl`, JSON.stringify({
          mutation, actorId: renewed.userId, caseId: transition.caseId,
          oldTokenDigest: transition.oldTokenDigest, status: upstream.status,
          method: request.method, upstreamPath: ccdRoute.upstreamPath,
        }) + "\n");
      if(complexEmail&&ccdRoute){const projected=complexTransportProjection({method:request.method,upstreamPath:ccdRoute.upstreamPath,path:ccdRoute.path,body,response:bytes,status:upstream.status,actorId:actor?.userId,ordinal:complexOrdinal+1});if(projected){complexOrdinal++;fs.appendFileSync(`${output}/complex-email-transport.jsonl`,JSON.stringify(projected)+'\n',{mode:0o600});}}
      fs.appendFileSync(
        `${output}/ccd-requests.jsonl`,
        JSON.stringify({
          method: request.method,
          ...journal,
          status: upstream.status,
          ...(resultColumns?{useCase:url.searchParams.get("use_case"),requestDigest:createHash("sha256").update(body).digest("hex"),responseDigest:createHash("sha256").update(bytes).digest("hex")}:{}),
          mutation,
        }) + "\n",
      );
      response.writeHead(upstream.status, {
        "content-type":
          upstream.headers.get("content-type") ?? "application/json",
      });
      response.end(bytes);
    } catch (error) {
      fs.appendFileSync(
        `${output}/gateway-errors.jsonl`,
        JSON.stringify({ error: error.message }) + "\n",
      );
      response.writeHead(502, { "content-type": "application/json" });
      response.end('{"code":"CCD_GATEWAY_FAILED"}');
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(3101, "127.0.0.1", resolve);
  });
  return server;
}

export { NATIVE_HARNESS_SOURCE_FILES as CCD_HARNESS_SOURCE_FILES } from "./exui-native-sources.mjs";
