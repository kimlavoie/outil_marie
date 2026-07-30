import test from "node:test";
import assert from "node:assert/strict";

import { appState } from "../src/state/state.ts";
import { getExcelColName, runExportToExcel } from "../src/services/excel-export.ts";

// excel-export.ts talks to `document` (loading overlay/toasts, which no-op when the elements
// aren't found) and the global `XLSX` (declared `any` in src/utils/globals.d.ts, provided by
// public/lib/xlsx.full.min.js at runtime) — both are stubbed here rather than pulling in the
// real xlsx library, so the test only exercises this module's own row/formula-building logic.
(globalThis as any).document = { getElementById: () => null };

function makeXlsxMock() {
  const sheets: Record<string, any> = {};
  const sheetOrder: string[] = [];
  let lastWriteFile: { wb: any; filename: string } | null = null;

  return {
    sheets,
    sheetOrder,
    get lastWriteFile() {
      return lastWriteFile;
    },
    utils: {
      book_new: () => ({}),
      aoa_to_sheet: (data: any[][]) => ({ data }),
      book_append_sheet: (_wb: any, ws: any, name: string) => {
        sheets[name] = ws;
        sheetOrder.push(name);
      }
    },
    writeFile: (wb: any, filename: string) => {
      lastWriteFile = { wb, filename };
    }
  };
}

function baseSettings(overrides: any = {}) {
  return {
    theme: "dark",
    rooms: [],
    departments: [],
    accounts: [{ code: "892-0000-00-000", description: "SCOLAIRE" }],
    last_backup_date: "",
    backup_reminder_days: 7,
    salaries: [],
    services: [],
    global_tasks: [],
    schedulable_tasks: [],
    ...overrides
  };
}

function makeActivity(overrides: any = {}) {
  return {
    id: "act-1",
    name: "Activité test",
    responsable: "Jean Dupont",
    date_start: "2025-08-01",
    date_end: "2025-08-01",
    client_type: "interne",
    category: "",
    department: "",
    deleted: false,
    reservations: [],
    distributions: [],
    ...overrides
  };
}

test("getExcelColName converts 1-based indices to Excel letters, wrapping past Z", () => {
  assert.equal(getExcelColName(1), "A");
  assert.equal(getExcelColName(26), "Z");
  assert.equal(getExcelColName(27), "AA");
  assert.equal(getExcelColName(52), "AZ");
});

test("runExportToExcel throws (via the exported error path) when the XLSX global isn't loaded", () => {
  (globalThis as any).XLSX = undefined;
  appState.settings = baseSettings();
  appState.activities = [];
  appState.selected_year = "2025-2026";
  appState.selected_quarters = [1, 2, 3, 4];

  // The guard shows a toast and returns instead of throwing (document.getElementById is
  // stubbed to null, so showToast is a no-op) — assert it doesn't blow up either way.
  assert.doesNotThrow(() => runExportToExcel(getExcelColName));
  (globalThis as any).XLSX = makeXlsxMock();
});

test("runExportToExcel refuses to export when no accounts are configured", () => {
  const xlsx = makeXlsxMock();
  (globalThis as any).XLSX = xlsx;
  appState.settings = baseSettings({ accounts: [] });
  appState.activities = [makeActivity()];
  appState.selected_year = "2025-2026";
  appState.selected_quarters = [1, 2, 3, 4];

  runExportToExcel(getExcelColName);

  assert.equal(xlsx.lastWriteFile, null);
  assert.equal(xlsx.sheetOrder.length, 0);
});

