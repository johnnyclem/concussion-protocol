import { describe, expect, it } from "vitest";
import { gate } from "../src/gate.js";
import type { GateConfig } from "../src/types.js";

describe("gate", () => {
  it("blocks on an ungrounded external claim and grounds one that has a matching tool call, in block mode", () => {
    const config: GateConfig = { onUngroundedExternalClaim: "block", rewriteSelfObservation: true };
    const result = gate(
      {
        responseText: "It is late, and the current president is Jane Smith.",
        toolCalls: [{ name: "get_time" }],
        externalTraceProvided: false,
      },
      config,
    );

    expect(result.blocked).toBe(true);
    expect(result.provenance.summary.total).toBe(2);
    expect(result.provenance.summary.grounded).toBe(1);
    expect(result.provenance.summary.flagged).toBe(1);
    expect(result.provenance.summary.rewritten).toBe(0);

    const timeClaim = result.claims.find((c) => c.category === "time");
    const roleClaim = result.claims.find((c) => c.category === "current_role");
    expect(timeClaim?.disposition).toBe("grounded");
    expect(timeClaim?.groundedBy).toEqual(["get_time"]);
    expect(roleClaim?.disposition).toBe("flagged");
  });

  it("does not block in flag mode, and leaves response text unchanged apart from rewrites", () => {
    const config: GateConfig = { onUngroundedExternalClaim: "flag", rewriteSelfObservation: false };
    const original = "The current president is Jane Smith.";
    const result = gate({ responseText: original, toolCalls: [], externalTraceProvided: false }, config);

    expect(result.blocked).toBe(false);
    expect(result.responseText).toBe(original);
    expect(result.claims).toHaveLength(1);
    expect(result.claims[0]?.disposition).toBe("flagged");
  });

  it("produces a provenance record with a valid ISO timestamp and summary math that adds up", () => {
    const config: GateConfig = { onUngroundedExternalClaim: "flag", rewriteSelfObservation: true };
    const result = gate(
      {
        responseText: "The current president is Jane Smith. I can see that I made an error.",
        toolCalls: [],
        externalTraceProvided: false,
      },
      config,
    );

    expect(() => new Date(result.provenance.timestamp)).not.toThrow();
    expect(new Date(result.provenance.timestamp).toISOString()).toBe(result.provenance.timestamp);

    const { total, grounded, flagged, rewritten } = result.provenance.summary;
    expect(total).toBe(grounded + flagged + rewritten);
    expect(total).toBe(result.claims.length);
  });

  it("returns an empty, unblocked result for a clean response with no detected claims", () => {
    const config: GateConfig = { onUngroundedExternalClaim: "block", rewriteSelfObservation: true };
    const original = "Here is a summary of the changes I made in this diff.";
    const result = gate({ responseText: original, toolCalls: [], externalTraceProvided: false }, config);

    expect(result.claims).toEqual([]);
    expect(result.blocked).toBe(false);
    expect(result.responseText).toBe(original);
    expect(result.provenance.summary).toEqual({ total: 0, grounded: 0, flagged: 0, rewritten: 0 });
  });

  it("never justifies a disposition by claiming knowledge of the model's internal state", () => {
    const config: GateConfig = { onUngroundedExternalClaim: "flag", rewriteSelfObservation: true };
    const result = gate(
      {
        responseText:
          "It is late. The current president is Jane Smith. I can see that I made an error. My earlier reasoning showed.",
        toolCalls: [],
        externalTraceProvided: false,
      },
      config,
    );

    expect(result.claims.length).toBeGreaterThan(0);
    const forbidden = /\b(I know what|I can access my|I have access to my own|inside the model's weights|my internal state is)\b/i;
    for (const claim of result.claims) {
      expect(claim.reason).not.toMatch(forbidden);
      // Every reason grounds its disposition in text/tool-call evidence, not
      // a claim of privileged introspective access.
      expect(claim.reason.toLowerCase()).not.toContain("i can verify from the inside");
    }
  });
});
