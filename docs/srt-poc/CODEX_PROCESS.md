# Codex Superservice Workflow

## Repeatable Prompt Pattern

Use this prompt when extending the harness:

```text
Inspect rpx-xui-webapp as the source of truth for EXUI service-family config.
Update rpx-xui-e2e-tests central assurance scenarios without adding npm supertest.
Keep the proof Playwright API-first, add only one thin UI slice for user-visible config behaviour, and mock entitlement/downstream seams deterministically.
Run lint plus focused API/UI proofs and document skipped seams honestly.
```

## Process

1. Refresh source facts from `rpx-xui-webapp` config and test surfaces.
2. Refresh `src/data/exui-central-assurance-source.json`.
3. Update `src/data/exui-central-assurance.ts`.
4. Keep `EXUI_SOURCE_OF_TRUTH_REFS` aligned with the repo paths used to justify each scenario.
5. Run `yarn supertest:manifest` so unclassified or drifted service families fail before UI work starts.
6. Add or extend focused API assertions before adding UI coverage.
7. Add a UI proof only when the config affects a visible EXUI surface.
8. Control entitlement-sensitive seams with `api/user/details` and session storage mocks.
9. Validate with lint, focused API proof, focused UI proof, Odhin evidence, and clear skipped-seam notes.

## Wiki Companion Rules

- Treat `docs/srt-poc/KNOWLEDGE_MAP.md` as the small local wiki for this POC.
- Every scenario in `src/data/exui-central-assurance.ts` must have source references that explain where the values came from.
- Prefer updating source references over adding prose-only explanations when a new repo path becomes relevant.
- Keep skipped seams explicit in `docs/srt-poc/RESULT.md`; do not hide a local-auth gap behind a weaker assertion.

## Guardrails

- Do not add the npm `supertest` dependency for this POC.
- Do not run every downstream journey for every family.
- Do not rely on live user role drift to prove central EXUI config.
- Do not port the historical `test/srt-poc` branch wholesale.
- Do not claim full SRT retirement from one green POC run. Promote only stable, agreed lanes.
