import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { createPublicKey } from "node:crypto";
import type { AppendResult, ChainVerificationResult, ClaimLogStorage, GroundedClaim, LogEntry, LogEntryContent } from "./types.js";
import { canonicalize, hashCanonical, signEntry, verifyEntry } from "./signing.js";

/** JSONL file-backed storage: one LogEntry per line, appended to disk one at a time. */
export class JsonlFileStorage implements ClaimLogStorage {
  constructor(private readonly filePath: string) {}

  readAll(): LogEntry[] {
    if (!existsSync(this.filePath)) return [];
    return readFileSync(this.filePath, "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as LogEntry);
  }

  append(entry: LogEntry): void {
    const dir = dirname(this.filePath);
    if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true });
    appendFileSync(this.filePath, `${JSON.stringify(entry)}\n`, "utf8");
  }
}

function contentOf(entry: LogEntry): LogEntryContent {
  const { hash: _hash, signature: _signature, ...content } = entry;
  return content;
}

/**
 * An append-only, hash-linked, signed log of GroundedClaims, backed by a
 * swappable ClaimLogStorage. There is deliberately no update or delete
 * method: rewriting or deleting a past entry is exactly what the hash-link
 * is meant to make detectable, so the API does not offer a quiet way to do
 * it.
 */
export class ClaimLog {
  constructor(private readonly storage: ClaimLogStorage) {}

  /** All entries currently in the log, oldest first. Read-only. */
  entries(): LogEntry[] {
    return this.storage.readAll();
  }

  /**
   * Builds, hashes, signs, and appends one entry for `claim`, then reads it
   * back from storage and re-checks its hash-link and signature before
   * reporting `verified`.
   */
  append(claim: GroundedClaim, opts: { privateKeyPem: string; identity: string }): AppendResult {
    const existing = this.storage.readAll();
    const tail = existing[existing.length - 1];

    const content: LogEntryContent = {
      index: existing.length,
      timestamp: new Date().toISOString(),
      claim,
      prevHash: tail ? tail.hash : null,
      identity: opts.identity,
    };

    const canonical = canonicalize(content);
    const hash = hashCanonical(canonical);
    const signature = signEntry(canonical, opts.privateKeyPem);
    const entry: LogEntry = { ...content, hash, signature };

    this.storage.append(entry);

    const readBack = this.storage.readAll();
    const written = readBack[readBack.length - 1];
    const publicKeyPem = createPublicKey(opts.privateKeyPem).export({ type: "spki", format: "pem" }).toString();
    const writtenCanonical = written ? canonicalize(contentOf(written)) : "";
    const verified =
      written !== undefined &&
      written.hash === hash &&
      hashCanonical(writtenCanonical) === written.hash &&
      verifyEntry(writtenCanonical, written.signature, publicKeyPem);

    return { entry, verified };
  }

  /**
   * Walks the log from genesis, recomputing each entry's hash and checking
   * its link to the previous entry's hash. When `publicKeyResolver` can
   * resolve a public key for an entry's identity, its signature is also
   * checked. Returns the first index where any of that breaks.
   */
  verifyChain(publicKeyResolver: (identity: string) => string | undefined): ChainVerificationResult {
    const entries = this.storage.readAll();
    let prevHash: string | null = null;

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]!;

      if (entry.index !== i) {
        return { ok: false, brokenAt: i, reason: `entry.index (${entry.index}) does not match its position (${i}) in the log.` };
      }

      if (entry.prevHash !== prevHash) {
        return { ok: false, brokenAt: i, reason: "entry.prevHash does not match the hash of the previous entry." };
      }

      const canonical = canonicalize(contentOf(entry));
      const expectedHash = hashCanonical(canonical);
      if (entry.hash !== expectedHash) {
        return { ok: false, brokenAt: i, reason: "entry.hash does not match the entry's content; the entry has been altered." };
      }

      const publicKeyPem = publicKeyResolver(entry.identity);
      if (publicKeyPem !== undefined && !verifyEntry(canonical, entry.signature, publicKeyPem)) {
        return { ok: false, brokenAt: i, reason: `signature does not verify against the resolved public key for identity "${entry.identity}".` };
      }

      prevHash = entry.hash;
    }

    return { ok: true };
  }
}
