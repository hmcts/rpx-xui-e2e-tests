import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import semver from "semver";
import {
  verifyCandidateArtifact,
  digestCandidateTree,
} from "./exui-candidate-artifact.mjs";
import {
  effectiveCandidateConfiguration,
  HARNESS_SOURCE_FILES,
} from "./exui-candidate-runtime.mjs";
import { CCD_HARNESS_SOURCE_FILES } from "./exui-ccd-browser-runtime.mjs";
import { verifyHarnessDependencies } from "./exui-harness-dependencies.mjs";
import { assertCandidateConfigurationSources } from "./exui-configuration-catalogue.mjs";
import { CCD_IMAGES } from "./exui-ccd-runtime.mjs";
import {
  ARM64_BROWSER_RUNTIME,
  assertBrowserRuntime,
  assertReadOnlyMountIsolation,
} from "./exui-oci-runtime.mjs";
import {
  digestBytes,
  writeJsonAtomic,
  writePublicSummary,
} from "./exui-evidence-io.mjs";
const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const blocked = () => ({ status: "BLOCKED", exitCode: 2 });
const transportEnv = () => ({ PATH: process.env.PATH });
const digest = (value) => /^sha256:[a-f0-9]{64}$/.test(value ?? "");
const safePath = (value) =>
  typeof value === "string" && path.isAbsolute(value) && !/[\r\n,]/.test(value);
export function validateCiJob(input) {
  assert(
    input &&
      Object.keys(input).sort().join(",") ===
        "browserCache,candidateManifest,expectedArtifactDigest,output,schemaVersion",
    "STRICT_CI_JOB_REQUIRED",
  );
  assert.equal(input.schemaVersion, 1, "CI_JOB_SCHEMA_REQUIRED");
  for (const key of ["candidateManifest", "browserCache", "output"])
    assert(safePath(input[key]), "ABSOLUTE_SAFE_CI_PATH_REQUIRED");
  assert(
    digest(input.expectedArtifactDigest),
    "EXPECTED_ARTIFACT_DIGEST_REQUIRED",
  );
  return structuredClone(input);
}
function canonicalProspective(file) {
  const missing = [];
  let ancestor = path.resolve(file);
  for (;;) {
    try {
      fs.lstatSync(ancestor);
      break;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      missing.unshift(path.basename(ancestor));
      const parent = path.dirname(ancestor);
      assert.notEqual(parent, ancestor, "CI_OUTPUT_PARENT_REQUIRED");
      ancestor = parent;
    }
  }
  return path.join(fs.realpathSync(ancestor), ...missing);
}
export function writeCiPublicSummary(
  output,
  verdict,
  receiptAvailable = false,
) {
  const canonical = fs.realpathSync(output);
  assert.equal(path.resolve(output), canonical, "CI_PUBLIC_ROOT_ALIAS");
  const directory = path.join(canonical, "public");
  try {
    fs.mkdirSync(directory, { mode: 0o700 });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
  const info = fs.lstatSync(directory);
  assert(
    info.isDirectory() &&
      !info.isSymbolicLink() &&
      fs.realpathSync(directory) === directory,
    "CI_PUBLIC_DIRECTORY_ESCAPE",
  );
  const file = path.join(directory, "release-assurance-summary.json");
  try {
    const existing = fs.lstatSync(file);
    assert(
      existing.isFile() && !existing.isSymbolicLink(),
      "CI_PUBLIC_FILE_ESCAPE",
    );
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  writePublicSummary(file, verdict, receiptAvailable);
}
export function createCiOutput(output, readonlyRoots = []) {
  const canonical = canonicalProspective(output);
  for (const root of readonlyRoots.map(canonicalProspective))
    assert(
      canonical !== root &&
        !canonical.startsWith(root + path.sep) &&
        !root.startsWith(canonical + path.sep),
      "CI_OUTPUT_IMMUTABLE_INPUT_OVERLAP",
    );
  fs.mkdirSync(path.dirname(canonical), { recursive: true });
  try {
    fs.mkdirSync(canonical, { mode: 0o700 });
  } catch (error) {
    if (error.code === "EEXIST") throw Error("FRESH_CI_OUTPUT_REQUIRED");
    throw error;
  }
  fs.mkdirSync(path.join(canonical, "private"), { mode: 0o700 });
  writeCiPublicSummary(canonical, blocked());
  return canonical;
}
function command(command, args) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    env: transportEnv(),
    encoding: "utf8",
    timeout: 10000,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error || result.status !== 0)
    throw Error("CI_TOOL_COMMAND_FAILED");
  return result.stdout.trim();
}
export function observeCiToolchain({
  run = command,
  controller = {
    os: process.platform,
    architecture: process.arch,
    node: process.version,
  },
} = {}) {
  const server = JSON.parse(
    run("docker", ["version", "--format", "{{json .Server}}"]),
  );
  assert.equal(server.Os, "linux", "CI_LINUX_DOCKER_REQUIRED");
  assert.equal(server.Arch, "arm64", "CI_ARM64_DOCKER_REQUIRED");
  assert(
    ["linux", "darwin"].includes(controller.os),
    "CI_UNSUPPORTED_CONTROLLER_OS",
  );
  assert(
    semver.satisfies(
      controller.node,
      read(path.join(ROOT, "package.json")).engines.node,
    ),
    "CI_NODE_ENGINE_MISMATCH",
  );
  const runtime = JSON.parse(
    run("docker", ["image", "inspect", ARM64_BROWSER_RUNTIME]),
  )[0];
  assertBrowserRuntime(runtime, ARM64_BROWSER_RUNTIME, "linux/arm64");
  const ccdImages = {};
  for (const [service, image] of Object.entries(CCD_IMAGES)) {
    const info = JSON.parse(run("docker", ["image", "inspect", image]))[0];
    assert.equal(info.Id, image, "CI_CCD_IMAGE_IDENTITY_MISMATCH");
    assert.equal(info.Os, "linux", "CI_CCD_IMAGE_OS_MISMATCH");
    assert.equal(info.Architecture, "arm64", "CI_CCD_IMAGE_PLATFORM_MISMATCH");
    assert(
      info.RepoDigests?.some((ref) => ref.endsWith("@" + image)),
      "CI_CCD_IMAGE_PROVENANCE_REQUIRED",
    );
    ccdImages[service] = {
      image: info.Id,
      os: info.Os,
      architecture: info.Architecture,
    };
  }
  return {
    controller,
    docker: {
      os: server.Os,
      architecture: server.Arch,
      version: server.Version,
    },
    browserRuntime: {
      image: runtime.Id,
      os: runtime.Os,
      architecture: runtime.Architecture,
    },
    ccdImages,
  };
}

