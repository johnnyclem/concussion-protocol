import type { DetectedClaim } from "../types.js";

/**
 * Rule 3 detector: broad, universal-sounding conclusions ("this fixes the
 * issue", "handles every case", "this always works") whose only stated
 * basis, named in the same response, is a narrower check ("wrote a test for
 * the happy path", "checked one case") — and no broader-scope verification
 * marker that would actually justify the wider claim.
 *
 * This is the "laundered confidence" failure: a real check ran, so the
 * claim it supports is not a hallucination, but the claim's scope outruns
 * what the check actually covered. Pattern-based and conservative, like the
 * other v1 detectors: a broad conclusion is only flagged when the response
 * itself names a narrow-scope check as its basis, not merely for containing
 * an absolute word.
 */

interface PatternDef {
  regex: RegExp;
  category: string;
}

// Absolute, universal-sounding conclusions about correctness or completeness.
const BROAD_CONCLUSION_PATTERNS: PatternDef[] = [
  { regex: /\bthis (?:fully |completely )?(?:fixes|resolves) (?:the|this) (?:issue|bug|problem)\b/gi, category: "completeness" },
  { regex: /\b(?:fully|completely) (?:fixes|resolves|handles|covers)\b/gi, category: "completeness" },
  { regex: /\bhandles (?:all|every) (?:cases|edge cases|inputs|scenarios)\b/gi, category: "completeness" },
  { regex: /\bcovers all edge cases\b/gi, category: "completeness" },
  { regex: /\bno other (?:issues|cases|instances|occurrences) (?:remain|exist)\b/gi, category: "completeness" },
  { regex: /\bthis (?:always|never) (?:works|fails|happens)\b/gi, category: "universality" },
  { regex: /\b(?:always|never) (?:the case|true)\b/gi, category: "universality" },
  { regex: /\bin all cases\b/gi, category: "universality" },
  { regex: /\bevery (?:instance|occurrence|case) (?:is|has been) (?:handled|fixed|covered)\b/gi, category: "universality" },
];

// Narrow-scope verification markers: the response names the check as
// covering a single instance, not the breadth of the conclusion drawn from
// it — "wrote a test for the happy path", "checked one case", "the test
// passes".
const NARROW_VERIFICATION_RE =
  /\b(?:tested|checked|verified|confirmed|wrote a test for|ran a test for)\b[^.!?]{0,60}\b(?:the happy path|one (?:case|test|example|instance)|a single (?:case|test|example|instance)|this (?:case|test|example|instance)|that (?:case|test|example|instance))\b|\bwrote a test for the happy path\b|\bthe test passes\b/gi;

// Broad-scope verification markers: the check named actually matches the
// breadth of the conclusion, so no mismatch — "every test passed", "ran the
// full suite", "exhaustively checked".
const BROAD_VERIFICATION_RE =
  /\b(?:every|all) (?:tests?|cases?|inputs?|scenarios?)\b[^.!?]{0,40}\b(?:pass(?:ed)?|checked|verified|covered)\b|\bfull(?:y)? test suite\b|\bran the (?:entire|complete|whole) (?:test suite|suite)\b|\bexhaustive(?:ly)?\b/gi;

/** Matches text quoted in double quotes or backticks. */
const QUOTED_SPAN_RE = /"[^"]*"|`[^`]*`/g;

/** Tiles the whole string into sentence-ish chunks, terminator-inclusive. */
const SENTENCE_RE = /[^.!?]*[.!?]|[^.!?]+$/g;

/** Sentences opening with "if" or containing explicit hypothetical framing are excluded. */
const HYPOTHETICAL_SENTENCE_RE = /^\s*if\b|\b(?:hypothetically|suppose|supposing|imagine|what if|let'?s say|assuming)\b/i;

/**
 * Replaces quoted spans and hypothetical/conditional sentences with spaces
 * of equal length, so pattern matches never land inside them while every
 * character index still lines up with the original text.
 */
function maskExcludedSpans(text: string): string {
  let masked = text.replace(QUOTED_SPAN_RE, (m) => " ".repeat(m.length));
  masked = masked.replace(SENTENCE_RE, (sentence) => (HYPOTHETICAL_SENTENCE_RE.test(sentence) ? " ".repeat(sentence.length) : sentence));
  return masked;
}

/** True if the response names a check narrower than the conclusion it draws, with nothing broader to justify it. */
function hasUnjustifiedNarrowBasis(masked: string): boolean {
  NARROW_VERIFICATION_RE.lastIndex = 0;
  if (!NARROW_VERIFICATION_RE.test(masked)) return false;

  BROAD_VERIFICATION_RE.lastIndex = 0;
  return !BROAD_VERIFICATION_RE.test(masked);
}

/**
 * Detects broad conclusions whose only stated basis, named in this same
 * response, is a narrower check. A response with no narrow-scope
 * verification marker at all is not in scope for this detector — it may
 * still be an ungrounded claim, but that is Rule 1's job, not Rule 3's.
 */
export function detectScopeMismatches(responseText: string): DetectedClaim[] {
  const masked = maskExcludedSpans(responseText);
  if (!hasUnjustifiedNarrowBasis(masked)) return [];

  const claims: DetectedClaim[] = [];
  const seenSpans = new Set<string>();

  for (const { regex, category } of BROAD_CONCLUSION_PATTERNS) {
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(masked)) !== null) {
      const index = match.index;
      const length = match[0].length;
      if (length === 0) {
        regex.lastIndex++;
        continue;
      }
      const key = `${index}:${length}`;
      if (!seenSpans.has(key)) {
        seenSpans.add(key);
        claims.push({
          kind: "scope_mismatch",
          text: responseText.slice(index, index + length),
          category,
          index,
        });
      }
    }
  }

  claims.sort((a, b) => a.index - b.index);
  return claims;
}
