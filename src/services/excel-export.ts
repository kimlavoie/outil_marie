/**
 * excel-export.ts - Generates the structured "ACTIVITÉS"/"SALLES" Excel export matching the
 * original template used before this app existed.
 *
 * The options shape/presets, the activity/account filtering, and the raw-XML styling patches
 * each live in their own module (excel-export-options.ts, excel-export-filters.ts,
 * excel-export-xlsx-styling.ts); this file keeps the workbook-building logic itself
 * (generateExcelWorkbook's column definitions) and the export entry point, and re-exports the
 * others' public API so existing imports from "./excel-export.ts" keep working.
 */
import { appState, getActivePricingGrid, getFlattenedRoomTarifs } from "../state/state.ts";
import { getActivities } from "../state/activities-repository.ts";
import { getAccounts, getRooms } from "../state/settings-repository.ts";
import { logError } from "../utils/logger.ts";
import {
  showToast,
  showLoadingOverlay,
  hideLoadingOverlay,
  getRoomsTariffTotal,
  getActivityReferences,
  getReservationRoomLabel,
  calculateDaysCount,
  formatCurrency
} from "../utils/utils.ts";
import { getExcelColName, getRevenueLines, QUARTER_END_FROZEN_COLS } from "./excel-export-utils.ts";
import { type ExcelExportOptions, getDefaultExportOptions, getQuarterEndExportOptions } from "./excel-export-options.ts";
import { filterActivitiesForExport, getQuarterEndActivities, getQuarterEndReconciliationCellRefs } from "./excel-export-filters.ts";
import { buildQuarterEndBlob } from "./excel-export-xlsx-styling.ts";

export type { ExcelExportOptions };
export { getDefaultExportOptions, getQuarterEndExportOptions };
export { filterActivitiesForExport, getQuarterEndActivities, getQuarterEndReconciliationCellRefs };
export { getExcelColName };
export {
  addBoldStyleToSheetXml,
  addBoldStyleToColumnXml,
  addFillStyleToCellsXml,
  freezePanesXml,
  enlargeCommentNotesXml,
  buildQuarterEndBlob
} from "./excel-export-xlsx-styling.ts";

// Generate structured excel matching the template or custom configuration
function exportToExcel(customOptions?: ExcelExportOptions) {
  if (!customOptions) {
    // Open the export modal if no options were passed
    import("../components/modals/ExcelExportModal.tsx").then(m => m.openExcelExportModal());
    return;
  }

  showLoadingOverlay("Génération de l'export Excel...");
  setTimeout(async () => {
    try {
      const xlsxModule = await import("xlsx");
      runExportToExcel(getExcelColName, xlsxModule, customOptions);
    } catch (err: any) {
      logError("backup", "importation de xlsx", err);
      showToast("La librairie Excel (XLSX) n'a pas pu être chargée.", "error");
      hideLoadingOverlay();
    }
  }, 20);
}

