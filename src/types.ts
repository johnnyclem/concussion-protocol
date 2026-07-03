/**
 * Core types for the concussion-protocol gate.
 *
 * These types describe only what the gate can actually observe: text spans
 * in a drafted response, and metadata about tool calls that occurred in the
 * current turn. Nothing here models or asserts anything about the model's
 * internal state.
 */

/** The two failure modes v1 detects. Rule 3 (scope-mismatch) is not implemented in v1. */
export type ClaimKind = "external_state" | "self_observation";

/** What the gate decided to do with a detected claim. */
export type ClaimDisposition = "grounded" | "flagged" | "rewritten";

/** A single claim the gate has identified in a response, with its disposition. */
export interface GatedClaim {
  kind: ClaimKind;
  /** The span of the response that triggered detection. */
  text: string;
  /** e.g. "time", "current_role", "current_price", "existence", "prior_reasoning" */
  category?: string;
  disposition: ClaimDisposition;
  /** Human-readable explanation of the disposition. */
  reason: string;
  /** Tool call names/ids in this turn that satisfy the claim, if grounded. */
  groundedBy?: string[];
}

/** A tool call that occurred in the current turn, before the response was drafted. */
export interface ToolCallRecord {
  /** e.g. "get_time", "web_search", "read_file" */
  name: string;
  id?: string;
}

/** The metadata the gate needs about the turn it is inspecting. */
export interface TurnContext {
  /** The drafted model response to inspect. */
  responseText: string;
  /** Tool calls that occurred in THIS turn, before the response. */
  toolCalls: ToolCallRecord[];
  /** Whether a stored trace of prior reasoning is present in context. */
  externalTraceProvided: boolean;
}

/** The provenance record emitted for every gated response. */
export interface ProvenanceRecord {
  /** ISO 8601, from a real clock at emission time. */
  timestamp: string;
  claims: GatedClaim[];
  summary: {
    total: number;
    grounded: number;
    flagged: number;
    rewritten: number;
  };
}

/** Configuration for gate behavior. */
export interface GateConfig {
  /** "block" sets GateResult.blocked = true; "flag" annotates and passes. */
  onUngroundedExternalClaim: "block" | "flag";
  /** If true, rewrite self-observation grammar into inference grammar when unrewritable spans are not hit. */
  rewriteSelfObservation: boolean;
}

/** The result of running the gate over a turn. */
export interface GateResult {
  /** Possibly rewritten; unchanged from TurnContext.responseText if no rewrites occurred. */
  responseText: string;
  claims: GatedClaim[];
  provenance: ProvenanceRecord;
  /** True if config was "block" and an ungrounded external claim was found. */
  blocked: boolean;
}

/** A claim as detected before disposition has been assigned. */
export interface DetectedClaim {
  kind: ClaimKind;
  text: string;
  category?: string;
  /** Index into the response text where the detected span starts. */
  index: number;
}
