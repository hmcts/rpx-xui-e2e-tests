# Subagent Usage Examples

Practical, copy-paste examples for using subagents in this repository.

## 1) Governance Preflight

Use when:

- The request affects policy, risk, security/privacy, or cross-cutting workflow.

Copy-paste prompt:

```text
Role: Governance Preflight

Assess this change for HMCTS governance readiness.
Input:
- Changed files: <paste file list>
- Request summary: <paste summary>

Return:
1. Risk classification (low|medium|high) and rationale
2. Required evidence checklist (Odhin/HTML/JUnit/docs)
3. Required PR metadata fields and any missing items
4. Top 3 governance risks and mitigations

Use format:
Consumed / Produced / Risks / Next
```

## 2) Test-Impact Mapper

Use when:

- Many files changed and test scope is unclear.

Copy-paste prompt:

```text
Role: Test-Impact Mapper

Map changed files to the smallest effective test plan.
Input:
- Changed files: <paste file list>
- Areas touched: <api|ui|fixtures|config|reporting>

Return:
1. Minimal command set to run now
2. Additional high-confidence suites to run next
3. File-to-test mapping with rationale
4. Estimated confidence after each stage

Use format:
Consumed / Produced / Risks / Next
```

## 3) Evidence Auditor

Use when:

- Tests are done and we need review-ready evidence.

Copy-paste prompt:

```text
Role: Evidence Auditor

Audit current workspace for evidence completeness.
Input:
- Expected artifacts:
  - functional-output/tests/**/odhin-report
  - playwright-report
  - playwright-junit.xml
  - docs/DECISIONS.md
  - docs/RESULT.md

Return:
1. Existing evidence paths
2. Missing evidence paths
3. Suggested updates for docs/RESULT.md
4. Suggested PR evidence section text

Use format:
Consumed / Produced / Risks / Next
```

## 4) PR Compliance Writer

Use when:

- Preparing PR text aligned to template/governance requirements.

Copy-paste prompt:

```text
Role: PR Compliance Writer

Draft PR content using .github/pull_request_template.md.
Input:
- Summary of change: <paste>
- Validation commands run: <paste>
- Evidence paths: <paste>
- AI metadata known/unknown: <paste>

Return:
1. Completed PR template markdown
2. Explicit TODO placeholders for missing data
3. Final checklist for human reviewer

Use format:
Consumed / Produced / Risks / Next
```

## 5) Flake Triage

Use when:

- Failures appear intermittent and hard to classify.

Copy-paste prompt:

```text
Role: Flake Triage

Classify test failures as likely flake vs likely regression.
Input:
- Failed tests: <paste>
- Retry history: <paste>
- Error snippets: <paste>
- Trace/log paths: <paste>

Return:
1. Classification: likely_flake or likely_regression
2. Most probable root-cause area
3. Rerun strategy (targeted commands)
4. If regression, first 3 debugging steps

Use format:
Consumed / Produced / Risks / Next
```

## 6) Security/Privacy Reviewer

Use when:

- Auth/token/env/logging/external endpoint behavior changed.

Copy-paste prompt:

```text
Role: Security/Privacy Reviewer

Perform HMCTS-aligned security/privacy review on this change.
Input:
- Changed files: <paste>
- Sensitive flows: <auth|tokens|env vars|logs|network>

Return:
1. Findings by severity (critical/high/medium/low)
2. Data exposure risks and where
3. Concrete fix recommendations with file paths
4. Required manual review checkpoints

Use format:
Consumed / Produced / Risks / Next
```

## 7) Parallel Delegation Example

Use when:

- You can run two independent analysis tasks concurrently.

Example:

1. Spawn `Test-Impact Mapper` for command planning.
2. Spawn `PR Compliance Writer` for draft PR body.
3. Implement and run tests locally.
4. Merge both outputs into final PR/update.

## 8) Do-Not-Spawn Cases

- One-file small fix with obvious validation.
- Immediate blocking implementation step.
- Destructive operations.
- Final go/no-go approval (must remain human).

## 9) Recommended Sequence for Typical AI-Assisted Change

1. `Governance Preflight`
2. `Test-Impact Mapper`
3. Implement + test locally
4. `Evidence Auditor`
5. `PR Compliance Writer`
6. Human review and sign-off
