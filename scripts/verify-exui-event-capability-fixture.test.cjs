const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const root = path.resolve(__dirname, "..");
const sourcePath = path.join(
  __dirname,
  "fixtures/ccd/event-capability.source.json",
);
const digest = (value) =>
  "sha256:" + createHash("sha256").update(value).digest("hex");
const load = async () => {
  const file = path.join(__dirname, "lib/exui-ccd-event-capability.mjs");
  assert(fs.existsSync(file), "source-bound event fixture builder is required");
  return import(file);
};
const source = () => JSON.parse(fs.readFileSync(sourcePath));
const protectedPaths = [
  "nested-prl.json",
  "nested-prl.xlsx",
  "nested-prl.binding.json",
].map((file) => path.join(__dirname, "fixtures/ccd", file));
const snapshot = () =>
  Object.fromEntries(
    protectedPaths.map((file) => [file, digest(fs.readFileSync(file))]),
  );
const protectedBefore = snapshot();
const courtadmin = "caseworker-privatelaw-courtadmin";
const judge = "caseworker-privatelaw-judge";

test("support only: event fixture has independently literal source vectors and no runtime credit", async () => {
  const api = await load();
  assert.equal(api.EVENT_CAPABILITY_SCOPE, "exui-ccd-event-capability-pilot");
  assert.equal(api.EVENT_CAPABILITY_MUTATION, "ccd-enable-judge-event");
  const pair = api.buildEventCapabilityFixtures(source());
  const rows = pair.baseline.sheets;
  for (const [role, type, event] of [
    [courtadmin, "CRU", "CRU"],
    [judge, "RU", "R"],
  ]) {
    assert.equal(
      rows.AuthorisationCaseType.find((r) => r.UserRole === role).CRUD,
      type,
    );
    assert.equal(
      rows.AuthorisationCaseState.find((r) => r.UserRole === role).CRUD,
      "CRUD",
    );
    assert.equal(
      rows.AuthorisationCaseField.find(
        (r) =>
          r.UserRole === role &&
          r.CaseFieldID === "sodAdditionalRecipientsList",
      ).CRUD,
      "CRUD",
    );
    assert.equal(
      rows.AuthorisationCaseEvent.find(
        (r) => r.UserRole === role && r.CaseEventID === "serviceOfDocuments",
      ).CRUD,
      event,
    );
  }
  assert.equal(pair.baseline.provenance.releaseCredit, false);
  assert.equal(rows.State[0].ID, "JUDICIAL_REVIEW");
  assert.equal(rows.CaseType[0].ID, "HarnessNestedPRL");
  assert.deepEqual(
    rows.AuthorisationComplexType,
    [],
    "header-only schema does not invent source child permissions",
  );
  assert(
    rows.CaseEventToFields.some(
      (r) =>
        r.FieldShowCondition ===
        'sodAdditionalRecipients="additionalRecipients"',
    ),
  );
  assert.deepEqual(snapshot(), protectedBefore);
});

test("support only: exactly judge source event R to CR changes; extra changes and forged base reject", async () => {
  const api = await load(),
    pair = api.buildEventCapabilityFixtures(source());
  assert.deepEqual(
    api.validateEventCapabilityPair(pair.baseline, pair.mutant, source()),
    {
      sheet: "AuthorisationCaseEvent",
      role: judge,
      event: "serviceOfDocuments",
      field: "CRUD",
      before: "R",
      after: "CR",
    },
  );
  const changed = structuredClone(pair.mutant);
  changed.sheets.AuthorisationCaseType.find((r) => r.UserRole === judge).CRUD =
    "CRUD";
  assert.throws(
    () => api.validateEventCapabilityPair(pair.baseline, changed, source()),
    /EVENT_CAPABILITY_PAIR_MISMATCH/,
  );
  const base = structuredClone(pair.baseline),
    fault = structuredClone(pair.mutant);
  base.sheets.AuthorisationCaseType[0].CRUD =
    fault.sheets.AuthorisationCaseType[0].CRUD = "CRUD";
  assert.throws(
    () => api.validateEventCapabilityPair(base, fault, source()),
    /EVENT_CAPABILITY_BASE_MISMATCH/,
  );
});

