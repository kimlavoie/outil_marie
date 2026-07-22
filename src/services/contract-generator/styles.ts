/**
 * contract-generator/styles.ts - Borrowed-style bookkeeping: the S map of style ids (see doc
 * comment below) and normalizeGridBorders(), which patches xl/styles.xml so those borrowed
 * styles line up into clean grid boxes on this sheet's own 6-column layout. Split out of
 * contract-generator.ts (see that file for why it stays a barrel re-exporting this alongside
 * static-content.ts/sheet-builder.ts/sheet-xml.ts) — kept separate from the document-generation
 * logic (sheet-xml.ts) since it's purely about which style id a role points at, not what content
 * goes in the sheet.
 */

// Style ids borrowed from CONTRAT.xlsx's "Salle poly et SFB" sheet (xl/styles.xml is copied
// unmodified from that file, so these ids keep meaning exactly what they mean there).
const S = {
  sectionTitle: 78,
  sectionTitleAlt: 81,
  label: 29,
  value: 77,
  supplierLabel: 90,
  supplierValue: 70,
  neqValue: 70, // placeholder — overwritten by normalizeGridBorders() with a bottom border
  resLabel: 63,
  resValue: 96,
  resValueNumeric: 96, // placeholder — overwritten by normalizeGridBorders() with a general-format, bordered variant
  tableHeader: 94,
  currency: 75,
  wrapValue: 69, // left-aligned + wrapText — for values that can run long (address, description, item labels)
  attestation: 67,
  urgency: 52,
  initialsLabel: 42,
  cancelBody: 151,
  clauseGroup: 71,
  clauseNum: 22,
  clauseBody: 69,
  sigLabel: 35,
  sigName1: 154,
  sigName2: 156,
  billingLabel: 77,
  annexeTitle: 78,
  annexeClauseGroup: 71,
  annexeClauseNum: 22,
  annexeClauseBody: 69
};

// normalizeGridBorders() mutates S in place (see below) so buildSheetXml/buildDrawingXml always
// see the current call's style ids. But generateXlsx() can run more than once in the same page
// session (e.g. generating a contrat then a soumission without a reload) — without this snapshot,
// a second call would look up xfEntries using indices already remapped by the first call, indices
// that don't exist in that second call's freshly-fetched (unmutated) template, silently leaving S
// pointing at stale ids and corrupting the workbook (Excel's "repaired records" prompt).
const ORIGINAL_S: typeof S = { ...S };

const GRID_ROLE_KEYS = [
  "label",
  "value",
  "supplierLabel",
  "supplierValue",
  "resLabel",
  "resValue",
  "tableHeader",
  "currency",
  "wrapValue"
] as const;

