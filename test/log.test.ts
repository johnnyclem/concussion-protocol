import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ClaimLog, JsonlFileStorage } from "../src/log.js";
import { generateIdentity } from "../src/signing.js";
import type { GroundedClaim } from "../src/types.js";

function groundedClaim(text: string): GroundedClaim {
  return {
    kind: "external_state",
    text,
    category: "time",
    witnesses: [{ id: "get_time#1", kind: "tool_call", attestation: "Returned a timestamp from the system clock for this turn." }],
    groundingLevel: "single",
    reason: "Backed by a single witness.",
  };
}

describe("ClaimLog", () => {
  let dir: string;
  let filePath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "concussion-claim-log-"));
    filePath = join(dir, "claims.jsonl");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("appends three entries, each verified", () => {
    const log = new ClaimLog(new JsonlFileStorage(filePath));
    const { privateKeyPem, identity } = generateIdentity();

    const results = [
      log.append(groundedClaim("It is 3pm."), { privateKeyPem, identity }),
      log.append(groundedClaim("It is 4pm."), { privateKeyPem, identity }),
      log.append(groundedClaim("It is 5pm."), { privateKeyPem, identity }),
    ];

    for (const result of results) {
      expect(result.verified).toBe(true);
    }
    expect(log.entries()).toHaveLength(3);
    expect(log.entries().map((e) => e.index)).toEqual([0, 1, 2]);
  });

  it("verifyChain reports ok for an untampered log", () => {
    const log = new ClaimLog(new JsonlFileStorage(filePath));
    const { privateKeyPem, publicKeyPem, identity } = generateIdentity();

    log.append(groundedClaim("It is 3pm."), { privateKeyPem, identity });
    log.append(groundedClaim("It is 4pm."), { privateKeyPem, identity });

    const result = log.verifyChain((id) => (id === identity ? publicKeyPem : undefined));
    expect(result).toEqual({ ok: true });
  });

  it("detects a corrupted claim on disk, reporting the correct brokenAt index", () => {
    const log = new ClaimLog(new JsonlFileStorage(filePath));
    const { privateKeyPem, publicKeyPem, identity } = generateIdentity();

    log.append(groundedClaim("It is 3pm."), { privateKeyPem, identity });
    log.append(groundedClaim("It is 4pm."), { privateKeyPem, identity });
    log.append(groundedClaim("It is 5pm."), { privateKeyPem, identity });

    const lines = readFileSync(filePath, "utf8").trim().split("\n");
    const corrupted = JSON.parse(lines[1]!);
    corrupted.claim.text = "It is midnight.";
    lines[1] = JSON.stringify(corrupted);
    writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");

    const result = log.verifyChain((id) => (id === identity ? publicKeyPem : undefined));
    expect(result.ok).toBe(false);
    expect(result.brokenAt).toBe(1);
  });

  it("detects an altered prevHash", () => {
    const log = new ClaimLog(new JsonlFileStorage(filePath));
    const { privateKeyPem, publicKeyPem, identity } = generateIdentity();

    log.append(groundedClaim("It is 3pm."), { privateKeyPem, identity });
    log.append(groundedClaim("It is 4pm."), { privateKeyPem, identity });

    const lines = readFileSync(filePath, "utf8").trim().split("\n");
    const corrupted = JSON.parse(lines[1]!);
    corrupted.prevHash = "0".repeat(64);
    lines[1] = JSON.stringify(corrupted);
    writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");

    const result = log.verifyChain((id) => (id === identity ? publicKeyPem : undefined));
    expect(result.ok).toBe(false);
    expect(result.brokenAt).toBe(1);
  });

  it("exposes no update or delete method", () => {
    const methods = Object.getOwnPropertyNames(ClaimLog.prototype);
    expect(methods).toContain("append");
    expect(methods).toContain("verifyChain");
    expect(methods).not.toContain("update");
    expect(methods).not.toContain("delete");
    expect(methods).not.toContain("remove");
    expect(methods).not.toContain("edit");
    expect(methods).not.toContain("rewrite");
  });
});
