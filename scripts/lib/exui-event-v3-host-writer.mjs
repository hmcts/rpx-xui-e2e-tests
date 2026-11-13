import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { digestBytes, readExecutionEvidence } from "./exui-evidence-io.mjs";
import { getReleasePolicy } from "./exui-release-policy.mjs";
import {
  EVENT_CAPABILITY_SCOPE,
  EVENT_CAPABILITY_MUTATION,
  COURTADMIN_READ_MUTATION,
  READONLY_READ_MUTATION,
  READONLY_UPDATE_MUTATION,
  COURTADMIN_UPDATE_MUTATION,
} from "./exui-ccd-event-capability.mjs";
import { SOURCE_SHAPE_MUTATIONS } from "./exui-source-shape-contract.mjs";

export const EVENT_V3_IDS = Object.freeze([
  EVENT_CAPABILITY_MUTATION,
  COURTADMIN_READ_MUTATION,
  READONLY_READ_MUTATION,
  READONLY_UPDATE_MUTATION,
  COURTADMIN_UPDATE_MUTATION,
  ...SOURCE_SHAPE_MUTATIONS,
]);
const common = [
  "manifest.json",
  "context.json",
  "personas.json",
  "ccd-requests.jsonl",
];
const roleNames = {
  [COURTADMIN_READ_MUTATION]: "courtadmin-read",
  [READONLY_READ_MUTATION]: "readonly-read",
  [READONLY_UPDATE_MUTATION]: "readonly-update",
  [COURTADMIN_UPDATE_MUTATION]: "courtadmin-cell",
};
const roles = [
  "courtadmin-read",
  "readonly-read",
  "courtadmin-cell",
  "readonly-update",
].map((name) => name + "-observation.json");
const judge = [
  "event-capability-observation.json",
  "judge-event-ui-observation.json",
];
const pair = (id) =>
  ["observation", "ui-observation"].map(
    (suffix) => "source-shape-" + id.slice(10) + "-" + suffix + ".json",
  );
const same = (a, b) =>
  assert(isDeepStrictEqual(a, b), "EVENT_V3_WRITER_INVALID");
const exact = (v, keys) =>
  same(Object.keys(v ?? {}).sort(), keys.slice().sort());
