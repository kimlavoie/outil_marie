/**
 * activities-print-sheet.ts - Printable/PDF activity sheet and the read-only activity details
 * modal (both build the same kind of record markup, one from the persisted record for printing,
 * the other for the "Voir les détails" row action).
 * Split out of activities-financials.ts (see that file for the rest of the module's history).
 */
import { appState, EVENT_TYPES } from "../state/state.ts";
import {
  formatCurrency,
  escapeHtml,
  getReservationRoomLabel,
  showLoadingOverlay,
  hideLoadingOverlay,
  elById,
  calculateHoursFromTimes,
  formatPostalCode
} from "../utils/utils.ts";
import { isNonEmptyString } from "../utils/validation.ts";
import { getActivityStateLabel } from "./render.ts";
import { computeActivityFinancials, overrideMarkerHtml } from "./financial-summary.ts";

// Shared by buildPrintActivitySheetHtml() and buildActivityDetailsHtml(): renders the "Détails du
// service de bar" section for every reservation with an active bar_service, or "" if none.
function buildBarServiceSectionHtml(reservations: any[]) {
  const barReservations = reservations.filter((r: any) => r.bar_service?.active);
  if (barReservations.length === 0) return "";

  return `
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
    `;
}

// Shared by buildPrintActivitySheetHtml() and buildActivityDetailsHtml(): renders the "Sommaire
// financier" totals table from a computeActivityFinancials() result.
function buildFinancialSummaryTableHtml(fin: ReturnType<typeof computeActivityFinancials>) {
  return `
    <div class="print-sheet-section">
      <h2>Sommaire financier</h2>
      <table class="print-sheet-total-table">
        <tr><td>Location des salles</td><td>${formatCurrency(fin.roomsTotal)}</td></tr>
        <tr><td>Montage/démontage</td><td>${formatCurrency(fin.setupTotal)}</td></tr>
        <tr><td>Personnel</td><td>${formatCurrency(fin.staffTotal)}</td></tr>
        <tr><td>Équipements</td><td>${formatCurrency(fin.servicesTotal)}</td></tr>
        <tr><td>Autres frais</td><td>${formatCurrency(fin.feesTotal)}</td></tr>
        <tr><td>Sous-total</td><td>${formatCurrency(fin.subtotal)}</td></tr>
        <tr><td>${fin.tpsLabel}${overrideMarkerHtml(fin.tpsOverride)}</td><td>${formatCurrency(fin.tps)}</td></tr>
        <tr><td>${fin.tvqLabel}${overrideMarkerHtml(fin.tvqOverride)}</td><td>${formatCurrency(fin.tvq)}</td></tr>
        <tr class="print-sheet-grand-total"><td>Total</td><td>${formatCurrency(fin.total)}</td></tr>
      </table>
    </div>
  `;
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

  const roomsRows = reservations
    .map((r: any) => {
      const room = appState.settings.rooms.find((rm: any) => rm.name === r.room_name);
      const isHourly = room && room.rate_type === "hourly";
      const slotsText =
        (r.slots || [])
          .map((s: any) =>
            escapeHtml(`${s.date.replace(/-/g, "/")}${s.start_time ? " " + s.start_time : ""}${s.end_time ? "–" + s.end_time : ""}`)
          )
          .join(", ") || "-";

      let durationText = "";
      let rateUnit = "";
      let subtotal = 0;
      if (isHourly) {
        const hours = (r.slots || []).reduce((sum: number, s: any) => {
          return sum + calculateHoursFromTimes(s.start_time, s.end_time);
        }, 0);
        durationText = `${hours} h`;
        rateUnit = "/ h";
        subtotal = (r.tariff_amount || 0) * hours;
      } else {
        const days = (r.slots || []).length;
        durationText = `${days} jour${days > 1 ? "s" : ""}`;
        rateUnit = "/ jour";
        subtotal = (r.tariff_amount || 0) * days;
      }

      return `
        <tr>
          <td>${escapeHtml(getReservationRoomLabel(r))}</td>
          <td>${slotsText}</td>
          <td>${escapeHtml(r.tariff_description) || "-"}</td>
          <td>${formatCurrency(r.tariff_amount || 0)} ${rateUnit}</td>
          <td>${durationText}</td>
          <td>${formatCurrency(subtotal)}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <div class="print-sheet-header">
      <div>
        <h1>${act.mode === "estimation" ? "Estimation" : "Soumission / Contrat"}</h1>
        <div class="print-sheet-subtitle">Activité ${escapeHtml(act.id)} — ${escapeHtml(act.name) || "(Sans nom)"}</div>
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
        <div><strong>Code postal :</strong> ${escapeHtml(formatPostalCode(manager.postal_code)) || "-"}</div>
        `
            : ""
        }
      </div>
    </div>

    <div class="print-sheet-section">
      <h2>Réservations de salle</h2>
      <table class="print-sheet-table">
        <thead>
          <tr><th>Salle</th><th>Créneaux</th><th>Tarif</th><th>Tarif unitaire</th><th>Durée</th><th>Sous-total</th></tr>
        </thead>
        <tbody>${roomsRows || `<tr><td colspan="6">Aucune réservation.</td></tr>`}</tbody>
      </table>
    </div>

    ${buildBarServiceSectionHtml(reservations)}

    ${buildFinancialSummaryTableHtml(fin)}
  `;
}

// Builds the read-only activity details modal's markup, omitting sections whose data is absent
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
          ["Code postal", formatPostalCode(manager.postal_code)]
        ]
      : [])
  ].filter(([, value]) => isNonEmptyString(value));

  const roomsRows = reservations
    .map((r: any) => {
      const room = appState.settings.rooms.find((rm: any) => rm.name === r.room_name);
      const isHourly = room && room.rate_type === "hourly";
      const slotsText =
        (r.slots || [])
          .map((s: any) =>
            escapeHtml(`${s.date.replace(/-/g, "/")}${s.start_time ? " " + s.start_time : ""}${s.end_time ? "–" + s.end_time : ""}`)
          )
          .join(", ") || "-";

      let durationText = "";
      if (isHourly) {
        const hours = (r.slots || []).reduce((sum: number, s: any) => {
          return sum + calculateHoursFromTimes(s.start_time, s.end_time);
        }, 0);
        durationText = `${hours} h`;
      } else {
        const days = (r.slots || []).length;
        durationText = `${days} jour${days > 1 ? "s" : ""}`;
      }

      return `
        <tr>
          <td>${escapeHtml(getReservationRoomLabel(r))}</td>
          <td>${slotsText}</td>
          <td>${durationText}</td>
        </tr>
      `;
    })
    .join("");

  const fin = reservations.length > 0 ? computeActivityFinancials(act) : null;

  return `
    <div class="print-sheet-header">
      <div>
        <h1>${escapeHtml(act.name) || `Activité ${escapeHtml(act.id)}`}</h1>
        <div class="print-sheet-subtitle">Activité ${escapeHtml(act.id)}</div>
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
          <tr><th>Salle</th><th>Créneaux</th><th>Durée</th></tr>
        </thead>
        <tbody>${roomsRows}</tbody>
      </table>
    </div>
    `
        : ""
    }

    ${buildBarServiceSectionHtml(reservations)}

    ${fin ? buildFinancialSummaryTableHtml(fin) : ""}
  `;
}

// Opens the read-only activity details modal for the given activity id (used by the "Voir les
// détails" row action — unlike the drawer, this never mutates the activity).
function openActivityDetailsModal(id: string) {
  const act = appState.activities.find((a: any) => a.id === id);
  if (!act) return;
  elById("activity-details-content").innerHTML = buildActivityDetailsHtml(act);
  elById("activity-details-modal").classList.add("active");
  elById("modal-backdrop").classList.add("active");
}

function closeActivityDetailsModal() {
  elById("activity-details-modal").classList.remove("active");
  elById("modal-backdrop").classList.remove("active");
}

function initActivityDetailsModal() {
  elById("activity-details-modal-close").addEventListener("click", closeActivityDetailsModal);
  elById("activity-details-modal-close-btn").addEventListener("click", closeActivityDetailsModal);
}

// Populates the hidden print sheet with the currently-open activity and triggers the browser's
// print dialog (the user can then "Enregistrer au format PDF" to export it).
function printActivitySheet() {
  const id = elById("form-activity-internal-id").value;
  const act = appState.activities.find(a => a.id === id);
  if (!act) return;
  showLoadingOverlay("Préparation du document...");
  // Deferred so the overlay actually paints before building the sheet and opening the (blocking)
  // browser print dialog.
  setTimeout(() => {
    elById("print-activity-sheet").innerHTML = buildPrintActivitySheetHtml(act);
    hideLoadingOverlay();
    window.print();
  }, 20);
}

export {
  buildPrintActivitySheetHtml,
  buildActivityDetailsHtml,
  printActivitySheet,
  openActivityDetailsModal,
  closeActivityDetailsModal,
  initActivityDetailsModal
};
