# Explicit local corrected CCD dependency

Profile: `ccd-results-internal-id-fix-feasibility`, Linux ARM64 only. This build/verify/load path does not modify the baseline image pins or `assertCcdImageIdentity`. It produces no runtime, catalogue or release credit. It is not an upstream publication or deployed CCD fix.

## Independently sealed inputs

The verifier fixes the retained base index `230af88e…`, ARM64 manifest `2b1b4208…`, config `58a53f70…`, corrected JAR `5ddd26e3…`, reviewed patch `41ab60a7…`, corrected source inventory `0ec9d46c…`, and complete artifact provenance `15b637ed…`. The artifact directory must contain the actual JAR, correction.patch, source-inventory.json and provenance.json bytes. Caller-supplied metadata cannot replace these seals.

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

Load freshly re-verifies bytes, loads the archive, then inspects an archive-bound immutable manifest/config/index identity and compares platform, rootfs and runtime configuration. It never invents `RepoDigests`. The separate local identity helper is not a replacement for registry-backed baseline identity checks. The receipt is private and names its local-only scope.

## Remaining runtime boundary

This implementation prepares and verifies the dependency. It does not add an implicit override to `startCcdRuntime` or accept a self-reported profile as authority. A dedicated explicit runtime profile integration must rebind the verified archive/config identity during start, health checks, reuse and cleanup before the unchanged CCD POST feasibility can run on this image. Existing native acceptance scopes must continue rejecting this local dependency until an explicitly reviewed evidence policy supports it.

Actual Buildx support, base archive availability, load support and real CCD startup remain to be tested by the coordinating operator. No fallback to mutable tags, legacy search or changed authorization is allowed.

## Retained Docker archive identity

The original retained `230af88e…` identity is a Docker distribution manifest list, not a config digest. Its ARM64 child is `2b1b4208…` and that manifest selects config `58a53f70…`. The verifier independently pins all three identities and checks every selected layer and uncompressed diff ID. Docker Desktop containerd may report the manifest/index identity as `image inspect .Id`; the local loader accepts only an identity sealed in the freshly verified archive and still checks the complete rootfs and execution configuration.

The expected base archive is an ephemeral operator input at `/private/tmp/exui-ccd-retained-base.oci.tar`; it is not tracked or provisioned by this repository, and its presence can change between runs. Check the file and verify its contents with the sealed verifier before each use. A previous path or receipt does not prove the archive is still available. If it is absent, stop and recover the exact OCI bytes from an approved source; do not reconstruct a manifest digest from a Docker image ID or convert a mutable local image. The verifier accepts the original Docker media types alongside OCI media types.

### Observed Buildx compatibility projection

A previously verified Buildx export retained all 39 compressed base blob digests/sizes and all uncompressed diff IDs, changing only Docker gzip media types to their OCI gzip equivalents. Only that pair is normalized; descriptor order and every other key remain exact. This historical verification does not establish that the local input archive or corrected artifact bundle is currently present.

Buildx omitted legacy `container`, `container_config`, `docker_version`, and `config.Image` bookkeeping. It also omitted false attach/TTY/stdin flags, empty hostname/domain fields, and null `Volumes`/`OnBuild`. The verifier permits only these one-way omissions; changed or added values and nondefault omitted values reject. Receipts list every omission and media-type normalization. All other execution configuration stays exact. OCI specifies optional null as equivalent to absent: https://github.com/opencontainers/image-spec/blob/main/config.md .

Only a fixed code inventory crosses subprocess/build/CLI error boundaries; unknown diagnostic text remains generic.

Directory parent comparison first requires the directory type flag, then compares `stat.S_IMODE` (including setuid/setgid/sticky bits), uid and gid. This accommodates the actual base tar storing mode040755 and Buildx storing0755 without accepting changed permissions or ownership.
