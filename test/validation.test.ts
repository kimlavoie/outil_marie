import test from "node:test";
import assert from "node:assert/strict";
import { isNonEmptyString, isPlainObject, isFiniteNumber, isValidAmount, requireNonEmpty, validateRules } from "../src/utils/validation.ts";

test("isNonEmptyString rejects blank, whitespace-only and non-string values", () => {
  assert.equal(isNonEmptyString("Activité"), true);
  assert.equal(isNonEmptyString(""), false);
  assert.equal(isNonEmptyString("   "), false);
  assert.equal(isNonEmptyString(null), false);
  assert.equal(isNonEmptyString(42), false);
});

test("isPlainObject accepts plain objects only, not arrays or null", () => {
  assert.equal(isPlainObject({}), true);
  assert.equal(isPlainObject([]), false);
  assert.equal(isPlainObject(null), false);
  assert.equal(isPlainObject("obj"), false);
});

test("isFiniteNumber accepts only finite numbers", () => {
  assert.equal(isFiniteNumber(12.5), true);
  assert.equal(isFiniteNumber(NaN), false);
  assert.equal(isFiniteNumber(Infinity), false);
  assert.equal(isFiniteNumber("12"), false);
});

test("isValidAmount rejects negative amounts unless allowNegative is set", () => {
  assert.equal(isValidAmount(100), true);
  assert.equal(isValidAmount(-5), false);
  assert.equal(isValidAmount(-5, { allowNegative: true }), true);
  assert.equal(isValidAmount(NaN), false);
});

test("requireNonEmpty returns the message for blank input and null otherwise", () => {
  assert.equal(requireNonEmpty("", "Le nom est obligatoire."), "Le nom est obligatoire.");
  assert.equal(requireNonEmpty("Salle A", "Le nom est obligatoire."), null);
});

test("validateRules returns the first failing rule's message", () => {
  const result = validateRules([
    [true, "ok 1"],
    [false, "échec sur la deuxième règle"],
    [false, "ne devrait jamais être atteint"]
  ]);
  assert.equal(result.valid, false);
  assert.equal(result.error, "échec sur la deuxième règle");
});

test("validateRules returns valid=true when every rule passes", () => {
  const result = validateRules([
    [true, "ok"],
    [1 + 1 === 2, "math cassé"]
  ]);
  assert.deepEqual(result, { valid: true });
});
