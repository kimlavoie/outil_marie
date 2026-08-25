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

function calculateHoursFromTimes(start: string, end: string): number {
  if (!start || !end) return 0;
  const [startH, startM] = start.split(":").map(Number);
  const [endH, endM] = end.split(":").map(Number);
  if (isNaN(startH) || isNaN(startM) || isNaN(endH) || isNaN(endM)) return 0;

  let diffMin = endH * 60 + endM - (startH * 60 + startM);
  if (diffMin < 0) {
    diffMin += 24 * 60; // Shift crosses midnight
  }
  return Math.round((diffMin / 60) * 100) / 100;
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

function formatTimeMask(rawValue: string): string {
  let value = rawValue.replace(/\D/g, ""); // Keep only digits
  if (value.length > 4) {
    value = value.substring(0, 4);
  }

  let formatted = "";
  if (value.length > 0) {
    formatted += value.substring(0, 2); // HH
  }
  if (value.length > 2) {
    formatted += ":" + value.substring(2, 4); // :MM
  }

  return formatted;
}

// Clamps/pads a partial digit run into a full "HH:MM" value, defaulting missing minutes to "00"
// (e.g. "9" -> "09:00", "14" -> "14:00", "930" -> "09:30").
function normalizeTimeDigits(digits: string): string {
  const hh = Math.min(23, parseInt(digits.substring(0, 2), 10) || 0);
  const mm = digits.length > 2 ? Math.min(59, parseInt(digits.padEnd(4, "0").substring(2, 4), 10)) : 0;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

// Turns a native <input type="time"> into a plain masked text field: Chromium/Firefox route Tab
// through internal hour/minute segments and a picker-icon button before leaving a real time
// input, and leave the whole value blank if the user only typed the hour. Masking as text removes
// that picker icon from the tab order entirely, and completes a bare hour (e.g. "14") to "14:00"
// on Tab/blur so a round hour can be entered with two digits and a Tab instead of typing minutes.
function maskTimeInput(input: HTMLInputElement | null) {
  if (!input) return;
  input.type = "text";
  input.setAttribute("inputmode", "numeric");
  input.setAttribute("maxlength", "5");
  if (!input.placeholder) input.placeholder = "--:--";

  input.addEventListener("input", (e: Event) => {
    const inputType = (e as InputEvent).inputType;
    if (inputType === "deleteContentBackward" || inputType === "deleteContentForward") {
      return;
    }

    input.value = formatTimeMask(input.value);
  });

  const completeIfPartial = () => {
    const digits = input.value.replace(/\D/g, "");
    if (digits.length > 0 && digits.length < 4) {
      input.value = normalizeTimeDigits(digits);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
  };

  input.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Tab") completeIfPartial();
  });
  input.addEventListener("blur", completeIfPartial);
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

function formatPostalCode(rawValue: string | undefined | null): string {
  if (!rawValue) return "";
  let value = rawValue.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  if (value.length > 6) {
    value = value.substring(0, 6);
  }

  let formatted = "";
  if (value.length > 0) {
    formatted += value.substring(0, 3);
  }
  if (value.length > 3) {
    formatted += " " + value.substring(3, 6);
  }

  return formatted;
}

function maskPostalCodeInput(input: HTMLInputElement | null) {
  if (!input) return;
  const format = () => {
    input.value = formatPostalCode(input.value);
  };
  input.addEventListener("input", (e: Event) => {
    const inputType = (e as InputEvent).inputType;
    if (inputType === "deleteContentBackward" || inputType === "deleteContentForward") {
      return;
    }
    format();
  });
  input.addEventListener("change", format);
}

export {
  formatCurrency,
  escapeHtml,
  generateUid,
  rateToPercentString,
  newRateVersionRow,
  calculateDaysCount,
  calculateHoursFromTimes,
  formatDateMask,
  maskDateInput,
  maskTimeInput,
  maskPhoneInput,
  formatPostalCode,
  maskPostalCodeInput
};
