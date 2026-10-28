/**
 * excel-export-options.ts - The Excel export's options shape (filters/columns/sheets) and its two
 * built-in presets: the "standard" default (user-configurable from there via ExcelExportModal.tsx)
 * and the fixed "quarter_end" report.
 */
import { appState } from "../state/state.ts";
import { getAccounts } from "../state/settings-repository.ts";

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
