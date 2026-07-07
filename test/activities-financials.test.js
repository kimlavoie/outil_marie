import test from "node:test";
import assert from "node:assert/strict";

// computeActivityFinancials calls appState, getRoomsTariffTotal, getAggregateEventDates,
// getActiveSalaryRate and getActiveServiceRate as globals (plain <script> globals in the
// browser); wire them up before importing it.
import { getRoomsTariffTotal } from "../js/utils.js";
import { getActiveSalaryRate, getActiveSalaryOvertimeRate, getActiveServiceRate } from "../js/state.js";
import { getAggregateEventDates } from "../js/activities-reservations.js";
global.getRoomsTariffTotal = getRoomsTariffTotal;
global.getActiveSalaryRate = getActiveSalaryRate;
global.getActiveSalaryOvertimeRate = getActiveSalaryOvertimeRate;
global.getActiveServiceRate = getActiveServiceRate;
global.getAggregateEventDates = getAggregateEventDates;
global.appState = {
  settings: {
    salaries: [{ id: "sal1", rate_versions: [{ effective_date: "", rate: 20, overtime_rate: 30 }] }],
    services: [
      { id: "svc-hourly", type: "hourly", rate_versions: [{ effective_date: "", rate: 10 }] },
      { id: "svc-flat", type: "flat", rate_versions: [{ effective_date: "", rate: 50 }] }
    ]
  }
};

import { computeActivityFinancials } from "../js/activities-financials.js";

function makeActivity(reservationOverrides) {
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