test("support only: changed source row cannot self-approve by changing its own row hash", async () => {
  const api = await load(),
    altered = source();
  const eventSource = altered.sources.find((s) =>
    s.path.includes("AuthorisationCaseEvent"),
  );
  eventSource.rows[0].row.AccessControl[1].CRUD = "CR";
  const canonical = (value) =>
    Array.isArray(value)
      ? value.map(canonical)
      : value && typeof value === "object"
        ? Object.fromEntries(
            Object.keys(value)
              .sort()
              .map((key) => [key, canonical(value[key])]),
          )
        : value;
  eventSource.rows[0].rowDigest = digest(
    JSON.stringify(canonical(eventSource.rows[0].row)),
  );
  assert.throws(
    () => api.buildEventCapabilityFixtures(altered),
    /EVENT_CAPABILITY_SOURCE_DRIFT/,
  );
  const revision = source();
  revision.revision = "0".repeat(40);
  assert.throws(
    () => api.buildEventCapabilityFixtures(revision),
    /EVENT_CAPABILITY_SOURCE_DRIFT/,
  );
});

test("support only: actual preparer produces deterministic sealed additive files and preserves originals", async (t) => {
  await load();
  const parent = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), "event-fixture-"),
  );
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const outputs = ["one", "two"].map((name) => path.join(parent, name));
  for (const output of outputs) {
    const result = spawnSync(
      process.execPath,
      [
        path.join(__dirname, "prepare-harness-event-capability.mjs"),
        "--output",
        output,
      ],
      { cwd: root, encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.statSync(output).mode & 0o777, 0o700);
    const binding = JSON.parse(
      fs.readFileSync(path.join(output, "binding.json")),
    );
    for (const name of ["baseline", "mutant"])
      for (const [extension, field] of [
        ["json", "sourceDigest"],
        ["xlsx", "workbookDigest"],
      ]) {
        const file = path.join(output, name + "." + extension);
        assert.equal(fs.statSync(file).mode & 0o777, 0o600);
        assert.equal(digest(fs.readFileSync(file)), binding[name][field]);
        assert.deepEqual(
          fs.readFileSync(file),
          fs.readFileSync(path.join(outputs[0], name + "." + extension)),
        );
      }
    const audit = spawnSync(
      "python3",
      [
        "-c",
        'import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; assert all(i.date_time==(2020,1,1,0,0,0) for i in z.infolist()); assert not any("externalLink" in n for n in z.namelist()); other=zipfile.ZipFile(sys.argv[2]); assert z.namelist()==other.namelist(); changed=[n for n in z.namelist() if z.read(n)!=other.read(n)]; assert len(changed)==1; import xml.etree.ElementTree as ET; ns={"x":"http://schemas.openxmlformats.org/spreadsheetml/2006/main"}; before=[e.text for e in ET.fromstring(z.read(changed[0])).findall(".//x:v",ns)]; after=[e.text for e in ET.fromstring(other.read(changed[0])).findall(".//x:v",ns)]; assert len(before)==len(after); assert [(a,b) for a,b in zip(before,after) if a!=b]==[("R","CR")]',
        path.join(output, "baseline.xlsx"),
        path.join(output, "mutant.xlsx"),
      ],
      { encoding: "utf8" },
    );
    assert.equal(audit.status, 0, audit.stderr);
  }
  const stale = spawnSync(
    process.execPath,
    [
      path.join(__dirname, "prepare-harness-event-capability.mjs"),
      "--output",
      outputs[0],
    ],
    { encoding: "utf8" },
  );
  assert.equal(stale.status, 2);
  assert.deepEqual(snapshot(), protectedBefore);
});

test("support only: extracted workbook serializer preserves every original OOXML member", (t) => {
  const parent = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), "event-writer-"),
  );
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const script = [
    "import sys,json,pathlib,zipfile",
    "sys.path.insert(0,sys.argv[1])",
    "from workbook import write_workbook",
    "base=pathlib.Path(sys.argv[1]); out=pathlib.Path(sys.argv[2])/'legacy.xlsx'",
    "write_workbook(json.loads((base/'nested-prl.json').read_text())['sheets'],out)",
    "old=zipfile.ZipFile(base/'nested-prl.xlsx'); new=zipfile.ZipFile(out)",
    "assert old.namelist()==new.namelist()",
    "assert all(old.read(name)==new.read(name) for name in old.namelist())",
  ].join("\n");
  const result = spawnSync(
    "python3",
    ["-B", "-c", script, path.join(__dirname, "fixtures/ccd"), parent],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(snapshot(), protectedBefore);
});