export async function prepareCiJob(job, output) {
  const artifact = await verifyCandidateArtifact(job.candidateManifest);
  assert.equal(
    artifact.identity.artifactDigest,
    job.expectedArtifactDigest,
    "DECLARED_ARTIFACT_DIGEST_MISMATCH",
  );
  assert.equal(
    artifact.provenance.platform,
    "linux/arm64",
    "CI_NATIVE_ARM64_ARTIFACT_REQUIRED",
  );
  // Keep this opt-in job closed until native API authority is separated from evidence.
  throw new Error("NATIVE_CANDIDATE_AUTHORITY_ISOLATION_REQUIRED");
  assertCandidateConfigurationSources(
    artifact.candidateRoot,
    read(path.join(ROOT, "scripts/fixtures/exui-configuration-review.json")),
  );
  const observations = observeCiToolchain();
  const browserRoot = fs.realpathSync(job.browserCache);
  const browsers = read(
    path.join(ROOT, "node_modules/playwright-core/browsers.json"),
  );
  const revision = browsers.browsers.find(
    (b) => b.name === "chromium-headless-shell",
  ).revision;
  const binary = fs.readFileSync(
    path.join(
      browserRoot,
      `chromium_headless_shell-${revision}/chrome-headless-shell-linux-arm64/chrome-headless-shell`,
    ),
  );
  assert(
    binary.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46])) &&
      binary.readUInt16LE(18) === 183,
    "CI_BROWSER_PLATFORM_MISMATCH",
  );
  const dependencies = await verifyHarnessDependencies(
    path.join(ROOT, "node_modules"),
    path.join(ROOT, "package.json"),
    path.join(ROOT, "yarn.lock"),
  );
  const commit = command("git", ["rev-parse", "HEAD"]);
  assert(/^[a-f0-9]{40}$/.test(commit), "CI_HARNESS_COMMIT_REQUIRED");
  assert.equal(
    command("git", ["status", "--porcelain"]),
    "",
    "CI_CLEAN_HARNESS_REQUIRED",
  );
  assertReadOnlyMountIsolation(
    [artifact.candidateRoot, browserRoot, path.join(ROOT, "node_modules")],
    [output],
  );
  const sourceDigest = (files) =>
    digestBytes(
      JSON.stringify(
        files.map((file) => [
          file,
          digestBytes(fs.readFileSync(path.join(ROOT, file))),
        ]),
      ),
    );
  const waSourceDigest = sourceDigest(HARNESS_SOURCE_FILES);
  const context = {
    sourceDigests: {
      family: waSourceDigest,
      scope: waSourceDigest,
      ccd: sourceDigest(CCD_HARNESS_SOURCE_FILES),
    },
    job,
    artifact,
    browserRoot,
    dependencies,
    commit,
    browserDigest: await digestCandidateTree(browserRoot),
    identity: {
      ...artifact.identity,
      configurationDigest: effectiveCandidateConfiguration(
        artifact.candidateRoot,
      ).digest,
      definitionDigests: {},
      dependencyIdentities: {},
    },
  };
  writeJsonAtomic(path.join(output, "private/toolchain.json"), {
    ...observations,
    playwrightVersion: dependencies.playwrightVersion,
  });
  return context;
}
