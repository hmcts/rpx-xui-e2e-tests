const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const sync = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { test } = require("node:test");
const target = "dist/rpx-exui/api/server.bundle.js";
const moduleApi = () => import("./lib/exui-hearing-publication-mutation.mjs");
const enabled =
  '{".+":[{jurisdiction:"SSCS",roles:["candidate-only-role"]},{jurisdiction:"CIVIL"}]}';
const amendment = '{".+":[{jurisdiction:"CIVIL"}]}';
const source = (receiver = "t", prefix = "") =>
  Buffer.from(
    `${prefix}({33441(e,${receiver}){"use strict";${receiver}.prodHearingJurisdictions=${receiver}.prodEnableHearingAmendment=void 0,${receiver}.prodEnableHearingAmendment=${amendment},${receiver}.prodHearingJurisdictions=${enabled}}});`,
  );

test("support only: Hearing transformer replaces exact candidate data bytes with Unicode-safe ranges and renamed receivers", async () => {
  const { transformHearingPublication } = await moduleApi();
  for (const receiver of ["exports", "renamed$1"])
    for (const prefix of ["", "/* é😀 prefix */\n"]) {
      const before = source(receiver, prefix),
        result = transformHearingPublication(before);
      const start = before.indexOf(Buffer.from(amendment)),
        end = start + Buffer.byteLength(amendment);
      assert(
        result.bytes.equals(
          Buffer.concat([
            before.subarray(0, start),
            Buffer.from(enabled),
            before.subarray(end),
          ]),
        ),
      );
      assert.deepEqual(result.derivation.amendmentRange.utf8, { start, end });
      assert(result.derivation.unchangedOutsideRange);
      assert.equal(result.derivation.target, target);
      assert.notEqual(
        result.derivation.beforeDigest,
        result.derivation.afterDigest,
      );
    }
  const formatted = Buffer.from(
    `const x={};\nx.prodEnableHearingAmendment = ${amendment};\nx.prodHearingJurisdictions = ${enabled};`,
  );
  assert(
    transformHearingPublication(formatted).bytes.includes(
      Buffer.from("candidate-only-role"),
    ),
  );
});

