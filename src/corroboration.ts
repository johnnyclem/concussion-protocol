import type { IndependenceBasis, GroundingLevel, Witness } from "./types.js";

/** Thrown by assessGrounding when a claim has no witness at all. */
export class UngroundedClaimError extends Error {
  constructor() {
    super("A claim with no witness cannot be committed as grounded; assessGrounding requires at least one witness.");
    this.name = "UngroundedClaimError";
  }
}

/** Thrown by assessGrounding when a witness's attestation is missing or blank. */
export class InvalidWitnessError extends Error {
  constructor(witnessId: string) {
    super(`Witness "${witnessId}" has no attestation; a witness must state what it actually attests.`);
    this.name = "InvalidWitnessError";
  }
}

/**
 * Decides how strongly a claim is grounded by its witnesses.
 *
 * - Zero witnesses: throws. A claim with no witness cannot be grounded.
 * - One witness: "single".
 * - Two or more witnesses, but no IndependenceBasis (or one that names fewer
 *   than two of the actual distinct witness sources): still "single" —
 *   multiple witnesses that might share a failure mode are not corroboration.
 * - Two or more DISTINCT witness sources, with an IndependenceBasis naming
 *   two or more of them: "corroborated".
 *
 * "Distinct" is by witness id: two Witness entries with the same id are the
 * same source in disguise, and cannot be upgraded to "corroborated" no
 * matter what an IndependenceBasis claims about them.
 */
export function assessGrounding(witnesses: Witness[], independence?: IndependenceBasis): GroundingLevel {
  if (witnesses.length === 0) {
    throw new UngroundedClaimError();
  }

  for (const witness of witnesses) {
    if (typeof witness.attestation !== "string" || witness.attestation.trim().length === 0) {
      throw new InvalidWitnessError(witness.id);
    }
  }

  const distinctIds = new Set(witnesses.map((w) => w.id));
  if (distinctIds.size < 2) return "single";
  if (!independence) return "single";

  const namedDistinctIds = new Set(independence.witnesses.filter((id) => distinctIds.has(id)));
  if (namedDistinctIds.size < 2) return "single";

  return "corroborated";
}
