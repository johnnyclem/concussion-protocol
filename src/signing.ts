/**
 * Ed25519 signing over a canonical serialization, using only Node's built-in
 * crypto. No third-party crypto dependency, no key management or
 * distribution scheme — keys are supplied by the caller.
 */
import { createHash, generateKeyPairSync, sign as cryptoSign, verify as cryptoVerify } from "node:crypto";

/**
 * Deterministically serializes a value: object keys are sorted, so two
 * logically-equal inputs with different key insertion order produce
 * byte-identical output. This is the single serializer used for both
 * hashing and signing a log entry, so what gets hashed is exactly what gets
 * signed and verified.
 */
export function canonicalize(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalize(item)).join(",")}]`;

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const entries = keys
    .filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`);
  return `{${entries.join(",")}}`;
}

/** SHA-256 hex digest of a canonical content string. */
export function hashCanonical(canonicalContent: string): string {
  return createHash("sha256").update(canonicalContent, "utf8").digest("hex");
}

/** A freshly generated Ed25519 signing identity. */
export interface GeneratedIdentity {
  /** Short stable id derived from the public key. */
  identity: string;
  privateKeyPem: string;
  publicKeyPem: string;
}

/** Generates a new Ed25519 keypair and derives a short id from the public key. */
export function generateIdentity(): GeneratedIdentity {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const identity = createHash("sha256").update(publicKeyPem, "utf8").digest("hex").slice(0, 16);
  return { identity, privateKeyPem, publicKeyPem };
}

/** Signs canonical content with an Ed25519 private key (PEM), returning a base64 signature. */
export function signEntry(canonicalContent: string, privateKeyPem: string): string {
  return cryptoSign(null, Buffer.from(canonicalContent, "utf8"), privateKeyPem).toString("base64");
}

/** Verifies a base64 Ed25519 signature over canonical content against a public key (PEM). */
export function verifyEntry(canonicalContent: string, signature: string, publicKeyPem: string): boolean {
  try {
    return cryptoVerify(null, Buffer.from(canonicalContent, "utf8"), publicKeyPem, Buffer.from(signature, "base64"));
  } catch {
    return false;
  }
}
