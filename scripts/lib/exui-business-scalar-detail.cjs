const assert = require("node:assert/strict");
const attachmentName = "harness-business-scalars-v1";
const contentType = "application/vnd.hmcts.harness-business-scalars+json";
const nested = ["ccd-nested-roundtrip", "ccd-child-loss"];
const scope = ["wa-org-scope-ia", "wa-scope-broadened"];
const contracts = {
  nested: [
    ["emptyRecipientCount", "Normalized empty recipient count", 0],
    [
      "emptyCollectionState",
      "Empty collection representation",
      ["absent", "null", "array"],
    ],
    ["emptySubmitStatus", "Empty-control submit HTTP status", 201],
    ["recipientCount", "Populated recipient count", 1],
    ["emailAddressPresent", "Email-address child property present", true],
    ["emailAddressState", "Email-address child state", "nonempty"],
    ["submitStatus", "Populated submit HTTP status", 201],
  ],
  scope: [
    ["visibleServices", "Visible organisation services", ["IA"]],
    ["requestServices", "Browser location request services", ["IA"]],
    ["providerCodes", "Provider venue-query service codes", ["BFA1"]],
    [
      "responseStatus",
      "Browser location response HTTP status",
      "2xx (response.ok)",
    ],
  ],
};
const kind = (proof) =>
  nested.includes(proof) ? "nested" : scope.includes(proof) ? "scope" : null;
const exact = (value, keys) =>
  value &&
  !Array.isArray(value) &&
  Object.keys(value).sort().join() === keys.slice().sort().join();
const enumSet = (value, allowed) =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.length <= allowed.length &&
  new Set(value).size === value.length &&
  value.every((x) => allowed.includes(x));
