# ExecPlan: Align rpx-xui-e2e-tests Jenkins pipelines with prl-e2e-tests using cnp-jenkins-library

This ExecPlan is a living document and must be maintained in line with .agent/PLANS.md and .agent/SECURE.md at the repository root. Update the sections below as work progresses.

## Purpose / Big Picture

Deliver Jenkins pipelines for rpx-xui-e2e-tests that mirror the proven prl-e2e-tests pattern while using the shared Infrastructure (cnp-jenkins-library) primitives. The outcome should be PR/master coverage (fast smoke on PRs, broader smoke on default branch) plus configurable nightly runs with consistent Key Vault loading, Slack notifications, Odhin/JUnit artefacts, and secure handling of RPX credentials. A new contributor should be able to run or modify the pipelines without needing external knowledge.

## Progress

- [x] (2025-12-11 17:25Z) Collected baseline: cnp-jenkins-library withNightlyPipeline/sectionNightlyTests, YarnBuilder, prl-e2e-tests Jenkinsfile_CNP/Jenkinsfile_nightly patterns, and current rpx Jenkinsfile_CNP/Jenkinsfile_nightly/Jenkinsfile_regression.
- [x] (2025-12-11 17:40Z) Finalised target pipeline design (env-driven vault selection, onPR/onMaster split, Odhin/JUnit publishing) and recorded decisions.
- [x] (2025-12-11 17:45Z) Implemented Jenkinsfile updates (CNP, nightly, regression) plus CI README notes.
- [ ] (2025-12-11 17:45Z) Validate via Jenkins linter or sandbox run and capture expected stage/artefact outputs.

## Surprises & Discoveries

- withNightlyPipeline already injects Checkout → Build → Dependency check (Yarn securityCheck) before any custom stages; additional stages must sit in afterAlways/onPR/onMaster to avoid duplicating the built-in steps.
- sectionNightlyTests will fail the build if any earlier stage is unstable, so later test stages should wrap failures with unstable(...) to keep reports archived (prl does this for test suites).

## Decision Log

- Decision: Keep using withNightlyPipeline to benefit from the shared checkout/build/dependency-check flow and metrics publishing; attach test stages via afterAlways like prl-e2e-tests.  
  Rationale: Aligns with shared library expectations and avoids reimplementing baseline stages.  
  Date/Author: 2025-12-11 / Codex
- Decision: Derive vault environment (aat vs demo) from APP_BASE_URL/APIs similar to prl matchingEnv logic, so secret sets stay keyed by environment.  
  Rationale: Prevents hard-coding aat secrets and allows demo/nightly flexibility without multiple Jenkinsfiles.  
  Date/Author: 2025-12-11 / Codex
- Decision: Scope PR smoke to Chromium while allowing parameterised browser/tag combinations on the default branch to keep PR feedback fast but main coverage flexible.  
  Rationale: Faster PR signal and mirrors prl-e2e-tests’ split responsibility.  
  Date/Author: 2025-12-11 / Codex

## Outcomes & Retrospective

Pipelines now mirror the prl-e2e-tests pattern: env-driven vault lookup (aat/demo), onPR/onMaster gating for CNP smoke, nightly/regression under afterAlways with Odhin/JUnit and flake-budget checks, and consistent report archiving. Documentation reflects the new behaviour. Validation on Jenkins is still pending.

## Context and Orientation

Repositories inspected:
- cnp-jenkins-library: withNightlyPipeline.groovy wraps AppPipeline with checkout/build/dependency check and then executes sectionNightlyTests; YarnBuilder exposes yarn(...) plus helpers and performs securityCheck during Dependency check. onPR/onMaster helpers gate branch-specific blocks. loadVaultSecrets injects Azure Key Vault secrets (strings with '...-${env}' resolve per environment).
- prl-e2e-tests: Jenkinsfile_CNP uses withNightlyPipeline + afterAlways('DependencyCheckNightly') + onPR/onMaster to run targeted Playwright suites, publishes Odhin/HTML, and archives reports. Jenkinsfile_nightly adds cron + parameterised tag/browser selection.
- rpx-xui-e2e-tests: Jenkinsfile_CNP/Jenkinsfile_nightly/Jenkinsfile_regression already call withNightlyPipeline but define stages directly (no onPR/onMaster split), placeholders for secrets, and currently run install → lint → smoke/regression with Odhin/JUnit. Scripts available: yarn lint, yarn test:smoke, yarn test:regression, yarn check:flake, etc. No yarn test:changes script exists.

Security baseline (per SECURE.md and AGENTS.md): never log secrets, keep Key Vault as the only secret source, avoid sending data to non-HMCTS endpoints, and ensure Jenkins parameters contain no sensitive defaults. All env vars should be runtime-injected; .env remains local only.

## Plan of Work

Describe the edits in the order they should occur, mirroring prl’s flow while fitting RPX specifics.

1) Jenkinsfile_CNP alignment (PR/master path): add/adjust parameters to cover APP_BASE_URL/APP_API_BASE_URL, optional skip flags (e.g. skipSmoke) if needed, workers, and browser. Introduce matchingEnv derivation (aat vs demo) from APP_BASE_URL. Define secrets map keyed by 'rpx-${matchingEnv}' with the actual vault secret names → env vars used by config/index.ts. Inside withNightlyPipeline, use afterAlways('DependencyCheckNightly') to hook stages. Add onPR block to run a fast Chromium smoke (yarn test:smoke --project=chromium --workers param) and publish Odhin/JUnit artefacts guarded with unstable(...) to preserve reports. Add onMaster block to run the default smoke (and any optional tag/browse variants), reusing shared publishHTML/junit/archive patterns from prl. Keep enableSlackNotifications for #xui-pipeline.

