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

The gate does no network or model calls and is pure with respect to its
inputs: run it, read `blocked`, decide whether to return `responseText` to
the caller or ask the model to redraft, and persist `provenance` wherever
you keep ground-truth records.
