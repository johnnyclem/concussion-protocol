import type { DetectedClaim, ToolCallRecord } from "./types.js";

/**
 * Rule 1 grounding check: does a tool call in this turn plausibly supply
 * the claim's category? v1 uses a simple, overridable name-based mapping
 * from claim category to acceptable tool-call name patterns — no
 * inspection of tool arguments or results.
 */
export type GroundingPatterns = Record<string, RegExp>;

export const DEFAULT_GROUNDING_PATTERNS: GroundingPatterns = {
  time: /time|clock|date|now/i,
  current_role: /search|fetch|lookup|query|browse/i,
  existence: /search|fetch|lookup|query|browse/i,
  current_status: /search|fetch|lookup|query|browse/i,
  current_price: /search|price|quote|fetch/i,
  current_value: /search|price|quote|fetch/i,
};

/** Returns the tool calls, if any, that ground the given claim's category. */
export function findGroundingToolCalls(
  claim: Pick<DetectedClaim, "category">,
  toolCalls: ToolCallRecord[],
  patterns: GroundingPatterns = DEFAULT_GROUNDING_PATTERNS,
): ToolCallRecord[] {
  if (!claim.category) return [];
  const pattern = patterns[claim.category];
  if (!pattern) return [];
  return toolCalls.filter((call) => pattern.test(call.name));
}

/** A claim is grounded if a tool call in the same turn plausibly supplies it. */
export function checkGrounding(
  claim: Pick<DetectedClaim, "category">,
  toolCalls: ToolCallRecord[],
  patterns: GroundingPatterns = DEFAULT_GROUNDING_PATTERNS,
): "grounded" | "ungrounded" {
  return findGroundingToolCalls(claim, toolCalls, patterns).length > 0 ? "grounded" : "ungrounded";
}