function generateExcelWorkbook(xlsxInstance?: any, customOptions?: ExcelExportOptions) {
  const lib = xlsxInstance || (globalThis as any).XLSX;
  if (typeof lib === "undefined" || !lib?.utils?.book_new) {
    throw new Error("La librairie Excel (XLSX) n'a pas pu être chargée.");
  }
  if (!getAccounts() || getAccounts().length === 0) {
    throw new Error("Aucun compte configuré : ajoutez des comptes dans les paramètres avant d'exporter.");
  }

  const options = customOptions || getDefaultExportOptions();
  const wb = lib.utils.book_new();

  // Filter activities, sorted by start date ascending (oldest first) — computed up front since the
  // quarter-end report's account columns (below) depend on which accounts actually carry an amount
  // among these activities.
  let activeActivities: any[];
  let selectedAccounts: string[];
  if (options.mode === "quarter_end") {
    const quarterEnd = getQuarterEndActivities(options);
    activeActivities = quarterEnd.activities;
    selectedAccounts = quarterEnd.selectedAccounts;
  } else {
    activeActivities = filterActivitiesForExport(getActivities(), options.filters).sort((a, b) =>
      (a.date_start || "").localeCompare(b.date_start || "")
    );
    selectedAccounts = (options.columns.accounts || []).filter(code => getAccounts().some(a => a.code === code));
  }

  // Define dynamic headers based on column selections
  interface ColumnDef {
    key: string;
    header: string;
    width: number;
    accountCode?: string;
    getValue: (act: any, rowIdx: number) => any;
    getComment?: (act: any) => string | null;
  }

  const activeCols: ColumnDef[] = [];

  if (options.columns.id) activeCols.push({ key: "id", header: "NUMERO ACTIVITE", width: 15, getValue: act => act.id });
  if (options.columns.responsable)
    activeCols.push({ key: "responsable", header: "RESPONSABLE FACTURATION", width: 20, getValue: act => act.responsable || "" });
  if (options.columns.name) activeCols.push({ key: "name", header: "NOM DE L'ACTIVITÉ", width: 25, getValue: act => act.name || "" });
  if (options.columns.date_start)
    activeCols.push({ key: "date_start", header: "DATE DÉBUT", width: 12, getValue: act => act.date_start || "" });
  if (options.columns.date_end) activeCols.push({ key: "date_end", header: "DATE FIN", width: 12, getValue: act => act.date_end || "" });

  if (options.columns.days_count) {
    const startDateColLetter = options.columns.date_start ? getExcelColName(activeCols.findIndex(c => c.key === "date_start") + 1) : "";
    const endDateColLetter = options.columns.date_end ? getExcelColName(activeCols.findIndex(c => c.key === "date_end") + 1) : "";

    activeCols.push({
      key: "days_count",
      header: "Nbre jour occupation (formule)",
      width: 10,
      getValue: (act, rowIdx) => {
        if (options.sheets.useExcelFormulas && startDateColLetter && endDateColLetter) {
          const excelRow = rowIdx + 2;
          return { t: "n", f: `${endDateColLetter}${excelRow}-${startDateColLetter}${excelRow}+1` };
        }
        if (act.date_start && act.date_end) {
          const diffDays = calculateDaysCount(act.date_start, act.date_end);
          return diffDays > 0 ? diffDays : 1;
        }
        return 1;
      }
    });
  }

  if (options.columns.client_type)
    activeCols.push({ key: "client_type", header: "Client interne ou externe", width: 12, getValue: act => act.client_type || "" });
  if (options.columns.category)
    activeCols.push({ key: "category", header: "CATÉGORIE (Rébecca)", width: 15, getValue: act => act.category || act.event_type || "" });
  if (options.columns.rooms)
    activeCols.push({
      key: "rooms",
      header: "SALLE (menu déroulant)",
      width: 20,
      getValue: act => (act.reservations || []).map(getReservationRoomLabel).join(", ")
    });
  if (options.columns.remi_time) activeCols.push({ key: "remi_time", header: "TEMPS RÉMI (en heure)", width: 10, getValue: () => 0 });
  if (options.columns.department)
    activeCols.push({
      key: "department",
      header: "DÉPARTEMENT (menu déroulant À VENIR)",
      width: 22,
      getValue: act => act.department || ""
    });
  if (options.columns.room_sans_frais)
    activeCols.push({
      key: "room_sans_frais",
      header: "PRIX SALLE SANS FRAIS (formule) interne seulement",
      width: 15,
      getValue: act => (act.client_type === "interne" ? getRoomsTariffTotal(act) : 0)
    });
  if (options.columns.references)
    activeCols.push({
      key: "references",
      header: "NUMÉRO DE FACTURE, RÉQUISITION INTERNE OU ENCAISSEMENT",
      width: 20,
      getValue: act => getActivityReferences(act)
    });
  if (options.columns.state) activeCols.push({ key: "state", header: "STATUT", width: 12, getValue: act => act.state || "brouillon" });
  if (options.columns.attendees_count)
    activeCols.push({ key: "attendees_count", header: "NOMBRE DE PARTICIPANTS", width: 12, getValue: act => act.attendees_count || 0 });
  if (options.columns.manager_name)
    activeCols.push({
      key: "manager_name",
      header: "GESTIONNAIRE",
      width: 20,
      getValue: act =>
        act.activity_manager ? `${act.activity_manager.first_name || ""} ${act.activity_manager.last_name || ""}`.trim() : ""
    });
  if (options.columns.manager_company)
    activeCols.push({
      key: "manager_company",
      header: "ENTREPRISE / ORGANISME",
      width: 22,
      getValue: act => act.activity_manager?.company_name || ""
    });
  if (options.columns.manager_contact_info)
    activeCols.push({
      key: "manager_contact_info",
      header: "COURRIEL / TÉLÉPHONE",
      width: 25,
      getValue: act => (act.activity_manager ? [act.activity_manager.email, act.activity_manager.phone].filter(Boolean).join(" / ") : "")
    });
  if (options.columns.description)
    activeCols.push({ key: "description", header: "DESCRIPTION", width: 30, getValue: act => act.description || "" });
  if (options.columns.notes) activeCols.push({ key: "notes", header: "NOTES", width: 30, getValue: act => act.notes || "" });

  // Account columns
  const firstAccColIdx = activeCols.length;
  selectedAccounts.forEach(code => {
    const label = getAccounts().find(a => a.code === code)?.description || "";
    activeCols.push({
      key: `account_${code}`,
      header: `${code}\n${label}`,
      width: options.mode === "quarter_end" ? 15 : 18,
      accountCode: code,
      getValue: act => {
        // An activity can have several billing lines on the same account (e.g. split amounts, or
        // a bar revenue line booked to the same account) — combine them, matching how the GL
        // ledger reconciliation treats them (see reconciliation.ts).
        const amounts = getRevenueLines(act)
          .filter((d: any) => d.account_code === code)
          .map((d: any) => Number(d.amount) || 0);
        const total = amounts.reduce((sum, a) => sum + a, 0);
        // Quarter-end report: a zero amount on this account is left blank rather than showing "0".
        if (options.mode === "quarter_end" && total === 0) return "";
        if (options.sheets.useExcelFormulas && amounts.length > 1) {
          // Show the addition instead of the combined total, so the individual amounts stay visible.
          return { t: "n", f: amounts.join("+") };
        }
        return total;
      },
      getComment:
        options.mode === "quarter_end"
          ? act => {
              // Which reference(s) the amount shown is made up of, e.g. "RI001 : 60,00 $" — a
              // billing line's own reference, or a bar revenue line's receipt number.
              const lines = getRevenueLines(act).filter((d: any) => d.account_code === code && (Number(d.amount) || 0) !== 0);
              if (lines.length === 0) return null;
              return lines
                .map((d: any) => {
                  const ref = (d.reference || d.receipt_number || "").trim() || "(sans référence)";
                  return `${ref} : ${formatCurrency(Number(d.amount) || 0)}`;
                })
                .join("\n");
            }
          : undefined
    });
  });

  const lastAccColIdx = activeCols.length - 1;

  if (options.columns.total_revenue) {
    activeCols.push({
      key: "total_revenue",
      header: "REVENUS TOTAL RÉÈL",
      width: 20,
      getValue: (act, rowIdx) => {
        const lines =
          selectedAccounts.length === 0
            ? getRevenueLines(act)
            : getRevenueLines(act).filter((d: any) => selectedAccounts.includes(d.account_code));
        const total = lines.reduce((sum: number, d: any) => sum + (Number(d.amount) || 0), 0);
        // Quarter-end report: zero-total rows are already excluded (see getQuarterEndActivities),
        // but leave this blank too rather than showing "0" if that total ever is zero.
        if (options.mode === "quarter_end" && total === 0) return "";
        if (selectedAccounts.length === 0) return total;
        if (options.sheets.useExcelFormulas) {
          const excelRow = rowIdx + 2;
          const firstColLetter = getExcelColName(firstAccColIdx + 1);
          const lastColLetter = getExcelColName(lastAccColIdx + 1);
          return { t: "n", f: `SUM(${firstColLetter}${excelRow}:${lastColLetter}${excelRow})` };
        }
        return total;
      }
    });
  }

  // Build rows
  const sheetData: any[][] = [activeCols.map(c => c.header)];

  activeActivities.forEach((act, rIdx) => {
    const row = activeCols.map(col => col.getValue(act, rIdx));
    sheetData.push(row);
  });

  // Total Row
  if (options.sheets.includeTotalRow && activeActivities.length > 0) {
    const totalRow = new Array(activeCols.length).fill("");
    totalRow[0] = "TOTAUX COMPLETS";

    const startRow = 2;
    const endRow = sheetData.length;

    activeCols.forEach((col, cIdx) => {
      const colLetter = getExcelColName(cIdx + 1);
      if (col.accountCode || col.key === "total_revenue" || col.key === "room_sans_frais") {
        if (options.sheets.useExcelFormulas) {
          totalRow[cIdx] = { t: "n", f: `SUM(${colLetter}${startRow}:${colLetter}${endRow})` };
        } else {
          // Sum numeric values
          let sum = 0;
          for (let r = 1; r < sheetData.length; r++) {
            const val = sheetData[r][cIdx];
            const num = typeof val === "number" ? val : typeof val === "object" && val?.v ? Number(val.v) : 0;
            sum += num;
          }
          totalRow[cIdx] = sum;
        }
      }
    });

    sheetData.push(totalRow);
  }

  const ws = lib.utils.aoa_to_sheet(sheetData);
  ws["!cols"] = activeCols.map(c => ({ wch: c.width }));
  if (options.mode === "quarter_end") {
    // Taller header row — bold + word wrap are patched into the written XML afterwards (see
    // buildQuarterEndBlob), since SheetJS's community-edition writer drops cell styling, but row
    // height and the autofilter below are plain worksheet properties it writes natively.
    ws["!rows"] = [{ hpt: 30 }];
    const lastColLetter = getExcelColName(activeCols.length);
    const lastDataRow = 1 + activeActivities.length; // header + data rows, excluding the totals row
    if (lastDataRow > 1) ws["!autofilter"] = { ref: `A1:${lastColLetter}${lastDataRow}` };

    // Note on each account cell spelling out which reference(s) make up its amount.
    activeCols.forEach((col, cIdx) => {
      if (!col.getComment) return;
      const colLetter = getExcelColName(cIdx + 1);
      activeActivities.forEach((act, rIdx) => {
        const comment = col.getComment!(act);
        if (!comment) return;
        const cellRef = `${colLetter}${rIdx + 2}`;
        if (!ws[cellRef]) return;
        // `hidden: true` keeps the note tucked away until the cell is hovered, matching Excel's
        // normal comment behavior — without it, SheetJS marks the note "always visible" (shown as
        // soon as the file opens, with no `visibility:hidden` on its VML shape — see
        // write_vml_comment() in xlsx.js).
        const comments: any[] & { hidden?: boolean } = [{ a: "Compta Marie", t: comment }];
        comments.hidden = true;
        ws[cellRef].c = comments;
      });
    });
  }
  lib.utils.book_append_sheet(wb, ws, "ACTIVITÉS");

  // Sheet 2: Configuration Salles
  if (options.sheets.includeRoomsSheet) {
    const roomsData = [["SALLE", "TYPE DE TARIF", "GRILLE (ENTRÉE EN VIGUEUR)", "TARIF", "MONTANT ($)"]];
    (getRooms() || []).forEach(r => {
      const grid = getActivePricingGrid(r, "");
      const tarifs = grid ? getFlattenedRoomTarifs(r, "") : [];
      const rateTypeLabel = r.rate_type === "hourly" ? "À l'heure" : "À la journée";
      (tarifs.length ? tarifs : [{ description: "", amount: "" }]).forEach(t => {
        roomsData.push([r.name, rateTypeLabel, grid ? grid.effective_date || "Depuis toujours" : "", t.description, t.amount]);
      });
    });
    const wsRooms = lib.utils.aoa_to_sheet(roomsData);
    wsRooms["!cols"] = [{ wch: 20 }, { wch: 15 }, { wch: 25 }, { wch: 25 }, { wch: 15 }];
    lib.utils.book_append_sheet(wb, wsRooms, "SALLES");
  }

  // Sheet 3: Sommaire Synthétique
  if (options.sheets.includeSummarySheet) {
    const summaryData: any[][] = [];
    summaryData.push(["SOMMAIRE SYNTHÉTIQUE DU RAPPORT D'ACTIVITÉS"]);
    summaryData.push(["Date de génération :", new Date().toLocaleString("fr-CA")]);
    summaryData.push(["Total activités incluses :", activeActivities.length]);
    summaryData.push([]);

    // Breakdown by client type
    summaryData.push(["RÉPARTITION PAR TYPE DE CLIENT"]);
    summaryData.push(["Type de client", "Nombre d'activités", "Revenus totaux ($)"]);
    ["interne", "externe"].forEach(ct => {
      const acts = activeActivities.filter(a => a.client_type === ct);
      const rev = acts.reduce((s, a) => s + getRevenueLines(a).reduce((ds: number, d: any) => ds + (Number(d.amount) || 0), 0), 0);
      summaryData.push([ct === "interne" ? "Client Interne" : "Client Externe", acts.length, rev]);
    });
    summaryData.push([]);

    // Breakdown by department
    summaryData.push(["RÉPARTITION PAR DÉPARTEMENT"]);
    summaryData.push(["Département", "Nombre d'activités", "Revenus totaux ($)"]);
    const deptsMap = new Map<string, { count: number; rev: number }>();
    activeActivities.forEach(a => {
      const dept = a.department || "Non spécifié";
      const rev = getRevenueLines(a).reduce((ds: number, d: any) => ds + (Number(d.amount) || 0), 0);
      const entry = deptsMap.get(dept) || { count: 0, rev: 0 };
      entry.count += 1;
      entry.rev += rev;
      deptsMap.set(dept, entry);
    });
    deptsMap.forEach((val, deptKey) => {
      summaryData.push([deptKey, val.count, val.rev]);
    });
    summaryData.push([]);

    // Breakdown by GL Account
    summaryData.push(["RÉPARTITION PAR COMPTE GL"]);
    summaryData.push(["Code Compte", "Description", "Montant total ($)"]);
    (getAccounts() || []).forEach(acc => {
      let accTotal = 0;
      activeActivities.forEach(a => {
        accTotal += getRevenueLines(a)
          .filter((d: any) => d.account_code === acc.code)
          .reduce((sum: number, d: any) => sum + (Number(d.amount) || 0), 0);
      });
      summaryData.push([acc.code, acc.description, accTotal]);
    });

    const wsSummary = lib.utils.aoa_to_sheet(summaryData);
    wsSummary["!cols"] = [{ wch: 30 }, { wch: 30 }, { wch: 20 }];
    lib.utils.book_append_sheet(wb, wsSummary, "SOMMAIRE");
  }

  return wb;
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

async function runExportToExcel(_getExcelColName: (colIdx: number) => string, xlsxInstance?: any, customOptions?: ExcelExportOptions) {
  try {
    const lib = xlsxInstance || (globalThis as any).XLSX;
    const wb = generateExcelWorkbook(lib, customOptions);

    const options = customOptions || getDefaultExportOptions();
    let filenameSuffix = `${appState.selected_year}_${
      (appState.selected_quarters || [])
        .sort()
        .map(q => `T${q}`)
        .join("-") || "tous"
    }`;
    if (options.mode === "custom") {
      filenameSuffix += "_personnalise";
    } else if (options.mode === "quarter_end") {
      filenameSuffix += "_fin_trimestre";
    }
    const filename = `compta_marie_rapport_${filenameSuffix}_${new Date().toISOString().split("T")[0]}.xlsx`;

    if (options.mode === "quarter_end") {
      const { activities, selectedAccounts } = getQuarterEndActivities(options);
      const totalRowNumber = options.sheets.includeTotalRow && activities.length > 0 ? activities.length + 2 : null;
      const totalColLetter = getExcelColName(QUARTER_END_FROZEN_COLS + selectedAccounts.length + 1);

      const { diffCellRefs, unloggedCellRefs } = getQuarterEndReconciliationCellRefs(activities, selectedAccounts);
      const blob = await buildQuarterEndBlob(lib, wb, {
        totalRowNumber,
        totalColLetter,
        lastDataRow: activities.length + 1,
        diffCellRefs,
        unloggedCellRefs
      });
      downloadBlob(blob, filename);
    } else {
      lib.writeFile(wb, filename);
    }
    showToast("Export Excel terminé.", "success");
  } catch (err: any) {
    logError("backup", "export Excel", err);
    showToast("Erreur lors de l'export Excel : " + err.message, "error");
  } finally {
    hideLoadingOverlay();
  }
}

export { exportToExcel, runExportToExcel, generateExcelWorkbook };
