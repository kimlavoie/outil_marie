// Parses a "YYYY-MM-DD" string as a local date (avoids the UTC-midnight off-by-one
// that new Date("YYYY-MM-DD") causes in timezones behind UTC).
export function parseLocalDateStr(dateStr: string): Date {
  if (!dateStr) return new Date(NaN);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) return new Date(dateStr);
  return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
}

// Formats a local Date back into a "YYYY-MM-DD" string (inverse of parseLocalDateStr)
export function formatDateStrLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Period Helpers
export function getFiscalYear(dateStr: string): string {
  if (!dateStr) return "";
  const date = parseLocalDateStr(dateStr);
  if (isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-11
  return month >= 6 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}

export function getQuarterNumber(dateStr: string): number | null {
  if (!dateStr) return null;
  const date = parseLocalDateStr(dateStr);
  if (isNaN(date.getTime())) return null;
  const month = date.getMonth();
  if (month >= 6 && month <= 8) return 1;
  if (month >= 9 && month <= 11) return 2;
  if (month >= 0 && month <= 2) return 3;
  return 4;
}

export function getDefaultFiscalYear(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = d.getMonth();
  return month >= 6 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}

// Returns the {start, end} "YYYY-MM-DD" bounds (juillet à juin) of a fiscal year string like "2024-2025".
export function getFiscalYearRange(fy: string): { start: string; end: string } | null {
  if (!fy) return null;
  const match = /^(\d{4})-(\d{4})$/.exec(fy);
  if (!match) return null;
  return { start: `${match[1]}-07-01`, end: `${match[2]}-06-30` };
}

// Helper: Check which quarter a date belongs to
export function getQuarter(dateStr: string): string | null {
  if (!dateStr) return null;
  const date = parseLocalDateStr(dateStr);
  if (isNaN(date.getTime())) return null;
  const month = date.getMonth(); // 0-11
  // Q1: Jul-Sep (months 6, 7, 8)
  // Q2: Oct-Dec (months 9, 10, 11)
  // Q3: Jan-Mar (months 0, 1, 2)
  // Q4: Apr-Jun (months 3, 4, 5)
  if (month >= 6 && month <= 8) return "T1 (Jul-Sep)";
  if (month >= 9 && month <= 11) return "T2 (Oct-Dec)";
  if (month >= 0 && month <= 2) return "T3 (Jan-Mar)";
  return "T4 (Apr-Jun)";
}
