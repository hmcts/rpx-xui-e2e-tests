# Current assurance gaps

## Team exclusion: jurisdiction-filter defect (13 November 2026)

Jenkins tags out the CMC complete profile and FR complete profile with
`@known-defect-jurisdiction-filter`. The team chose not to apply the webapp fix,
which was reverted in [webapp PR #5628](https://github.com/hmcts/rpx-xui-webapp/pull/5628).
Both complete profiles depend on jurisdiction filtering. FR's staff and ABA2
facets are consequently not executed within its complete profile either.

The report records both profiles as **NOT RUN — excluded by team**, with zero
catalogue or release credit. Their requirements remain in the catalogue and
unsatisfied. Other native phases, mandatory-email proofs and diagnostics remain
required; their failures still fail CI. A green Jenkins build does not grant
release approval or satisfy these excluded requirements.

Direct `--cmc-profile` and `--fr-profile` commands and their regression tests remain
available. Jenkins uses `--exclude-known-jurisdiction-defect`; combining that
switch with either profile opt-in is rejected. Re-enable the two profiles only
when the team accepts a product repair and their baseline and fault proofs pass.


Full EXUI release approval remains unavailable. Supporting checks and a passing bounded pilot cannot substitute for the source/runtime/owner obligations below.

## Latest local native run (synchronized Harness branch)

The latest locally replayed native candidate run used Harness commit `04089a28eb7eb90d55c91767a33606538418cb39` and sealed webapp candidate `e47ccdf14eba61dce892bd49d9a460d55775f202` (toolkit `7.4.26`), after syncing Harness master at `e50327f`. Its seven candidate/CCD pilot phases passed and cleanup completed. The validated evidence accepts **40 of 112** catalogue obligations: **23 candidate** and **17 CCD**, leaving **72 awaiting evidence**. This is bounded runtime evidence, not full EXUI release approval; `releaseApproval` is false.

That native packet includes the personal-service row, ST_CIC profile and two mandatory-email rows; do not add them again. Separate FR and CMC jurisdiction-profile attempts on the same candidate were blocked: each expected 12 rows and observed 14, including unexpected `ST_CIC` and `UNREVIEWED`. They earn no catalogue credit because the baseline did not match; the fault phases were not run. Cleanup completed.

The native timing artifact has 20 controller stages and a **36m 59.121s phase envelope**; the covered interval union is **36m 59.090s**. This is not whole assurance wall time. Jenkins queue, checkout and build are outside it. A fresh diagnostic collection passed **116/116** checks, which add no catalogue coverage. The single Odhín report was regenerated and validated with Node 24 from that diagnostic run plus the native packet. It does not include the separate blocked FR/CMC attempt details: those attempt objects were not supplied to that report collection. The PR #276 report changes add tested rendering for those outcomes, but a full-flow report containing them still needs to be generated and validated. AAT endpoint probes and Jenkins acceptance were not run for this revision.

## Previous bounded run (PR #270)

The exact-head `8915171cd9cfdeb25b07d75ee73da15244650fc2` native and AAT local run accepted runtime evidence for **34 of 112** source-catalogue obligations. Its 121 diagnostics passed, and its separate native record contains 20 baseline and 20 deliberate-fault outcomes. The native run plus evidence preparation took 34m55s locally; the diagnostic Playwright collection took 22.8s. Jenkins PR #270 build #7 passed at that head. These are distinct measures and neither one is a full-release approval.

The remaining **72 catalogue obligations** still need exact candidate or CCD evidence. The checked-in deployment-profile/key gaps and unreviewed preview-family cells also remain outside the 112-object catalogue. Earlier receipts below explain individual proof history; they must not be read as the current run's combined result. The current Odhín dashboard and public summary are the run-specific source of accepted counts.

## Live source-discovery follow-up

A separate read-only source diagnostic against the sealed webapp source at `e47ccdf14eba61dce892bd49d9a460d55775f202` and pinned PRL definitions at `694b9951e94369f1394380506960c4f04f25755d` confirmed the 1,475-file definition inventory against its pinned Git tree with zero inventory differences. It built a graph of 30,035 rows and 74,141 edges, but reported 165,416 unresolved semantic/reference gaps. Those are graph gaps, not 165,416 uncovered catalogue requirements; they prevent safe dependency-based narrowing.

That diagnostic is **not runtime evidence** and awards no credit. It returned 13 source/catalogue reconciliation errors, including webapp/deployment-source revision drift and a routing obligation identity that changes with the source revision. Its candidate-derived denominator was 113 while the reviewed catalogue remains 112, so it must not be merged into the native report. Reconcile the approved source revisions and make the routing obligation identity stable or explicitly versioned before using live discovery to change the catalogue or select focused runtime work.

## Follow-up after PR #254

PR #254 established the Harness foundation. This follow-up changes the single Odhín diagnostic report to map 121 checks to four evidence lanes and 18 slices, including exact test behaviours, jurisdictions and case types. A fresh local collection passed 116 support/model checks and all five AAT GET probes. The AAT oracle uses the pinned deployment declaration's exact eight Global Search, eight WA and twelve staff families; the previous default-profile mismatch remains preserved in its original failed evidence. AAT agreement does not identify the deployed build.

The completed native run from `16fc440` passed the family and organisation/case scope policies and remained BLOCKED at `postal-required-fields`. All 27 owned containers were removed, receipt replay matched, wrong candidate identities were rejected and input seals were unchanged. These outcomes retain that source revision and its policy; they are not results for the later role-removal addition.

The later accepted `6895660` four-phase run includes the required role-removal checks and the source event-capability phase, with validated native outcomes kept separate from diagnostic counts and source identities. It predates the routing phase and remains BLOCKED by the postal cause below. The current fixed-runner change adds a fifth PCS routing phase and exact candidate coverage binding; it still needs a new combined run before that obligation can count as executed evidence. These bounded synthetic identity/session checks do not establish immediate stale-session revocation, real OIDC login or production authorization. Postal repair, native Jenkins acceptance, durable private evidence storage and promotion integration remain open below. Merge requires passing CI for the final commit and human review; it does not approve an EXUI release.

## Postal mandatory-child constraint

The clean Harness `c024fa3` run against sealed webapp `76bf7a840fa71af466961de87294973023b2f0f3` / toolkit `7.4.21` ended BLOCKED. Family and organisation/case scope policies passed; the postal baseline failed at `postal-required-fields`.

With two Post recipients and manual AddressUK entry, the application advanced to CYA while the second postcode was blank. The imported/observed create-event definition retained `postalInformation.postalAddress.PostCode` as MANDATORY under the post condition. The test did not reach postal submission/readback. Toolkit source inspection identifies an address-child validator path limited to AddressLine1/TextMax150; complete product/definition-owner interpretation still needs review.

The optional-child mutation requires `postal-persistence`. The unrelated mandatory-field failure earns no mutation credit. That historical run retains 111 selected / 0 CCD credited / 111 missing, with no passing execution facts and releaseApproval:false. The later `6895660` job still blocks on this postal cause; its one credited cell comes only from the separate event-capability phase. The strict assertion and fixture annotations remain intact. No deployed PRL incident, successful invalid submission or actual PRL-role equivalence is inferred from this normalized synthetic fixture.

The owner action is to confirm the explicit child-mandatory semantics and fix the owning implementation or review a formally unsupported configuration classification. An updated sealed candidate must demonstrate the required baseline and intended fault. Replacing the assertion with an unrelated mandatory field does not close this gap.

## Accepted source event evidence and its limits

Clean Harness `6895660` passed the two `exui-ccd-event-capability-pilot` baselines: courtadmin form → CYA → Change → submit/readback with exactly one edited email recipient, and a judge who could read the seeded case but could not start or submit `serviceOfDocuments` with event permission `R`. Independent observer state/history were unchanged after denial. In a fresh namespace, the sole `R` → `CR` definition fault enabled the intended judge write and advanced version/history before failing `event-capability-isolation`. The accepted source and receipt are recorded in the [evidence contract](harness-evidence-contract.md#source-event-capability-phase).

This complete phase PASS credits only `configuration-cell:a6d5e8421152eca670bc39912f6781824bfc3190d2b78ed9ea7757b5f168e313`; the judge proof adds no catalogue cell. Raw replay and seals matched, and all 47 owned containers were independently confirmed absent. The whole job remains **BLOCKED (exit 2)** because the postal baseline and its fault stop at `postal-required-fields`. The fixture is normalized `HARNESS/HarnessNestedPRL` with synthetic sessions and literal source roles: no production PRL, AM/ABAC, OIDC login, CSRF enforcement, service callback, service-owner or full-release acceptance follows. No new retirements follow from this evidence.

## Catalogue and environment coverage

The accepted `6895660` job credits only the exact courtadmin/email/one-recipient cell identified above: **1 of 112 obligations**, with **111 missing**. Aggregate profiles, families, other definition/role/shared obligations and the postal sequence remain runtime gaps. Neither this normalized cell nor the separate postal sequence proves deployed PRL authorization. Source-projection expansion replaces 13 profile IDs and retains the other 98 objects; historical receipts do not alias the replacement IDs. Effective deployed environment overrides and service-owner representative grouping acceptance remain incomplete.

Checked-in base/AAT/preview profiles now have executable source accounting:15 selected environment keys per profile,45 runtime-unproved value gaps and separate owner/rendered-value gaps. Preview adds nine unreviewed families: ADOPTION, BEFTA_JURISDICTION_1/2/3, BEFTA_MASTER, DISPOSER_MASTER, PRL, PT and WA. These retain their capability keys; PRL is not aliased to PRIVATELAW. Absent declarations remain distinct from explicit null, empty strings and false. This does not expand or discharge the112 existing obligation objects.

PCS is required in current global-search, WA and staff membership. Its Java SDK/decentralised source owner is pinned to pcs-api efa1a8a4f46682a7e369d9ffc1bb8047a659c9c8, with CaseType/PCSCase/PCSCaseView/build inputs recorded. Base case type PCS is known; CASE_TYPE_SUFFIX and deployed identity remain unresolved. Definition generation/import and service runtime assurance are unproved. The profile remains config-backed with an unaccepted required gap.

The portable catalogue includes `decentralisedCaseTypeConfig` and `decentralisedServiceMap`, with one reviewed PCS routing obligation and 112 obligations in total. Pinned webapp source defines PCS-prefix UI/NoC routing and an empty default service-link map; an empty map earns no active-destination credit. The native routing pilot uses three independently journalled loopback origins for central metadata, PCS NoC and PCS UI. It exercises rendered Create/Start entry, local fallbacks and case-specific NoC session routing against an identity-bound candidate. Its complete configuration is isolated from candidate defaults so each deliberate omission is real. The fixed-runner change now executes both baselines and both omission faults as its fifth phase, then maps one candidate fact to the reviewed PCS obligation only if all four proofs pass. The earlier standalone routing receipt cannot be combined with the four-phase `6895660` receipt; the new combined run remains pending. Existing-case event/query forwarding, prefix/template interpretation, service-map destinations and effective deployed overrides remain unproved. Whole-file hashes still detect source-byte drift; source inventory does not establish complete configuration discovery or execution.

## Bounded routing evidence

Clean Harness `9586cf4` against the same sealed webapp76bf/toolkit7.4.21 completed the then-separate native routing pilot with PASS: two baseline proofs, web-destination omission at `event-redirect`, and NoC-destination omission at `noc-session-routing`. Both faults had zero retries and no unattributed errors. The parent consumed receipt `sha256:328d8fd52ba76baf39ccfdbb5e673966246a19650d1861bde4175daa292de4b9` and reported cleanup complete. Independent raw replay matched that receipt, all six owned container IDs/names were absent, and an incorrect expected artifact was rejected. Earlier incomplete trials remain BLOCKED; their synthetic ACL, accessible-label and declared-read-metadata defects were corrected without changing product assertions. This historical receipt remains a separate run and provides no credit in a newer combined report.

This is local evidence for the two named pilot obligations only. It does not resolve the postal failure, aggregate112 catalogue gaps, real service authorization or live Jenkins acceptance. Later documentation commits do not relabel the runtime source identity.

## Bounded Global Search evidence

Clean Harness `121f213` against the same sealed webapp76bf/toolkit7.4.21 passed the separate Global Search composition pilot. The baseline rendered and submitted nine services; the controlled effective-configuration fault completed a valid seven-service submission before failing only `global-search-capability-scope`. Both invocations used distinct fresh synthetic sessions and observed the actual CSRF header. There were zero retries, unattributed errors or provider rejections. Independent checks sealed 32 served JavaScript responses and 58 staged source files, replayed receipt `sha256:eb7b95db4e58b4ab48dafc6bfa4d5c121ceca8b161e888a5a81c8f6108dbd271`, accepted matching expectations and rejected a wrong artifact. All four containers were observed live and independently confirmed removed.

This proves the named configuration-composition obligation only. Synthetic labels and a legal-operations/caseworker session do not establish the former diagnostic's injected production-looking dictionary, screenshot or live solicitor-persona equivalence. Empty results and auxiliary jurisdiction metadata are transport seams. Generic label mapping, real results, authorization, cache algorithms, deployed overrides and all 112 catalogue obligations remain unproved by this pilot. Later retirement/documentation commits do not change its tested source identity.

## Bounded Hearing publication evidence

Clean Harness `c27aa8718247023b026fa7deb8ab3ccb5b382d0a` against sealed webapp76bf/toolkit7.4.21 passed the separate Node publication pilot. Actual GET `/external/config/ui` returned the independent prod Enabled4/Amendments2 contract. The derived artifact changed only the compiled amendment-data literal to the candidate enabled map, retained the same effective configuration, and returned valid Enabled4/Amendments4 before failing only `hearing-amendment-capability-map`. Independent replay accepted receipt `sha256:a5a07e408c84d7e5e4d206c6af6eebc58eb4a19ff4c2d015a8cf5149feafaf1a`; matching expectations passed, a wrong artifact was rejected, all four owned containers were absent, and52 raw files plus both seals were unchanged.

This proves publication composition only. No Hearing UI, screenshots, axe baseline, role authorization, wizard navigation, Link behavior, real HMC/service dispatch, deployed AAT/preview profile or catalogue112 credit follows. Generic frontend predicates, including the hypothetical PRL amendments-on input, are explicitly withdrawn under product-owner scope; the old UI concern metadata is planned/withdrawn. The postal failure, service-owner grouping, full-release approval and external CI gaps remain. Later retirement commits do not relabel this c27 runtime identity.

## External integration

Native execution is currently Linux/arm64 with cached pinned toolchains; actual Jenkins native provisioning/acceptance is unverified. The shared Jenkins library deletes the workspace after a job, and this configuration publishes only the validated public summary and one safe supporting EXUI Assurance Harness Odhín HTML. Live Jenkins report links/rendering are not yet accepted. Durable private raw-evidence retention remains unconfigured; job-local paths alone do not establish it. OCI supports the family adapter only. Upstream candidate metadata publication, actual external owner gates and production promotion consumption remain external integration dependencies. The repository changes grant no merge or deployment approval.

An opt-in finalized-native-phase exporter now preserves complete phase files with private modes, independent expectations, exact raw/receipt replay and a separately delivered manifest digest. Its local `f3cd7ab` filesystem canary preserved all 54 original phase files and verified the relocated copy. It does not configure a storage destination, access/retention/immutability policy or trusted CI digest handoff. Whole-job orchestration evidence, malformed/interrupted forensic capture and OCI export remain unsupported. These are still retention gaps; a local copy does not close durable CI acceptance.

Raw evidence and source-bound review scripts remain in the private workspace audit bundle. Only validated fixed-schema public summaries and the allowlisted combined supporting Odhín report may be generally published; raw diagnostic details stay private. AI-assisted; audit reference:harness-plan-execution-20261102.

## Full definition discovery does not establish CCD semantics

The reviewed PRL root contains1,475 files, including four singleton documents and environment variants. File inventory and reference discovery expose dependencies outside the original nine-file projection, while unresolved external types (including AddressUK), ambiguous declarations, unreviewed rows and opaque conditions keep selection broad. Current processor/environment semantics and owner grouping are not approved by a graph. Native compact summaries have no live graph and cannot narrow selection. Existing112 obligations, deployed-profile gaps and the postal BLOCKED result retain their original boundaries; no additional runtime or release coverage follows.

The fixed personal-service row admission path requires a fresh complete common-producer canonical run and independent raw replay before its existing catalogue ID can gain candidate credit. The retained f0ea parent-bound pair is mechanism evidence only and remains non-credit. Its nine-key contract excludes LiveFrom activation, direct server mandatory-bypass rejection, supporting-field/list semantics and the full PRL workflow. This implementation does not waive source-image dependency gates or grant release approval. The initial implementation is validated with its isolated Playwright1.64 dependencies; rebase and revalidation against the consolidated1.65 dependency lane remain required before integration/native freeze.
