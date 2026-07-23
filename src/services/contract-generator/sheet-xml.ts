/**
 * contract-generator/sheet-xml.ts - The actual document generation logic: lays out an activity's
 * data (client identification, reservation details, financial breakdown) plus the static content
 * blocks into the worksheet XML, and the header image drawing. Split out of contract-generator.ts
 * (see that file for why it stays a barrel re-exporting this alongside styles.ts/
 * static-content.ts/sheet-builder.ts) — kept separate from the style-borrowing bookkeeping
 * (styles.ts) since this is "what goes in the sheet", not "which style id a role points at".
 */
import { computeActivityFinancials } from "../../activities/financials.ts";
import { getAggregateEventDates } from "../../activities/reservations/index.ts";
import { getReservationRoomLabel, formatCurrency, calculateHoursFromTimes, formatPostalCode } from "../../utils/utils.ts";
import { appState, getActiveSalaryRate, getActiveSalaryOvertimeRate, getActiveServiceRate } from "../../state/state.ts";
import { S } from "./styles.ts";
import { SheetBuilder, formatDateFr, wrapRowHeight } from "./sheet-builder.ts";
import { SUPPLIER, ATTESTATIONS, CANCELLATION_CLAUSE, LOCATION_CLAUSE_GROUPS } from "./static-content.ts";

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

