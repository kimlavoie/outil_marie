/**
 * "Facturation" tab: auto-populating GL distribution lines from the activity's rooms/staff/
 * services/fees, and the Facturée/Terminée state toggle buttons. Split out of activities-form.ts
 * (activity drawer form wiring).
 */
import { appState, getActiveSalaryRate, getActiveSalaryOvertimeRate, getActiveServiceRate, saveSafetyBackupToDb } from "../state/state.ts";
import { formatCurrency, calculateHoursFromTimes, escapeHtml } from "../utils/utils.ts";
import { logError } from "../utils/logger.ts";
import { addDistributionRow, updateDistributionTotal } from "./financials.ts";
import { collectReservationsFromForm, getAggregateEventDates } from "./reservations/index.ts";
import { getStaffRowHours } from "./reservations/subrows.ts";
import { commitActivityPatch } from "./form-state-bar.ts";
import { deriveActivityState } from "./render.ts";
import { renderSafetyBackupsList } from "../services/backup/reminder.ts";

// Typed shorthand for document.getElementById — see activities-financials.ts's `el` helper doc
// comment for why this cast is needed/safe.
function el<T extends Element = HTMLInputElement>(id: string): T {
  return document.getElementById(id) as unknown as T;
}

// Builds distribution rows (account_code/amount/reference) from whichever room parameters,
// personnel jobs, and autres frais already carry a configured GL account — items without one
// are left out so the user adds/maps them manually, consistent with the existing distribution
// row validation (an amount without a selected account blocks saving).
export async function generateBillingLines(act: any) {
  const replacingExisting = (act.distributions || []).length > 0;
  if (replacingExisting && !confirm("Des lignes de facturation existent déjà. Les remplacer par les lignes générées automatiquement ?")) {
    return;
  }

  // Génération automatique remplace toutes les lignes de facturation existantes d'un coup — un
  // point de restauration nommé permet de revenir en arrière même après avoir fermé le formulaire,
  // sans dépendre d'un Ctrl+Z. Voir "Sauvegarde & Exportations" > Sauvegardes de sécurité.
  if (replacingExisting) {
    try {
      await saveSafetyBackupToDb("avant_facturation_auto", JSON.parse(JSON.stringify(appState)));
      renderSafetyBackupsList();
    } catch (err) {
      logError("billing", "sauvegarde de sécurité avant génération automatique de facturation", err);
    }
  }

  el("form-distribution-list").innerHTML = "";

  const reservations = collectReservationsFromForm();
  const eventDateStart = getAggregateEventDates(reservations).date_start;

  const clientTypeEl = document.getElementById("form-activity-client-type") as HTMLSelectElement | null;
  const isInternal = clientTypeEl ? clientTypeEl.value === "interne" : act.client_type === "interne";

  reservations.forEach((r: any) => {
    const room = appState.settings.rooms.find((rm: any) => rm.name === r.room_name);
    if (r.tariff_amount > 0 && !isInternal) {
      const isHourly = room && room.rate_type === "hourly";
      if (isHourly) {
        const hours = (r.slots || []).reduce((sum: number, s: any) => {
          return sum + calculateHoursFromTimes(s.start_time, s.end_time);
        }, 0);
        const amount = r.tariff_amount * hours;
        const details = `Location salle ${r.room_name} - ${hours} heure${hours > 1 ? "s" : ""} à ${formatCurrency(r.tariff_amount)}/h`;
        addDistributionRow("", amount, "", details, true);
      } else {
        const days = r.slots.length;
        const details = `Location salle ${r.room_name} - ${days} jour${days > 1 ? "s" : ""} à ${formatCurrency(r.tariff_amount)}/jour`;
        addDistributionRow("", r.tariff_amount * days, "", details, true);
      }
    }
    if (room && typeof room.setup_fee === "number" && room.setup_fee > 0 && !isInternal) {
      const details = `Frais de montage et démontage - ${r.room_name}`;
      addDistributionRow("", room.setup_fee, "", details, true);
    }
  });

  document.querySelectorAll<HTMLElement>("#form-activity-reservations .room-staff-list .distribution-row-wrapper").forEach(wrapper => {
    const row = wrapper.querySelector<HTMLElement>(".distribution-row")!;
    const salaryId = row.querySelector<HTMLInputElement>(".staff-salary-select")!.value;
    const salary = ((appState.settings.salaries as any[]) || []).find((s: any) => s.id === salaryId);
    if (!salary) return;

    const useCustomRate = row.querySelector<HTMLInputElement>(".staff-use-custom-rate")?.checked || false;
    let rate = 0;
    let overtimeRate = 0;
    if (useCustomRate) {
      rate = parseFloat(wrapper.querySelector<HTMLInputElement>(".staff-custom-rate-input")!.value) || 0;
      overtimeRate = parseFloat(wrapper.querySelector<HTMLInputElement>(".staff-custom-overtime-rate-input")!.value) || 0;
    } else {
      rate = getActiveSalaryRate(salary, eventDateStart);
      overtimeRate = getActiveSalaryOvertimeRate(salary, eventDateStart);
    }

    const count = parseInt(row.querySelector<HTMLInputElement>(".staff-count-input")!.value, 10) || 0;
    const { hours, overtimeHours } = getStaffRowHours(row);
    const amount = rate * hours * count + overtimeRate * overtimeHours * count;
    if (amount > 0) {
      let details = `${count} ${salary.job}${count > 1 ? "s" : ""} de ${hours}h à ${formatCurrency(rate)}/h`;
      if (overtimeHours > 0) {
        details += ` + ${overtimeHours}h sup. à ${formatCurrency(overtimeRate)}/h`;
      }
      addDistributionRow("", amount, "", details, true);
    }
  });

  document.querySelectorAll<HTMLElement>("#form-activity-reservations .room-services-list .distribution-row").forEach(row => {
    const serviceId = row.querySelector<HTMLInputElement>(".service-select")!.value;
    const service = ((appState.settings.services as any[]) || []).find((s: any) => s.id === serviceId);
    const tarifId = row.querySelector<HTMLSelectElement>(".service-tarif-select")!.value;
    if (!service) return;

    let rate = 0;
    if (tarifId === "__custom__") {
      const wrapper = row.closest(".distribution-row-wrapper");
      rate = wrapper ? parseFloat(wrapper.querySelector<HTMLInputElement>(".service-custom-rate-input")!.value) || 0 : 0;
    } else {
      rate = getActiveServiceRate(service, eventDateStart, tarifId);
    }

    const hours = parseFloat(row.querySelector<HTMLInputElement>(".service-hours-input")!.value) || 0;
    const isHourly = service.type === "hourly";
    const amount = isHourly ? rate * hours : rate;
    if (amount > 0) {
      const details = isHourly ? `${service.name} de ${hours}h à ${formatCurrency(rate)}/h` : `${service.name} à ${formatCurrency(rate)}`;
      addDistributionRow("", amount, "", details, true);
    }
  });

  document.querySelectorAll<HTMLElement>("#form-activity-reservations .room-fees-list .distribution-row").forEach(row => {
    const amount = parseFloat(row.querySelector<HTMLInputElement>(".fee-amount-input")!.value) || 0;
    const description = row.querySelector<HTMLInputElement>(".fee-desc-input")?.value.trim() || "";
    if (amount > 0) addDistributionRow("", amount, "", description, true);
  });

  if (document.querySelectorAll("#form-distribution-list .distribution-row").length === 0) {
    addDistributionRow("", 0);
  }
  updateDistributionTotal();
}

