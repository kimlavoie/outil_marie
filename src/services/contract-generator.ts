/**
 * contract-generator.ts - Builds a contract .xlsx from an activity's data and triggers a
 * download. This is a purpose-built document (not a fill-in-the-blanks copy of CONTRAT.xlsx —
 * see /public/CONTRAT.xlsx): only the pieces explicitly asked for are reused from that model
 * (the header image, the "Information du fournisseur" block, the insurance/urgency-procedure
 * initials lines, the cancellation/payment clause, the signature block, and the "Clauses de
 * location" as an appendix); everything else is a logical summary of the activity itself
 * (client identification, reservation details, financial breakdown from
 * computeActivityFinancials()).
 *
 * The workbook is hand-assembled with JSZip rather than through SheetJS: SheetJS's community
 * edition can't write real cell styling (fonts/fills/borders), and its writer also emits
 * malformed `t="str"` text cells — both cause Excel's "problem with content" repair prompt (see
 * git history for the full investigation). Styles here are instead *borrowed*: every cell
 * references one of CONTRAT.xlsx's existing, already-valid style ids (see contract-generator/
 * styles.ts's `S` map) for its font/fill/numFmt, so those are never invented or regenerated.
 * Borders are the one exception — see normalizeGridBorders()'s doc comment for why they're
 * patched into a handful of new, consistent styles instead of reused as-is.
 *
 * This file keeps only the zip/OOXML-package assembly (generateXlsx and its Content_Types/rels/
 * workbook.xml boilerplate); it's also a barrel re-exporting contract-generator/styles.ts,
 * static-content.ts, sheet-builder.ts and sheet-xml.ts under this original shared import path
 * (the same pattern used by src/services/backup/index.ts and
 * src/activities/reservations/index.ts) — split out because the original file mixed the
 * style-borrowing bookkeeping, static contract text, generic sheet-building helpers, and the
 * actual document layout in one 890+-line module.
 */
import JSZip from "jszip";
import { showToast } from "../utils/utils.ts";
import { xmlEscapeText } from "./contract-generator/sheet-builder.ts";
import { buildSheetXml, buildDrawingXml } from "./contract-generator/sheet-xml.ts";
import { normalizeGridBorders } from "./contract-generator/styles.ts";

const CONTRACT_TEMPLATE_PATH = "CONTRAT.xlsx";

async function generateXlsx(act: any, variant: "contrat" | "soumission") {
  const hasImage = variant === "contrat";

  let templateBuffer: ArrayBuffer;
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}${CONTRACT_TEMPLATE_PATH}`);
    if (!res.ok) throw new Error(String(res.status));
    templateBuffer = await res.arrayBuffer();
  } catch {
    showToast("Impossible de charger le gabarit de contrat (CONTRAT.xlsx).", "error");
    return;
  }

  const templateZip = await JSZip.loadAsync(templateBuffer);
  const stylesXmlRaw = await templateZip.file("xl/styles.xml")?.async("uint8array");
  const themeXml = await templateZip.file("xl/theme/theme1.xml")?.async("uint8array");
  const headerImage = hasImage ? await templateZip.file("xl/media/image2.png")?.async("uint8array") : undefined;
  if (!stylesXmlRaw || !themeXml || (hasImage && !headerImage)) {
    showToast("Le gabarit de contrat est invalide (styles ou image d'entête introuvables).", "error");
    return;
  }
  const stylesXml = normalizeGridBorders(stylesXmlRaw);

  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      (hasImage ? `<Default Extension="png" ContentType="image/png"/>` : "") +
      `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
      `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
      `<Override PartName="/xl/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>` +
      `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
      (hasImage
        ? `<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`
        : "") +
      `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>` +
      `<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>` +
      `</Types>`
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
      `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>` +
      `<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>` +
      `</Relationships>`
  );
  const docTitle = variant === "contrat" ? `Contrat ${act.id}` : `Soumission ${act.id}`;
  zip.file(
    "docProps/core.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">` +
      `<dc:title>${xmlEscapeText(docTitle)}</dc:title>` +
      `</cp:coreProperties>`
  );
  zip.file(
    "docProps/app.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Outil Marie</Application></Properties>`
  );
  zip.file(
    "xl/workbook.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
      `<sheets><sheet name="${variant === "contrat" ? "Contrat" : "Soumission"}" sheetId="1" r:id="rId1"/></sheets>` +
      `</workbook>`
  );
  zip.file(
    "xl/_rels/workbook.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
      `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
      `<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>` +
      `</Relationships>`
  );
  zip.file("xl/styles.xml", stylesXml);
  zip.file("xl/theme/theme1.xml", themeXml);
  if (hasImage) {
    zip.file("xl/media/image2.png", headerImage!);
    zip.file("xl/drawings/drawing1.xml", buildDrawingXml());
    zip.file(
      "xl/drawings/_rels/drawing1.xml.rels",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image2.png"/>` +
        `</Relationships>`
    );
  }
  zip.file("xl/worksheets/sheet1.xml", buildSheetXml(act, variant));
  if (hasImage) {
    zip.file(
      "xl/worksheets/_rels/sheet1.xml.rels",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>` +
        `</Relationships>`
    );
  }

  const blob = await zip.generateAsync({ type: "blob" });
  const prefix = variant === "contrat" ? "Contrat" : "Soumission";
  const filename = `${prefix}_${act.id}_${(act.name || "activite").replace(/[^\w-]+/g, "_")}.xlsx`;
  return { blob, filename };
}

async function generateContractXlsx(act: any) {
  return generateXlsx(act, "contrat");
}

async function generateSoumissionXlsx(act: any) {
  return generateXlsx(act, "soumission");
}

export { generateContractXlsx, generateSoumissionXlsx };
export { xmlEscapeText, formatDateFr, wrapRowHeight } from "./contract-generator/sheet-builder.ts";
export { buildSheetXml } from "./contract-generator/sheet-xml.ts";
