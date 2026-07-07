/**
 * fuzzy-match.js - Lightweight fuzzy text matching shared by the reconciliation engine and the
 * global search bar, so both tolerate typos/word order instead of requiring an exact substring.
 */

// Common French connector words, excluded from tokenization so two unrelated strings sharing
// only "de"/"la"/"et" don't register as textually similar.
const FUZZY_TEXT_STOPWORDS = new Set([
  "de",
  "des",
  "du",
  "le",
  "la",
  "les",
  "l",
  "un",
  "une",
  "et",
  "en",
  "sur",
  "au",
  "aux",
  "pour",
  "avec",
  "sans",
  "dans"
]);

// Splits text into lowercased, accent-stripped word tokens for similarity comparison
function tokenizeForMatch(text) {
  return (text || "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(t => t && !FUZZY_TEXT_STOPWORDS.has(t));
}

// Dice coefficient (2 * |A intersect B| / (|A|+|B|)) between the token sets of two strings, 0..1
function textSimilarity(a, b) {
  const tokensA = new Set(tokenizeForMatch(a));
  const tokensB = new Set(tokenizeForMatch(b));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let common = 0;
  tokensA.forEach(t => {
    if (tokensB.has(t)) common++;
  });
  return (2 * common) / (tokensA.size + tokensB.size);
}

export { FUZZY_TEXT_STOPWORDS, tokenizeForMatch, textSimilarity };

if (typeof window !== "undefined") {
  window.FUZZY_TEXT_STOPWORDS = FUZZY_TEXT_STOPWORDS;
  window.tokenizeForMatch = tokenizeForMatch;
  window.textSimilarity = textSimilarity;
}
