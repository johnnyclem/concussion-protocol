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
} from "./types.js";

export { gate } from "./gate.js";

export { detectExternalStateClaims } from "./detectors/externalState.js";

export { detectSelfObservation, findSelfObservationMatches, applyRewrite } from "./detectors/selfObservation.js";
export type { SelfObservationMatch } from "./detectors/selfObservation.js";

export { checkGrounding, findGroundingToolCalls, DEFAULT_GROUNDING_PATTERNS } from "./grounding.js";
export type { GroundingPatterns } from "./grounding.js";