test("support only: preparer rejects immutable fixture overlap before any output exists", async () => {
  const { prepareEventCapabilityFixtures } =
    await import("./prepare-harness-event-capability.mjs");
  const output = path.join(
    __dirname,
    "fixtures/ccd/never-generated-inside-source",
  );
  assert.equal(fs.existsSync(output), false);
  await assert.rejects(
    prepareEventCapabilityFixtures(output),
    /CANDIDATE_DERIVATION_OUTPUT_INPUT_OVERLAP/,
  );
  assert.equal(fs.existsSync(output), false);
  assert.deepEqual(snapshot(), protectedBefore);
});

test("support only: bootstrap allowed actor has create scaffolding without source event permission", async () => {
  const { baseline, mutant } = (await load()).buildEventCapabilityFixtures(
    source(),
  );
  for (const fixture of [baseline, mutant]) {
    const sheets = fixture.sheets;
    const bootstrap = "caseworker-harness-allowed";
    assert.equal(
      sheets.AuthorisationCaseType.find((row) => row.UserRole === bootstrap)
        ?.CRUD,
      "CRU",
    );
    assert.equal(
      sheets.AuthorisationCaseState.find((row) => row.UserRole === bootstrap)
        ?.CRUD,
      "CRUD",
    );
    for (const field of sheets.CaseField)
      assert.equal(
        sheets.AuthorisationCaseField.find(
          (row) => row.UserRole === bootstrap && row.CaseFieldID === field.ID,
        )?.CRUD,
        "CRUD",
      );
    assert.equal(
      sheets.AuthorisationCaseEvent.find(
        (row) => row.UserRole === bootstrap && row.CaseEventID === "create",
      )?.CRUD,
      "CRU",
    );
    assert.equal(
      sheets.AuthorisationCaseEvent.some(
        (row) =>
          row.UserRole === bootstrap &&
          row.CaseEventID === "serviceOfDocuments",
      ),
      false,
    );
  }
});

test("support only: synthetic case-type label respects actual CCD importer limit", async () => {
  const pair = (await load()).buildEventCapabilityFixtures(source());
  for (const fixture of [pair.baseline, pair.mutant]) {
    assert(
      fixture.sheets.CaseType[0].Name.length <= 30,
      "CCD CaseType.Name maximum is30",
    );
  }
});

test("support only: required complex authorisation tab has exact headers and zero permission rows", async (t) => {
  const parent = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), "event-empty-tab-"),
  );
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const output = path.join(parent, "prepared");
  const result = spawnSync(
    process.execPath,
    [
      path.join(__dirname, "prepare-harness-event-capability.mjs"),
      "--output",
      output,
    ],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  const script = [
    "import sys,zipfile,xml.etree.ElementTree as E",
    'z=zipfile.ZipFile(sys.argv[1]); ns={"x":"http://schemas.openxmlformats.org/spreadsheetml/2006/main"}',
    'sheets=E.fromstring(z.read("xl/workbook.xml")).findall(".//x:sheet",ns)',
    'tab=next((s for s in sheets if s.attrib["name"]=="AuthorisationComplexType"),None)',
    'assert tab is not None,"required empty AuthorisationComplexType tab is absent"',
    'rid=tab.attrib["{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"]',
    'rels=E.fromstring(z.read("xl/_rels/workbook.xml.rels"))',
    'target=next(r.attrib["Target"] for r in rels if r.attrib["Id"]==rid)',
    'rows=E.fromstring(z.read("xl/"+target)).findall(".//x:row",ns)',
    'assert [int(r.attrib["r"]) for r in rows]==[1,2,3]',
    'assert [e.text for e in rows[2].findall(".//x:v",ns)]==["LiveFrom","CaseTypeID","CaseFieldID","ListElementCode","UserRole","CRUD"]',
    'assert not any(int(r.attrib["r"])>=4 for r in rows)',
  ].join("\n");
  for (const name of ["baseline", "mutant"]) {
    const checked = spawnSync(
      "python3",
      ["-B", "-c", script, path.join(output, name + ".xlsx")],
      { encoding: "utf8" },
    );
    assert.equal(checked.status, 0, checked.stderr);
  }
});
