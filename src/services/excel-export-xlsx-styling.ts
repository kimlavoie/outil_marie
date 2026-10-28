/**
 * excel-export-xlsx-styling.ts - Post-processes a SheetJS-written .xlsx (raw OOXML, re-opened
 * with JSZip) to apply the styling SheetJS's community-edition writer can't: bold/word-wrapped
 * cells, solid cell fills, and frozen panes. Used only by the quarter-end report (see
 * buildQuarterEndBlob); every other report uses the plain lib.writeFile path in excel-export.ts.
 */
import JSZip from "jszip";
import { logError } from "../utils/logger.ts";
import { getExcelColName, QUARTER_END_FROZEN_COLS } from "./excel-export-utils.ts";

// Adds a bold (optionally word-wrapped) font + cellXfs entry to a SheetJS-generated styles.xml, as
// plain OOXML text, returning the new entry's style index for a caller to reference from cells.
// SheetJS's community-edition writer accepts a cell's `.s` style property but silently drops it
// when writing (see get_cell_style() in xlsx.js, which only ever tracks number formats) — so the
// style has to be patched into the already-written XML instead of being requested through the
// SheetJS object model. Returns xfIndex -1 (styles.xml unchanged) if that XML isn't the shape
// expected, so callers can skip applying a style that was never added.
function addBoldXf(stylesXml: string, opts: { wrapText?: boolean } = {}): { stylesXml: string; xfIndex: number } {
  const fontsMatch = stylesXml.match(/<fonts count="(\d+)"([^>]*)>([\s\S]*?)<\/fonts>/);
  const cellXfsMatch = stylesXml.match(/<cellXfs count="(\d+)">([\s\S]*?)<\/cellXfs>/);
  if (!fontsMatch || !cellXfsMatch) return { stylesXml, xfIndex: -1 };

  const fontEntries = fontsMatch[3].match(/<font\b[^>]*\/>|<font\b[^>]*>[\s\S]*?<\/font>/g) || [];
  const baseFont = fontEntries[0] || '<font><sz val="11"/><name val="Calibri"/></font>';
  const boldFont = /<b\/>/.test(baseFont) ? baseFont : baseFont.replace(/^<font(\s*)>/, "<font$1><b/>");
  const boldFontId = parseInt(fontsMatch[1], 10);

  const stylesWithBoldFont = stylesXml
    .replace(/<fonts count="(\d+)"([^>]*)>/, (_m, count, attrs) => `<fonts count="${parseInt(count, 10) + 1}"${attrs}>`)
    .replace("</fonts>", `${boldFont}</fonts>`);

  const xfCount = parseInt(cellXfsMatch[1], 10);
  const boldXf = opts.wrapText
    ? `<xf numFmtId="0" fontId="${boldFontId}" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment wrapText="1"/></xf>`
    : `<xf numFmtId="0" fontId="${boldFontId}" fillId="0" borderId="0" xfId="0" applyFont="1"/>`;
  const patchedStyles = stylesWithBoldFont
    .replace(/<cellXfs count="(\d+)">/, `<cellXfs count="${xfCount + 1}">`)
    .replace("</cellXfs>", `${boldXf}</cellXfs>`);

  return { stylesXml: patchedStyles, xfIndex: xfCount };
}

// Patches a sheet.xml's given row so every one of its cells references the given style index.
function applyXfToRow(sheetXml: string, rowNumber: number, xfIndex: number): string {
  const rowRegex = new RegExp(`(<row r="${rowNumber}"[^>]*>)([\\s\\S]*?)(</row>)`);
  return sheetXml.replace(rowRegex, (_m, open, body, close) => {
    const newBody = body.replace(/<c\s+r="([^"]+)"([^>]*?)(\/?)>/g, (_cm: string, ref: string, attrs: string, slash: string) => {
      const cleanedAttrs = attrs.replace(/\s+s="\d+"/, "");
      return `<c r="${ref}"${cleanedAttrs} s="${xfIndex}"${slash}>`;
    });
    return `${open}${newBody}${close}`;
  });
}

