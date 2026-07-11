/**
 * activities-financial-summary.ts - Revenue subtotal computation (live form and saved records),
 * financial summary display, and the GL distribution total/warning.
 * Split out of activities-financials.ts (see that file for the rest of the module's history).
 */
import { appState, getActiveSalaryRate, getActiveSalaryOvertimeRate, getActiveServiceRate } from "../state/state.ts";
import { formatCurrency, getRoomsTariffTotal, elById } from "../utils/utils.ts";
import { collectReservationsFromForm, getAggregateEventDates } from "./reservations/index.ts";
import { updateStaffRowSubtotal, updateServiceRowSubtotal } from "./reservations/subrows.ts";

// Computes the pre-tax revenue subtotal (rooms + personnel + équipements + autres frais) from
// the live form. Shared by updateSubmissionFinancialSummary() (which adds TPS/TVQ on top) and
// updateDistributionTotal() (which uses the subtotal, untaxed, as the reference the entered GL
// distributions should add up to — the settings.accounts codes are all revenue accounts, no tax
// account exists among them).
function computeFormRevenueSubtotal(): { roomsTotal: number; staffTotal: number; servicesTotal: number; feesTotal: number; subtotal: number } {
  const reservations = collectReservationsFromForm();
  const roomsTotal = getRoomsTariffTotal({ reservations });
  const eventDateStart = getAggregateEventDates(reservations).date_start;

  let staffTotal = 0;
  document.querySelectorAll<HTMLElement>("#form-activity-reservations .room-staff-list .distribution-row").forEach(row => {
    updateStaffRowSubtotal(row);
    const salaryId = row.querySelector<HTMLInputElement>(".staff-salary-select")!.value;
    const tarifId = row.querySelector<HTMLInputElement>(".staff-tarif-select")!.value;
    const count = parseInt(row.querySelector<HTMLInputElement>(".staff-count-input")!.value, 10) || 0;
    const hours = parseFloat(row.querySelector<HTMLInputElement>(".staff-hours-input")!.value) || 0;
    const overtimeHours = parseFloat(row.querySelector<HTMLInputElement>(".staff-overtime-hours-input")!.value) || 0;
    let rate = 0;
    let overtimeRate = 0;
    if (tarifId === "__custom__") {
      const wrapper = row.closest(".distribution-row-wrapper");
      rate = wrapper ? parseFloat(wrapper.querySelector<HTMLInputElement>(".staff-custom-rate-input")!.value) || 0 : 0;
      overtimeRate = wrapper ? parseFloat(wrapper.querySelector<HTMLInputElement>(".staff-custom-overtime-rate-input")!.value) || 0 : 0;
    } else {
      const salary = (appState.settings.salaries || []).find((s: any) => s.id === salaryId);
      rate = salary ? getActiveSalaryRate(salary, eventDateStart, tarifId) : 0;
      overtimeRate = salary ? getActiveSalaryOvertimeRate(salary, eventDateStart, tarifId) : 0;
    }
    staffTotal += rate * hours * count + overtimeRate * overtimeHours * count;
  });

  let servicesTotal = 0;
  document.querySelectorAll<HTMLElement>("#form-activity-reservations .room-services-list .distribution-row").forEach(row => {
    updateServiceRowSubtotal(row);
    const serviceId = row.querySelector<HTMLInputElement>(".service-select")!.value;
    const tarifId = row.querySelector<HTMLInputElement>(".service-tarif-select")!.value;
    const count = parseInt(row.querySelector<HTMLInputElement>(".service-count-input")!.value, 10) || 0;
    const hours = parseFloat(row.querySelector<HTMLInputElement>(".service-hours-input")!.value) || 0;
    let rate = 0;
    if (tarifId === "__custom__") {
      const wrapper = row.closest(".distribution-row-wrapper");
      rate = wrapper ? parseFloat(wrapper.querySelector<HTMLInputElement>(".service-custom-rate-input")!.value) || 0 : 0;
    } else {
      const service = (appState.settings.services || []).find((s: any) => s.id === serviceId);
      rate = service ? getActiveServiceRate(service, eventDateStart, tarifId) : 0;
    }
    const service = (appState.settings.services || []).find((s: any) => s.id === serviceId);
    servicesTotal += service && service.type === "hourly" ? rate * hours * count : rate * count;
  });

  let feesTotal = 0;
  document.querySelectorAll("#form-activity-reservations .room-fees-list .distribution-row").forEach(row => {
    feesTotal += parseFloat(row.querySelector<HTMLInputElement>(".fee-amount-input")!.value) || 0;
  });

  return { roomsTotal, staffTotal, servicesTotal, feesTotal, subtotal: roomsTotal + staffTotal + servicesTotal + feesTotal };
}

