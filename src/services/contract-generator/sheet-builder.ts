/**
 * contract-generator/sheet-builder.ts - Generic worksheet-XML assembly: XML/date/row-height
 * helpers and the SheetBuilder class that accumulates rows/merges and renders the final
 * <sheetData>/<mergeCells> XML. Split out of contract-generator.ts (see that file for why it
 * stays a barrel re-exporting this alongside styles.ts/static-content.ts/sheet-xml.ts) — this
 * piece knows nothing about the contract's actual content, only how to lay out rows/cells.
 */
import { S } from "./styles.ts";

function xmlEscapeText(str: string) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatDateFr(iso: string) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${y}-${m}-${d}`;
}

// Estimates a row height (points) that fits `text` wrapped across a cell `widthUnits` wide (in
// Excel's <col width> units — see buildSheetXml's <cols>) at a given `fontSize` (points). The
// borrowed styles here run from 14pt to 20pt (see xl/styles.xml font ids), much larger than the
// 11pt default a naive fixed-chars-per-line estimate would assume.
//
// Excel's width unit is defined against an 11pt reference font (~7px/unit); a `fontSize`-pt font
// renders roughly `7 * fontSize/11` px/char, so chars-per-line scales as `widthUnits * 11 /
// fontSize`. A 0.85 fudge factor is applied on top since word-wrap breaks at word boundaries, not
// mid-character, so real lines fit somewhat fewer characters than the raw pixel math suggests —
// better to overshoot the row height than clip text.
function wrapRowHeight(text: string, widthUnits: number, fontSize = 16) {
  const charsPerLine = Math.max(6, Math.floor((widthUnits * 11 * 0.85) / fontSize));
  const lineHeight = fontSize * 1.25;
  const lines = text.split("\n").reduce((sum, seg) => sum + Math.max(1, Math.ceil(seg.length / charsPerLine)), 0);
  if (lines === 1) {
    return Math.max(20, Math.round(lineHeight + 3));
  }
  return Math.max(20, Math.round(lines * lineHeight + 4));
}

interface CellSpec {
  col: string;
  style: number;
  value?: string | number;
  mergeTo?: string;
}

// Accumulates worksheet rows/merges and renders them into the final <sheetData>/<mergeCells> XML.
class SheetBuilder {
  private rowXmls: string[] = [];
  private merges: string[] = [];
  private rowNum = 0;
  private pageBreaks: number[] = [];

  getCurrentRow() {
    return this.rowNum;
  }

  // Marks a manual page break before whatever row comes next (e.g. a section title) — no-op if
  // nothing has been written yet, since a break before the first row is meaningless.
  pageBreakBefore() {
    if (this.rowNum > 0) this.pageBreaks.push(this.rowNum);
  }

  addCustomMerge(range: string) {
    this.merges.push(range);
  }

  private cellXml(addr: string, style: number, value?: string | number) {
    if (value === undefined || value === null || value === "") return `<c r="${addr}" s="${style}"/>`;
    if (typeof value === "number") return `<c r="${addr}" s="${style}"><v>${value}</v></c>`;
    const text = xmlEscapeText(value);
    const preserve = /^\s|\s$|\n/.test(text) ? ' xml:space="preserve"' : "";
    return `<c r="${addr}" s="${style}" t="inlineStr"><is><t${preserve}>${text}</t></is></c>`;
  }

  addRow(height: number | null, cells: CellSpec[]) {
    this.rowNum++;
    const r = this.rowNum;
    const cellXmls = cells.map(c => this.cellXml(`${c.col}${r}`, c.style, c.value));
    cells.forEach(c => {
      if (c.mergeTo) this.merges.push(`${c.col}${r}:${c.mergeTo}${r}`);
    });
    const ht = height ? ` ht="${height}" customHeight="1"` : "";
    this.rowXmls.push(`<row r="${r}"${ht}>${cellXmls.join("")}</row>`);
    return r;
  }

  blankRows(count: number, height?: number) {
    for (let i = 0; i < count; i++) {
      this.rowNum++;
      const ht = height ? ` ht="${height}" customHeight="1"` : "";
      this.rowXmls.push(`<row r="${this.rowNum}"${ht}/>`);
    }
  }

