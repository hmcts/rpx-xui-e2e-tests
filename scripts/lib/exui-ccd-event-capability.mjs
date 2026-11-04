import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";

export const EVENT_CAPABILITY_SCOPE = "exui-ccd-event-capability-pilot";
export const EVENT_CAPABILITY_MUTATION = "ccd-enable-judge-event";
export const COURTADMIN_READ_MUTATION = "ccd-remove-courtadmin-recipient-read";
export const READONLY_READ_MUTATION = "ccd-remove-readonly-recipient-read";
export function eventCapabilityFaultContract(invocationId) {
  assert([EVENT_CAPABILITY_MUTATION, COURTADMIN_READ_MUTATION, READONLY_READ_MUTATION].includes(invocationId), "EVENT_TRANSITION_INVOCATION");
  const contract = {
    [EVENT_CAPABILITY_MUTATION]: { variant: "mutant", target: "AuthorisationCaseEvent:caseworker-privatelaw-judge:serviceOfDocuments:CRUD", transformationKey: "transformation", validatePair: validateEventCapabilityPair },
    [COURTADMIN_READ_MUTATION]: { variant: "read-mutant", target: "AuthorisationCaseField:caseworker-privatelaw-courtadmin:sodAdditionalRecipientsList:CRUD", transformationKey: "readTransformation", validatePair: validateCourtadminReadPair },
    [READONLY_READ_MUTATION]: { variant: "readonly-read-mutant", target: "AuthorisationCaseField:caseworker-privatelaw-readonly:sodAdditionalRecipientsList:CRUD", transformationKey: "readonlyReadTransformation", validatePair: validateReadonlyReadPair },
  }[invocationId];
  assert(contract, "EVENT_TRANSITION_INVOCATION");
  return contract;
}
export function eventCapabilityFaultVariant(invocationId) {
  return eventCapabilityFaultContract(invocationId).variant;
}
export const READONLY_READ_OBLIGATION = "ccd-source-readonly-read-shapes";
export const READONLY_READ_CELLS = Object.freeze([
  { id: "configuration-cell:8b58b9887954abf5777c3e444bd4876fcdae07c4955880fedf50582aefb3e58a", channel: "email", recipientCount: 1 },
  { id: "configuration-cell:fbf6c3058a52de86c9a6323bbb4428c0fe9b9faf0d72c33080b945397418f8ec", channel: "email", recipientCount: 2 },
  { id: "configuration-cell:b0d9eefe2d358d1516cb7d564c171fd623357dcb32a90a4d8989ecf7a61e14cf", channel: "post", recipientCount: 1 },
  { id: "configuration-cell:8d000fcc1cafb9115e2702da1907d9e6e843d9add4c9c03f8fb49d52d769f337", channel: "post", recipientCount: 2 },
]);
export const COURTADMIN_READ_OBLIGATION = "ccd-source-courtadmin-read-shapes";
export const COURTADMIN_READ_CELLS = Object.freeze([
  { id: "configuration-cell:8c1a3f11d156a5557c5400305414da596d644a4d2378aa539753a7e9fc88d76a", channel: "email", recipientCount: 1 },
  { id: "configuration-cell:a4563399414365b47e8e8358355038fa5a3398127584c2b821674be2525462ba", channel: "email", recipientCount: 2 },
  { id: "configuration-cell:5e6b7152607a4c223cb1cb1c8912d4837a71fca9e27e5fd5ef3cd8f60d7096a6", channel: "post", recipientCount: 1 },
  { id: "configuration-cell:d418df10fcef3e7a349c270d06a975ac9d1381ea428cf1fc4e955ea968680397", channel: "post", recipientCount: 2 },
]);
export const EVENT_CAPABILITY_PROOFS = Object.freeze({
  courtadmin: "ccd-courtadmin-email-one",
  judge: "ccd-event-create-denied",
  mutant: "ccd-event-create-enabled",
  courtadminRead: "ccd-courtadmin-read-recipient-shapes",
  courtadminReadMutant: "ccd-courtadmin-read-shapes-hidden",
  readonlyRead: "ccd-readonly-read-recipient-shapes",
  readonlyReadMutant: "ccd-readonly-read-shapes-hidden",
});
export const EVENT_CAPABILITY_SOURCE_DIGEST =
  "sha256:528445a5ed3661b2a8fa5774b4041755c177f6434d6662c35699a4b81339d88e";
export const EVENT_CAPABILITY_CELL =
  "configuration-cell:a6d5e8421152eca670bc39912f6781824bfc3190d2b78ed9ea7757b5f168e313";
