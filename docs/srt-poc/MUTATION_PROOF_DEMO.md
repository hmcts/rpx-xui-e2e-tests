# EXUI Central Assurance Mutation Proof Demo

## Purpose

This is the short stakeholder demo that proves the central assurance gate can catch a shared EXUI regression.

It does not require the local EXUI/CCD stack. It also does not permanently edit `rpx-xui-webapp`, CCD definitions, or the central assurance manifest. The fault is injected only inside the Playwright process, then discarded when the process exits.

## Fault Being Simulated

Mutation:

```bash
EXUI_ASSURANCE_MUTATION=drop-prl-wa-family
```

The mutation simulates EXUI no longer exposing `PRIVATELAW` from:

```text
api/wa-supported-jurisdiction/get
```

That is the same class of central EXUI failure that would affect Work Allocation service-family filtering across all onboarded services that rely on this configuration path.

The live local EXUI proof still exists in `yarn harness:local:odhin`. This mutation proof is deliberately smaller: it proves the assertion itself goes red for a representative shared regression without needing a full local estate during a stakeholder demo.

## One Command

```bash
COREPACK_HOME=/private/tmp/corepack-cache yarn harness:mutation:wa
```

The runner performs two steps:

1. Control run with no injected fault. This must pass.
2. Mutated run with `drop-prl-wa-family`. This must fail with the expected central assurance message.

The command exits successfully only when the baseline is green and the injected regression is caught.

## Expected Output

The successful proof ends with:

```text
[harness-mutation] Mutation proof passed.
[harness-mutation] The control run was green, the injected EXUI-style WA regression was caught, and no source config was changed.
```

The expected failing assertion inside the mutated run is:

```text
api/wa-supported-jurisdiction/get is missing central must-run service families: PRIVATELAW
```

The Odhín evidence is written to:

```text
functional-output/tests/harness/mutation-proof/odhin-report/harness-mutation-proof.html
```

## Demo Script

Use this framing when showing the proof:

1. "First we run the exact central assurance check against the current central WA family contract."
2. "That goes green, so the baseline is not already broken."
3. "Now we inject a controlled EXUI-style fault: Private Law disappears from the WA-supported family API."
4. "The same central assurance check immediately fails and names the missing family."
5. "No service journey had to be replayed, and no source config was changed. This proves the gate can detect this shared regression class centrally."

## Boundary

This mutation proof demonstrates that the central assurance assertion is live and can catch a shared EXUI configuration regression.

It does not claim that every historic SRT class is now covered by a full browser-plus-CCD path. The wider POC still separates:

- API/config contract proof
- synthetic historic replay-pack proof
- thin UI proof for visible EXUI seams
- future full browser/CCD journey proof where a lane is promoted to release-blocking
