# Secure‑by‑Design Plan: EXUI‑4115 Full Journey Test

This document is a Secure‑by‑Design plan aligned with `rpx-xui-webapp/.agent/SECURE.md`. It must be maintained alongside the ExecPlan.

## Security Objectives

The test must not leak secrets, must minimize data exposure, and must avoid unsafe automation that could impact production or other environments. All actions must be confined to AAT and executed with least privilege.

## Threats and Mitigations

- Prompt Injection / Tool misuse: Do not ingest untrusted external content as commands. All actions are scripted in repo code.
- Data Exfiltration: Do not log session cookies or full API payloads. Only log non‑sensitive identifiers (case reference, task ID).
- Secrets handling: User credentials remain in local config (`appTestConfig.ts`). Do not print passwords, cookies, or tokens in logs.
- Environment isolation: Use AAT URLs only. Ensure tests fail fast if `TEST_ENV` is not `aat`.
- Abuse / resource exhaustion: Avoid loops that create many cases. One case per test run.

## Secure Implementation Requirements

- Never log cookies, JWTs, or IDAM tokens.
- Scrub query params from logged URLs.
- Avoid writing new secrets to disk. Reuse existing session storage where possible.
- Validate environment: abort test if `process.env.TEST_ENV` is not `aat`.

## Secure Validation

- Confirm logs show only case reference and task ID.
- Confirm no cookies or tokens are printed.
- Confirm test only calls AAT endpoints.

## Ongoing Maintenance

- Review credentials and roles before running in Jenkins.
- Re‑validate that events used are still permitted for the roles used.

Plan change note: initial draft created to satisfy Secure‑by‑Design requirement.
