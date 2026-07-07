/**
 * activities-reservations.js - Room reservation cards: date/time builders,
 * tariff resolution, staff/service/fee sub-rows, and form collection helpers.
 * Part 3/5 of the activities module (see activities-render.js for context).
 */

// Items for the salle searchable-select: every configured room, plus a virtual "Autre" entry
function buildRoomSelectItems() {
  return [...appState.settings.rooms.map(r => ({ value: r.name, label: r.name })), { value: OTHER_ROOM_VALUE, label: "Autre" }];
}

// Wires the "+ Ajouter une réservation" button
function initReservationsSection() {
  const addBtn = document.getElementById("add-reservation-btn");
  if (!addBtn) return;
  addBtn.addEventListener("click", () => {
    addReservationCard();
    updateFormDatesHelper();
    updateSubmissionFinancialSummary();
  });
}

// Builds one datepicker + time input pair (used for the optional montage/démontage periods)
function buildRoomDateTimeFieldHtml(dateId, timeId, label) {
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

// Builds one datepicker + heure de début/fin trio (used for the montage/démontage periods,
// which are confined to a single date but span a start-to-end time range within that date).
function buildDatePeriodFieldHtml(dateId, startTimeId, endTimeId, label) {
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

function buildTariffParameterOptionsHtml(roomName, dateStr, selectedTariffId) {
  if (!roomName || roomName === OTHER_ROOM_VALUE) return "";
  const roomConfig = appState.settings.rooms.find(r => r.name === roomName);
  const grid = roomConfig ? getActivePricingGrid(roomConfig, dateStr) : null;
  if (!grid) return "";

  let selectedParamId = "";
  if (selectedTariffId && selectedTariffId !== "__custom__" && selectedTariffId.includes("::")) {
    selectedParamId = selectedTariffId.split("::")[0];
  }

  return grid.parameters
    .map(p => `<option value="${p.id}" ${selectedParamId === p.id ? "selected" : ""}>${escapeHtml(p.name)}</option>`)
    .join("");
}

function buildTariffClientTypeOptionsHtml(roomName, dateStr, selectedTariffId, selectedParamId = "") {
  if (!roomName || roomName === OTHER_ROOM_VALUE) return "";
  const roomConfig = appState.settings.rooms.find(r => r.name === roomName);
  const grid = roomConfig ? getActivePricingGrid(roomConfig, dateStr) : null;
  if (!grid) return "";

  let selectedCtId = "";
  if (selectedTariffId && selectedTariffId !== "__custom__" && selectedTariffId.includes("::")) {
    const parts = selectedTariffId.split("::");
    selectedCtId = parts[1];
    if (!selectedParamId) {
      selectedParamId = parts[0];
    }
  }

  return grid.client_types
    .map(ct => {
      let suffix = "";
      if (selectedParamId && selectedParamId !== "__custom__") {
        const cell = grid.cells.find(c => c.parameter_id === selectedParamId && c.client_type_id === ct.id);
        if (cell) {
          suffix = ` (${cell.amount}$/jour)`;
        }
      }
      return `<option value="${ct.id}" ${selectedCtId === ct.id ? "selected" : ""}>${escapeHtml(ct.name)}${suffix}</option>`;
    })
    .join("");
}

function updateResolvedPriceDisplay(card) {
  const roomName = card.querySelector(".searchable-select-value").value;
  const paramSelect = card.querySelector(".room-tariff-parameter");
  const ctSelect = card.querySelector(".room-tariff-client-type");
  const displayEl = card.querySelector(".room-tariff-resolved-price-display");
  const valEl = card.querySelector(".resolved-price-val");

  if (!paramSelect || !ctSelect || !displayEl || !valEl) return;

  const paramVal = paramSelect.value;
  const clientTypeVal = ctSelect.value;

  if (roomName && roomName !== OTHER_ROOM_VALUE && paramVal && paramVal !== "__custom__" && clientTypeVal) {
    const roomConfig = appState.settings.rooms.find(r => r.name === roomName);
    const grid = roomConfig ? getActivePricingGrid(roomConfig, "") : null;
    if (grid) {
      const cell = grid.cells.find(c => c.parameter_id === paramVal && c.client_type_id === clientTypeVal);
      const price = cell ? cell.amount : 0;
      valEl.textContent = formatCurrency(price);
      displayEl.style.display = "block";
      return;
    }
  }
  displayEl.style.display = "none";
}

function refreshReservationTariffSelect(card, roomName, selectedTariffId = "") {
  const paramSelect = card.querySelector(".room-tariff-parameter");
  const ctSelect = card.querySelector(".room-tariff-client-type");
  const ctGroup = card.querySelector(".room-tariff-client-type-group");
  const customGroup = card.querySelector(".room-tariff-custom-group");

  if (!paramSelect || !ctSelect || !ctGroup || !customGroup) return;

  const isCustom = selectedTariffId === "__custom__";

  paramSelect.innerHTML = `
    <option value="">Sélectionner...</option>
    ${buildTariffParameterOptionsHtml(roomName, "", selectedTariffId)}
    <option value="__custom__" ${isCustom ? "selected" : ""}>Montant personnalisé...</option>
  `;

  let selectedParamId = "";
  if (selectedTariffId && selectedTariffId !== "__custom__" && selectedTariffId.includes("::")) {
    selectedParamId = selectedTariffId.split("::")[0];
  }

  ctSelect.innerHTML = `
    <option value="">Sélectionner...</option>
    ${buildTariffClientTypeOptionsHtml(roomName, "", selectedTariffId, selectedParamId)}
  `;

  if (isCustom) {
    ctGroup.style.display = "none";
    customGroup.style.display = "flex";
  } else {
    ctGroup.style.display = "flex";
    customGroup.style.display = "none";
  }

  updateResolvedPriceDisplay(card);
}

// Adds one créneau row (date + heure début + heure fin) to a reservation card's slots list. The
// date field is a masked text input (like every other date field in the app: type "20260809" and
// the dashes insert themselves) rather than a native <input type="date">, whose keyboard entry
// order/behaviour is locale-dependent and can require tabbing between day/month/year segments.
function addSlotRow(container, date = "", startTime = "", endTime = "") {
  const rowId = generateUid("slot-row");
  container.insertAdjacentHTML(
    "beforeend",
    `
    <div id="${rowId}" class="distribution-row reservation-slot-row" style="grid-template-columns: 1fr 0.8fr 0.8fr auto;">
      <input type="text" class="form-input slot-date-input" placeholder="AAAA-MM-JJ" pattern="\\d{4}-\\d{2}-\\d{2}" value="${date}">
      <input type="time" class="form-input slot-start-time-input" value="${startTime}">
      <input type="time" class="form-input slot-end-time-input" value="${endTime}">
      <button type="button" class="btn-icon delete-slot-row-btn" data-row-id="${rowId}" title="Retirer ce créneau">
        <svg viewBox="0 0 24 24" style="width: 14px; height: 14px;"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
      </button>
    </div>
  `
  );
  const row = document.getElementById(rowId);
  maskDateInput(row.querySelector(".slot-date-input"));
  row.querySelector(".delete-slot-row-btn").addEventListener("click", () => {
    row.remove();
    updateFormDatesHelper();
    updateSubmissionFinancialSummary();
    autoSaveActivityForm();
  });
}

// Reads a reservation card's créneaux into a slots[]-shaped array (rows without a date are
// dropped, so an accidentally-blanked row doesn't get saved as a phantom créneau)
function collectSlotsFromCard(card) {
  return Array.from(card.querySelectorAll(".reservation-slots-list .reservation-slot-row"))
    .map(row => ({
      id: generateUid("slot"),
      date: row.querySelector(".slot-date-input").value,
      start_time: row.querySelector(".slot-start-time-input").value,
      end_time: row.querySelector(".slot-end-time-input").value
    }))
    .filter(s => s.date);
}

// Adds a créneau by duplicating the last row in `container` (heure début/fin included) onto
// the following day, so entering a multi-day event with the same daily schedule only takes one
// click per day. Falls back to a blank row when the list is still empty.
function addNextSlotRow(container) {
  const rows = container.querySelectorAll(".reservation-slot-row");
  const last = rows[rows.length - 1];
  if (!last) {
    addSlotRow(container);
    return;
  }

  const lastDate = last.querySelector(".slot-date-input").value;
  const startTime = last.querySelector(".slot-start-time-input").value;
  const endTime = last.querySelector(".slot-end-time-input").value;
  let nextDate = "";
  if (lastDate) {
    const d = parseLocalDateStr(lastDate);
    d.setDate(d.getDate() + 1);
    nextDate = formatDateStrLocal(d);
  }
  addSlotRow(container, nextDate, startTime, endTime);
}

// Builds the "+ Plage de jours" mini-generator markup: a date range, the weekdays to include,
// and a shared heure début/fin, so a repeating multi-day schedule can be entered in one shot
// instead of adding créneaux one at a time.
function buildSlotRangeGeneratorHtml() {
  return `
    <div class="reservation-slot-range-generator" style="display: none; border: 1px dashed var(--border-color); border-radius: var(--radius-md); padding: 12px; margin-bottom: 12px;">
      <div class="form-group-row">
        <div class="form-group">
          <label>Du</label>
          <input type="text" class="form-input slot-range-start-date" placeholder="AAAA-MM-JJ" pattern="\\d{4}-\\d{2}-\\d{2}">
        </div>
        <div class="form-group">
          <label>Au</label>
          <input type="text" class="form-input slot-range-end-date" placeholder="AAAA-MM-JJ" pattern="\\d{4}-\\d{2}-\\d{2}">
        </div>
      </div>
      <div class="form-group-row">
        <div class="form-group">
          <label>Heure de début</label>
          <input type="time" class="form-input slot-range-start-time">
        </div>
        <div class="form-group">
          <label>Heure de fin</label>
          <input type="time" class="form-input slot-range-end-time">
        </div>
      </div>
      <div class="form-group">
        <label>Jours à inclure</label>
        <div class="pill-toggle-group slot-range-weekdays-group">
          ${WEEKDAY_PILL_OPTIONS.map(d => `<button type="button" class="pill-toggle active" data-value="${d.value}">${d.label}</button>`).join("")}
        </div>
      </div>
      <div style="display: flex; gap: 8px; justify-content: flex-end;">
        <button type="button" class="btn btn-secondary slot-range-cancel-btn" style="padding: 6px 12px; font-size: 0.8rem;">Annuler</button>
        <button type="button" class="btn btn-primary slot-range-generate-btn" style="padding: 6px 12px; font-size: 0.8rem;">Générer les créneaux</button>
      </div>
    </div>
  `;
}

function wireSlotRangeGenerator(card) {
  const generatorEl = card.querySelector(".reservation-slot-range-generator");
  const toggleBtn = card.querySelector(".reservation-add-slot-range-btn");
  const weekdaysGroup = generatorEl.querySelector(".slot-range-weekdays-group");
  const slotsList = card.querySelector(".reservation-slots-list");
  initPillToggleEl(weekdaysGroup);
  maskDateInput(generatorEl.querySelector(".slot-range-start-date"));
  maskDateInput(generatorEl.querySelector(".slot-range-end-date"));

  toggleBtn.addEventListener("click", () => {
    generatorEl.style.display = generatorEl.style.display === "none" ? "block" : "none";
  });
  generatorEl.querySelector(".slot-range-cancel-btn").addEventListener("click", () => {
    generatorEl.style.display = "none";
  });

  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  generatorEl.querySelector(".slot-range-generate-btn").addEventListener("click", () => {
    const startVal = generatorEl.querySelector(".slot-range-start-date").value;
    const endVal = generatorEl.querySelector(".slot-range-end-date").value;
    const startTime = generatorEl.querySelector(".slot-range-start-time").value;
    const endTime = generatorEl.querySelector(".slot-range-end-time").value;
    if (
      !dateRegex.test(startVal) ||
      !dateRegex.test(endVal) ||
      isNaN(parseLocalDateStr(startVal).getTime()) ||
      isNaN(parseLocalDateStr(endVal).getTime())
    ) {
      showToast("Veuillez entrer une date de début et une date de fin valides (AAAA-MM-JJ).", "warning");
      return;
    }
    const start = parseLocalDateStr(startVal);
    const end = parseLocalDateStr(endVal);
    if (start > end) {
      showToast("La date de début doit être antérieure ou égale à la date de fin.", "warning");
      return;
    }
    const activeWeekdays = Array.from(weekdaysGroup.querySelectorAll(".pill-toggle.active")).map(b => parseInt(b.dataset.value, 10));
    const d = new Date(start);
    while (d <= end) {
      if (activeWeekdays.includes(d.getDay())) addSlotRow(slotsList, formatDateStrLocal(d), startTime, endTime);
      d.setDate(d.getDate() + 1);
    }
    generatorEl.style.display = "none";
    updateFormDatesHelper();
    updateSubmissionFinancialSummary();
  });
}

// Adds a reservation card to #form-activity-reservations. `reservationData` (an
// act.reservations[] entry) pre-fills the fields when editing/duplicating an activity.
function addReservationCard(reservationData = null) {
  const container = document.getElementById("form-activity-reservations");
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
          <label>Salle</label>
          ${buildSearchableSelectHtml("room-select-group", "room-search-input", "Rechercher une salle...")}
        </div>
        <button type="button" class="btn-icon remove-reservation-btn" title="Retirer cette réservation">
          <svg viewBox="0 0 24 24" style="width: 16px; height: 16px;"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
        </button>
      </div>

      <div class="form-group room-other-details-group" style="display: ${isOther ? "flex" : "none"};">
        <label>Détails de la salle</label>
        <input type="text" class="form-input room-other-details-input" placeholder="Précisez la salle utilisée..." value="${escapeHtml(reservationData && reservationData.room_other_details)}">
      </div>

      <div class="form-group-row room-tariff-fields-row" style="display: flex; gap: 12px; margin-bottom: 12px;">
        <div class="form-group" style="flex: 1; margin-bottom: 0;">
          <label>Tarif - Paramètre</label>
          <select class="select-input room-tariff-parameter" style="padding: 10px 14px; width: 100%;">
            <option value="">Sélectionner...</option>
          </select>
        </div>
        <div class="form-group room-tariff-client-type-group" style="flex: 1; margin-bottom: 0; display: flex; flex-direction: column;">
          <label>Tarif - Type de client</label>
          <select class="select-input room-tariff-client-type" style="padding: 10px 14px; width: 100%;">
            <option value="">Sélectionner...</option>
          </select>
        </div>
      </div>
      <div class="room-tariff-resolved-price-display" style="font-size: 0.85rem; color: var(--text-secondary); margin-top: -6px; margin-bottom: 12px; display: none;">
        Tarif résolu : <strong class="resolved-price-val">0,00 $</strong> / jour
      </div>
      <div class="form-group-row room-tariff-custom-group" style="display: ${isCustomTariff ? "flex" : "none"};">
        <div class="form-group">
          <label>Description du tarif</label>
          <input type="text" class="form-input room-tariff-custom-desc" placeholder="Ex: Rabais ponctuel" value="${isCustomTariff ? escapeHtml(reservationData.tariff_description) : ""}">
        </div>
        <div class="form-group">
          <label>Montant ($ par jour)</label>
          <input type="number" class="form-input room-tariff-custom-amount" min="0" step="0.01" value="${isCustomTariff ? reservationData.tariff_amount : ""}">
        </div>
      </div>

      <div class="form-group">
        <label>Montage / Démontage</label>
        <div class="pill-toggle-group">
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
          <label>Créneaux</label>
          <div style="display: flex; gap: 8px;">
            <button type="button" class="btn btn-secondary reservation-add-slot-range-btn" style="padding: 6px 12px; font-size: 0.8rem;">+ Plage de jours</button>
            <button type="button" class="btn btn-secondary reservation-add-slot-btn" style="padding: 6px 12px; font-size: 0.8rem;">+ Créneau</button>
          </div>
        </div>
        ${buildSlotRangeGeneratorHtml()}
        <div class="distribution-list reservation-slots-list"></div>
      </div>

      <div class="form-group">
        <label>Services techniques</label>
        <div class="pill-toggle-group room-technical-services-group">
          ${TECHNICAL_SERVICES.map(s => `<button type="button" class="pill-toggle" data-value="${s}">${s}</button>`).join("")}
        </div>
      </div>

      <div class="form-group">
        <label>Service de bar</label>
        <div class="pill-toggle-group room-bar-toggle-group">
          <button type="button" class="pill-toggle" data-value="active">Activer le service de bar</button>
        </div>
      </div>
      <div class="room-bar-details" style="display: none;">
        <div class="form-group">
          <label>Type de boisson</label>
          <div class="pill-toggle-group room-bar-drink-group">
            ${BAR_DRINK_TYPES.map(s => `<button type="button" class="pill-toggle" data-value="${s}">${s}</button>`).join("")}
          </div>
        </div>
        <div class="form-group">
          <label>Type de service</label>
          <div class="pill-toggle-group room-bar-service-type-group">
            ${BAR_SERVICE_TYPES.map(s => `<button type="button" class="pill-toggle" data-value="${s}">${s}</button>`).join("")}
          </div>
        </div>
        <div class="form-group room-bar-hostess-count-group" style="display: none;">
          <label>Nombre d'hôtesses</label>
          <input type="number" class="form-input room-bar-hostess-count" min="1" step="1" value="1">
        </div>
        <div class="form-group">
          <label>Commande spéciale</label>
          <input type="text" class="form-input room-bar-special-order" placeholder="Précisez la commande spéciale...">
        </div>
      </div>

      <div class="form-group">
        <label>Autres services</label>
        <div class="pill-toggle-group room-host-duties-group">
          ${HOST_DUTY_OPTIONS.map(s => `<button type="button" class="pill-toggle" data-value="${s}">${s}</button>`).join("")}
        </div>
      </div>
      <div class="form-group room-host-duties-count-group" style="display: none;">
        <label>Nombre d'hôtesses</label>
        <input type="number" class="form-input room-host-duties-count" min="1" step="1" value="1">
      </div>

      <div class="distribution-section">
        <div class="distribution-header">
          <label>Personnel requis</label>
          <button type="button" class="btn btn-secondary room-add-staff-btn" style="padding: 6px 12px; font-size: 0.8rem;">+ Ajouter</button>
        </div>
        <div class="distribution-column-labels" style="display: grid; grid-template-columns: 1.4fr 0.6fr 0.6fr 0.6fr 1fr auto; gap: 12px; font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.02em; padding: 0 12px; margin-bottom: 4px;">
          <span>Emploi</span><span>Qté</span><span>Heures</span><span title="Heures en temps supplémentaire">Heures sup.</span><span>Sous-total</span><span></span>
        </div>
        <div class="distribution-list room-staff-list"></div>
      </div>

      <div class="distribution-section">
        <div class="distribution-header">
          <label>Services</label>
          <button type="button" class="btn btn-secondary room-add-service-btn" style="padding: 6px 12px; font-size: 0.8rem;">+ Ajouter</button>
        </div>
        <div class="distribution-column-labels" style="display: grid; grid-template-columns: 1.6fr 0.7fr 0.7fr 1fr auto; gap: 12px; font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.02em; padding: 0 12px; margin-bottom: 4px;">
          <span>Service</span><span>Qté</span><span title="Utilisé seulement pour les services facturés à l'heure">Heures</span><span>Sous-total</span><span></span>
        </div>
        <div class="distribution-list room-services-list"></div>
      </div>

      <div class="distribution-section">
        <div class="distribution-header">
          <label>Autres frais</label>
          <button type="button" class="btn btn-secondary room-add-fee-btn" style="padding: 6px 12px; font-size: 0.8rem;">+ Ajouter</button>
        </div>
        <div class="distribution-list room-fees-list"></div>
      </div>
    </div>
  `
  );

  const card = document.getElementById(uid);

  if (install.enabled) {
    card.querySelector(`#${uid}-install-date`).value = install.date || "";
    card.querySelector(`#${uid}-install-start-time`).value = install.start_time || "";
    card.querySelector(`#${uid}-install-end-time`).value = install.end_time || "";
  }
  if (dismantle.enabled) {
    card.querySelector(`#${uid}-dismantle-date`).value = dismantle.date || "";
    card.querySelector(`#${uid}-dismantle-start-time`).value = dismantle.start_time || "";
    card.querySelector(`#${uid}-dismantle-end-time`).value = dismantle.end_time || "";
  }

  // Remove this reservation entirely
  card.querySelector(".remove-reservation-btn").addEventListener("click", () => {
    card.remove();
    updateFormDatesHelper();
    updateSubmissionFinancialSummary();
    autoSaveActivityForm();
  });

  // Salle searchable-select: switching room resets the tarif options and reveals the "Autre"
  // free-text field; linked staff/frais are only auto-added the first time a brand-new
  // (empty) card gets a room picked, mirroring the previous pill-toggle behaviour.
  let hasAutoAddedLinked = !!reservationData;
  const otherDetailsGroup = card.querySelector(".room-other-details-group");
  initSearchableSelectEl(
    card.querySelector(".room-select-group"),
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

  // Initialize the split selects with the initial value
  const selectedTariffId = isCustomTariff ? "__custom__" : reservationData ? reservationData.tariff_id : "";
  refreshReservationTariffSelect(card, roomName, selectedTariffId);

  // Wire the tarif selects to reveal/hide custom fields and show resolved price
  const paramSelect = card.querySelector(".room-tariff-parameter");
  const ctSelect = card.querySelector(".room-tariff-client-type");
  const ctGroup = card.querySelector(".room-tariff-client-type-group");
  const customGroup = card.querySelector(".room-tariff-custom-group");

  paramSelect.addEventListener("change", () => {
    const isCustom = paramSelect.value === "__custom__";
    if (isCustom) {
      ctGroup.style.display = "none";
      customGroup.style.display = "flex";
      ctSelect.value = "";
    } else {
      ctGroup.style.display = "flex";
      customGroup.style.display = "none";
      // Re-populate client types to show prices for this parameter
      const roomVal = card.querySelector(".searchable-select-value").value;
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

  // Montage/démontage optional toggles
  const installToggle = card.querySelector(".reservation-install-toggle");
  const installFields = card.querySelector(".reservation-install-fields");
  installToggle.addEventListener("click", () => {
    installToggle.classList.toggle("active");
    installFields.style.display = installToggle.classList.contains("active") ? "flex" : "none";
    updateFormDatesHelper();
    autoSaveActivityForm();
  });
  const dismantleToggle = card.querySelector(".reservation-dismantle-toggle");
  const dismantleFields = card.querySelector(".reservation-dismantle-fields");
  dismantleToggle.addEventListener("click", () => {
    dismantleToggle.classList.toggle("active");
    dismantleFields.style.display = dismantleToggle.classList.contains("active") ? "flex" : "none";
    updateFormDatesHelper();
    autoSaveActivityForm();
  });

  // Wire the datepickers for the montage/démontage date fields
  card.querySelectorAll(".datepicker-wrapper").forEach(initDatepickerWrapper);

  // Créneaux: manual add button, plage-de-jours generator, and pre-filled rows when editing
  const slotsList = card.querySelector(".reservation-slots-list");
  card.querySelector(".reservation-add-slot-btn").addEventListener("click", () => {
    addNextSlotRow(slotsList);
    updateFormDatesHelper();
    updateSubmissionFinancialSummary();
  });
  wireSlotRangeGenerator(card);
  if (reservationData) {
    (reservationData.slots || []).forEach(s => addSlotRow(slotsList, s.date, s.start_time, s.end_time));
  }

  // Wire this card's Services techniques / Service de bar / Autres services pill groups
  const barToggleGroup = card.querySelector(".room-bar-toggle-group");
  const barDetails = card.querySelector(".room-bar-details");
  const barDrinkGroup = card.querySelector(".room-bar-drink-group");
  const barServiceTypeGroup = card.querySelector(".room-bar-service-type-group");
  const barHostessCountGroup = card.querySelector(".room-bar-hostess-count-group");
  const barSpecialOrderInput = card.querySelector(".room-bar-special-order");
  const hostDutiesGroup = card.querySelector(".room-host-duties-group");
  const hostDutiesCountGroup = card.querySelector(".room-host-duties-count-group");

  initPillToggleEl(card.querySelector(".room-technical-services-group"));
  card.querySelector(".room-technical-services-group").addEventListener("click", () => {
    autoSaveActivityForm();
  });

  initPillToggleEl(barToggleGroup);
  barToggleGroup.addEventListener("click", e => {
    const btn = e.target.closest(".pill-toggle");
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
    const anyActive = hostDutiesGroup.querySelectorAll(".pill-toggle.active").length > 0;
    hostDutiesCountGroup.style.display = anyActive ? "flex" : "none";
    autoSaveActivityForm();
  });

  if (reservationData) {
    setPillGroupActiveEl(card.querySelector(".room-technical-services-group"), reservationData.technical_services || []);

    const barService = reservationData.bar_service || {
      active: false,
      drink_type: "",
      service_type: "",
      hostess_count: 0,
      special_order: ""
    };
    if (barService.active) {
      barToggleGroup.querySelector(".pill-toggle").classList.add("active");
      barDetails.style.display = "block";
    }
    setExclusivePillValueEl(barDrinkGroup, barService.drink_type || "");
    setExclusivePillValueEl(barServiceTypeGroup, barService.service_type || "");
    barHostessCountGroup.style.display =
      barService.service_type === "Service d'hôtesses" || barService.service_type === "Distribution de breuvages et nettoyage de coupes"
        ? "flex"
        : "none";
    card.querySelector(".room-bar-hostess-count").value = barService.hostess_count || 1;
    barSpecialOrderInput.value = barService.special_order || "";

    const hostDuties = reservationData.host_duties || { duties: [], hostess_count: 0 };
    setPillGroupActiveEl(hostDutiesGroup, hostDuties.duties || []);
    hostDutiesCountGroup.style.display = (hostDuties.duties || []).length > 0 ? "flex" : "none";
    card.querySelector(".room-host-duties-count").value = hostDuties.hostess_count || 1;
  }

  // Wire this card's own Personnel requis / Services / Autres frais buttons and lists
  const staffList = card.querySelector(".room-staff-list");
  const servicesList = card.querySelector(".room-services-list");
  const feesList = card.querySelector(".room-fees-list");
  card.querySelector(".room-add-staff-btn").addEventListener("click", () => addStaffRow(staffList));
  card.querySelector(".room-add-service-btn").addEventListener("click", () => addServiceRow(servicesList));
  card.querySelector(".room-add-fee-btn").addEventListener("click", () => addFeeRow(feesList));

  if (reservationData) {
    (reservationData.staff || []).forEach(s => addStaffRow(staffList, s.salary_id, s.count, s.hours, s.overtime_hours, s.auto_generated));
    (reservationData.services || []).forEach(s => addServiceRow(servicesList, s.service_id, s.count, s.hours, s.auto_generated));
    (reservationData.fees || []).forEach(f => addFeeRow(feesList, f.description, f.amount, f.gl_account_code, f.auto_generated));
  }

  return card;
}

// Reads all currently visible reservation cards into an act.reservations[]-shaped array
function collectReservationsFromForm() {
  const cards = document.querySelectorAll("#form-activity-reservations .reservation-card");
  return Array.from(cards).map(card => {
    const uid = card.id;
    const roomName = card.querySelector(".searchable-select-value").value;
    const isOther = roomName === OTHER_ROOM_VALUE;

    const paramSelect = card.querySelector(".room-tariff-parameter");
    const ctSelect = card.querySelector(".room-tariff-client-type");
    const paramVal = paramSelect ? paramSelect.value : "";
    const clientTypeVal = ctSelect ? ctSelect.value : "";
    let tariffId = "",
      tariffDescription = "",
      tariffAmount = 0,
      tariffGlAccountCode = "";

    if (paramVal === "__custom__") {
      tariffDescription = card.querySelector(".room-tariff-custom-desc").value.trim();
      tariffAmount = parseFloat(card.querySelector(".room-tariff-custom-amount").value) || 0;
    } else if (paramVal && clientTypeVal && !isOther) {
      const roomConfig = appState.settings.rooms.find(r => r.name === roomName);
      const slots = collectSlotsFromCard(card);
      const firstSlotDate = slots.length ? [...slots].map(s => s.date).sort()[0] : "";
      const grid = roomConfig ? getActivePricingGrid(roomConfig, firstSlotDate) : null;
      if (grid) {
        const param = grid.parameters.find(p => p.id === paramVal);
        const ct = grid.client_types.find(c => c.id === clientTypeVal);
        const cell = grid.cells.find(c => c.parameter_id === paramVal && c.client_type_id === clientTypeVal);
        if (param && ct) {
          tariffId = `${paramVal}::${clientTypeVal}`;
          tariffDescription = grid.parameters.length > 1 ? `${param.name} - ${ct.name}` : ct.name;
          tariffAmount = cell ? cell.amount : 0;
          tariffGlAccountCode = param.gl_account_code || "";
        }
      }
    }

    const installEnabled = card.querySelector(".reservation-install-toggle").classList.contains("active");
    const dismantleEnabled = card.querySelector(".reservation-dismantle-toggle").classList.contains("active");

    const barToggleActive = card.querySelector(".room-bar-toggle-group .pill-toggle.active") !== null;
    const barDrinkType = getExclusivePillValueEl(card.querySelector(".room-bar-drink-group"));
    const barServiceType = getExclusivePillValueEl(card.querySelector(".room-bar-service-type-group"));
    const barHostessCount = parseInt(card.querySelector(".room-bar-hostess-count").value, 10) || 0;
    const barSpecialOrder = card.querySelector(".room-bar-special-order").value.trim();
    const hostDutiesSelected = Array.from(card.querySelectorAll(".room-host-duties-group .pill-toggle.active")).map(b => b.dataset.value);
    const hostDutiesCount = parseInt(card.querySelector(".room-host-duties-count").value, 10) || 0;

    return {
      id: card.dataset.reservationId,
      room_name: roomName,
      room_other_details: isOther ? card.querySelector(".room-other-details-input").value.trim() : "",
      tariff_id: tariffId,
      tariff_description: tariffDescription,
      tariff_amount: tariffAmount,
      tariff_gl_account_code: tariffGlAccountCode,
      install: {
        enabled: installEnabled,
        date: installEnabled ? card.querySelector(`#${uid}-install-date`).value : "",
        start_time: installEnabled ? card.querySelector(`#${uid}-install-start-time`).value : "",
        end_time: installEnabled ? card.querySelector(`#${uid}-install-end-time`).value : ""
      },
      dismantle: {
        enabled: dismantleEnabled,
        date: dismantleEnabled ? card.querySelector(`#${uid}-dismantle-date`).value : "",
        start_time: dismantleEnabled ? card.querySelector(`#${uid}-dismantle-start-time`).value : "",
        end_time: dismantleEnabled ? card.querySelector(`#${uid}-dismantle-end-time`).value : ""
      },
      slots: collectSlotsFromCard(card),
      technical_services: Array.from(card.querySelectorAll(".room-technical-services-group .pill-toggle.active")).map(b => b.dataset.value),
      bar_service: {
        active: barToggleActive,
        drink_type: barToggleActive ? barDrinkType : "",
        service_type: barToggleActive ? barServiceType : "",
        hostess_count:
          barToggleActive &&
          (barServiceType === "Service d'hôtesses" || barServiceType === "Distribution de breuvages et nettoyage de coupes")
            ? barHostessCount
            : 0,
        special_order: barToggleActive ? barSpecialOrder : ""
      },
      host_duties: {
        duties: hostDutiesSelected,
        hostess_count: hostDutiesSelected.length > 0 ? hostDutiesCount : 0
      },
      staff: collectStaffFromForm(card),
      services: collectServicesFromForm(card),
      fees: collectFeesFromForm(card)
    };
  });
}

// Aggregate {start, end} across every créneau of every réservation (min/max), used for the
// activity's top-level date_start/date_end (fiscal year, filtering, calendar, sorting).
function getAggregateEventDates(reservations) {
  const allDates = reservations.flatMap(r => (r.slots || []).map(s => s.date)).filter(Boolean);
  return {
    date_start: allDates.length ? allDates.reduce((min, d) => (d < min ? d : min)) : "",
    date_end: allDates.length ? allDates.reduce((max, d) => (d > max ? d : max)) : ""
  };
}

/* ==========================================================================
   PERSONNEL REQUIS & AUTRES FRAIS (activity form, Soumission et contrat tab)
   ========================================================================== */

// Adds one personnel row to `container` (a room card's own .room-staff-list). `autoGenerated`
// is carried as a data attribute so the row can be told apart from manually-added personnel.
function addStaffRow(container, salaryId = "", count = 1, hours = 0, overtimeHours = 0, autoGenerated = false) {
  const rowId = generateUid("staff-row");

  const salaryOptionsHtml = (appState.settings.salaries || [])
    .map(s => `<option value="${s.id}" ${s.id === salaryId ? "selected" : ""}>${s.job}</option>`)
    .join("");

  container.insertAdjacentHTML(
    "beforeend",
    `
    <div id="${rowId}" class="distribution-row" data-auto-generated="${autoGenerated ? "1" : ""}" style="grid-template-columns: 1.4fr 0.6fr 0.6fr 0.6fr 1fr auto;">
      <select class="select-input staff-salary-select" style="padding: 8px 12px; font-size: 0.85rem;">
        <option value="">Choisir un emploi...</option>
        ${salaryOptionsHtml}
      </select>
      <input type="number" class="form-input staff-count-input" min="1" step="1" value="${count || 1}" placeholder="Qté" style="padding: 8px 12px; font-size: 0.85rem;">
      <input type="number" class="form-input staff-hours-input" min="0" step="0.25" value="${hours || 0}" placeholder="Heures" style="padding: 8px 12px; font-size: 0.85rem;">
      <input type="number" class="form-input staff-overtime-hours-input" min="0" step="0.25" value="${overtimeHours || 0}" placeholder="Heures sup." title="Heures en temps supplémentaire" style="padding: 8px 12px; font-size: 0.85rem;">
      <span class="staff-subtotal-display" style="font-size: 0.85rem; color: var(--text-secondary); align-self: center;">0,00 $</span>
      <button type="button" class="btn-icon delete-staff-row-btn" data-row-id="${rowId}">
        <svg viewBox="0 0 24 24" style="width: 14px; height: 14px;"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
      </button>
    </div>
  `
  );

  const row = document.getElementById(rowId);
  row.querySelector(".delete-staff-row-btn").addEventListener("click", () => {
    row.remove();
    updateSubmissionFinancialSummary();
    autoSaveActivityForm();
  });
  row.querySelectorAll("select, input").forEach(el => {
    el.addEventListener("input", updateSubmissionFinancialSummary);
    el.addEventListener("change", updateSubmissionFinancialSummary);
  });
  updateStaffRowSubtotal(row);
}

function updateStaffRowSubtotal(row) {
  const salaryId = row.querySelector(".staff-salary-select").value;
  const count = parseInt(row.querySelector(".staff-count-input").value, 10) || 0;
  const hours = parseFloat(row.querySelector(".staff-hours-input").value) || 0;
  const overtimeHours = parseFloat(row.querySelector(".staff-overtime-hours-input").value) || 0;
  const salary = (appState.settings.salaries || []).find(s => s.id === salaryId);
  const dateStr = getAggregateEventDates(collectReservationsFromForm()).date_start;
  const rate = salary ? getActiveSalaryRate(salary, dateStr) : 0;
  const overtimeRate = salary ? getActiveSalaryOvertimeRate(salary, dateStr) : 0;
  row.querySelector(".staff-subtotal-display").textContent = formatCurrency(rate * hours * count + overtimeRate * overtimeHours * count);
}

// Adds one service row (a pre-configured fixed or hourly fee, from the Services settings tab)
// to `container` (a room card's own .room-services-list). `autoGenerated` is carried as a data
// attribute for parity with staff/fee rows, even though services have no room-linking auto-add today.
function addServiceRow(container, serviceId = "", count = 1, hours = 0, autoGenerated = false) {
  const rowId = generateUid("service-row");

  const serviceOptionsHtml = (appState.settings.services || [])
    .map(s => `<option value="${s.id}" ${s.id === serviceId ? "selected" : ""}>${s.name}</option>`)
    .join("");

  container.insertAdjacentHTML(
    "beforeend",
    `
    <div id="${rowId}" class="distribution-row" data-auto-generated="${autoGenerated ? "1" : ""}" style="grid-template-columns: 1.6fr 0.7fr 0.7fr 1fr auto;">
      <select class="select-input service-select" style="padding: 8px 12px; font-size: 0.85rem;">
        <option value="">Choisir un service...</option>
        ${serviceOptionsHtml}
      </select>
      <input type="number" class="form-input service-count-input" min="1" step="1" value="${count || 1}" placeholder="Qté" style="padding: 8px 12px; font-size: 0.85rem;">
      <input type="number" class="form-input service-hours-input" min="0" step="0.25" value="${hours || 0}" placeholder="Heures" style="padding: 8px 12px; font-size: 0.85rem;">
      <span class="service-subtotal-display" style="font-size: 0.85rem; color: var(--text-secondary); align-self: center;">0,00 $</span>
      <button type="button" class="btn-icon delete-service-row-btn" data-row-id="${rowId}">
        <svg viewBox="0 0 24 24" style="width: 14px; height: 14px;"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
      </button>
    </div>
  `
  );

  const row = document.getElementById(rowId);
  row.querySelector(".delete-service-row-btn").addEventListener("click", () => {
    row.remove();
    updateSubmissionFinancialSummary();
    autoSaveActivityForm();
  });
  row.querySelectorAll("select, input").forEach(el => {
    el.addEventListener("input", updateSubmissionFinancialSummary);
    el.addEventListener("change", updateSubmissionFinancialSummary);
  });
  updateServiceRowSubtotal(row);
}

function updateServiceRowSubtotal(row) {
  const serviceId = row.querySelector(".service-select").value;
  const count = parseInt(row.querySelector(".service-count-input").value, 10) || 0;
  const hours = parseFloat(row.querySelector(".service-hours-input").value) || 0;
  const service = (appState.settings.services || []).find(s => s.id === serviceId);
  const dateStr = getAggregateEventDates(collectReservationsFromForm()).date_start;
  const rate = service ? getActiveServiceRate(service, dateStr) : 0;
  const hoursInput = row.querySelector(".service-hours-input");
  const isHourly = service && service.type === "hourly";
  hoursInput.style.visibility = isHourly ? "visible" : "hidden";
  const subtotal = isHourly ? rate * hours * count : rate * count;
  row.querySelector(".service-subtotal-display").textContent = formatCurrency(subtotal);
}

// Adds one "autre frais" row (description + montant + compte GL optionnel) to `container`
// (a room card's own .room-fees-list).
function addFeeRow(container, description = "", amount = "", glAccountCode = "", autoGenerated = false) {
  const rowId = generateUid("fee-row");

  container.insertAdjacentHTML(
    "beforeend",
    `
    <div id="${rowId}" class="distribution-row" data-auto-generated="${autoGenerated ? "1" : ""}">
      <input type="text" class="form-input fee-desc-input" value="${escapeHtml(description)}" placeholder="Ex: Montage et démontage" style="padding: 8px 12px; font-size: 0.85rem;">
      <input type="number" class="form-input fee-amount-input" min="0" step="0.01" value="${amount !== "" ? amount : ""}" placeholder="Montant $" style="padding: 8px 12px; font-size: 0.85rem;">
      <select class="select-input fee-gl-select" style="padding: 8px 12px; font-size: 0.85rem;">
        ${buildGlAccountOptionsHtml(glAccountCode)}
      </select>
      <button type="button" class="btn-icon delete-fee-row-btn" data-row-id="${rowId}">
        <svg viewBox="0 0 24 24" style="width: 14px; height: 14px;"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
      </button>
    </div>
  `
  );

  const row = document.getElementById(rowId);
  row.querySelector(".delete-fee-row-btn").addEventListener("click", () => {
    row.remove();
    updateSubmissionFinancialSummary();
    autoSaveActivityForm();
  });
  row.querySelectorAll("input, select").forEach(el => el.addEventListener("input", updateSubmissionFinancialSummary));
}

// When a room is added to the activity, auto-add its linked staff/fees into that room's own
// (freshly created, empty) card — no duplicate risk since the card was just built.
function autoAddLinkedStaffAndFees(card, roomName) {
  const room = appState.settings.rooms.find(r => r.name === roomName);
  if (!room) return;

  const staffList = card.querySelector(".room-staff-list");
  (room.linked_staff || []).forEach(s => addStaffRow(staffList, s.salary_id, s.count, 0, 0, true));

  const feesList = card.querySelector(".room-fees-list");
  (room.linked_fees || []).forEach(f => addFeeRow(feesList, f.description, f.amount, f.gl_account_code, true));
}

// Collects the Personnel requis rows from one reservation card into an act.reservations[].staff[]-shaped array
function collectStaffFromForm(card) {
  return Array.from(card.querySelectorAll(".room-staff-list .distribution-row"))
    .map(row => ({
      id: row.dataset.id || generateUid("staff"),
      salary_id: row.querySelector(".staff-salary-select").value,
      count: parseInt(row.querySelector(".staff-count-input").value, 10) || 0,
      hours: parseFloat(row.querySelector(".staff-hours-input").value) || 0,
      overtime_hours: parseFloat(row.querySelector(".staff-overtime-hours-input").value) || 0,
      auto_generated: row.dataset.autoGenerated === "1"
    }))
    .filter(s => s.salary_id);
}

// Collects the Services rows from one reservation card into an act.reservations[].services[]-shaped array
function collectServicesFromForm(card) {
  return Array.from(card.querySelectorAll(".room-services-list .distribution-row"))
    .map(row => ({
      id: row.dataset.id || generateUid("service"),
      service_id: row.querySelector(".service-select").value,
      count: parseInt(row.querySelector(".service-count-input").value, 10) || 0,
      hours: parseFloat(row.querySelector(".service-hours-input").value) || 0,
      auto_generated: row.dataset.autoGenerated === "1"
    }))
    .filter(s => s.service_id);
}

// Collects the Autres frais rows from one reservation card into an act.reservations[].fees[]-shaped array
function collectFeesFromForm(card) {
  return Array.from(card.querySelectorAll(".room-fees-list .distribution-row"))
    .map(row => ({
      id: row.dataset.id || generateUid("fee"),
      description: row.querySelector(".fee-desc-input").value.trim(),
      amount: parseFloat(row.querySelector(".fee-amount-input").value) || 0,
      gl_account_code: row.querySelector(".fee-gl-select").value,
      auto_generated: row.dataset.autoGenerated === "1"
    }))
    .filter(f => f.description);
}

export {
  getAggregateEventDates,
  buildRoomSelectItems,
  initReservationsSection,
  buildRoomDateTimeFieldHtml,
  buildDatePeriodFieldHtml,
  buildTariffParameterOptionsHtml,
  buildTariffClientTypeOptionsHtml,
  updateResolvedPriceDisplay,
  refreshReservationTariffSelect,
  addSlotRow,
  collectSlotsFromCard,
  addNextSlotRow,
  buildSlotRangeGeneratorHtml,
  wireSlotRangeGenerator,
  addReservationCard,
  collectReservationsFromForm,
  addStaffRow,
  updateStaffRowSubtotal,
  addServiceRow,
  updateServiceRowSubtotal,
  addFeeRow,
  autoAddLinkedStaffAndFees,
  collectStaffFromForm,
  collectServicesFromForm,
  collectFeesFromForm
};

if (typeof window !== "undefined") {
  window.getAggregateEventDates = getAggregateEventDates;
  window.buildRoomSelectItems = buildRoomSelectItems;
  window.initReservationsSection = initReservationsSection;
  window.buildRoomDateTimeFieldHtml = buildRoomDateTimeFieldHtml;
  window.buildDatePeriodFieldHtml = buildDatePeriodFieldHtml;
  window.buildTariffParameterOptionsHtml = buildTariffParameterOptionsHtml;
  window.buildTariffClientTypeOptionsHtml = buildTariffClientTypeOptionsHtml;
  window.updateResolvedPriceDisplay = updateResolvedPriceDisplay;
  window.refreshReservationTariffSelect = refreshReservationTariffSelect;
  window.addSlotRow = addSlotRow;
  window.collectSlotsFromCard = collectSlotsFromCard;
  window.addNextSlotRow = addNextSlotRow;
  window.buildSlotRangeGeneratorHtml = buildSlotRangeGeneratorHtml;
  window.wireSlotRangeGenerator = wireSlotRangeGenerator;
  window.addReservationCard = addReservationCard;
  window.collectReservationsFromForm = collectReservationsFromForm;
  window.addStaffRow = addStaffRow;
  window.updateStaffRowSubtotal = updateStaffRowSubtotal;
  window.addServiceRow = addServiceRow;
  window.updateServiceRowSubtotal = updateServiceRowSubtotal;
  window.addFeeRow = addFeeRow;
  window.autoAddLinkedStaffAndFees = autoAddLinkedStaffAndFees;
  window.collectStaffFromForm = collectStaffFromForm;
  window.collectServicesFromForm = collectServicesFromForm;
  window.collectFeesFromForm = collectFeesFromForm;
}

