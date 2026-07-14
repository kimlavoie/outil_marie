import test from "node:test";
import assert from "node:assert/strict";

import { computeDashboardStats, computeEmployeeStats, computeJobsYearlyHours } from "../src/dashboard.ts";

const YEAR = "2025-2026";
const ALL_QUARTERS = [1, 2, 3, 4];

test("sums revenue and counts only filled activities within the selected period", () => {
  const activities = [
    { name: "Activité A", date_start: "2025-08-01", client_type: "externe", distributions: [{ amount: 100 }, { amount: 50 }] },
    { name: "", date_start: "2025-08-01", client_type: "externe", distributions: [{ amount: 999 }] }, // blank: ignored
    { name: "Activité B", date_start: "2024-08-01", client_type: "externe", distributions: [{ amount: 999 }] } // wrong fiscal year: ignored
  ];

  const stats = computeDashboardStats(activities as any[], YEAR, ALL_QUARTERS, []);
  assert.equal(stats.totalRevenue, 150);
  assert.equal(stats.filledCount, 1);
});

test("values internal bookings at their room tariff even when actual revenue was charged", () => {
  const activities = [
    {
      name: "Réunion interne",
      date_start: "2025-08-01",
      client_type: "interne",
      distributions: [{ amount: 50 }],
      reservations: [{ slots: [{ date: "2025-08-01" }], tariff_amount: 175 }]
    }
  ];

  const stats = computeDashboardStats(activities as any[], YEAR, ALL_QUARTERS, []);
  assert.equal(stats.totalInternalFree, 175);
});

test("does not value external bookings in totalInternalFree", () => {
  const activities = [
    {
      name: "Réunion externe",
      date_start: "2025-08-01",
      client_type: "externe",
      distributions: [],
      reservations: [{ slots: [{ date: "2025-08-01" }], tariff_amount: 175 }]
    }
  ];

  const stats = computeDashboardStats(activities as any[], YEAR, ALL_QUARTERS, []);
  assert.equal(stats.totalInternalFree, 0);
});

test("computes the reconciliation rate as valid / (all app-side records)", () => {
  const reconciliationResults = [
    { status: "valid" },
    { status: "valid" },
    { status: "diff" },
    { status: "unentered" } // excluded from the denominator: not an app-side record
  ];

  const stats = computeDashboardStats([], YEAR, ALL_QUARTERS, reconciliationResults);
  assert.equal(stats.reconciliationRate, 67); // 2/3 rounded
});

test("reconciliation rate is 0 when there are no results yet", () => {
  const stats = computeDashboardStats([], YEAR, ALL_QUARTERS, []);
  assert.equal(stats.reconciliationRate, 0);
});

test("ignores activities that are marked as deleted", () => {
  const activities = [
    { name: "Activité A", date_start: "2025-08-01", client_type: "externe", distributions: [{ amount: 100 }] },
    { name: "Activité Supprimée", date_start: "2025-08-01", client_type: "externe", deleted: true, distributions: [{ amount: 500 }] }
  ];

  const stats = computeDashboardStats(activities as any[], YEAR, ALL_QUARTERS, []);
  assert.equal(stats.totalRevenue, 100);
  assert.equal(stats.filledCount, 1);
});