const revision = "694b9951e94369f1394380506960c4f04f25755d";
const prefix = "definitions/private-law/json/";
const courtadmin = "caseworker-privatelaw-courtadmin";
const judge = "caseworker-privatelaw-judge";
const readonly = "caseworker-privatelaw-readonly";
const observer = "caseworker-harness-observer";
const bootstrap = "caseworker-harness-allowed";
const state = "JUDICIAL_REVIEW";
const event = "serviceOfDocuments";
const ct = "HarnessNestedPRL";
const sorted = (value) =>
  Array.isArray(value)
    ? value.map(sorted)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, sorted(value[key])]),
        )
      : value;
const digest = (value) =>
  "sha256:" +
  createHash("sha256")
    .update(JSON.stringify(sorted(value)))
    .digest("hex");
const readSource = () =>
  JSON.parse(
    fs.readFileSync(
      new URL("../fixtures/ccd/event-capability.source.json", import.meta.url),
      "utf8",
    ),
  );
const rows = (source, file) =>
  source.sources
    .find((item) => item.path === prefix + file)
    .rows.map((item) => structuredClone(item.row));
const access = (row, role) =>
  row.AccessControl.find((item) => item.UserRoles.includes(role)).CRUD;

export function validateEventCapabilitySource(source) {
  assert.equal(
    digest(source),
    EVENT_CAPABILITY_SOURCE_DIGEST,
    "EVENT_CAPABILITY_SOURCE_DRIFT",
  );
  assert.equal(source.repository, "hmcts/prl-ccd-definitions");
  assert.equal(source.revision, revision);
  for (const file of source.sources)
    for (const item of file.rows)
      assert.equal(
        digest(item.row),
        item.rowDigest,
        "EVENT_CAPABILITY_SOURCE_ROW_DRIFT",
      );
  for (const [role, type, eventPermission, statePermission, fieldPermission] of [
    [courtadmin, "CRU", "CRU", "CRUD", "CRUD"],
    [judge, "RU", "R", "CRUD", "CRUD"],
    [readonly, "R", "R", "R", "R"],
  ]) {
    for (const environment of ["prod", "nonprod"]) {
      assert.equal(
        rows(
          source,
          `AuthorisationCaseType/AuthorisationCaseType-${environment}.json`,
        ).find((row) => row.UserRole === role).CRUD,
        type,
        "EVENT_CAPABILITY_TYPE_VECTOR",
      );
    }
    assert.equal(
      access(rows(source, "AuthorisationCaseState.json")[0], role),
      statePermission,
      "EVENT_CAPABILITY_STATE_VECTOR",
    );
    assert.equal(
      access(
        rows(
          source,
          "AuthorisationCaseField/ServiceOfDocuments/AuthorisationCaseField.json",
        ).find((row) => row.CaseFieldID === "sodAdditionalRecipientsList"),
        role,
      ),
      fieldPermission,
      "EVENT_CAPABILITY_FIELD_VECTOR",
    );
    assert.equal(
      access(
        rows(
          source,
          "AuthorisationCaseEvent/ServiceOfDocuments/AuthorisationCaseEvent.json",
        )[0],
        role,
      ),
      eventPermission,
      "EVENT_CAPABILITY_EVENT_VECTOR",
    );
  }
}

