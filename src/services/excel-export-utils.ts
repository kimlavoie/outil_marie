/**
 * excel-export-utils.ts - Tiny dependency-free helpers shared by excel-export.ts's options/
 * filters/styling modules: column-letter conversion, an activity's combined revenue lines, and
 * the quarter-end report's fixed leading-column count.
 */

// Converts a 1-based column index to its Excel letter (1 -> "A", 27 -> "AA").
export function getExcelColName(colIdx: number) {
  let temp,
    letter = "";
  while (colIdx > 0) {
    temp = (colIdx - 1) % 26;
    letter = String.fromCharCode(65 + temp) + letter;
    colIdx = (colIdx - temp - 1) / 26;
  }
  return letter;
}

// Revenue lines for an activity: its billing distributions plus its bar revenue lines (excluded
// from billing but still booked to their own GL accounts — see bar-revenue-rows.ts and
// account-report.ts, which applies the same combination for the "Grand Livre local" view).
export function getRevenueLines(act: any): { account_code: string; amount: number }[] {
  return [...(act.distributions || []), ...(act.bar_revenue_lines || [])];
}

// The quarter-end report's first 4 columns are always, in this fixed order (see
// getQuarterEndExportOptions): id, name, date_start, references — frozen alongside the header row
// so the invoice-reference column stays visible while scrolling through the 892-xxx accounts.
export const QUARTER_END_FROZEN_COLS = 4;
