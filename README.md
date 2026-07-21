# concussion-protocol

A middleware layer that keeps an AI agent's confident output tethered to something outside its own generation.

Language models produce fluent, confident text by default, whether or not anything underneath it is grounded. In that architecture, confidence is not a signal of correctness. It is what happens when nothing pushes back. `concussion-protocol` is the thing that pushes back: a thin gate that inspects each drafted response, blocks or flags claims that assert external facts without touching an external source, rewrites false self-observation into honest inference, and emits a provenance record of what was grounded and what was not.

The name is from the medical check that asks a patient who the president is. The answer does not matter. The point is to test whether they can still reach a reality outside their own head.

## Contents

- [Why this exists](#why-this-exists)
- [What it does](#what-it-does)
- [Installation](#installation)
- [Quick start](#quick-start)
- [What it is not](#what-it-is-not)
- [Architecture](#architecture)
- [Roadmap](#roadmap)
- [Development](#development)
- [Status](#status)
- [Contributing](#contributing)
- [License](#license)

## Why this exists

Three failure modes recur in agent output, and all three are invisible from the inside because they wear the same fluent grammar as correct output:

1. **Ungrounded external claims.** The agent states the current time, price, officeholder, or state of the world without checking, because the claim feels obvious. It often is not, and even when it happens to be right, being right by guess is luck, not method.
2. **False self-observation.** The agent claims to "see" what it did in a prior turn or "observe" its own reasoning, when it has no introspective access to either. It is generating a plausible account of its own history using the same mechanism it uses for everything else.
3. **Scope-mismatched conclusions.** The agent checks one narrow thing, finds an absence, and concludes something broad, which feels like diligence and disguises the gap.

A skill file (instructions the agent reads) can describe the discipline, and this repo ships one, in [`SKILL.md`](./SKILL.md). But instructions get drifted from under load. Enforcement that survives drift has to run in code, on every response. That is what this library is.

## What it does

`concussion-protocol` wraps an agent SDK call and runs a fast, deterministic pass over the drafted response before returning it:

- **Grounding gate.** Detects present-tense external-state claims (time, current facts, "the latest X," "who is Y") and checks whether a corresponding tool call occurred in the same turn. If not, the claim is blocked or flagged per configuration.
- **Self-report firewall.** Detects first-person observation grammar about the agent's own prior processing ("I can see that I...", "my earlier reasoning showed...") and, absent an external trace in context, rewrites it from observation to inference.
- **Scope-mismatch detector.** Detects broad, universal-sounding conclusions ("this fixes the issue," "handles all edge cases," "this always works") whose only stated basis, named in the same response, is a narrower check ("wrote a test for the happy path," "checked one case") with nothing broader-scoped to justify the wider claim. Blocked or flagged per configuration, same as the grounding gate.
- **Provenance emission.** Every gated response produces a structured record: which claims were grounded by which tool touches, which were flagged, and why. This record is shaped to drop directly into an [AgentVault](https://github.com/johnnyclem/AgentVault)-style ground-truth store.

The v1 detector is pattern-based, not an LLM call. Most of the highest-value cases (present-tense external-fact patterns, self-observation grammar) are surprisingly regular and catchable cheaply. A model-based classifier is a later option, added only if measurement shows the cheap pass leaves real value on the table, not assumed up front.

## Installation

Not yet published to a package registry. Install it from source:

```sh
git clone https://github.com/johnnyclem/concussion-protocol.git
cd concussion-protocol
npm install
npm run build
```

Requires Node.js >= 18.

## Quick start

```ts
import { gate, type GateConfig, type TurnContext } from "concussion-protocol";

const config: GateConfig = {
  onUngroundedExternalClaim: "block", // or "flag" to annotate and pass through
  rewriteSelfObservation: true,
};

const turn: TurnContext = {
  responseText: "It is late, so I'll keep this brief.",
  toolCalls: [],
  externalTraceProvided: false,
};

const result = gate(turn, config);
console.log(result.blocked); // true, because no tool call grounds the time claim
```

`gate()` does no network or model calls. It is a pure, synchronous function of its inputs: a `TurnContext` in, a `GateResult` out. See [`USAGE.md`](./USAGE.md) for the full walkthrough, including the signed claim log (`ClaimLog`, `commitGateResult`) that persists grounded claims as an append-only, hash-linked, Ed25519-signed record.

## What it is not

- It is **not** a way for a model to introspect on its own weights or activations. That is not possible, and this library does not pretend to it. Rule 2 exists precisely because that access does not exist.
- It is **not** a correctness guarantee. It gates specific, detectable failure modes. It does not make output true.
- It is **not** a convergence loop that iterates until the model agrees with itself. Agreement between passes is agreement, not correctness; a closed loop can converge on a confident shared error. Any reconciliation feature (see roadmap) terminates only when external claims have been independently grounded, never on internal agreement alone.

## Architecture

`concussion-protocol` is designed to compose with three existing pieces rather than reinvent them:

- **[stenographer](https://github.com/johnnyclem/stenographer)** captures session history and reasoning traces to durable storage. This is what makes Rule 2's "retrieval, not introspection" possible: a stored trace is an external source the agent can legitimately reason about, unlike its own live processing.
- **[short-hand](https://github.com/johnnyclem/short-hand)** compacts stored traces into a form small enough to re-inject as context, which is what makes a reconciliation pass affordable.
- **[AgentVault](https://github.com/johnnyclem/AgentVault)** stores the provenance records this library emits as ground truth with provenance.

The gate itself is the seam that connects them: it consumes compacted prior state (via short-hand), enforces grounding on the current draft, and emits provenance (to AgentVault). It is not a fourth system. It is the piece that makes the existing three do a job together.

## Roadmap

**v1 (shipped).** The grounding gate, self-report firewall, and scope-mismatch detector, pattern-based, with provenance emission. No trace capture, no reconciliation. Independently useful, and the foundation every later version sits on.

**v1 + signed claim log (shipped).** The persistence layer v1 left to the caller. `ClaimLog` is an append-only, hash-linked, Ed25519-signed JSONL store; `commitGateResult` bridges a v1 `GateResult` into it. Adds the corroboration primitive: a claim reaches `groundingLevel: "corroborated"` only when the caller supplies two or more witnesses plus a recorded, human-or-caller-supplied reason they're independent. A bare count of witnesses that might share a failure mode stays `"single"`. No key management or distribution, no network, no blockchain; keys are caller-supplied.

**v2 (next).** Single-pass reconciliation. The draft is checked once against a stored trace (via stenographer and short-hand); disagreement between the output and the recorded reasoning is surfaced. Proves the seam works at a small scale.

**v3.** Multi-pass convergence plus a minimal belief model (segments carry evidence weight and update only when grounded counter-evidence exceeds their mass; core beliefs are human-override-only). Added only after v2 shows reconciliation produces real signal, and only with the external-grounding invariant wired in as the thing that prevents comfortable-wrong convergence.

## Development

```sh
npm install
npm run build          # compile to dist/
npm run typecheck      # tsc --noEmit
npm test                # vitest run
npm run test:coverage   # vitest run --coverage (enforces an 80% floor)
```

## Status

v1 and the signed claim log are implemented and tested (see `test/`, and `npm run test:coverage` for the current coverage report). v2 reconciliation is not yet started.

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the development workflow and testing expectations, and [`FAQ.md`](./FAQ.md) for answers to common questions before opening an issue.

## License

GPL v3. See [`LICENSE`](./LICENSE).
