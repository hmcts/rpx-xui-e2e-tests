# Source-default WA health selection feasibility

This is a necessary shared profile facet, not a complete service-family proof.
The catalogue remains112; all13 profile entries remain uncredited. The successful
jurisdiction feasibility run proves filtering/cache only. Even CMC still needs
its negative capability boundaries and shared consumers; hearing caseTypes has
no established runtime consumer or reviewed disposition.

Run in a fresh private output directory with a sealed candidate:

```sh
node scripts/run-harness-source-profile-jurisdictions.mjs \
  --artifact /absolute/candidate-artifact.json \
  --output /private/tmp/fresh-wa-health-run --facet wa-health
```

The existing owned runtime runner, cancellation/cleanup, artifact verification,
source sealing and observation replay are reused. No Docker was run during this
implementation. Normal invocation without `--facet` remains jurisdiction-only.

The pinned default configuration3734db2 has workAllocationEnabled=false.
`api/health/index.ts` lines50–68 unconditionally selects eight dependencies,
then adds exactly workAllocationApi, caseworkerRefApi, roleApi and judicialApi
when true. Its source SHA256 is
`2fff5ba546d8a07bd5d183dbbd2941dfed81fa3ec2c049a0b76b0f096ae109cc`,
identical in repaired candidate source26d17eb. Runtime artifact identity binds
the actual executable; configuration bytes must match the reviewed source.
This does not imply that false hides navigation: no such behavior is asserted.

Baseline GET /health must return200, UP, exactly the eight named healthy
checks and eight independent outbound GET /health records. The isolated fault
changes only workAllocationEnabled totrue. It must return200/UP with the exact
four additional healthy checks and twelve outbound records before the
source-default oracle deliberately fails. Transport failures, unhealthy checks,
extra/missing checks or missing outbound records never count as fault detection.

Existing endpoint substitutions all use the owned provider URL. The response
identifies named dependencies; the destination journal establishes request count
and path, not distinct production service addresses. That limitation is recorded
in the configuration contract. Build information and raw observations stay in
private evidence. No public report, native release selector or acceptance adapter
is added; runtimeAcceptance, catalogueCredit, wholeProfileSatisfied and
releaseCredit remainfalse.

Still missing for whole profiles: positive/negative global search, WA membership,
staff support and service-code consumer proofs, wildcard role/field behavior,
hearing eligibility/destinations and caseTypes disposition, routing bindings,
visible consuming selectors, and a reviewed same-candidate whole-profile replay
contract. Existing slices may be reused only with their exact source/configuration
boundaries preserved. The45 deployed-profile gaps and9 preview cells remain
separate from the13 source-default family obligations.
