/**
 * validation.ts - Shared, generic validation primitives used by forms and
 * import/export shape checks across the app, so every module doesn't have to
 * reinvent "is this a non-empty string" or "is this a valid amount".
 */

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

// A valid monetary amount: a finite number, not negative unless allowNegative is set.
function isValidAmount(value, { allowNegative = false } = {}) {
  return isFiniteNumber(value) && (allowNegative || value >= 0);
}

// Returns an error message if `value` is empty/blank, otherwise null (so callers can do
// `const err = requireNonEmpty(name, "..."); if (err) { showToast(err); return; }`).
function requireNonEmpty(value, message) {
  return isNonEmptyString(value) ? null : message;
}

// Evaluates an ordered list of [conditionIsOk, errorMessage] pairs and returns the first
// failure as { valid: false, error }, or { valid: true } if every condition held. Used to
// validate the shape of imported files (JSON backups, Excel ledgers) with a readable list of
// rules instead of a pyramid of nested ifs.
function validateRules(rules) {
  for (const [ok, message] of rules) {
    if (!ok) return { valid: false, error: message };
  }
  return { valid: true };
}

export { isNonEmptyString, isPlainObject, isFiniteNumber, isValidAmount, requireNonEmpty, validateRules };

if (typeof window !== "undefined") {
  window.isNonEmptyString = isNonEmptyString;
  window.isPlainObject = isPlainObject;
  window.isFiniteNumber = isFiniteNumber;
  window.isValidAmount = isValidAmount;
  window.requireNonEmpty = requireNonEmpty;
  window.validateRules = validateRules;
}
