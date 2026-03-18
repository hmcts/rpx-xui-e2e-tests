# HMCTS AI Governance Skill

Use this skill for any AI-assisted change in this repository to ensure policy, evidence, and audit metadata are captured consistently.

## Preflight Checklist

- Confirm change scope and data classification (no restricted/case/client data in prompts).
- Confirm reviewer and audit reference are known.
- Confirm required evidence commands are planned (`yarn lint`, relevant `yarn test:*`).

## Mandatory Metadata Schema

Provide these values for AI-assisted work:

- `agent_name`
- `version`
- `prompt_id`
- `reviewer`
- `timestamp` (UTC ISO8601)
- `audit_reference`

## Required Artifacts

- PR metadata section completed (`.github/pull_request_template.md`).
- Evidence files/paths present for reports (Odhin, HTML and/or JUnit).
- Traceability notes updated in `docs/DECISIONS.md` and `docs/RESULT.md` when applicable.
- Governance metadata generated:
  - `functional-output/tests/governance/ai-audit-metadata.json`
  - `functional-output/tests/governance/ai-audit-events.jsonl`

## Risk Classification

- `Low`: test-only or docs-only changes with no auth/security impact.
- `Medium`: workflow/reporting/pipeline changes with indirect delivery impact.
- `High`: auth, secrets, RBAC, network egress, or production-impacting automation changes.

## Execution Steps

1. Run tests and collect evidence artifacts.
2. Generate metadata: `yarn audit:ai:metadata`.
3. Validate policy fields: `yarn audit:ai:validate`.
4. Export Sentinel-ready event: `yarn audit:ai:export`.
5. Populate PR template and ensure human reviewer sign-off.