// Patches a sheet.xml's given column (within the given 1-based row range, inclusive) so every one
// of its cells references the given style index.
function applyXfToColumn(sheetXml: string, colLetter: string, startRow: number, endRow: number, xfIndex: number): string {
  const cellRegex = new RegExp(`<c\\s+r="${colLetter}(\\d+)"([^>]*?)(\\/?)>`, "g");
  return sheetXml.replace(cellRegex, (match: string, rowStr: string, attrs: string, slash: string) => {
    const rowNumber = parseInt(rowStr, 10);
    if (rowNumber < startRow || rowNumber > endRow) return match;
    const cleanedAttrs = attrs.replace(/\s+s="\d+"/, "");
    return `<c r="${colLetter}${rowStr}"${cleanedAttrs} s="${xfIndex}"${slash}>`;
  });
}

// One row's cells rendered bold (optionally word-wrapped too) — see addBoldXf/applyXfToRow above.
export function addBoldStyleToSheetXml(
  stylesXml: string,
  sheetXml: string,
  rowNumber: number,
  opts: { wrapText?: boolean } = {}
): { stylesXml: string; sheetXml: string } {
  const { stylesXml: patchedStyles, xfIndex } = addBoldXf(stylesXml, opts);
  if (xfIndex === -1) return { stylesXml, sheetXml };
  return { stylesXml: patchedStyles, sheetXml: applyXfToRow(sheetXml, rowNumber, xfIndex) };
}

// One column's cells (within the given row range) rendered bold — see addBoldXf/applyXfToColumn
// above.
export function addBoldStyleToColumnXml(
  stylesXml: string,
  sheetXml: string,
  colLetter: string,
  startRow: number,
  endRow: number
): { stylesXml: string; sheetXml: string } {
  const { stylesXml: patchedStyles, xfIndex } = addBoldXf(stylesXml);
  if (xfIndex === -1) return { stylesXml, sheetXml };
  return { stylesXml: patchedStyles, sheetXml: applyXfToColumn(sheetXml, colLetter, startRow, endRow, xfIndex) };
}

// Fill colors for the quarter-end report's reconciliation highlights (see
// getQuarterEndReconciliationCellRefs): yellow for an amount mismatch ("diff"), orange for an
// amount missing from the ledger entirely ("unlogged") — distinct colors so the two kinds of
// issue read differently at a glance.
const RECONCILIATION_DIFF_FILL_ARGB = "FFFFFF00";
const RECONCILIATION_UNLOGGED_FILL_ARGB = "FFFFA500";

// Adds a solid fill (given as an ARGB hex string, e.g. "FFFFFF00") + cellXfs entry to a
// SheetJS-generated styles.xml, returning the new entry's style index — same rationale and
// limitation as addBoldXf (SheetJS's community-edition writer never writes a cell's `.s` style,
// fill included, so this has to be patched into the already-written XML). Returns xfIndex -1 if
// that XML isn't the shape expected.
function addFillXf(stylesXml: string, argb: string): { stylesXml: string; xfIndex: number } {
  const fillsMatch = stylesXml.match(/<fills count="(\d+)">([\s\S]*?)<\/fills>/);
  const cellXfsMatch = stylesXml.match(/<cellXfs count="(\d+)">([\s\S]*?)<\/cellXfs>/);
  if (!fillsMatch || !cellXfsMatch) return { stylesXml, xfIndex: -1 };

  const fillCount = parseInt(fillsMatch[1], 10);
  const fill = `<fill><patternFill patternType="solid"><fgColor rgb="${argb}"/><bgColor indexed="64"/></patternFill></fill>`;
  const stylesWithFill = stylesXml
    .replace(/<fills count="(\d+)">/, `<fills count="${fillCount + 1}">`)
    .replace("</fills>", `${fill}</fills>`);

  const xfCount = parseInt(cellXfsMatch[1], 10);
  const fillXf = `<xf numFmtId="0" fontId="0" fillId="${fillCount}" borderId="0" xfId="0" applyFill="1"/>`;
  const patchedStyles = stylesWithFill
    .replace(/<cellXfs count="(\d+)">/, `<cellXfs count="${xfCount + 1}">`)
    .replace("</cellXfs>", `${fillXf}</cellXfs>`);

  return { stylesXml: patchedStyles, xfIndex: xfCount };
}

