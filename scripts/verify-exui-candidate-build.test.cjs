const assert = require("node:assert/strict");
const { test } = require("node:test");
const load = () => import("./lib/exui-candidate-build.mjs");
const manifest = {
  engines: { node: ">=24.22.1" },
  packageManager: "yarn@4.17.1",
};
const yarnrc =
  "nodeLinker: node-modules\nyarnPath: .yarn/releases/yarn-4.17.1.cjs\n";
const image = { platform: "linux/arm64" };
const runtime = {
  nodeVersion: "v24.22.1",
  platform: "linux",
  architecture: "arm64",
  osRelease: "ID=debian\nVERSION_CODENAME=bookworm\n",
};

test("committed source contract selects its own Yarn release and a pinned Node24 Debian image", async () => {
  const api = await load();
  assert.match(api.CANDIDATE_BUILD_IMAGE, /^node@sha256:[a-f0-9]{64}$/);
  const contract = api.readCandidateBuildContract(manifest, yarnrc);
  assert.deepEqual(contract, {
    nodeEngine: ">=24.22.1",
    yarnVersion: "4.17.1",
    yarnPath: ".yarn/releases/yarn-4.17.1.cjs",
  });
  api.assertCandidateBuildRuntime(contract, image, runtime);
});

test("observed Node below the committed source engine cannot build", async () => {
  const api = await load();
  const contract = api.readCandidateBuildContract(manifest, yarnrc);
  for (const nodeVersion of ["v20.20.2", "v24.20.0", "v24.22.0"])
    assert.throws(
      () =>
        api.assertCandidateBuildRuntime(contract, image, {
          ...runtime,
          nodeVersion,
        }),
      /SOURCE_NODE_ENGINE_MISMATCH/,
    );
  api.assertCandidateBuildRuntime(contract, image, {
    ...runtime,
    nodeVersion: "v24.22.2",
  });
});

test("AMD64 build target requires observed x64 Node and selects the pinned index child", async () => {
  const api = await load();
  const contract = api.readCandidateBuildContract(manifest, yarnrc);
  const target = api.candidateBuildPlatform("linux/amd64");
  assert.equal(target.imageReference, "node@sha256:0925478b811e8890f5508ad2a75135933310effd45492696ecf7c111c8339d02");
  api.assertCandidateBuildRuntime(contract, { platform: target.platform }, { ...runtime, architecture: "x64" });
  assert.throws(() => api.assertCandidateBuildRuntime(contract, { platform: target.platform }, runtime), /BUILD_PLATFORM_MISMATCH/);
  assert.throws(() => api.candidateBuildPlatform("linux/ppc64le"), /UNSUPPORTED_CANDIDATE_BUILD_PLATFORM/);
  const args = api.candidateBuildContainerArguments({ owner: "harness-archive-abcd-1234", build: "/private/tmp/build", image: "sha256:" + "a".repeat(64), script: "true", platform: target.platform });
  assert.equal(args[args.indexOf("--platform") + 1], "linux/amd64");
  assert.equal(args[args.indexOf("--network") + 1], "none");
});

test("wrong image or runtime platform and an Alpine substitute are rejected", async () => {
  const api = await load();
  const contract = api.readCandidateBuildContract(manifest, yarnrc);
  assert.throws(
    () =>
      api.assertCandidateBuildRuntime(
        contract,
        { platform: "linux/amd64" },
        runtime,
      ),
    /BUILD_PLATFORM_MISMATCH/,
  );
  assert.throws(
    () =>
      api.assertCandidateBuildRuntime(contract, image, {
        ...runtime,
        architecture: "x64",
      }),
    /BUILD_PLATFORM_MISMATCH/,
  );
  assert.throws(
    () =>
      api.assertCandidateBuildRuntime(contract, image, {
        ...runtime,
        osRelease: "ID=alpine\n",
      }),
    /DEBIAN_BOOKWORM/,
  );
});

test("Yarn path escapes, shell metacharacters and manager/release mismatch fail before execution", async () => {
  const api = await load();
  for (const value of [
    "/tmp/yarn-4.17.1.cjs",
    "../../yarn.cjs",
    ".yarn/releases/../../outside.cjs",
    ".yarn/releases/yarn-4.17.1.cjs;touch /tmp/canary",
  ])
    assert.throws(
      () => api.readCandidateBuildContract(manifest, `yarnPath: '${value}'\n`),
      /COMMITTED_YARN_RELEASE/,
    );
  assert.throws(
    () =>
      api.readCandidateBuildContract(
        { ...manifest, packageManager: "yarn@4.18.1" },
        yarnrc,
      ),
    /YARN_MANAGER_RELEASE_MISMATCH/,
  );
  assert.throws(
    () =>
      api.readCandidateBuildContract(
        { ...manifest, packageManager: "npm@11.0.0" },
        yarnrc,
      ),
    /EXACT_YARN_PACKAGE_MANAGER/,
  );
  assert.throws(
    () =>
      api.readCandidateBuildContract({ packageManager: "yarn@4.17.1" }, yarnrc),
    /SOURCE_NODE_ENGINE_REQUIRED/,
  );
});

test("compile container is owned, offline, initialized and bounded without automatic removal before exit inspection", async () => {
  const api = await load();
  const args = api.candidateBuildContainerArguments({
    owner: "harness-archive-abcd-1234",
    build: "/private/tmp/build",
    image: "sha256:" + "a".repeat(64),
    script: "true",
  });
  assert.equal(args[0], "create");
  for (const [flag, value] of [
    ["--network", "none"],
    ["--memory", "8g"],
    ["--cpus", "4"],
    ["--pids-limit", "512"],
  ])
    assert.equal(args[args.indexOf(flag) + 1], value);
  assert.ok(args.includes("--init"));
  assert.ok(args.includes("exui.harness.owner=harness-archive-abcd-1234"));
  assert.ok(!args.includes("--rm"));
  assert.throws(
    () =>
      api.candidateBuildContainerArguments({
        owner: "unowned",
        build: "/tmp",
        image: "sha256:" + "a".repeat(64),
        script: "true",
      }),
    /INVALID_OWNED_BUILD_CONTAINER/,
  );
});
