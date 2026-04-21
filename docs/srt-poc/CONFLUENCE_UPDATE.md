# EXUI Central Assurance POC for Automated SRT Reduction

## Executive Summary

- Status: Draft POC after multi-pass Codex deliberation
- Date: 2026-04-20
- Prior inputs: JAC-59 knowledge-transfer work, earlier EXUI repo analysis, previous EXUI superservice drafts, and current repo evidence from `rpx-xui-webapp` plus `rpx-xui-e2e-tests`
- Goal: reduce the cost and duration of repeated downstream service regression by proving that EXUI can centrally assure the configuration behaviour it owns, leaving only a named residual canary layer for unproven or bespoke cases

This proposal is not a single superservice answer to all EXUI regression risk. It is a central assurance model with separate lanes for different risk types.

The strongest, historically defensible proposition is:

1. EXUI should be modelled by the behaviours it actually owns.
2. Those behaviours should be centrally assured by regression type, not by downstream service ownership.
3. The umbrella operating model should therefore be `EXUI Central Assurance Model`.
4. The focus of this POC is `Lane 1: Superservice Configuration`.
5. Generic workflow-state and specialist-component risks must stay visible as separate central lanes, not be hidden inside the same promise.
6. The best initial implementation option is not docs-only, API-only, integration-only, or live-canary-heavy. It is a hybrid thin slice in `rpx-xui-e2e-tests` built from one shared scenario catalogue, one exact config-contract layer, and one small integration layer.

The intended outcome is reduction of config-related SRT, not immediate retirement of all downstream EXUI regression testing.

That framing is stronger because it matches both the repo structure and the historical incident record: some costly SRT asks were caused by central configuration risk, while others came from shared workflow-state logic or specialist UI components.

## POC Hypothesis

If EXUI-owned configuration behaviour is centrally covered through a Superservice Configuration Lane, then downstream services that only consume those supported EXUI configuration seams should not need broad config-related regression after every EXUI change.

This POC does not claim to retire all EXUI regression assurance. Historical incidents show that EXUI also needs a shared workflow or event-engine lane and a specialist component lane. Those lanes are defined here so the operating model is honest, but they are not the thin-slice proof target for this POC.

## Scope Boundary

This POC is in scope for the current thin slice:

- EXUI-owned service-family configuration
- case-type variation that changes visible EXUI behaviour
- role-sensitive gating where EXUI config already models exact role sets
- environment-specific configuration resolution
- supported, unsupported, contradictory, and impossible configuration combinations
- historical back-test against shared workflow-state and specialist-component incidents
- defining governance gates for later SRT reduction decisions

This POC is out of scope for:

- proving the shared workflow or event-engine lane through implementation in this thin slice
- proving the specialist component lane through implementation in this thin slice
- bespoke downstream service behaviour that is not represented in EXUI config or shared EXUI logic
- unsupported or unproven business-service mappings that still need live confirmation
- a claim that all downstream SRT can be removed immediately

## Problem Statement

Today EXUI changes often trigger broad downstream service regression because consuming services do not trust that EXUI configuration permutations and shared behaviour have been exercised centrally. That is expensive, slow, and duplicative.

The immediate POC question is:

Can EXUI move to a practical central assurance model, prove the configuration lane first, and then reduce repeated config-related SRT to grouped central coverage plus a named residual canary set?

The target outcome is SRT reduction first, not a one-step claim of zero downstream validation.

## Why The Original Single-Lane Superservice Idea Is Not Enough

The original superservice idea was directionally right, but too narrow.

A service-family permutation matrix would have been strong for:

- supported versus unsupported services
- role-gated tabs and filters
- feature enablement and disablement
- search, hearings, WA, and service-list visibility

It would not have been enough for:

- Previous-button and page-show-condition data loss
- hidden-field and retain-hidden payload regressions
- CYA rendering defects in nested complex structures
- Media Viewer redaction alignment and viewport issues

Those historical failures are still EXUI-owned, but they are not all configuration problems. The operating model therefore needs to be wider and clearer than a single superservice matrix.

