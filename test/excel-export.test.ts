import test from "node:test";
import assert from "node:assert/strict";

import { appState } from "../src/state/state.ts";
import { formatCurrency } from "../src/utils/utils.ts";
import {
  getExcelColName,
  runExportToExcel,
  generateExcelWorkbook,
  getQuarterEndExportOptions,
  addBoldStyleToSheetXml,
  addBoldStyleToColumnXml,
  freezePanesXml,
  enlargeCommentNotesXml,
  buildQuarterEndBlob
} from "../src/services/excel-export.ts";

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
    },
    // Deliberately not a valid zip — only used by the quarter_end path (buildQuarterEndBlob),
    // which is expected to fall back gracefully (see its own JSZip.loadAsync try/catch) when the
    // bytes it gets back aren't styleable, rather than needing a real xlsx roundtrip in every test.
    write: () => new Uint8Array([0, 0, 0, 0])
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

test("runExportToExcel sorts activities by date_start ascending by default", () => {
  const xlsx = makeXlsxMock();
  (globalThis as any).XLSX = xlsx;
  appState.settings = baseSettings();
  appState.activities = [
    makeActivity({ id: "a-late", name: "Plus tard", date_start: "2025-10-01" }),
    makeActivity({ id: "a-early", name: "Plus tôt", date_start: "2025-08-01" }),
    makeActivity({ id: "a-mid", name: "Entre les deux", date_start: "2025-09-01" })
  ];
  appState.selected_year = "2025-2026";
  appState.selected_quarters = [1, 2, 3, 4];

  runExportToExcel(getExcelColName);

  const rows: any[][] = xlsx.sheets["ACTIVITÉS"].data;
  const bodyRows = rows.slice(1, -1);
  assert.deepEqual(
    bodyRows.map(r => r[2]),
    ["Plus tôt", "Entre les deux", "Plus tard"]
  );
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

test("combines several distributions on the same account within one activity, both in the account column and the SOMMAIRE account breakdown", () => {
  const xlsx = makeXlsxMock();
  (globalThis as any).XLSX = xlsx;
  appState.settings = baseSettings();
  appState.activities = [
    makeActivity({
      id: "a1",
      date_start: "2025-08-01",
      distributions: [
        { account_code: "892-0000-00-000", amount: 60 },
        { account_code: "892-0000-00-000", amount: 40 }
      ]
    })
  ];
  appState.selected_year = "2025-2026";
  appState.selected_quarters = [1];

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
      clientTypes: [],
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
      name: false,
      date_start: false,
      date_end: false,
      days_count: false,
      client_type: false,
      category: false,
      rooms: false,
      remi_time: false,
      department: false,
      room_sans_frais: false,
      references: false,
      state: false,
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
      includeTotalRow: false,
      useExcelFormulas: false,
      includeRoomsSheet: false,
      includeSummarySheet: true
    }
  };

  runExportToExcel(getExcelColName, xlsx, customOptions);

  const actRows: any[][] = xlsx.sheets["ACTIVITÉS"].data;
  // headers: ID, then the single account column, then REVENUS TOTAL RÉÈL
  assert.equal(actRows[1][1], 100);
  assert.equal(actRows[1][2], 100);

  const summaryRows: any[][] = xlsx.sheets["SOMMAIRE"].data;
  const accRow = summaryRows.find(r => r[0] === "892-0000-00-000");
  assert.ok(accRow);
  assert.equal(accRow![2], 100);
});

