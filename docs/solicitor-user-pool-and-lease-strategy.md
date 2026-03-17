# Solicitor User Pool and Lease Strategy

## Context

Dynamic solicitor creation in `rpx-xui-e2e-tests` is currently used in case-flow tests. This is reliable for isolation, but expensive and slower because each run performs IDAM/PRD provisioning and cleanup.

Additional constraints:

- Dynamic users are cleaned overnight (roughly daily lifetime).
- We run multiple Jenkins pipelines in parallel.
- Developers also run tests locally.
- We need **no user contention** across all execution environments.

## Decision Summary

Move from per-test dynamic provisioning to a **shared pooled-user model with central leasing**:

- Morning bootstrap creates and validates a baseline solicitor pool.
- During daytime runs, tests lease an existing active user from the pool.
- If no suitable lease is available, create one user on demand, register it, and lease it.
- Keep dynamic create/delete paths only for dedicated provisioning coverage tests.

## Why This Is Faster

- Removes repeated create/assign/delete calls from the common execution path.
- Reduces dependency on IDAM/PRD propagation latency for most tests.
- Shifts heavy setup to one scheduled bootstrap + rare fallback creation.

## Non-Contention Architecture

Use a **single central lease registry** accessible by Jenkins and local machines.

Suggested backend options (in order):

1. Redis (atomic `SETNX`/transaction support)
2. Azure Table/Cosmos DB with conditional updates (ETag compare-and-swap)
3. SQL row-level lock with lease TTL columns

Minimum lease record fields:

- `userKey`
- `email`
- `orgId`
- `roleProfile`
- `status` (`free`, `leased`, `quarantined`)
- `leaseId`
- `leaseOwner` (`jenkins/job/build/worker` or `local/host/user/pid`)
- `leaseExpiresAt`
- `lastHeartbeatAt`
- `createdAt`
- `expiresAt`

## Lease Flow

1. Resolve required profile (`orgId`, jurisdiction/testType, role profile).
2. Atomically acquire one `free` matching user.
3. Mark leased with TTL (for example 15 minutes).
4. Heartbeat periodically while test is running (for example every 60 seconds).
5. Release lease at teardown.
6. If process crashes, lease auto-expires and user returns to `free`.

## Selection Rules

- Allocate one solicitor **per worker**, not one per suite.
- Never allow two active leases for one user.
- Separate pools by capability when needed, for example:
  - `divorce-case-create`
  - `employment-case-flags`
  - `org-admin`
- Optionally reserve a percentage for CI to prevent local runs exhausting pool capacity.

## Validation and Quarantine

Before use:

- Check user can authenticate.
- Verify expected org assignment and critical roles.

On failure:

- Mark user `quarantined`.
- Acquire another user.
- Emit evidence to logs/report.

## Daily Lifecycle

### Morning bootstrap

- Create N users per pool segment.
- Validate login and assignment.
- Register as `free` with `expiresAt` set for overnight policy.

### Daytime execution

- Lease-first strategy.
- On pool exhaustion, create/register/lease fallback users.
- No daytime deletion.

### Overnight cleanup

- Existing mop-up job removes stale users.
- Registry reconciler marks missing users and cleans orphaned lease records.

## Integration Plan (rpx-xui-e2e-tests)

### Phase 1: Foundation

- Add `UserPoolLeaseService` abstraction.
- Implement backend adapter (start with Redis or existing approved store).
- Add config/env contracts.

### Phase 2: Test wiring

- Update `dynamicSolicitorSession` to:
  - attempt lease first
  - fallback to create/register/lease
  - release on cleanup
- Keep existing provisioning API for fallback and dedicated `@dynamic-user` tests.

### Phase 3: Operationalization

- Add scheduled bootstrap script/job.
- Add lease metrics and dashboards (acquire latency, pool utilization, exhaustion, quarantine count).
- Document local developer workflow.

## Proposed Environment Variables

- `PW_SOLICITOR_POOL_ENABLED=1`
- `PW_SOLICITOR_POOL_BACKEND=redis|table|sql`
- `PW_SOLICITOR_POOL_KEY_PREFIX=<env>`
- `PW_SOLICITOR_LEASE_TTL_SEC=900`
- `PW_SOLICITOR_HEARTBEAT_SEC=60`
- `PW_SOLICITOR_POOL_RESERVE_FOR_CI=<percentage>`
- `PW_SOLICITOR_POOL_FALLBACK_CREATE=1`

## Risks and Mitigations

- Registry outage: fallback to dynamic creation when allowed.
- Lease leaks from crashes: strict TTL + heartbeat expiry.
- Cross-env contention: central atomic acquire + per-worker leasing.
- Permission drift for old users: pre-use validation + quarantine.

## Acceptance Criteria

- No duplicate concurrent use of same solicitor across Jenkins/local runs.
- Median create-case setup time reduced versus current baseline.
- Dynamic provisioning volume drops significantly during daytime runs.
- Fallback creation works when pool is empty.
- Clear evidence in logs for lease acquire/release/quarantine.

## Out of Scope (Initial PR)

- Full rewrite of all user-management tests.
- Removal of existing dynamic provisioning utilities.
- Cross-repo shared pool service.

## PR Notes Template

This PR introduces a design and implementation direction for pooled solicitor leasing to reduce runtime and avoid user contention across Jenkins and local runs. It keeps dynamic provisioning as fallback and for dedicated provisioning tests, while moving common execution to lease-first user acquisition.
