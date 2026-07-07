import test from "node:test";
import assert from "node:assert/strict";
import { tokenizeForMatch, textSimilarity } from "../js/fuzzy-match.js";

test("tokenizeForMatch lowercases, strips accents and drops French stopwords", () => {
  assert.deepEqual(tokenizeForMatch("Location de la Salle Éléphant"), ["location", "salle", "elephant"]);
});

test("tokenizeForMatch ignores punctuation and collapses whitespace", () => {
  assert.deepEqual(tokenizeForMatch("Conférence : climat, environnement !"), ["conference", "climat", "environnement"]);
});

test("tokenizeForMatch returns an empty list for blank/missing input", () => {
  assert.deepEqual(tokenizeForMatch(""), []);
  assert.deepEqual(tokenizeForMatch(undefined), []);
});

test("textSimilarity is 1 for identical text regardless of case/accents", () => {
  assert.equal(textSimilarity("Réservation Salle A", "reservation salle a"), 1);
});

test("textSimilarity is 0 when the two strings share no meaningful tokens", () => {
  assert.equal(textSimilarity("Spectacle de danse", "Vente de billets"), 0);
});

test("textSimilarity scores partial overlap between 0 and 1", () => {
  const score = textSimilarity("Conférence sur le climat", "Conférence sur l'environnement");
  assert.ok(score > 0 && score < 1);
});

test("textSimilarity is 0 when either input is empty", () => {
  assert.equal(textSimilarity("", "Salle A"), 0);
  assert.equal(textSimilarity("Salle A", ""), 0);
});