## Recommended Operating Model: Three EXUI-Owned Assurance Lanes

The strongest option is one central EXUI assurance model with three lanes.

| Lane | What it covers | Current status in this POC |
| --- | --- | --- |
| `Lane 1: Superservice Configuration` | service family, case type, role, environment, feature, supported/unsupported/contradictory rows | thin-slice proof target |
| `Lane 2: Shared Workflow/Event Engine` | Previous/Continue flow, show-hide, CYA, hidden-value handling, callback-error navigation, route guards, common validation | named residual lane, not implemented in this thin slice |
| `Lane 3: Specialist Components` | Media Viewer and other technically distinct EXUI subsystems where rendering or geometry correctness is the risk | named residual lane, not implemented in this thin slice |

### 1. Configuration Superservice Lane

This lane covers EXUI behaviour driven by service-family, case-type, role-set, environment, and feature combination.

Typical examples:

- WA tabs, search visibility, supported-service lists
- hearings and hearing-amendment availability
- QM enablement or disablement
- staff-supported and filtered-jurisdiction behaviour
- supported, unsupported, contradictory, or impossible configuration rows

### 2. Generic Event-Engine Lane

This lane covers generic EXUI event-processing semantics that can break many services even when service-family config is unchanged.

Typical examples:

- Previous and Continue flow through conditional pages
- page-show and field-show evaluation
- CYA rendering
- retain hidden value behaviour
- stale hidden payload submission
- callback-error navigation
- create-case and event route guards
- common validation hardening

### 3. Specialist Component Lane

This lane covers technically distinct EXUI subsystems where correctness depends on rendering, browser geometry, document behaviour, or similarly specialist mechanics.

Typical examples:

- Media Viewer redaction coordinate stability
- document rendering edge cases
- other specialist UI components if incident history shows they require their own central harness

This gives one coherent proposition: EXUI should centrally assure the behaviours it owns, but those behaviours naturally fall into separate lanes and should not be forced into one matrix.

## What Was Inspected

This update builds on the earlier investigation and rechecks the main repo seams that matter for EXUI-owned behaviour:

### rpx-xui-webapp

- `config/default.json`
- `config/custom-environment-variables.json`
- `api/configuration/uiConfigRouter.ts`
- `api/configuration/hearingConfigs/*`
- `api/amendedJurisdictions/index.ts`
- `api/waSupportedJurisdictions/index.ts`
- `api/staffSupportedJurisdictions/index.ts`
- `api/globalSearch/index.ts`
- `src/app/services/ccd-config/launch-darkly-defaults.constants.ts`
- `src/cases/containers/query-management-container/*`
- legacy generic regression assets under `test_codecept/backendMock/services/ccd/**` and `test_codecept/ngIntegration/**`

### rpx-xui-e2e-tests

- current Playwright footprint and execution layers
- API plus integration plus E2E suite shape
- audit and evidence scripts already present in `package.json`

Current `rpx-xui-e2e-tests` baseline in the checked-out repo:

- `16` E2E spec files, `96` tests
- `33` integration spec files, `87` tests
- `25` API spec files, `214` tests, `4` skips

## Confirmed Repo Findings

### 1. EXUI config is stored as small service-led allowlists

The main repo-backed lists in `config/default.json` are:

- `globalSearchServices = IA,CIVIL,PRIVATELAW,PUBLICLAW,EMPLOYMENT,ST_CIC`
- `waSupportedJurisdictions = IA,CIVIL,PRIVATELAW,PUBLICLAW,EMPLOYMENT,ST_CIC`
- `staffSupportedJurisdictions = ST_CIC,CIVIL,EMPLOYMENT,PRIVATELAW,PUBLICLAW,IA,SSCS,DIVORCE,FR,PROBATE`
- `jurisdictions = DIVORCE,PROBATE,FR,PUBLICLAW,IA,SSCS,EMPLOYMENT,HRS,CIVIL,CMC,PRIVATELAW`
- `serviceRefDataMapping` entries for `IA`, `CIVIL`, `PRIVATELAW`, `PUBLICLAW`, `SSCS`, `ST_CIC`, `EMPLOYMENT`, `DIVORCE`, `FR`, and `PROBATE`

