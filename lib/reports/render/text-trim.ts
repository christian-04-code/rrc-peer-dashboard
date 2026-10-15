/**
 * Sentence-level shortening for the reduced-content fallback tier (five-page
 * layout pass, 2026-10-14). Only ever keeps the FIRST n whole sentences of an
 * AI-written field -- never cuts mid-sentence, never rewrites, never reorders --
 * so trimmed text is always a verbatim prefix of the validated original. The
 * prompt asks for the key point first ("what happened, then why it matters"),
 * so the leading sentences carry the substance.
 */

// Tokens ending in "." that are not sentence ends ("U.S.", "e.g.", "vs.", "Inc.", "approx.").
const ABBREVIATIONS = new Set(["e.g", "i.e", "vs", "approx", "inc", "corp", "co", "ltd", "jr", "sr", "mr", "ms", "dr", "no", "st", "est", "etc", "mo", "yr"]);

function isAbbreviation(token: string): boolean {
  const bare = token.replace(/^[("'\[]+/, "");
  if (/^(?:[A-Za-z]\.)*[A-Za-z]$/.test(bare)) return true; // single letters / initialisms: "U.S", "A", "Q"
  return ABBREVIATIONS.has(bare.toLowerCase());
}

/** Splits into sentences on . ! ? followed by whitespace, skipping abbreviations and decimals ("$3.03"). */
export function splitSentences(text: string): string[] {
  const sentences: string[] = [];
  let start = 0;
  const re = /[.!?]["')\]]*(?=\s+|$)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const end = match.index + match[0].length;
    if (text[match.index] === ".") {
      const before = text.slice(start, match.index);
      const token = before.slice(before.search(/\S*$/));
      if (isAbbreviation(token)) continue;
    }
    sentences.push(text.slice(start, end).trim());
    start = end;
  }
  const rest = text.slice(start).trim();
  if (rest) sentences.push(rest);
  return sentences.filter((s) => s.length > 0);
}

/** The first `count` sentences, verbatim. Returns the original text unchanged when it already has that many or fewer. */
export function firstSentences(text: string, count: number): string {
  const sentences = splitSentences(text);
  return sentences.length <= count ? text.trim() : sentences.slice(0, count).join(" ");
}