// Patches a sheet.xml so every cell in the given set of refs (e.g. "E3") references the given
// style index, leaving every other cell untouched.
function applyXfToCells(sheetXml: string, cellRefs: Set<string>, xfIndex: number): string {
  if (cellRefs.size === 0) return sheetXml;
  return sheetXml.replace(/<c\s+r="([^"]+)"([^>]*?)(\/?)>/g, (match: string, ref: string, attrs: string, slash: string) => {
    if (!cellRefs.has(ref)) return match;
    const cleanedAttrs = attrs.replace(/\s+s="\d+"/, "");
    return `<c r="${ref}"${cleanedAttrs} s="${xfIndex}"${slash}>`;
  });
}

// The given cells (scattered account cells with a reconciliation issue — see
// getQuarterEndReconciliationCellRefs) highlighted with a solid fill, so they stand out for a
// second look. See addFillXf/applyXfToCells above.
export function addFillStyleToCellsXml(
  stylesXml: string,
  sheetXml: string,
  cellRefs: Set<string>,
  argb: string
): { stylesXml: string; sheetXml: string } {
  if (cellRefs.size === 0) return { stylesXml, sheetXml };
  const { stylesXml: patchedStyles, xfIndex } = addFillXf(stylesXml, argb);
  if (xfIndex === -1) return { stylesXml, sheetXml };
  return { stylesXml: patchedStyles, sheetXml: applyXfToCells(sheetXml, cellRefs, xfIndex) };
}

// Freezes the header row (row 1) and the report's leading columns (see QUARTER_END_FROZEN_COLS) by
// patching a <pane> into the sheet's <sheetView> — SheetJS's writer only ever emits a bare
// `<sheetView workbookViewId="0"/>` (see write_ws_xml_sheetviews() in xlsx.js), with no supported
// way to request frozen panes through the object model.
export function freezePanesXml(sheetXml: string, frozenCols: number): string {
  const topLeftCell = `${getExcelColName(frozenCols + 1)}2`;
  return sheetXml.replace(
    /<sheetView([^>]*)\/>/,
    (_m, attrs) =>
      `<sheetView${attrs}><pane xSplit="${frozenCols}" ySplit="1" topLeftCell="${topLeftCell}" activePane="bottomRight" state="frozen"/>` +
      `<selection pane="bottomRight" activeCell="${topLeftCell}" sqref="${topLeftCell}"/></sheetView>`
  );
}

// 2x (to stop a two-reference note from being cut off), then another 1.5x on top of that (still
// not quite enough room) — see the commit history of this function for why it landed at 3x.
const COMMENT_NOTE_HEIGHT_MULTIPLIER = 3;

// Enlarges every account-cell note's comment box (by COMMENT_NOTE_HEIGHT_MULTIPLIER) so a note
// with several reference lines isn't cut off. SheetJS hardcodes both a 64pt CSS height AND a
// <x:Anchor> (the shape's position/size as a cell-relative row/column span) that spans 4 rows —
// see write_vml_comment() in xlsx.js, with no option to request either taller. Scaling only the
// CSS height has no visible effect: because the shape also carries <x:SizeWithCells/>, Excel
// re-derives the rendered box from the Anchor's row span (not the literal style height) once the
// file is opened, so the Anchor is what actually has to change.
export function enlargeCommentNotesXml(vmlXml: string): string {
  return vmlXml
    .replace(/height:64pt/g, `height:${64 * COMMENT_NOTE_HEIGHT_MULTIPLIER}pt`)
    .replace(/<x:Anchor>([^<]+)<\/x:Anchor>/g, (whole, anchor) => {
      const parts = String(anchor)
        .split(",")
        .map(n => parseInt(n, 10));
      if (parts.length !== 8 || parts.some(n => Number.isNaN(n))) return whole;
      const [startCol, startColOff, startRow, startRowOff, endCol, endColOff, endRow, endRowOff] = parts;
      const scaledEndRow = startRow + (endRow - startRow) * COMMENT_NOTE_HEIGHT_MULTIPLIER;
      return `<x:Anchor>${[startCol, startColOff, startRow, startRowOff, endCol, endColOff, scaledEndRow, endRowOff].join(",")}</x:Anchor>`;
    });
}

