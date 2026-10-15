/**
 * excel-export.ts - Generates the structured "ACTIVITÉS"/"SALLES" Excel export matching the
 * original template used before this app existed.
 */
import JSZip from "jszip";
import { logError } from "../utils/logger.ts";
import { appState, getFiscalYear, getQuarterNumber, getActivePricingGrid, getFlattenedRoomTarifs } from "../state/state.ts";
import { getActivities } from "../state/activities-repository.ts";
import { getAccounts, getRooms } from "../state/settings-repository.ts";
import { getReconciliationIssuesByActivity } from "./reconciliation.ts";
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

export interface ExcelExportOptions {
  mode: "standard" | "custom" | "quarter_end";
  filters: {
    periodMode: "active" | "all" | "fiscal_year" | "custom_dates";
    fiscalYear: string;
    quarters: number[];
    startDate: string;
    endDate: string;
    states: string[];
    modes: string[];
    clientTypes: string[];
    departments: string[];
    rooms: string[];
    categories: string[];
    responsable: string;
    searchText: string;
    financialFilter: "all" | "with_revenue" | "zero_revenue" | "non_taxable";
  };
  columns: {
    id: boolean;
    responsable: boolean;
    name: boolean;
    date_start: boolean;
    date_end: boolean;
    days_count: boolean;
    client_type: boolean;
    category: boolean;
    rooms: boolean;
    remi_time: boolean;
    department: boolean;
    room_sans_frais: boolean;
    references: boolean;
    state: boolean;
    attendees_count: boolean;
    manager_name: boolean;
    manager_company: boolean;
    manager_contact_info: boolean;
    description: boolean;
    notes: boolean;
    accounts: string[]; // Selected account codes
    total_revenue: boolean;
  };
  sheets: {
    includeTotalRow: boolean;
    useExcelFormulas: boolean;
    includeRoomsSheet: boolean;
    includeSummarySheet: boolean;
  };
}

export function getDefaultExportOptions(): ExcelExportOptions {
  return {
    mode: "standard",
    filters: {
      periodMode: "active",
      fiscalYear: appState.selected_year || "",
      quarters: appState.selected_quarters ? [...appState.selected_quarters] : [1, 2, 3, 4],
      startDate: "",
      endDate: "",
      states: [],
      modes: [],
      clientTypes: [],
      departments: [],
      rooms: [],
      categories: [],
      responsable: "",
      searchText: "",
      financialFilter: "all"
    },
    columns: {
      id: true,
      responsable: true,
      name: true,
      date_start: true,
      date_end: true,
      days_count: true,
      client_type: true,
      category: true,
      rooms: true,
      remi_time: true,
      department: true,
      room_sans_frais: true,
      references: true,
      state: false,
      attendees_count: false,
      manager_name: false,
      manager_company: false,
      manager_contact_info: false,
      description: false,
      notes: false,
      accounts: (getAccounts() || []).map(a => a.code),
      total_revenue: true
    },
    sheets: {
      includeTotalRow: true,
      useExcelFormulas: true,
      includeRoomsSheet: true,
      includeSummarySheet: false
    }
  };
}

// Fixed-format report for quarter-end purposes: just the essentials (activity id/name/date,
// invoice reference, the 892-xxx budget accounts actually in use, and the real total revenue), not
// user-configurable like the "custom" mode. Which 892 accounts actually show up as columns depends
// on the data (see generateExcelWorkbook's selectedAccounts filtering for quarter_end mode) so
// `columns.accounts` here is only a starting candidate list, narrowed down at generation time.
export function getQuarterEndExportOptions(): ExcelExportOptions {
  const base = getDefaultExportOptions();
  return {
    mode: "quarter_end",
    filters: base.filters,
    columns: {
      id: true,
      responsable: false,
      name: true,
      date_start: true,
      date_end: false,
      days_count: false,
      client_type: false,
      category: false,
      rooms: false,
      remi_time: false,
      department: false,
      room_sans_frais: false,
      references: true,
      state: false,
      attendees_count: false,
      manager_name: false,
      manager_company: false,
      manager_contact_info: false,
      description: false,
      notes: false,
      accounts: (getAccounts() || []).filter(a => a.code.startsWith("892")).map(a => a.code),
      total_revenue: true
    },
    sheets: {
      includeTotalRow: true,
      useExcelFormulas: true,
      includeRoomsSheet: false,
      includeSummarySheet: false
    }
  };
}

