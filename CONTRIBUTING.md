# Contributing

Thanks for looking at `concussion-protocol`. This is a small, deliberately narrow library, and the bar for change is correspondingly high: every addition should make the gate more trustworthy, not just more featureful.

## Before you start

For anything beyond a small fix — a new detector pattern, a change to `GateConfig`, a new module — open an issue first describing what you want to change and why. That saves you from building something that doesn't fit the project's scope (see "What it is not" in the [README](./README.md)) before you've written the code.

## Development setup

```sh
git clone https://github.com/johnnyclem/concussion-protocol.git
cd concussion-protocol
npm install
```

Requires Node.js >= 18.

## Workflow

```sh
npm run typecheck    # tsc --noEmit
npm test              # vitest run
npm run test:coverage # vitest run --coverage
npm run build          # compile to dist/
```

Run `npm test` (or `npm run test:watch` while iterating) before opening a pull request. All four commands above must pass in CI.

## Making a change

1. Fork the repo and create a branch off `main`.
2. Make your change. Keep it scoped — one logical change per pull request.
3. Add or update tests under `test/` for anything you touch. See "Testing expectations" below.
4. Update `README.md` and/or `USAGE.md` if you changed public behavior or the public API surface (`src/index.ts`).
5. Run the full workflow above locally.
6. Open a pull request describing what changed and why. Link the issue it addresses if there is one.

## Testing expectations

This project enforces a minimum coverage threshold (currently 80% statements/branches/functions/lines, configured in `vitest.config.ts`) — `npm run test:coverage` fails the build if coverage drops below it. That threshold is a floor, not a target: new code should be tested at the same level of rigor as the existing suite, not just enough to clear the bar.

A few things specific to this codebase's test style, visible in the existing `test/*.test.ts` files:

- **Test both directions of every gate.** If a change makes something get flagged/blocked/rewritten, add a test that shows the adjacent, correctly-behaving case is *not* flagged/blocked/rewritten. False positives are exactly as costly as false negatives here (see "Why this exists" in the README) — a pattern that's too eager is as much a bug as one that's too loose.
- **Test the exact reason string / disposition, not just a boolean.** `GateResult` and `ChainVerificationResult` carry human-readable `reason` fields for a purpose: callers and auditors read them. Assert on them, not just on `blocked` or `ok`.
- **For the signed claim log (`log.ts`, `signing.ts`, `bridge.ts`, `corroboration.ts`), test tamper detection explicitly.** Write the tampered bytes to disk (or otherwise corrupt one field at a time — `index`, `prevHash`, `hash`, `signature`, claim content) and assert `verifyChain` catches it at the right `brokenAt` index with the right `reason`. Don't just test the happy append/verify path.
- **New detector patterns need both a positive and a negative fixture.** A new regex in `src/detectors/` should ship with a sentence it should match and a similar-looking sentence it should not (e.g., a historical/past-tense variant, a quoted-text variant, a hypothetical variant) — see the existing cases in `test/externalState.test.ts` and `test/selfObservation.test.ts` for the pattern.

## Scope guidance

Before proposing a new detector pattern or a config knob, re-read "What it does" and "What it is not" in the README. In particular:

- The gate does no network or model calls and stays pure with respect to its inputs. A pull request that makes `gate()` async, or has it reach out to a tool/model itself, is out of scope for v1.
- Rule 2 (self-observation) exists because a model has no introspective access to its own prior processing. Don't add a code path that lets the gate infer or "recover" that access — retrieval from an external trace (`externalTraceProvided`) is the only legitimate basis, by design.
- Check the [Roadmap](./README.md#roadmap) before proposing reconciliation (v2) or belief-model (v3) work — those are intentionally sequenced, each gated on the previous stage proving out, not built speculatively ahead of time.

If you're not sure whether a change fits, ask in the issue before writing code.

## Code style

- No comments that restate what the code does. A comment should explain a non-obvious *why* — a constraint, an invariant, a deliberately-excluded case — the way the existing `src/` files do.
- Match the existing TypeScript style: explicit exported types, small single-purpose functions, no framework/runtime dependencies beyond Node's standard library.
- Don't add a dependency to solve something Node's standard library or a few lines of code already handles — see `src/signing.ts` for the project's stance on this (Ed25519 via `node:crypto`, no third-party crypto package).

## Reporting bugs / requesting features

Open a GitHub issue. For a bug, include the input (`TurnContext`/`GateConfig`, or the log entry) that produced the wrong result and what you expected instead — the pattern-based detectors are easiest to fix from a concrete failing sentence.

## Questions

See [`FAQ.md`](./FAQ.md) first — it covers the questions that come up most before you invest time in an issue or pull request.
