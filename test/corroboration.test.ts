import { describe, expect, it } from "vitest";
import { assessGrounding, InvalidWitnessError, UngroundedClaimError } from "../src/corroboration.js";
import type { IndependenceBasis, Witness } from "../src/types.js";

const camera1: Witness = { id: "camera-1", kind: "sensor", attestation: "Recorded a matching motion signal at the reported time." };
const camera2: Witness = { id: "camera-2", kind: "sensor", attestation: "Recorded a matching motion signal at the reported time." };

describe("assessGrounding", () => {
  it("throws UngroundedClaimError for zero witnesses", () => {
    expect(() => assessGrounding([])).toThrow(UngroundedClaimError);
  });

  it("returns \"single\" for one witness", () => {
    expect(assessGrounding([camera1])).toBe("single");
  });

  it("returns \"single\" for two witnesses with no independence basis", () => {
    expect(assessGrounding([camera1, camera2])).toBe("single");
  });

  it("returns \"corroborated\" for two witnesses with an independence basis covering both", () => {
    const independence: IndependenceBasis = {
      witnesses: ["camera-1", "camera-2"],
      reason: "Camera 1 and camera 2 are on separate power circuits and separate network segments; neither's failure implicates the other.",
    };
    expect(assessGrounding([camera1, camera2], independence)).toBe("corroborated");
  });

  it("returns \"single\" when the independence basis covers only one of the two witnesses", () => {
    const independence: IndependenceBasis = {
      witnesses: ["camera-1"],
      reason: "Only camera 1 is asserted as independent here.",
    };
    expect(assessGrounding([camera1, camera2], independence)).toBe("single");
  });

  it("does not upgrade to \"corroborated\" when the same source appears twice, even with an independence basis wrongly naming both as distinct", () => {
    // Same id twice: this is one underlying source counted twice, not two independent witnesses.
    const sameSourceTwice: Witness[] = [camera1, { ...camera1 }];
    const independence: IndependenceBasis = {
      witnesses: ["camera-1", "camera-1"],
      reason: "(Incorrectly) claims camera-1 is independent of itself.",
    };
    expect(assessGrounding(sameSourceTwice, independence)).toBe("single");
  });

  it("throws InvalidWitnessError when a witness has an empty attestation", () => {
    const blank: Witness = { id: "camera-3", kind: "sensor", attestation: "   " };
    expect(() => assessGrounding([blank])).toThrow(InvalidWitnessError);
  });

  it("stores attestations verbatim without embellishment", () => {
    const verbatim = "An independent second source recorded a consistent signal for this claim.";
    const witness: Witness = { id: "w1", kind: "external_document", attestation: verbatim };
    // assessGrounding does not touch, trim, or rewrite the attestation text; it only reads it to check it's non-empty.
    expect(witness.attestation).toBe(verbatim);
    expect(() => assessGrounding([witness])).not.toThrow();
    expect(witness.attestation).toBe(verbatim);
  });
});