// The borrowed styles' borders (see the S map) were each designed for CONTRAT.xlsx's own much
// wider merge geometry (17 columns, dozens of distinct cell spans) — borderId 6, 15, 16, 5, 2...
// are mostly one- or two-sided edges meant to butt up against a *specific* neighboring cell in
// that original layout. Reused as-is in this sheet's plain 6-column grid, those partial borders
// don't line up into clean boxes anymore. This patches xl/styles.xml to:
//   1. append one new, uniform thin-gray 4-sided border;
//   2. clone every "grid" role in the S map (labels/values/table headers/item cells) with that
//      border swapped in, keeping their original font/fill/numFmt/alignment untouched;
//   3. mutate S in place to point at the new, consistent indices.
// It also derives S.resValueNumeric (a general-number-format variant of the now-bordered
// S.resValue, for "Nombre de personnes prévu" — no existing style combines that box with a
// non-date number format).
function normalizeGridBorders(stylesXmlBytes: Uint8Array): Uint8Array {
  let xmlText = new TextDecoder("utf-8").decode(stylesXmlBytes);

  xmlText = xmlText.replace(/rgb="FFFF8B00"/g, 'rgb="FFD9E1F2"').replace(/rgb="FFFFC885"/g, 'rgb="FFF2F5FC"');

  xmlText = xmlText.replace(/borderId="\d+"/g, 'borderId="0"');

  const bordersMatch = xmlText.match(/<borders count="(\d+)">/);
  const cellXfsMatch = xmlText.match(/<cellXfs count="(\d+)">([\s\S]*?)<\/cellXfs>/);
  if (!bordersMatch || !cellXfsMatch) return stylesXmlBytes;

  const borderCount = parseInt(bordersMatch[1], 10);
  const newBorder = `<border><left/><right/><top/><bottom/><diagonal/></border>`;
  xmlText = xmlText
    .replace(`<borders count="${borderCount}">`, `<borders count="${borderCount + 1}">`)
    .replace("</borders>", `${newBorder}</borders>`);

  const xfCount = parseInt(cellXfsMatch[1], 10);
  const xfEntries = cellXfsMatch[2].match(/<xf\b[^>]*\/>|<xf\b[^>]*>[\s\S]*?<\/xf>/g) || [];

  const cleanFill = (xf: string) => {
    if (!xf) return xf;
    let clean = xf.replace(/fillId="\d+"/, 'fillId="0"');
    clean = clean.replace(/applyFill="1"/, 'applyFill="0"');
    return clean;
  };

  const withCenterVerticalAlignment = (xf: string) => {
    let clone = xf;
    if (/applyAlignment="\d"/.test(clone)) {
      clone = clone.replace(/applyAlignment="\d"/, 'applyAlignment="1"');
    } else {
      clone = clone.replace("<xf ", '<xf applyAlignment="1" ');
    }
    if (/<alignment\b/.test(clone)) {
      if (/vertical="\w+"/.test(clone)) {
        clone = clone.replace(/vertical="\w+"/, 'vertical="center"');
      } else {
        clone = clone.replace("<alignment ", '<alignment vertical="center" ');
      }
    } else {
      if (clone.endsWith("/>")) {
        clone = clone.slice(0, -2) + '><alignment vertical="center"/></xf>';
      } else {
        clone = clone.replace("</xf>", '<alignment vertical="center"/></xf>');
      }
    }
    return clone;
  };

  if (xfEntries[67]) xfEntries[67] = withCenterVerticalAlignment(cleanFill(xfEntries[67]));
  if (xfEntries[52]) xfEntries[52] = withCenterVerticalAlignment(cleanFill(xfEntries[52]));
  if (xfEntries[42]) xfEntries[42] = withCenterVerticalAlignment(cleanFill(xfEntries[42]));

  const withNewBorder = (xf: string) => {
    let clone = /applyBorder="\d"/.test(xf)
      ? xf.replace(/applyBorder="\d"/, 'applyBorder="0"')
      : xf.replace("<xf ", '<xf applyBorder="0" ');
    clone = /borderId="\d+"/.test(clone) ? clone.replace(/borderId="\d+"/, `borderId="0"`) : clone.replace("<xf ", `<xf borderId="0" `);
    return clone;
  };

  const withBottomBorder = (xf: string) => {
    let clone = xf;
    if (/applyBorder="\d"/.test(clone)) {
      clone = clone.replace(/applyBorder="\d"/, 'applyBorder="1"');
    } else {
      clone = clone.replace("<xf ", '<xf applyBorder="1" ');
    }
    if (/borderId="\d+"/.test(clone)) {
      clone = clone.replace(/borderId="\d+"/, 'borderId="1"');
    } else {
      clone = clone.replace("<xf ", '<xf borderId="1" ');
    }
    return clone;
  };

  const newEntries: string[] = [];
  let nextIndex = xfCount;
  let borderedResValue = "";
  GRID_ROLE_KEYS.forEach(key => {
    const original = xfEntries[ORIGINAL_S[key]];
    if (!original) return;
    const clone = withNewBorder(original);
    newEntries.push(clone);
    S[key] = nextIndex;
    if (key === "resValue") borderedResValue = clone;
    nextIndex++;
  });

  if (borderedResValue) {
    newEntries.push(borderedResValue.replace(/numFmtId="\d+"/, 'numFmtId="0"'));
    S.resValueNumeric = nextIndex;
    nextIndex++;
  }

  const withRightAlignment = (xf: string) => {
    let clone = xf;
    if (/applyAlignment="\d"/.test(clone)) {
      clone = clone.replace(/applyAlignment="\d"/, 'applyAlignment="1"');
    } else {
      clone = clone.replace("<xf ", '<xf applyAlignment="1" ');
    }
    if (/<alignment\b/.test(clone)) {
      if (/horizontal="\w+"/.test(clone)) {
        clone = clone.replace(/horizontal="\w+"/, 'horizontal="right"');
      } else {
        clone = clone.replace("<alignment ", '<alignment horizontal="right" ');
      }
    } else {
      if (clone.endsWith("/>")) {
        clone = clone.slice(0, -2) + '><alignment horizontal="right"/></xf>';
      } else {
        clone = clone.replace("</xf>", '<alignment horizontal="right"/></xf>');
      }
    }
    return clone;
  };

  const originalValueXf = xfEntries[ORIGINAL_S.value];
  if (originalValueXf) {
    const valueWithBorder = withNewBorder(originalValueXf);
    const rightAligned = withRightAlignment(valueWithBorder);
    newEntries.push(rightAligned);
    S.billingLabel = nextIndex;
    nextIndex++;
  }

  const originalNeqValueXf = xfEntries[ORIGINAL_S.neqValue];
  if (originalNeqValueXf) {
    const valueWithBottomBorder = withBottomBorder(originalNeqValueXf);
    newEntries.push(valueWithBottomBorder);
    S.neqValue = nextIndex;
    nextIndex++;
  }

  const withTopAlignment = (xf: string) => {
    let clone = xf;
    if (/applyAlignment="\d"/.test(clone)) {
      clone = clone.replace(/applyAlignment="\d"/, 'applyAlignment="1"');
    } else {
      clone = clone.replace("<xf ", '<xf applyAlignment="1" ');
    }
    if (/<alignment\b/.test(clone)) {
      if (/vertical="\w+"/.test(clone)) {
        clone = clone.replace(/vertical="\w+"/, 'vertical="top"');
      } else {
        clone = clone.replace("<alignment ", '<alignment vertical="top" ');
      }
    } else {
      if (clone.endsWith("/>")) {
        clone = clone.slice(0, -2) + '><alignment vertical="top"/></xf>';
      } else {
        clone = clone.replace("</xf>", '<alignment vertical="top"/></xf>');
      }
    }
    return clone;
  };

  const annexeKeys = [
    "annexeTitle",
    "annexeClauseGroup",
    "annexeClauseNum",
    "annexeClauseBody"
  ] as const;

  annexeKeys.forEach(key => {
    const original = xfEntries[ORIGINAL_S[key]];
    if (!original) return;
    const clone = withTopAlignment(original);
    newEntries.push(clone);
    S[key] = nextIndex;
    nextIndex++;
  });

  const patchedBody = xfEntries.join("") + newEntries.join("");
  xmlText = xmlText.replace(cellXfsMatch[0], `<cellXfs count="${nextIndex}">${patchedBody}</cellXfs>`);
  return new TextEncoder().encode(xmlText);
}

export { S, normalizeGridBorders };
