import { describe, expect, it } from "vitest";
import { detectExternalStateClaims } from "../src/detectors/externalState.js";

describe("detectExternalStateClaims", () => {
  describe("positive: each category is detected", () => {
    it("detects a bare present-tense time assertion", () => {
      const claims = detectExternalStateClaims("It is late, so I'll keep this short.");
      expect(claims).toHaveLength(1);
      expect(claims[0]?.category).toBe("time");
      expect(claims[0]?.kind).toBe("external_state");
    });

    it("detects a current-role attribution", () => {
      const claims = detectExternalStateClaims("The current president is Jane Smith.");
      expect(claims.some((c) => c.category === "current_role")).toBe(true);
    });

    it("detects an 'X is the ROLE of Y' attribution", () => {
      const claims = detectExternalStateClaims("Jane Smith is the president of Freedonia.");
      expect(claims.some((c) => c.category === "current_role")).toBe(true);
    });

    it("detects a present-tense monetary claim", () => {
      const claims = detectExternalStateClaims("Bitcoin costs $50,000 right now.");
      expect(claims.some((c) => c.category === "current_price")).toBe(true);
    });

    it("detects a 'the latest X is' claim", () => {
      const claims = detectExternalStateClaims("The latest version is 4.2.1.");
      expect(claims.some((c) => c.category === "existence")).toBe(true);
    });

    it("detects a 'still exists' claim", () => {
      const claims = detectExternalStateClaims("That library still exists on npm.");
      expect(claims.some((c) => c.category === "existence")).toBe(true);
    });

    it("detects an 'is still available' claim", () => {
      const claims = detectExternalStateClaims("The endpoint is still available.");
      expect(claims.some((c) => c.category === "existence")).toBe(true);
    });
  });

  describe("negative: must not flag", () => {
    it("does not flag historical facts", () => {
      expect(detectExternalStateClaims("Rome fell in 476 CE.")).toHaveLength(0);
    });

    it("does not flag definitions", () => {
      expect(detectExternalStateClaims("A stack is a LIFO data structure.")).toHaveLength(0);
    });

    it("does not flag hypothetical framing", () => {
      expect(detectExternalStateClaims("If it were noon, we would break for lunch.")).toHaveLength(0);
    });

    it("does not flag a hypothetical claim without a subjunctive verb", () => {
      expect(detectExternalStateClaims("If it is late, we should leave soon.")).toHaveLength(0);
    });

    it("does not flag quoted text", () => {
      expect(detectExternalStateClaims('She said, "it is late" as a joke about her own timezone.')).toHaveLength(0);
    });

    it("does not flag past-tense statements", () => {
      expect(detectExternalStateClaims("The meeting was at 3pm yesterday.")).toHaveLength(0);
    });

    it("does not flag historical role attributions with an ordinal modifier", () => {
      expect(detectExternalStateClaims("Washington is remembered as the first president of the United States.")).toHaveLength(0);
    });

    it("does not flag a timeless definitional use of 'president'", () => {
      expect(detectExternalStateClaims("The president is the head of state in a presidential system.")).toHaveLength(0);
    });

    it("does not flag past-tense cost", () => {
      expect(detectExternalStateClaims("It cost $5 back then.")).toHaveLength(0);
    });
  });
});