test("support only: unsupported data, executable writes, ambiguity, syntax and encodings fail instead of guessing", async () => {
  const { transformHearingPublication } = await moduleApi();
  for (const rhs of [
    "getMap()",
    "{...other}",
    "{[key]:1}",
    "{get value(){return 1}}",
    "{x:undefined}",
    "{x:/regex/}",
    "{x:()=>1}",
    "{x:`${value}`}",
    "{x:new Object()}",
    "{__proto__:null}",
    "{constructor:1}",
    "{x:1,x:2}",
    "{x:NaN}",
    "{x:[,1]}",
  ])
    assert.throws(
      () =>
        transformHearingPublication(source().toString().replace(enabled, rhs)),
      undefined,
      rhs,
    );
  for (const bad of [
    source().toString() + `t.prodHearingJurisdictions=${enabled};`,
    source()
      .toString()
      .replace(
        "t.prodHearingJurisdictions=" + enabled,
        "u.prodHearingJurisdictions=" + enabled,
      ),
    `function a(t){t.prodEnableHearingAmendment=${amendment}} function b(t){t.prodHearingJurisdictions=${enabled}}`,
    source().toString().replace("=void 0", "=getVoid()"),
    source().toString() + `;t.prodEnableHearingAmendment=void 0;`,
    source().toString() + `;t.prodEnableHearingAmendment+=1;`,
    source()
      .toString()
      .replace(
        "t.prodEnableHearingAmendment=" + amendment,
        `t["prodEnableHearingAmendment"]=${amendment}`,
      ),
    source().toString().replace(amendment, enabled),
    "{ malformed",
  ])
    assert.throws(() => transformHearingPublication(bad));
  assert.throws(() =>
    transformHearingPublication(Buffer.from([0xff, 0xfe, 0x61, 0x00])),
  );
  assert.throws(
    () => transformHearingPublication("/*\ud800*/" + source().toString()),
    /ENCODING/,
  );
});
const provenance = {
  sourceMethod: "git-archive",
  webappCommit: "d".repeat(40),
  sourceTree: "e".repeat(40),
  platform: "linux/arm64",
  buildImage: "sha256:" + "f".repeat(64),
  install: "immutable-offline",
};
async function artifact(root) {
  const artifact = path.join(root, "base");
  for (const dir of [
    "dist/rpx-exui/api",
    "dist/rpx-exui/browser",
    "api",
    "config",
    "runtime",
    "node_modules/@hmcts/ccd-case-ui-toolkit",
  ])
    await fs.mkdir(path.join(artifact, dir), { recursive: true });
  const files = {
    [target]: source(),
    "dist/rpx-exui/browser/index.html": "<app-root/>",
    "api/package.json": "{}",
    "config/default.json": '{"independent":true}',
    "runtime/node": "sealed-node-fixture",
    "yarn.lock": "lock",
    "package.json": '{"dependencies":{"@hmcts/ccd-case-ui-toolkit":"7.4.21"}}',
    "node_modules/@hmcts/ccd-case-ui-toolkit/package.json":
      '{"version":"7.4.21"}',
  };
  for (const [file, bytes] of Object.entries(files))
    await fs.writeFile(path.join(artifact, file), bytes);
  await fs.symlink("api", path.join(artifact, "internal-link"));
  const baseline = await (
      await import("./lib/exui-candidate-artifact.mjs")
    ).describeCandidateArtifact(artifact, provenance),
    manifest = path.join(root, "baseline.json");
  await fs.writeFile(manifest, JSON.stringify(baseline));
  return { baseline, manifest };
}
test("support only: derive/seal/pair verification preserves base and all unrelated bytes under private umask; drift and forged metadata reject", async () => {
  const root = await fs.mkdtemp(
    path.join(sync.realpathSync(os.tmpdir()), "hearing-mutant-"),
  );
  const previous = process.umask(0o077);
  try {
    const { baseline, manifest } = await artifact(root),
      manifestBefore = await fs.readFile(manifest);
    const { deriveHearingPublicationMutant } =
      await import("./prepare-harness-hearing-mutant.mjs");
    const { verifyHearingPublicationMutant } = await moduleApi();
    const { verifyCandidateArtifact, describeCandidateArtifact } =
      await import("./lib/exui-candidate-artifact.mjs");
    const output = path.join(root, "derived");
    const { mutant, derivation } = await deriveHearingPublicationMutant(
      manifest,
      output,
    );
    assert.deepEqual(
      await verifyHearingPublicationMutant(baseline, mutant),
      derivation,
    );
    assert.deepEqual(await verifyCandidateArtifact(manifest), baseline);
    assert((await fs.readFile(manifest)).equals(manifestBefore));
    assert.notEqual(
      mutant.identity.artifactDigest,
      baseline.identity.artifactDigest,
    );
    for (const key of [
      "webappCommit",
      "configurationDigest",
      "toolkitDigest",
      "dependencyLockDigest",
    ])
      assert.equal(mutant.identity[key], baseline.identity[key]);
    await assert.rejects(deriveHearingPublicationMutant(manifest, output));
    await assert.rejects(
      deriveHearingPublicationMutant(
        manifest,
        path.join(baseline.candidateRoot, "nested-output"),
      ),
    );
    await fs.symlink(root, path.join(root, "alias"));
    await assert.rejects(
      deriveHearingPublicationMutant(manifest, path.join(root, "alias/new")),
    );
    for (const file of ["config/default.json", target, "extra"]) {
      const full = path.join(mutant.candidateRoot, file);
      const before = await fs.readFile(full).catch(() => null);
      await fs.writeFile(
        full,
        Buffer.concat([before ?? Buffer.alloc(0), Buffer.from("unrelated")]),
      );
      const changed = await describeCandidateArtifact(
        mutant.candidateRoot,
        mutant.provenance,
      );
      await assert.rejects(verifyHearingPublicationMutant(baseline, changed));
      if (before) await fs.writeFile(full, before);
      else await fs.unlink(full);
    }
    await assert.rejects(
      verifyHearingPublicationMutant(baseline, {
        ...mutant,
        provenance: { ...mutant.provenance, webappCommit: "f".repeat(40) },
      }),
      /PROVENANCE/,
    );
    await assert.rejects(
      verifyHearingPublicationMutant(baseline, {
        ...mutant,
        identity: {
          ...mutant.identity,
          toolkitDigest: "sha256:" + "f".repeat(64),
        },
      }),
      /IDENTITY/,
    );
    const forged = { ...mutant, payloadDigest: baseline.payloadDigest };
    await assert.rejects(verifyHearingPublicationMutant(baseline, forged));
  } finally {
    process.umask(previous);
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("support only: seal-valid API file or parent symlink cannot mutate its baseline backing file", async () => {
  for (const alias of ["file", "parent"]) {
    const root = await fs.mkdtemp(
      path.join(sync.realpathSync(os.tmpdir()), "hearing-symlink-"),
    );
    try {
      const { baseline, manifest } = await artifact(root);
      const targetFile = path.join(baseline.candidateRoot, target);
      let backing;
      if (alias === "file") {
        backing = path.join(baseline.candidateRoot, "api/hearing-data.js");
        await fs.rename(targetFile, backing);
        await fs.symlink(backing, targetFile);
      } else {
        const apiDirectory = path.dirname(targetFile),
          retained = apiDirectory + "-original";
        await fs.rename(apiDirectory, retained);
        await fs.symlink(retained, apiDirectory);
        backing = path.join(retained, "server.bundle.js");
      }
      const { describeCandidateArtifact, verifyCandidateArtifact } =
        await import("./lib/exui-candidate-artifact.mjs");
      const sealed = await describeCandidateArtifact(
        baseline.candidateRoot,
        provenance,
      );
      await fs.writeFile(manifest, JSON.stringify(sealed));
      const backingBefore = await fs.readFile(backing),
        manifestBefore = await fs.readFile(manifest);
      const { deriveHearingPublicationMutant } =
        await import("./prepare-harness-hearing-mutant.mjs");
      await assert.rejects(
        deriveHearingPublicationMutant(manifest, path.join(root, "derived")),
        /CANDIDATE_DERIVATION_TARGET_/,
      );
      assert(
        (await fs.readFile(backing)).equals(backingBefore),
        "failed derivation must not write through the copied absolute link into baseline",
      );
      assert((await fs.readFile(manifest)).equals(manifestBefore));
      assert.deepEqual(await verifyCandidateArtifact(manifest), sealed);
      assert.equal(
        sync.existsSync(path.join(root, "derived")),
        false,
        "reject before creating any output",
      );
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  }
});