  titleRow(text: string, style = S.sectionTitle) {
    this.addRow(wrapRowHeight(text, 132, 20), [{ col: "A", style, value: text, mergeTo: "F" }]);
  }

  // Long/multi-line values (address, description...) switch to a wrap-enabled style and get a
  // row height sized to their content — otherwise they'd get visually clipped by neighboring
  // cells at the default single-line row height.
  labelRow(label: string, value: string | number | undefined, labelStyle = S.label, valueStyle = S.value) {
    if (value === undefined || value === "") return;
    const isLong = typeof value === "string" && (value.length > 40 || value.includes("\n"));
    const effectiveStyle = isLong ? S.wrapValue : valueStyle;
    const height = isLong ? wrapRowHeight(value as string, 88) : null;
    this.addRow(height, [
      { col: "A", style: labelStyle, value: label, mergeTo: "B" },
      { col: "C", style: effectiveStyle, value, mergeTo: "F" }
    ]);
  }

  textBoxRow(text: string, style: number, fontSize = 16) {
    this.addRow(wrapRowHeight(text, 132, fontSize), [{ col: "A", style, value: text, mergeTo: "F" }]);
  }

  // A table header row split A:B / C / D / E:F (used for the itemized rooms/personnel/services
  // tables — 4 logical columns over the sheet's 6-column grid).
  itemTableHeader(col1: string, col2: string, col3: string, col4: string) {
    this.addRow(26, [
      { col: "A", style: S.tableHeader, value: col1, mergeTo: "B" },
      { col: "C", style: S.tableHeader, value: col2 },
      { col: "D", style: S.tableHeader, value: col3 },
      { col: "E", style: S.tableHeader, value: col4, mergeTo: "F" }
    ]);
  }

  itemRow(label: string, col2: string | number, col3: string | number, amount: number) {
    const height = label.length > 20 ? wrapRowHeight(label, 44) : null;
    this.addRow(height, [
      { col: "A", style: S.wrapValue, value: label, mergeTo: "B" },
      { col: "C", style: S.value, value: col2 },
      { col: "D", style: S.value, value: col3 },
      { col: "E", style: S.currency, value: amount, mergeTo: "F" }
    ]);
  }

  // Same 4-column shape as itemRow, but without the currency-formatted last column — used for
  // non-monetary detail rows (e.g. a room's reserved date/time slots).
  detailRow(label: string, col2: string, col3: string, col4: string) {
    const height = label.length > 20 ? wrapRowHeight(label, 44) : null;
    this.addRow(height, [
      { col: "A", style: S.wrapValue, value: label, mergeTo: "B" },
      { col: "C", style: S.value, value: col2 },
      { col: "D", style: S.value, value: col3 },
      { col: "E", style: S.value, value: col4, mergeTo: "F" }
    ]);
  }

  // Small highlighted single-line label (e.g. "Personnel" inside a room's block) — a lighter
  // break than titleRow's big section banner.
  subHeader(text: string) {
    this.addRow(wrapRowHeight(text, 132, 16), [{ col: "A", style: S.clauseGroup, value: text, mergeTo: "F" }]);
  }

  get lastRow() {
    return this.rowNum;
  }

  render() {
    const mergeCellsXml =
      this.merges.length > 0
        ? `<mergeCells count="${this.merges.length}">${this.merges.map(m => `<mergeCell ref="${m}"/>`).join("")}</mergeCells>`
        : "";
    const rowBreaksXml =
      this.pageBreaks.length > 0
        ? `<rowBreaks count="${this.pageBreaks.length}" manualBreakCount="${this.pageBreaks.length}">${this.pageBreaks
            .map(r => `<brk id="${r}" max="16383" man="1"/>`)
            .join("")}</rowBreaks>`
        : "";
    return { sheetDataXml: this.rowXmls.join(""), mergeCellsXml, rowBreaksXml };
  }
}

export { xmlEscapeText, formatDateFr, wrapRowHeight, SheetBuilder };
export type { CellSpec };
