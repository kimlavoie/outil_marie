/**
 * reservations/row-dom-helpers.ts - Tiny DOM helpers shared by staff-rows.ts/service-rows.ts
 * (the subtotal calculations need an element lookup and a fallback date to price against).
 */
export function el<T extends Element = HTMLInputElement>(id: string): T {
  return document.getElementById(id) as unknown as T;
}

// Earliest slot date across the form, queried from the DOM directly to avoid a circular
// dependency with reservations/index.ts's collectReservationsFromForm().
export function getEarliestSlotDateFromDom(): string {
  const dates = Array.from(document.querySelectorAll<HTMLInputElement>(".slot-date-input"))
    .map(el => el.value)
    .filter(Boolean)
    .sort();
  return dates[0] || "";
}