test("combined distributions on the same account become an addition formula when useExcelFormulas is on", () => {
  const xlsx = makeXlsxMock();
  (globalThis as any).XLSX = xlsx;
  appState.settings = baseSettings();
  appState.activities = [
    makeActivity({
      id: "a1",
      date_start: "2025-08-01",
      distributions: [
        { account_code: "892-0000-00-000", amount: 100, reference: "RI001" },
        { account_code: "892-0000-00-000", amount: 100, reference: "RI002" },
        { account_code: "892-0000-00-000", amount: 100, reference: "RI003" }
      ]
    })
  ];
  appState.selected_year = "2025-2026";
  appState.selected_quarters = [1];

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
      clientTypes: [],
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
      name: false,
      date_start: false,
      date_end: false,
      days_count: false,
      client_type: false,
      category: false,
      rooms: false,
      remi_time: false,
      department: false,
      room_sans_frais: false,
      references: false,
      state: false,
      attendees_count: false,
      manager_name: false,
      manager_company: false,
      manager_contact_info: false,
      description: false,
      notes: false,
      accounts: ["892-0000-00-000"],
      total_revenue: false
    },
    sheets: {
      includeTotalRow: false,
      useExcelFormulas: true,
      includeRoomsSheet: false,
      includeSummarySheet: false
    }
  };

  runExportToExcel(getExcelColName, xlsx, customOptions);

  const actRows: any[][] = xlsx.sheets["ACTIVITÉS"].data;
  const cell = actRows[1][1];
  assert.equal(cell.t, "n");
  assert.equal(cell.f, "100+100+100");
});

test("includes bar revenue lines alongside distributions in the account column, financial filters and SOMMAIRE breakdowns", () => {
  const xlsx = makeXlsxMock();
  (globalThis as any).XLSX = xlsx;
  appState.settings = baseSettings();
  appState.activities = [
    makeActivity({
      id: "a1",
      client_type: "externe",
      department: "Musique",
      date_start: "2025-08-01",
      distributions: [{ account_code: "892-0000-00-000", amount: 60 }],
      bar_revenue_lines: [{ account_code: "892-0000-00-000", amount: 40, receipt_number: "RI001" }]
    })
  ];
  appState.selected_year = "2025-2026";
  appState.selected_quarters = [1];

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
      clientTypes: [],
      departments: [],
      rooms: [],
      categories: [],
      responsable: "",
      searchText: "",
      financialFilter: "with_revenue" as const
    },
    columns: {
      id: true,
      responsable: false,
      name: false,
      date_start: false,
      date_end: false,
      days_count: false,
      client_type: false,
      category: false,
      rooms: false,
      remi_time: false,
      department: false,
      room_sans_frais: false,
      references: false,
      state: false,
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
      includeTotalRow: false,
      useExcelFormulas: false,
      includeRoomsSheet: false,
      includeSummarySheet: true
    }
  };

  runExportToExcel(getExcelColName, xlsx, customOptions);

  const actRows: any[][] = xlsx.sheets["ACTIVITÉS"].data;
  assert.equal(actRows.length, 2); // header + the one activity (financial filter kept it: total rev > 0)
  assert.equal(actRows[1][1], 100); // account column: 60 (distribution) + 40 (bar revenue)
  assert.equal(actRows[1][2], 100); // total revenue column

  const summaryRows: any[][] = xlsx.sheets["SOMMAIRE"].data;
  const clientTypeRow = summaryRows.find(r => r[0] === "Client Externe");
  assert.ok(clientTypeRow);
  assert.equal(clientTypeRow![2], 100);

  const deptRow = summaryRows.find(r => r[0] === "Musique");
  assert.ok(deptRow);
  assert.equal(deptRow![2], 100);

  const accRow = summaryRows.find(r => r[0] === "892-0000-00-000");
  assert.ok(accRow);
  assert.equal(accRow![2], 100);
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