export interface QuarterEndStyling {
  totalRowNumber: number | null; // the "TOTAUX COMPLETS" row, or null when there's no data to total
  totalColLetter: string; // the "REVENUS TOTAL RÉÈL" column, bolded for its full height
  lastDataRow: number; // last activity row (header is row 1), so 1 when there's no data
  diffCellRefs: Set<string>; // account cells with an amount mismatch — highlighted yellow
  unloggedCellRefs: Set<string>; // account cells missing from the ledger entirely — highlighted orange
}

// Builds the quarter-end report's .xlsx as a Blob with its header row bold/word-wrapped, its
// totals row and "REVENUS TOTAL RÉÈL" column bold, and the header row + leading columns frozen.
// The plain SheetJS write path (lib.writeFile, used for every other report) can't do any of that —
// see addBoldStyleToSheetXml/addBoldStyleToColumnXml/freezePanesXml above — so this re-opens the
// written bytes with JSZip and patches the "ACTIVITÉS" sheet (the quarter-end report's only sheet,
// so always xl/worksheets/sheet1.xml) directly. Falls back to the plain, unstyled workbook if
// anything about that OOXML isn't the shape this expects, so a SheetJS upgrade can't turn a
// styling nice-to-have into a broken export.
export async function buildQuarterEndBlob(lib: any, wb: any, styling: QuarterEndStyling): Promise<Blob> {
  const mimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const buffer = lib.write(wb, { type: "array", bookType: "xlsx" });

  try {
    const zip = await JSZip.loadAsync(buffer);
    const stylesFile = zip.file("xl/styles.xml");
    const sheetFile = zip.file("xl/worksheets/sheet1.xml");
    if (!stylesFile || !sheetFile) return new Blob([buffer], { type: mimeType });

    let stylesXml = await stylesFile.async("string");
    let sheetXml = await sheetFile.async("string");

    ({ stylesXml, sheetXml } = addBoldStyleToSheetXml(stylesXml, sheetXml, 1, { wrapText: true }));
    if (styling.totalRowNumber !== null) {
      ({ stylesXml, sheetXml } = addBoldStyleToSheetXml(stylesXml, sheetXml, styling.totalRowNumber));
    }
    if (styling.lastDataRow >= 2) {
      ({ stylesXml, sheetXml } = addBoldStyleToColumnXml(stylesXml, sheetXml, styling.totalColLetter, 2, styling.lastDataRow));
    }
    ({ stylesXml, sheetXml } = addFillStyleToCellsXml(stylesXml, sheetXml, styling.diffCellRefs, RECONCILIATION_DIFF_FILL_ARGB));
    ({ stylesXml, sheetXml } = addFillStyleToCellsXml(stylesXml, sheetXml, styling.unloggedCellRefs, RECONCILIATION_UNLOGGED_FILL_ARGB));
    sheetXml = freezePanesXml(sheetXml, QUARTER_END_FROZEN_COLS);

    const vmlFile = zip.file("xl/drawings/vmlDrawing1.vml");
    if (vmlFile) {
      const vmlXml = await vmlFile.async("string");
      zip.file("xl/drawings/vmlDrawing1.vml", enlargeCommentNotesXml(vmlXml));
    }

    zip.file("xl/styles.xml", stylesXml);
    zip.file("xl/worksheets/sheet1.xml", sheetXml);

    const outBuffer = await zip.generateAsync({ type: "arraybuffer" });
    return new Blob([outBuffer], { type: mimeType });
  } catch (err) {
    logError("backup", "mise en forme de l'en-tête et des totaux", err);
    return new Blob([buffer], { type: mimeType });
  }
}
