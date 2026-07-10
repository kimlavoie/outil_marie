/**
 * activities-financials.ts - Financial summary computation, PDF print sheet,
 * drawer open/close/cancel lifecycle, and revenue distribution rows.
 * Part 4/5 of the activities module (see activities-render.js for context).
 *
 * Manipulates the activity drawer/form directly — like js/datepicker.ts, js/activities-file-links.ts,
 * js/activities-history.ts, js/activities-render.ts and js/activities-form.ts, this stays a plain
 * TS module rather than a React component until Réservations (activities-reservations.js) gets
 * its own turn in Phase 4 and the drawer becomes React.
 *
 * updateFormDatesHelper/scheduleActivityUndoSnapshot/saveActivityVersion (all defined in
 * activities-history.ts, which itself imports several things from this file) are real imports —
 * a circular import between the two, same as the several others already in this codebase (see
 * TODO.txt): safe since nothing runs during either module's top-level evaluation.
 */
import { clearDateFieldErrors } from "./datepicker.ts";
import {
  appState,
  saveDatabase,
  getActiveSalaryRate,
  getActiveSalaryOvertimeRate,
  getActiveServiceRate,
  recordActivityView,
  EVENT_TYPES
} from "../state/state.ts";
import {
  formatCurrency,
  escapeHtml,
  getReservationRoomLabel,
  getRoomsTariffTotal,
  showLoadingOverlay,
  hideLoadingOverlay,
  showToast,
  buildSearchableSelectHtml,
  initSearchableSelectEl,
  rejectNegativeAmountOnBlur
} from "../utils/utils.ts";
import { isNonEmptyString } from "../utils/validation.ts";
import { activitiesState, renderActivities, getActivityStateLabel } from "./render.ts";
import { collectReservationsFromForm, getAggregateEventDates } from "./reservations.ts";
import { updateStaffRowSubtotal, updateServiceRowSubtotal } from "./reservation-subrows.ts";
import { reconciliationState, reconcileLedger } from "../services/reconciliation.ts";
import { fillActivityFormFields, renderActivityStateBar, switchActivityTab, getActivityFormMode, updateFormTabIndicators } from "./form.ts";
import { updateFormDatesHelper, saveActivityVersion, scheduleActivityUndoSnapshot } from "./history.ts";

// Persists which activity record (and which of its tabs) is currently open in the drawer, so
// reloading/reopening the app can drop the user back exactly where they left off. Kept in its own
// localStorage key (rather than folded into state.ts's saveUiState/UI_STATE_KEY) since it's read
// once at startup by main.ts before the activities view even exists, not re-derived from the DOM
// on every render like the activities list filters are.
const DRAWER_UI_KEY = "outil_marie_drawer_ui";

function persistDrawerUiState(id: string, tab: string) {
  localStorage.setItem(DRAWER_UI_KEY, JSON.stringify({ id, tab }));
}

function clearDrawerUiState() {
  localStorage.removeItem(DRAWER_UI_KEY);
}

