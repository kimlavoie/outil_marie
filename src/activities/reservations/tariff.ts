/**
 * reservations/tariff.ts - Resolves a reservation card's room tariff (parameter x client type)
 * against the room's active pricing grid: option list builders, the resolved-price/stale-tariff
 * display, and re-populating the parameter/client-type selects when the room or date changes.
 */
import { appState, getActivePricingGrid } from "../../state/state.ts";
import { escapeHtml, formatCurrency, OTHER_ROOM_VALUE } from "../../utils/utils.ts";
import { collectSlotsFromCard } from "./slots.ts";

function buildTariffParameterOptionsHtml(roomName: string, dateStr: string, selectedTariffId: string) {
  if (!roomName || roomName === OTHER_ROOM_VALUE) return "";
  const roomConfig = appState.settings.rooms.find((r: any) => r.name === roomName);
  const grid = roomConfig ? getActivePricingGrid(roomConfig, dateStr) : null;
  if (!grid) return "";

  let selectedParamId = "";
  if (selectedTariffId && selectedTariffId !== "__custom__" && selectedTariffId.includes("::")) {
    selectedParamId = selectedTariffId.split("::")[0];
  }

  return grid.parameters
    .map((p: any) => {
      const details = p.details ? ` (${escapeHtml(p.details)})` : "";
      return `<option value="${p.id}" ${selectedParamId === p.id ? "selected" : ""}>${escapeHtml(p.name)}${details}</option>`;
    })
    .join("");
}

function buildTariffClientTypeOptionsHtml(roomName: string, dateStr: string, selectedTariffId: string, selectedParamId = "") {
  if (!roomName || roomName === OTHER_ROOM_VALUE) return "";
  const roomConfig = appState.settings.rooms.find((r: any) => r.name === roomName);
  const grid = roomConfig ? getActivePricingGrid(roomConfig, dateStr) : null;
  if (!grid) return "";

  const isHourly = roomConfig && roomConfig.rate_type === "hourly";
  const unitSuffix = isHourly ? "h" : "jour";

  let selectedCtId = "";
  if (selectedTariffId && selectedTariffId !== "__custom__" && selectedTariffId.includes("::")) {
    const parts = selectedTariffId.split("::");
    selectedCtId = parts[1];
    if (!selectedParamId) {
      selectedParamId = parts[0];
    }
  }

  return grid.client_types
    .map((ct: any) => {
      let suffix = "";
      if (selectedParamId && selectedParamId !== "__custom__") {
        const cell = grid.cells.find((c: any) => c.parameter_id === selectedParamId && c.client_type_id === ct.id);
        if (cell) {
          suffix = ` (${cell.amount}$/${unitSuffix})`;
        }
      }
      return `<option value="${ct.id}" ${selectedCtId === ct.id ? "selected" : ""}>${escapeHtml(ct.name)}${suffix}</option>`;
    })
    .join("");
}

function updateResolvedPriceDisplay(card: HTMLElement) {
  // Non-null-safe: RoomTariffFields.tsx, the React root that owns all of these, is mounted
  // asynchronously by card.tsx's addReservationCard() and may not have committed yet in the
  // brief window right after the card itself is inserted (see collectReservationsFromForm()'s
  // header comment on the same pattern).
  const roomNameEl = card.querySelector<HTMLInputElement>(".searchable-select-value");
  if (!roomNameEl) return;
  const roomName = roomNameEl.value;
  const paramSelect = card.querySelector<HTMLInputElement>(".room-tariff-parameter");
  const ctSelect = card.querySelector<HTMLInputElement>(".room-tariff-client-type");
  const displayEl = card.querySelector<HTMLInputElement>(".room-tariff-resolved-price-display");
  const valEl = card.querySelector<HTMLInputElement>(".resolved-price-val");
  const staleEl = card.querySelector<HTMLElement>(".room-tariff-stale-warning");

  if (!paramSelect || !ctSelect || !displayEl || !valEl) return;

  const paramVal = paramSelect.value;
  const clientTypeVal = ctSelect.value;

  if (staleEl) staleEl.style.display = "none";

  const roomConfig = appState.settings.rooms.find((r: any) => r.name === roomName);
  const isHourly = roomConfig && roomConfig.rate_type === "hourly";

  const unitEl = card.querySelector<HTMLElement>(".resolved-price-unit");
  if (unitEl) {
    unitEl.textContent = isHourly ? "/ h" : "/ jour";
  }

  const customLabelEl = card.querySelector<HTMLElement>(".room-tariff-custom-amount-label");
  if (customLabelEl) {
    customLabelEl.textContent = isHourly ? "Montant ($ par heure)" : "Montant ($ par jour)";
  }

  if (roomName && roomName !== OTHER_ROOM_VALUE && paramVal && paramVal !== "__custom__" && clientTypeVal) {
    const slots = collectSlotsFromCard(card);
    const firstSlotDate = slots.length ? [...slots].map(s => s.date).sort()[0] : "";
    const grid = roomConfig ? getActivePricingGrid(roomConfig, firstSlotDate) : null;
    if (grid) {
      const cell = grid.cells.find((c: any) => c.parameter_id === paramVal && c.client_type_id === clientTypeVal);
      const price = cell ? cell.amount : 0;
      valEl.textContent = formatCurrency(price);
      displayEl.style.display = "block";

      // Flags reservations whose stored amount no longer matches what the pricing grid would
      // resolve to today for the same parameter/client type — e.g. the grid was edited
      // retroactively after this reservation was saved (see TODO: tarifs de salle obsolètes).
      const storedTariffId = card.dataset.storedTariffId;
      const storedTariffAmount = card.dataset.storedTariffAmount;
      if (staleEl && storedTariffId === `${paramVal}::${clientTypeVal}` && storedTariffAmount !== undefined) {
        const storedAmount = parseFloat(storedTariffAmount);
        if (!isNaN(storedAmount) && storedAmount !== price) {
          const warningSuffix = isHourly ? "/h" : "/jour";
          staleEl.textContent = `⚠ Tarif obsolète : cette réservation a été enregistrée à ${formatCurrency(storedAmount)}${warningSuffix}, mais la grille tarifaire actuelle indique maintenant ${formatCurrency(price)}${warningSuffix} pour cette date.`;
          staleEl.style.display = "block";
        }
      }
      return;
    }
  }
  displayEl.style.display = "none";
}

function refreshReservationTariffSelect(card: HTMLElement, roomName: string, selectedTariffId = "") {
  const paramSelect = card.querySelector<HTMLInputElement>(".room-tariff-parameter");
  const ctSelect = card.querySelector<HTMLInputElement>(".room-tariff-client-type");
  const ctGroup = card.querySelector<HTMLInputElement>(".room-tariff-client-type-group");
  const customGroup = card.querySelector<HTMLInputElement>(".room-tariff-custom-group");

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

export { buildTariffParameterOptionsHtml, buildTariffClientTypeOptionsHtml, updateResolvedPriceDisplay, refreshReservationTariffSelect };