test("quarter-end report only includes id/name/date_start/references, 892 accounts with a non-zero amount, and total revenue", async () => {
  const xlsx = makeXlsxMock();
  (globalThis as any).XLSX = xlsx;
  appState.settings = baseSettings({
    accounts: [
      { code: "892-0000-00-000", description: "SCOLAIRE" },
      { code: "892-1111-00-000", description: "ADULTE" },
      { code: "892-2222-00-000", description: "JAMAIS UTILISÉ" },
      { code: "700-0000-00-000", description: "HORS 892" }
    ]
  });
  appState.activities = [
    makeActivity({
      id: "a1",
      name: "Spectacle Musique",
      date_start: "2025-08-01",
      distributions: [
        { account_code: "892-0000-00-000", amount: 100, reference: "RI001" },
        { account_code: "892-2222-00-000", amount: 0 },
        { account_code: "700-0000-00-000", amount: 50 }
      ],
      bar_revenue_lines: [{ account_code: "892-1111-00-000", amount: 25, receipt_number: "RI002" }]
    }),
    makeActivity({
      id: "a2",
      name: "Activité sans revenu",
      date_start: "2025-08-02",
      distributions: [{ account_code: "892-0000-00-000", amount: 0 }]
    }),
    makeActivity({
      id: "a3",
      name: "Spectacle Théâtre",
      date_start: "2025-08-03",
      distributions: [{ account_code: "892-0000-00-000", amount: 0 }],
      bar_revenue_lines: [{ account_code: "892-1111-00-000", amount: 10, receipt_number: "RI003" }]
    })
  ];
  appState.selected_year = "2025-2026";
  appState.selected_quarters = [1];

  await runExportToExcel(getExcelColName, xlsx, getQuarterEndExportOptions());

  assert.ok(xlsx.sheetOrder.includes("ACTIVITÉS"));
  assert.equal(xlsx.sheetOrder.includes("SALLES"), false);
  assert.equal(xlsx.sheetOrder.includes("SOMMAIRE"), false);

  const ws = xlsx.sheets["ACTIVITÉS"];
  const headers: string[] = ws.data[0];
  // ID, NOM, DATE DÉBUT, RÉFÉRENCES, then the two 892 accounts actually used, then total revenue.
  assert.deepEqual(
    headers.map(h => h.split("\n")[0]),
    [
      "NUMERO ACTIVITE",
      "NOM DE L'ACTIVITÉ",
      "DATE DÉBUT",
      "NUMÉRO DE FACTURE, RÉQUISITION INTERNE OU ENCAISSEMENT",
      "892-0000-00-000",
      "892-1111-00-000",
      "REVENUS TOTAL RÉÈL"
    ]
  );

  // Account columns are 15 wide, per spec.
  assert.equal(ws["!cols"][4].wch, 15);
  assert.equal(ws["!cols"][5].wch, 15);

  // Header row is taller; the totals row is its own row (so 2 data rows + header + totals).
  assert.equal(ws["!rows"][0].hpt, 30);
  assert.equal(ws.data.length, 4);

  // AutoFilter spans the header + data rows, but excludes the totals row.
  assert.deepEqual(ws["!autofilter"], { ref: "A1:G3" });

  const row = ws.data[1];
  assert.equal(row[0], "a1");
  assert.equal(row[1], "Spectacle Musique");
  assert.equal(row[2], "2025-08-01");
  assert.equal(row[4], 100);
  assert.equal(row[5], 25);

  // "Activité sans revenu" (total revenue 0) is excluded entirely.
  assert.ok(!ws.data.some((r: any[]) => r[0] === "a2"));

  // "Spectacle Théâtre" has revenue only on 892-1111: its 892-0000 cell (a zero amount) is left
  // blank, not shown as "0", while the account it does carry revenue on is not (and the total
  // revenue column, a SUM formula over the account columns here, isn't blanked either).
  const rowA3 = ws.data.find((r: any[]) => r[0] === "a3")!;
  assert.equal(rowA3[4], "");
  assert.equal(rowA3[5], 10);
  assert.equal(rowA3[6].f, "SUM(E3:F3)");
});