// Renders the Facturée/Terminée billing dates and gated transition buttons
export function renderBillingStateStatus(act: any) {
  const container = el("billing-state-status");
  if (!container) return;

  container.innerHTML = `
    ${act.billed_at ? `<span style="color: var(--text-muted);">Facturée le ${escapeHtml(act.billed_at)}</span>` : ""}
    ${act.completed_at ? `<span style="color: var(--text-muted);">Terminée le ${escapeHtml(act.completed_at)}</span>` : ""}
    <button type="button" id="mark-billed-btn" class="btn ${act.billed_at ? "btn-secondary" : "btn-primary"}">${act.billed_at ? "Annuler Facturée" : "Marquer comme Facturée"}</button>
    <button type="button" id="mark-completed-btn" class="btn ${act.completed_at ? "btn-secondary" : "btn-primary"}">${act.completed_at ? "Annuler Terminée" : "Marquer comme Terminée"}</button>
  `;

  const billBtn = container.querySelector<HTMLButtonElement>("#mark-billed-btn")!;
  billBtn.addEventListener("click", () => {
    commitActivityPatch(act.id, (a: any) => {
      a.billed_at = a.billed_at ? "" : new Date().toISOString().split("T")[0];
      a.state = deriveActivityState(a);
    });
    renderBillingStateStatus(appState.activities.find((a: any) => a.id === act.id));
  });

  const completeBtn = container.querySelector<HTMLButtonElement>("#mark-completed-btn")!;
  completeBtn.addEventListener("click", () => {
    commitActivityPatch(act.id, (a: any) => {
      a.completed_at = a.completed_at ? "" : new Date().toISOString().split("T")[0];
      a.state = deriveActivityState(a);
    });
    renderBillingStateStatus(appState.activities.find((a: any) => a.id === act.id));
  });
}

// Checks whether an activity or the current form state has a bar service of type "Service d'hôtesses"
export function hasHostessBarService(act?: any): boolean {
  if (act && Array.isArray(act.reservations)) {
    if (act.reservations.some((r: any) => r.bar_service?.active && r.bar_service?.service_type === "Service d'hôtesses")) {
      return true;
    }
  }
  const container = document.getElementById("form-activity-reservations");
  if (!container) return false;
  const cards = container.querySelectorAll<HTMLElement>(".reservation-card");
  for (const card of Array.from(cards)) {
    const activeBtn = card.querySelector<HTMLElement>(".room-bar-toggle-group .pill-toggle.active");
    if (activeBtn) {
      const serviceTypeBtn = card.querySelector<HTMLElement>(".room-bar-service-type-group .pill-toggle.active");
      if (serviceTypeBtn && serviceTypeBtn.dataset.value === "Service d'hôtesses") {
        return true;
      }
    }
  }
  return false;
}

// Updates the visibility of the "Revenus du bar" section in the Facturation tab
export function updateBarRevenueSectionVisibility(act?: any): void {
  const section = document.getElementById("billing-bar-revenue-section");
  if (!section) return;
  const visible = hasHostessBarService(act);
  section.style.display = visible ? "block" : "none";
}

