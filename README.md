# concussion-protocol

A middleware layer that keeps an AI agent's confident output tethered to something outside its own generation.

Language models produce fluent, confident text by default, whether or not anything underneath it is grounded. In that architecture, confidence is not a signal of correctness. It is what happens when nothing pushes back. `concussion-protocol` is the thing that pushes back: a thin gate that inspects each drafted response, blocks or flags claims that assert external facts without touching an external source, rewrites false self-observation into honest inference, and emits a provenance record of what was grounded and what was not.

The name is from the medical check that asks a patient who the president is. The answer does not matter. The point is to test whether they can still reach a reality outside their own head.

## Why this exists

Three failure modes recur in agent output, and all three are invisible from the inside because they wear the same fluent grammar as correct output:

1. **Ungrounded external claims.** The agent states the current time, price, officeholder, or state of the world without checking, because the claim feels obvious. It often is not, and even when it happens to be right, being right by guess is luck, not method.
2. **False self-observation.** The agent claims to "see" what it did in a prior turn or "observe" its own reasoning, when it has no introspective access to either. It is generating a plausible account of its own history using the same mechanism it uses for everything else.
3. **Scope-mismatched conclusions.** The agent checks one narrow thing, finds an absence, and concludes something broad, which feels like diligence and disguises the gap.

A skill file (instructions the agent reads) can describe the discipline, and this repo ships one. But instructions get drifted from under load. Enforcement that survives drift has to run in code, on every response. That is what this library is.

## What it does

`concussion-protocol` wraps an agent SDK call and runs a fast, deterministic pass over the drafted response before returning it:

- **Grounding gate.** Detects present-tense external-state claims (time, current facts, "the latest X," "who is Y") and checks whether a corresponding tool call occurred in the same turn. If not, the claim is blocked or flagged per configuration.
- **Self-report firewall.** Detects first-person observation grammar about the agent's own prior processing ("I can see that I...", "my earlier reasoning showed...") and, absent an external trace in context, rewrites it from observation to inference.
- **Provenance emission.** Every gated response produces a structured record: which claims were grounded by which tool touches, which were flagged, and why. This record is shaped to drop directly into an [AgentVault](https://github.com/johnnyclem/AgentVault)-style ground-truth store.

The v1 detector is pattern-based, not an LLM call. Most of the highest-value cases (present-tense-external-fact patterns, self-observation grammar) are surprisingly regular and catchable cheaply. A model-based classifier is a later option, added only if measurement shows the cheap pass leaves real value on the table, not assumed up front.

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

**v1 (this repo, initial):** the grounding gate and self-report firewall, pattern-based, with provenance emission. No trace capture, no reconciliation. Independently useful and the foundation every later version sits on.

**v2:** single-pass reconciliation. The draft is checked once against a stored trace (via stenographer + short-hand); disagreement between the output and the recorded reasoning is surfaced. Proves the seam works on a small scale.

**v3:** multi-pass convergence plus a minimal belief model (segments carry evidence weight and update only when grounded counter-evidence exceeds their mass; core beliefs are human-override-only). Added only after v2 shows reconciliation produces real signal, and only with the external-grounding invariant wired in as the thing that prevents comfortable-wrong convergence. Design recorded in `DESIGN-v3.md`.

## Status

Early. v1 module and test suite are the first build target. See `HANDOFF.md` for the implementation spec.

## License

GPL V3
