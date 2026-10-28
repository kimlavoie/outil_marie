/**
 * reservations/incomplete-row-warnings.ts - Rows dropped by collectStaffFromForm/
 * collectServicesFromForm/collectFeesFromForm because they're missing their identifier
 * (salary/service/description) but otherwise had data entered (hours, count, rate...) would
 * previously disappear silently on save. resetIncompleteRowWarnings() is called once per form
 * collection (see collectReservationsFromForm in reservations/index.ts) so callers can warn the
 * user instead.
 */
let incompleteRowWarnings: string[] = [];

export function resetIncompleteRowWarnings() {
  incompleteRowWarnings = [];
}

export function getIncompleteRowWarnings() {
  return incompleteRowWarnings;
}

export function pushIncompleteRowWarning(message: string) {
  incompleteRowWarnings.push(message);
}
