import { describe, expect, it } from "vitest";
import { detectScopeMismatches } from "../src/detectors/scopeMismatch.js";

describe("detectScopeMismatches", () => {
  describe("positive: flags a broad conclusion drawn from a narrow, named check", () => {
    it("flags 'fixes the issue' when the response names only a happy-path test", () => {
      const claims = detectScopeMismatches("I wrote a test for the happy path and it passes, so this fixes the issue.");
      expect(claims).toHaveLength(1);
      expect(claims[0]?.kind).toBe("scope_mismatch");
      expect(claims[0]?.category).toBe("completeness");
    });

    it("flags 'handles all edge cases' when only one case was checked", () => {
      const claims = detectScopeMismatches("I checked one case and it worked, so this handles all edge cases.");
      expect(claims.some((c) => c.category === "completeness")).toBe(true);
    });

    it("flags 'this always works' when only a single instance was verified", () => {
      const claims = detectScopeMismatches("I verified this case manually. This always works.");
      expect(claims.some((c) => c.category === "universality")).toBe(true);
    });

    it("flags 'no other issues remain' after testing a single example", () => {
      const claims = detectScopeMismatches("I confirmed a single example passes. No other issues remain.");
      expect(claims.some((c) => c.category === "completeness")).toBe(true);
    });
  });

  describe("negative: must not flag", () => {
    it("does not flag a broad conclusion with no verification marker at all", () => {
      expect(detectScopeMismatches("This fixes the issue.")).toHaveLength(0);
    });

    it("does not flag a broad conclusion backed by a broad-scope verification marker", () => {
      expect(detectScopeMismatches("I ran the entire test suite and every test passed, so this fixes the issue.")).toHaveLength(0);
    });

    it("does not flag a broad conclusion backed by an exhaustive check", () => {
      expect(detectScopeMismatches("I exhaustively checked this, so it handles all edge cases.")).toHaveLength(0);
    });

    it("does not flag a narrow check with no broad conclusion drawn from it", () => {
      expect(detectScopeMismatches("I wrote a test for the happy path and it passes.")).toHaveLength(0);
    });

    it("does not flag text inside quotes", () => {
      expect(
        detectScopeMismatches('The bug report said, "I checked one case and it worked, so this handles all edge cases."'),
      ).toHaveLength(0);
    });

    it("does not flag hypothetical framing", () => {
      expect(
        detectScopeMismatches("If I only checked one case, it wouldn't mean this handles all edge cases."),
      ).toHaveLength(0);
    });

    it("does not flag ordinary prose with no narrow-check language", () => {
      expect(detectScopeMismatches("Here is a summary of the changes I made in this diff.")).toHaveLength(0);
    });
  });
});