function validScalar(key, value) {
  if (["emptyRecipientCount", "recipientCount"].includes(key))
    return Number.isSafeInteger(value) && value >= 0 && value <= 32;
  if (["emptySubmitStatus", "submitStatus", "responseStatus"].includes(key))
    return Number.isSafeInteger(value) && value >= 100 && value <= 599;
  if (key === "emailAddressPresent") return typeof value === "boolean";
  if (key === "emailAddressState")
    return ["absent", "null", "empty", "nonempty"].includes(value);
  if (key === "emptyCollectionState")
    return ["absent", "null", "array"].includes(value);
  if (["visibleServices", "requestServices"].includes(key))
    return enumSet(value, ["IA", "CIVIL"]);
  if (key === "providerCodes") return enumSet(value, ["BFA1", "AAA6", "AAA7"]);
  return false;
}
const unavailable = () => ({
  schemaVersion: 1,
  availability: "unavailable",
  reason: "INVALID_BUSINESS_SCALARS",
});
function validateDetail(proof, value) {
  assert(kind(proof), "BUSINESS_SCALAR_PROOF");
  assert.equal(value?.schemaVersion, 1, "BUSINESS_SCALAR_SCHEMA");
  if (value.availability === "unavailable") {
    assert(
      exact(value, ["schemaVersion", "availability", "reason"]) &&
        value.reason === "INVALID_BUSINESS_SCALARS",
      "BUSINESS_SCALAR_UNAVAILABLE",
    );
    return value;
  }
  const rows = contracts[kind(proof)];
  assert(
    exact(value, ["schemaVersion", "availability", "scalars"]) &&
      value.availability === "recorded" &&
      exact(
        value.scalars,
        rows.map((r) => r[0]),
      ),
    "BUSINESS_SCALAR_RECORD",
  );
  for (const [key] of rows) {
    const field = value.scalars[key];
    assert(
      field &&
        ["recorded", "not-reached", "no-observation"].includes(field.state),
      "BUSINESS_SCALAR_STATE",
    );
    assert(
      field.state === "recorded"
        ? exact(field, ["state", "value"]) && validScalar(key, field.value)
        : exact(field, ["state"]),
      "BUSINESS_SCALAR_VALUE",
    );
  }
  if (kind(proof) === "nested") {
    const present = value.scalars.emailAddressPresent,
      child = value.scalars.emailAddressState;
    assert(present.state === child.state, "BUSINESS_SCALAR_CHILD_PAIR");
    if (present.state === "recorded")
      assert.equal(
        present.value,
        child.value !== "absent",
        "BUSINESS_SCALAR_CHILD_PRESENCE",
      );
  }
  return value;
}
function readDetail(proof, value, result) {
  if (value === undefined) return undefined;
  try {
    validateDetail(proof, value);
    if(value.availability==='recorded'&&result?.status==='passed')assert(Object.values(value.scalars).every(field=>field.state==='recorded'),'BUSINESS_SCALAR_PASSED_PARTIAL');
    if(value.availability==='recorded'&&proof==='wa-scope-broadened'&&result?.failureId==='organisation-scope')assert(['requestServices','providerCodes','responseStatus'].every(key=>value.scalars[key].state==='not-reached'),'BUSINESS_SCALAR_EARLY_QUERY');
    return structuredClone(value);
  } catch {
    return unavailable();
  }
}
function createCapture(proof, binding) {
  assert(
    exact(binding, ["runId", "invocationId", "testId", "retry"]) &&
      [binding.runId, binding.invocationId, binding.testId].every(
        (x) => typeof x === "string" && x.length > 0 && x.length <= 256,
      ) &&
      Number.isSafeInteger(binding.retry) &&
      binding.retry >= 0,
    "BUSINESS_SCALAR_BINDING",
  );
  const { testId } = binding;
  assert(
    kind(proof) &&
      typeof testId === "string" &&
      testId.length > 0 &&
      testId.length <= 256,
    "BUSINESS_SCALAR_CAPTURE_ID",
  );
  const scalars = Object.fromEntries(
    contracts[kind(proof)].map(([key]) => [key, { state: "not-reached" }]),
  );
  let invalid = false,
    closed = false,
    providerSamples = 0;
  const record = (key, value) => {
    if (
      closed ||
      !Object.hasOwn(scalars, key) ||
      scalars[key].state === "recorded" ||
      !validScalar(key, value)
    ) {
      invalid = true;
      return;
    }
    scalars[key] = { state: "recorded", value: structuredClone(value) };
  };
  return {
    record,
    providerPoll(values) {
      // The existing expect.poll may sample repeatedly. Retain only its actual
      // latest finite single-query code set, before that unchanged assertion.
      if (
        closed ||
        !Object.hasOwn(scalars, "providerCodes") ||
        ++providerSamples > 128 ||
        !Array.isArray(values)
      ) {
        invalid = true;
        return;
      }
      if (values.length === 0) {
        scalars.providerCodes = {state:"no-observation"};
        return;
      }
      if (values.length !== 1 || !validScalar("providerCodes", values[0])) {
        invalid = true;
        return;
      }
      scalars.providerCodes = {
        state: "recorded",
        value: structuredClone(values[0]),
      };
    },
    attempt(keys) {
      for (const key of keys) {
        if (
          closed ||
          !Object.hasOwn(scalars, key) ||
          scalars[key].state !== "not-reached"
        ) {
          invalid = true;
          continue;
        }
        scalars[key] = { state: "no-observation" };
      }
    },
    nestedEmpty(observed) {
      try {
        const data = observed.state.case_data,
          rows = data.sodAdditionalRecipientsList;
        record(
          "emptyCollectionState",
          !Object.hasOwn(data, "sodAdditionalRecipientsList")
            ? "absent"
            : rows === null
              ? "null"
              : "array",
        );
        record(
          "emptyRecipientCount",
          rows == null ? 0 : Array.isArray(rows) ? rows.length : NaN,
        );
      } catch {
        invalid = true;
      }
    },
    nestedPopulated(observed) {
      try {
        const rows = observed.state.case_data.sodAdditionalRecipientsList;
        record("recipientCount", Array.isArray(rows) ? rows.length : NaN);
        if (!Array.isArray(rows)) {
          invalid = true;
          return;
        }
        if (rows.length !== 1) return;
        const email = rows[0].value.emailInformation;
        const present =
          email !== null &&
          typeof email === "object" &&
          Object.hasOwn(email, "emailAddress");
        record("emailAddressPresent", present);
        record(
          "emailAddressState",
          !present
            ? "absent"
            : email.emailAddress === null
              ? "null"
              : email.emailAddress === ""
                ? "empty"
                : typeof email.emailAddress === "string"
                  ? "nonempty"
                  : "invalid",
        );
      } catch {
        invalid = true;
      }
    },
    async publish(info) {
      await info.attach(attachmentName, {
        body: Buffer.from(JSON.stringify(this.finish())),
        contentType,
      });
    },
    finish() {
      if (closed) invalid = true;
      closed = true;
      const detail = invalid
        ? unavailable()
        : { schemaVersion: 1, availability: "recorded", scalars };
      return {
        schemaVersion: 1,
        proofId: proof,
        binding: structuredClone(binding),
        detail: readDetail(proof, detail),
      };
    },
  };
}
function extractAttachment(proof, binding, attachments, result) {
  if (!kind(proof)) return undefined;
  try {
    const selected = attachments.filter((a) => a.name === attachmentName);
    assert.equal(selected.length, 1, "BUSINESS_SCALAR_ATTACHMENT_COUNT");
    const a = selected[0];
    assert(
      a.contentType === contentType &&
        !a.path &&
        Buffer.isBuffer(a.body) &&
        a.body.length <= 8192,
      "BUSINESS_SCALAR_ATTACHMENT",
    );
    const raw = JSON.parse(a.body.toString("utf8"));
    assert(
      exact(raw, ["schemaVersion", "proofId", "binding", "detail"]) &&
        raw.schemaVersion === 1 &&
        raw.proofId === proof &&
        require("node:util").isDeepStrictEqual(raw.binding, binding),
      "BUSINESS_SCALAR_ATTACHMENT_BINDING",
    );
    return readDetail(proof, raw.detail, result);
  } catch {
    return unavailable();
  }
}
function createIaCapture(family, proof, binding) {
  assert(["IA", "CIVIL"].includes(family), "BUSINESS_SCALAR_FAMILY");
  return family === "IA"
    ? createCapture(proof, binding)
    : { attempt() {}, record() {}, providerPoll() {}, async publish() {} };
}
const methods = (proof) => {
  assert(kind(proof), "BUSINESS_SCALAR_PROOF");
  return structuredClone(contracts[kind(proof)]);
};
module.exports = {
  attachmentName,
  contentType,
  createCapture,
  createIaCapture,
  extractAttachment,
  validateDetail,
  readDetail,
  methods,
};

