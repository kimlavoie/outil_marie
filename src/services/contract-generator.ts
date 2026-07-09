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
 * references one of CONTRAT.xlsx's existing, already-valid style ids (see the `S` map) for its
 * font/fill/numFmt, so those are never invented or regenerated. Borders are the one exception —
 * see normalizeGridBorders()'s doc comment for why they're patched into a handful of new,
 * consistent styles instead of reused as-is.
 */
import JSZip from "jszip";
import { computeActivityFinancials } from "../activities/financials.ts";
import { getAggregateEventDates } from "../activities/reservations.ts";
import { getReservationRoomLabel, showToast } from "../utils/utils.ts";
import { appState, getActiveSalaryRate, getActiveSalaryOvertimeRate, getActiveServiceRate } from "../state/state.ts";

const CONTRACT_TEMPLATE_PATH = "CONTRAT.xlsx";

// Sheet layout: 6 equal-width columns (A:F) — reused both for <cols> and to size the header
// image so it spans exactly the same width as the rest of the sheet (see buildDrawingXml).
const SHEET_COLS = 6;
const COL_WIDTH_UNITS = 22;

// Original header image dimensions (CONTRAT.xlsx's drawing2.xml, "Image 3") in EMU.
const SOURCE_IMAGE_WIDTH_EMU = 16138070;
const SOURCE_IMAGE_HEIGHT_EMU = 2777553;

// Scales the header image down to exactly the sheet's own column width (it was originally sized
// for a much wider ~17-column sheet) instead of overflowing past column F. Excel's column width
// unit is ~7px/unit at the 11pt reference font (see wrapRowHeight's doc comment); 1px = 9525 EMU.
const IMAGE_WIDTH_EMU = SHEET_COLS * (COL_WIDTH_UNITS * 7 + 5) * 9525;
const IMAGE_HEIGHT_EMU = Math.round((IMAGE_WIDTH_EMU * SOURCE_IMAGE_HEIGHT_EMU) / SOURCE_IMAGE_WIDTH_EMU);
// How many default-height (15pt) blank rows the scaled-down image now covers, plus a small margin.
const IMAGE_ROW_SPAN = Math.ceil(IMAGE_HEIGHT_EMU / 12700 / 15) + 1;

// Style ids borrowed from CONTRAT.xlsx's "Salle poly et SFB" sheet (xl/styles.xml is copied
// unmodified from that file, so these ids keep meaning exactly what they mean there).
const S = {
  sectionTitle: 78, // dark blue banner, e.g. "Identification du client"
  sectionTitleAlt: 81, // lighter blue banner, e.g. "Fournisseur" / "Fournisseur" signature header
  label: 29,
  value: 77,
  supplierLabel: 90,
  supplierValue: 70,
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
  sigName2: 156
};

// Static "Information du fournisseur" block (CONTRAT.xlsx E19:J24) — the Cégep's own contact
// info, constant across every contract.
const SUPPLIER = {
  org: "Cégep de Jonquière",
  responsable: "Marie-Ève Bouchard",
  address: "2505 rue Saint-Hubert, G7X 7W2, Jonquière, QC",
  phone: "418-547-2191 poste 6232",
  email: "servicescommunautaires@cegepjonquiere.ca"
};

// Static attestation/initials lines (CONTRAT.xlsx A27:D29).
const ATTESTATIONS = [
  "Je confirme avoir envoyé une attestation d'assurance responsabilité civile",
  "Je confirme avoir pris connaissance des actions à faire en cas d'urgence, expliqué dans le lien suivant : https://www.cegepjonquiere.ca/situations-d-urgence.html"
];

