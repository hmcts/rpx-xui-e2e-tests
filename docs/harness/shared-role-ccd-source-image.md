# Shared role CCD source-to-image witness

This witness covers six reviewed role/access consumer classes in the existing ARM64 CCD image and the explicit corrected-search derivative. It reproduces the entire corrected JAR, but makes **no whole-original-JAR rebuild claim**. It grants no runtime or catalogue credit by itself and changes no default image pin.

The independently checked GitHub commit [`5c5ff0b941dcbc7e661e8aa9e38dc51d7c30ffb3`](https://github.com/hmcts/ccd-data-store-api/commit/5c5ff0b941dcbc7e661e8aa9e38dc51d7c30ffb3) identifies tree `5b4b765f015949e62fc2f4fb9fa61ff8fdbb1300`. The retained source archive reconstructs that exact Git tree from file bytes and executable modes. The reviewed three-file patch changes search internal-ID projection and its tests; all six role consumer source hashes remain identical to the shared-policy inventory.

The reproducer creates a fresh source directory, applies the exact patch, restores archive modes changed by `git apply`, validates all3739 corrected inventory files, and runs Gradle9.4.1 `bootJar --offline --no-daemon --no-build-cache --rerun-tasks` with Temurin21.0.12+8. The original project basename is retained because Gradle embeds it in the manifest. The resulting JAR must equal `sha256:5ddd26e313cbd37dc50651155fbe7e37d1b9bc1f751c5a9185c0e26359e9c90a` byte for byte. Compiler executable, wrapper and log digests are recorded privately. The verified local toolchain/cache is required; another build environment earns no portability claim until it reproduces that exact JAR.

The existing OCI verifier hashes every archive/manifest/config/layer and validates the one-JAR derivative. The source verifier then extracts the final original JAR from those verified base layers, rejecting ambiguous paths, links and whiteouts. The original JAR must equal `sha256:1c3afe85796f549b29c14378f22ba9b3069488d04ad93b42983d8a6e79db06fc`, contain exactly the expected `build.commit`, and expose the same six class byte hashes as the freshly reproduced corrected JAR. This ties the reviewed consumers to:

- Default image `sha256:230af88ec4791950396e7a78f2dc330018d1a259242e317f4374ec5a384d30c0` through its retained OCI manifest/config chain and original JAR.
- Corrected image `sha256:0ec6bc39e2ba42645931c4f01f74beb84ff678770ea9c709b8c08cf1eb8c6ff4` through the reproduced corrected JAR and verified derivative layer.

The witness is explicitly ARM64. It does not attest to an AMD64 image, production deployment, other CCD source consumers, or a historical run's admission.

## Running the independent reconstruction

Prepare a private JSON file containing the seven absolute input paths:

```json
{
  "sourceArchive": "/absolute/pinned-source.tar.gz",
  "artifactRoot": "/absolute/corrected-artifact",
  "baseArchive": "/absolute/retained-base.oci.tar",
  "derivedArchive": "/absolute/corrected-ccd.oci.tar",
  "javaHome": "/absolute/temurin-21.0.12",
  "gradleHome": "/absolute/seeded-offline-gradle-cache",
  "output": "/absolute/fresh-reproduction-output"
}
```

Pass its path to the shared role reader with `--ccd-source-inputs /absolute/private-inputs.json`, alongside the existing candidate/CCD/event/output arguments. The production reader executes reconstruction; a receipt JSON or `verified:true` flag cannot replace it. It then binds each facet's actual native manifest and imported definition to the exact image digest, platform, import bytes, definition identity and observed version.

Fresh complete native phases must come from the same candidate and committed producer with sealed observation references. Earlier packets remain uncredited. Even after source/image binding, the whole row remains blocked until independent event-shape observation replay and the other shared-role requirements pass. Reproduction never starts Docker or modifies the retained candidate, source checkout, base image or native runtime.
