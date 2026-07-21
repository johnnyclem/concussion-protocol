/**
 * Core types for the concussion-protocol gate.
 *
 * These types describe only what the gate can actually observe: text spans
 * in a drafted response, and metadata about tool calls that occurred in the
 * current turn. Nothing here models or asserts anything about the model's
 * internal state.
 */

/** The three failure modes v1 detects, one per rule in SKILL.md. */
export type ClaimKind = "external_state" | "self_observation" | "scope_mismatch";

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
  /** "block" sets GateResult.blocked = true; "flag" annotates and passes. Defaults to "flag" if omitted. */
  onScopeMismatch?: "block" | "flag";
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

/*
 * ---------------------------------------------------------------------------
 * Signed claim log (part two): persistence and corroboration for the
 * ProvenanceRecords the v1 gate emits. Storing a record was left as "the
 * caller's job" in v1; these types are that job, done as an append-only,
 * hash-linked, signed log rather than a plain mutable store.
 * ---------------------------------------------------------------------------
 */

/**
 * A source that can attest to a claim, independent of the agent's own
 * generation: a tool call, an external document, a human reviewer, another
 * agent. A single witness is not corroboration; see `assessGrounding`.
 *
 * `attestation` must state only what this witness can actually establish —
 * bounded to what the source can support, and stored verbatim wherever it is
 * recorded. The library never writes this field itself; it is always
 * supplied by the caller, because only the caller knows what its sources
 * actually attest.
 */
export interface Witness {
  /** Stable identifier for the witness, e.g. a tool call id, a URL, a reviewer id. */
  id: string;
  /** e.g. "tool_call", "external_document", "human_review" */
  kind: string;
  /** What this witness actually attests. Bounded, non-empty, stored verbatim. */
  attestation: string;
}

/**
 * A caller-supplied justification that two or more witnesses are independent
 * of one another (do not share a failure mode). `witnesses` lists the ids of
 * the witnesses this basis covers. Never invented by the library — a claim
 * of independence is always the caller's, because only the caller knows
 * whether its sources can actually fail together.
 */
export interface IndependenceBasis {
  /** Ids of the witnesses (from the same witness list) that this basis claims are independent of one another. */
  witnesses: string[];
  /** Human-readable justification for the independence claim. Caller-supplied, stored verbatim. */
  reason: string;
}

/** The two grounding strengths a claim can reach once witnesses are attached. */
export type GroundingLevel = "single" | "corroborated";

/**
 * A claim ready to be committed to the signed log: a v1 GatedClaim plus the
 * witnesses backing it, any independence basis supplied for those witnesses,
 * and the grounding level that follows from `assessGrounding`.
 */
export interface GroundedClaim {
  kind: ClaimKind;
  text: string;
  category?: string;
  witnesses: Witness[];
  independence?: IndependenceBasis;
  groundingLevel: GroundingLevel;
  /** Human-readable explanation of the groundingLevel verdict. */
  reason: string;
}

/** The content of a log entry, before hashing and signing. */
export interface LogEntryContent {
  /** Position in the log, starting at 0. */
  index: number;
  /** ISO 8601, from a real clock at append time. */
  timestamp: string;
  claim: GroundedClaim;
  /** Hash of the previous entry, or null for the first entry in the log. */
  prevHash: string | null;
  /** Id of the signer that asserted this entry. */
  identity: string;
}

/**
 * One append-only entry in a claim log. `hash` is the SHA-256 digest of the
 * canonical serialization of the content fields above, so it changes if any
 * of them change; `prevHash` links each entry to the one before it, so
 * altering an earlier entry breaks the hash of every entry after it.
 */
export interface LogEntry extends LogEntryContent {
  hash: string;
  /** Base64-encoded Ed25519 signature over the canonical content. */
  signature: string;
}

/** The result of appending one entry to a ClaimLog. */
export interface AppendResult {
  entry: LogEntry;
  /** True if reading the entry back and re-checking its hash-link and signature succeeded. */
  verified: boolean;
}

/** A durable place to store log entries, one append at a time. Kept behind an interface so the backend can change without touching log logic. */
export interface ClaimLogStorage {
  readAll(): LogEntry[];
  append(entry: LogEntry): void;
}

/** The result of walking a claim log's hash chain and signatures from genesis. */
export interface ChainVerificationResult {
  ok: boolean;
  /** Index of the first entry where the chain breaks, if any. */
  brokenAt?: number;
  /** Human-readable explanation of the break. */
  reason?: string;
}
