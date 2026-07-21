import type { GateConfig, GateResult, GatedClaim, ProvenanceRecord, TurnContext } from "./types.js";
import { detectExternalStateClaims } from "./detectors/externalState.js";
import { applyRewrite, findSelfObservationMatches } from "./detectors/selfObservation.js";
import { detectScopeMismatches } from "./detectors/scopeMismatch.js";
import { findGroundingToolCalls } from "./grounding.js";

/**
 * Runs the grounding gate and self-report firewall over a drafted turn and
 * emits a provenance record. Pure: no network or model calls, no hidden
 * state — every disposition follows from turn.responseText and
 * turn.toolCalls as given.
 */
export function gate(turn: TurnContext, config: GateConfig): GateResult {
  const ordered: Array<{ index: number; claim: GatedClaim }> = [];
  let blocked = false;

  for (const claim of detectExternalStateClaims(turn.responseText)) {
    const groundedBy = findGroundingToolCalls(claim, turn.toolCalls);
    if (groundedBy.length > 0) {
      ordered.push({
        index: claim.index,
        claim: {
          kind: "external_state",
          text: claim.text,
          category: claim.category,
          disposition: "grounded",
          reason: `A tool call in this turn (${groundedBy.map((t) => t.name).join(", ")}) plausibly supplies this claim.`,
          groundedBy: groundedBy.map((t) => t.id ?? t.name),
        },
      });
      continue;
    }

    const willBlock = config.onUngroundedExternalClaim === "block";
    if (willBlock) blocked = true;
    ordered.push({
      index: claim.index,
      claim: {
        kind: "external_state",
        text: claim.text,
        category: claim.category,
        disposition: "flagged",
        reason: willBlock
          ? "No tool call in this turn grounds this external-state claim; blocking per configuration."
          : "No tool call in this turn grounds this external-state claim.",
      },
    });
  }

  let responseText = turn.responseText;
  // Apply rewrites right-to-left so earlier matches' indices stay valid as
  // later (rightward) spans are replaced.
  const selfMatches = [...findSelfObservationMatches(turn.responseText)].sort((a, b) => b.index - a.index);
  for (const match of selfMatches) {
    if (turn.externalTraceProvided) {
      ordered.push({
        index: match.index,
        claim: {
          kind: "self_observation",
          text: match.matchedText,
          category: "prior_reasoning",
          disposition: "grounded",
          reason: "An external trace of prior reasoning is present in context; reasoning about it is retrieval, not introspection.",
        },
      });
      continue;
    }

    if (config.rewriteSelfObservation && match.replacement !== null) {
      responseText = applyRewrite(responseText, match);
      ordered.push({
        index: match.index,
        claim: {
          kind: "self_observation",
          text: match.matchedText,
          category: "prior_reasoning",
          disposition: "rewritten",
          reason: "Observation grammar about the agent's own prior processing was rewritten to inference grammar; no external trace justified the original phrasing.",
        },
      });
      continue;
    }

    ordered.push({
      index: match.index,
      claim: {
        kind: "self_observation",
        text: match.matchedText,
        category: "prior_reasoning",
        disposition: "flagged",
        reason:
          config.rewriteSelfObservation && match.replacement === null
            ? "Observation grammar about the agent's own prior processing was detected, but a clean mechanical rewrite could not be produced; flagging instead of risking a garbled response."
            : "Observation grammar about the agent's own prior processing was detected; rewriting is disabled by configuration.",
      },
    });
  }

  for (const claim of detectScopeMismatches(turn.responseText)) {
    const willBlock = config.onScopeMismatch === "block";
    if (willBlock) blocked = true;
    ordered.push({
      index: claim.index,
      claim: {
        kind: "scope_mismatch",
        text: claim.text,
        category: claim.category,
        disposition: "flagged",
        reason: willBlock
          ? "This conclusion is broader than the narrow check the response itself names as its basis; blocking per configuration."
          : "This conclusion is broader than the narrow check the response itself names as its basis.",
      },
    });
  }

  ordered.sort((a, b) => a.index - b.index);
  const claims = ordered.map((o) => o.claim);

  const summary = {
    total: claims.length,
    grounded: claims.filter((c) => c.disposition === "grounded").length,
    flagged: claims.filter((c) => c.disposition === "flagged").length,
    rewritten: claims.filter((c) => c.disposition === "rewritten").length,
  };

  // The one timestamp this library emits is grounded in an actual clock
  // call rather than asserted from memory — Rule 1, applied to itself.
  const provenance: ProvenanceRecord = {
    timestamp: new Date().toISOString(),
    claims,
    summary,
  };

  return { responseText, claims, provenance, blocked };
}