This is strong repo evidence that EXUI behaviour is already grouped by internal service family rather than by a giant service-by-jurisdiction matrix.

### 2. `/external/config/ui` is important, but it is not the whole contract

The behavioural seams fall into three classes:

- `UI bootstrap payload`: `/external/config/ui`, including flags and UI-facing config such as `headerConfig` and `hearingJurisdictionConfig`
- `service-list endpoints`: filtered jurisdictions, WA supported services, staff supported services, and global search supported services
- `runtime-filtered upstream data`: location-ref `orgServices`, CCD and ref-data driven lists, and environment-specific hearing resolution

The configuration superservice lane must cover all three seam classes. Covering only `/external/config/ui` would overclaim confidence.

### 3. Hearings already express the pattern we should reuse

The hearings config is the clearest existing example of the model we should reuse:

- `IA`: case types `Asylum` and `Bail`, with explicit role families in `prod`, `aat`, and `preview`
- `PRIVATELAW`: case type `PRLAPPS`, with explicit role families in `prod`, `aat`, and `preview`
- `SSCS`: benefit-family case types, with explicit role families in `prod`, `aat`, and `preview`
- `CIVIL`: case types include `CIVIL` and, outside prod, `GENERALAPPLICATION`
- `EMPLOYMENT`: preview hearing support is present for `ET_EnglandWales` and `ET_Scotland`, but this is not currently evidenced as prod or aat hearing support in the repo

This means role sensitivity cannot be flattened too early. Coarse archetypes are only safe for non-role-sensitive shell behaviour.

### 4. Generic event-engine regressions already have repo-visible reusable seams

The legacy suite already contains generic regression assets for hidden-field and payload semantics. Those are much closer to the right reusable model than service-by-service SRT.

This is important because major historical EXUI regressions were caused by shared event-processing logic, not by downstream-service uniqueness.

### 5. Specialist components still need explicit treatment

Current Media Viewer coverage proves basic redaction interaction, but it does not prove coordinate stability across zoom, scaling, viewport, or malformed-document conditions.

That is a strong signal that some EXUI areas need a specialist lane rather than being treated as normal service-family permutations.

### 6. EXUI already has service-specific CCD mocks and generic CCD definition builders

The EXUI repo does not only contain service-family allowlists. It also already contains two useful CCD-style testing layers:

- service-specific create-event mocks under `test_codecept/backendMock/services/ccd/solicitorCreate/*`
- generic CCD definition builders under `test_codecept/backendMock/services/ccd/solicitorCreate/ccdCaseConfig/*`

That matters because the POC does not need to invent a definition-driven model from scratch. The repo already contains:

- service examples for `Divorce`, `FR`, `IA`, `FPL`, and `Probate`
- generic builders for event triggers, wizard pages, case fields, case details, work basket inputs, and search inputs

This is strong evidence that the correct reusable shape is definition-driven and synthetic, not service-by-service live regression.

### 7. `ccd-case-ui-toolkit` adds a second generic fixture layer

The toolkit repo strengthens the same conclusion.

It already contains:

- shared test fixtures for `case_fields`, `wizard_pages`, `show_condition`, and `retain_hidden_value`
- a generic `CaseFieldBuilder`
- a large demo stub payload with nested complex structures and conditional pages

This is especially relevant to the wider Central Assurance Model because it gives EXUI a generic fixture source for:

- show-condition edge cases
- hidden-value semantics
- nested complex CYA behaviours
- multi-page wizard permutations

It is therefore useful both as supporting evidence for the overall model and as a follow-on source for Lane 2.

### 8. `rpx-xui-e2e-tests` already exposes the exact seam classes the Configuration Lane needs

The consumer repo is stronger than a blank Playwright shell. It already has partial coverage or support seams for all three Configuration Lane seam classes:

- `service-list endpoints`
  - existing manage-tasks and case-list integration seams under `src/tests/e2e/integration/**`
