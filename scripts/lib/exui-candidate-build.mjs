import semver from "semver";
import yaml from "js-yaml";

export const CANDIDATE_BUILD_IMAGE =
  "node@sha256:0bab91d6a954a4a75de4a887edfda7386ed8711aa8b1eb5fb309ee0f0a2c544f";

export function candidateBuildPlatform(platform) {
  if (platform === "linux/arm64")
    return { platform, nodeArchitecture: "arm64", imageReference: CANDIDATE_BUILD_IMAGE };
  if (platform === "linux/amd64")
    return {
      platform,
      nodeArchitecture: "x64",
      imageReference: "node@sha256:6b9d4ea31e614e29f364bf75758458731eb1e105b80c99667438dd6b3fe262e0",
    };
  throw new Error("UNSUPPORTED_CANDIDATE_BUILD_PLATFORM");
}

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
  const target = candidateBuildPlatform(image.platform);
  if (
    runtime.platform !== "linux" ||
    runtime.architecture !== target.nodeArchitecture
  )
    throw new Error("LINUX_BUILD_PLATFORM_MISMATCH");
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
  uid,
  gid,
  platform = "linux/arm64",
}) {
  const target = candidateBuildPlatform(platform);
  if (
    ![uid, gid].every(value => Number.isInteger(value) && value >= 0 && value < 0xffffffff) ||
    !/^harness-archive-[a-f0-9-]+$/.test(owner) ||
    !/^sha256:[a-f0-9]{64}$/.test(image) ||
    !build.startsWith("/") ||
    /[,\r\n]/.test(build)
  )
    throw new Error("INVALID_OWNED_BUILD_CONTAINER");
  return [
    "create",
    "--user",
    `${uid}:${gid}`,
    "--name",
    owner,
    "--label",
    `exui.harness.owner=${owner}`,
    "--label",
    "exui.harness.service=archive-build",
    "--network",
    "none",
    "--platform",
    target.platform,
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
