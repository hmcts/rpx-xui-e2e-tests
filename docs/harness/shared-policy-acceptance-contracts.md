# Bounded shared-policy acceptance contracts

The existing IDs `configuration-shared:nested-renderer` and `configuration-shared:role-policy` remain two catalogue obligations. The catalogue denominator stays 112. Their meaning is explicitly bounded to the reviewed PRL ServiceOfDocuments additional-recipient configuration; neither claims every EXUI renderer or authorization policy.

There is **one source case type: PRLAPPS**. `HarnessNestedPRL` is its isolated synthetic normalization, not another service. Source identity and the normalization must accompany runtime evidence.

## Nested renderer

Four required shapes: email/post, each with one/two recipients. Each must prove source child order/labels, conditional visibility, mandatory validation, optional-child preservation, visible CYA values, actual submitted data, independent CCD persistence, visible case readback, collection identity/sibling association, and no extra/lost recipient. Required effective faults are email child loss, optional postal-child loss and second-recipient loss. A positive model test or one successful shape cannot discharge the aggregate.

Existing `ccd-nested-roundtrip` / `ccd-postal-two-roundtrip` and source role read/update proofs are potential evidence inputs. They are not automatically accepted for all four shapes or all assertions. The second-recipient-loss fault needs explicit implementation/evidence.

## Role policy

The exact 16 reviewed source cells cover courtadmin/readonly × read/update × email/post × one/two recipients. Each requires literal source case-type/state/field/event ACL intersection, actor continuity, candidate visibility and real CCD status/projection. Allowed updates must persist exactly once with expected state/version/history; denied updates must preserve these independently. Separate denied-data/write-integrity and revoked-warmed-session sequences are mandatory.

Required faults reuse the definitions for removing courtadmin/readonly read permission, removing courtadmin event creation, broadening readonly update, broadening denied read, writing before returning denial, and replaying a revoked warmed bearer. Successful fault transport and application must precede the intended assertion failure. Infrastructure failure is not a fault witness.

Existing `exui-ccd-event-capability-pilot` and `exui-ccd-pilot` evidence can be considered only after source-role versus synthetic-actor distinctions are preserved and each required facet is replayed. Passing all 16 role cells alone does not supply the denied/revoked sequences or interpreter binding.

## Sources and binding

`scripts/fixtures/ccd/shared-policy-sources.json` pins PRL definition files at `694b9951`, toolkit consumer source references at `d3ab2245`, and CCD access-control consumers at the retained image's source `5c5ff0b9`. The toolkit checkout reference is not assumed to equal the candidate's installed package. A source-to-runtime binding artifact must establish the actual candidate bundle/package and CCD image mapping before acceptance; a matching version label is insufficient.

The two catalogue entries now name their relevant existing definition source keys instead of empty lists. This changes their provenance metadata only: IDs and denominator are unchanged. Additional consumer and ACL source references live in the explicit contracts.

## Implemented validation boundary

`validateSharedPolicySources()` requires the independently sealed 22-file inventory, exact schemas, unique paths, fixed repository revisions and whole-projection hash; an empty, foreign or coherently rehashed source list is rejected. `buildSharedPolicyContracts()` returns detached, digested contracts. `validateSharedPolicyContract()` rejects changed facets, sources or identifiers. `validateSharedPolicyEvidenceBindings()` requires the complete exact facet/fault/sequence inventory, exact artifact kinds, separately expected run/candidate/toolkit/CCD/definition/source-binding identities, and matching safe local artifact bytes. It rejects duplicates, missing records, boolean `observed`/`accepted` claims, altered artifacts and path escapes.

Even a complete set of sealed files returns **native-facet-replay-required**, no accepted IDs, and no runtime/catalogue credit. File integrity is not assertion truth.

A future native evidence adapter must parse and independently replay the actual proof observations, apply the existing native execution/process/cleanup validation, verify every contract assertion and effective fault, and bind the source interpreters. It must reject malformed bodies, cross-run/candidate evidence, unrelated proof IDs, synthetic-role substitution, ineffective mutations, retries and global errors. Only then may the existing catalogue IDs be reported satisfied. This change adds no acceptance adapter and grants no historical proof credit.
