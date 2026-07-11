import test from "node:test";
import assert from "node:assert/strict";
import { getActiveRateVersionField, getSalaryTarif, getServiceTarif } from "../src/state/pricing.ts";

test("getActiveRateVersionField returns 0 when there are no versions", () => {
  assert.equal(getActiveRateVersionField([], "2025-08-01", "rate"), 0);
  assert.equal(getActiveRateVersionField(undefined as any, "2025-08-01", "rate"), 0);
});

test("getActiveRateVersionField resolves the most recent version on or before the date", () => {
  const versions = [
    { effective_date: "2024-01-01", rate: 10 },
    { effective_date: "2025-01-01", rate: 20 },
    { effective_date: "2026-01-01", rate: 30 }
  ];
  assert.equal(getActiveRateVersionField(versions, "2025-06-01", "rate"), 20);
  assert.equal(getActiveRateVersionField(versions, "2027-01-01", "rate"), 30);
});

test("getActiveRateVersionField falls back to the earliest version when the date precedes every version", () => {
  const versions = [
    { effective_date: "2025-01-01", rate: 20 },
    { effective_date: "2024-01-01", rate: 10 }
  ];
  assert.equal(getActiveRateVersionField(versions, "2020-01-01", "rate"), 10);
});

test("getActiveRateVersionField falls back to the earliest version when no date is given", () => {
  const versions = [
    { effective_date: "2025-01-01", rate: 20 },
    { effective_date: "2024-01-01", rate: 10 }
  ];
  assert.equal(getActiveRateVersionField(versions, "", "rate"), 10);
});

test("getSalaryTarif returns the matching tarif by id", () => {
  const salary = {
    tarifs: [
      { id: "tarif-a", rate_versions: [] },
      { id: "tarif-b", rate_versions: [] }
    ]
  };
  assert.equal(getSalaryTarif(salary, "tarif-b")!.id, "tarif-b");
});

test("getSalaryTarif defaults to the first tarif when the id is missing or unknown", () => {
  const salary = { tarifs: [{ id: "tarif-a" }, { id: "tarif-b" }] };
  assert.equal(getSalaryTarif(salary)!.id, "tarif-a");
  assert.equal(getSalaryTarif(salary, "unknown-id")!.id, "tarif-a");
});

test("getSalaryTarif returns null for a salary with no tarifs and no legacy rate_versions", () => {
  assert.equal(getSalaryTarif({ tarifs: [] }), null);
  assert.equal(getSalaryTarif(undefined), null);
});

test("getSalaryTarif falls back to the salary itself (legacy shape) when it has rate_versions but no tarifs", () => {
  const legacySalary = { rate_versions: [{ effective_date: "", rate: 50 }] };
  assert.equal(getSalaryTarif(legacySalary), legacySalary);
});

test("getServiceTarif mirrors getSalaryTarif's default/fallback behaviour", () => {
  const service = { tarifs: [{ id: "tarif-x" }, { id: "tarif-y" }] };
  assert.equal(getServiceTarif(service, "tarif-y")!.id, "tarif-y");
  assert.equal(getServiceTarif(service, "unknown")!.id, "tarif-x");
  assert.equal(getServiceTarif({ tarifs: [] }), null);
});

export {};
