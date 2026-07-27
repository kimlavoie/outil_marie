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
  currencyBold: 75, // placeholder — overwritten by normalizeGridBorders() with a bold variant
  currencyLarge: 75, // placeholder — overwritten by normalizeGridBorders() with a 16pt bold variant
  wrapValue: 69, // left-aligned + wrapText — for values that can run long (address, description, item labels)
  linkedRoomNote: 69, // placeholder — overwritten by normalizeGridBorders() with a vertically centered variant
  attestation: 67,
  urgency: 52,
  initialsLabel: 42,
  cancelBody: 151,
  clauseGroup: 71,
  clauseNum: 22,
  clauseBody: 69,
  sigLabel: 35,
  sigBlank: 35, // deliberately left unbolded/unmodified (see normalizeGridBorders) — for blank
  // filler/spacer cells around the signature block (not label text, not touched by the bold pass)
  sigName1: 154,
  sigName2: 156,
  sigLineName1: 154, // placeholder — overwritten by normalizeGridBorders() with a dark top border
  sigLineName2: 156, // placeholder — overwritten by normalizeGridBorders() with a dark top border
  sigLineClient: 35, // placeholder — overwritten by normalizeGridBorders() with a dark top border + centered text
  billingLabel: 77,
  billingLabelLarge: 77, // placeholder — overwritten by normalizeGridBorders() with a 16pt bold variant
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
  const fontsMatch = xmlText.match(/<fonts count="(\d+)"[^>]*>([\s\S]*?)<\/fonts>/);
  if (!bordersMatch || !cellXfsMatch) return stylesXmlBytes;

  // Bold clones of whichever fonts the Signatures section's label/name styles already use — the
  // "Date:"/"Prénom :"/"Nom :"/"Signature" labels and the two signatories' printed names all need
  // to render bold. Cloning the font (rather than mutating it in place) keeps every other cell
  // that happens to share the same font/size untouched.
  const fontEntries = fontsMatch ? fontsMatch[2].match(/<font\b[^>]*\/>|<font\b[^>]*>[\s\S]*?<\/font>/g) || [] : [];
  const boldFontIdCache = new Map<number, number>();
  const newFontEntries: string[] = [];
  let nextFontIndex = fontsMatch ? parseInt(fontsMatch[1], 10) : 0;
  const boldFontIdFor = (originalFontId: number) => {
    if (boldFontIdCache.has(originalFontId)) return boldFontIdCache.get(originalFontId)!;
    const original = fontEntries[originalFontId];
    if (!original) return originalFontId;
    const bold = /<b\/>/.test(original) ? original : original.replace(/^<font(\s*)>/, "<font$1><b/>");
    newFontEntries.push(bold);
    const newId = nextFontIndex++;
    boldFontIdCache.set(originalFontId, newId);
    return newId;
  };
  const withBoldFont = (xf: string) => {
    const fontIdMatch = xf.match(/fontId="(\d+)"/);
    const originalFontId = fontIdMatch ? parseInt(fontIdMatch[1], 10) : 0;
    const boldId = boldFontIdFor(originalFontId);
    return fontIdMatch ? xf.replace(/fontId="\d+"/, `fontId="${boldId}"`) : xf.replace("<xf ", `<xf fontId="${boldId}" `);
  };

  const largeBoldFontIdCache = new Map<string, number>();
  const largeBoldFontIdFor = (originalFontId: number, targetSize = 16) => {
    const key = `${originalFontId}_${targetSize}`;
    if (largeBoldFontIdCache.has(key)) return largeBoldFontIdCache.get(key)!;
    const original = fontEntries[originalFontId] || `<font><sz val="11"/><rFont val="Calibri"/></font>`;
    let modified = /<b\/>/.test(original) ? original : original.replace(/^<font(\s*)>/, "<font$1><b/>");
    if (/<sz\s+val="\d+"\s*\/>/.test(modified)) {
      modified = modified.replace(/<sz\s+val="\d+"\s*\/>/, `<sz val="${targetSize}"/>`);
    } else {
      modified = modified.replace(/^<font(\s*)>/, `<font$1><sz val="${targetSize}"/>`);
    }
    newFontEntries.push(modified);
    const newId = nextFontIndex++;
    largeBoldFontIdCache.set(key, newId);
    return newId;
  };

  const withLargeBoldFont = (xf: string, targetSize = 16) => {
    const fontIdMatch = xf.match(/fontId="(\d+)"/);
    const originalFontId = fontIdMatch ? parseInt(fontIdMatch[1], 10) : 0;
    const largeBoldId = largeBoldFontIdFor(originalFontId, targetSize);
    return fontIdMatch ? xf.replace(/fontId="\d+"/, `fontId="${largeBoldId}"`) : xf.replace("<xf ", `<xf fontId="${largeBoldId}" `);
  };

  const borderCount = parseInt(bordersMatch[1], 10);
  const newBorder = `<border><left/><right/><top/><bottom/><diagonal/></border>`;
  // A dedicated dark top border for the signature line — deliberately distinct from the pale
  // gray automatic gridlines the rest of this sheet uses, since it needs to read as an
  // intentional "sign here" rule rather than an ordinary cell edge.
  const sigLineBorder = `<border><left/><right/><top style="medium"><color rgb="FF000000"/></top><bottom/><diagonal/></border>`;
  const sigLineBorderId = borderCount + 1;
  xmlText = xmlText
    .replace(`<borders count="${borderCount}">`, `<borders count="${borderCount + 2}">`)
    .replace("</borders>", `${newBorder}${sigLineBorder}</borders>`);

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

  const withTopLeftAlignment = (xf: string) => {
    let clone = xf;
    if (/applyAlignment="\d"/.test(clone)) {
      clone = clone.replace(/applyAlignment="\d"/, 'applyAlignment="1"');
    } else {
      clone = clone.replace("<xf ", '<xf applyAlignment="1" ');
    }
    if (/<alignment\b/.test(clone)) {
      if (/horizontal="\w+"/.test(clone)) {
        clone = clone.replace(/horizontal="\w+"/, 'horizontal="left"');
      } else {
        clone = clone.replace("<alignment ", '<alignment horizontal="left" ');
      }
      if (/vertical="\w+"/.test(clone)) {
        clone = clone.replace(/vertical="\w+"/, 'vertical="top"');
      } else {
        clone = clone.replace("<alignment ", '<alignment vertical="top" ');
      }
      if (/wrapText="\d+"/.test(clone)) {
        clone = clone.replace(/wrapText="\d+"/, 'wrapText="1"');
      } else {
        clone = clone.replace("<alignment ", '<alignment wrapText="1" ');
      }
    } else {
      if (clone.endsWith("/>")) {
        clone = clone.slice(0, -2) + '><alignment horizontal="left" vertical="top" wrapText="1"/></xf>';
      } else {
        clone = clone.replace("</xf>", '<alignment horizontal="left" vertical="top" wrapText="1"/></xf>');
      }
    }
    return clone;
  };

  const newEntries: string[] = [];
  let nextIndex = xfCount;
  let borderedResValue = "";
  GRID_ROLE_KEYS.forEach(key => {
    const original = xfEntries[ORIGINAL_S[key]];
    if (!original) return;
    let clone = withNewBorder(original);
    if (key === "resLabel" || key === "resValue") {
      clone = withTopLeftAlignment(clone);
    }
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

  const wrapValueIndex = GRID_ROLE_KEYS.indexOf("wrapValue");
  if (wrapValueIndex !== -1 && newEntries[wrapValueIndex]) {
    const wrapValueBorderedXf = newEntries[wrapValueIndex];
    newEntries.push(withCenterVerticalAlignment(wrapValueBorderedXf));
    S.linkedRoomNote = nextIndex;
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

    newEntries.push(withLargeBoldFont(rightAligned, 16));
    S.billingLabelLarge = nextIndex;
    nextIndex++;
  }

  const currencyIndex = GRID_ROLE_KEYS.indexOf("currency");
  if (currencyIndex !== -1 && newEntries[currencyIndex]) {
    const currencyXf = newEntries[currencyIndex];
    newEntries.push(withBoldFont(currencyXf));
    S.currencyBold = nextIndex;
    nextIndex++;

    newEntries.push(withLargeBoldFont(currencyXf, 16));
    S.currencyLarge = nextIndex;
    nextIndex++;
  }

  const originalNeqValueXf = xfEntries[ORIGINAL_S.neqValue];
  if (originalNeqValueXf) {
    const valueWithBottomBorder = withBottomBorder(originalNeqValueXf);
    newEntries.push(valueWithBottomBorder);
    S.neqValue = nextIndex;
    nextIndex++;
  }

  // Dark top border for the two signature lines (see sigLineBorder above) — the fournisseur's two
  // signatories (sigName1/sigName2) each get their own line above their printed name; the client's
  // line sits one row down, above the "Signature" caption, so it's cloned from sigLabel with
  // horizontal centering added instead.
  const withTopBorder = (xf: string) => {
    let clone = /applyBorder="\d"/.test(xf)
      ? xf.replace(/applyBorder="\d"/, 'applyBorder="1"')
      : xf.replace("<xf ", '<xf applyBorder="1" ');
    clone = /borderId="\d+"/.test(clone)
      ? clone.replace(/borderId="\d+"/, `borderId="${sigLineBorderId}"`)
      : clone.replace("<xf ", `<xf borderId="${sigLineBorderId}" `);
    return clone;
  };

  const withCenterHorizontal = (xf: string) => {
    let clone = xf;
    if (/applyAlignment="\d"/.test(clone)) {
      clone = clone.replace(/applyAlignment="\d"/, 'applyAlignment="1"');
    } else {
      clone = clone.replace("<xf ", '<xf applyAlignment="1" ');
    }
    if (/<alignment\b/.test(clone)) {
      if (/horizontal="\w+"/.test(clone)) {
        clone = clone.replace(/horizontal="\w+"/, 'horizontal="center"');
      } else {
        clone = clone.replace("<alignment ", '<alignment horizontal="center" ');
      }
    } else {
      if (clone.endsWith("/>")) {
        clone = clone.slice(0, -2) + '><alignment horizontal="center"/></xf>';
      } else {
        clone = clone.replace("</xf>", '<alignment horizontal="center"/></xf>');
      }
    }
    return clone;
  };

  const originalSigName1Xf = xfEntries[ORIGINAL_S.sigName1];
  if (originalSigName1Xf) {
    newEntries.push(withBoldFont(withTopBorder(originalSigName1Xf)));
    S.sigLineName1 = nextIndex;
    nextIndex++;
  }

  const originalSigName2Xf = xfEntries[ORIGINAL_S.sigName2];
  if (originalSigName2Xf) {
    newEntries.push(withBoldFont(withTopBorder(originalSigName2Xf)));
    S.sigLineName2 = nextIndex;
    nextIndex++;
  }

  const originalSigLabelXf = xfEntries[ORIGINAL_S.sigLabel];
  if (originalSigLabelXf) {
    newEntries.push(withBoldFont(withTopBorder(withCenterHorizontal(originalSigLabelXf))));
    S.sigLineClient = nextIndex;
    nextIndex++;

    // The plain "Date:"/"Prénom :"/"Nom :" labels (and blank filler cells sharing this style)
    // also need to render bold — bold has no visible effect on the blank ones.
    newEntries.push(withBoldFont(originalSigLabelXf));
    S.sigLabel = nextIndex;
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

  const annexeKeys = ["annexeTitle", "annexeClauseGroup", "annexeClauseNum", "annexeClauseBody"] as const;

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

  if (fontsMatch && newFontEntries.length > 0) {
    const openTag = fontsMatch[0].match(/^<fonts[^>]*>/)![0].replace(/count="\d+"/, `count="${nextFontIndex}"`);
    xmlText = xmlText.replace(fontsMatch[0], `${openTag}${fontsMatch[2]}${newFontEntries.join("")}</fonts>`);
  }

  return new TextEncoder().encode(xmlText);
}

export { S, normalizeGridBorders };
