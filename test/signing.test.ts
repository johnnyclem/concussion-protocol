import { describe, expect, it } from "vitest";
import { canonicalize, generateIdentity, signEntry, verifyEntry } from "../src/signing.js";

describe("signing", () => {
  it("generates an identity with a stable short id and PEM keys", () => {
    const identity = generateIdentity();
    expect(identity.identity).toMatch(/^[0-9a-f]{16}$/);
    expect(identity.privateKeyPem).toContain("PRIVATE KEY");
    expect(identity.publicKeyPem).toContain("PUBLIC KEY");
  });

  it("verifies a signature made with the matching public key", () => {
    const { privateKeyPem, publicKeyPem } = generateIdentity();
    const content = canonicalize({ a: 1, b: "hello" });
    const signature = signEntry(content, privateKeyPem);
    expect(verifyEntry(content, signature, publicKeyPem)).toBe(true);
  });

  it("fails verification against a different identity's public key", () => {
    const signer = generateIdentity();
    const other = generateIdentity();
    const content = canonicalize({ claim: "the sky is blue" });
    const signature = signEntry(content, signer.privateKeyPem);
    expect(verifyEntry(content, signature, other.publicKeyPem)).toBe(false);
  });

  it("fails verification when the content is tampered with after signing", () => {
    const { privateKeyPem, publicKeyPem } = generateIdentity();
    const content = canonicalize({ claim: "the meeting is at 3pm" });
    const signature = signEntry(content, privateKeyPem);

    const tampered = content.replace("3pm", "4pm");
    expect(verifyEntry(tampered, signature, publicKeyPem)).toBe(false);
  });

  it("produces byte-identical canonical output for logically-equal inputs with different key order", () => {
    const a = canonicalize({ x: 1, y: 2, z: { nested: true, first: "a" } });
    const b = canonicalize({ z: { first: "a", nested: true }, y: 2, x: 1 });
    expect(a).toBe(b);
  });
});
