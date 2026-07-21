# FAQ

## What problem does this actually solve?

Language models write confidently whether or not the underlying claim is grounded in anything outside the model's own generation. `concussion-protocol` is a code-level check that runs on the drafted response before it goes to the user: it looks for present-tense claims about the external world, for the agent narrating its own "observations" of its prior processing, and for broad conclusions whose only stated basis is a narrower check, and it blocks, flags, or rewrites what it finds. See the [README](./README.md) for the full rationale.

## Is this an LLM call? Does it add latency or cost?

No. The v1 detectors (`detectExternalStateClaims`, `detectSelfObservation`, `detectScopeMismatches`) and the grounding check (`checkGrounding`) are all regex-based pattern matching over the response text — no network call, no model call. `gate()` is a pure, synchronous function of its inputs. It adds negligible latency (regex passes over a string) and zero API cost. A model-based classifier is listed as a possible later addition, but only if evidence shows the pattern-based pass is leaving real value on the table — see the README's "What it does" section.

## Does the gate rewrite my model's output for me automatically?

`gate()` returns a result; it's the caller's job to act on it. Depending on your `GateConfig`:

- Ungrounded external-state claims are either **flagged** (annotated in the returned claims, response text unchanged) or, with `onUngroundedExternalClaim: "block"`, cause `result.blocked` to be `true` — the caller decides whether to suppress the response, ask the model to redraft, or something else. The library never redrafts a blocked response itself.
- Self-observation text, with `rewriteSelfObservation: true`, is mechanically rewritten in the *returned* `responseText` (from observation grammar to inference grammar) — but only when a clean rewrite exists; otherwise it's flagged instead of risking garbled output.
- Scope-mismatched conclusions (a broad claim whose only stated basis is a narrower, named check) are **flagged** or, with `onScopeMismatch: "block"`, cause `result.blocked` to be `true`. As with external-state claims, the library never rewrites the conclusion for you — narrowing a claim correctly requires knowing what was actually checked, which only the caller (or the model, on redraft) has.

See [`USAGE.md`](./USAGE.md) for the full example of reading `blocked`, `claims`, and `responseText` off a `GateResult`.

## Why can't the model just check whether its own reasoning was correct?

Because it has no introspective access to its own prior processing. When a model appears to "recall" what it was thinking on a previous turn, it isn't reading a record — it's generating fresh, plausible-sounding text using the same mechanism it uses for everything else, including for facts it's simply wrong about. That's indistinguishable from confabulation until an external record backs it up. That's Rule 2, and it's why `externalTraceProvided` — not the model's say-so — is the only thing that turns a self-report into something the gate treats as grounded rather than rewriting or flagging. See "What it is not" in the README.

## What counts as "grounding" a claim?

A tool call in the *same turn* whose name plausibly matches the claim's category. v1 uses a simple, overridable name-based mapping (`DEFAULT_GROUNDING_PATTERNS` in `src/grounding.ts`) — for example, a claim in the `time` category is grounded by a tool call whose name matches `/time|clock|date|now/i`. It does **not** inspect tool arguments or results, so it can't tell whether the tool call's *result* actually supports the specific claim, only that a plausibly-relevant tool was touched this turn. You can supply your own `GroundingPatterns` to `checkGrounding`/`findGroundingToolCalls` if your tool names don't match the defaults.

## What's the difference between "flagged," "blocked," and "rewritten"?

These are the three claim `disposition`s a `GateResult` can carry, plus the top-level `blocked` boolean:

- **`grounded`** — a matching tool call this turn (for external-state claims) or an external trace in context (for self-observation) backs the claim.
- **`flagged`** — the claim is annotated in `result.claims` with a reason, but `responseText` is returned unchanged. This is the default outcome for an ungrounded external claim under `onUngroundedExternalClaim: "flag"`, for a scope-mismatched conclusion under `onScopeMismatch: "flag"` (the default when the option is omitted), and for self-observation when rewriting is off or no clean rewrite exists.
- **`rewritten`** — only applies to self-observation: the text was mechanically changed from observation grammar to inference grammar in the returned `responseText`.
- **`blocked`** (top-level, not a claim disposition) — `true` when `onUngroundedExternalClaim: "block"` and at least one external-state claim went ungrounded, or when `onScopeMismatch: "block"` and at least one scope-mismatched conclusion was found. It's a signal to the caller, not an action the library takes on your behalf (see above).