// Static cancellation/payment clause (CONTRAT.xlsx C71), reproduced verbatim.
const CANCELLATION_CLAUSE =
  "Paiement anticipé\n" +
  "Un acompte équivalant à 50 % des coûts estimés est exigible 30 jours avant la date de l’évènement. À défaut de réception de ce paiement dans les délais, la réservation sera automatiquement annulée sans préavis.\n\n" +
  "Frais d’annulation\n" +
  "En cas d’annulation par le client, les frais suivants seront facturés en fonction de la date de notification écrite de l’annulation :\n" +
  "- 31 jours ouvrables et plus avant l'activité : 25% du montant total\n" +
  "- 30 jours ouvrables avant l'activité : 50 % du montant total \n" +
  "- 15 jours ouvrables ou moins avant l'activité : 100 % du montant total\n\n" +
  "Solde final\n" +
  "Le solde de la facture est payable sur réception, sauf entente contraire convenue par écrit entre les parties.";

// Static "Clauses de location" appendix (CONTRAT.xlsx A76:A133), reproduced verbatim.
const LOCATION_CLAUSE_GROUPS: { title: string; clauses: { num: number; body: string }[] }[] = [
  {
    title: "Communication et image",
    clauses: [
      { num: 1, body: "Le locataire n’est pas autorisé à utiliser l’image du Cégep de Jonquière à des fins publicitaires ou dans toute autre forme de communication." },
      {
        num: 2,
        body: "Le Cégep de Jonquière n’est en aucun cas affilié aux activités du locataire. Il est donc interdit d’utiliser son nom dans toute communication, qu’elle soit écrite ou verbale. Seuls le nom de la salle et l’adresse civique peuvent être mentionnés pour indiquer le lieu de l’activité."
      },
      { num: 3, body: "Une exception à la clause 2 s’applique uniquement aux projets réalisés en partenariat officiel avec le Cégep de Jonquière." }
    ]
  },
  {
    title: "Utilisation des lieux",
    clauses: [
      { num: 4, body: "Le locataire doit remettre les lieux loués dans le même état qu’à leur prise de possession." },
      {
        num: 5,
        body: "Le coût de la location inclut l’usage du local ainsi que du mobilier permanent qui s’y trouve. Toute demande d’équipement supplémentaire (ex. : matériel audiovisuel, mobilier additionnel, etc.) est à la charge du locataire et doit être approuvée par le Cégep de Jonquière."
      },
      {
        num: 6,
        body: "Toute utilisation non conforme à la demande de réservation ou au contrat, toute sous-location ou cession à un tiers peut entraîner l’annulation immédiate du contrat sans remboursement du dépôt, le cas échéant."
      },
      {
        num: 7,
        body: "En cas de force majeure, le Cégep de Jonquière peut mettre fin à la location sur simple avis au locataire. Dans une telle situation, un remboursement de l’acompte versé pourra être envisagé, selon l’évaluation du contexte et des frais déjà engagés."
      },
      { num: 8, body: "Le Cégep se réserve le droit d’annuler toute location qui pourrait nuire au bon déroulement des activités étudiantes." },
      { num: 9, body: "En cas d’intempéries, le locataire doit vérifier sur le site du Cégep si l’établissement est ouvert." }
    ]
  },
  {
    title: "Paiement et frais",
    clauses: [
      {
        num: 10,
        body: "Le locataire accepte de payer tous les frais additionnels liés à la location, y compris ceux non prévus au contrat initial. Les coûts présentés dans le présent contrat sont fournis à titre estimatif et pourront être ajustés en fonction des besoins réels et spécifiques de l’événement."
      },
      { num: 11, body: "Le Cégep de Jonquière peut résilier le contrat si les paiements ne sont pas effectués selon les modalités convenues." },
      { num: 12, body: "Des frais d’administration de 50 $ seront ajoutés pour tout chèque retourné pour provision insuffisante." },
      { num: 13, body: "Les factures sont payables dès leur réception." },
      { num: 14, body: "Les paiements doivent être effectués par carte ou par chèque. Les paiements en argent comptant ne sont pas acceptés." }
    ]
  },
  {
    title: "Responsabilités et assurances",
    clauses: [
      {
        num: 15,
        body: "Le locataire est responsable de tout dommage causé à la propriété ou à autrui par lui-même, ses représentants, les participants ou tout tiers, et s’engage à indemniser le Cégep de Jonquière en conséquence."
      },
      {
        num: 16,
        body: "Le locataire est responsable de tout dommage causé par lui-même, ses employés, agents, représentants ou sous-traitants pendant la durée du contrat, y compris en cas de manquement à ses engagements."
      },
      {
        num: 17,
        body: "Le locataire s’engage à indemniser et défendre le Cégep, ses dirigeants, employés et représentants contre toute réclamation ou poursuite liée à des dommages causés, incluant les infractions à la Loi sur la santé publique (chapitre S-2.2)."
      },
      { num: 18, body: "Le locataire doit fournir une attestation d’assurance au Cégep au moins 20 jours ouvrables avant l’activité." },
      {
        num: 19,
        body: "Le Cégep peut résilier le contrat si le comportement du locataire, de ses représentants ou des participants compromet la sécurité physique ou psychologique des personnes présentes, ou va à l’encontre des valeurs de l’établissement."
      }
    ]
  },
  {
    title: "Règlements et conformité",
    clauses: [
      { num: 20, body: "Le Cégep de Jonquière se réserve le droit de vérifier la nature de l’activité mentionnée dans la demande de location." },
      {
        num: 21,
        body: "Le Cégep peut émettre des directives aux locataires, qui sont tenus de les respecter. Par exemple, il peut exiger la tenue d’un registre des inscriptions et sa transmission."
      },
      {
        num: 22,
        body: "Le locataire s’engage à respecter les lois et règlements en vigueur (fédéraux, provinciaux et municipaux) et à obtenir tous les permis nécessaires à la tenue de son activité."
      },
      {
        num: 23,
        body: "Les politiques et règlements du Cégep doivent être respectés par le locataire, ses représentants, les participants et tout tiers impliqué. En cas de non-respect, le Cégep peut résilier le contrat sans préavis. Ces documents sont disponibles sur le site officiel : https://www.cegepjonquiere.ca/politiques-et-reglements.html"
      },
      {
        num: 24,
        body: "Toutes les mesures sanitaires exigées par la santé publique et le Cégep doivent être respectées. En cas de non-respect, le contrat peut être résilié sans préavis ni remboursement."
      }
    ]
  },
  {
    title: "Services techniques et obligations liées aux droits d'auteur",
    clauses: [
      {
        num: 25,
        body: "Pour tout événement comportant une prestation musicale, la gestion des droits d’auteur (ex. SOCAN) relève entièrement du responsable de l’activité ou du producteur. Le Cégep ne peut être tenu responsable à cet égard."
      },
      {
        num: 26,
        body:
          "La location de la Salle François-Brassard ou la Salle Polyvalente comprend les services du directeur technique (DT) attitré à la salle, qui accompagne le locataire dans la coordination des aspects techniques de l’événement. Le locataire est invité à communiquer directement avec les compagnies spécialisées (sonorisation, éclairage, vidéo, etc.) afin d’obtenir des soumissions et de choisir les fournisseurs avec lesquels il souhaite collaborer.\n\n" +
          "Afin d’assurer une organisation fluide et efficace, les éléments suivants doivent être respectés :\n" +
          "- Le nom de la compagnie ou du personnel spécialisé retenu doit être transmis au Cégep de Jonquière au moins 30 jours ouvrables avant l’événement à l'adresse suivante : remihould@cegepjonquiere.ca\n" +
          "- Une rencontre ou un échange doit avoir lieu entre le directeur technique et le fournisseur ou technicien embauché, afin de finaliser les aspects techniques et logistiques de l’événement."
      }
    ]
  }
];