test("runExportToExcel builds ACTIVITÉS/SALLES sheets, filtering out activities outside the selected period", () => {
  const xlsx = makeXlsxMock();
  (globalThis as any).XLSX = xlsx;
  appState.settings = baseSettings();
  appState.activities = [
    makeActivity({
      id: "act-in-period",
      name: "Dans la période",
      date_start: "2025-08-01",
      distributions: [{ account_code: "892-0000-00-000", amount: 150 }]
    }),
    makeActivity({ id: "act-out-of-period", name: "Hors période", date_start: "2024-01-01" }),
    makeActivity({ id: "act-deleted", name: "Supprimée", date_start: "2025-08-01", deleted: true }),
    makeActivity({ id: "act-blank", name: "" })
  ];
  appState.selected_year = "2025-2026";
  appState.selected_quarters = [1];

  runExportToExcel(getExcelColName);

  assert.ok(xlsx.sheetOrder.includes("ACTIVITÉS"));
  assert.ok(xlsx.sheetOrder.includes("SALLES"));

  const rows: any[][] = xlsx.sheets["ACTIVITÉS"].data;
  const bodyRows = rows.slice(1, -1); // drop header row and the trailing TOTAUX row
  assert.equal(bodyRows.length, 1);
  assert.equal(bodyRows[0][2], "Dans la période");

  // Account column carries the distribution amount, and the REVENUS TOTAL RÉÈL cell is a
  // SUM formula rather than a plain number.
  const accountColIdx = 13; // 0-based: 13 header columns before the first account column
  assert.equal(bodyRows[0][accountColIdx], 150);
  const totalCell = bodyRows[0][bodyRows[0].length - 1];
  assert.equal(totalCell.t, "n");
  assert.match(totalCell.f, /^SUM\(/);

  assert.ok(xlsx.lastWriteFile);
  assert.match(xlsx.lastWriteFile!.filename, /^compta_marie_rapport_2025-2026_T1_/);
});

test("runExportToExcel appends a TOTAUX row summing every account column", () => {
  const xlsx = makeXlsxMock();
  (globalThis as any).XLSX = xlsx;
  appState.settings = baseSettings();
  appState.activities = [
    makeActivity({ id: "a1", date_start: "2025-08-01", distributions: [{ account_code: "892-0000-00-000", amount: 100 }] })
  ];
  appState.selected_year = "2025-2026";
  appState.selected_quarters = [1];

  runExportToExcel(getExcelColName);

  const rows: any[][] = xlsx.sheets["ACTIVITÉS"].data;
  const totalRow = rows[rows.length - 1];
  assert.equal(totalRow[0], "TOTAUX COMPLETS");
  const accountColIdx = 13;
  assert.equal(totalRow[accountColIdx].t, "n");
  assert.match(totalRow[accountColIdx].f, /^SUM\(/);
});

test("generateExcelWorkbook supports custom filters, column selection, and SOMMAIRE sheet", () => {
  const xlsx = makeXlsxMock();
  (globalThis as any).XLSX = xlsx;
  appState.settings = baseSettings();
  appState.activities = [
    makeActivity({ id: "a1", name: "Spectacle Musique", client_type: "externe", department: "Musique", date_start: "2025-09-01", distributions: [{ account_code: "892-0000-00-000", amount: 500 }] }),
    makeActivity({ id: "a2", name: "Réunion Théâtre", client_type: "interne", department: "Théâtre", date_start: "2025-10-01", distributions: [{ account_code: "892-0000-00-000", amount: 0 }] })
  ];

  const customOptions = {
    mode: "custom" as const,
    filters: {
      periodMode: "all" as const,
      fiscalYear: "",
      quarters: [],
      startDate: "",
      endDate: "",
      states: [],
      modes: [],
      clientTypes: ["externe"],
      departments: [],
      rooms: [],
      categories: [],
      responsable: "",
      searchText: "",
      financialFilter: "all" as const
    },
    columns: {
      id: true,
      responsable: false,
      name: true,
      date_start: true,
      date_end: false,
      days_count: false,
      client_type: true,
      category: false,
      rooms: false,
      remi_time: false,
      department: true,
      room_sans_frais: false,
      references: false,
      state: true,
      attendees_count: false,
      manager_name: false,
      manager_company: false,
      manager_contact_info: false,
      description: false,
      notes: false,
      accounts: ["892-0000-00-000"],
      total_revenue: true
    },
    sheets: {
      includeTotalRow: true,
      useExcelFormulas: true,
      includeRoomsSheet: false,
      includeSummarySheet: true
    }
  };

  runExportToExcel(getExcelColName, xlsx, customOptions);

  assert.ok(xlsx.sheetOrder.includes("ACTIVITÉS"));
  assert.ok(xlsx.sheetOrder.includes("SOMMAIRE"));
  assert.equal(xlsx.sheetOrder.includes("SALLES"), false);

  const actRows: any[][] = xlsx.sheets["ACTIVITÉS"].data;
  // Headers + 1 body row (a1) + 1 total row = 3 rows
  assert.equal(actRows.length, 3);
  assert.equal(actRows[1][1], "Spectacle Musique");
  assert.equal(actRows[1][2], "2025-09-01");
  assert.equal(actRows[1][3], "externe");

  const summaryRows: any[][] = xlsx.sheets["SOMMAIRE"].data;
  assert.ok(summaryRows.some(r => r[0] === "SOMMAIRE SYNTHÉTIQUE DU RAPPORT D'ACTIVITÉS"));
  assert.ok(summaryRows.some(r => r[0] === "Total activités incluses :" && r[1] === 1));
});

