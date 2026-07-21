# Usage

`concussion-protocol` inspects a drafted response before it goes out. You
assemble a `TurnContext` (the response text, the tool calls that happened
this turn, and whether a stored reasoning trace is in context), call `gate`,
and get back the response text (possibly rewritten), the individual claims
it found, and a provenance record.

```ts
import { gate, type GateConfig, type TurnContext } from "concussion-protocol";

const config: GateConfig = {
  onUngroundedExternalClaim: "block", // or "flag" to annotate and pass through
  rewriteSelfObservation: true,
};

// --- Ungrounded case: no tool call backs the time claim, so the gate blocks. ---
const ungrounded: TurnContext = {
  responseText: "It is late, so I'll keep this brief.",
  toolCalls: [],
  externalTraceProvided: false,
};

const blockedResult = gate(ungrounded, config);
console.log(blockedResult.blocked); // true
console.log(blockedResult.claims[0]);
// {
//   kind: "external_state",
//   text: "It is late",
//   category: "time",
//   disposition: "flagged",
//   reason: "No tool call in this turn grounds this external-state claim; blocking per configuration."
// }

// --- Grounded case: a time tool call in the same turn satisfies the claim. ---
const grounded: TurnContext = {
  responseText: "It is late, so I'll keep this brief.",
  toolCalls: [{ name: "get_time" }],
  externalTraceProvided: false,
};

const groundedResult = gate(grounded, config);
console.log(groundedResult.blocked); // false
console.log(groundedResult.claims[0]);
// {
//   kind: "external_state",
//   text: "It is late",
//   category: "time",
//   disposition: "grounded",
//   reason: "A tool call in this turn (get_time) plausibly supplies this claim.",
//   groundedBy: ["get_time"]
// }

// Both results also carry a provenance record, ready to hand to a store:
console.log(groundedResult.provenance);
// {
//   timestamp: "2026-07-03T12:00:00.000Z",
//   claims: [ ... ],
//   summary: { total: 1, grounded: 1, flagged: 0, rewritten: 0 }
// }
```

Self-observation works the same way: if `externalTraceProvided` is `false`
and `rewriteSelfObservation` is `true`, observation grammar about the
agent's own prior processing (`"I can see that I ..."`) is mechanically
rewritten into inference grammar (`"I would expect, though I can't verify
it from the inside, that I ..."`) rather than blocked — the response still
goes out, just with an honest epistemic status.

Scope-mismatched conclusions are the third case: a broad, universal-sounding
claim ("this fixes the issue," "handles all edge cases") whose only stated
basis, named in the same response, is a narrower check ("wrote a test for
the happy path," "checked one case"). There is no rewrite for this one —
narrowing a claim correctly requires knowing what was actually checked, so
the gate only blocks or flags per `onScopeMismatch` (defaults to `"flag"`
if omitted):

```ts
const scopeConfig: GateConfig = { onUngroundedExternalClaim: "flag", rewriteSelfObservation: true, onScopeMismatch: "block" };
const mismatched: TurnContext = {
  responseText: "I wrote a test for the happy path and it passes, so this fixes the issue.",
  toolCalls: [],
  externalTraceProvided: false,
};

const scopeResult = gate(mismatched, scopeConfig);
console.log(scopeResult.blocked); // true
console.log(scopeResult.claims[0]);
// {
//   kind: "scope_mismatch",
//   text: "this fixes the issue",
//   category: "completeness",
//   disposition: "flagged",
//   reason: "This conclusion is broader than the narrow check the response itself names as its basis; blocking per configuration."
// }
```

The gate does no network or model calls and is pure with respect to its
inputs: run it, read `blocked`, decide whether to return `responseText` to
the caller or ask the model to redraft, and persist `provenance` wherever
you keep ground-truth records.

## Persisting grounded claims: the signed claim log

`gate` returns a `ProvenanceRecord`; storing it durably is the caller's job.
`ClaimLog` is that store: an append-only, hash-linked, Ed25519-signed JSONL
file. `commitGateResult` bridges the two — it reads a `GateResult`, and for
every claim with disposition `"grounded"` asks a caller-supplied
`witnessResolver` what actually backs it. The library never invents a
witness or an independence claim; only the caller knows what its tools
actually attest.

```ts
import { gate, commitGateResult, ClaimLog, JsonlFileStorage, generateIdentity } from "concussion-protocol";
import type { GateConfig, TurnContext } from "concussion-protocol";

const config: GateConfig = { onUngroundedExternalClaim: "flag", rewriteSelfObservation: true };
const turn: TurnContext = {
  responseText: "It is 3pm.",
  toolCalls: [{ name: "get_time", id: "call_1" }],
  externalTraceProvided: false,
};

const result = gate(turn, config);

// The log is a plain JSONL file; identity is an Ed25519 keypair the caller manages.
const log = new ClaimLog(new JsonlFileStorage("./claims.jsonl"));
const { identity, privateKeyPem, publicKeyPem } = generateIdentity();

const appended = commitGateResult(
  result,
  (claim) => {
    if (claim.category !== "time") return undefined;
    // Only the caller knows what get_time actually attests.
    return {
      witnesses: [{ id: "get_time#call_1", kind: "tool_call", attestation: "get_time returned 15:00:00Z for this turn." }],
    };
  },
  { log, privateKeyPem, identity },
);

console.log(appended[0]?.verified); // true
console.log(log.entries()[0]?.claim.groundingLevel); // "single" — one witness, no independence basis

// Verifying the chain walks it from genesis, recomputing every hash and signature.
console.log(log.verifyChain((id) => (id === identity ? publicKeyPem : undefined)));
// { ok: true }

// --- Tamper detection: edit one past entry on disk, then re-verify. ---
import { readFileSync, writeFileSync } from "node:fs";

const lines = readFileSync("./claims.jsonl", "utf8").trim().split("\n");
const tampered = JSON.parse(lines[0]!);
tampered.claim.text = "It is midnight."; // silently rewrite history
writeFileSync("./claims.jsonl", `${JSON.stringify(tampered)}\n`, "utf8");

console.log(log.verifyChain((id) => (id === identity ? publicKeyPem : undefined)));
// { ok: false, brokenAt: 0, reason: "entry.hash does not match the entry's content; the entry has been altered." }
```

Two or more witnesses only reach `groundingLevel: "corroborated"` when the
caller also supplies an `IndependenceBasis` naming two or more of them —
witnesses that might share a failure mode, with no recorded reason they
don't, stay capped at `"single"`. `ClaimLog` has no update or delete method:
rewriting a past entry, as above, is exactly what `verifyChain` is built to
catch, so the API never offers a quiet way to do it.