function getSavedDrawerUiState(): { id: string; tab: string } | null {
  try {
    const raw = localStorage.getItem(DRAWER_UI_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// Typed shorthand for document.getElementById in this file's heavy DOM-manipulation code:
// getElementById returns plain Element, which lacks .value/.disabled/.style/.focus() etc. Since
// this file predates any type annotations on the actual markup, casting to HTMLInputElement (a
// safe superset of the properties used below, including on <select>/<button> elements the real
// DOM doesn't strictly type that way) avoids ~45 one-off casts without changing any behavior.
function el<T extends Element = HTMLInputElement>(id: string): T {
  return document.getElementById(id) as unknown as T;
}

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
  const container = el("submission-financial-summary");
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

// Builds the printable/PDF activity sheet's markup (client, gestionnaire, réservations, sommaire
// financier), rendered offscreen into #print-activity-sheet and shown only via @media print.
function buildPrintActivitySheetHtml(act: any) {
  const fin = computeActivityFinancials(act);
  const manager = act.activity_manager || {};
  const today = new Date();
  const generatedDate = `${today.getFullYear()}/${String(today.getMonth() + 1).padStart(2, "0")}/${String(today.getDate()).padStart(2, "0")}`;

  const reservations = act.reservations || [];
  const hasBarService = reservations.some((r: any) => r.bar_service?.active);
  const barReservations = reservations.filter((r: any) => r.bar_service?.active);

  const roomsRows = reservations
    .map((r: any) => {
      const days = (r.slots || []).length;
      const slotsText =
        (r.slots || [])
          .map((s: any) => `${s.date.replace(/-/g, "/")}${s.start_time ? " " + s.start_time : ""}${s.end_time ? "–" + s.end_time : ""}`)
          .join(", ") || "-";
      return `
        <tr>
          <td>${escapeHtml(getReservationRoomLabel(r))}</td>
          <td>${slotsText}</td>
          <td>${escapeHtml(r.tariff_description) || "-"}</td>
          <td>${formatCurrency(r.tariff_amount || 0)}</td>
          <td>${days}</td>
          <td>${formatCurrency((r.tariff_amount || 0) * days)}</td>
        </tr>
      `;
    })
    .join("");

  const barSectionHtml =
    barReservations.length > 0
      ? `
    <div class="print-sheet-section">
      <h2>Détails du service de bar</h2>
      <div style="display: flex; flex-direction: column; gap: 8px;">
        ${barReservations
          .map((r: any) => {
            const roomLabel = getReservationRoomLabel(r);
            const bs = r.bar_service;
            const detailsList = [];
            if (bs.drink_type) detailsList.push(`<strong>Type de boisson :</strong> ${escapeHtml(bs.drink_type)}`);
            if (bs.service_type) detailsList.push(`<strong>Type de service :</strong> ${escapeHtml(bs.service_type)}`);
            if (
              bs.hostess_count &&
              bs.hostess_count > 0 &&
              (bs.service_type === "Service d'hôtesses" || bs.service_type === "Distribution de breuvages et nettoyage de coupes")
            ) {
              detailsList.push(`<strong>Nombre d'hôtesses :</strong> ${bs.hostess_count}`);
            }
            if (bs.special_order) detailsList.push(`<strong>Commande spéciale :</strong> ${escapeHtml(bs.special_order)}`);

            return `
            <div style="border-left: 3px solid var(--primary, #3b82f6); padding-left: 10px; margin-bottom: 8px;">
              <div style="font-weight: 600; font-size: 0.9rem; margin-bottom: 4px; color: var(--text-color);">${escapeHtml(roomLabel)}</div>
              <div class="print-sheet-grid">
                ${detailsList.map(detail => `<div>${detail}</div>`).join("")}
              </div>
            </div>
          `;
          })
          .join("")}
      </div>
    </div>
    `
      : "";

  return `
    <div class="print-sheet-header">
      <div>
        <h1>${act.mode === "estimation" ? "Estimation" : "Soumission / Contrat"}</h1>
        <div class="print-sheet-subtitle">Activité ${act.id} — ${escapeHtml(act.name) || "(Sans nom)"}</div>
      </div>
      <div class="print-sheet-subtitle">Généré le ${generatedDate}</div>
    </div>

    <div class="print-sheet-section">
      <h2>Gestionnaire responsable</h2>
      <div class="print-sheet-grid">
        <div><strong>Nom :</strong> ${escapeHtml(manager.first_name)} ${escapeHtml(manager.last_name)}</div>
        <div><strong>Type de client :</strong> ${act.client_type === "interne" ? "Interne" : "Externe"}</div>
        <div><strong>Téléphone :</strong> ${escapeHtml(manager.phone) || "-"}</div>
        <div><strong>Courriel :</strong> ${escapeHtml(manager.email) || "-"}</div>
        <div><strong>Service de bar :</strong> ${hasBarService ? "Oui" : "Non"}</div>
        ${
          manager.type === "externe"
            ? `
        <div><strong>Entreprise :</strong> ${escapeHtml(manager.company_name) || "-"}</div>
        <div><strong>Numéro de client (COBA) :</strong> ${escapeHtml(manager.coba_client_number) || "-"}</div>
        <div><strong>Adresse :</strong> ${escapeHtml(manager.address) || "-"}</div>
        <div><strong>Ville :</strong> ${escapeHtml(manager.city) || "-"}</div>
        <div><strong>Province :</strong> ${escapeHtml(manager.province) || "-"}</div>
        <div><strong>Code postal :</strong> ${escapeHtml(manager.postal_code) || "-"}</div>
        `
            : ""
        }
      </div>
    </div>

    <div class="print-sheet-section">
      <h2>Réservations de salle</h2>
      <table class="print-sheet-table">
        <thead>
          <tr><th>Salle</th><th>Créneaux</th><th>Tarif</th><th>Montant / jour</th><th>Jours</th><th>Sous-total</th></tr>
        </thead>
        <tbody>${roomsRows || `<tr><td colspan="6">Aucune réservation.</td></tr>`}</tbody>
      </table>
    </div>

    ${barSectionHtml}

    <div class="print-sheet-section">
      <h2>Sommaire financier</h2>
      <table class="print-sheet-total-table">
        <tr><td>Location des salles</td><td>${formatCurrency(fin.roomsTotal)}</td></tr>
        <tr><td>Personnel</td><td>${formatCurrency(fin.staffTotal)}</td></tr>
        <tr><td>Équipements</td><td>${formatCurrency(fin.servicesTotal)}</td></tr>
        <tr><td>Autres frais</td><td>${formatCurrency(fin.feesTotal)}</td></tr>
        <tr><td>Sous-total</td><td>${formatCurrency(fin.subtotal)}</td></tr>
        <tr><td>TPS (5%)</td><td>${formatCurrency(fin.tps)}</td></tr>
        <tr><td>TVQ (9,975%)</td><td>${formatCurrency(fin.tvq)}</td></tr>
        <tr class="print-sheet-grand-total"><td>Total</td><td>${formatCurrency(fin.total)}</td></tr>
      </table>
    </div>
  `;
}

// rows instead of showing empty placeholders.
function buildActivityDetailsHtml(act: any) {
  const manager = act.activity_manager || {};
  const eventTypeLabel = (() => {
    if (!act.event_type) return "";
    if (act.event_type === "autre") return act.event_type_other || "Autre";
    const found = EVENT_TYPES.find((t: any) => t.value === act.event_type);
    return found ? found.label : act.event_type;
  })();

  const reservations = act.reservations || [];
  const hasBarService = reservations.some((r: any) => r.bar_service?.active);
  const barReservations = reservations.filter((r: any) => r.bar_service?.active);

  const infoRows = [
    ["Statut", getActivityStateLabel(act.state)],
    ["Références COBA", act.coba],
    ["Département", act.department],
    ["Nombre de personnes", act.attendees_count ? String(act.attendees_count) : ""],
    ["Type d'événement", eventTypeLabel],
    ["Responsable facturation", act.responsable],
    ["Type de client", act.client_type === "interne" ? "Interne" : act.client_type === "externe" ? "Externe" : ""],
    ["Service de bar", hasBarService ? "Oui" : "Non"]
  ].filter(([, value]) => isNonEmptyString(value));

  const managerRows = [
    ["Nom", [manager.first_name, manager.last_name].filter(Boolean).join(" ")],
    ["Téléphone", manager.phone],
    ["Courriel", manager.email],
    ...(manager.type === "externe"
      ? [
          ["Entreprise", manager.company_name],
          ["Numéro de client (COBA Finance)", manager.coba_client_number],
          ["Adresse", manager.address],
          ["Ville", manager.city],
          ["Province", manager.province],
          ["Code postal", manager.postal_code]
        ]
      : [])
  ].filter(([, value]) => isNonEmptyString(value));

  const roomsRows = reservations
    .map((r: any) => {
      const days = (r.slots || []).length;
      const slotsText =
        (r.slots || [])
          .map((s: any) => `${s.date.replace(/-/g, "/")}${s.start_time ? " " + s.start_time : ""}${s.end_time ? "–" + s.end_time : ""}`)
          .join(", ") || "-";
      return `
        <tr>
          <td>${escapeHtml(getReservationRoomLabel(r))}</td>
          <td>${slotsText}</td>
          <td>${days}</td>
        </tr>
      `;
    })
    .join("");

  const barSectionHtml =
    barReservations.length > 0
      ? `
    <div class="print-sheet-section">
      <h2>Détails du service de bar</h2>
      <div style="display: flex; flex-direction: column; gap: 8px;">
        ${barReservations
          .map((r: any) => {
            const roomLabel = getReservationRoomLabel(r);
            const bs = r.bar_service;
            const detailsList = [];
            if (bs.drink_type) detailsList.push(`<strong>Type de boisson :</strong> ${escapeHtml(bs.drink_type)}`);
            if (bs.service_type) detailsList.push(`<strong>Type de service :</strong> ${escapeHtml(bs.service_type)}`);
            if (
              bs.hostess_count &&
              bs.hostess_count > 0 &&
              (bs.service_type === "Service d'hôtesses" || bs.service_type === "Distribution de breuvages et nettoyage de coupes")
            ) {
              detailsList.push(`<strong>Nombre d'hôtesses :</strong> ${bs.hostess_count}`);
            }
            if (bs.special_order) detailsList.push(`<strong>Commande spéciale :</strong> ${escapeHtml(bs.special_order)}`);

            return `
            <div style="border-left: 3px solid var(--primary, #3b82f6); padding-left: 10px; margin-bottom: 8px;">
              <div style="font-weight: 600; font-size: 0.9rem; margin-bottom: 4px; color: var(--text-color);">${escapeHtml(roomLabel)}</div>
              <div class="print-sheet-grid">
                ${detailsList.map(detail => `<div>${detail}</div>`).join("")}
              </div>
            </div>
          `;
          })
          .join("")}
      </div>
    </div>
    `
      : "";

  const fin = reservations.length > 0 ? computeActivityFinancials(act) : null;

  return `
    <div class="print-sheet-header">
      <div>
        <h1>${escapeHtml(act.name) || `Activité ${act.id}`}</h1>
        <div class="print-sheet-subtitle">Activité ${act.id}</div>
      </div>
    </div>

    ${
      infoRows.length > 0
        ? `
    <div class="print-sheet-section">
      <h2>Informations générales</h2>
      <div class="print-sheet-grid">
        ${infoRows.map(([label, value]) => `<div><strong>${label} :</strong> ${escapeHtml(value)}</div>`).join("")}
      </div>
    </div>
    `
        : ""
    }

    ${
      managerRows.length > 0
        ? `
    <div class="print-sheet-section">
      <h2>Gestionnaire responsable</h2>
      <div class="print-sheet-grid">
        ${managerRows.map(([label, value]) => `<div><strong>${label} :</strong> ${escapeHtml(value)}</div>`).join("")}
      </div>
    </div>
    `
        : ""
    }

    ${
      isNonEmptyString(act.description)
        ? `
    <div class="print-sheet-section">
      <h2>Description</h2>
      <div>${escapeHtml(act.description)}</div>
    </div>
    `
        : ""
    }

    ${
      isNonEmptyString(act.notes)
        ? `
    <div class="print-sheet-section">
      <h2>Notes</h2>
      <div>${escapeHtml(act.notes)}</div>
    </div>
    `
        : ""
    }

    ${
      reservations.length > 0
        ? `
    <div class="print-sheet-section">
      <h2>Réservations de salle</h2>
      <table class="print-sheet-table">
        <thead>
          <tr><th>Salle</th><th>Créneaux</th><th>Jours</th></tr>
        </thead>
        <tbody>${roomsRows}</tbody>
      </table>
    </div>
    `
        : ""
    }

    ${barSectionHtml}

    ${
      fin
        ? `
    <div class="print-sheet-section">
      <h2>Sommaire financier</h2>
      <table class="print-sheet-total-table">
        <tr><td>Location des salles</td><td>${formatCurrency(fin.roomsTotal)}</td></tr>
        <tr><td>Personnel</td><td>${formatCurrency(fin.staffTotal)}</td></tr>
        <tr><td>Équipements</td><td>${formatCurrency(fin.servicesTotal)}</td></tr>
        <tr><td>Autres frais</td><td>${formatCurrency(fin.feesTotal)}</td></tr>
        <tr><td>Sous-total</td><td>${formatCurrency(fin.subtotal)}</td></tr>
        <tr><td>TPS (5%)</td><td>${formatCurrency(fin.tps)}</td></tr>
        <tr><td>TVQ (9,975%)</td><td>${formatCurrency(fin.tvq)}</td></tr>
        <tr class="print-sheet-grand-total"><td>Total</td><td>${formatCurrency(fin.total)}</td></tr>
      </table>
    </div>
    `
        : ""
    }
  `;
}

// Opens the read-only activity details modal for the given activity id (used by the "Voir les
// détails" row action — unlike the drawer, this never mutates the activity).
function openActivityDetailsModal(id: string) {
  const act = appState.activities.find((a: any) => a.id === id);
  if (!act) return;
  el("activity-details-content").innerHTML = buildActivityDetailsHtml(act);
  el("activity-details-modal").classList.add("active");
  el("modal-backdrop").classList.add("active");
}

function closeActivityDetailsModal() {
  el("activity-details-modal").classList.remove("active");
  el("modal-backdrop").classList.remove("active");
}

function initActivityDetailsModal() {
  el("activity-details-modal-close").addEventListener("click", closeActivityDetailsModal);
  el("activity-details-modal-close-btn").addEventListener("click", closeActivityDetailsModal);
}

// Populates the hidden print sheet with the currently-open activity and triggers the browser's
// print dialog (the user can then "Enregistrer au format PDF" to export it).
function printActivitySheet() {
  const id = el("form-activity-internal-id").value;
  const act = appState.activities.find(a => a.id === id);
  if (!act) return;
  showLoadingOverlay("Préparation du document...");
  // Deferred so the overlay actually paints before building the sheet and opening the (blocking)
  // browser print dialog.
  setTimeout(() => {
    el("print-activity-sheet").innerHTML = buildPrintActivitySheetHtml(act);
    hideLoadingOverlay();
    window.print();
  }, 20);
}

// Generates the next available activity id (XXYY-ZZZ) for the selected fiscal year
function generateNextActivityId() {
  const prefix = appState.selected_year
    .split("-")
    .map(y => y.substring(2))
    .join("");

  let maxSeq = 0;
  const regex = new RegExp(`^${prefix}-(\\d{3})$`);
  appState.activities.forEach(act => {
    const match = act.id.match(regex);
    if (match) {
      const seq = parseInt(match[1]);
      if (seq > maxSeq) {
        maxSeq = seq;
      }
    }
  });
  const nextSeq = String(maxSeq + 1).padStart(3, "0");
  return `${prefix}-${nextSeq}`;
}

// Opens the full tabbed activity record for an existing activity (always edit mode — activities
// are created via the name-only modal/createActivity() before this is ever called).
// `calendarReturn` is an optional eventCalendarState snapshot ({refDate, viewMode}) to return to
// when the record was opened by clicking an event in the calendar.
function openActivityDrawer(id: string, calendarReturn: any = null) {
  const drawer = el("activity-drawer");
  const backdrop = el("drawer-backdrop");
  const form = el<HTMLFormElement>("activity-form");
  const titleEl = el("activity-drawer-title");

  const act = appState.activities.find((a: any) => a.id === id);
  if (!act) return;

  clearTimeout(activityUndoSnapshotTimer ?? undefined);
  activitiesState.openedActivitySnapshot = JSON.parse(JSON.stringify(act));
  activitiesState.undoStack = [JSON.parse(JSON.stringify(act))];
  activitiesState.redoStack = [];

  if (act.name.trim() !== "") {
    recordActivityView(act.id);
    // Dynamic import: navigation.js pulls in the .tsx views, and this module must stay
    // importable by plain `node --test` (Node can't load .tsx).
    import("../navigation.ts").then(m => m.renderQuickAccessAll());
  }

  form.reset();
  el("form-distribution-list").innerHTML = "";
  el("form-distribution-total-val").textContent = "0,00 $";

  titleEl.textContent = act.name.trim() !== "" ? act.name : `Activité ${act.id}`;
  el("form-activity-internal-id").value = act.id;
  el("form-activity-id").value = act.id;
  el("form-activity-id").disabled = true; // Cannot edit active key
  el("form-activity-coba").value = act.coba || "";
  fillActivityFormFields(act);
  renderActivityStateBar(act);

  const submitBtn = el("activity-drawer-submit");
  if (submitBtn) {
    submitBtn.style.display = activitiesState.draftActivityId === id ? "inline-flex" : "none";
  }

  activitiesState.calendarReturn = calendarReturn;
  el("activity-drawer-back-to-calendar-btn").style.display = calendarReturn ? "inline-flex" : "none";

  drawer.classList.add("active");
  backdrop.classList.add("active");

  switchActivityTab("submission");
  updateFormDatesHelper();
  clearDateFieldErrors();

  // Set cursor focus directly on the first editable field (Références COBA)
  setTimeout(() => {
    el("form-activity-coba").focus();
  }, 150);
}

// Kept for calendar.js, which opens the activity record from a calendar event click
function openActivityDetailModal(id: string, calendarReturn: any) {
  openActivityDrawer(id, calendarReturn);
}

function closeActivityDrawer() {
  const currentId = el("form-activity-internal-id").value;
  if (currentId) {
    const currentAct = appState.activities.find((a: any) => a.id === currentId);
    const snapshot = activitiesState.openedActivitySnapshot;
    if (currentAct && snapshot && currentAct.id === snapshot.id) {
      if (JSON.stringify(currentAct) !== JSON.stringify(snapshot)) {
        saveActivityVersion(currentAct);
      }
    }
  }
  clearTimeout(activityUndoSnapshotTimer ?? undefined);
  activitiesState.openedActivitySnapshot = null;
  activitiesState.undoStack = [];
  activitiesState.redoStack = [];
  clearDrawerUiState();

  el("activity-drawer").classList.remove("active");
  el("drawer-backdrop").classList.remove("active");
}

function cancelActivityDrawer() {
  const id = el("form-activity-internal-id").value;
  const nameInput = el("form-activity-name");

  if (nameInput && !nameInput.value.trim()) {
    const isDraft = activitiesState.draftActivityId === id;
    if (isDraft) {
      appState.activities = appState.activities.filter(a => a.id !== id);
      activitiesState.draftActivityId = null;
      saveDatabase();
      closeActivityDrawer();
      renderActivities();
      return;
    } else {
      showToast("Le nom de l'activité ne peut pas être vide.", "warning");
      nameInput.focus();
      return;
    }
  }

  closeActivityDrawer();
}

function addDistributionRow(accountCode = "", amount = 0, reference = "", details = "", autoGenerated = false) {
  const container = el("form-distribution-list");
  const rowId = "dist-row-" + Date.now() + Math.random().toString(36).substr(2, 5);

  const rowHtml = `
    <div id="${rowId}" class="distribution-row" data-auto-generated="${autoGenerated ? "1" : ""}" style="grid-template-columns: 1.3fr 0.8fr 1fr 1.3fr auto auto; align-items: center;">
      ${buildSearchableSelectHtml("dist-account-select-wrapper", "dist-account-select", "Choisir un compte...", `${rowId}-account`)}
      <input type="number" id="${rowId}-amount" class="form-input dist-amount-input" min="0" step="0.01" value="${amount > 0 ? amount : ""}" placeholder="Montant $" style="padding: 8px 12px; font-size: 0.85rem;">
      <input type="text" id="${rowId}-reference" class="form-input dist-reference-input" value="${escapeHtml(reference)}" placeholder="N° Facture, RI ou Encaissement" style="padding: 8px 12px; font-size: 0.85rem;">
      <input type="text" id="${rowId}-details" class="form-input dist-details-input" value="${escapeHtml(details)}" placeholder="Détails" style="padding: 8px 12px; font-size: 0.85rem;">
      <div style="display: flex; align-items: center; justify-content: center; min-width: 50px;">
        ${autoGenerated ? `<span class="badge badge-auto" style="white-space: nowrap;" title="Généré automatiquement par l'application">Généré</span>` : ""}
      </div>
      <button type="button" class="btn-icon delete-dist-row-btn" data-row-id="${rowId}">
        <svg viewBox="0 0 24 24" style="width: 14px; height: 14px;"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
      </button>
    </div>
  `;

  container.insertAdjacentHTML("beforeend", rowHtml);

  // Attach listeners
  const newRow = el(rowId);
  newRow.querySelector(".delete-dist-row-btn")!.addEventListener("click", () => {
    newRow.remove();
    updateDistributionTotal();
    autoSaveActivityForm();
  });

  const glItems = appState.settings.accounts.map(acc => ({
    value: acc.code,
    label: `${acc.code} (${acc.description})`
  }));

  initSearchableSelectEl(
    newRow.querySelector<HTMLElement>(".dist-account-select-wrapper")!,
    glItems,
    value => {
      autoSaveActivityForm();
    },
    accountCode
  );

  newRow.querySelector(".dist-amount-input")!.addEventListener("input", updateDistributionTotal);
  rejectNegativeAmountOnBlur(newRow.querySelector<HTMLInputElement>(".dist-amount-input")!);

  updateDistributionTotal();
}

function updateDistributionTotal() {
  const distributionListEl = el("form-distribution-total-val");
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
  const warningEl = el("form-distribution-total-warning");
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

let autoSaveTimeoutId: ReturnType<typeof setTimeout> | null = null;

function showAutoSaveStatus(status: string) {
  const internalId = el("form-activity-internal-id").value;
  if (internalId && activitiesState.draftActivityId === internalId) {
    const statusEl = el("auto-save-status");
    if (statusEl) statusEl.classList.remove("active");
    return;
  }

  const statusEl = el("auto-save-status");
  if (!statusEl) return;

  const spinner = statusEl.querySelector<HTMLElement>(".auto-save-spinner");
  const text = statusEl.querySelector<HTMLElement>(".auto-save-text");

  if (autoSaveTimeoutId) {
    clearTimeout(autoSaveTimeoutId);
    autoSaveTimeoutId = null;
  }

  if (status === "saving") {
    statusEl.className = "auto-save-status active saving";
    if (spinner) spinner.style.display = "inline-block";
    if (text) text.textContent = "Enregistrement...";
  } else if (status === "saved") {
    statusEl.className = "auto-save-status active saved";
    if (spinner) spinner.style.display = "none";
    if (text) text.textContent = "Enregistré";

    autoSaveTimeoutId = setTimeout(() => {
      statusEl.classList.remove("active");
    }, 2000);
  }
}

function autoSaveActivityForm() {
  const internalId = el("form-activity-internal-id").value;
  if (!internalId) return;

  // Do not auto-save draft activities until they have been saved once manually!
  if (activitiesState.draftActivityId === internalId) {
    return;
  }

  const rawId = el("form-activity-id").value.trim();
  const name = el("form-activity-name").value.trim();

  // The activity name cannot be empty. If it is, we don't save.
  if (!isNonEmptyString(name)) {
    return;
  }

  showAutoSaveStatus("saving");

  const attendeesInput = el("form-activity-attendees").value.trim();
  const attendeesCount = parseInt(attendeesInput) || 0;
  const responsableFirstName = el("form-activity-responsable-firstname").value.trim();
  const responsableLastName = el("form-activity-responsable-lastname").value.trim();
  const responsable = [responsableFirstName, responsableLastName].filter(Boolean).join(" ");
  const clientType = el("form-activity-client-type").value;
  const description = el("form-activity-description").value.trim();
  const notes = el("form-activity-notes").value.trim();
  const coba = el("form-activity-coba").value.trim();
  const managerFirstName = el("form-activity-manager-firstname").value.trim();
  const managerLastName = el("form-activity-manager-lastname").value.trim();
  const managerType = el("form-activity-manager-type").value;
  const managerPhone = el("form-activity-manager-phone").value.trim();
  const managerEmail = el("form-activity-manager-email").value.trim();
  const managerCompany = el("form-activity-manager-company").value.trim();
  const managerCobaClientNumber = el("form-activity-manager-coba-client-number").value.trim();
  const managerAddress = el("form-activity-manager-address").value.trim();
  const managerCity = el("form-activity-manager-city").value.trim();
  const managerProvince = el("form-activity-manager-province").value.trim();
  const managerPostalCode = el("form-activity-manager-postal-code").value.trim();
  const reservations = collectReservationsFromForm();
  const { date_start: start, date_end: end } = getAggregateEventDates(reservations);
  const dept = el("form-activity-dept").value;
  const eventType = el("form-activity-event-type").value;
  const eventTypeOther = el("form-activity-event-type-other").value.trim();

  // Build distributions array
  const distributions: any[] = [];
  document.querySelectorAll("#form-distribution-list .distribution-row").forEach(row => {
    const acc = row.querySelector<HTMLInputElement>(".dist-account-select-wrapper .searchable-select-value")?.value;
    const amtStr = row.querySelector<HTMLInputElement>(".dist-amount-input")?.value.trim() || "";
    const amt = parseFloat(amtStr) || 0;
    const reference = row.querySelector<HTMLInputElement>(".dist-reference-input")?.value.trim();
    const details = row.querySelector<HTMLInputElement>(".dist-details-input")?.value.trim();
    const auto_generated = (row as HTMLElement).dataset.autoGenerated === "1";

    if (acc && amt > 0) {
      distributions.push({ account_code: acc, amount: amt, reference, details, auto_generated });
    }
  });

  const payload = {
    id: rawId,
    mode: getActivityFormMode(),
    coba,
    responsable,
    responsable_first_name: responsableFirstName,
    responsable_last_name: responsableLastName,
    name,
    attendees_count: attendeesCount,
    date_start: start,
    date_end: end,
    description,
    notes,
    activity_manager: {
      first_name: managerFirstName,
      last_name: managerLastName,
      type: managerType,
      phone: managerPhone,
      email: managerEmail,
      company_name: managerType === "externe" ? managerCompany : "",
      coba_client_number: managerType === "externe" ? managerCobaClientNumber : "",
      address: managerType === "externe" ? managerAddress : "",
      city: managerType === "externe" ? managerCity : "",
      province: managerType === "externe" ? managerProvince : "",
      postal_code: managerType === "externe" ? managerPostalCode : ""
    },
    client_type: clientType,
    reservations,
    department: dept,
    event_type: eventType,
    event_type_other: eventType === "autre" ? eventTypeOther : "",
    distributions
  };

  const idx = appState.activities.findIndex(a => a.id === internalId);
  if (idx === -1) return;
  appState.activities[idx] = { ...appState.activities[idx], ...payload };

  if (activitiesState.draftActivityId === internalId) {
    activitiesState.draftActivityId = null;
  }

  saveDatabase();

  if (reconciliationState.ledgerTransactions.length > 0) {
    reconcileLedger();
  }

  renderActivities();
  showAutoSaveStatus("saved");
  updateFormTabIndicators(appState.activities[idx]);

  // Any new edit invalidates whatever "future" the redo stack held, but the undo snapshot itself
  // is debounced (see scheduleActivityUndoSnapshot): a burst of saves from one continuous edit
  // (keystrokes, a field's "input" then its "change" on blur, etc.) collapses into a single undo
  // step instead of one step per underlying save.
  activitiesState.redoStack = [];
  scheduleActivityUndoSnapshot(idx);
}

// Groups every autosave from one continuous edit into a single undo step: each call postpones
// the actual push by ACTIVITY_UNDO_DEBOUNCE_MS, so only the last (most complete) state in a burst
// of saves gets recorded. Reads appState.activities[idx] lazily when the timer fires, not the
// value at schedule time, so it always captures the final state of the burst.
let activityUndoSnapshotTimer: ReturnType<typeof setTimeout> | null = null;
const ACTIVITY_UNDO_DEBOUNCE_MS = 800;

// ES modules only give importers a read-only live view of an exported `let` — activities-history.js
// needs to actually reassign activityUndoSnapshotTimer (see scheduleActivityUndoSnapshot), so it
// goes through this setter instead of assigning the imported binding directly.
function setActivityUndoSnapshotTimer(timer: ReturnType<typeof setTimeout> | null) {
  activityUndoSnapshotTimer = timer;
}

export {
  computeActivityFinancials,
  updateSubmissionFinancialSummary,
  buildPrintActivitySheetHtml,
  printActivitySheet,
  buildActivityDetailsHtml,
  openActivityDetailsModal,
  closeActivityDetailsModal,
  initActivityDetailsModal,
  generateNextActivityId,
  openActivityDrawer,
  openActivityDetailModal,
  closeActivityDrawer,
  cancelActivityDrawer,
  addDistributionRow,
  updateDistributionTotal,
  showAutoSaveStatus,
  autoSaveActivityForm,
  activityUndoSnapshotTimer,
  ACTIVITY_UNDO_DEBOUNCE_MS,
  setActivityUndoSnapshotTimer,
  persistDrawerUiState,
  clearDrawerUiState,
  getSavedDrawerUiState
};