- `UI bootstrap and role/environment config`
  - current E2E and integration route/setup utilities under `src/tests/e2e/integration/**`
- `consumer-side API contracts`
  - `src/tests/api/contract-tests.api.ts`

That is a strong reason to use `rpx-xui-e2e-tests` for the thin slice.

It also reveals an important improvement target:

- the current API contract assertions are useful, but still too loose for this POC
- for example, some checks confirm that a response is merely present, rather than asserting the exact service-family behaviour that the new central assurance model needs to prove

The first implementation slice should therefore strengthen the current contract layer rather than replacing it.

## Historical SRT And Incident Back-Test

This back-test is the strongest evidence for the revised proposal. It asks two separate questions:

1. would the thin-slice Configuration Lane have caught the issue on its own?
2. would the wider Central Assurance Model give EXUI a credible central path to catch it?

| Historical item | Primary failure class | Configuration Lane alone | Wider Central Assurance Model | Why |
| --- | --- | --- | --- | --- |
| Query Management outgoing comms SRT with functionality turned off for `FPL` and `Civil` | configuration and feature gating | yes | yes | a central configuration row should prove that QM stays hidden or inactive when disabled for a family that is otherwise configured |
| WA tab and task-surface incidents such as missing `My Tasks`, `Available Tasks`, `My Cases`, `My Access`, and location-filter issues | service-list and role-gated configuration behaviour | yes, high confidence | yes | these are classic EXUI-owned supported-service, tab-visibility, filter, and list-resolution failures and belong directly in the Configuration Lane |
| Welsh translation toggle and blue information box state | shared central UI state | partially | yes | this is central EXUI behaviour, but not primarily a service-family permutation problem |
| Refresh modal and direct `/submit` access guard | shared route and journey control | no | yes | guarded navigation and route-reset behaviour belong in the Shared Workflow/Event Engine Lane |
| Callback validation error displaying incorrect overview or task state | shared error-navigation behaviour | no | yes, if explicitly included | it is catchable centrally, but only if error-navigation journeys are part of the Shared Workflow/Event Engine Lane |
| Markdown validation hardening in text fields | shared validation behaviour | no | yes, if explicitly included | it is reusable shared EXUI behaviour, but not a service-family configuration problem |
| Previous-button, page-show-condition, and hidden-page data loss defects such as `EXUI-837` | shared event-engine and payload semantics | no | yes, but only in the Shared Workflow/Event Engine Lane | these are not meaningfully solved by service-family permutations alone |
| CYA rendering defects and hidden or null payload regressions such as `EXUI-848`, `EXUI-942`, `EXUI-3481`, and `EXUI-3582` | shared event-engine and payload semantics | no | yes, but only in the Shared Workflow/Event Engine Lane | these require synthetic definition-driven regressions around CYA, nested complex fields, and hidden-value semantics |
| Media Viewer redaction misalignment incident `INC5680323` | specialist rendering and geometry | no | partially, only if the Specialist Component Lane is implemented | the original single-lane superservice idea would not have caught this reliably |
| Telemetry-only task-completion logging change | shared task-completion workflow | partially | yes | the functional part belongs centrally, but telemetry emission also needs explicit verification rather than assuming UI success is enough |

The back-test changes the recommendation materially:

- a single superservice matrix is not enough
- the central assurance umbrella is credible, but only if the page is explicit that the current thin slice proves the Configuration Lane first
- the main value remains strong because many costly SRT asks were triggered by central EXUI behaviour rather than genuine downstream uniqueness

## Internal EXUI Family Coverage Ledger

This ledger remains the backbone of the configuration superservice lane. It gives every repo-visible EXUI family an explicit test disposition.

