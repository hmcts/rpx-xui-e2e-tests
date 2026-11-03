# Current assurance gaps

Full EXUI release approval remains unavailable. Supporting checks and a passing bounded pilot cannot substitute for the source/runtime/owner obligations below.

## Postal mandatory-child constraint

The clean Harness `c024fa3` run against sealed webapp `76bf7a840fa71af466961de87294973023b2f0f3` / toolkit `7.4.21` ended BLOCKED. Family and organisation/case scope policies passed; the postal baseline failed at `postal-required-fields`.

With two Post recipients and manual AddressUK entry, the application advanced to CYA while the second postcode was blank. The imported/observed create-event definition retained `postalInformation.postalAddress.PostCode` as MANDATORY under the post condition. The test did not reach postal submission/readback. Toolkit source inspection identifies an address-child validator path limited to AddressLine1/TextMax150; complete product/definition-owner interpretation still needs review.

The optional-child mutation requires `postal-persistence`. The unrelated mandatory-field failure earns no mutation credit. Actual catalogue accounting is 111 selected / 0 CCD credited / 111 missing, with no passing execution facts and releaseApproval:false. The strict assertion and fixture annotations remain intact. No deployed PRL incident, successful invalid submission or actual PRL-role equivalence is inferred from this normalized synthetic fixture.

The owner action is to confirm the explicit child-mandatory semantics and fix the owning implementation or review a formally unsupported configuration classification. An updated sealed candidate must demonstrate the required baseline and intended fault. Replacing the assertion with an unrelated mandatory field does not close this gap.

## Catalogue and environment coverage

All current profile/family/definition-row/role/shared obligations remain runtime gaps. The additive postal sequence is a separate normalized obligation; it cannot credit aggregate profiles or actual PRL authorization cells. Source-projection expansion replaces 13 profile IDs and retains the other 98 objects; historical receipts do not alias the replacement IDs. Effective deployed environment overrides and service-owner representative grouping acceptance remain incomplete.

PCS is required in current global-search, WA and staff membership. Its Java SDK/decentralised source owner is pinned to pcs-api efa1a8a4f46682a7e369d9ffc1bb8047a659c9c8, with CaseType/PCSCase/PCSCaseView/build inputs recorded. Base case type PCS is known; CASE_TYPE_SUFFIX and deployed identity remain unresolved. Definition generation/import and service runtime assurance are unproved. The profile remains config-backed with an unaccepted required gap.

The portable catalogue now includes `decentralisedCaseTypeConfig` and `decentralisedServiceMap`, with a separate unproved PCS routing obligation and 112 obligations in total. Pinned webapp source defines PCS-prefix UI/NoC routing and an empty default service-link map; an empty map earns no active-destination credit. Current pilots rewrite both destinations to a synthetic provider and do not exercise the routing contract. Candidate/interpreter identity binding, external-event navigation, case-specific cached NoC routing and effective deployed overrides remain unproved. Whole-file hashes still detect source-byte drift; source inventory does not establish complete configuration discovery or execution.

## External integration

Native execution is currently Linux/arm64 with cached pinned toolchains; actual Jenkins native provisioning/acceptance is unverified. OCI supports the family adapter only. Upstream candidate metadata publication, actual external owner gates and production promotion consumption remain external integration dependencies. The repository changes grant no merge or deployment approval.

Raw evidence and source-bound review scripts remain in the private workspace audit bundle. Only validated fixed-schema public summaries may be generally published. AI-assisted; audit reference:harness-plan-execution-20261102.