const rawKeys = [
  "readbacks",
  "framework",
  "host",
  "fixture",
  "registry",
  "denial",
  "lifecycle",
];
export function eventV3ArtifactGroups(id) {
  if (id === "baseline")
    return {
      readbacks: [
        ...common,
        ...roles,
        ...judge,
        ...SOURCE_SHAPE_MUTATIONS.flatMap(pair),
      ],
      sharedRoleArtifacts: [...common, ...roles],
      judgeEventArtifacts: [...common, ...judge],
      sourceShapeArtifacts: [
        ...common,
        ...SOURCE_SHAPE_MUTATIONS.flatMap(pair),
      ],
    };
  assert(EVENT_V3_IDS.includes(id), "EVENT_V3_WRITER_INVOCATION");
  const key = roleNames[id]
    ? "sharedRoleArtifacts"
    : id === EVENT_CAPABILITY_MUTATION
      ? "judgeEventArtifacts"
      : "sourceShapeArtifacts";
  const files = [
    ...common,
    ...(roleNames[id]
      ? [roleNames[id] + "-observation.json"]
      : id === EVENT_CAPABILITY_MUTATION
        ? judge
        : pair(id)),
  ];
  return { readbacks: files, [key]: files };
}
export function pinV3File(root, relative) {
  assert(
    path.isAbsolute(root) &&
      fs.realpathSync(root) === root &&
      relative
        .split("/")
        .every((part) => /^[a-z0-9][a-z0-9.-]*$/i.test(part) && part !== ".."),
    "EVENT_V3_WRITER_PATH",
  );
  const file = path.join(root, relative),
    stat = fs.lstatSync(file);
  assert(
    stat.isFile() &&
      stat.nlink === 1 &&
      fs.realpathSync(file) === file &&
      stat.size <= 16 * 1024 * 1024,
    "EVENT_V3_WRITER_FILE",
  );
  return { path: relative, digest: digestBytes(fs.readFileSync(file)) };
}
export function readV3File(root, ref) {
  exact(ref, ["path", "digest"]);
  same(pinV3File(root, ref.path), ref);
  return JSON.parse(fs.readFileSync(path.join(root, ref.path), "utf8"));
}
export function writeV3File(root, relative, value) {
  assert(fs.realpathSync(root) === root, "EVENT_V3_WRITER_ROOT");
  const parts = relative.split("/");
  assert(
    parts.every((part) => /^[a-z0-9][a-z0-9.-]*$/i.test(part) && part !== ".."),
    "EVENT_V3_WRITER_PATH",
  );
  let directory = root;
  for (const part of parts.slice(0, -1)) {
    directory = path.join(directory, part);
    if (!fs.existsSync(directory)) fs.mkdirSync(directory, { mode: 0o700 });
    assert(
      fs.lstatSync(directory).isDirectory() &&
        fs.realpathSync(directory) === directory,
      "EVENT_V3_WRITER_ALIAS",
    );
  }
  const temporary = path.join(directory, "." + randomUUID() + ".json"),
    target = path.join(root, relative);
  try {
    fs.writeFileSync(temporary, JSON.stringify(value), {
      flag: "wx",
      mode: 0o600,
    });
    fs.linkSync(temporary, target);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
  return pinV3File(root, relative);
}
export function captureV3ExecutionArtifacts(root, id) {
  const groups = eventV3ArtifactGroups(id);
  return Object.fromEntries(
    Object.entries(groups)
      .filter(([key]) => key !== "readbacks")
      .map(([key, names]) => [
        key,
        names.map((name) => pinV3File(root, id + "/" + name)),
      ]),
  );
}
export function validateV3ObservedTerminal(value, code) {
  exact(value, [
    "started",
    "observed",
    "forced",
    "cancelled",
    "code",
    "signal",
  ]);
  assert(
    value.started === true &&
      value.observed === true &&
      value.forced === false &&
      value.cancelled === false &&
      value.signal === null &&
      value.code === code,
    "EVENT_V3_WRITER_TERMINAL",
  );
}
const record = (input, id, kind, ordinal, sequence) => ({
  schemaVersion: 3,
  kind,
  runId: input.runId,
  invocationId: id,
  ordinal,
  sequence,
});
export function writeV3ProofStart(root, input, id, ack) {
  const ordinal = EVENT_V3_IDS.indexOf(id) + 1;
  assert(ordinal > 0, "EVENT_V3_WRITER_INVOCATION");
  return writeV3File(root, "v3/" + id + "/proof-start.json", {
    ...record(input, id, "proof-start", ordinal, 4 + (ordinal - 1) * 5),
    ack,
  });
}
export function writeV3Completion(
  root,
  { input, id, ack = null, proof = null, checkpointDigest = null, facts },
) {
  const ordinal = id === "baseline" ? 0 : EVENT_V3_IDS.indexOf(id) + 1;
  assert(
    ordinal >= 0 && input.releaseScopeId === EVENT_CAPABILITY_SCOPE,
    "EVENT_V3_WRITER_SCOPE",
  );
  const code = ordinal ? 1 : 0;
  validateV3ObservedTerminal(facts.host, code);
  validateV3ObservedTerminal(facts.fixture, 0);
  if (ordinal) {
    same(ack, pinV3File(root, "v3/" + id + "/ack.json"));
    same(proof, pinV3File(root, "v3/" + id + "/proof-start.json"));
    const started = readV3File(root, proof);
    same(started, {
      ...record(input, id, "proof-start", ordinal, 4 + (ordinal - 1) * 5),
      ack,
    });
    same(checkpointDigest, null);
  } else {
    same(ack, null);
    same(proof, null);
    assert(
      typeof checkpointDigest === "string" &&
        /^sha256:[a-f0-9]{64}$/.test(checkpointDigest),
      "EVENT_V3_CHECKPOINT_REQUIRED",
    );
  }
  const execution = JSON.parse(
    fs.readFileSync(path.join(root, id, "execution.json"), "utf8"),
  );
  const groups = captureV3ExecutionArtifacts(root, id);
  for (const key of [
    "sharedRoleArtifacts",
    "judgeEventArtifacts",
    "sourceShapeArtifacts",
  ])
    same(execution[key], groups[key]);
  const report = JSON.parse(
      fs.readFileSync(path.join(root, id, "report.json"), "utf8"),
    ),
    policy = getReleasePolicy(EVENT_CAPABILITY_SCOPE);
  const parsed = readExecutionEvidence(
    root,
    pinV3File(root, id + "/execution.json"),
    JSON.parse(fs.readFileSync(path.join(root, id, "manifest.json"), "utf8")),
    policy,
  );
  same(parsed.execution.unexpectedGlobalErrors, []);
  same(report.status, ordinal ? "failed" : "passed");
  same(report.globalErrors, []);
  same(execution.unexpectedGlobalErrors, []);
  same(execution.runnerExitCode, code);
  const expected = ordinal
    ? [
        policy.mutationDefinitions.find((row) => row.mutationId === id)
          .mutantProofId,
      ]
    : policy.mutationDefinitions.map((row) => row.baselineProofId);
  same(report.tests.map((row) => row.proofId).sort(), expected.slice().sort());
  for (const row of report.tests) {
    assert(
      row.retry === 0 &&
        row.expectedStatus === "passed" &&
        row.unattributedErrors === 0,
      "EVENT_V3_WRITER_PROOF",
    );
    same(row.status, ordinal ? "failed" : "passed");
    if (ordinal)
      same(
        row.failureId,
        policy.mutationDefinitions.find((item) => item.mutationId === id)
          .expectedFailureId,
      );
  }
  const framework = JSON.parse(
    fs.readFileSync(path.join(root, id, "framework-terminal.json"), "utf8"),
  );
  same(framework, { code, signal: null });
  const owned = JSON.parse(
    fs.readFileSync(path.join(root, "owned-resources.json"), "utf8"),
  );
  const registry = ["candidate", "browser-provider"].map((service) => {
    const name =
        input.runId +
        "-" +
        id +
        (service === "candidate" ? "-candidate" : "-tools"),
      rows = owned.filter((row) => row.name === name);
    same(rows.length, 1);
    const row = rows[0];
    assert(
      row.removed === true &&
        /^[a-f0-9]{64}$/.test(row.id) &&
        row.owner === input.runId &&
        row.namespace === input.ccd.namespace,
      "EVENT_V3_WRITER_RESOURCE",
    );
    same(
      row.image,
      service === "candidate"
        ? input.nativeRuntime.imageId
        : input.browserRuntimeImage,
    );
    const creator = facts.creators.find(
      (item) => item.name === name && item.id === row.id,
    );
    assert(creator, "EVENT_V3_WRITER_CREATOR");
    validateV3ObservedTerminal(creator.terminal, 0);
    return {
      service,
      id: row.id,
      name,
      owner: row.owner,
      namespace: row.namespace,
      image: row.image,
      removed: row.removed,
      creatorTerminal: creator.terminal,
      creatorEvidence: "derived-successful-command-contract",
    };
  });
  same(facts.creators.length, 2);
  const readbacks = writeV3File(root, id + "/v3-readbacks.json", {
    schemaVersion: 3,
    invocationId: id,
    files: eventV3ArtifactGroups(id).readbacks.map((name) =>
      pinV3File(root, id + "/" + name),
    ),
  });
  const raw = {
    readbacks,
    framework: pinV3File(root, id + "/framework-terminal.json"),
    host: writeV3File(root, id + "/v3-host-terminal.json", facts.host),
    fixture: writeV3File(root, id + "/v3-fixture-terminal.json", facts.fixture),
    registry: writeV3File(root, id + "/v3-owned-native.json", registry),
    denial: pinV3File(root, id + "/candidate-write-denial.json"),
    lifecycle: pinV3File(root, id + "/candidate-lifecycle.json"),
  };
  const seal = writeV3File(root, id + "/v3-raw-seal.json", {
    schemaVersion: 3,
    invocationId: id,
    files: rawKeys.map((key) => raw[key]),
  });
  return writeV3File(root, "v3/" + id + "/completion.json", {
    ...record(
      input,
      id,
      "completion",
      ordinal,
      ordinal ? 5 + (ordinal - 1) * 5 : 0,
    ),
    ack,
    proof,
    checkpointDigest,
    ...raw,
    seal,
  });
}
function validateV3Registry(rows, input, id) {
  same(
    rows.map((row) => row.service),
    ["candidate", "browser-provider"],
  );
  assert(
    new Set(rows.map((row) => row.id)).size === 2,
    "EVENT_V3_NATIVE_CID_REUSE",
  );
  for (const row of rows) {
    exact(row, [
      "service",
      "id",
      "name",
      "owner",
      "namespace",
      "image",
      "removed",
      "creatorTerminal",
      "creatorEvidence",
    ]);
    same(
      row.name,
      input.runId +
        "-" +
        id +
        (row.service === "candidate" ? "-candidate" : "-tools"),
    );
    assert(/^[a-f0-9]{64}$/.test(row.id), "EVENT_V3_NATIVE_CID");
    same(row.owner, input.runId);
    same(row.namespace, input.ccd.namespace);
    same(
      row.image,
      row.service === "candidate"
        ? input.nativeRuntime.imageId
        : input.browserRuntimeImage,
    );
    same(row.removed, true);
    same(row.creatorEvidence, "derived-successful-command-contract");
    validateV3ObservedTerminal(row.creatorTerminal, 0);
  }
}
export function readV3Completion(root, reference, input, id) {
  const value = readV3File(root, reference),
    ordinal = id === "baseline" ? 0 : EVENT_V3_IDS.indexOf(id) + 1;
  same(reference.path, "v3/" + id + "/completion.json");
  for (const [key, wanted] of Object.entries(
    record(
      input,
      id,
      "completion",
      ordinal,
      ordinal ? 5 + (ordinal - 1) * 5 : 0,
    ),
  ))
    same(value[key], wanted);
  exact(value, [
    "schemaVersion",
    "kind",
    "runId",
    "invocationId",
    "ordinal",
    "sequence",
    "ack",
    "proof",
    "checkpointDigest",
    ...rawKeys,
    "seal",
  ]);
  const paths = {
    readbacks: "v3-readbacks.json",
    framework: "framework-terminal.json",
    host: "v3-host-terminal.json",
    fixture: "v3-fixture-terminal.json",
    registry: "v3-owned-native.json",
    denial: "candidate-write-denial.json",
    lifecycle: "candidate-lifecycle.json",
  };
  for (const key of rawKeys) {
    same(value[key].path, id + "/" + paths[key]);
    readV3File(root, value[key]);
  }
  same(value.seal.path, id + "/v3-raw-seal.json");
  same(readV3File(root, value.framework), {
    code: ordinal ? 1 : 0,
    signal: null,
  });
  validateV3ObservedTerminal(readV3File(root, value.host), ordinal ? 1 : 0);
  validateV3ObservedTerminal(readV3File(root, value.fixture), 0);
  validateV3Registry(readV3File(root, value.registry), input, id);
  const seal = readV3File(root, value.seal);
  same(seal, {
    schemaVersion: 3,
    invocationId: id,
    files: rawKeys.map((key) => value[key]),
  });
  const raw = readV3File(root, value.readbacks);
  same(raw.schemaVersion, 3);
  same(raw.invocationId, id);
  same(
    raw.files.map((ref) => ref.path).sort(),
    eventV3ArtifactGroups(id)
      .readbacks.map((name) => id + "/" + name)
      .sort(),
  );
  for (const ref of raw.files) same(pinV3File(root, ref.path), ref);
  return value;
}
export async function waitV3File(
  root,
  relative,
  { isCancelled = () => false, timeoutMs = 30 * 60_000 } = {},
) {
  const deadline = Date.now() + timeoutMs;
  while (!fs.existsSync(path.join(root, relative))) {
    assert(!isCancelled(), "EVENT_V3_CANCELLED");
    assert(Date.now() < deadline, "EVENT_V3_WAIT_TIMEOUT");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert(!isCancelled(), "EVENT_V3_CANCELLED");
  return pinV3File(root, relative);
}
export async function waitV3Ack(root, input, id, { isCancelled } = {}) {
  const ordinal = EVENT_V3_IDS.indexOf(id) + 1,
    ackRef = await waitV3File(root, "v3/" + id + "/ack.json", { isCancelled });
  const captureRef = pinV3File(root, "v3/" + id + "/capture.json"),
    capture = readV3File(root, captureRef),
    ack = readV3File(root, ackRef);
  same(capture.runtimeRecord, pinV3File(root, id + "/runtime-input.json"));
  const expected = JSON.parse(
    fs.readFileSync(path.join(root, "independent-preexecution.json"), "utf8"),
  );
  const held = readV3File(
    root,
    pinV3File(root, "v3/held-before-" + ordinal + ".json"),
  );
  same(held.faults[ordinal - 1].capture, captureRef);
  same(held.faults[ordinal - 1].ack, ackRef);
  exact(capture, [
    "schemaVersion",
    "kind",
    "runId",
    "invocationId",
    "ordinal",
    "sequence",
    "pins",
    "previousRetirement",
    "runtimeRecord",
    "token",
  ]);
  for (const [key, value] of Object.entries(
    record(input, id, "capture", ordinal, 2 + (ordinal - 1) * 5),
  ))
    same(capture[key], value);
  assert(
    /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
      capture.token,
    ),
    "EVENT_V3_ACK_TOKEN",
  );
  same(
    capture.previousRetirement,
    ordinal === 1
      ? held.baseline.retirement
      : held.faults[ordinal - 2].retirement,
  );
  const { readEventSerialV3RetiredPrefix } =
    await import("./exui-ccd-event-transition-v3.mjs");
  readEventSerialV3RetiredPrefix(root, held, ordinal - 1);
  same(
    capture.pins,
    Object.fromEntries(
      [
        "nativeAuthority",
        "runId",
        "releaseScopeId",
        "harnessCommit",
        "policyDigest",
        "identity",
        "harnessSourceDigest",
        "harnessDependencyDigest",
        "browserDigest",
      ].map((key) => [key, expected[key]]),
    ),
  );
  same(ack, {
    ...record(input, id, "ack", ordinal, 3 + (ordinal - 1) * 5),
    capture: captureRef,
    token: capture.token,
  });
  for (const file of ["proof-start", "completion", "retirement"])
    assert(
      !fs.existsSync(path.join(root, "v3", id, file + ".json")),
      "EVENT_V3_LATE_ACK",
    );
  return ackRef;
}
export function writeV3Retirement(
  root,
  { input, id, completion, creators, absence },
) {
  const done = readV3Completion(root, completion, input, id),
    native = readV3File(root, done.registry);
  const resources = [
    ...Object.entries(input.ccd.containers).map(([service, cid]) => ({
      name: input.ccd.owner + "-" + service,
      id: cid,
    })),
    ...native.map(({ name, id }) => ({ name, id })),
  ];
  same(
    creators.map(({ name, id }) => ({ name, id })),
    resources,
  );
  same(
    absence.map(({ name, id }) => ({ name, id })),
    resources,
  );
  for (const row of creators) {
    exact(row, ["name", "id", "state", "terminal"]);
    same(row.state, "settled");
    validateV3ObservedTerminal(row.terminal, 0);
  }
  for (const row of absence) {
    exact(row, ["name", "id", "byId", "byName"]);
    for (const observed of [row.byId, row.byName])
      same(observed, {
        code: 1,
        signal: null,
        classification: "no-such-container",
      });
  }
  const ordinal = id === "baseline" ? 0 : EVENT_V3_IDS.indexOf(id) + 1;
  return writeV3File(root, "v3/" + id + "/retirement.json", {
    ...record(
      input,
      id,
      "retirement",
      ordinal,
      ordinal ? 6 + (ordinal - 1) * 5 : 1,
    ),
    completion,
    creators: writeV3File(root, id + "/v3-creators.json", creators),
    absence: writeV3File(root, id + "/v3-absence.json", absence),
  });
}

// Final parent publication is a retirement release, not an ordinary gate receipt.
export async function waitV3ParentRetirement(
  root,
  input,
  { isCancelled } = {},
) {
  const reference = await waitV3File(root, "v3/held-chain.json", {
    isCancelled,
  });
  const held = readV3File(root, reference),
    expected = JSON.parse(
      fs.readFileSync(path.join(root, "independent-preexecution.json"), "utf8"),
    );
  same(held.input, pinV3File(root, "input.json"));
  same(held.baselineExpected.runId, input.runId);
  same(
    held.baselineExpected,
    Object.fromEntries(
      [
        "nativeAuthority",
        "runId",
        "releaseScopeId",
        "harnessCommit",
        "policyDigest",
        "identity",
        "harnessSourceDigest",
        "harnessDependencyDigest",
        "browserDigest",
      ].map((key) => [key, expected[key]]),
    ),
  );
  const { readEventSerialV3Chain } =
    await import("./exui-ccd-event-transition-v3.mjs");
  readEventSerialV3Chain(root, held);
  return { reference, retirement: held.faults.at(-1).retirement };
}