| EXUI internal family | Repo evidence | Main config seams | Disposition | Reason |
| --- | --- | --- | --- | --- |
| `IA` | repo-proven | WA, global search, service-ref mapping, hearings, hearing amendments | must-run | high-value multi-surface family with explicit `Asylum` and `Bail` split |
| `CIVIL` | repo-proven | WA, global search, service-ref mapping, hearings, hearing amendments, filtered jurisdictions | must-run | high-change surface and likely umbrella for several downstream civil consumers |
| `PRIVATELAW` | repo-proven | WA, global search, service-ref mapping, hearings via `PRLAPPS` | must-run | explicit case-type and role-gated behaviour |
| `PUBLICLAW` | repo-proven | WA, global search, service-ref mapping, staff-supported | grouped | distinct family, but current repo evidence shows fewer unique UI seams than IA or CIVIL |
| `EMPLOYMENT` | repo-proven | WA, global search, staff-supported, preview hearings | grouped | needs coverage, but hearing support is repo-evidenced in preview only |
| `SSCS` | repo-proven | staff-supported, service-ref mapping, hearings | grouped | explicit hearing and role-gated behaviour, but lower cross-surface breadth than IA or CIVIL |
| `ST_CIC` | repo-proven | WA, global search, staff-supported, service-ref mapping | grouped | present in several families and must not be omitted, but not a strong first thin-slice anchor |
| `DIVORCE` | repo-proven | staff-supported, service-ref mapping, WA defaults | grouped | visible family with lower repo-evidenced UI variation |
| `FR` | repo-proven | staff-supported, service-ref mapping | grouped | explicit repo-visible family and must stay in the ledger |
| `PROBATE` | repo-proven | staff-supported, service-ref mapping | grouped | explicit repo-visible family and must stay in the ledger |
| `CMC` | repo-proven but partial | generic jurisdiction list only, explicitly excluded from staff-supported list | canary | current evidence is contradictory for broad grouping and must remain an exception row |
| `HRS` | repo-proven but partial | generic jurisdiction list and API path | canary | present in config, but not represented across the major capability families above |

The practical interpretation is:

- `must-run` rows define the thin-slice backbone of the configuration lane
- `grouped` rows stay in the central model, but can run as lower-frequency grouped scenarios
- `canary` rows remain explicit exceptions until the repo evidence or live mapping becomes stronger

## Business-Service Mapping Ledger

This remains intentionally separate from the internal EXUI family ledger. It is the safest way to show where the repo proves an internal family and where the real business-label mapping is still only indicated.

| Business service label | Candidate EXUI family | Internal family evidence | Business label mapping evidence | Current reading | Required follow-up |
| --- | --- | --- | --- | --- | --- |
| Civil Damages Claims (`CDC`) | `CIVIL` | repo-proven | repo-indicated | likely civil umbrella, but repo does not name `CDC` directly | confirm through live ref-data or service-owner validation |
| Civil Money Claims (`CMC`) | `CMC` or wider civil behaviour | repo-proven but partial | needs live confirmation | repo contains `CMC` in generic jurisdiction config but not in the broader supported-service families | keep as canary until exact behaviour is confirmed |
| Divorce (`DIV`) | `DIVORCE` | repo-proven | repo-indicated | direct internal family is present, but business label still depends on external naming | none for first pass |
| Employment Case Management (`ECM`) | `EMPLOYMENT` | repo-proven | repo-indicated | `EMPLOYMENT` family exists, but repo does not name `ECM` directly | confirm label-to-family mapping with service owners |
| Reform Employment Tribunals | `EMPLOYMENT` | repo-proven | needs live confirmation | family exists, but reform label is not repo-proven | canary until live mapping is confirmed |
| Family Public Law (`FPL`) | `PUBLICLAW` | repo-proven | repo-indicated | internal family exists and is strongly aligned | confirm external label usage |
| Financial Remedy (`FR`) | `FR` | repo-proven | repo-indicated | direct internal family is present, but business label still depends on external naming | none for first pass |
| Immigration and Asylum (`IAC - Asylum`) | `IA` | repo-proven | repo-indicated | explicit case type in hearing and WA config strongly indicates the mapping | none for first pass |
| Immigration and Asylum (`IAC - Bails`) | `IA` | repo-proven | repo-indicated | explicit case type in hearing and WA config strongly indicates the mapping | none for first pass |
| Probate (`PRO`) | `PROBATE` | repo-proven | repo-indicated | direct internal family is present, but business label still depends on external naming | none for first pass |
| Social Security and Child Support (`SSCS`) | `SSCS` | repo-proven | repo-indicated | direct internal family is present, but business label still depends on external naming | none for first pass |
| Hearing Recording Storage (`HRS`) | `HRS` | repo-proven but partial | repo-indicated but weak | appears in generic jurisdiction config and API path only | keep as canary and investigate missing broader support |
| New Divorce Law | `DIVORCE` | repo-proven | needs live confirmation | likely related family, but repo does not prove a separate or shared label path | canary until confirmed |
| PRL | `PRIVATELAW` | repo-proven | repo-indicated | `PRLAPPS` is explicit in hearings config, but business label still needs confirmation | treat as provisional mapping, not confirmed truth |
| Civil Possessions | `CIVIL` | repo-proven | needs live confirmation | likely civil umbrella, but repo does not name it directly | canary until confirmed |