test("computeEmployeeStats calculates normal hours, overtime hours and amounts accurately", () => {
  const salariesList = [
    {
      id: "salary-dt",
      job: "Directeur technique",
      rate_versions: [
        { id: "rv-dt", effective_date: "", rate: 50, overtime_rate: 75 }
      ]
    }
  ];

  const activities = [
    {
      name: "Activité A",
      date_start: "2025-08-01", // Q1
      reservations: [
        {
          staff: [
            {
              salary_id: "salary-dt",
              count: 2,
              hours: 5,
              overtime_hours: 2,
              tarif_id: "tarif-dt"
            }
          ]
        }
      ]
    },
    {
      name: "Activité B",
      date_start: "2025-11-01", // Q2
      reservations: [
        {
          staff: [
            {
              salary_id: "salary-dt",
              count: 1,
              hours: 10,
              overtime_hours: 0,
              tarif_id: "tarif-dt"
            }
          ]
        }
      ]
    },
    {
      name: "Activité C (autre employé)",
      date_start: "2025-08-01",
      reservations: [
        {
          staff: [
            {
              salary_id: "salary-hote",
              count: 1,
              hours: 4,
              overtime_hours: 0,
              tarif_id: "tarif-hote"
            }
          ]
        }
      ]
    }
  ];

  const result = computeEmployeeStats("salary-dt", activities as any[], "2025-2026", [1], salariesList);

  assert.equal(result.totalNormalHours, 10);
  assert.equal(result.totalOvertimeHours, 4);
  assert.equal(result.totalAmount, 800);

  assert.equal(result.quarterDetails[1].normalHours, 10);
  assert.equal(result.quarterDetails[1].overtimeHours, 4);
  assert.equal(result.quarterDetails[1].amount, 800);

  assert.equal(result.quarterDetails[2].normalHours, 10);
  assert.equal(result.quarterDetails[2].overtimeHours, 0);
  assert.equal(result.quarterDetails[2].amount, 500);

  assert.equal(result.contributingActivities.length, 1);
  assert.equal(result.contributingActivities[0].name, "Activité A");
  assert.equal(result.contributingActivities[0].normalHours, 10);
  assert.equal(result.contributingActivities[0].overtimeHours, 4);
  assert.equal(result.contributingActivities[0].amount, 800);
});

test("computeJobsYearlyHours aggregates hours per job type for the selected fiscal year", () => {
  const salariesList = [
    { id: "sal-1", job: "Technicien", rate_versions: [] },
    { id: "sal-2", job: "Hôte", rate_versions: [] }
  ];

  const activities = [
    {
      name: "Activité A",
      date_start: "2025-08-01",
      reservations: [
        {
          staff: [
            { salary_id: "sal-1", count: 2, hours: 5, overtime_hours: 1 },
            { salary_id: "sal-2", count: 1, hours: 4, overtime_hours: 0 }
          ]
        }
      ]
    },
    {
      name: "Activité B",
      date_start: "2026-02-01",
      reservations: [
        {
          staff: [
            { salary_id: "sal-1", count: 1, hours: 3, overtime_hours: 2 }
          ]
        }
      ]
    },
    {
      name: "Activité C (autre année)",
      date_start: "2024-08-01",
      reservations: [
        {
          staff: [
            { salary_id: "sal-1", count: 1, hours: 10, overtime_hours: 0 }
          ]
        }
      ]
    },
    {
      name: "Activité Supprimée",
      date_start: "2025-09-01",
      deleted: true,
      reservations: [
        {
          staff: [
            { salary_id: "sal-1", count: 1, hours: 10, overtime_hours: 0 }
          ]
        }
      ]
    }
  ];

  const result = computeJobsYearlyHours(activities as any[], "2025-2026", salariesList);

  assert.equal(result.length, 2);

  // sal-1: Act A: (5 * 2) = 10 normal, (1 * 2) = 2 overtime. Act B: (3 * 1) = 3 normal, (2 * 1) = 2 overtime. Total: 13 normal, 4 overtime = 17 total.
  assert.equal(result[0].jobId, "sal-1");
  assert.equal(result[0].jobName, "Technicien");
  assert.equal(result[0].normalHours, 13);
  assert.equal(result[0].overtimeHours, 4);
  assert.equal(result[0].totalHours, 17);

  // sal-2: Act A: (4 * 1) = 4 normal, 0 overtime. Total: 4.
  assert.equal(result[1].jobId, "sal-2");
  assert.equal(result[1].jobName, "Hôte");
  assert.equal(result[1].normalHours, 4);
  assert.equal(result[1].overtimeHours, 0);
  assert.equal(result[1].totalHours, 4);
});

export {};
