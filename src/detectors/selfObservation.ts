import type { DetectedClaim } from "../types.js";

/**
 * Rule 2 detector: first-person observation grammar about the agent's own
 * prior processing or output, plus the mechanical rewrite from observation
 * grammar to inference grammar.
 *
 * The model has no introspective access to its own prior reasoning; a
 * stored external trace is the only legitimate basis for reasoning about it
 * (see gate.ts). This module never asserts that; it only matches text
 * patterns and applies a minimal, meaning-preserving string transform.
 */

export interface SelfObservationMatch {
  index: number;
  /** The original span in responseText that triggered detection. */
  matchedText: string;
  /**
   * The inference-grammar replacement for matchedText, or null if a clean
   * mechanical rewrite could not be produced (fall back to "flagged").
   */
  replacement: string | null;
}

const DISCLAIMER = "I would expect, though I can't verify it from the inside, that";

/** "I can see that CLAUSE" -> "<disclaimer> that CLAUSE" */
const CAN_SEE_RE = /\bI can see that\s+([^.!?]*)([.!?]|$)/gi;

/** "I observed/noticed/checked that <self-referential clause>" -> "<disclaimer> that CLAUSE" */
const OBSERVED_RE = /\bI (?:observed|noticed|checked) that\s+([^.!?]*)([.!?]|$)/gi;

/** "my earlier/previous/prior reasoning/thinking/response/answer showed/shows/had/didn't/did not CLAUSE" */
const PRIOR_REASONING_RE =
  /\bmy (earlier|previous|prior) (reasoning|thinking|response|answer) (showed|shows|had|didn't|did not)\s*([^.!?]*)([.!?]|$)/gi;

/** "as I reasoned earlier/before, CLAUSE" -> "<disclaimer> that CLAUSE" */
const AS_I_REASONED_RE = /\bas I reasoned (earlier|before),?\s*([^.!?]*)([.!?]|$)/gi;

function collectMatches(regex: RegExp, text: string, build: (m: RegExpExecArray) => SelfObservationMatch | null): SelfObservationMatch[] {
  const out: SelfObservationMatch[] = [];
  regex.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match[0].length === 0) {
      regex.lastIndex++;
      continue;
    }
    const built = build(match);
    if (built) out.push(built);
  }
  return out;
}

export function findSelfObservationMatches(responseText: string): SelfObservationMatch[] {
  const results: SelfObservationMatch[] = [];

  results.push(
    ...collectMatches(CAN_SEE_RE, responseText, (m) => {
      const clause = m[1] ?? "";
      const punct = m[2] ?? "";
      const replacement = clause.trim() ? `${DISCLAIMER} ${clause.trim()}${punct}` : null;
      return { index: m.index, matchedText: m[0], replacement };
    }),
  );

  results.push(
    ...collectMatches(OBSERVED_RE, responseText, (m) => {
      const clause = m[1] ?? "";
      const punct = m[2] ?? "";
      // Scope to self-referential claims ("I observed that I skipped that
      // step", not "I observed that the sky is blue") — a third-party
      // observation is not a Rule 2 concern.
      if (!/\b(?:my|i)\b/i.test(clause)) return null;
      const replacement = clause.trim() ? `${DISCLAIMER} ${clause.trim()}${punct}` : null;
      return { index: m.index, matchedText: m[0], replacement };
    }),
  );

  results.push(
    ...collectMatches(PRIOR_REASONING_RE, responseText, (m) => {
      const [, temporal, noun, verb, rest, punctRaw] = m;
      const restTrimmed = (rest ?? "").trim();
      const punct = punctRaw ?? "";
      // "showed"/"shows" are transitive and "my earlier reasoning showed."
      // is garbled without an object; "had"/"didn't"/"did not" are just as
      // incomplete without one. An empty object means no clean rewrite.
      const replacement = restTrimmed ? `${DISCLAIMER} my ${temporal} ${noun} ${verb} ${restTrimmed}${punct}` : null;
      return { index: m.index, matchedText: m[0], replacement };
    }),
  );

  results.push(
    ...collectMatches(AS_I_REASONED_RE, responseText, (m) => {
      const clause = (m[2] ?? "").trim();
      const punct = m[3] ?? "";
      const replacement = clause ? `${DISCLAIMER} ${clause}${punct}` : null;
      return { index: m.index, matchedText: m[0], replacement };
    }),
  );

  // Several patterns can match overlapping spans of the same sentence (e.g.
  // "I can see that my previous response didn't include reasoning" also
  // satisfies the "my previous response didn't ..." pattern as a nested
  // match). Keep the earliest-starting match and drop anything it
  // overlaps, so a span is never detected — or rewritten — twice.
  results.sort((a, b) => a.index - b.index);
  const deduped: SelfObservationMatch[] = [];
  let lastEnd = -1;
  for (const match of results) {
    if (match.index >= lastEnd) {
      deduped.push(match);
      lastEnd = match.index + match.matchedText.length;
    }
  }
  return deduped;
}

export function detectSelfObservation(responseText: string): DetectedClaim[] {
  return findSelfObservationMatches(responseText).map((m) => ({
    kind: "self_observation",
    text: m.matchedText,
    category: "prior_reasoning",
    index: m.index,
  }));
}

/** Applies a single match's replacement to responseText. Throws if the match has no replacement. */
export function applyRewrite(responseText: string, match: SelfObservationMatch): string {
  if (match.replacement === null) {
    throw new Error("Cannot apply rewrite: match has no clean replacement (would produce a garbled result).");
  }
  return responseText.slice(0, match.index) + match.replacement + responseText.slice(match.index + match.matchedText.length);
}