## What is the signed claim log, and do I need it?

`ClaimLog` (in `src/log.ts`) is an optional, separate persistence layer: an append-only, hash-linked, Ed25519-signed JSONL store for claims the gate found `grounded`. `commitGateResult` (`src/bridge.ts`) bridges a `GateResult` into it. You don't need it to use the gate — `gate()` works standalone and returns a `ProvenanceRecord` you can do whatever you want with. The claim log exists for callers who want a durable, tamper-evident record of what was grounded and by what, e.g. for audit or for feeding an [AgentVault](https://github.com/johnnyclem/AgentVault)-style store. See [`USAGE.md`](./USAGE.md) for the full example, including how `verifyChain` detects tampering.

## What does `groundingLevel: "corroborated"` vs. `"single"` mean, and why is it so hard to get `"corroborated"`?

A claim reaches `"corroborated"` only when it has two or more **distinct** witnesses (by witness `id`) *and* the caller supplies an `IndependenceBasis` that explicitly names two or more of those distinct witnesses as independent. Two witnesses with no recorded independence claim, or witnesses that might share a failure mode (e.g., both reads of the same underlying source), stay capped at `"single"`. This is deliberate: a bare count of witnesses is not corroboration if they can fail together, and the library refuses to assume independence you haven't stated. See `src/corroboration.ts` and the `assessGrounding` doc comment for the exact rule.

## Can the library fabricate a witness or an independence claim for me?

No, on purpose. `WitnessResolver` (the function you pass to `commitGateResult`) is caller-supplied precisely because only your code knows what your tools actually attest to. The library never invents a witness, an attestation string, or an independence reason — if your resolver returns `undefined` for a claim, that claim is simply skipped and never enters the log.

## How is this different from just prompting the model to "double-check itself" or "cite sources"?

A prompt-level instruction (including the `SKILL.md` this repo ships) can describe the same discipline, and often should — it's cheap and it helps. But instructions are exactly the kind of thing that drifts under load: as context grows or a session goes long, an agent following instructions alone will eventually skip the check, the same way a tired person forgets a habit. `concussion-protocol` runs the check in code, after generation, on every response, so it doesn't depend on the model remembering to follow the instruction that turn.

## Is `concussion-protocol` a guarantee that output is true?

No. It gates specific, detectable failure modes — ungrounded present-tense external claims, false self-observation grammar, and scope-mismatched conclusions — and it does that deterministically. It does not verify the *content* of a grounded claim (a tool call can itself return something wrong), and its scope-mismatch detector only catches conclusions whose narrower basis is named in the response text itself, not every case where verification was actually narrower than a claim. See "What it is not" in the README for the full list of things this library does not claim to do.

## Does this replace `stenographer`, `short-hand`, or `AgentVault`?

No — it's designed to compose with them, not replace them. `stenographer` captures the session trace that makes `externalTraceProvided` legitimate in the first place; `short-hand` compacts that trace back into context; `AgentVault` is a natural home for the `ProvenanceRecord`s this library emits. `concussion-protocol` is the gate that sits at the seam between them — see "Architecture" in the README.

## What Node/TypeScript version do I need, and are there runtime dependencies?

Node.js >= 18. The only runtime dependency is Node's own standard library (`node:crypto`, `node:fs`, `node:path` for the claim-log pieces) — no third-party packages ship in `dist/`. `typescript` and `vitest` are devDependencies only.

## How do I run the tests, and what's the coverage bar?

```sh
npm install
npm test              # vitest run
npm run test:coverage # vitest run --coverage, enforces the thresholds below
```

`vitest.config.ts` enforces a minimum of 80% statements/branches/functions/lines. See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for what's expected of new tests, not just the minimum bar.

## I found a bug in a detector pattern — a sentence that should (or shouldn't) match. What do I do?

Open an issue with the exact sentence, what the current behavior is, and what you expected. Because the detectors are pattern-based, the fastest path to a fix is usually a small, targeted regex change plus a test pair (a positive fixture that should match, a negative one that shouldn't) — see [`CONTRIBUTING.md`](./CONTRIBUTING.md#testing-expectations) for the expected shape of that test.

## Where do I ask something not covered here?

Open a GitHub issue on [johnnyclem/concussion-protocol](https://github.com/johnnyclem/concussion-protocol).
