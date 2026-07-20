import { describe, expect, it } from "vitest";
import * as pkg from "../src/index.js";

describe("public API surface", () => {
  it("exports the v1 gate", () => {
    expect(pkg.gate).toBeTypeOf("function");
  });

  it("exports the detectors and grounding helpers", () => {
    expect(pkg.detectExternalStateClaims).toBeTypeOf("function");
    expect(pkg.detectSelfObservation).toBeTypeOf("function");
    expect(pkg.findSelfObservationMatches).toBeTypeOf("function");
    expect(pkg.applyRewrite).toBeTypeOf("function");
    expect(pkg.checkGrounding).toBeTypeOf("function");
    expect(pkg.findGroundingToolCalls).toBeTypeOf("function");
    expect(pkg.DEFAULT_GROUNDING_PATTERNS).toBeTypeOf("object");
  });

  it("exports the corroboration primitives", () => {
    expect(pkg.assessGrounding).toBeTypeOf("function");
    expect(pkg.UngroundedClaimError).toBeTypeOf("function");
    expect(pkg.InvalidWitnessError).toBeTypeOf("function");
  });

  it("exports the signing and claim-log primitives", () => {
    expect(pkg.canonicalize).toBeTypeOf("function");
    expect(pkg.hashCanonical).toBeTypeOf("function");
    expect(pkg.generateIdentity).toBeTypeOf("function");
    expect(pkg.signEntry).toBeTypeOf("function");
    expect(pkg.verifyEntry).toBeTypeOf("function");
    expect(pkg.ClaimLog).toBeTypeOf("function");
    expect(pkg.JsonlFileStorage).toBeTypeOf("function");
    expect(pkg.commitGateResult).toBeTypeOf("function");
  });

  it("runs an end-to-end gate call through the public entry point", () => {
    const result = pkg.gate(
      { responseText: "It is late.", toolCalls: [], externalTraceProvided: false },
      { onUngroundedExternalClaim: "flag", rewriteSelfObservation: true },
    );
    expect(result.claims.length).toBeGreaterThan(0);
    expect(result.provenance.summary.total).toBe(result.claims.length);
  });
});
