// Versioned pricing/rate resolution shared by room tariffs, salaries and services. Every
// function here is pure (takes the room/salary/service/versions as a parameter) so it has no
// dependency on the global appState.

// Returns the pricing grid version in effect for `dateStr` (the most recent grid whose
// effective_date is empty or <= dateStr). Falls back to the earliest grid if dateStr is empty
// or precedes every version.
export function getActivePricingGrid(room: any, dateStr: string): any | null {
  const grids = (room && room.pricing_grids) || [];
  if (grids.length === 0) return null;
  const sorted = [...grids].sort((a, b) => (a.effective_date || "").localeCompare(b.effective_date || ""));
  if (!dateStr) return sorted[0];
  let applicable = sorted[0];
  sorted.forEach(g => {
    if (!g.effective_date || g.effective_date <= dateStr) applicable = g;
  });
  return applicable;
}

// Resolves the value of `field` from whichever rate version is in effect for `dateStr` (the
// most recent version whose effective_date is empty or <= dateStr; falls back to the earliest
// version if dateStr is empty or precedes every version).
export function getActiveRateVersionField(versions: any[], dateStr: string, field: string): number {
  versions = versions || [];
  if (versions.length === 0) return 0;
  const sorted = [...versions].sort((a, b) => (a.effective_date || "").localeCompare(b.effective_date || ""));
  if (!dateStr) return sorted[0][field] || 0;
  let applicable = sorted[0];
  sorted.forEach(v => {
    if (!v.effective_date || v.effective_date <= dateStr) applicable = v;
  });
  return applicable[field] || 0;
}

// Returns the tarif matching `tarifId` on `salary`. Since salaries no longer have multiple
// tarifs but have rate_versions directly, this returns the salary object itself if it contains
// rate_versions, falling back to tarifs list for backwards compatibility.
export function getSalaryTarif(salary: any, tarifId?: string): any | null {
  if (salary && salary.rate_versions) return salary;
  const tarifs = (salary && salary.tarifs) || [];
  if (tarifs.length === 0) return null;
  return tarifs.find((t: any) => t.id === tarifId) || tarifs[0];
}

// Returns the salary rate in effect for `dateStr` (same resolution rule as getActivePricingGrid)
export function getActiveSalaryRate(salary: any, dateStr: string, tarifId?: string): number {
  const tarif = getSalaryTarif(salary, tarifId);
  return getActiveRateVersionField(tarif && tarif.rate_versions, dateStr, "rate");
}

export function getActiveSalaryOvertimeRate(salary: any, dateStr: string, tarifId?: string): number {
  const tarif = getSalaryTarif(salary, tarifId);
  return getActiveRateVersionField(tarif && tarif.rate_versions, dateStr, "overtime_rate");
}

// Returns the tarif (named price point with its own budget account and rate history) matching
// `tarifId` on `service`, defaulting to the first configured tarif when none/an unknown id is
// given (mirrors the <select>'s own default of showing its first <option> until the user picks).
export function getServiceTarif(service: any, tarifId?: string): any | null {
  const tarifs = (service && service.tarifs) || [];
  if (tarifs.length === 0) return service && service.rate_versions ? service : null;
  return tarifs.find((t: any) => t.id === tarifId) || tarifs[0];
}

// Returns the rate in effect for `dateStr` on the given service's tarif (same resolution rule as
// getActivePricingGrid, applied to that tarif's own rate_versions history)
export function getActiveServiceRate(service: any, dateStr: string, tarifId?: string): number {
  const tarif = getServiceTarif(service, tarifId);
  return getActiveRateVersionField(tarif && tarif.rate_versions, dateStr, "rate");
}

// Compat shim: flattens a room's active pricing grid (cross product of parameters x client_types)
// into the old {id, description, amount} tarifs[] shape, so activities.js's room-tariff selector
// keeps working unchanged until Phase 3 makes it grid-aware (parameter + client type selects).
// `id` encodes "parameterId::clientTypeId" so the amount can be looked back up.
export function getFlattenedRoomTarifs(room: any, dateStr: string): any[] {
  const grid = getActivePricingGrid(room, dateStr);
  if (!grid) return [];
  const tarifs: any[] = [];
  grid.parameters.forEach((param: any) => {
    grid.client_types.forEach((ct: any) => {
      const cell = grid.cells.find((c: any) => c.parameter_id === param.id && c.client_type_id === ct.id);
      const desc = grid.parameters.length > 1 ? `${param.name} - ${ct.name}` : ct.name;
      tarifs.push({
        id: `${param.id}::${ct.id}`,
        description: desc,
        amount: cell ? cell.amount : 0
      });
    });
  });
  return tarifs;
}
