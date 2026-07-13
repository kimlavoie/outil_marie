/**
 * reservations/card.ts - Builds and wires a single reservation card in the activity form: room
 * selection, tariff, montage/démontage, créneaux, technical services, bar service, host duties,
 * and its staff/equipment/fees sub-lists.
 */
import { initDatepickerWrapper } from "../datepicker.ts";
import { appState, TECHNICAL_SERVICES, BAR_DRINK_TYPES, BAR_SERVICE_TYPES, HOST_DUTY_OPTIONS } from "../../state/state.ts";
import {
  escapeHtml,
  generateUid,
  OTHER_ROOM_VALUE,
  buildSearchableSelectHtml,
  initSearchableSelectEl,
  initPillToggleEl,
  setExclusivePillValueEl,
  initExclusivePillToggleEl,
  setPillGroupActiveEl,
  buildGlAccountOptionsHtml,
  rejectNegativeAmountOnBlur
} from "../../utils/utils.ts";
import { updateSubmissionFinancialSummary, autoSaveActivityForm } from "../financials.ts";
import { updateFormDatesHelper } from "../history/index.ts";
import {
  addStaffRow,
  addServiceRow,
  addFeeRow,
  autoAddLinkedStaffAndFees,
  autoAddTechnicalDirectorIfNeeded
} from "./subrows.ts";
import { addSlotRow, addNextSlotRow, buildSlotRangeGeneratorHtml, wireSlotRangeGenerator } from "./slots.ts";
import { buildTariffClientTypeOptionsHtml, updateResolvedPriceDisplay, refreshReservationTariffSelect } from "./tariff.ts";

function el<T extends Element = HTMLInputElement>(id: string): T {
  return document.getElementById(id) as unknown as T;
}

function buildRoomSelectItems() {
  return [...appState.settings.rooms.map(r => ({ value: r.name, label: r.name })), { value: OTHER_ROOM_VALUE, label: "Autre" }];
}

function buildRoomDateTimeFieldHtml(dateId: string, timeId: string, label: string) {
  return `
    <div class="form-group">
      <label for="${dateId}">${label}</label>
      <div class="datetime-input-row">
        <div class="datepicker-wrapper">
          <input type="text" id="${dateId}" class="form-input" placeholder="AAAA-MM-JJ" pattern="\\d{4}-\\d{2}-\\d{2}">
          <button type="button" class="datepicker-trigger-btn" data-target="${dateId}" title="Sélectionner depuis le calendrier">
            <svg viewBox="0 0 24 24" style="width: 16px; height: 16px; fill: currentColor;"><path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11zM7 11h5v5H7z"/></svg>
          </button>
          <div class="calendar-popover" id="cal-popover-${dateId}"></div>
        </div>
        <input type="time" id="${timeId}" class="form-input">
        <button type="button" class="view-calendar-btn" data-target="${dateId}" title="Consulter le calendrier à cette date">
          <svg viewBox="0 0 24 24" style="width: 16px; height: 16px; fill: currentColor;"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
        </button>
      </div>
      <div class="field-error-msg" id="${dateId}-fy-error"></div>
    </div>
  `;
}

function buildDatePeriodFieldHtml(dateId: string, startTimeId: string, endTimeId: string, label: string) {
  return `
    <div class="form-group">
      <label for="${dateId}">${label}</label>
      <div class="datetime-input-row">
        <div class="datepicker-wrapper">
          <input type="text" id="${dateId}" class="form-input" placeholder="AAAA-MM-JJ" pattern="\\d{4}-\\d{2}-\\d{2}">
          <button type="button" class="datepicker-trigger-btn" data-target="${dateId}" title="Sélectionner depuis le calendrier">
            <svg viewBox="0 0 24 24" style="width: 16px; height: 16px; fill: currentColor;"><path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11zM7 11h5v5H7z"/></svg>
          </button>
          <div class="calendar-popover" id="cal-popover-${dateId}"></div>
        </div>
        <input type="time" id="${startTimeId}" class="form-input" title="Heure de début">
        <span style="align-self: center; color: var(--text-muted);">à</span>
        <input type="time" id="${endTimeId}" class="form-input" title="Heure de fin">
        <button type="button" class="view-calendar-btn" data-target="${dateId}" title="Consulter le calendrier à cette date">
          <svg viewBox="0 0 24 24" style="width: 16px; height: 16px; fill: currentColor;"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
        </button>
      </div>
      <div class="field-error-msg" id="${dateId}-fy-error"></div>
    </div>
  `;
}

