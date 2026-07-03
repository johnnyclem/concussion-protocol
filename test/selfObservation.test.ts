import { describe, expect, it } from "vitest";
import { applyRewrite, detectSelfObservation, findSelfObservationMatches } from "../src/detectors/selfObservation.js";
import { gate } from "../src/gate.js";

describe("detectSelfObservation", () => {
  it('detects "I can see that I ..."', () => {
    const claims = detectSelfObservation("I can see that I skipped the validation step.");
    expect(claims).toHaveLength(1);
    expect(claims[0]?.kind).toBe("self_observation");
    expect(claims[0]?.category).toBe("prior_reasoning");
  });

  it('detects "my earlier reasoning showed ..."', () => {
    const claims = detectSelfObservation("My earlier reasoning showed a gap in the argument.");
    expect(claims).toHaveLength(1);
  });

  it('detects "I observed / I noticed / I checked that [my own prior reasoning]"', () => {
    expect(detectSelfObservation("I observed that my previous answer was incomplete.")).toHaveLength(1);
    expect(detectSelfObservation("I noticed that I had missed a case.")).toHaveLength(1);
    expect(detectSelfObservation("I checked that my prior response was correct.")).toHaveLength(1);
  });

  it('detects "as I reasoned earlier..."', () => {
    const claims = detectSelfObservation("As I reasoned earlier, the approach should work.");
    expect(claims).toHaveLength(1);
  });

  it("does not treat a third-party observation as self-observation", () => {
    expect(detectSelfObservation("I observed that the sky is blue today.")).toHaveLength(0);
  });
});

describe("self-observation rewrite via gate()", () => {
  const baseConfig = { onUngroundedExternalClaim: "flag" as const, rewriteSelfObservation: true };

  it("does not rewrite when an external trace is provided", () => {
    const result = gate(
      {
        responseText: "I can see that my previous response didn't include reasoning.",
        toolCalls: [],
        externalTraceProvided: true,
      },
      baseConfig,
    );
    expect(result.responseText).toBe("I can see that my previous response didn't include reasoning.");
    expect(result.claims).toHaveLength(1);
    expect(result.claims[0]?.disposition).toBe("grounded");
  });

  it("rewrites observation grammar to inference grammar, preserving meaning, when no trace is provided", () => {
    const result = gate(
      {
        responseText: "I can see that my previous response didn't include reasoning.",
        toolCalls: [],
        externalTraceProvided: false,
      },
      baseConfig,
    );
    expect(result.claims[0]?.disposition).toBe("rewritten");
    expect(result.responseText).toBe(
      "I would expect, though I can't verify it from the inside, that my previous response didn't include reasoning.",
    );
    expect(result.responseText).not.toMatch(/I can see/);
  });

  it("falls back to flagged, without garbling text, when a clean rewrite cannot be produced", () => {
    // "my earlier reasoning showed" with no object trailing it is grammatically
    // incomplete to rewrite cleanly.
    const original = "My earlier reasoning showed.";
    const result = gate(
      { responseText: original, toolCalls: [], externalTraceProvided: false },
      baseConfig,
    );
    expect(result.claims[0]?.disposition).toBe("flagged");
    expect(result.responseText).toBe(original);
  });

  it("flags rather than rewrites when rewriting is disabled", () => {
    const original = "I can see that I made an error.";
    const result = gate(
      { responseText: original, toolCalls: [], externalTraceProvided: false },
      { onUngroundedExternalClaim: "flag", rewriteSelfObservation: false },
    );
    expect(result.claims[0]?.disposition).toBe("flagged");
    expect(result.responseText).toBe(original);
  });
});

describe("applyRewrite", () => {
  it("throws if the match has no replacement", () => {
    const [match] = findSelfObservationMatches("My earlier reasoning showed.");
    expect(match).toBeDefined();
    expect(() => applyRewrite("My earlier reasoning showed.", match!)).toThrow();
  });
});