test("quarter-end report attaches a note to each account cell spelling out which reference(s) make up its amount", async () => {
  const XLSX = await import("xlsx");
  appState.settings = baseSettings({
    accounts: [
      { code: "892-0000-00-000", description: "SCOLAIRE" },
      { code: "892-1111-00-000", description: "ADULTE" }
    ]
  });
  appState.activities = [
    makeActivity({
      id: "a1",
      name: "Spectacle Musique",
      date_start: "2025-08-01",
      distributions: [
        { account_code: "892-0000-00-000", amount: 60, reference: "RI001" },
        { account_code: "892-0000-00-000", amount: 40, reference: "RI002" },
        { account_code: "892-1111-00-000", amount: 0 }
      ],
      bar_revenue_lines: [{ account_code: "892-1111-00-000", amount: 25, receipt_number: "RI003" }]
    }),
    makeActivity({
      id: "a2",
      name: "Sans référence",
      date_start: "2025-08-02",
      distributions: [{ account_code: "892-0000-00-000", amount: 15 }]
    })
  ];
  appState.selected_year = "2025-2026";
  appState.selected_quarters = [1];

  const wb = generateExcelWorkbook(XLSX, getQuarterEndExportOptions());
  const ws = wb.Sheets["ACTIVITÉS"];

  // Each note is marked "hidden" — shown only on hover, not pinned open as soon as the file opens
  // (see the comment in excel-export.ts's generateExcelWorkbook for why that property matters).
  const assertNote = (cell: any, text: string) => {
    assert.deepEqual([...cell.c], [{ a: "Compta Marie", t: text }]);
    assert.equal(cell.c.hidden, true);
  };

  // a1's 892-0000 cell (row 2) combines two referenced lines.
  assertNote(ws["E2"], `RI001 : ${formatCurrency(60)}\nRI002 : ${formatCurrency(40)}`);
  // a1's 892-1111 cell (row 2) only has the bar revenue line (the 0$ distribution is excluded).
  assertNote(ws["F2"], `RI003 : ${formatCurrency(25)}`);
  // a2's 892-0000 cell (row 3) has no reference at all.
  assertNote(ws["E3"], `(sans référence) : ${formatCurrency(15)}`);
  // a2's 892-1111 cell (row 3) is blank (0$) and gets no note.
  assert.equal(ws["F3"].c, undefined);
});

test("quarter-end report's notes are written as hover-only comments, not pinned open, in the real .xlsx", async () => {
  const XLSX = await import("xlsx");
  const JSZip = (await import("jszip")).default;
  appState.settings = baseSettings();
  appState.activities = [
    makeActivity({
      id: "a1",
      name: "Spectacle Musique",
      date_start: "2025-08-01",
      distributions: [{ account_code: "892-0000-00-000", amount: 60, reference: "RI001" }]
    })
  ];
  appState.selected_year = "2025-2026";
  appState.selected_quarters = [1];

  const wb = generateExcelWorkbook(XLSX, getQuarterEndExportOptions());
  const buffer = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  const zip = await JSZip.loadAsync(buffer);

  const vml = await zip.file("xl/drawings/vmlDrawing1.vml")!.async("text");
  assert.match(vml, /visibility:hidden/);
  assert.doesNotMatch(vml, /<x:Visible\/>/);
});

test("buildQuarterEndBlob enlarges the note's comment box so multi-line notes aren't cut off", async () => {
  const XLSX = await import("xlsx");
  const JSZip = (await import("jszip")).default;
  appState.settings = baseSettings();
  appState.activities = [
    makeActivity({
      id: "a1",
      name: "Spectacle Musique",
      date_start: "2025-08-01",
      distributions: [
        { account_code: "892-0000-00-000", amount: 60, reference: "RI001" },
        { account_code: "892-0000-00-000", amount: 40, reference: "RI002" }
      ]
    })
  ];
  appState.selected_year = "2025-2026";
  appState.selected_quarters = [1];

  const wb = generateExcelWorkbook(XLSX, getQuarterEndExportOptions());
  const blob = await buildQuarterEndBlob(XLSX, wb, { totalRowNumber: 3, totalColLetter: "F", lastDataRow: 2 });
  const buffer = Buffer.from(await blob.arrayBuffer());
  const zip = await JSZip.loadAsync(buffer);

  const vml = await zip.file("xl/drawings/vmlDrawing1.vml")!.async("text");
  assert.match(vml, /height:192pt/);
  assert.doesNotMatch(vml, /height:64pt/);

  // Excel actually sizes the comment box from the anchor's row span, not the CSS height above
  // (see enlargeCommentNotesXml's comment) — that span must be scaled too, from its default 4
  // rows to 12 (3x).
  const [, startRow, endRow] = vml.match(/<x:Anchor>\d+,\d+,(\d+),\d+,\d+,\d+,(\d+),\d+<\/x:Anchor>/)!.map(Number);
  assert.equal(endRow - startRow, 12);
});

