import type { AppendResult, GateResult, GatedClaim, GroundedClaim, IndependenceBasis, Witness } from "./types.js";
import { assessGrounding } from "./corroboration.js";
import type { ClaimLog } from "./log.js";

/** What a witnessResolver returns for one grounded claim: its witnesses, and how they're independent, if at all. */
export interface WitnessResolution {
  witnesses: Witness[];
  independence?: IndependenceBasis;
}

/**
 * Maps a grounded GatedClaim (including its `groundedBy` tool calls) to the
 * witnesses that back it. Caller-supplied: the library never invents a
 * witness or an independence basis, because only the caller knows what its
 * tools actually attest. Returning `undefined` skips committing that claim.
 */
export type WitnessResolver = (claim: GatedClaim) => WitnessResolution | undefined;

export interface CommitOptions {
  log: ClaimLog;
  privateKeyPem: string;
  identity: string;
}

function explainGroundingLevel(resolution: WitnessResolution, level: "single" | "corroborated"): string {
  if (level === "corroborated") {
    return `Backed by ${resolution.witnesses.length} witnesses with a recorded independence basis covering two or more of them.`;
  }
  if (resolution.witnesses.length < 2) {
    return "Backed by a single witness.";
  }
  if (!resolution.independence) {
    return 'Multiple witnesses were supplied without a recorded independence basis; grounding capped at "single" — witnesses that might share a failure mode are not corroboration.';
  }
  return 'An independence basis was supplied but it did not cover two or more distinct witness sources; grounding capped at "single".';
}

/**
 * Turns a v1 GateResult into signed entries in a ClaimLog, so the gate and
 * the claim log compose without v1 knowing the log exists. Only claims with
 * disposition "grounded" are considered — a "flagged" or "rewritten" claim
 * is, by definition, not grounded, and never enters the signed log.
 */
export function commitGateResult(result: GateResult, witnessResolver: WitnessResolver, opts: CommitOptions): AppendResult[] {
  const appended: AppendResult[] = [];

  for (const claim of result.claims) {
    if (claim.disposition !== "grounded") continue;

    const resolution = witnessResolver(claim);
    if (!resolution) continue;

    const groundingLevel = assessGrounding(resolution.witnesses, resolution.independence);
    const groundedClaim: GroundedClaim = {
      kind: claim.kind,
      text: claim.text,
      category: claim.category,
      witnesses: resolution.witnesses,
      independence: resolution.independence,
      groundingLevel,
      reason: explainGroundingLevel(resolution, groundingLevel),
    };

    appended.push(opts.log.append(groundedClaim, { privateKeyPem: opts.privateKeyPem, identity: opts.identity }));
  }

  return appended;
}