// Revenue lines for an activity: its billing distributions plus its bar revenue lines (excluded
// from billing but still booked to their own GL accounts — see bar-revenue-rows.ts and
// account-report.ts, which applies the same combination for the "Grand Livre local" view).
function getRevenueLines(act: any): { account_code: string; amount: number }[] {
  return [...(act.distributions || []), ...(act.bar_revenue_lines || [])];
}

export function filterActivitiesForExport(activities: any[], filters: ExcelExportOptions["filters"]): any[] {
  return activities.filter(act => {
    if (act.deleted) return false;
    if (!act.name || act.name.trim() === "") return false;

    // Period / date filtering
    if (filters.periodMode === "active") {
      const actYear = getFiscalYear(act.date_start);
      const actQuarter = getQuarterNumber(act.date_start);
      if (actYear !== appState.selected_year || actQuarter === null || !appState.selected_quarters.includes(actQuarter)) {
        return false;
      }
    } else if (filters.periodMode === "fiscal_year") {
      const actYear = getFiscalYear(act.date_start);
      const actQuarter = getQuarterNumber(act.date_start);
      if (filters.fiscalYear && actYear !== filters.fiscalYear) return false;
      if (filters.quarters && filters.quarters.length > 0) {
        if (actQuarter === null || !filters.quarters.includes(actQuarter)) return false;
      }
    } else if (filters.periodMode === "custom_dates") {
      if (filters.startDate && act.date_start && act.date_start < filters.startDate) return false;
      if (filters.endDate && act.date_start && act.date_start > filters.endDate) return false;
    }

    // States
    if (filters.states && filters.states.length > 0) {
      const actState = act.state || "brouillon";
      if (!filters.states.includes(actState)) return false;
    }

    // Modes (soumission vs estimation)
    if (filters.modes && filters.modes.length > 0) {
      const actMode = act.mode || "soumission";
      if (!filters.modes.includes(actMode)) return false;
    }

    // Client types
    if (filters.clientTypes && filters.clientTypes.length > 0) {
      if (!filters.clientTypes.includes(act.client_type)) return false;
    }

    // Departments
    if (filters.departments && filters.departments.length > 0) {
      if (!filters.departments.includes(act.department)) return false;
    }

    // Rooms
    if (filters.rooms && filters.rooms.length > 0) {
      const actRooms = (act.reservations || []).map((r: any) => r.room_name).filter(Boolean);
      const hasRoomMatch = filters.rooms.some(rName => actRooms.includes(rName));
      if (!hasRoomMatch) return false;
    }

    // Categories / Event types
    if (filters.categories && filters.categories.length > 0) {
      const cat = act.category || act.event_type || "";
      if (!filters.categories.includes(cat)) return false;
    }

    // Responsable
    if (filters.responsable && filters.responsable.trim() !== "") {
      const query = filters.responsable.toLowerCase().trim();
      const respName = (act.responsable || "").toLowerCase();
      if (!respName.includes(query)) return false;
    }

    // Search text (Name, Description, Notes, Invoice References, Manager)
    if (filters.searchText && filters.searchText.trim() !== "") {
      const q = filters.searchText.toLowerCase().trim();
      const refStr = getActivityReferences(act).toLowerCase();
      const mgrName = `${act.activity_manager?.first_name || ""} ${act.activity_manager?.last_name || ""}`.toLowerCase();
      const mgrCompany = (act.activity_manager?.company_name || "").toLowerCase();
      const match =
        (act.name || "").toLowerCase().includes(q) ||
        (act.description || "").toLowerCase().includes(q) ||
        (act.notes || "").toLowerCase().includes(q) ||
        (act.id || "").toLowerCase().includes(q) ||
        refStr.includes(q) ||
        mgrName.includes(q) ||
        mgrCompany.includes(q);
      if (!match) return false;
    }

    // Financial filters
    if (filters.financialFilter === "with_revenue") {
      const totalRev = getRevenueLines(act).reduce((sum: number, d: any) => sum + (Number(d.amount) || 0), 0);
      if (totalRev <= 0) return false;
    } else if (filters.financialFilter === "zero_revenue") {
      const totalRev = getRevenueLines(act).reduce((sum: number, d: any) => sum + (Number(d.amount) || 0), 0);
      if (totalRev > 0) return false;
    } else if (filters.financialFilter === "non_taxable") {
      if (!act.non_taxable) return false;
    }

    return true;
  });
}

