import { provisionRoleTransitionActor } from "./lib/exui-ccd-role-transition.mjs";
import { EVENT_CAPABILITY_SCOPE, EVENT_CAPABILITY_MUTATION } from "./lib/exui-ccd-event-capability.mjs";
import { selectEventCapabilityRuntime } from "./lib/exui-ccd-event-transition.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createHmac } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  nativeInvocation,
  selectedArtifact,
  seedAppCcdSessions,
} from "./lib/exui-native-contract.mjs";
import {
  describeCandidateArtifact,
  digestCandidateTree,
} from "./lib/exui-candidate-artifact.mjs";
import { assertRuntimeIdentity } from "./lib/exui-candidate-runtime.mjs";
import { verifyHarnessDependencies } from "./lib/exui-harness-dependencies.mjs";
import { assertCandidateConfigurationSources } from "./lib/exui-configuration-catalogue.mjs";
import {
  startProviderSeams,
  scopeRoleAssignments,
  seedSyntheticSession,
} from "./lib/exui-provider-seams.mjs";
import {
  startCcdGateway,
  seedCcdSession,
} from "./lib/exui-ccd-browser-runtime.mjs";
import { digestBytes, writeJsonAtomic } from "./lib/exui-evidence-io.mjs";
import {
  ROUTING_SCOPE,
  assertRoutingInterpreter,
} from "./lib/exui-routing-contract.mjs";
import { startRoutingProviders } from "./lib/exui-routing-provider.mjs";
import { GLOBAL_SEARCH_SCOPE } from "./lib/exui-global-search-contract.mjs";
import { startGlobalSearchProviders } from "./lib/exui-global-search-provider.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const arg = (name) => process.argv[process.argv.indexOf(name) + 1];

