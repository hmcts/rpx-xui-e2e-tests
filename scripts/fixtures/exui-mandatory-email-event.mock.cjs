const targets = {
  name: {
    id: "configuration-shape:d0189498d796f462bbd150341384aaf1743ec24491af04fc5176dc8e7e72439e",
    index: 14,
    reference: "emailInformation.emailName",
    order: "3",
    rowDigest:
      "sha256:15be218a2ec9b5e16174ad6b350558a2f777ff9f2776ce6541cc5889624bd4b4",
  },
  address: {
    id: "configuration-shape:afb8b838dc9de1bb8314cbf494ff26a987aa3edb845b2fa0a45c378834d2b74d",
    index: 13,
    reference: "emailInformation.emailAddress",
    order: "4",
    rowDigest:
      "sha256:84fc6347ddd5f5250fa841380bf5329337ce5b70c864926e2c3d11515cfcec3d",
  },
};
exports.targets = targets;
exports.sourceRow = (id) => ({
  LiveFrom: "01/09/2024",
  CaseTypeID: "PRLAPPS",
  ID: "ServeOrgDetails",
  CaseEventID: "serviceOfDocuments",
  CaseFieldID: "sodAdditionalRecipientsList",
  ListElementCode: targets[id].reference,
  FieldShowCondition: 'sodAdditionalRecipientsList.serveByPostOrEmail="email"',
  EventElementLabel: " ",
  FieldDisplayOrder: targets[id].order,
  DisplayContext: "MANDATORY",
});
exports.eventRow = (fixture, id) =>
  fixture.sheets.EventToComplexTypes.find(
    (r) =>
      r.CaseEventID === "serviceOfDocuments" &&
      r.CaseFieldID === "sodAdditionalRecipientsList" &&
      r.ListElementCode === targets[id].reference,
  );
exports.invalidChanges = [
  (value) => {
    value.fixture.sheets.CaseField[0].Label = "PRIVATE_SIBLING_CHANGE";
  },
  (value) => {
    value.fixture.sheets.EventToComplexTypes.find(
      (r) =>
        r.CaseEventID === "create" &&
        r.ListElementCode === targets.name.reference,
    ).DisplayContext = "OPTIONAL";
  },
  (value) => {
    exports.eventRow(value.fixture, "address").FieldDisplayOrder = "999";
  },
  (value) => {
    exports.eventRow(value.fixture, "name").EventElementLabel = "";
  },
  (value) => {
    value.binding.runtimeAcceptance = true;
  },
  (value) => {
    value.binding.sourceComplete = true;
  },
  (value) => {
    value.binding.catalogueCredit = true;
  },
];
exports.dateRows = (version) =>
  [targets.address, targets.name].map((t) => ({
    case_type: "HarnessNestedPRL",
    version,
    event: "serviceOfDocuments",
    field: "sodAdditionalRecipientsList",
    reference: t.reference,
    live_from: "2024-09-01",
    sql_type: "date",
  }));
