export type {
  ClaimKind,
  ClaimDisposition,
  GatedClaim,
  ToolCallRecord,
  TurnContext,
  ProvenanceRecord,
  GateConfig,
  GateResult,
  DetectedClaim,
  Witness,
  IndependenceBasis,
  GroundingLevel,
  GroundedClaim,
  LogEntryContent,
  LogEntry,
  AppendResult,
  ClaimLogStorage,
  ChainVerificationResult,
} from "./types.js";

export { gate } from "./gate.js";

export { detectExternalStateClaims } from "./detectors/externalState.js";

export { detectScopeMismatches } from "./detectors/scopeMismatch.js";

export { detectSelfObservation, findSelfObservationMatches, applyRewrite } from "./detectors/selfObservation.js";
export type { SelfObservationMatch } from "./detectors/selfObservation.js";

export { checkGrounding, findGroundingToolCalls, DEFAULT_GROUNDING_PATTERNS } from "./grounding.js";
export type { GroundingPatterns } from "./grounding.js";

export { assessGrounding, UngroundedClaimError, InvalidWitnessError } from "./corroboration.js";

export { canonicalize, hashCanonical, generateIdentity, signEntry, verifyEntry } from "./signing.js";
export type { GeneratedIdentity } from "./signing.js";

export { ClaimLog, JsonlFileStorage } from "./log.js";

export { commitGateResult } from "./bridge.js";
export type { WitnessResolution, WitnessResolver, CommitOptions } from "./bridge.js";