export function buildEventCapabilityFixtures(source = readSource()) {
  validateEventCapabilitySource(source);
  const omittedCallbacks = [];
  const normalize = (row, file, eventId) => {
    const result = structuredClone(row);
    if ("CaseTypeID" in result) result.CaseTypeID = ct;
    if (eventId && "CaseEventID" in result) result.CaseEventID = eventId;
    for (const key of Object.keys(result).filter((key) =>
      key.startsWith("CallBackURL"),
    )) {
      omittedCallbacks.push({
        sourcePath: prefix + file,
        sourceRowDigest: digest(row),
        key,
        value: result[key],
      });
      delete result[key];
    }
    return result;
  };
  const fieldsFile = "CaseField/ServiceOfDocuments/CaseField.json";
  const eventFile = "CaseEvent/ServiceOfDocuments/CaseEvent-nonprod.json";
  const eventFieldsFile =
    "CaseEventToFields/ServiceOfDocuments/Page2/CaseEventToFields.json";
  const elementsFile =
    "CaseEventToComplexTypes/ServiceOfDocuments/AdditionalRecipients/CaseEventToComplexTypes.json";
  const sourceEvent = normalize(rows(source, eventFile)[0], eventFile);
  sourceEvent["PreConditionState(s)"] = state;
  const common = { LiveFrom: "01/01/2020", CaseTypeID: ct };
  const sourceFields = rows(source, fieldsFile).map((row) =>
    normalize(row, fieldsFile),
  );
  const eventFields = rows(source, eventFieldsFile).map((row) =>
    normalize(row, eventFieldsFile),
  );
  const elements = rows(source, elementsFile).map((row) =>
    normalize(row, elementsFile),
  );
  const fields = [
    ...sourceFields,
    {
      ...common,
      ID: "protectedValue",
      Label: "Protected value",
      FieldType: "Text",
      SecurityClassification: "Public",
    },
  ];
  const aclFields = rows(
    source,
    "AuthorisationCaseField/ServiceOfDocuments/AuthorisationCaseField.json",
  );
  const aclEvent = rows(
    source,
    "AuthorisationCaseEvent/ServiceOfDocuments/AuthorisationCaseEvent.json",
  )[0];
  const sheets = {
    Jurisdiction: [
      {
        LiveFrom: "01/01/2020",
        ID: "HARNESS",
        Name: "Disposable Harness",
        Description: "Synthetic isolated CCD",
      },
    ],
    CaseType: [
      {
        LiveFrom: "01/01/2020",
        ID: ct,
        Name: "Harness event capability",
        Description:
          "Normalized source permission shape; no deployed PRL identity",
        JurisdictionID: "HARNESS",
        SecurityClassification: "Public",
      },
    ],
    CaseField: fields,
    ComplexTypes: rows(
      source,
      "ComplexTypes/ManageOrders/OrderDetails/ComplexTypes.json",
    ),
    FixedLists: rows(source, "FixedLists.json"),
    State: [{ ...common, ID: state, Name: "Judicial review (Harness)" }],
    CaseEvent: [
      {
        ...common,
        ID: "create",
        Name: "Create synthetic case",
        PostConditionState: state,
        SecurityClassification: "Public",
        ShowSummary: "Y",
      },
      sourceEvent,
    ],
    CaseEventToFields: [
      ...eventFields,
      ...eventFields.map((row) => ({ ...row, CaseEventID: "create" })),
      {
        ...common,
        CaseEventID: "create",
        CaseFieldID: "protectedValue",
        DisplayContext: "OPTIONAL",
        PageID: 2,
        PageDisplayOrder: 2,
        PageFieldDisplayOrder: 9,
        ShowSummaryChangeOption: "Y",
      },
    ],
    EventToComplexTypes: [
      ...elements,
      ...elements.map((row) => ({ ...row, CaseEventID: "create" })),
    ],
    AuthorisationCaseType: [
      [courtadmin, "CRU"],
      [judge, "RU"],
      [readonly, "R"],
      [observer, "CRUD"],
      [bootstrap, "CRU"],
    ].map(([role, CRUD]) => ({ ...common, UserRole: role, CRUD })),
    AuthorisationCaseState: [courtadmin, judge, readonly, observer, bootstrap].map(
      (role) => ({
        ...common,
        CaseStateID: state,
        UserRole: role,
        CRUD: role === readonly ? "R" : "CRUD",
      }),
    ),
    AuthorisationCaseEvent: [
      ...[courtadmin, judge, readonly].map((role) => ({
        ...common,
        CaseEventID: event,
        UserRole: role,
        CRUD: access(aclEvent, role),
      })),
      { ...common, CaseEventID: event, UserRole: observer, CRUD: "CRU" },
      ...[courtadmin, observer, bootstrap].map((role) => ({
        ...common,
        CaseEventID: "create",
        UserRole: role,
        CRUD: "CRU",
      })),
    ],
    AuthorisationCaseField: [
      ...aclFields.flatMap((row) =>
        [courtadmin, judge, readonly].map((role) => ({
          ...common,
          CaseFieldID: row.CaseFieldID,
          UserRole: role,
          CRUD: access(row, role),
        })),
      ),
      ...[observer, bootstrap].flatMap((role) =>
        fields.map((row) => ({
          ...common,
          CaseFieldID: row.ID,
          UserRole: role,
          CRUD: "CRUD",
        })),
      ),
      ...[
        [courtadmin, "CRUD"],
        [judge, "R"],
        [readonly, "R"],
      ].map(([role, CRUD]) => ({
        ...common,
        CaseFieldID: "protectedValue",
        UserRole: role,
        CRUD,
      })),
    ],
    AuthorisationComplexType: [],
    CaseTypeTab: fields.map((row, index) => ({
      ...common,
      TabID: "details",
      TabLabel: "Details",
      TabDisplayOrder: 1,
      CaseFieldID: row.ID,
      TabFieldDisplayOrder: index + 1,
    })),
    UserProfile: [
      {
        UserIDAMId: "observer@harness.example.com",
        WorkBasketDefaultJurisdiction: "HARNESS",
        WorkBasketDefaultCaseType: ct,
        WorkBasketDefaultState: state,
      },
    ],
  };
  for (const sheet of [
    "SearchInputFields",
    "SearchResultFields",
    "WorkBasketInputFields",
    "WorkBasketResultFields",
  ])
    sheets[sheet] = [
      {
        ...common,
        CaseFieldID: "protectedValue",
        Label: "Protected value",
        DisplayOrder: 1,
      },
    ];
  const baseline = {
    provenance: {
      schemaVersion: 1,
      sourceRepository: source.repository,
      sourceRevision: source.revision,
      sourceProjectionDigest: EVENT_CAPABILITY_SOURCE_DIGEST,
      sourceManifest: source.sources.map(({ path, fileDigest, rows }) => ({
        path,
        fileDigest,
        rows: rows.map(({ index, rowDigest }) => ({ index, rowDigest })),
      })),
      targetCatalogueCell: EVENT_CAPABILITY_CELL,
      releaseCredit: false,
      runtime: {
        jurisdiction: "HARNESS",
        caseType: ct,
        state,
        event,
        roles: { courtadmin, judge, readonly, observer, bootstrap },
      },
      adaptations: [
        "PRLAPPS normalized to HarnessNestedPRL in disposable HARNESS jurisdiction",
        "Selected source ACLs flattened into per-role CCD rows with synthetic 01/01/2020 activation; source permission values retained",
        "Only JUDICIAL_REVIEW selected from the three source precondition states; source event ID and PostConditionState retained",
        "Source role suffixes assigned directly by synthetic IDAM; no AM, ABAC or RoleToAccessProfiles resolution claim",
        "Synthetic create event, protectedValue, observer ACLs, tabs/search metadata and default observer profile are bootstrap/observation scaffolding",
        "caseworker-harness-allowed has bootstrap type/state/field/create ACLs only and no serviceOfDocuments ACL; source courtadmin/judge actors must never carry that role",
        "Only selected recipient/controller fields and their email/postal complex/list dependencies included; source visibility and mandatory annotations retained",
        "No explicit child ACL rows invented; effective imported child metadata must be observed before runtime acceptance",
        "Required AuthorisationComplexType worksheet is header-only with zero data/permission rows",
        "Business callbacks omitted; no PRL callback or deployed-service equivalence claim",
      ],
      omittedCallbacks,
    },
    sheets,
  };
  const mutant = structuredClone(baseline);
  mutant.sheets.AuthorisationCaseEvent.find(
    (row) => row.UserRole === judge && row.CaseEventID === event,
  ).CRUD = "CR";
  return { baseline, mutant };
}

