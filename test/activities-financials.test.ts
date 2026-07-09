import test from "node:test";
import assert from "node:assert/strict";

// activities-financials.ts imports appState directly from state.js (a real, shared, mutable
// object) rather than reading it as a global, so we set up its test fixture by mutating that same
// imported object's .settings rather than replacing the binding.
import { appState } from "../src/state/state.ts";
import { computeActivityFinancials, generateNextActivityId, buildPrintActivitySheetHtml } from "../src/activities/financials.ts";

appState.settings = {
  theme: "dark",
  rooms: [],
  departments: [],
  accounts: [],
  last_backup_date: "",
  backup_reminder_days: 7,
  salaries: [{ id: "sal1", rate_versions: [{ effective_date: "", rate: 20, overtime_rate: 30 }] }],
  services: [
    { id: "svc-hourly", type: "hourly", rate_versions: [{ effective_date: "", rate: 10 }] },
    { id: "svc-flat", type: "flat", rate_versions: [{ effective_date: "", rate: 50 }] }
  ],
  global_tasks: [],
  schedulable_tasks: []
};

function makeActivity(reservationOverrides: any): any {
  return {
    reservations: [
      {
        tariff_amount: 100,
        slots: [{ date: "2025-08-01" }, { date: "2025-08-02" }], // 2 days
        staff: [],
        services: [],
        fees: [],
        ...reservationOverrides
      }
    ]
  };
}

test("computeActivityFinancials sums room tariff (per day) with no personnel/services/fees", () => {
  const fin = computeActivityFinancials(makeActivity({}));
  assert.equal(fin.roomsTotal, 200); // 100/day x 2 days
  assert.equal(fin.staffTotal, 0);
  assert.equal(fin.servicesTotal, 0);
  assert.equal(fin.feesTotal, 0);
  assert.equal(fin.subtotal, 200);
});

test("computeActivityFinancials totals staff cost as (rate x hours + overtime rate x overtime hours) x count", () => {
  const fin = computeActivityFinancials(
    makeActivity({ staff: [{ salary_id: "sal1", hours: 4, count: 2, overtime_hours: 1 }] })
  );
  // (20 * 4 * 2) + (30 * 1 * 2) = 160 + 60 = 220
  assert.equal(fin.staffTotal, 220);
});

test("computeActivityFinancials rates hourly services by hours x count, flat services by count only", () => {
  const fin = computeActivityFinancials(
    makeActivity({
      services: [
        { service_id: "svc-hourly", hours: 3, count: 2 },
        { service_id: "svc-flat", hours: 999, count: 2 } // hours ignored for a flat-rate service
      ]
    })
  );
  // hourly: 10 * 3 * 2 = 60; flat: 50 * 2 = 100
  assert.equal(fin.servicesTotal, 160);
});

test("computeActivityFinancials sums flat fee amounts regardless of room/day count", () => {
  const fin = computeActivityFinancials(makeActivity({ fees: [{ amount: 25 }, { amount: 15 }] }));
  assert.equal(fin.feesTotal, 40);
});

test("computeActivityFinancials applies Quebec taxes (TPS 5%, TVQ 9.975%) on the subtotal", () => {
  const fin = computeActivityFinancials(makeActivity({}));
  assert.equal(fin.subtotal, 200);
  assert.equal(fin.tps, 10); // 200 * 0.05
  assert.ok(Math.abs(fin.tvq - 19.95) < 1e-9); // 200 * 0.09975
  assert.ok(Math.abs(fin.total - (200 + 10 + 19.95)) < 1e-9);
});

test("computeActivityFinancials returns all zeros for an activity with no reservations array", () => {
  const fin = computeActivityFinancials({});
  assert.equal(fin.roomsTotal, 0);
  assert.equal(fin.staffTotal, 0);
  assert.equal(fin.servicesTotal, 0);
  assert.equal(fin.feesTotal, 0);
  assert.equal(fin.subtotal, 0);
  assert.equal(fin.total, 0);
});

test("computeActivityFinancials aggregates totals across multiple reservations on the same activity", () => {
  const fin = computeActivityFinancials({
    reservations: [
      { tariff_amount: 100, slots: [{ date: "2025-08-01" }], staff: [], services: [], fees: [{ amount: 10 }] },
      { tariff_amount: 50, slots: [{ date: "2025-08-01" }], staff: [], services: [], fees: [{ amount: 5 }] }
    ]
  });
  assert.equal(fin.roomsTotal, 150);
  assert.equal(fin.feesTotal, 15);
  assert.equal(fin.subtotal, 165);
});

test("computeActivityFinancials treats an unknown salary/service id as a zero rate instead of throwing", () => {
  const fin = computeActivityFinancials(
    makeActivity({
      staff: [{ salary_id: "does-not-exist", hours: 5, count: 1 }],
      services: [{ service_id: "does-not-exist", hours: 5, count: 1 }]
    })
  );
  assert.equal(fin.staffTotal, 0);
  assert.equal(fin.servicesTotal, 0);
});

test("generateNextActivityId generates next chronological ID for fiscal year", () => {
  appState.selected_year = "2025-2026";
  appState.activities = [
    { id: "2526-001", name: "Activité 1" },
    { id: "2526-002", name: "Activité 2" },
    { id: "2425-005", name: "Activité ancienne" }
  ];
  
  const nextId = generateNextActivityId();
  assert.equal(nextId, "2526-003");
});

test("generateNextActivityId falls back to 001 if no activities exist for year", () => {
  appState.selected_year = "2025-2026";
  appState.activities = [];
  
  const nextId = generateNextActivityId();
  assert.equal(nextId, "2526-001");
});

test("buildPrintActivitySheetHtml generates print layout template", () => {
  const act = {
    id: "2526-001",
    name: "Conférence Climat",
    mode: "estimation",
    client_type: "externe",
    activity_manager: { first_name: "Marie", last_name: "Gérante", phone: "514-987-6543", email: "marie@admin.com" },
    reservations: [
      {
        room_name: "Salle François-Brassard (326.1)",
        tariff_description: "Tarif Régulier",
        tariff_amount: 150,
        slots: [{ date: "2025-08-01", start_time: "09:00", end_time: "17:00" }]
      }
    ]
  };

  const html = buildPrintActivitySheetHtml(act);
  assert.ok(html.includes("<h1>Estimation</h1>"));
  assert.ok(html.includes("Conférence Climat"));
  assert.ok(html.includes("Marie Gérante"));
  assert.ok(html.includes("Salle François-Brassard"));
  const normalizedHtml = html.replace(/\u00a0/g, " ");
  assert.ok(normalizedHtml.includes("150,00 $") || normalizedHtml.includes("150.00 $") || (normalizedHtml.includes("150") && normalizedHtml.includes("$")));
});
export {};