2) Jenkinsfile_nightly parity: keep cron trigger but refactor stages into afterAlways('DependencyCheckNightly'). Reuse matchingEnv + secrets map. Provide parameters TAGS/tests/browsers/workers similar to prl; keep buildPlaywrightCommand helper but ensure PLAYWRIGHT_REPORTERS/ODHIN/JUNIT envs are set per browser/tag. Wrap runs with unstable(...), run yarn check:flake afterward, and publish Odhin/JUnit + archive test-results/**/*.

3) Jenkinsfile_regression tidy-up: align secret loading with the same matchingEnv helper and afterAlways structure so regression runs also benefit from built-in dependency check. Ensure PLAYWRIGHT_REPORTERS/ODHIN/JUNIT env vars match the others and reports are published consistently.

4) Security hardening: verify secret names match the Key Vault (replace TODO placeholders), remove any unused parameters that might tempt secret entry, and keep all IDs/URLs non-sensitive. Ensure no secret defaults are baked into parameters; document that .env is local-only and Jenkins must use Key Vault.

5) Documentation update: add a short CI section in README.md/ci/README (or update existing CI block) describing the new branch/nightly behaviour, parameters, secret mapping, and report locations so ops can run/replay pipelines.

## Concrete Steps

Run commands from repository root unless stated otherwise.

1) Edit Jenkinsfile_CNP to introduce matchingEnv helper, secrets map keyed by 'rpx-${matchingEnv}', afterAlways('DependencyCheckNightly') wrapper, and onPR/onMaster blocks that call yarnBuilder.yarn(...) with unstable(...) wrappers. Publish Odhin (test-results/odhin-report/playwright-odhin.html), junit allowEmptyResults: true pointing to test-results/junit/**/*.xml, and archive test-results/**/*.

2) Edit Jenkinsfile_nightly to reuse the same secret helper and env exports, move stages under afterAlways('DependencyCheckNightly'), and keep the buildPlaywrightCommand helper for tag/browser/workers. Ensure check:flake runs in finally and reports are published as in CNP.

3) Edit Jenkinsfile_regression to standardise secret loading, env exports, and reporting with the CNP/nightly pattern. Place stages under afterAlways('DependencyCheckNightly') to align with library expectations.

4) Update README.md (CI section) to reflect the revised pipeline behaviours, parameters, and report paths.

5) Sanity check syntax: optionally run ./gradlew test within cnp-jenkins-library if available (or use Jenkins’ built-in linter if accessible). Locally, run yarn lint in rpx-xui-e2e-tests to ensure non-Groovy files remain clean.

## Validation and Acceptance

- Jenkinsfile_CNP: On a PR branch, pipeline shows stages Checkout → Build → Dependency check → Install deps → PR Smoke (Chromium). Odhin HTML at test-results/odhin-report/playwright-odhin.html and junit results under test-results/junit/**; build marked unstable if tests fail but artefacts preserved. On master/main, smoke suite runs (optionally browser/tag variants) with the same reporting and Slack notifications.
- Jenkinsfile_nightly: Scheduled run triggers nightly stage with selected TAGS/BROWSER/WORKERS; check:flake executed post-tests; Odhin/JUnit artefacts archived; failures mark build unstable not failed.
- Jenkinsfile_regression: Manual run executes regression suite with consistent report publishing; secrets load from the correct vault based on APP_BASE_URL/demo detection.
- Security: No secrets committed; secrets only via loadVaultSecrets; Jenkins parameters contain no sensitive defaults; logs avoid printing credentials.

## Idempotence and Recovery

Groovy edits are safe to re-run; withNightlyPipeline handles clean workspaces. If a stage fails mid-run, rerun the Jenkins job—yarn install --immutable prevents drift. Revert changes via git checkout -- Jenkinsfile_* if needed. Secret lookups remain read-only; no data is mutated by the pipelines beyond test data in target envs.

## Artifacts and Notes

- Relevant library hooks: cnp-jenkins-library/vars/withNightlyPipeline.groovy, cnp-jenkins-library/vars/sectionNightlyTests.groovy, uk/gov/hmcts/contino/YarnBuilder.groovy.
- Reference patterns: prl-e2e-tests/Jenkinsfile_CNP and Jenkinsfile_nightly for onPR/onMaster usage and HTML/JUnit publishing.
- Current RPX scripts: yarn test:smoke, yarn test:regression, yarn check:flake, yarn lint (package.json).

## Interfaces and Dependencies

- Groovy helpers: withNightlyPipeline(type, product, component, timeout) for baseline stages; afterAlways(stageName){...} to append stages after Dependency check; onPR/onMaster to scope to branch; loadVaultSecrets(Map) for Azure Key Vault injection; enableSlackNotifications(channel) for Slack.
- Reporting: publishHTML(reportDir: "test-results/odhin-report", reportFiles: "playwright-odhin.html", reportName: "..."); junit allowEmptyResults: true, testResults: "test-results/junit/**/*.xml"; archiveArtifacts allowEmptyArchive: true, artifacts: "test-results/**/*".
- Playwright commands executed via yarnBuilder.yarn("<command>") with env vars: PLAYWRIGHT_REPORTERS, PLAYWRIGHT_ODHIN, PW_ODHIN_OUTPUT, PLAYWRIGHT_JUNIT_OUTPUT, PLAYWRIGHT_JSON_OUTPUT.
