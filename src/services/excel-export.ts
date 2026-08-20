/**
 * excel-export.ts - Generates the structured "ACTIVITÉS"/"SALLES" Excel export matching the
 * original template used before this app existed.
 */
import { logError } from "../utils/logger.ts";
import { appState, getFiscalYear, getQuarterNumber, getActivePricingGrid, getFlattenedRoomTarifs } from "../state/state.ts";
import {
  showToast,
  showLoadingOverlay,
  hideLoadingOverlay,
  getRoomsTariffTotal,
  getActivityReferences,
  getReservationRoomLabel,
  calculateDaysCount
} from "../utils/utils.ts";

export interface ExcelExportOptions {
  mode: "standard" | "custom";
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
      accounts: (appState.settings.accounts || []).map(a => a.code),
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
      const totalRev = (act.distributions || []).reduce((sum: number, d: any) => sum + (Number(d.amount) || 0), 0);
      if (totalRev <= 0) return false;
    } else if (filters.financialFilter === "zero_revenue") {
      const totalRev = (act.distributions || []).reduce((sum: number, d: any) => sum + (Number(d.amount) || 0), 0);
      if (totalRev > 0) return false;
    } else if (filters.financialFilter === "non_taxable") {
      if (!act.non_taxable) return false;
    }

    return true;
  });
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
    import("./excel-export-modal.ts").then(m => m.openExcelExportModal());
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
  if (!appState.settings.accounts || appState.settings.accounts.length === 0) {
    throw new Error("Aucun compte configuré : ajoutez des comptes dans les paramètres avant d'exporter.");
  }

  const options = customOptions || getDefaultExportOptions();
  const wb = lib.utils.book_new();

  // Selected accounts list
  const selectedAccounts = (options.columns.accounts || []).filter(code => appState.settings.accounts.some(a => a.code === code));

  // Define dynamic headers based on column selections
  interface ColumnDef {
    key: string;
    header: string;
    width: number;
    accountCode?: string;
    getValue: (act: any, rowIdx: number) => any;
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
    const label = appState.settings.accounts.find(a => a.code === code)?.description || "";
    activeCols.push({
      key: `account_${code}`,
      header: `${code}\n${label}`,
      width: 18,
      accountCode: code,
      getValue: act => {
        const dist = (act.distributions || []).find((d: any) => d.account_code === code);
        return dist ? dist.amount : 0;
      }
    });
  });

  const lastAccColIdx = activeCols.length - 1;

  if (options.columns.total_revenue) {
    activeCols.push({
      key: "total_revenue",
      header: "REVENUS TOTAL RÉÈL",
      width: 20,
      getValue: (act, rowIdx) => {
        if (selectedAccounts.length === 0) {
          return (act.distributions || []).reduce((sum: number, d: any) => sum + (Number(d.amount) || 0), 0);
        }
        if (options.sheets.useExcelFormulas) {
          const excelRow = rowIdx + 2;
          const firstColLetter = getExcelColName(firstAccColIdx + 1);
          const lastColLetter = getExcelColName(lastAccColIdx + 1);
          return { t: "n", f: `SUM(${firstColLetter}${excelRow}:${lastColLetter}${excelRow})` };
        }
        return (act.distributions || [])
          .filter((d: any) => selectedAccounts.includes(d.account_code))
          .reduce((sum: number, d: any) => sum + (Number(d.amount) || 0), 0);
      }
    });
  }

  // Filter activities
  const activeActivities = filterActivitiesForExport(appState.activities, options.filters);

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
  lib.utils.book_append_sheet(wb, ws, "ACTIVITÉS");

  // Sheet 2: Configuration Salles
  if (options.sheets.includeRoomsSheet) {
    const roomsData = [["SALLE", "TYPE DE TARIF", "GRILLE (ENTRÉE EN VIGUEUR)", "TARIF", "MONTANT ($)"]];
    (appState.settings.rooms || []).forEach(r => {
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
      const rev = acts.reduce((s, a) => s + (a.distributions || []).reduce((ds: number, d: any) => ds + (Number(d.amount) || 0), 0), 0);
      summaryData.push([ct === "interne" ? "Client Interne" : "Client Externe", acts.length, rev]);
    });
    summaryData.push([]);

    // Breakdown by department
    summaryData.push(["RÉPARTITION PAR DÉPARTEMENT"]);
    summaryData.push(["Département", "Nombre d'activités", "Revenus totaux ($)"]);
    const deptsMap = new Map<string, { count: number; rev: number }>();
    activeActivities.forEach(a => {
      const dept = a.department || "Non spécifié";
      const rev = (a.distributions || []).reduce((ds: number, d: any) => ds + (Number(d.amount) || 0), 0);
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
    (appState.settings.accounts || []).forEach(acc => {
      let accTotal = 0;
      activeActivities.forEach(a => {
        const dist = (a.distributions || []).find((d: any) => d.account_code === acc.code);
        if (dist) accTotal += Number(dist.amount) || 0;
      });
      summaryData.push([acc.code, acc.description, accTotal]);
    });

    const wsSummary = lib.utils.aoa_to_sheet(summaryData);
    wsSummary["!cols"] = [{ wch: 30 }, { wch: 30 }, { wch: 20 }];
    lib.utils.book_append_sheet(wb, wsSummary, "SOMMAIRE");
  }

  return wb;
}

function runExportToExcel(_getExcelColName: (colIdx: number) => string, xlsxInstance?: any, customOptions?: ExcelExportOptions) {
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
    }
    const filename = `compta_marie_rapport_${filenameSuffix}_${new Date().toISOString().split("T")[0]}.xlsx`;

    lib.writeFile(wb, filename);
    showToast("Export Excel terminé.", "success");
  } catch (err: any) {
    logError("backup", "export Excel", err);
    showToast("Erreur lors de l'export Excel : " + err.message, "error");
  } finally {
    hideLoadingOverlay();
  }
}

export { exportToExcel, getExcelColName, runExportToExcel, generateExcelWorkbook };
