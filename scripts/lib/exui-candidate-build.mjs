import semver from "semver";
import yaml from "js-yaml";

export const CANDIDATE_BUILD_IMAGE =
  "node@sha256:d862bb5d082c5ae0210ac07e8c0344cb8cf7bef6d78e9b8c50c179da923108ea";

export function readCandidateBuildContract(manifest, yarnConfiguration) {
  const nodeEngine = manifest.engines?.node;
  if (typeof nodeEngine !== "string" || !semver.validRange(nodeEngine))
    throw new Error("SOURCE_NODE_ENGINE_REQUIRED");
  const manager = /^yarn@(\d+\.\d+\.\d+)$/.exec(manifest.packageManager ?? "");
  if (!manager) throw new Error("EXACT_YARN_PACKAGE_MANAGER_REQUIRED");
  const yarnPath = yaml.load(yarnConfiguration)?.yarnPath;
  const release =
    typeof yarnPath === "string" &&
    /^\.yarn\/releases\/yarn-(\d+\.\d+\.\d+)\.cjs$/.exec(yarnPath);
  if (!release) throw new Error("COMMITTED_YARN_RELEASE_REQUIRED");
  if (release[1] !== manager[1])
    throw new Error("YARN_MANAGER_RELEASE_MISMATCH");
  return { nodeEngine, yarnVersion: manager[1], yarnPath };
}

export function assertCandidateBuildRuntime(contract, image, runtime) {
  if (
    image.platform !== "linux/arm64" ||
    runtime.platform !== "linux" ||
    runtime.architecture !== "arm64"
  )
    throw new Error("LINUX_ARM64_BUILD_IMAGE_REQUIRED");
  if (
    !/^ID=debian$/m.test(runtime.osRelease) ||
    !/^VERSION_CODENAME=bookworm$/m.test(runtime.osRelease)
  )
    throw new Error("DEBIAN_BOOKWORM_BUILD_IMAGE_REQUIRED");
  if (
    !semver.valid(runtime.nodeVersion) ||
    !semver.satisfies(runtime.nodeVersion, contract.nodeEngine)
  )
    throw new Error("SOURCE_NODE_ENGINE_MISMATCH");
}

export function candidateBuildContainerArguments({
  owner,
  build,
  image,
  script,
}) {
  if (
    !/^harness-archive-[a-f0-9-]+$/.test(owner) ||
    !/^sha256:[a-f0-9]{64}$/.test(image) ||
    !build.startsWith("/") ||
    /[,\r\n]/.test(build)
  )
    throw new Error("INVALID_OWNED_BUILD_CONTAINER");
  return [
    "create",
    "--name",
    owner,
    "--label",
    `exui.harness.owner=${owner}`,
    "--label",
    "exui.harness.service=archive-build",
    "--network",
    "none",
    "--platform",
    "linux/arm64",
    "--init",
    "--memory",
    "8g",
    "--cpus",
    "4",
    "--pids-limit",
    "512",
    "--mount",
    `type=bind,src=${build},dst=/build`,
    "--workdir",
    "/build",
    image,
    "sh",
    "-c",
    script,
  ];
}
