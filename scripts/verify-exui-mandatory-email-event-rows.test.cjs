const { test } = require("node:test"),
  assert = require("node:assert/strict");
const mock = require("./fixtures/exui-mandatory-email-event.mock.cjs");
const modules = async () => ({
  producer: await import("./lib/exui-mandatory-email-event-rows.mjs"),
  reader: await import("./lib/exui-mandatory-email-event-validation.mjs"),
});
test("baseline retains both exact10-attribute source rows and explicit constant callback-omitted scaffold without credit", async () => {
  const { producer, reader } = await modules();
  const baseline = producer.deriveMandatoryEmailEventRows();
  reader.validateMandatoryEmailEventDerivation(baseline, "baseline");
  assert.deepEqual(producer.MANDATORY_EMAIL_EVENT_VARIANTS, [
    "baseline",
    "name-optional",
    "address-optional",
  ]);
  for (const id of ["name", "address"]) {
    const target = mock.targets[id],
      binding = baseline.binding.rows.find((r) => r.id === id);
    assert.equal(binding.obligationId, target.id);
    assert.equal(binding.sourceIndex, target.index);
    assert.equal(binding.sourceRowDigest, target.rowDigest);
    assert.deepEqual(binding.sourceRow, mock.sourceRow(id));
    assert.equal(binding.facets.length, 10);
    assert.deepEqual(mock.eventRow(baseline.fixture, id), {
      ...mock.sourceRow(id),
      CaseTypeID: "HarnessNestedPRL",
    });
  }
  assert.equal(
    baseline.binding.scaffold.callback,
    "omitted-in-all-variants-no-business-callback-claim",
  );
  for (const key of [
    "sourceComplete",
    "runtimeAcceptance",
    "catalogueCredit",
    "releaseCredit",
    "activationClaim",
  ])
    assert.equal(baseline.binding[key], false);
});
test("each finite optional fault changes one source cell only, preserving other target, create rows, grants and callback scaffold", async () => {
  const { producer, reader } = await modules(),
    baseline = producer.deriveMandatoryEmailEventRows();
  for (const id of ["name", "address"]) {
    const variant = id + "-optional",
      fault = producer.deriveMandatoryEmailEventRows(variant);
    reader.validateMandatoryEmailEventDerivation(fault, variant);
    reader.validateMandatoryEmailEventFaultPair(baseline, fault, variant);
    const expected = structuredClone(baseline.fixture);
    mock.eventRow(expected, id).DisplayContext = "OPTIONAL";
    assert.deepEqual(fault.fixture, expected);
    assert.equal(
      fault.binding.scaffold.callback,
      baseline.binding.scaffold.callback,
    );
    assert.equal(
      mock.eventRow(fault.fixture, id === "name" ? "address" : "name")
        .DisplayContext,
      "MANDATORY",
    );
    assert.equal(fault.binding.mutation.column, "DisplayContext");
    assert.equal(fault.binding.mutation.before, "MANDATORY");
    assert.equal(fault.binding.mutation.after, "OPTIONAL");
  }
});
test("independent validator rejects extra sibling/source/normalization/attribution/credit changes and ineffective faults", async () => {
  const { producer, reader } = await modules(),
    baseline = producer.deriveMandatoryEmailEventRows(),
    fault = producer.deriveMandatoryEmailEventRows("name-optional");
  for (const mutate of mock.invalidChanges) {
    const invalid = structuredClone(fault);
    mutate(invalid);
    assert.throws(() =>
      reader.validateMandatoryEmailEventDerivation(invalid, "name-optional"),
    );
  }
  assert.throws(() =>
    reader.validateMandatoryEmailEventFaultPair(
      baseline,
      baseline,
      "name-optional",
    ),
  );
  assert.throws(() =>
    reader.validateMandatoryEmailEventFaultPair(
      baseline,
      producer.deriveMandatoryEmailEventRows("address-optional"),
      "name-optional",
    ),
  );
  const invalid = structuredClone(fault);
  invalid.binding.rows[0].sourceIndex = 13;
  assert.throws(() =>
    reader.validateMandatoryEmailEventDerivation(invalid, "name-optional"),
  );
  const changed = structuredClone(baseline);
  mock.eventRow(changed.fixture, "name").FieldShowCondition =
    'sodAdditionalRecipientsList.serveByPostOrEmail="post"';
  assert.throws(() =>
    reader.validateMandatoryEmailEventFaultPair(
      changed,
      fault,
      "name-optional",
    ),
  );
  for (const variant of [
    "",
    null,
    "baseline-mutant",
    "email-optional",
    "__proto__",
  ])
    assert.throws(() => producer.deriveMandatoryEmailEventRows(variant));
});
test("typed date observations retain exact version/source leaf identities with no activation or runtime acceptance", async () => {
  const { reader } = await modules();
  const got = reader.validateMandatoryEmailEventDates(mock.dateRows(3), 3);
  assert.equal(got.activationClaim, false);
  assert.equal(got.runtimeAcceptance, false);
  for (const mutate of [
    (rows) => rows.pop(),
    (rows) => (rows[0].sql_type = "text"),
    (rows) => (rows[0].live_from = "2024-01-01"),
    (rows) => (rows[0].version = 4),
    (rows) => rows.reverse(),
    (rows) => (rows[0].reference = "emailInformation.unrelated"),
  ]) {
    const invalid = mock.dateRows(3);
    mutate(invalid);
    assert.throws(() => reader.validateMandatoryEmailEventDates(invalid, 3));
  }
  for (const version of [0, NaN, 1.5, "3"])
    assert.throws(() =>
      reader.validateMandatoryEmailEventDates(mock.dateRows(3), version),
    );
});
test("producer and independent reader reject coherent but unapproved source snapshot changes", async () => {
  const fs = require("node:fs"),
    path = require("node:path");
  const file = path.join(
      __dirname,
      "fixtures/ccd/mandatory-email-event-rows.source.json",
    ),
    before = fs.readFileSync(file),
    { producer, reader } = await modules();
  const baseline = producer.deriveMandatoryEmailEventRows();
  try {
    const changed = JSON.parse(before);
    changed.sources[0].rows[0].row.EventElementLabel = "Changed source label";
    changed.sources[0].rows[0].rowDigest = (
      await import("./lib/exui-definition-references.mjs")
    ).definitionDigest(changed.sources[0].rows[0].row);
    fs.writeFileSync(file, JSON.stringify(changed, null, 2) + "\n");
    assert.throws(
      () => producer.deriveMandatoryEmailEventRows(),
      "new source must be deliberately reviewed",
    );
    assert.throws(
      () => reader.validateMandatoryEmailEventDerivation(baseline, "baseline"),
      "reader must independently bind the actual pinned source",
    );
  } finally {
    fs.writeFileSync(file, before);
  }
  assert.deepEqual(fs.readFileSync(file), before);
});
