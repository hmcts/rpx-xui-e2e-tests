import fs from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { digestBytes } from "./exui-evidence-io.mjs";

export const CANDIDATE_URL = "http://127.0.0.1:3100";
export const PROVIDER_URL = "http://127.0.0.1:3101";
export function assertRuntimeIdentity(expected, observed) {
  if (!isDeepStrictEqual(expected, observed))
    throw new Error("CANDIDATE_RUNTIME_IDENTITY_MISMATCH");
}
export function validateDestinations(
  value,
  approved = [CANDIDATE_URL, PROVIDER_URL],
  key = "",
) {
  if (Array.isArray(value)) {
    value.forEach((item) => validateDestinations(item, approved, key));
    return;
  }
  if (value && typeof value === "object") {
    for (const [name, child] of Object.entries(value))
      validateDestinations(child, approved, name);
    return;
  }
  if (typeof value !== "string") return;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    let url;
    try {
      url = new URL(value);
    } catch {
      throw new Error("INVALID_RUNTIME_DESTINATION");
    }
    if (url.username || url.password || !approved.includes(url.origin))
      throw new Error("UNDECLARED_RUNTIME_DESTINATION");
  } else if (/callback/i.test(key) && !value.startsWith("/"))
    throw new Error("INVALID_RUNTIME_CALLBACK");
}
// Only these fixed synthetic values reach the candidate; host settings and credentials are never inherited.
export function candidateEnvironment(config, output) {
  validateDestinations(config);
  return {
    PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
    HOME: "/tmp",
    NODE_ENV: "production",
    NODE_CONFIG_ENV: "harness",
    NODE_CONFIG_DIR: "/candidate/config",
    NODE_CONFIG: JSON.stringify(config),
    PORT: "3100",
    EXUI_NETWORK_REJECTIONS: path.join(output, "network-rejections.jsonl"),
    EXUI_PERSONA: "harness-supervisor",
  };
}
export function effectiveCandidateConfiguration(
  candidateRoot,
  mutation = null,
) {
  if (mutation !== null && mutation !== "wa-drop-family")
    throw new Error("UNSUPPORTED_CANDIDATE_MUTATION");
  const config = JSON.parse(
    fs.readFileSync(path.join(candidateRoot, "config/default.json"), "utf8"),
  );
  const redirect = (value) => {
    if (Array.isArray(value)) return value.map(redirect);
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value).map(([key, child]) => [key, redirect(child)]),
      );
    return typeof value === "string" && /^https?:\/\//.test(value)
      ? PROVIDER_URL
      : value;
  };
  const effective = redirect(config);
  effective.services.idam.oauthCallbackUrl = `${CANDIDATE_URL}/oauth2/callback`;
  effective.protocol = "http";
  effective.feature.appInsightsEnabled = false;
  effective.feature.redisEnabled = false;
  effective.feature.secureCookieEnabled = false;
  effective.feature.workAllocationEnabled = true;
  effective.secrets = {
    rpx: {
      "mc-session-secret": "synthetic-session-value",
      "webapp-managed-redis-connection-string": "",
      "mc-idam-client-secret": "synthetic-client-value",
      "mc-s2s-client-secret": "JBSWY3DPEHPK3PXP",
      "system-user-name": "synthetic-user",
      "system-user-password": "synthetic-password",
      "launch-darkly-client-id": "synthetic-flags",
      "appinsights-instrumentationkey-mc": "",
      "appinsights-connection-string-mc": "",
    },
  };
  if (mutation)
    effective.waSupportedJurisdictions = effective.waSupportedJurisdictions
      .split(",")
      .filter((family) => family !== "IA")
      .join(",");
  validateDestinations(effective);
  return { config: effective, digest: digestBytes(JSON.stringify(effective)) };
}
export function isolatedContainerArguments({
  harnessRoot,
  candidateRoot,
  output,
  browserRoot,
  dependenciesRoot,
  mutantRoot,
  image,
  owner,
  cidFile,
}) {
  if (
    !/^(?:candidate|ccd)-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(
      owner ?? "",
    ) ||
    cidFile !== path.join(output, "container-id")
  )
    throw new Error("OWNED_CANDIDATE_HANDOFF_REQUIRED");
  for (const value of [
    harnessRoot,
    candidateRoot,
    output,
    browserRoot,
    dependenciesRoot,
  ])
    if (!path.isAbsolute(value) || value.includes(","))
      throw new Error("INVALID_CONTAINER_MOUNT");
  if (mutantRoot && (!path.isAbsolute(mutantRoot) || mutantRoot.includes(",")))
    throw new Error("INVALID_CONTAINER_MOUNT");
  if (!/^sha256:[a-f0-9]{64}$/.test(image))
    throw new Error("PINNED_RUNTIME_IMAGE_REQUIRED");
  return [
    "run",
    "--rm",
    "--name",
    owner,
    "--label",
    `exui.harness.owner=${owner}`,
    "--label",
    "exui.harness.service=candidate-runtime",
    "--cidfile",
    cidFile,
    "--network",
    "none",
    "--read-only",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "--pids-limit",
    "256",
    "--memory",
    "4g",
    "--cpus",
    "2",
    "--shm-size",
    "512m",
    "--tmpfs",
    "/tmp:rw,nosuid,size=512m",
    "--mount",
    `type=bind,src=${harnessRoot},dst=/harness,readonly`,
    "--mount",
    `type=bind,src=${dependenciesRoot},dst=/harness/node_modules,readonly`,
    "--mount",
    `type=bind,src=${candidateRoot},dst=/candidate,readonly`,
    "--mount",
    `type=bind,src=${output},dst=/output`,
    "--mount",
    `type=bind,src=${browserRoot},dst=/browser,readonly`,
    "--workdir",
    "/harness",
    ...(mutantRoot
      ? ["--mount", `type=bind,src=${mutantRoot},dst=/mutant,readonly`]
      : []),
    image,
    "node",
    "scripts/run-harness-candidate.mjs",
    "--inside",
  ];
}

export { NATIVE_HARNESS_SOURCE_FILES as HARNESS_SOURCE_FILES } from "./exui-native-sources.mjs";

export function assertCandidateShutdown(terminal, requestedStop) {
  if (!requestedStop || terminal.code !== null || terminal.signal !== "SIGTERM")
    throw new Error("CANDIDATE_UNEXPECTED_TERMINATION");
}

// Only children spawned by this controller are signalled; Docker ownership is checked separately.
export async function terminateOwnedChild(
  child,
  { graceMs = 5000, killMs = 2000 } = {},
) {
  if (!child?.pid) return { started: false, observed: true, forced: false };
  if (Number.isInteger(child.exitCode) || typeof child.signalCode === "string")
    return {
      started: true,
      observed: true,
      forced: false,
      code: child.exitCode,
      signal: child.signalCode,
    };
  let finish;
  const terminal = new Promise((resolve) => {
    finish = (code, signal) => resolve({ code, signal });
    child.once("exit", finish);
  });
  const wait = async (milliseconds) => {
    let timer;
    try {
      return await Promise.race([
        terminal,
        new Promise((resolve) => {
          timer = setTimeout(() => resolve(null), milliseconds);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  };
  try {
    child.kill("SIGTERM");
    let result = await wait(graceMs);
    let forced = false;
    if (!result) {
      forced = true;
      child.kill("SIGKILL");
      result = await wait(killMs);
    }
    if (!result) throw new Error("OWNED_CHILD_TERMINATION_UNOBSERVED");
    return { started: true, observed: true, forced, ...result };
  } finally {
    child.removeListener("exit", finish);
  }
}