function addReservationCard(reservationData: any = null) {
  const container = el("form-activity-reservations");
  if (!container) return;

  const uid = generateUid("res-card");
  const roomName = reservationData ? reservationData.room_name : "";
  const isOther = roomName === OTHER_ROOM_VALUE;
  const install = (reservationData && reservationData.install) || { enabled: false, date: "", time: "" };
  const dismantle = (reservationData && reservationData.dismantle) || { enabled: false, date: "", time: "" };
  const isCustomTariff = !!(
    reservationData &&
    !reservationData.tariff_id &&
    (reservationData.tariff_description || reservationData.tariff_amount)
  );

  container.insertAdjacentHTML(
    "beforeend",
    `
    <div class="reservation-card" id="${uid}" data-reservation-id="${reservationData ? reservationData.id : generateUid("res")}">
      <div class="reservation-card-header">
        <div class="form-group" style="flex: 1; margin-bottom: 0;">
          <label for="${uid}-room-search-input">Salle</label>
          ${buildSearchableSelectHtml("room-select-group", "room-search-input", "Rechercher une salle...", `${uid}-room-search-input`)}
        </div>
        <button type="button" class="btn-icon remove-reservation-btn" title="Retirer cette réservation">
          <svg viewBox="0 0 24 24" style="width: 16px; height: 16px;"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
        </button>
      </div>

      <div class="form-group room-other-details-group" style="display: ${isOther ? "flex" : "none"};">
        <label for="${uid}-room-other-details">Détails de la salle</label>
        <input type="text" id="${uid}-room-other-details" class="form-input room-other-details-input" placeholder="Précisez la salle utilisée..." value="${escapeHtml(reservationData && reservationData.room_other_details)}">
      </div>

      <div class="form-group-row room-tariff-fields-row" style="display: flex; gap: 12px; margin-bottom: 12px;">
        <div class="form-group" style="flex: 1; margin-bottom: 0;">
          <label for="${uid}-room-tariff-parameter">
            Tarif - Paramètre
            <span class="help-tooltip-trigger" title="La grille tarifaire de cette salle (configurée dans Paramètres → Salles) peut avoir plusieurs versions selon la date ou la situation. Ce choix détermine laquelle s'applique ici.">?</span>
          </label>
          <select id="${uid}-room-tariff-parameter" class="select-input room-tariff-parameter" style="padding: 10px 14px; width: 100%;">
            <option value="">Sélectionner...</option>
          </select>
        </div>
        <div class="form-group room-tariff-client-type-group" style="flex: 1; margin-bottom: 0; display: flex; flex-direction: column;">
          <label for="${uid}-room-tariff-client-type">
            Tarif - Type de client
            <span class="help-tooltip-trigger" title="Interne ou externe : le tarif facturé (et le compte budgétaire utilisé) peut différer selon le type de client sélectionné dans « Responsable de la facturation ».">?</span>
          </label>
          <select id="${uid}-room-tariff-client-type" class="select-input room-tariff-client-type" style="padding: 10px 14px; width: 100%;">
            <option value="">Sélectionner...</option>
          </select>
        </div>
      </div>
      <div class="room-tariff-resolved-price-display" style="font-size: 0.85rem; color: var(--text-secondary); margin-top: -6px; margin-bottom: 12px; display: none;">
        Tarif résolu : <strong class="resolved-price-val">0,00 $</strong> / jour
      </div>
      <div class="room-tariff-stale-warning" style="font-size: 0.85rem; color: var(--warning-text); margin-top: -6px; margin-bottom: 12px; display: none;"></div>
      <div class="form-group-row room-tariff-custom-group" style="display: ${isCustomTariff ? "flex" : "none"}; gap: 12px; margin-bottom: 12px;">
        <div class="form-group" style="flex: 1; margin-bottom: 0;">
          <label for="${uid}-room-tariff-custom-desc">Description du tarif</label>
          <input type="text" id="${uid}-room-tariff-custom-desc" class="form-input room-tariff-custom-desc" placeholder="Ex: Rabais ponctuel" value="${isCustomTariff ? escapeHtml(reservationData.tariff_description) : ""}">
        </div>
        <div class="form-group" style="flex: 1; margin-bottom: 0;">
          <label for="${uid}-room-tariff-custom-amount">Montant ($ par jour)</label>
          <input type="number" id="${uid}-room-tariff-custom-amount" class="form-input room-tariff-custom-amount" min="0" step="0.01" value="${isCustomTariff ? reservationData.tariff_amount : ""}">
        </div>
        <div class="form-group" style="flex: 1.5; margin-bottom: 0;">
          <label for="${uid}-room-tariff-custom-gl">Code budgétaire</label>
          ${buildSearchableSelectHtml("room-tariff-custom-gl-wrapper", "room-tariff-custom-gl", "Choisir un compte...", `${uid}-room-tariff-custom-gl`)}
        </div>
      </div>

      <div class="form-group">
        <span class="field-label" id="${uid}-install-dismantle-label">Montage / Démontage</span>
        <div class="pill-toggle-group" role="group" aria-labelledby="${uid}-install-dismantle-label">
          <button type="button" class="pill-toggle reservation-install-toggle ${install.enabled ? "active" : ""}">Montage</button>
          <button type="button" class="pill-toggle reservation-dismantle-toggle ${dismantle.enabled ? "active" : ""}">Démontage</button>
        </div>
      </div>
      <div class="form-group-row reservation-install-fields" style="display: ${install.enabled ? "flex" : "none"};">
        ${buildDatePeriodFieldHtml(`${uid}-install-date`, `${uid}-install-start-time`, `${uid}-install-end-time`, "Montage")}
      </div>
      <div class="form-group-row reservation-dismantle-fields" style="display: ${dismantle.enabled ? "flex" : "none"};">
        ${buildDatePeriodFieldHtml(`${uid}-dismantle-date`, `${uid}-dismantle-start-time`, `${uid}-dismantle-end-time`, "Démontage")}
      </div>

      <div class="distribution-section">
        <div class="distribution-header">
          <span class="field-label">Créneaux</span>
          <div style="display: flex; gap: 8px;">
            <button type="button" class="btn btn-secondary reservation-add-slot-range-btn" style="padding: 6px 12px; font-size: 0.8rem;">+ Plage de jours</button>
            <button type="button" class="btn btn-secondary reservation-add-slot-btn" style="padding: 6px 12px; font-size: 0.8rem;">+ Créneau</button>
          </div>
        </div>
        ${buildSlotRangeGeneratorHtml(uid)}
        <div class="distribution-list reservation-slots-list"></div>
      </div>

      <div class="form-group">
        <span class="field-label" id="${uid}-technical-services-label">Services techniques</span>
        <div class="pill-toggle-group room-technical-services-group" role="group" aria-labelledby="${uid}-technical-services-label">
          ${TECHNICAL_SERVICES.map(s => `<button type="button" class="pill-toggle" data-value="${s}">${s}</button>`).join("")}
        </div>
      </div>

      <div class="form-group">
        <span class="field-label" id="${uid}-bar-toggle-label">Service de bar</span>
        <div class="pill-toggle-group room-bar-toggle-group" role="group" aria-labelledby="${uid}-bar-toggle-label">
          <button type="button" class="pill-toggle" data-value="active">Activer le service de bar</button>
        </div>
      </div>
      <div class="room-bar-details" style="display: none;">
        <div class="form-group">
          <span class="field-label" id="${uid}-bar-drink-label">Type de boisson</span>
          <div class="pill-toggle-group room-bar-drink-group" role="group" aria-labelledby="${uid}-bar-drink-label">
            ${BAR_DRINK_TYPES.map(s => `<button type="button" class="pill-toggle" data-value="${s}">${s}</button>`).join("")}
          </div>
        </div>
        <div class="form-group">
          <span class="field-label" id="${uid}-bar-service-type-label">Type de service</span>
          <div class="pill-toggle-group room-bar-service-type-group" role="group" aria-labelledby="${uid}-bar-service-type-label">
            ${BAR_SERVICE_TYPES.map(s => `<button type="button" class="pill-toggle" data-value="${s}">${s}</button>`).join("")}
          </div>
        </div>
        <div class="form-group room-bar-hostess-count-group" style="display: none;">
          <label for="${uid}-room-bar-hostess-count">Nombre d'hôtesses</label>
          <input type="number" id="${uid}-room-bar-hostess-count" class="form-input room-bar-hostess-count" min="1" step="1" value="1">
        </div>
        <div class="form-group">
          <label for="${uid}-room-bar-special-order">Commande spéciale</label>
          <input type="text" id="${uid}-room-bar-special-order" class="form-input room-bar-special-order" placeholder="Précisez la commande spéciale...">
        </div>
      </div>

      <div class="form-group">
        <span class="field-label" id="${uid}-host-duties-label">Autres services</span>
        <div class="pill-toggle-group room-host-duties-group" role="group" aria-labelledby="${uid}-host-duties-label">
          ${HOST_DUTY_OPTIONS.map(s => `<button type="button" class="pill-toggle" data-value="${s}">${s}</button>`).join("")}
        </div>
      </div>
      <div class="form-group room-host-duties-count-group" style="display: none;">
        <label for="${uid}-room-host-duties-count">Nombre d'hôtesses</label>
        <input type="number" id="${uid}-room-host-duties-count" class="form-input room-host-duties-count" min="1" step="1" value="1">
      </div>

      <div class="distribution-section">
        <div class="distribution-header">
          <span class="field-label">Personnel requis</span>
          <button type="button" class="btn btn-secondary room-add-staff-btn" style="padding: 6px 12px; font-size: 0.8rem;">+ Ajouter</button>
        </div>
        <div class="distribution-column-labels" style="display: grid; grid-template-columns: 1.2fr 0.6fr 0.6fr 0.6fr 1fr 1fr 50px 38px; gap: 12px; font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.02em; margin-bottom: 4px;">
          <span>Emploi</span><span>Qté</span><span>Heures</span><span title="Heures en temps supplémentaire">Heures sup.</span><span title="Le tarif à facturer pour ce poste — détermine le compte budgétaire utilisé sur la ligne de facturation générée">Code budgétaire</span><span>Sous-total</span><span></span><span></span>
        </div>
        <div class="distribution-list room-staff-list"></div>
      </div>

      <div class="distribution-section">
        <div class="distribution-header">
          <span class="field-label">Équipements</span>
          <button type="button" class="btn btn-secondary room-add-service-btn" style="padding: 6px 12px; font-size: 0.8rem;">+ Ajouter</button>
        </div>
        <div class="distribution-column-labels" style="display: grid; grid-template-columns: 1.3fr 0.6fr 0.6fr 1fr 1fr 50px 38px; gap: 12px; font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.02em; margin-bottom: 4px;">
          <span>Équipement</span><span>Qté</span><span title="Utilisé seulement pour les équipements facturés à l'heure">Heures</span><span title="Le tarif à facturer pour cet équipement — détermine le compte budgétaire utilisé sur la ligne de facturation générée">Compte à facturer</span><span>Sous-total</span><span></span><span></span>
        </div>
        <div class="distribution-list room-services-list"></div>
      </div>

      <div class="distribution-section">
        <div class="distribution-header">
          <span class="field-label">Autres frais</span>
          <button type="button" class="btn btn-secondary room-add-fee-btn" style="padding: 6px 12px; font-size: 0.8rem;">+ Ajouter</button>
        </div>
        <div class="distribution-list room-fees-list"></div>
      </div>
    </div>
  `
  );

  const card = el(uid);

  // Remember the amount/tariff in effect when this reservation was saved so the resolved-price
  // display can flag it if the room's pricing grid has since changed for that date (getActivePricingGrid).
  if (reservationData && reservationData.tariff_id && typeof reservationData.tariff_amount === "number") {
    card.dataset.storedTariffId = reservationData.tariff_id;
    card.dataset.storedTariffAmount = String(reservationData.tariff_amount);
  }

  if (install.enabled) {
    card.querySelector<HTMLInputElement>(`#${uid}-install-date`)!.value = install.date || "";
    card.querySelector<HTMLInputElement>(`#${uid}-install-start-time`)!.value = install.start_time || "";
    card.querySelector<HTMLInputElement>(`#${uid}-install-end-time`)!.value = install.end_time || "";
  }
  if (dismantle.enabled) {
    card.querySelector<HTMLInputElement>(`#${uid}-dismantle-date`)!.value = dismantle.date || "";
    card.querySelector<HTMLInputElement>(`#${uid}-dismantle-start-time`)!.value = dismantle.start_time || "";
    card.querySelector<HTMLInputElement>(`#${uid}-dismantle-end-time`)!.value = dismantle.end_time || "";
  }

  card.querySelector<HTMLInputElement>(".remove-reservation-btn")!.addEventListener("click", () => {
    card.remove();
    updateFormDatesHelper();
    updateSubmissionFinancialSummary();
    autoSaveActivityForm();
  });

  let hasAutoAddedLinked = !!reservationData;
  const otherDetailsGroup = card.querySelector<HTMLInputElement>(".room-other-details-group")!;
  initSearchableSelectEl(
    card.querySelector<HTMLInputElement>(".room-select-group")!,
    buildRoomSelectItems(),
    value => {
      otherDetailsGroup.style.display = value === OTHER_ROOM_VALUE ? "flex" : "none";
      refreshReservationTariffSelect(card, value);
      if (!hasAutoAddedLinked && value && value !== OTHER_ROOM_VALUE) {
        hasAutoAddedLinked = true;
        autoAddLinkedStaffAndFees(card, value);
      }
      updateFormDatesHelper();
      updateSubmissionFinancialSummary();
      autoSaveActivityForm();
    },
    roomName
  );

  const selectedTariffId = isCustomTariff ? "__custom__" : reservationData ? reservationData.tariff_id : "";
  refreshReservationTariffSelect(card, roomName, selectedTariffId);

  const paramSelect = card.querySelector<HTMLInputElement>(".room-tariff-parameter")!;
  const ctSelect = card.querySelector<HTMLInputElement>(".room-tariff-client-type")!;
  const ctGroup = card.querySelector<HTMLInputElement>(".room-tariff-client-type-group")!;
  const customGroup = card.querySelector<HTMLInputElement>(".room-tariff-custom-group")!;

  paramSelect.addEventListener("change", () => {
    const isCustom = paramSelect.value === "__custom__";
    if (isCustom) {
      ctGroup.style.display = "none";
      customGroup.style.display = "flex";
      ctSelect.value = "";
    } else {
      ctGroup.style.display = "flex";
      customGroup.style.display = "none";
      const roomVal = card.querySelector<HTMLInputElement>(".searchable-select-value")!.value;
      const currentCtVal = ctSelect.value;
      ctSelect.innerHTML = `
        <option value="">Sélectionner...</option>
        ${buildTariffClientTypeOptionsHtml(roomVal, "", currentCtVal, paramSelect.value)}
      `;
      ctSelect.value = currentCtVal;
    }
    updateResolvedPriceDisplay(card);
    updateSubmissionFinancialSummary();
    autoSaveActivityForm();
  });

  ctSelect.addEventListener("change", () => {
    updateResolvedPriceDisplay(card);
    updateSubmissionFinancialSummary();
    autoSaveActivityForm();
  });

  card.querySelectorAll(".room-tariff-custom-group input, .room-tariff-custom-group select").forEach(input => {
    input.addEventListener("input", () => {
      updateSubmissionFinancialSummary();
      autoSaveActivityForm();
    });
    input.addEventListener("change", () => {
      updateSubmissionFinancialSummary();
      autoSaveActivityForm();
    });
  });
  rejectNegativeAmountOnBlur(card.querySelector<HTMLInputElement>(".room-tariff-custom-amount")!);

  const glItems = appState.settings.accounts.map(acc => ({
    value: acc.code,
    label: `${acc.code} (${acc.description})`
  }));

  initSearchableSelectEl(
    card.querySelector<HTMLElement>(".room-tariff-custom-gl-wrapper")!,
    glItems,
    value => {
      updateSubmissionFinancialSummary();
      autoSaveActivityForm();
    },
    isCustomTariff ? reservationData.tariff_gl_account_code : ""
  );

  const installToggle = card.querySelector<HTMLInputElement>(".reservation-install-toggle")!;
  const installFields = card.querySelector<HTMLInputElement>(".reservation-install-fields")!;
  installToggle.addEventListener("click", () => {
    installToggle.classList.toggle("active");
    installFields.style.display = installToggle.classList.contains("active") ? "flex" : "none";
    updateFormDatesHelper();
    autoSaveActivityForm();
  });
  const dismantleToggle = card.querySelector<HTMLInputElement>(".reservation-dismantle-toggle")!;
  const dismantleFields = card.querySelector<HTMLInputElement>(".reservation-dismantle-fields")!;
  dismantleToggle.addEventListener("click", () => {
    dismantleToggle.classList.toggle("active");
    dismantleFields.style.display = dismantleToggle.classList.contains("active") ? "flex" : "none";
    updateFormDatesHelper();
    autoSaveActivityForm();
  });

  card.querySelectorAll<HTMLInputElement>(".datepicker-wrapper")!.forEach(initDatepickerWrapper);

  const slotsList = card.querySelector<HTMLInputElement>(".reservation-slots-list")!;
  card.querySelector<HTMLInputElement>(".reservation-add-slot-btn")!.addEventListener("click", () => {
    addNextSlotRow(slotsList);
    updateFormDatesHelper();
    updateSubmissionFinancialSummary();
  });
  wireSlotRangeGenerator(card);
  if (reservationData) {
    (reservationData.slots || []).forEach((s: any) => addSlotRow(slotsList, s.date, s.start_time, s.end_time));
    // Re-run now that the slots are in the DOM: the earlier call (via refreshReservationTariffSelect)
    // ran before any slot existed, so it couldn't resolve the pricing grid for the right date yet.
    updateResolvedPriceDisplay(card);
  }

  const barToggleGroup = card.querySelector<HTMLInputElement>(".room-bar-toggle-group")!;
  const barDetails = card.querySelector<HTMLInputElement>(".room-bar-details")!;
  const barDrinkGroup = card.querySelector<HTMLInputElement>(".room-bar-drink-group")!;
  const barServiceTypeGroup = card.querySelector<HTMLInputElement>(".room-bar-service-type-group")!;
  const barHostessCountGroup = card.querySelector<HTMLInputElement>(".room-bar-hostess-count-group")!;
  const barSpecialOrderInput = card.querySelector<HTMLInputElement>(".room-bar-special-order")!;
  const hostDutiesGroup = card.querySelector<HTMLInputElement>(".room-host-duties-group")!;
  const hostDutiesCountGroup = card.querySelector<HTMLInputElement>(".room-host-duties-count-group")!;

  initPillToggleEl(card.querySelector<HTMLInputElement>(".room-technical-services-group")!);
  card.querySelector<HTMLInputElement>(".room-technical-services-group")!.addEventListener("click", e => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>(".pill-toggle");
    if (btn && btn.classList.contains("active")) {
      autoAddTechnicalDirectorIfNeeded(staffList);
      updateSubmissionFinancialSummary();
    }
    autoSaveActivityForm();
  });

  initPillToggleEl(barToggleGroup);
  barToggleGroup.addEventListener("click", e => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>(".pill-toggle");
    if (!btn) return;
    const active = btn.classList.contains("active");
    barDetails.style.display = active ? "block" : "none";
    if (!active) {
      setExclusivePillValueEl(barDrinkGroup, "");
      setExclusivePillValueEl(barServiceTypeGroup, "");
      barHostessCountGroup.style.display = "none";
      barSpecialOrderInput.value = "";
    }
    autoSaveActivityForm();
  });
  initExclusivePillToggleEl(barDrinkGroup, () => {
    autoSaveActivityForm();
  });
  initExclusivePillToggleEl(barServiceTypeGroup, value => {
    barHostessCountGroup.style.display =
      value === "Service d'hôtesses" || value === "Distribution de breuvages et nettoyage de coupes" ? "flex" : "none";
    autoSaveActivityForm();
  });

  initPillToggleEl(hostDutiesGroup);
  hostDutiesGroup.addEventListener("click", () => {
    const anyActive = hostDutiesGroup.querySelectorAll<HTMLInputElement>(".pill-toggle.active")!.length > 0;
    hostDutiesCountGroup.style.display = anyActive ? "flex" : "none";
    autoSaveActivityForm();
  });

  if (reservationData) {
    setPillGroupActiveEl(card.querySelector<HTMLInputElement>(".room-technical-services-group")!, reservationData.technical_services || []);

    const barService = reservationData.bar_service || {
      active: false,
      drink_type: "",
      service_type: "",
      hostess_count: 0,
      special_order: ""
    };
    if (barService.active) {
      barToggleGroup.querySelector<HTMLInputElement>(".pill-toggle")!.classList.add("active");
      barDetails.style.display = "block";
    }
    setExclusivePillValueEl(barDrinkGroup, barService.drink_type || "");
    setExclusivePillValueEl(barServiceTypeGroup, barService.service_type || "");
    barHostessCountGroup.style.display =
      barService.service_type === "Service d'hôtesses" || barService.service_type === "Distribution de breuvages et nettoyage de coupes"
        ? "flex"
        : "none";
    card.querySelector<HTMLInputElement>(".room-bar-hostess-count")!.value = barService.hostess_count || 1;
    barSpecialOrderInput.value = barService.special_order || "";

    const hostDuties = reservationData.host_duties || { duties: [], hostess_count: 0 };
    setPillGroupActiveEl(hostDutiesGroup, hostDuties.duties || []);
    hostDutiesCountGroup.style.display = (hostDuties.duties || []).length > 0 ? "flex" : "none";
    card.querySelector<HTMLInputElement>(".room-host-duties-count")!.value = hostDuties.hostess_count || 1;
  }

  const staffList = card.querySelector<HTMLInputElement>(".room-staff-list")!;
  const servicesList = card.querySelector<HTMLInputElement>(".room-services-list")!;
  const feesList = card.querySelector<HTMLInputElement>(".room-fees-list")!;
  card.querySelector<HTMLInputElement>(".room-add-staff-btn")!.addEventListener("click", () => addStaffRow(staffList));
  card.querySelector<HTMLInputElement>(".room-add-service-btn")!.addEventListener("click", () => addServiceRow(servicesList));
  card.querySelector<HTMLInputElement>(".room-add-fee-btn")!.addEventListener("click", () => addFeeRow(feesList));

  if (reservationData) {
    (reservationData.staff || []).forEach((s: any) =>
      addStaffRow(
        staffList,
        s.salary_id,
        s.count,
        s.hours,
        s.overtime_hours,
        s.gl_account_code || "",
        s.auto_generated,
        s.custom_rate || 0,
        s.custom_overtime_rate || 0,
        s.tarif_id === "__custom__"
      )
    );
    (reservationData.services || []).forEach((s: any) =>
      addServiceRow(
        servicesList,
        s.service_id,
        s.count,
        s.hours,
        s.tarif_id,
        s.auto_generated,
        s.custom_rate || 0,
        s.custom_gl_account_code || ""
      )
    );
    (reservationData.fees || []).forEach((f: any) => addFeeRow(feesList, f.description, f.amount, f.gl_account_code, f.auto_generated));

    if ((reservationData.technical_services || []).length > 0) {
      autoAddTechnicalDirectorIfNeeded(staffList);
    }
  }

  return card;
}

export { buildRoomSelectItems, buildRoomDateTimeFieldHtml, buildDatePeriodFieldHtml, addReservationCard };
