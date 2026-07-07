const test = require("node:test");
const assert = require("node:assert/strict");
const {
  getFiscalYear,
  getQuarterNumber,
  getQuarter,
  parseLocalDateStr,
  getActivePricingGrid,
  getActiveSalaryRate,
  getActiveSalaryOvertimeRate,
  getActiveServiceRate,
  getFlattenedRoomTarifs
} = require("../js/state.js");

test("getFiscalYear: July onward belongs to the year that just started", () => {
  assert.equal(getFiscalYear("2025-07-01"), "2025-2026");
  assert.equal(getFiscalYear("2025-08-15"), "2025-2026");
  assert.equal(getFiscalYear("2025-12-31"), "2025-2026");
});

test("getFiscalYear: January through June belongs to the year that's ending", () => {
  assert.equal(getFiscalYear("2025-01-01"), "2024-2025");
  assert.equal(getFiscalYear("2025-06-30"), "2024-2025");
});

test("getFiscalYear returns an empty string for missing/invalid dates", () => {
  assert.equal(getFiscalYear(""), "");
  assert.equal(getFiscalYear("not-a-date"), "");
});

test("getQuarterNumber maps months to fiscal quarters (Q1 = Jul-Sep)", () => {
  assert.equal(getQuarterNumber("2025-07-01"), 1);
  assert.equal(getQuarterNumber("2025-09-30"), 1);
  assert.equal(getQuarterNumber("2025-10-01"), 2);
  assert.equal(getQuarterNumber("2025-12-31"), 2);
  assert.equal(getQuarterNumber("2025-01-01"), 3);
  assert.equal(getQuarterNumber("2025-03-31"), 3);
  assert.equal(getQuarterNumber("2025-04-01"), 4);
  assert.equal(getQuarterNumber("2025-06-30"), 4);
});

test("getQuarter returns the matching human-readable label", () => {
  assert.equal(getQuarter("2025-08-01"), "T1 (Jul-Sep)");
  assert.equal(getQuarter("2025-11-01"), "T2 (Oct-Dec)");
  assert.equal(getQuarter("2025-02-01"), "T3 (Jan-Mar)");
  assert.equal(getQuarter("2025-05-01"), "T4 (Apr-Jun)");
});

test("parseLocalDateStr avoids the UTC-midnight off-by-one for YYYY-MM-DD strings", () => {
  const date = parseLocalDateStr("2025-03-10");
  assert.equal(date.getFullYear(), 2025);
  assert.equal(date.getMonth(), 2); // 0-indexed: March
  assert.equal(date.getDate(), 10);
});

// --- Versioned pricing grid / rate resolution (used by room tariffs, salaries, services) ---

test("getActivePricingGrid picks the most recent grid whose effective_date is on or before dateStr", () => {
  const room = {
    pricing_grids: [
      { id: "g1", effective_date: "2024-01-01" },
      { id: "g2", effective_date: "2025-01-01" },
      { id: "g3", effective_date: "2025-06-01" }
    ]
  };
  assert.equal(getActivePricingGrid(room, "2025-03-01").id, "g2");
  assert.equal(getActivePricingGrid(room, "2025-06-01").id, "g3");
  assert.equal(getActivePricingGrid(room, "2026-01-01").id, "g3");
});

test("getActivePricingGrid falls back to the earliest grid when dateStr precedes every version", () => {
  const room = {
    pricing_grids: [
      { id: "g1", effective_date: "2025-01-01" },
      { id: "g2", effective_date: "2025-06-01" }
    ]
  };
  assert.equal(getActivePricingGrid(room, "2020-01-01").id, "g1");
  assert.equal(getActivePricingGrid(room, "").id, "g1");
});

test("getActivePricingGrid returns null when the room has no pricing grids", () => {
  assert.equal(getActivePricingGrid({ pricing_grids: [] }, "2025-01-01"), null);
  assert.equal(getActivePricingGrid(null, "2025-01-01"), null);
});

test("getActiveSalaryRate and getActiveSalaryOvertimeRate resolve independently by effective date", () => {
  const salary = {
    rate_versions: [
      { effective_date: "2024-01-01", rate: 20, overtime_rate: 30 },
      { effective_date: "2025-01-01", rate: 22, overtime_rate: 33 }
    ]
  };
  assert.equal(getActiveSalaryRate(salary, "2024-06-01"), 20);
  assert.equal(getActiveSalaryRate(salary, "2025-06-01"), 22);
  assert.equal(getActiveSalaryOvertimeRate(salary, "2025-06-01"), 33);
});

test("getActiveServiceRate mirrors the same versioned rate resolution as salaries", () => {
  const service = { rate_versions: [{ effective_date: "", rate: 15 }] };
  assert.equal(getActiveServiceRate(service, "2025-01-01"), 15);
});

test("getActiveSalaryRate returns 0 when there are no rate versions", () => {
  assert.equal(getActiveSalaryRate({ rate_versions: [] }, "2025-01-01"), 0);
  assert.equal(getActiveSalaryRate({}, "2025-01-01"), 0);
});

test("getFlattenedRoomTarifs cross-products parameters x client types, naming by client type only when there's a single parameter", () => {
  const room = {
    pricing_grids: [
      {
        effective_date: "",
        parameters: [{ id: "p1", name: "Journée" }],
        client_types: [
          { id: "ct1", name: "Interne" },
          { id: "ct2", name: "Externe" }
        ],
        cells: [
          { parameter_id: "p1", client_type_id: "ct1", amount: 100 },
          { parameter_id: "p1", client_type_id: "ct2", amount: 200 }
        ]
      }
    ]
  };
  const tarifs = getFlattenedRoomTarifs(room, "2025-01-01");
  assert.equal(tarifs.length, 2);
  assert.deepEqual(
    tarifs.map(t => t.description),
    ["Interne", "Externe"]
  );
  assert.equal(tarifs[1].amount, 200);
});

test("getFlattenedRoomTarifs prefixes with the parameter name when there are multiple parameters", () => {
  const room = {
    pricing_grids: [
      {
        effective_date: "",
        parameters: [
          { id: "p1", name: "Journée" },
          { id: "p2", name: "Soirée" }
        ],
        client_types: [{ id: "ct1", name: "Interne" }],
        cells: [{ parameter_id: "p2", client_type_id: "ct1", amount: 50 }]
      }
    ]
  };
  const tarifs = getFlattenedRoomTarifs(room, "2025-01-01");
  assert.equal(tarifs.find(t => t.id === "p2::ct1").description, "Soirée - Interne");
  // No cell defined for p1::ct1: amount defaults to 0 rather than throwing
  assert.equal(tarifs.find(t => t.id === "p1::ct1").amount, 0);
});