This ledger prevents the POC from overclaiming. It keeps the model honest about what is repo-proven and what still needs live validation or service-owner confirmation.

## Scenario Dimensions And Synthetic Journey Model

Each central scenario should declare:

- internal service family
- case type
- role-set or permission cluster
- environment
- capability lane
- enabled features
- expected user-visible EXUI outcome

### Capability surfaces that matter

- shell and header configuration
- WA support and release-version behaviour
- hearings and hearing-amendment behaviour
- global search and service-ref-driven search visibility
- filtered jurisdiction and staff-supported service lists
- access-management or related feature toggles when they materially change visible behaviour
- Previous and Continue flow through conditional pages
- CYA rendering and summary correctness
- hidden-field and retain-hidden submission semantics
- guarded navigation and shared validation
- specialist component behaviour where geometry or rendering correctness is itself the risk

### Role-set rule

Use coarse role archetypes only where exact roles do not materially change behaviour.

Keep exact role clusters explicit where the config already does so, especially for:

- `IA`
- `PRIVATELAW`
- `SSCS`
- preview `EMPLOYMENT`

## First-Pass Execution Matrix

### Thin-slice scope for this POC: Configuration Lane

The thin slice should implement these rows first:

- `IA` with separate `Asylum` and `Bail` rows
- `CIVIL` with supported and negative variants, including `GENERALAPPLICATION` where relevant outside prod
- `PRIVATELAW` through `PRLAPPS`
- one exact role-sensitive hearing row
- one service-list seam row covering WA, global search, or filtered-service output rather than only `/external/config/ui`
- one partial or contradictory row such as `CMC` or `HRS`

### Grouped release-candidate or scheduled coverage

Configuration Lane grouped families:

- `PUBLICLAW`
- `EMPLOYMENT`
- `SSCS`
- `ST_CIC`
- `DIVORCE`
- `FR`
- `PROBATE`

### Canary-backed or open-question rows

- `CMC`
- `HRS`
- business labels that are not repo-proven as exact EXUI mappings, including `CDC`, `ECM`, `Reform Employment Tribunals`, `New Divorce Law`, `PRL`, and `Civil Possessions`
- specialist behaviours not yet automated but still named as residual risk

### Named residual lanes outside the thin slice

These are not implemented by the current thin slice, but they must stay explicit in the operating model:

Shared Workflow/Event Engine Lane:

- Previous and Continue through conditional pages
- nested complex CYA rendering
- hidden-value purge versus retain-hidden behaviour
- guarded refresh or direct-submit navigation
- callback-error navigation

Specialist Component Lane:

- Media Viewer redaction correctness and geometry
- additional document and viewport permutations if incident evidence justifies them

## What Success Looks Like

This POC will be successful if it proves a credible operating model and a credible thin slice that teams can trust:

- the page makes it clear that EXUI assurance should be split into distinct lanes rather than forced into one superservice promise
- the thin slice proves that the Configuration Lane can cover EXUI-owned service-family behaviour once, centrally
- negative and impossible configuration combinations are covered
- historical back-test shows why the Configuration Lane is worth doing and why the other lanes must remain visible
- the default regression conversation shifts from "all services rerun" to "central config coverage plus a named residual canary set"
- service owners can see exactly what is proven, what is only indicated, and what still needs live confirmation