export function validateEventCapabilityPair(
  baseline,
  mutant,
  source = readSource(),
) {
  const expected = buildEventCapabilityFixtures(source);
  assert.deepEqual(
    baseline,
    expected.baseline,
    "EVENT_CAPABILITY_BASE_MISMATCH",
  );
  assert.deepEqual(mutant, expected.mutant, "EVENT_CAPABILITY_PAIR_MISMATCH");
  return {
    sheet: "AuthorisationCaseEvent",
    role: judge,
    event,
    field: "CRUD",
    before: "R",
    after: "CR",
  };
}

export function deriveCourtadminReadFault(baseline, source = readSource()) {
  assert.deepEqual(
    baseline,
    buildEventCapabilityFixtures(source).baseline,
    "COURTADMIN_READ_BASE_MISMATCH",
  );
  const mutant = structuredClone(baseline);
  mutant.sheets.AuthorisationCaseField.find(
    (row) => row.UserRole === courtadmin && row.CaseFieldID === "sodAdditionalRecipientsList",
  ).CRUD = "CUD";
  return mutant;
}

export function validateCourtadminReadPair(baseline, mutant, source = readSource()) {
  assert.deepEqual(
    mutant,
    deriveCourtadminReadFault(baseline, source),
    "COURTADMIN_READ_FAULT_MISMATCH",
  );
  return {
    sheet: "AuthorisationCaseField",
    role: courtadmin,
    caseField: "sodAdditionalRecipientsList",
    field: "CRUD",
    before: "CRUD",
    after: "CUD",
  };
}

export function deriveReadonlyReadFault(baseline, source = readSource()) {
  assert.deepEqual(baseline, buildEventCapabilityFixtures(source).baseline, "READONLY_READ_BASE_MISMATCH");
  const mutant = structuredClone(baseline);
  mutant.sheets.AuthorisationCaseField.find(
    row => row.UserRole === readonly && row.CaseFieldID === "sodAdditionalRecipientsList",
  ).CRUD = "U";
  return mutant;
}

export function validateReadonlyReadPair(baseline, mutant, source = readSource()) {
  assert.deepEqual(mutant, deriveReadonlyReadFault(baseline, source), "READONLY_READ_FAULT_MISMATCH");
  return { sheet: "AuthorisationCaseField", role: readonly, caseField: "sodAdditionalRecipientsList", field: "CRUD", before: "R", after: "U" };
}