// The quarter-end report's final activity list (date-sorted, zero-revenue rows dropped) and its
// 892-xxx account columns (only the ones actually carrying a non-zero amount on one of those
// activities). Exported so runExportToExcel can compute the totals row's position (for the bold
// patch) from the exact same list generateExcelWorkbook builds its rows from, instead of
// re-deriving a count that could drift out of sync with it.
export function getQuarterEndActivities(options: ExcelExportOptions): { activities: any[]; selectedAccounts: string[] } {
  const sortedActivities = filterActivitiesForExport(getActivities(), options.filters).sort((a, b) =>
    (a.date_start || "").localeCompare(b.date_start || "")
  );

  const selectedAccounts = (options.columns.accounts || [])
    .filter(code => getAccounts().some(a => a.code === code))
    .filter(
      code =>
        code.startsWith("892") &&
        sortedActivities.some(act => getRevenueLines(act).some((d: any) => d.account_code === code && (Number(d.amount) || 0) !== 0))
    );

  const activities = sortedActivities.filter(act => {
    const lines = getRevenueLines(act).filter((d: any) => selectedAccounts.length === 0 || selectedAccounts.includes(d.account_code));
    return lines.reduce((sum: number, d: any) => sum + (Number(d.amount) || 0), 0) !== 0;
  });

  return { activities, selectedAccounts };
}

// The quarter-end report's account cells (e.g. "E3") with an unresolved reconciliation issue
// against the last-reconciled ledger (see getReconciliationIssuesByActivity), split by issue so
// each gets its own highlight color in the generated file (see buildQuarterEndBlob): "diff" (the
// entered amount doesn't match the ledger) vs "unlogged" (entered in the app, not found in the
// ledger at all). Both empty when no reconciliation has been run this session, or when nothing's
// off. Takes the exact (activities, selectedAccounts) pair generateExcelWorkbook built its
// rows/columns from, so the cell refs line up with what's actually on the sheet.
export function getQuarterEndReconciliationCellRefs(
  activities: any[],
  selectedAccounts: string[]
): { diffCellRefs: Set<string>; unloggedCellRefs: Set<string> } {
  const issuesByActivity = getReconciliationIssuesByActivity();
  const diffCellRefs = new Set<string>();
  const unloggedCellRefs = new Set<string>();
  activities.forEach((act, rIdx) => {
    const accountIssues = issuesByActivity.get(act.id);
    if (!accountIssues) return;
    selectedAccounts.forEach((code, accIdx) => {
      const issue = accountIssues.get(code);
      if (!issue) return;
      const colLetter = getExcelColName(QUARTER_END_FROZEN_COLS + accIdx + 1);
      const cellRef = `${colLetter}${rIdx + 2}`;
      (issue === "diff" ? diffCellRefs : unloggedCellRefs).add(cellRef);
    });
  });
  return { diffCellRefs, unloggedCellRefs };
}

// Converts a 1-based column index to its Excel letter (1 -> "A", 27 -> "AA"), exported alongside
// runExportToExcel so both can be exercised directly by tests without going through the
// setTimeout-deferred exportToExcel() entry point.
function getExcelColName(colIdx: number) {
  let temp,
    letter = "";
  while (colIdx > 0) {
    temp = (colIdx - 1) % 26;
    letter = String.fromCharCode(65 + temp) + letter;
    colIdx = (colIdx - temp - 1) / 26;
  }
  return letter;
}

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
function addBoldStyleToSheetXml(
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
function addBoldStyleToColumnXml(
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
function addFillStyleToCellsXml(
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

// The quarter-end report's first 4 columns are always, in this fixed order (see
// getQuarterEndExportOptions): id, name, date_start, references — frozen alongside the header row
// so the invoice-reference column stays visible while scrolling through the 892-xxx accounts.
const QUARTER_END_FROZEN_COLS = 4;

// Freezes the header row (row 1) and the report's leading columns (see QUARTER_END_FROZEN_COLS) by
// patching a <pane> into the sheet's <sheetView> — SheetJS's writer only ever emits a bare
// `<sheetView workbookViewId="0"/>` (see write_ws_xml_sheetviews() in xlsx.js), with no supported
// way to request frozen panes through the object model.
function freezePanesXml(sheetXml: string, frozenCols: number): string {
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
function enlargeCommentNotesXml(vmlXml: string): string {
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

interface QuarterEndStyling {
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
async function buildQuarterEndBlob(lib: any, wb: any, styling: QuarterEndStyling): Promise<Blob> {
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

export {
  exportToExcel,
  getExcelColName,
  runExportToExcel,
  generateExcelWorkbook,
  addBoldStyleToSheetXml,
  addBoldStyleToColumnXml,
  addFillStyleToCellsXml,
  freezePanesXml,
  enlargeCommentNotesXml,
  buildQuarterEndBlob
};
