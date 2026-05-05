# Superservice Execution Matrix

| Lane | Scenario | Priority | Mode | Current status |
| --- | --- | --- | --- | --- |
| Configuration | `/external/config/ui` exposes EXUI UI keys | Must-run | API | Implemented |
| Configuration | `/api/configuration?configurationKey=termsAndConditionsEnabled` responds for authenticated users | Must-run | API | Implemented |
| Global search | `/api/globalSearch/services` contains central must-run families | Must-run | API | Implemented |
| Work allocation | `/api/wa-supported-jurisdiction/get` contains central WA families | Must-run | API | Implemented |
| Work allocation | available-tasks service filter reflects central WA families | Must-run | UI | Implemented |
| Staff ref data | `/api/staff-supported-jurisdiction/get` matches staff-supported families | Must-run | API | Implemented |
| Hearings | supported Private Law PRLAPPS manager journey | Must-run | UI | Implemented |
| Hearings | unsupported Divorce hearing surface hidden | Grouped | UI | Implemented |
| Canary | `CMC` and `HRS` remain outside release-blocking family sets | Canary | API | Implemented |
| Drift gate | `rpx-xui-webapp` config snapshot still matches executable manifest | Must-run | Manifest | Implemented |

## Grouping Rule

Run every must-run lane on each EXUI release candidate. Group service families that share the same EXUI config path and downstream contract. Keep weak-evidence families as canaries until the owning service confirms they should become release-blocking.

## Coverage Disposition

| Disposition | Families | Why |
| --- | --- | --- |
| Release-blocking | `DIVORCE`, `PROBATE`, `FR`, `PUBLICLAW`, `IA`, `SSCS`, `EMPLOYMENT`, `CIVIL`, `PRIVATELAW`, `ST_CIC` | Current EXUI config exposes them through central global-search, WA, staff, or hearings seams. |
| Grouped | `DIVORCE`, `PROBATE`, `FR`, `PUBLICLAW`, `IA`, `SSCS`, `EMPLOYMENT`, `CIVIL`, `PRIVATELAW`, `ST_CIC` | These families should be grouped by shared EXUI config path rather than run as a full Cartesian service matrix. |
| Canary | `CMC`, `HRS` | They stay explicit canaries until ownership and release-blocking expectations are agreed. |

The manifest deliberately fails when a newly configured family is not classified. That is the key scaling control: new service-family values must be grouped, canaried, or promoted to must-run before the central gate can pass.

## Source Anchors

The executable manifest records source references for every scenario. Use `src/data/exui-central-assurance.ts` as the machine-readable version of this matrix, `src/data/exui-central-assurance-source.json` as the checked source snapshot, and `docs/srt-poc/KNOWLEDGE_MAP.md` as the human-readable refresh guide.

`yarn supertest:manifest` checks the snapshot against current `rpx-xui-webapp` config and representative `prl-ccd-definitions` anchors before the Playwright proof runs.
