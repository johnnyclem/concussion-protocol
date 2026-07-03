import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { commitGateResult } from "../src/bridge.js";
import { ClaimLog, JsonlFileStorage } from "../src/log.js";
import { generateIdentity } from "../src/signing.js";
import type { GateResult, IndependenceBasis, Witness } from "../src/types.js";

function baseGateResult(): GateResult {
  return {
    responseText: "It is 3pm. The current CEO is Jane Smith. I can see that I made an error.",
    claims: [
      {
        kind: "external_state",
        text: "It is 3pm",
        category: "time",
        disposition: "grounded",
        reason: "A tool call in this turn (get_time) plausibly supplies this claim.",
        groundedBy: ["get_time"],
      },
      {
        kind: "external_state",
        text: "The current CEO is Jane Smith",
        category: "current_role",
        disposition: "grounded",
        reason: "A tool call in this turn (web_search) plausibly supplies this claim.",
        groundedBy: ["web_search"],
      },
      {
        kind: "self_observation",
        text: "I can see that I made an error",
        category: "prior_reasoning",
        disposition: "flagged",
        reason: "Observation grammar about the agent's own prior processing was detected; rewriting is disabled by configuration.",
      },
    ],
    provenance: {
      timestamp: "2026-07-03T12:00:00.000Z",
      claims: [],
      summary: { total: 3, grounded: 2, flagged: 1, rewritten: 0 },
    },
    blocked: false,
  };
}

describe("commitGateResult", () => {
  let dir: string;
  let log: ClaimLog;
  let signer: ReturnType<typeof generateIdentity>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "concussion-bridge-"));
    log = new ClaimLog(new JsonlFileStorage(join(dir, "claims.jsonl")));
    signer = generateIdentity();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("commits exactly the grounded claims, leaving the flagged claim out of the log", () => {
    const result = baseGateResult();

    const appended = commitGateResult(
      result,
      (claim) => ({
        witnesses: [{ id: claim.groundedBy?.[0] ?? "unknown", kind: "tool_call", attestation: `Tool call "${claim.groundedBy?.[0]}" returned data supporting this claim.` }],
      }),
      { log, privateKeyPem: signer.privateKeyPem, identity: signer.identity },
    );

    expect(appended).toHaveLength(2);
    expect(log.entries()).toHaveLength(2);
    for (const entry of log.entries()) {
      expect(entry.claim.text).not.toContain("I can see that I made an error");
    }
  });

  it("commits a grounded claim with two independent witnesses as \"corroborated\"", () => {
    const result = baseGateResult();
    const independence: IndependenceBasis = {
      witnesses: ["get_time", "wall_clock_sensor"],
      reason: "The tool call reads the host clock; the sensor reads an independent hardware clock; neither's failure implicates the other.",
    };

    commitGateResult(
      result,
      (claim) => {
        if (claim.category !== "time") return undefined;
        const witnesses: Witness[] = [
          { id: "get_time", kind: "tool_call", attestation: "Returned a timestamp from the system clock for this turn." },
          { id: "wall_clock_sensor", kind: "external_document", attestation: "An independent hardware clock reported a consistent time." },
        ];
        return { witnesses, independence };
      },
      { log, privateKeyPem: signer.privateKeyPem, identity: signer.identity },
    );

    expect(log.entries()).toHaveLength(1);
    expect(log.entries()[0]!.claim.groundingLevel).toBe("corroborated");
  });

  it("commits a grounded claim with one witness as \"single\"", () => {
    const result = baseGateResult();

    commitGateResult(
      result,
      (claim) => {
        if (claim.category !== "time") return undefined;
        return { witnesses: [{ id: "get_time", kind: "tool_call", attestation: "Returned a timestamp from the system clock for this turn." }] };
      },
      { log, privateKeyPem: signer.privateKeyPem, identity: signer.identity },
    );

    expect(log.entries()).toHaveLength(1);
    expect(log.entries()[0]!.claim.groundingLevel).toBe("single");
  });

  it("never fabricates a witness attestation or independence reason: the log stores exactly what the resolver supplied, verbatim", () => {
    const result = baseGateResult();
    const attestation = "Tool call get_time returned 15:00:00Z from the system clock.";
    const independenceReason = "Caller-verified: the two clocks run on physically separate hardware.";
    const independence: IndependenceBasis = { witnesses: ["get_time", "ntp_probe"], reason: independenceReason };

    commitGateResult(
      result,
      (claim) => {
        if (claim.category !== "time") return undefined;
        return {
          witnesses: [
            { id: "get_time", kind: "tool_call", attestation },
            { id: "ntp_probe", kind: "external_document", attestation: "An NTP probe reported a consistent time within tolerance." },
          ],
          independence,
        };
      },
      { log, privateKeyPem: signer.privateKeyPem, identity: signer.identity },
    );

    const stored = log.entries()[0]!.claim;
    expect(stored.witnesses[0]!.attestation).toBe(attestation);
    expect(stored.independence).toEqual(independence);
  });
});
