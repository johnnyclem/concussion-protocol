import type { DetectedClaim } from "../types.js";

/**
 * Rule 1 detector: present-tense assertions about external world-state.
 *
 * This is pattern-based and deliberately conservative. Missing an edge case
 * (false negative) is cheaper than flagging ordinary prose (false positive):
 * over-flagging destroys trust in the gate faster than under-flagging does.
 *
 * Out of scope by design: historical facts, definitions, timeless claims,
 * quoted text, and hypothetical/conditional framing ("if it were noon...").
 */

interface PatternDef {
  regex: RegExp;
  category: string;
}

// time/date: present-tense claims about the current time or date.
// "it is late" is in scope even without a specific number, because it is
// still a claim about present state; "the meeting was at 3pm yesterday" is
// past tense and is excluded by requiring "is"/"it's"/"currently".
const TIME_PATTERNS: PatternDef[] = [
  { regex: /\b(?:it'?s|it\s+is)\s+(?:currently\s+)?(?:very\s+)?(?:late|early)\b/gi, category: "time" },
  { regex: /\b(?:it'?s|it\s+is)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/gi, category: "time" },
  { regex: /\bright now,?\s+it'?s\b/gi, category: "time" },
  {
    regex:
      /\bcurrently,?\s+(?:it'?s\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december)\b/gi,
    category: "time",
  },
  { regex: /\bthe current (?:time|date) is\b/gi, category: "time" },
  { regex: /\btoday is (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, category: "time" },
];

// current_role: present-tense role/officeholder attributions.
// The fixed sentence structure ("the current X is" / "is [the] X of") is
// what naturally excludes historical framing: "Lincoln was the president of
// the United States" fails to match because it uses "was", not "is", and
// "Washington is remembered as the first president" fails because the words
// between "is" and the role noun break the required adjacency.
const ROLE_WORDS =
  "prime minister|chief executive officer|chief executive|president|chairperson|chairwoman|chairman|chair|director-general|director general|governor|secretary-general|secretary general|secretary of state|monarch|premier|chancellor|mayor|senator|ceo|king|queen|pope";

const ROLE_PATTERNS: PatternDef[] = [
  { regex: new RegExp(`\\bthe current (?:${ROLE_WORDS}) is\\b`, "gi"), category: "current_role" },
  { regex: new RegExp(`\\bis (?:the |a )?(?:current )?(?:${ROLE_WORDS}) of\\b`, "gi"), category: "current_role" },
];

// current_price / current_value: present-tense monetary/quantitative state.
// "costs" (not "cost") is the present-tense signal: "cost" is irregular and
// past tense for this verb, so "it cost $5 yesterday" is naturally excluded.
const PRICE_PATTERNS: PatternDef[] = [
  { regex: /\b\w+(?:\s\w+){0,4}\s+costs\s+\$?[\d,]+(?:\.\d+)?\b/gi, category: "current_price" },
  { regex: /\bthe price of\s+[\w\s]+?\s+is\s+\$?[\d,]+(?:\.\d+)?\b/gi, category: "current_price" },
  { regex: /\bis\s+(?:currently\s+)?(?:trading|priced|valued)\s+at\s+\$?[\d,]+(?:\.\d+)?\b/gi, category: "current_value" },
];

// existence / current_status: "X exists", "X is still [true/available/...]",
// "the latest X is". Bare "exists" is common in definitional/timeless prose
// ("a class of algorithms exists for this problem"), so only "still exists"
// / "currently exists" are treated as present-state claims.
const EXISTENCE_PATTERNS: PatternDef[] = [
  { regex: /\bthe latest [\w\s]{1,30}?\s+is\b/gi, category: "existence" },
  { regex: /\b(?:still|currently)\s+exists\b/gi, category: "existence" },
  {
    regex: /\bis\s+still\s+(?:available|running|active|valid|true|supported|working|online|live|accurate|correct)\b/gi,
    category: "existence",
  },
];

const ALL_PATTERNS: PatternDef[] = [...TIME_PATTERNS, ...ROLE_PATTERNS, ...PRICE_PATTERNS, ...EXISTENCE_PATTERNS];

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

export function detectExternalStateClaims(responseText: string): DetectedClaim[] {
  const masked = maskExcludedSpans(responseText);
  const claims: DetectedClaim[] = [];
  const seenSpans = new Set<string>();

  for (const { regex, category } of ALL_PATTERNS) {
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
          kind: "external_state",
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