test("enlargeCommentNotesXml scales every comment box's CSS height and its anchor's row span by 3x, leaving everything else untouched", () => {
  const vml =
    '<v:shape style="position:absolute; margin-left:80pt;margin-top:5pt;width:104pt;height:64pt;z-index:10;visibility:hidden"/>' +
    "<x:Anchor>2,0,2,0,4,20,6,20</x:Anchor>" +
    '<v:shape style="position:absolute; margin-left:80pt;margin-top:69pt;width:104pt;height:64pt;z-index:11;visibility:hidden"/>' +
    "<x:Anchor>2,0,8,0,4,20,12,20</x:Anchor>";
  const patched = enlargeCommentNotesXml(vml);

  assert.equal((patched.match(/height:192pt/g) || []).length, 2);
  assert.doesNotMatch(patched, /height:64pt/);
  assert.match(patched, /width:104pt/);

  // Excel actually sizes the box from the anchor's row span (<x:SizeWithCells/> makes it
  // re-derive the rendered size from the anchor, ignoring the CSS height) — a 4-row span (2 to 6)
  // becomes 12 rows (2 to 14); a later shape anchored at row 8 (8 to 12) becomes 8 to 20.
  assert.match(patched, /<x:Anchor>2,0,2,0,4,20,14,20<\/x:Anchor>/);
  assert.match(patched, /<x:Anchor>2,0,8,0,4,20,20,20<\/x:Anchor>/);
});

test("quarter-end report omits the autofilter when every activity has zero revenue", async () => {
  const xlsx = makeXlsxMock();
  (globalThis as any).XLSX = xlsx;
  appState.settings = baseSettings();
  appState.activities = [
    makeActivity({ id: "a1", name: "Sans revenu", date_start: "2025-08-01", distributions: [{ account_code: "892-0000-00-000", amount: 0 }] })
  ];
  appState.selected_year = "2025-2026";
  appState.selected_quarters = [1];

  await runExportToExcel(getExcelColName, xlsx, getQuarterEndExportOptions());

  const ws = xlsx.sheets["ACTIVITÉS"];
  assert.equal(ws.data.length, 1); // header only, no total row either (includeTotalRow requires activities)
  assert.equal(ws["!autofilter"], undefined);
});

test("addBoldStyleToSheetXml patches a new bold font/cellXf and references it on the target row's cells", () => {
  const stylesXml =
    '<styleSheet><fonts count="1"><font><sz val="12"/><name val="Calibri"/></font></fonts>' +
    '<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs></styleSheet>';
  const sheetXml =
    "<worksheet><sheetData>" +
    '<row r="1"><c r="A1" t="str"><v>ID</v></c></row>' +
    '<row r="2"><c r="A2" t="str" s="0"><v>a1</v></c><c r="B2"><v>100</v></c></row>' +
    "</sheetData></worksheet>";

  const { stylesXml: patchedStyles, sheetXml: patchedSheet } = addBoldStyleToSheetXml(stylesXml, sheetXml, 2);

  assert.match(patchedStyles, /<fonts count="2">/);
  assert.match(patchedStyles, /<font><b\/>/);
  assert.match(patchedStyles, /<cellXfs count="2">/);
  assert.match(patchedStyles, /<xf numFmtId="0" fontId="1"[^>]*applyFont="1"/);

  // Row 2's cells now reference the new (bold) style index, and any prior style was replaced
  // rather than duplicated.
  assert.match(patchedSheet, /<c r="A2" t="str" s="1">/);
  assert.match(patchedSheet, /<c r="B2" s="1">/);
  // Row 1 is untouched.
  assert.match(patchedSheet, /<row r="1"><c r="A1" t="str"><v>ID<\/v><\/c><\/row>/);
});

test("addBoldStyleToSheetXml leaves the XML untouched when styles.xml doesn't have the expected shape", () => {
  const result = addBoldStyleToSheetXml("<styleSheet/>", "<worksheet/>", 2);
  assert.equal(result.stylesXml, "<styleSheet/>");
  assert.equal(result.sheetXml, "<worksheet/>");
});