function xmlEscapeText(str: string) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

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
const GRID_ROLE_KEYS = ["label", "value", "supplierLabel", "supplierValue", "resLabel", "resValue", "tableHeader", "currency", "wrapValue"] as const;

function normalizeGridBorders(stylesXmlBytes: Uint8Array): Uint8Array {
  let xmlText = new TextDecoder("utf-8").decode(stylesXmlBytes);

  const bordersMatch = xmlText.match(/<borders count="(\d+)">/);
  const cellXfsMatch = xmlText.match(/<cellXfs count="(\d+)">([\s\S]*?)<\/cellXfs>/);
  if (!bordersMatch || !cellXfsMatch) return stylesXmlBytes;

  const borderCount = parseInt(bordersMatch[1], 10);
  const thin = `<color rgb="FFB7B7B7"/>`;
  const newBorder = `<border><left style="thin">${thin}</left><right style="thin">${thin}</right><top style="thin">${thin}</top><bottom style="thin">${thin}</bottom><diagonal/></border>`;
  xmlText = xmlText
    .replace(`<borders count="${borderCount}">`, `<borders count="${borderCount + 1}">`)
    .replace("</borders>", `${newBorder}</borders>`);
  const newBorderId = borderCount;

  const xfCount = parseInt(cellXfsMatch[1], 10);
  const xfEntries = cellXfsMatch[2].match(/<xf\b[^>]*\/>|<xf\b[^>]*>[\s\S]*?<\/xf>/g) || [];

  const withNewBorder = (xf: string) => {
    let clone = /applyBorder="\d"/.test(xf) ? xf.replace(/applyBorder="\d"/, 'applyBorder="1"') : xf.replace("<xf ", '<xf applyBorder="1" ');
    clone = /borderId="\d+"/.test(clone) ? clone.replace(/borderId="\d+"/, `borderId="${newBorderId}"`) : clone.replace("<xf ", `<xf borderId="${newBorderId}" `);
    return clone;
  };

  const newEntries: string[] = [];
  let nextIndex = xfCount;
  let borderedResValue = "";
  GRID_ROLE_KEYS.forEach(key => {
    const original = xfEntries[S[key]];
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

  const patchedBody = cellXfsMatch[2] + newEntries.join("");
  xmlText = xmlText.replace(cellXfsMatch[0], `<cellXfs count="${nextIndex}">${patchedBody}</cellXfs>`);
  return new TextEncoder().encode(xmlText);
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
  const lineHeight = fontSize * 1.35;
  const lines = text.split("\n").reduce((sum, seg) => sum + Math.max(1, Math.ceil(seg.length / charsPerLine)), 0);
  return Math.max(20, Math.round(lines * lineHeight + 8));
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

  titleRow(text: string) {
    this.addRow(wrapRowHeight(text, 132, 20), [{ col: "A", style: S.sectionTitle, value: text, mergeTo: "F" }]);
  }

  // Long/multi-line values (address, description...) switch to a wrap-enabled style and get a
  // row height sized to their content — otherwise they'd get visually clipped by neighboring
  // cells at the default single-line row height.
  labelRow(label: string, value: string | number | undefined, labelStyle = S.label, valueStyle = S.value) {
    if (value === undefined || value === "") return;
    const isLong = typeof value === "string" && (value.length > 40 || value.includes("\n"));
    const effectiveStyle = isLong ? S.wrapValue : valueStyle;
    // C:F is 4 of the sheet's 6 columns (see buildSheetXml's <cols>, each 22 units wide).
    const height = isLong ? wrapRowHeight(value as string, 88) : null;
    this.addRow(height, [
      { col: "A", style: labelStyle, value: label, mergeTo: "B" },
      { col: "C", style: effectiveStyle, value, mergeTo: "F" }
    ]);
  }

  textBoxRow(text: string, style: number, fontSize = 16) {
    // A:F is the full 6-column width (see buildSheetXml's <cols>).
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
    // A:B is 2 of the sheet's 6 columns (see buildSheetXml's <cols>).
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
    return { sheetDataXml: this.rowXmls.join(""), mergeCellsXml };
  }
}

function formatDateFr(iso: string) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function buildSheetXml(act: any) {
  const sb = new SheetBuilder();
  const manager = act.activity_manager || {};

  // The header image (a fixed-size floating drawing, see buildDrawingXml) covers these rows
  // regardless of row height — leave them empty so content starts right below it.
  sb.blankRows(IMAGE_ROW_SPAN);

  sb.labelRow("N° de contrat", act.id);
  sb.blankRows(1);

  sb.titleRow("Identification du client");
  sb.labelRow("Responsable de l'activité", `${manager.first_name || ""} ${manager.last_name || ""}`.trim() || undefined);
  sb.labelRow("Responsable de la facturation", `${act.responsable_first_name || ""} ${act.responsable_last_name || ""}`.trim() || undefined);
  const addressLines = [manager.address, [manager.city, manager.province, manager.postal_code].filter(Boolean).join(" ")].filter(Boolean).join("\n");
  sb.labelRow("Adresse", addressLines || undefined);
  sb.labelRow("Téléphone", manager.phone);
  sb.labelRow("Courriel", manager.email);
  sb.blankRows(1);

  sb.titleRow("Information du fournisseur");
  sb.labelRow("Nom de l'organisme", SUPPLIER.org, S.supplierLabel, S.supplierValue);
  sb.labelRow("Responsable", SUPPLIER.responsable, S.supplierLabel, S.supplierValue);
  sb.labelRow("Adresse", SUPPLIER.address, S.supplierLabel, S.supplierValue);
  sb.labelRow("Téléphone", SUPPLIER.phone, S.supplierLabel, S.supplierValue);
  sb.labelRow("Courriel", SUPPLIER.email, S.supplierLabel, S.supplierValue);
  sb.blankRows(1);

  sb.titleRow("Détail de la réservation");
  const reservations = act.reservations || [];
  // Spans every room's slots, not just one — the activity's overall reservation period.
  const dates = getAggregateEventDates(reservations);
  const dateStr =
    dates.date_start === dates.date_end ? formatDateFr(dates.date_start) : `${formatDateFr(dates.date_start)} - ${formatDateFr(dates.date_end)}`;
  sb.labelRow("Date de la réservation", dateStr || undefined, S.resLabel, S.resValue);
  sb.labelRow("Titre de l'activité", act.name, S.resLabel, S.resValue);
  sb.labelRow("Description", act.description, S.resLabel, S.resValue);
  sb.labelRow("Nombre de personnes prévu", act.attendees_count || undefined, S.resLabel, S.resValueNumeric);
  sb.blankRows(1);

  const eventDateStart = dates.date_start;

  // One block per room: its own reserved slots (date/heures), rate, and the staff/equipment/fees
  // tied to that specific room — mirrors how the app itself organizes a reservation's sub-rows.
  if (reservations.length > 0) {
    sb.titleRow("Salles réservées");
    reservations.forEach((r: any) => {
      sb.subHeader(getReservationRoomLabel(r) || "(salle non définie)");

      const slots = r.slots || [];
      if (slots.length > 0) {
        sb.itemTableHeader("Date", "Début", "Fin", "");
        slots.forEach((slot: any) => {
          sb.detailRow(formatDateFr(slot.date) || "?", slot.start_time || "?", slot.end_time || "?", "");
        });
      }
      if (r.install?.start_time || r.install?.end_time) {
        sb.detailRow("Installation", r.install.start_time || "?", r.install.end_time || "?", "");
      }
      if (r.dismantle?.start_time || r.dismantle?.end_time) {
        sb.detailRow("Démontage", r.dismantle.start_time || "?", r.dismantle.end_time || "?", "");
      }

      sb.itemTableHeader("Tarification", "Taux/jour", "Jours", "Sous-total");
      sb.itemRow("Location de la salle", r.tariff_amount || 0, slots.length, (r.tariff_amount || 0) * slots.length);

      const staff = r.staff || [];
      if (staff.length > 0) {
        sb.itemTableHeader("Personnel", "Nombre", "Heures", "Sous-total");
        staff.forEach((s: any) => {
          const salary = (appState.settings.salaries || []).find((sal: any) => sal.id === s.salary_id);
          const rate = salary ? getActiveSalaryRate(salary, eventDateStart, s.tarif_id) : 0;
          const overtimeRate = salary ? getActiveSalaryOvertimeRate(salary, eventDateStart, s.tarif_id) : 0;
          const amount = rate * (s.hours || 0) * (s.count || 0) + overtimeRate * (s.overtime_hours || 0) * (s.count || 0);
          const heures = s.overtime_hours ? `${s.hours || 0} (+${s.overtime_hours} sup.)` : String(s.hours || 0);
          sb.itemRow(salary?.job || "(rôle non défini)", s.count || 0, heures, amount);
        });
      }

      const services = r.services || [];
      if (services.length > 0) {
        sb.itemTableHeader("Équipements", "Nombre", "Heures", "Sous-total");
        services.forEach((s: any) => {
          const service = (appState.settings.services || []).find((sv: any) => sv.id === s.service_id);
          const rate = service ? getActiveServiceRate(service, eventDateStart, s.tarif_id) : 0;
          const isHourly = service && service.type === "hourly";
          const amount = isHourly ? rate * (s.hours || 0) * (s.count || 0) : rate * (s.count || 0);
          sb.itemRow(service?.name || "(service non défini)", s.count || 0, isHourly ? s.hours || 0 : "-", amount);
        });
      }

      const fees = r.fees || [];
      if (fees.length > 0) {
        sb.itemTableHeader("Autres frais", "", "", "Montant");
        fees.forEach((f: any) => {
          sb.itemRow(f.description || "(frais)", "", "", f.amount || 0);
        });
      }

      sb.blankRows(1);
    });
  }

  sb.titleRow("Facturation");
  const fin = computeActivityFinancials(act);
  const financeRows: [string, number][] = [
    ["Sous-total", fin.subtotal],
    ["TPS (5%)", fin.tps],
    ["TVQ (9,975%)", fin.tvq],
    ["TOTAL", fin.total]
  ];
  financeRows.forEach(([label, amount]) => {
    sb.addRow(null, [
      { col: "A", style: S.value, value: label, mergeTo: "D" },
      { col: "E", style: S.currency, value: amount, mergeTo: "F" }
    ]);
  });
  sb.blankRows(1);

  sb.titleRow("Attestations");
  ATTESTATIONS.forEach((text, i) => {
    // A:D is 4 of the sheet's 6 columns (see buildSheetXml's <cols>); both styles are 16pt.
    sb.addRow(wrapRowHeight(text, 88, 16), [
      { col: "A", style: i === 0 ? S.attestation : S.urgency, value: text, mergeTo: "D" },
      { col: "E", style: S.initialsLabel, value: "Initiales:", mergeTo: "F" }
    ]);
  });
  sb.blankRows(1);

  sb.titleRow("Clause d'annulation et de paiement");
  sb.textBoxRow(CANCELLATION_CLAUSE, S.cancelBody, 14);
  sb.blankRows(1);

  sb.titleRow("Signatures");
  sb.addRow(22, [
    { col: "A", style: S.sectionTitle, value: "Client", mergeTo: "C" },
    { col: "D", style: S.sectionTitleAlt, value: "Fournisseur", mergeTo: "F" }
  ]);
  sb.addRow(20, [
    { col: "A", style: S.sigLabel, value: "Date:", mergeTo: "C" },
    { col: "D", style: S.sigLabel, value: "Date:", mergeTo: "F" }
  ]);
  sb.blankRows(2, 30);
  sb.addRow(20, [
    { col: "A", style: S.sigLabel, value: "Signature:", mergeTo: "C" },
    { col: "D", style: S.sigLabel, value: "Signature:", mergeTo: "F" }
  ]);
  sb.blankRows(1, 30);
  sb.addRow(20, [{ col: "D", style: S.sigName1, value: "Marie-Ève Bouchard, technicienne en administration", mergeTo: "F" }]);
  sb.addRow(20, [{ col: "D", style: S.sigLabel, value: "Signature :", mergeTo: "F" }]);
  sb.blankRows(1, 30);
  sb.addRow(20, [{ col: "D", style: S.sigName2, value: "Rébecca Audy, gestionnaire administrative des services communautaires", mergeTo: "F" }]);
  sb.blankRows(1);

  sb.titleRow("Annexe – Clauses de location");
  LOCATION_CLAUSE_GROUPS.forEach(group => {
    sb.textBoxRow(group.title, S.clauseGroup, 16);
    group.clauses.forEach(clause => {
      sb.addRow(wrapRowHeight(`Clause ${clause.num}`, 132, 18), [{ col: "A", style: S.clauseNum, value: `Clause ${clause.num}`, mergeTo: "F" }]);
      sb.textBoxRow(clause.body, S.clauseBody, 16);
    });
  });

  const { sheetDataXml, mergeCellsXml } = sb.render();
  const cols = `<cols>${Array.from({ length: SHEET_COLS }, (_, i) => `<col min="${i + 1}" max="${i + 1}" customWidth="1" width="${COL_WIDTH_UNITS}"/>`).join("")}</cols>`;
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<dimension ref="A1:F${sb.lastRow}"/>` +
    `<sheetViews><sheetView workbookViewId="0"/></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="15"/>` +
    cols +
    `<sheetData>${sheetDataXml}</sheetData>` +
    mergeCellsXml +
    `<drawing r:id="rId1"/>` +
    `</worksheet>`
  );
}

// Header image, anchored at the top-left corner and scaled to IMAGE_WIDTH_EMU/IMAGE_HEIGHT_EMU
// (the sheet's actual column width, aspect ratio preserved) regardless of the underlying grid.
function buildDrawingXml() {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` +
    `<xdr:oneCellAnchor>` +
    `<xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>` +
    `<xdr:ext cx="${IMAGE_WIDTH_EMU}" cy="${IMAGE_HEIGHT_EMU}"/>` +
    `<xdr:pic>` +
    `<xdr:nvPicPr><xdr:cNvPr id="1" name="Image 3"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>` +
    `<xdr:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>` +
    `<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${IMAGE_WIDTH_EMU}" cy="${IMAGE_HEIGHT_EMU}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr>` +
    `</xdr:pic>` +
    `<xdr:clientData/>` +
    `</xdr:oneCellAnchor>` +
    `</xdr:wsDr>`
  );
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function generateContractXlsx(act: any) {
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
  const headerImage = await templateZip.file("xl/media/image2.png")?.async("uint8array");
  if (!stylesXmlRaw || !themeXml || !headerImage) {
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
      `<Default Extension="png" ContentType="image/png"/>` +
      `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
      `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
      `<Override PartName="/xl/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>` +
      `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
      `<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>` +
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
  zip.file(
    "docProps/core.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">` +
      `<dc:title>Contrat ${xmlEscapeText(String(act.id))}</dc:title>` +
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
      `<sheets><sheet name="Contrat" sheetId="1" r:id="rId1"/></sheets>` +
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
  zip.file("xl/media/image2.png", headerImage);
  zip.file("xl/drawings/drawing1.xml", buildDrawingXml());
  zip.file(
    "xl/drawings/_rels/drawing1.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image2.png"/>` +
      `</Relationships>`
  );
  zip.file("xl/worksheets/sheet1.xml", buildSheetXml(act));
  zip.file(
    "xl/worksheets/_rels/sheet1.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>` +
      `</Relationships>`
  );

  const blob = await zip.generateAsync({ type: "blob" });
  const filename = `Contrat_${act.id}_${(act.name || "activite").replace(/[^\w-]+/g, "_")}.xlsx`;
  downloadBlob(blob, filename);
}

export { generateContractXlsx };