function buildSheetXml(act: any, variant: "contrat" | "soumission") {
  const sb = new SheetBuilder();
  const manager = act.activity_manager || {};
  const isInternal = act.client_type === "interne";

  if (variant === "contrat") {
    // The header image (a fixed-size floating drawing, see buildDrawingXml) covers these rows
    // regardless of row height — leave them empty so content starts right below it.
    sb.blankRows(IMAGE_ROW_SPAN);

    sb.labelRow("N° de contrat", act.id, S.supplierLabel, S.supplierValue);
    sb.labelRow("N° de client", manager.coba_client_number, S.supplierLabel, S.supplierValue);
    sb.blankRows(1);
  } else {
    // No header image for a soumission — a big title banner stands in for it instead.
    sb.addRow(60, [{ col: "A", style: S.sectionTitle, value: "Soumission", mergeTo: "F" }]);
    sb.blankRows(1);
  }

  sb.titleRow("Identification du client");
  sb.labelRow(
    "Responsable de l'activité",
    `${manager.first_name || ""} ${manager.last_name || ""}`.trim() || undefined,
    S.supplierLabel,
    S.supplierValue
  );
  sb.labelRow(
    "Responsable de la facturation",
    `${act.responsable_first_name || ""} ${act.responsable_last_name || ""}`.trim() || undefined,
    S.supplierLabel,
    S.supplierValue
  );
  const addr = act.client_type === "externe" && act.responsable_address ? act.responsable_address : manager.address;
  const city = act.client_type === "externe" && act.responsable_city ? act.responsable_city : manager.city;
  const prov = act.client_type === "externe" && act.responsable_province ? act.responsable_province : manager.province;
  const pc = formatPostalCode(act.client_type === "externe" && act.responsable_postal_code ? act.responsable_postal_code : manager.postal_code);
  const addressLine = [addr, city, prov, pc].filter(Boolean).join(", ");
  sb.labelRow("Adresse", addressLine || undefined, S.supplierLabel, S.supplierValue);
  sb.labelRow("Téléphone", manager.phone, S.supplierLabel, S.supplierValue);
  sb.labelRow("Courriel", manager.email, S.supplierLabel, S.supplierValue);
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
    dates.date_start === dates.date_end
      ? formatDateFr(dates.date_start)
      : `${formatDateFr(dates.date_start)} - ${formatDateFr(dates.date_end)}`;
  sb.labelRow("Date de la réservation", dateStr || undefined, S.resLabel, S.resValue);
  sb.labelRow("Titre de l'activité", act.name, S.resLabel, S.resValue);
  sb.labelRow("Description", act.description, S.resLabel, S.resValue);
  sb.labelRow("Nombre de personnes prévu", act.attendees_count || undefined, S.resLabel, S.resValueNumeric);
  sb.blankRows(1);

  const eventDateStart = dates.date_start;

  // One block per room: its own reserved slots (date/heures), rate, and the staff/equipment/fees
  // tied to that specific room — mirrors how the app itself organizes a reservation's sub-rows.
  if (reservations.length > 0) {
    sb.pageBreakBefore();
    sb.titleRow("Salle(s) réservée(s)");
    reservations.forEach((r: any) => {
      sb.subHeader(getReservationRoomLabel(r) || "(salle non définie)");

      const room = appState.settings.rooms.find((rm: any) => rm.name === r.room_name);
      if (room && room.linked_rooms && room.linked_rooms.length > 0) {
        const note = `La réservation de ${room.linked_rooms.join(", ")} est incluse.`;
        sb.addRow(wrapRowHeight(note, 132), [{ col: "A", style: S.wrapValue, value: note, mergeTo: "F" }]);
      }

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

      const isHourly = room && room.rate_type === "hourly";
      if (isHourly) {
        const hours = slots.reduce((sum: number, s: any) => {
          return sum + calculateHoursFromTimes(s.start_time, s.end_time);
        }, 0);
        sb.itemTableHeader("Tarification", "Taux/h", "Heures", "Sous-total");
        sb.itemRow("Location de la salle", r.tariff_amount || 0, hours, (r.tariff_amount || 0) * hours);
      } else {
        sb.itemTableHeader("Tarification", "Taux/jour", "Jours", "Sous-total");
        sb.itemRow("Location de la salle", r.tariff_amount || 0, slots.length, (r.tariff_amount || 0) * slots.length);
      }

      const setupFee = room && typeof room.setup_fee === "number" ? room.setup_fee : 0;
      if (setupFee > 0 && !isInternal) {
        sb.itemRow("Montage/démontage", setupFee, "-", setupFee);
      }

      const staff = r.staff || [];
      if (staff.length > 0) {
        sb.itemTableHeader("Personnel", "Date", "Heures", "Sous-total");
        staff.forEach((s: any) => {
          const salary = (appState.settings.salaries || []).find((sal: any) => sal.id === s.salary_id);
          let rate = 0;
          let overtimeRate = 0;
          const targetDate = s.date || eventDateStart;
          if (s.tarif_id === "__custom__") {
            rate = s.custom_rate || 0;
            overtimeRate = s.custom_overtime_rate || 0;
          } else {
            rate = salary ? getActiveSalaryRate(salary, targetDate, s.tarif_id) : 0;
            overtimeRate = salary ? getActiveSalaryOvertimeRate(salary, targetDate, s.tarif_id) : 0;
          }
          const count = s.count !== undefined ? s.count : 1;
          const amount = rate * (s.hours || 0) * count + overtimeRate * (s.overtime_hours || 0) * count;
          const heures = s.overtime_hours ? `${s.hours || 0} (+${s.overtime_hours} sup.)` : String(s.hours || 0);
          const jobName = salary?.job || "(rôle non défini)";
          const rateText = s.overtime_hours
            ? `${jobName} (${formatCurrency(rate)}/h, sup. ${formatCurrency(overtimeRate)}/h)`
            : `${jobName} (${formatCurrency(rate)}/h)`;
          const col2Value = s.date || (s.count !== undefined ? String(s.count) : "-");
          sb.itemRow(rateText, col2Value, heures, amount);
        });
      }

      const services = r.services || [];
      if (services.length > 0) {
        sb.itemTableHeader("Équipements", "Nombre", "Heures", "Sous-total");
        services.forEach((s: any) => {
          const service = (appState.settings.services || []).find((sv: any) => sv.id === s.service_id);
          let rate = 0;
          if (s.tarif_id === "__custom__") {
            rate = s.custom_rate || 0;
          } else {
            rate = service ? getActiveServiceRate(service, eventDateStart, s.tarif_id) : 0;
          }
          const isHourly = service && service.type === "hourly";
          const amount = isHourly ? rate * (s.hours || 0) * (s.count || 0) : rate * (s.count || 0);
          const serviceName = service?.name || "(service non défini)";
          const rateText = isHourly ? `${serviceName} (${formatCurrency(rate)}/h)` : `${serviceName} (${formatCurrency(rate)})`;
          sb.itemRow(rateText, s.count || 0, isHourly ? s.hours || 0 : "-", amount);
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
    ["Location des salles", fin.roomsTotal],
    ["Montage/démontage", fin.setupTotal],
    ["Personnel", fin.staffTotal],
    ["Équipements", fin.servicesTotal],
    ["Autres frais", fin.feesTotal],
    ["Sous-total", fin.subtotal],
    [fin.tpsLabel, fin.tps],
    [fin.tvqLabel, fin.tvq],
    ["TOTAL", fin.total]
  ];
  financeRows.forEach(([label, amount]) => {
    sb.addRow(null, [
      { col: "A", style: S.billingLabel, value: label, mergeTo: "D" },
      { col: "E", style: S.currency, value: amount, mergeTo: "F" }
    ]);
  });
  sb.blankRows(1);

  if (variant === "contrat") {
    sb.titleRow("Clause d'annulation et de paiement");
    sb.addRow(22, [
      { col: "A", style: S.supplierLabel, value: "Acompte (50% du grand total) :", mergeTo: "D" },
      { col: "E", style: S.currency, value: fin.total * 0.5, mergeTo: "F" }
    ]);
    sb.addRow(20, [
      {
        col: "A",
        style: S.supplierValue,
        value: "* La facture d'acompte vous parviendra par courriel avec un spécimen de chèque.",
        mergeTo: "F"
      }
    ]);
    sb.blankRows(1);
    sb.textBoxRow(CANCELLATION_CLAUSE, S.cancelBody, 14);
    sb.blankRows(1);

    sb.pageBreakBefore();
    sb.titleRow("Attestations (à remplir par le client)");
    sb.addRow(22, [
      { col: "A", style: S.supplierLabel, value: "Numéro d'Entreprise du Québec (NEQ) :", mergeTo: "C" },
      { col: "D", style: S.neqValue, value: "", mergeTo: "F" },
      { col: "E", style: S.neqValue },
      { col: "F", style: S.neqValue }
    ]);
    sb.blankRows(1);
    ATTESTATIONS.forEach((text, i) => {
      // Column A: Checkbox ☐. Columns B:F: Affirmation text merged.
      // Row height adjusted to actual merge width (110) and respective font sizes (16 for bold, 11 for normal)
      // Second attestation (urgency actions) uses a fixed height to fit its longer text/link.
      const h = i === 1 ? 54 : wrapRowHeight(text, 110, i === 0 ? 16 : 11);
      sb.addRow(h, [
        { col: "A", style: S.initialsLabel, value: "☐" },
        { col: "B", style: i === 0 ? S.attestation : S.urgency, value: text, mergeTo: "F" }
      ]);
    });
    sb.blankRows(1);

    sb.titleRow("Signatures");
    sb.addRow(22, [
      { col: "A", style: S.clauseGroup, value: "Client", mergeTo: "C" },
      { col: "D", style: S.clauseGroup, value: "Fournisseur", mergeTo: "F" }
    ]);
    sb.blankRows(1);
    sb.addRow(20, [
      { col: "A", style: S.sigLabel, value: "Date:" },
      { col: "B", style: S.sigBlank, value: "" },
      { col: "C", style: S.value, value: "" },
      { col: "D", style: S.sigLabel, value: "Date:" },
      { col: "E", style: S.sigBlank, value: "" },
      { col: "F", style: S.value, value: "" }
    ]);
    sb.addRow(20, [
      { col: "A", style: S.sigLabel, value: "Prénom :" },
      { col: "B", style: S.sigBlank, value: "" },
      { col: "C", style: S.value, value: "" }
    ]);
    sb.addRow(20, [
      { col: "A", style: S.sigLabel, value: "Nom :" },
      { col: "B", style: S.sigBlank, value: "" },
      { col: "C", style: S.value, value: "" }
    ]);
    // The fournisseur's signature line sits directly above her printed name; the client's line is
    // one row further down, above the "Signature" caption — each side's line only spans its own
    // half, so the two blank/plain cells on the opposite side of each row stay unbordered.
    // A merged range's underlying B/C or E/F cells need the same bordered style as the top-left
    // cell — Excel draws a merged cell's top edge from the individual cells hidden beneath the
    // merge, not just the top-left one, so leaving them at the default style would draw the line
    // under column D only instead of across the whole D:F span.
    //
    // The two blank spacer rows above the name are merged into the client's blank space (through
    // the name row, since that row's client-side cell is blank too) and separately into the
    // fournisseur's blank space (stopping one row short, since that row holds the name itself) —
    // giving each side a single tall cell instead of several thin unstyled ones.
    const sigBlankRow1 = sb.addRow(30, [
      { col: "A", style: S.sigBlank, value: "" },
      { col: "B", style: S.sigBlank },
      { col: "C", style: S.sigBlank },
      { col: "D", style: S.sigBlank, value: "" },
      { col: "E", style: S.sigBlank },
      { col: "F", style: S.sigBlank }
    ]);
    const sigBlankRow2 = sb.addRow(30, [
      { col: "A", style: S.sigBlank, value: "" },
      { col: "B", style: S.sigBlank },
      { col: "C", style: S.sigBlank },
      { col: "D", style: S.sigBlank, value: "" },
      { col: "E", style: S.sigBlank },
      { col: "F", style: S.sigBlank }
    ]);
    const marieRow = sb.addRow(20, [
      { col: "A", style: S.sigBlank, value: "" },
      { col: "B", style: S.sigBlank },
      { col: "C", style: S.sigBlank },
      { col: "D", style: S.sigLineName1, value: "Marie-Ève Bouchard, technicienne en administration", mergeTo: "F" },
      { col: "E", style: S.sigLineName1 },
      { col: "F", style: S.sigLineName1 }
    ]);
    sb.addCustomMerge(`A${sigBlankRow1}:C${marieRow}`);
    sb.addCustomMerge(`D${sigBlankRow1}:F${sigBlankRow2}`);

    sb.addRow(20, [
      { col: "A", style: S.sigLineClient, value: "Signature", mergeTo: "C" },
      { col: "B", style: S.sigLineClient },
      { col: "C", style: S.sigLineClient },
      { col: "D", style: S.sigBlank, value: "", mergeTo: "F" }
    ]);

    // Same blank-spacer treatment above Rébecca's name, but only one row deep (and a taller 42pt
    // height) instead of two.
    sb.addRow(42, [
      { col: "D", style: S.sigBlank, value: "", mergeTo: "F" },
      { col: "E", style: S.sigBlank },
      { col: "F", style: S.sigBlank }
    ]);
    const rebeccaName = "Rébecca Audy, gestionnaire administrative des services communautaires";
    sb.addRow(wrapRowHeight(rebeccaName, 66, 16), [
      { col: "A", style: S.sigBlank, value: "", mergeTo: "C" },
      { col: "D", style: S.sigLineName2, value: rebeccaName, mergeTo: "F" },
      { col: "E", style: S.sigLineName2 },
      { col: "F", style: S.sigLineName2 }
    ]);
    sb.blankRows(1);

    const CLAUSE_HEIGHTS: Record<number, number> = {
      1: 43.5,
      2: 61.5,
      3: 43.5,
      4: 20.25,
      5: 63.75,
      6: 42,
      7: 62.25,
      8: 43.5,
      9: 20.25,
      10: 65.25,
      11: 43.5,
      12: 21.75,
      13: 22.5,
      14: 43.5,
      15: 43.5,
      16: 42,
      17: 62.25,
      18: 21.75,
      19: 63.75,
      20: 43.5,
      21: 42,
      22: 42.75,
      23: 63.75,
      24: 42,
      25: 63.75,
      26: 234
    };

    sb.pageBreakBefore();
    sb.titleRow("Annexe – Clauses de location", S.annexeTitle);
    LOCATION_CLAUSE_GROUPS.forEach(group => {
      sb.textBoxRow(group.title, S.annexeClauseGroup, 16);
      group.clauses.forEach(clause => {
        sb.addRow(wrapRowHeight(`Clause ${clause.num}`, 132, 18), [
          { col: "A", style: S.annexeClauseNum, value: `Clause ${clause.num}`, mergeTo: "F" }
        ]);
        const height = CLAUSE_HEIGHTS[clause.num] ?? wrapRowHeight(clause.body, 132, 16);
        sb.addRow(height, [
          { col: "A", style: S.annexeClauseBody, value: clause.body, mergeTo: "F" }
        ]);
      });
    });
  }

  const { sheetDataXml, mergeCellsXml, rowBreaksXml } = sb.render();
  const cols = `<cols>${Array.from({ length: SHEET_COLS }, (_, i) => `<col min="${i + 1}" max="${i + 1}" customWidth="1" width="${COL_WIDTH_UNITS}"/>`).join("")}</cols>`;
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>` +
    `<dimension ref="A1:F${sb.lastRow}"/>` +
    `<sheetViews><sheetView workbookViewId="0"/></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="15"/>` +
    cols +
    `<sheetData>${sheetDataXml}</sheetData>` +
    mergeCellsXml +
    `<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>` +
    `<pageSetup fitToWidth="1" fitToHeight="0" orientation="portrait"/>` +
    rowBreaksXml +
    (variant === "contrat" ? `<drawing r:id="rId1"/>` : "") +
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

export { buildSheetXml, buildDrawingXml };