// Only these four display rows cross this readback boundary. No raw paths or
// test payloads enter the public projection.
function scalarProjection(evidence) {
  assert(evidence && typeof evidence.jobRunId === 'string' && /^sha256:[a-f0-9]{64}$/.test(evidence.descriptorDigest),'BUSINESS_SCALAR_SOURCE');
  const source=evidence.source;
  assert(exact(source,['harnessCommit','harnessSourceDigest','candidateArtifactDigest','webappCommit'])&&/^[a-f0-9]{40}$/.test(source.harnessCommit)&&/^[a-f0-9]{40}$/.test(source.webappCommit)&&[source.harnessSourceDigest,source.candidateArtifactDigest].every(x=>/^sha256:[a-f0-9]{64}$/.test(x)),'BUSINESS_SCALAR_SOURCE');
  const rows=[...nested,...scope].map(proofId=>{
    const phase=evidence.phases.find(p=>p.phase===(nested.includes(proofId)?'ccd':'scope'));
    const matches=[...phase.baselineProofs,...phase.faults].filter(p=>p.proofId===proofId);assert.equal(matches.length,1,'BUSINESS_SCALAR_OWNER');
    const proof=matches[0];if(proof.businessScalars!==undefined)validateDetail(proofId,proof.businessScalars);
    return {phase:phase.phase,phaseRunId:phase.runId,receiptArtifactDigest:phase.receiptArtifactDigest,proofId,invocationId:proof.invocationId,...(proof.businessScalars===undefined?{}:{businessScalars:structuredClone(proof.businessScalars)})};
  });
  return {descriptorDigest:evidence.descriptorDigest,jobRunId:evidence.jobRunId,source:structuredClone(source),rows};
}
function validateHeldReference(held,evidence) {
 const path=require('node:path');
 assert(exact(held,['path','digest'])&&typeof held.path==='string'&&path.isAbsolute(held.path)&&path.normalize(held.path)===held.path&&/^sha256:[a-f0-9]{64}$/.test(held.digest)&&held.digest===evidence.descriptorDigest,'BUSINESS_SCALAR_HELD');
}
function assertHeldProjection(held,evidence,{retiringPreviousRun=false}={}) {
 try {
  validateHeldReference(held,evidence);
  if(retiringPreviousRun)return; // Existing self-contained owned deletion only.
  assert.equal(process.versions.node.split('.')[0],'24','BUSINESS_SCALAR_NODE');
  const expected=scalarProjection(evidence),input=JSON.stringify({held,expected});assert(Buffer.byteLength(input)<=32*1024,'BUSINESS_SCALAR_INPUT_SIZE');
  const url=require('node:url').pathToFileURL(require('node:path').join(__dirname,'exui-native-report-evidence.mjs')).href;
  // A fixed import adapter is needed because the existing reader's CLI import
  // graph has guarded TLA. No caller input becomes code, argv, env or a module.
  const program=`import fs from 'node:fs';try{if(process.argv.length!==1)throw Error();const b=fs.readFileSync(0);if(b.length>32*1024)throw Error();const v=JSON.parse(b);if(Object.keys(v).sort().join()!=='expected,held')throw Error();const m=await import(${JSON.stringify(url)});const projection=m.readHeldBusinessScalarProjection(v.held);process.stdout.write(JSON.stringify({schemaVersion:1,ok:true,projection}));}catch{process.exitCode=2;}`;
  const child=require('node:child_process').spawnSync(process.execPath,['--input-type=module','--eval',program],{input,encoding:'utf8',timeout:20*1000,killSignal:'SIGKILL',maxBuffer:32*1024,env:{PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR,NODE_DISABLE_COMPILE_CACHE:'1'}});
  assert(!child.error&&child.status===0&&child.signal===null,'BUSINESS_SCALAR_RAW_READBACK');
  const output=JSON.parse(child.stdout);assert(exact(output,['schemaVersion','ok','projection'])&&output.schemaVersion===1&&output.ok===true,'BUSINESS_SCALAR_ENVELOPE');
  assert(require('node:util').isDeepStrictEqual(output.projection,expected),'BUSINESS_SCALAR_RAW_MISMATCH');
 }catch{throw Error('PUBLIC_BUSINESS_SCALAR_RAW_INVALID');}
}
module.exports.scalarProjection=scalarProjection;
module.exports.validateHeldReference=validateHeldReference;
module.exports.assertHeldProjection=assertHeldProjection;
