/**
 * format.ts - Stateless string/number formatting and id-generation helpers, plus the date/phone
 * input masks built on formatDateMask. Split out of utils.ts (see that file for why it stays a
 * barrel re-exporting this alongside the DOM/activity helper modules).
 */

// Helper: Format currencies in standard FR-CA format
function formatCurrency(val: any) {
  return new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" }).format(val);
}

// Escapes HTML-sensitive characters so free-text fields (names, notes, descriptions...) can be
// safely interpolated into innerHTML template literals without risking markup/script injection.
function escapeHtml(str: any) {
  if (!str) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

// Short unique id for dynamically created rows/cards (tarifs, salles réservées, ventilations)
function generateUid(prefix: string) {
  return `${prefix}-${Date.now()}${Math.random().toString(36).substr(2, 5)}`;
}

// Converts a stored rate (e.g. 0.09975) to the percentage string shown/edited in the UI (e.g.
// "9.975"), rounded to 6 decimals to absorb the floating-point noise `rate * 100` alone would
// introduce (0.09975 * 100 === 9.975000000000001).
function rateToPercentString(rate: number): string {
  return String(Math.round(rate * 1e8) / 1e6);
}

export interface RateVersionRow {
  key: string;
  effective_date: string;
  rate: string;
  overtime_rate?: string;
}

function newRateVersionRow(effective_date = "", rate = "", overtime_rate?: string): RateVersionRow {
  return { key: generateUid("rate-row"), effective_date, rate, overtime_rate };
}

// Helper: Calculate days between dates (inclusive). Missing/unparseable input falls back to 1
// (can't tell how long the range was meant to be), but end < start returns 0 rather than 1 —
// that's not "unknown", it's an invalid range, and callers should treat it as such instead of
// silently billing/generating a single day for it.
function calculateDaysCount(startStr: string, endStr: string) {
  if (!startStr || !endStr) return 1;
  const start = new Date(startStr);
  const end = new Date(endStr);
  if (isNaN(Number(start)) || isNaN(Number(end))) return 1;
  const diffTime = end.getTime() - start.getTime();
  if (diffTime < 0) return 0;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
}

/* ==========================================================================
   INPUT MASKS
   ========================================================================== */

function formatDateMask(rawValue: string): string {
  let value = rawValue.replace(/\D/g, ""); // Keep only digits
  if (value.length > 8) {
    value = value.substring(0, 8);
  }

  let formatted = "";
  if (value.length > 0) {
    formatted += value.substring(0, 4); // YYYY
  }
  if (value.length > 4) {
    formatted += "-" + value.substring(4, 6); // -MM
  }
  if (value.length > 6) {
    formatted += "-" + value.substring(6, 8); // -DD
  }

  return formatted;
}

function maskDateInput(input: HTMLInputElement | null) {
  if (!input) return;
  input.addEventListener("input", (e: Event) => {
    // Let the user delete normally with backspace or delete key
    const inputType = (e as InputEvent).inputType;
    if (inputType === "deleteContentBackward" || inputType === "deleteContentForward") {
      return;
    }

    input.value = formatDateMask(input.value);
  });
}

function maskPhoneInput(input: HTMLInputElement | null) {
  if (!input) return;
  input.addEventListener("input", (e: Event) => {
    // Let the user delete normally with backspace or delete key
    if ((e as InputEvent).inputType === "deleteContentBackward" || (e as InputEvent).inputType === "deleteContentForward") {
      return;
    }

    let value = input.value.replace(/\D/g, ""); // Keep only digits
    if (value.length > 10) {
      value = value.substring(0, 10);
    }

    let formatted = "";
    if (value.length > 0) {
      formatted += value.substring(0, 3); // XXX
    }
    if (value.length > 3) {
      formatted += "-" + value.substring(3, 6); // -XXX
    }
    if (value.length > 6) {
      formatted += "-" + value.substring(6, 10); // -XXXX
    }

    input.value = formatted;
  });
}

export {
  formatCurrency,
  escapeHtml,
  generateUid,
  rateToPercentString,
  newRateVersionRow,
  calculateDaysCount,
  formatDateMask,
  maskDateInput,
  maskPhoneInput
};