// Recomputes and displays the room/personnel/frais subtotal, TPS (5%), TVQ (9.975%), and total
function updateSubmissionFinancialSummary() {
  const container = elById("submission-financial-summary");
  if (container) {
    const { roomsTotal, staffTotal, servicesTotal, feesTotal, subtotal } = computeFormRevenueSubtotal();
    const tps = subtotal * 0.05;
    const tvq = subtotal * 0.09975;
    const total = subtotal + tps + tvq;

    container.innerHTML = `
      <div class="financial-summary-row"><span>Location des salles</span><span>${formatCurrency(roomsTotal)}</span></div>
      <div class="financial-summary-row"><span>Personnel</span><span>${formatCurrency(staffTotal)}</span></div>
      <div class="financial-summary-row"><span>Équipements</span><span>${formatCurrency(servicesTotal)}</span></div>
      <div class="financial-summary-row"><span>Autres frais</span><span>${formatCurrency(feesTotal)}</span></div>
      <div class="financial-summary-row"><span>Sous-total</span><span>${formatCurrency(subtotal)}</span></div>
      <div class="financial-summary-row"><span>TPS (5%)</span><span>${formatCurrency(tps)}</span></div>
      <div class="financial-summary-row"><span>TVQ (9,975%)</span><span>${formatCurrency(tvq)}</span></div>
      <div class="financial-summary-row total"><span>Total</span><span>${formatCurrency(total)}</span></div>
    `;
  }

  // Keep the "Total saisi" distribution warning in sync too: reservations/staff/services/fees
  // changes call this function, not updateDistributionTotal(), but the subtotal they'd be
  // compared against just changed.
  updateDistributionTotal();
}

// Same subtotal/TPS/TVQ/total breakdown as updateSubmissionFinancialSummary(), but computed from
// a saved act.reservations[] instead of the live form (used for the printable PDF sheet, which
// must reflect the persisted record even when opened outside the drawer).
function computeActivityFinancials(act: any) {
  const reservations = act.reservations || [];
  const roomsTotal = getRoomsTariffTotal(act);
  const eventDateStart = getAggregateEventDates(reservations).date_start;

  let staffTotal = 0;
  let servicesTotal = 0;
  let feesTotal = 0;

  reservations.forEach((r: any) => {
    (r.staff || []).forEach((s: any) => {
      const salary = (appState.settings.salaries || []).find((sal: any) => sal.id === s.salary_id);
      let rate = 0;
      let overtimeRate = 0;
      if (s.tarif_id === "__custom__") {
        rate = s.custom_rate || 0;
        overtimeRate = s.custom_overtime_rate || 0;
      } else {
        rate = salary ? getActiveSalaryRate(salary, eventDateStart, s.tarif_id) : 0;
        overtimeRate = salary ? getActiveSalaryOvertimeRate(salary, eventDateStart, s.tarif_id) : 0;
      }
      staffTotal += rate * (s.hours || 0) * (s.count || 0) + overtimeRate * (s.overtime_hours || 0) * (s.count || 0);
    });
    (r.services || []).forEach((s: any) => {
      const service = (appState.settings.services || []).find((sv: any) => sv.id === s.service_id);
      let rate = 0;
      if (s.tarif_id === "__custom__") {
        rate = s.custom_rate || 0;
      } else {
        rate = service ? getActiveServiceRate(service, eventDateStart, s.tarif_id) : 0;
      }
      servicesTotal += service && service.type === "hourly" ? rate * (s.hours || 0) * (s.count || 0) : rate * (s.count || 0);
    });
    (r.fees || []).forEach((f: any) => {
      feesTotal += f.amount || 0;
    });
  });

  const subtotal = roomsTotal + staffTotal + servicesTotal + feesTotal;
  const tps = subtotal * 0.05;
  const tvq = subtotal * 0.09975;
  return { roomsTotal, staffTotal, servicesTotal, feesTotal, subtotal, tps, tvq, total: subtotal + tps + tvq };
}

function updateDistributionTotal() {
  const distributionListEl = elById("form-distribution-total-val");
  if (!distributionListEl) return;

  let total = 0;
  document.querySelectorAll(".dist-amount-input").forEach(input => {
    const val = parseFloat((input as HTMLInputElement).value) || 0;
    total += val;
  });
  distributionListEl.textContent = formatCurrency(total);

  // Warn (non-blocking — the discrepancy might be intentional, e.g. a partial invoice) when the
  // GL distributions entered don't add up to the activity's own calculated revenue, so a typo or
  // a forgotten line doesn't silently understate/overstate what gets reported to the GL.
  const warningEl = elById("form-distribution-total-warning");
  if (warningEl) {
    const { subtotal } = computeFormRevenueSubtotal();
    const diff = total - subtotal;
    if (Math.abs(diff) > 0.01) {
      warningEl.textContent = `Écart de ${formatCurrency(Math.abs(diff))} ${diff > 0 ? "au-dessus" : "en dessous"} du total calculé (${formatCurrency(subtotal)})`;
      warningEl.style.display = "inline";
    } else {
      warningEl.textContent = "";
      warningEl.style.display = "none";
    }
  }
}

export { computeFormRevenueSubtotal, updateSubmissionFinancialSummary, computeActivityFinancials, updateDistributionTotal };
