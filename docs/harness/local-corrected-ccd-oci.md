# Explicit local corrected CCD dependency

Profile: `ccd-results-internal-id-fix-feasibility`, Linux ARM64 only. This build/verify/load path does not modify the baseline image pins or `assertCcdImageIdentity`. It produces no runtime, catalogue or release credit. It is not an upstream publication or deployed CCD fix.

## Independently sealed inputs

The verifier fixes the retained base config ID `230af88e…`, corrected JAR `5ddd26e3…`, reviewed patch `41ab60a7…`, corrected source inventory `0ec9d46c…`, and complete artifact provenance `15b637ed…`. The artifact directory must contain the actual JAR, correction.patch, source-inventory.json and provenance.json bytes. Caller-supplied metadata cannot replace these seals.

A genuine base OCI archive is required. Export/conversion from Docker-save is deliberately outside this narrow verifier; never rename a Docker image ID as a manifest digest. Base manifest/config/layers must be content-addressed and verified before build. No arbitrary registry tag is pulled by this runner. The named `ccd_base` build context points to the verified OCI layout and manifest digest.

## Commands

Use a fresh private output directory and an existing authorized Buildx builder supporting OCI-layout contexts and OCI export:

```sh
node scripts/prepare-local-ccd-oci.mjs build \
  --base /absolute/verified-base.oci.tar \
  --artifact-root /private/tmp/exui-ccd-corrected-artifact \
  --output /absolute/fresh-build-output --builder EXISTING_BUILDER

node scripts/prepare-local-ccd-oci.mjs verify \
  --base /absolute/verified-base.oci.tar \
  --derived /absolute/fresh-build-output/corrected-ccd.oci.tar \
  --artifact-root /private/tmp/exui-ccd-corrected-artifact

node scripts/prepare-local-ccd-oci.mjs load \
  --base /absolute/verified-base.oci.tar \
  --derived /absolute/fresh-build-output/corrected-ccd.oci.tar \
  --artifact-root /private/tmp/exui-ccd-corrected-artifact \
  --output /absolute/fresh-build-output
```

These commands are provided for the coordinating operator; no Docker command was executed while implementing the helper.

## Verification and loading

The Python verifier validates every OCI descriptor/blob size and digest, exactly one image manifest, platform, compressed/uncompressed layers and rootfs diff IDs. It rejects extra/duplicate entries, unsafe paths, links/device entries, unreferenced blobs, unexpected media types and bounded-expansion violations. Base config must match the retained image. Derived base layer descriptors and diff IDs must remain an exact prefix. Exactly one added layer is permitted, containing the sealed JAR and only unchanged parent-directory metadata. All execution configuration remains identical; only expected COPY history/rootfs and build timestamp changes are allowed.

Load freshly re-verifies bytes, loads the archive, then inspects the immutable config ID and compares platform, rootfs and runtime configuration. It never invents `RepoDigests`. The separate local identity helper is not a replacement for registry-backed baseline identity checks. The receipt is private and names its local-only scope.

## Remaining runtime boundary

This implementation prepares and verifies the dependency. It does not add an implicit override to `startCcdRuntime` or accept a self-reported profile as authority. A dedicated explicit runtime profile integration must rebind the verified archive/config identity during start, health checks, reuse and cleanup before the unchanged CCD POST feasibility can run on this image. Existing native acceptance scopes must continue rejecting this local dependency until an explicitly reviewed evidence policy supports it.

Actual Buildx support, base archive availability, load support and real CCD startup remain to be tested by the coordinating operator. No fallback to mutable tags, legacy search or changed authorization is allowed.