If those conditions are met, the team has a practical basis to reduce config-related SRT. If they are not met, the POC still provides a clearer map of where central coverage stops and why.

## Deliberated Initial POC Options

Several initial implementation options were considered.

| Option | Shape | Strength | Weakness | Verdict |
| --- | --- | --- | --- | --- |
| `A. Docs-only` | Confluence plus decision record only | quick alignment | no executable proof | reject |
| `B. API contract-only` | exact assertions against config and service-list endpoints only | good for drift detection | does not prove rendered EXUI behaviour | reject |
| `C. Integration-only` | synthetic UI journeys only | proves visible behaviour | can overfit mocks and miss contract drift | reject |
| `D. Live-canary-heavy` | more live E2E or service canaries up front | closer to production | expensive and too close to current SRT cost model | reject |
| `E. Hybrid thin slice` | scenario catalogue plus exact config-contract checks plus small integration layer | proves both contract and rendered behaviour with controlled scope | still needs careful scenario design | choose |

The best current option is `E. Hybrid thin slice`.

That option is strongest because:

- it uses the exact repo seams that already exist
- it proves both endpoint/config drift and rendered EXUI behaviour
- it stays aligned with the goal of reducing SRT rather than recreating it
- it gives a reusable source-of-truth scenario model for later extensions

## Recommended Harness

The most practical current route is a hybrid harness in `rpx-xui-e2e-tests`.

It should combine:

- one shared scenario catalogue for service family, case type, role set, environment, enabled features, and disposition
- one exact config-contract layer for the key Configuration Lane endpoints
- one thin Playwright integration layer for rendered EXUI behaviour
- named follow-on support for the Shared Workflow/Event Engine Lane and Specialist Component Lane
- a very small live canary layer for unresolved business-label mappings or service-owned bespoke behaviour

`rpx-xui-e2e-tests` is the preferred implementation home because it already has:

- separate API, integration, and E2E layers
- current Playwright coverage at useful scale
- audit and evidence scripts such as `audit:ai:metadata`, `audit:ai:validate`, and `audit:ai:export`
- existing helper seams for `manageTasks`, `searchCase`, and `hearings`

The remaining proof point is no longer whether a hybrid harness is directionally plausible. It is whether the initial slice can be kept small, maintainable, and review-clean.

## Viability Criteria For The POC

Treat the POC as viable only if all of the following are met:

1. The scenario catalogue covers every repo-visible EXUI family with an explicit disposition.
2. The thin slice proves automation across all three seam classes in the Configuration Lane: UI bootstrap payload, service-list endpoints, and runtime-filtered upstream data.
3. The thin slice proves at least one exact-role hearing path.
4. The resulting evidence credibly reduces the default config-regression discussion from "all services rerun" to "central configuration coverage plus named residual canaries".
5. The page keeps Lane 2 and Lane 3 visible as residual central-assurance responsibilities rather than pretending the thin slice covers them.
6. The implementation recommendation for `rpx-xui-e2e-tests` is validated as practical rather than assumed.

## SRT Reduction And Retirement Criteria

The POC should be considered successful if it reduces config-related downstream SRT demand to:

- grouped central EXUI coverage inside the Configuration Lane
- a named canary list for unresolved mappings and bespoke service behaviour

Do not claim wider SRT retirement until:

- repeated evidence has been collected across multiple EXUI config-affecting changes
- business-label mappings marked `needs live confirmation` are either proven or explicitly accepted as canary-only
- service owners accept that the retained canary list is sufficient for their residual config risk
- the Shared Workflow/Event Engine Lane and Specialist Component Lane are either proven separately or explicitly retained as out-of-scope residual risk

## Adoption Criteria And Governance Gates

Service-by-service reruns should only reduce after the central lane has been proven across repeated EXUI changes and the residual canary set has been explicitly accepted.

Use these gates:

1. repeated proof: the Configuration Lane must show stable results across multiple EXUI config-affecting changes, not one successful demo
2. owner acceptance: service owners must accept the named residual canary list for mappings that remain unproven or bespoke
3. boundary acceptance: teams must accept that Lane 2 and Lane 3 remain separate central-assurance responsibilities and are not being silently bundled into the Configuration Lane
4. audit acceptance: the repo narrative, evidence paths, and confidence labels must stay aligned so the adoption decision remains reviewable

## Repeatable Codex Workflow

For this class of work, Codex should be used in this order:

1. Collect the existing investigation and repo seams instead of restarting discovery.
2. Separate repo-proven internal families from business-label assumptions.
3. Back-test the proposal against historical SRT and incident classes.
4. Build an auditable coverage ledger for every repo-visible family.
5. Collapse equivalent UI outcomes into grouped scenarios.
6. Keep unsupported, contradictory, and partial-config rows explicit.
7. Define viability and SRT-reduction criteria before recommending change.
8. Record the resulting matrix, assumptions, residual canaries, and historical back-test as auditable artefacts.

This is the repeatable process worth reusing, whether or not a dedicated Codex skill is created later.

## Recommended Next Step

If this POC is accepted, the next implementation step should be:

1. Implement the thin slice on branch `test/srt-poc` in `rpx-xui-e2e-tests`.
2. Add one normalized scenario catalogue as the source of truth for:
   - service family
   - case type
   - role set
   - environment
   - enabled features
   - disposition such as `must-run`, `grouped`, or `canary`
3. Strengthen the API/config layer first so it proves exact Configuration Lane behaviour for:
   - global search services
   - WA supported services
   - staff supported services
   - UI bootstrap config where the repo already controls or mocks it
4. Prove rendered behaviour through one current-master-compatible thin integration slice first:
   - `manageTasks`
   - keep `searchCase` and `hearings` as explicit follow-on rows until matching harness support exists on current `master`
5. Anchor the first scenario rows to:
   - `IA` with explicit `Asylum` and `Bail`
   - `CIVIL`
   - `PRIVATELAW`
   - one exact role-sensitive hearings row
   - one contradictory or weak-evidence row such as `CMC` or `HRS`
6. Reuse and extend current repo helpers rather than starting a new test stack:
   - current manage-tasks route setup support
   - current API contract test support
   - existing `src/tests/e2e/integration/**` page-object and session seams
7. Record explicit proof obligations for Lane 2 and Lane 3 rather than bundling them into the same implementation promise.
8. Keep grouped families and unresolved business labels as follow-on extensions, not blockers for the thin slice.

## Residual Risks And Open Questions

- live ref-data can still drift by environment, so repo-backed mappings are not the whole story
- `CMC` and `HRS` remain especially weakly evidenced for broad grouping
- some downstream business labels still need explicit owner confirmation before they move out of canary status
- some services may still have bespoke UI expectations layered on top of the same EXUI family
- specialist components may require more than standard integration-style assertions
- the current POC goal is to reduce SRT materially, not prove full retirement in one step

## Recommendation

Proceed with the EXUI Central Assurance POC, but keep the decision language disciplined:

- approve the `EXUI Central Assurance Model` as the umbrella direction
- approve a thin-slice POC for `Lane 1: Superservice Configuration` only
- keep `Lane 2: Shared Workflow/Event Engine` and `Lane 3: Specialist Components` explicit as adjacent central-assurance lanes, not hidden assumptions
- treat the initial implementation option as `hybrid scenario catalogue + exact config-contract checks + thin integration slice`
- treat `rpx-xui-e2e-tests` as the preferred current implementation home for that option
- target substantial config-related SRT reduction, not an unsupported claim of total elimination on day one

## Decision Request

Approve the following:

1. use `EXUI Central Assurance Model` as the umbrella operating model for future EXUI-owned regression reduction work
2. run the next thin slice only against `Lane 1: Superservice Configuration`
3. retain `Lane 2` and `Lane 3` as explicit residual central-assurance lanes rather than bundling them into the same proof claim
4. treat config-related SRT reduction as conditional on repeated evidence and explicit service-owner acceptance of the residual canary set
