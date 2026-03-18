# Subagent Playbook (HMCTS RPX XUI E2E)

Use this playbook to delegate bounded work safely while preserving HMCTS governance and human oversight.

## Purpose

- Improve cycle time for research, evidence gathering, and compliance checks.
- Keep coding and final decisions with the primary engineer and human reviewer.

## Default Rule

- Do not spawn subagents for trivial tasks.
- Spawn only when the subtask is independent, well-scoped, and has a clear output contract.

## Standard Subagent Roles

### 1) Governance Preflight

Use when:

- Request affects policy, risk, security/privacy, or cross-cutting workflow.

Output required:

- Risk classification (`low|medium|high`) + rationale.
- Required evidence checklist for this change.
- Required metadata fields for PR (`agent_name`, `version`, `prompt_id`, `reviewer`, `timestamp`, `audit_reference`).

### 2) Test-Impact Mapper

Use when:

- Code changes affect multiple modules and test scope is unclear.

Output required:

- Minimal set of commands to run now.
- High-confidence additional suite list.
- Files-to-tests mapping.

### 3) Evidence Auditor

Use when:

- Tests finished and we need a release-ready evidence pack.

Output required:

- Existing/missing evidence paths (Odhin/HTML/JUnit/logs).
- Suggested updates for `docs/RESULT.md` and `docs/DECISIONS.md`.
- PR evidence section draft.

### 4) PR Compliance Writer

Use when:

- Preparing PR description and governance metadata.

Output required:

- Draft content aligned to `.github/pull_request_template.md`.
- Explicit TODO placeholders for missing metadata/evidence.

### 5) Flake Triage

Use when:

- Test failures look intermittent.

Output required:

- `likely_flake` vs `likely_regression` classification.
- Most probable root-cause area.
- Suggested rerun strategy and next checks.

### 6) Security/Privacy Reviewer

Use when:

- Auth, tokens, secrets, env vars, logging, or external endpoint flows changed.

Output required:

- Findings by severity.
- Data exposure risk summary.
- Recommended fixes with file paths.

## Trigger Matrix

| Trigger                             | Spawn role(s)                                    | Expected output                      |
| ----------------------------------- | ------------------------------------------------ | ------------------------------------ |
| Security/auth/pipeline/infra change | Governance Preflight + Security/Privacy Reviewer | risk + controls + findings           |
| AI-assisted implementation          | Governance Preflight + PR Compliance Writer      | metadata checklist + PR draft        |
| Test/reporting changes              | Test-Impact Mapper + Evidence Auditor            | command plan + evidence map          |
| Suspected flaky failures            | Flake Triage + Evidence Auditor                  | classification + diagnostics summary |

## Handoff Contract (Mandatory)

Every subagent response must include:

- `Consumed`: what it read.
- `Produced`: concrete outputs.
- `Risks`: unresolved risks/assumptions.
- `Next`: 1-5 actions for the main engineer.

Template:

```text
Agent: <RoleName>

Consumed
- ...

Produced
- ...

Risks
- ...

Next
1. ...
```

## Do-Not-Spawn Rules

- Do not delegate the immediate blocking implementation step.
- Do not delegate destructive operations.
- Do not delegate final sign-off decisions.
- Do not let subagents bypass HMCTS governance, review gates, or evidence requirements.

## Practical Workflow

1. Main engineer decides if delegation is warranted.
2. Spawn 1-2 focused subagents in parallel for independent analysis only.
3. Main engineer integrates output and performs code/test actions.
4. Run governance evidence scripts when AI-assisted:
   - `yarn audit:ai:metadata`
   - `yarn audit:ai:validate`
   - `yarn audit:ai:export`
5. Human reviewer provides final approval.