async function providers(input, invocation, directory) {
  const source = digestBytes(
    JSON.stringify(
      input.harnessSources.map((file) => [
        file,
        digestBytes(fs.readFileSync(path.join(root, file))),
      ]),
    ),
  );
  assert.equal(
    source,
    input.harnessSourceDigest,
    "HARNESS_SOURCE_SNAPSHOT_MISMATCH",
  );
  await verifyHarnessDependencies(
    "/harness/node_modules",
    path.join(root, "package.json"),
    path.join(root, "yarn.lock"),
    input.harnessDependencies.digest,
  );
  assert.equal(
    await digestCandidateTree("/browser"),
    input.browserDigest,
    "BROWSER_ARTIFACT_MISMATCH",
  );
  const artifact = selectedArtifact(input, invocation),
    observed = await describeCandidateArtifact(
      "/candidate",
      artifact.provenance,
    );
  assertRuntimeIdentity(artifact.identity, observed.identity);
  assertCandidateConfigurationSources(
    "/candidate",
    read(path.join(root, "scripts/fixtures/exui-configuration-review.json")),
  );
  let server, cookie;
  if (input.releaseScopeId === GLOBAL_SEARCH_SCOPE) {
    ({ server, cookie } = await startGlobalSearchProviders(directory));
  } else if (input.releaseScopeId === ROUTING_SCOPE) {
    const review = read(
      path.join(root, "scripts/fixtures/exui-configuration-review.json"),
    );
    assert.deepEqual(
      assertRoutingInterpreter(
        observed,
        review,
        input.artifact.identity,
        "/candidate",
      ),
      input.routingInterpreter,
      "ROUTING_OBSERVED_INTERPRETER_MISMATCH",
    );
    ({ server, cookie } = await startRoutingProviders(directory));
  } else if (["exui-ccd-pilot", EVENT_CAPABILITY_SCOPE].includes(input.releaseScopeId)) {
    for (const [service, port] of [
      ["data", 4452],
      ["definition", 4451],
    ]) {
      const response = await fetch(`http://127.0.0.1:${port}/v3/api-docs`, {
        redirect: "error",
      });
      assert(response.ok, "CCD_API_CONTRACT_REQUIRED");
      assert.equal(
        digestBytes(JSON.stringify(await response.json())),
        input.apiContracts[service],
        "CCD_API_CONTRACT_MISMATCH",
      );
    }
    const definition = await fetch(
      "http://127.0.0.1:4451/api/data/case-type/HarnessNestedPRL",
      { headers: input.credentials.observer.headers, redirect: "error" },
    );
    assert(definition.ok, "CCD_IMPORTED_DEFINITION_REQUIRED");
    assert.equal(
      digestBytes(JSON.stringify(await definition.json())),
      input.definition.observedDefinitionDigest,
      "CCD_IMPORTED_DEFINITION_DRIFT",
    );
    const credentials = { ...input.credentials };
    if (input.releaseScopeId === "exui-ccd-pilot" && (!invocation.mutation || invocation.mutation === "ccd-stale-revoked-bearer"))
      credentials.transitioning = await provisionRoleTransitionActor({
        serviceAuthorization: input.credentials.allowed.headers.ServiceAuthorization,
      });
    const sessions = seedAppCcdSessions(credentials, seedCcdSession, input.releaseScopeId);
    cookie = sessions.allowed;
    writeJsonAtomic(path.join(directory, "personas.json"), {
      credentials,
      sessions,
    });
    server = await startCcdGateway(
      directory,
      credentials,
      input.releaseScopeId === EVENT_CAPABILITY_SCOPE ? null : invocation.mutation ?? null,
      input.releaseScopeId,
    );
  } else {
    const assignments = invocation.persona
      ? scopeRoleAssignments(invocation.persona.toUpperCase())
      : undefined;
    server = await startProviderSeams(directory, assignments);
    const persona = seedSyntheticSession(assignments);
    cookie = `s:${persona.id}.${createHmac("sha256", "synthetic-session-value").update(persona.id).digest("base64").replace(/=+$/, "")}`;
  }
  writeJsonAtomic(path.join(directory, "provider-ready.json"), {
    cookie,
    sourceDigest: source,
    artifactVerified: true,
  });
  process.once("SIGTERM", () => {
    server.close((error) => {
      if (error) process.exit(2);
      writeJsonAtomic(path.join(directory, "provider-stopped.json"), {
        closed: true,
        requestedSignal: "SIGTERM",
      });
      process.exit(0);
    });
  });
}
export function nativeProofConfiguration(input, invocation, directory) {
  const ccd = ["exui-ccd-pilot", EVENT_CAPABILITY_SCOPE].includes(input.releaseScopeId);
  const env = {
    PATH: "/usr/local/bin:/usr/bin:/bin",
    HOME: "/tmp",
    EXUI_HARNESS_SELECTION: ccd ? "ccd" : "candidate",
    EXUI_HARNESS_SLICE:
      input.releaseScopeId === EVENT_CAPABILITY_SCOPE
        ? "ccd-event-capability"
        : input.releaseScopeId === "exui-hearing-publication-pilot"
        ? "hearing-publication"
        : input.releaseScopeId === GLOBAL_SEARCH_SCOPE
        ? "global-search"
        : input.releaseScopeId === ROUTING_SCOPE
        ? "routing"
        : input.releaseScopeId === "exui-wa-scope-pilot"
          ? "scope"
          : "family",
    EXUI_CANDIDATE_RUN_MANIFEST: path.join(directory, "manifest.json"),
    EXUI_CANDIDATE_URL: "http://127.0.0.1:3100",
    EXUI_RUNTIME_IDENTITY: path.join(directory, "runtime-identity.json"),
    EXUI_CANDIDATE_ASSETS: "/candidate/dist/rpx-exui/browser",
    EXUI_HARNESS_TEST_OUTPUT: path.join(directory, "test-output"),
    EXUI_EVIDENCE_CONTEXT: path.join(directory, "context.json"),
    EXUI_EVIDENCE_REPORT: path.join(directory, "report.json"),
    EXUI_PROVIDER_REQUESTS: path.join(directory, "provider-requests.jsonl"),
    EXUI_SESSION_COOKIE: read(path.join(directory, "provider-ready.json"))
      .cookie,
    EXUI_CHROMIUM_EXECUTABLE: input.browserExecutable,
    ...(invocation.mutation
      ? { EXUI_HARNESS_MUTATION: invocation.mutation }
      : {}),
    ...(invocation.persona ? { EXUI_SCOPE_PERSONA: invocation.persona } : {}),
    ...(input.releaseScopeId === GLOBAL_SEARCH_SCOPE ? { EXUI_GLOBAL_SEARCH_EVIDENCE: directory } : {}),
    ...(input.releaseScopeId === ROUTING_SCOPE
      ? {
          EXUI_ROUTING_SESSIONS: path.join(directory, "routing-sessions.json"),
          EXUI_ROUTING_EVIDENCE: directory,
        }
      : {}),
    ...(ccd
      ? {
          EXUI_CCD_PERSONAS: path.join(directory, "personas.json"),
          EXUI_CCD_EVIDENCE: directory,
        }
      : {}),
  };
  const args = [
    "/harness/node_modules/@playwright/test/cli.js",
    "test",
    "--config",
    "/harness/playwright.harness.config.ts",
  ];
  if (input.releaseScopeId === "exui-ccd-pilot" && invocation.mutation)
    args.push(
      invocation.mutation === "ccd-stale-revoked-bearer"
        ? "role-revocation.spec.ts"
        : invocation.mutation === "ccd-drop-postal-optional-child"
        ? "postal-conditional.spec.ts"
        : invocation.mutation === "ccd-drop-child"
          ? "nested-conditional.spec.ts"
          : "case-event-policy.spec.ts",
    );
  if (input.releaseScopeId === ROUTING_SCOPE && invocation.proofFile)
    args.push(invocation.proofFile);
  return { args, env };
}
async function proof(input, invocation, directory) {
  const { args, env } = nativeProofConfiguration(input, invocation, directory);
  const child = spawn(process.execPath, args, {
    cwd: root,
    env,
    stdio: "inherit",
  });
  const terminal = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
  writeJsonAtomic(path.join(directory, "framework-terminal.json"), terminal);
  process.exitCode = terminal.signal ? 2 : terminal.code;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const baselineInput = read("/output/input.json"),
      invocation = nativeInvocation(baselineInput, arg("--invocation")),
      directory = path.join("/output", invocation.invocationId);
    const input = baselineInput.releaseScopeId === EVENT_CAPABILITY_SCOPE && invocation.invocationId === EVENT_CAPABILITY_MUTATION
      ? selectEventCapabilityRuntime(baselineInput, invocation.invocationId, read(path.join(directory, "runtime-input.json")))
      : baselineInput;
    if (process.argv.includes("--inside-providers"))
      await providers(input, invocation, directory);
    else if (process.argv.includes("--inside-proof"))
      await proof(input, invocation, directory);
    else throw Error("NATIVE_TOOLS_MODE_REQUIRED");
  } catch (error) {
    console.error(`BLOCKED: ${error.message}`);
    process.exitCode = 2;
  }
}