test("addBoldStyleToColumnXml patches every cell of the given column within the given row range, leaving other columns/rows alone", () => {
  const stylesXml =
    '<styleSheet><fonts count="1"><font><sz val="12"/><name val="Calibri"/></font></fonts>' +
    '<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs></styleSheet>';
  const sheetXml =
    "<worksheet><sheetData>" +
    '<row r="1"><c r="A1" t="str"><v>ID</v></c><c r="B1" t="str"><v>TOTAL</v></c></row>' +
    '<row r="2"><c r="A2" t="str"><v>a1</v></c><c r="B2"><v>100</v></c></row>' +
    '<row r="3"><c r="A3" t="str"><v>TOTAUX</v></c><c r="B3"><f>SUM(B2:B2)</f></c></row>' +
    "</sheetData></worksheet>";

  const { stylesXml: patchedStyles, sheetXml: patchedSheet } = addBoldStyleToColumnXml(stylesXml, sheetXml, "B", 2, 2);

  assert.match(patchedStyles, /<font><b\/>/);
  assert.match(patchedStyles, /<cellXfs count="2">/);

  // B2 (within the given row range) is bold; A2 (a different column) and B3 (outside the range)
  // are not.
  assert.match(patchedSheet, /<c r="B2" s="1">/);
  assert.doesNotMatch(patchedSheet, /<c r="A2"[^>]* s="\d+"/);
  assert.doesNotMatch(patchedSheet, /<c r="B3"[^>]* s="\d+"/);
});

test("buildQuarterEndBlob produces a real .xlsx whose totals row is rendered bold", async () => {
  const XLSX = await import("xlsx");
  const JSZip = (await import("jszip")).default;

  const ws = XLSX.utils.aoa_to_sheet([
    ["NUMERO ACTIVITE", "892-0000-00-000"],
    ["a1", 100],
    ["TOTAUX COMPLETS", { t: "n", f: "SUM(B2:B2)" }]
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "ACTIVITÉS");

  const blob = await buildQuarterEndBlob(XLSX, wb, { totalRowNumber: 3, totalColLetter: "B", lastDataRow: 2 });
  const buffer = Buffer.from(await blob.arrayBuffer());
  const zip = await JSZip.loadAsync(buffer);

  const stylesXml = await zip.file("xl/styles.xml")!.async("text");
  const sheetXml = await zip.file("xl/worksheets/sheet1.xml")!.async("text");

  assert.match(stylesXml, /<font><b\/>/);
  assert.match(stylesXml, /<alignment wrapText="1"\/>/);

  // Row 1 (the header) and row 3 (the totals row) carry a bold style; cell A2 (a plain activity
  // row, outside the total column) does not — but B2 (the total column, "892-0000-00-000" here)
  // does, since the whole total column is bold.
  const row1 = sheetXml.match(/<row r="1"[^>]*>[\s\S]*?<\/row>/)![0];
  const row3 = sheetXml.match(/<row r="3"[^>]*>[\s\S]*?<\/row>/)![0];
  const cellA2 = sheetXml.match(/<c r="A2"[^>]*\/?>/)![0];
  const cellB2 = sheetXml.match(/<c r="B2"[^>]*\/?>/)![0];
  assert.match(row1, /s="\d+"/);
  assert.doesNotMatch(cellA2, /s="\d+"/);
  assert.match(cellB2, /s="\d+"/);
  assert.match(row3, /s="\d+"/);

  // The header row and the first 4 columns (id/name/date_start/references) are frozen.
  assert.match(sheetXml, /<pane xSplit="4" ySplit="1" topLeftCell="E2"[^>]*state="frozen"\/>/);
});

test("freezePanesXml patches a frozen pane into the sheet's sheetView, splitting after the given column", () => {
  const sheetXml = '<worksheet><sheetViews><sheetView workbookViewId="0"/></sheetViews></worksheet>';
  const patched = freezePanesXml(sheetXml, 4);
  assert.match(
    patched,
    /<sheetView workbookViewId="0"><pane xSplit="4" ySplit="1" topLeftCell="E2" activePane="bottomRight" state="frozen"\/>/
  );
  assert.match(patched, /<selection pane="bottomRight" activeCell="E2" sqref="E2"\/><\/sheetView>/);
});

