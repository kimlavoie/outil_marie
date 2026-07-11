/**
 * reservations.ts - Room reservation cards: init/collection entry points. Split into
 * reservation-slots.ts (créneau rows + date-range generator), reservation-tariff.ts (pricing
 * grid resolution) and reservation-card.ts (the card builder itself) — this file re-exports all
 * of them so existing imports keep working, and keeps the section init + form-collection logic
 * that ties them together.
 * Part 3/5 of the activities module (see render.ts for context).
 */
import { appState, getActivePricingGrid } from "../state/state.ts";
import { OTHER_ROOM_VALUE, getExclusivePillValueEl } from "../utils/utils.ts";
import { updateSubmissionFinancialSummary } from "./financials.ts";
import { updateFormDatesHelper } from "./history.ts";
import {
  collectStaffFromForm,
  collectServicesFromForm,
  collectFeesFromForm,
  resetIncompleteRowWarnings,
  pushIncompleteRowWarning
} from "./reservation-subrows.ts";
import { addSlotRow, collectSlotsFromCard } from "./reservation-slots.ts";
import { addReservationCard } from "./reservation-card.ts";

function el<T extends Element = HTMLInputElement>(id: string): T {
  return document.getElementById(id) as unknown as T;
}

function initReservationsSection() {
  const addBtn = el("add-reservation-btn");
  if (!addBtn) return;
  addBtn.addEventListener("click", () => {
    const container = el("form-activity-reservations");
    const existingCards = container ? container.querySelectorAll<HTMLElement>(".reservation-card") : [];
    const lastCard = existingCards[existingCards.length - 1];
    const previousSlots = lastCard ? collectSlotsFromCard(lastCard) : [];

    const newCard = addReservationCard();
    if (newCard && previousSlots.length) {
      const slotsList = newCard.querySelector<HTMLElement>(".reservation-slots-list")!;
      previousSlots.forEach(s => addSlotRow(slotsList, s.date, s.start_time, s.end_time));
    }
    updateFormDatesHelper();
    updateSubmissionFinancialSummary();
  });
}

function collectReservationsFromForm() {
  resetIncompleteRowWarnings();
  const cards = document.querySelectorAll<HTMLInputElement>("#form-activity-reservations .reservation-card")!;
  return Array.from(cards).map(card => {
    const uid = card.id;
    const roomName = card.querySelector<HTMLInputElement>(".searchable-select-value")!.value;
    const isOther = roomName === OTHER_ROOM_VALUE;

    const paramSelect = card.querySelector<HTMLInputElement>(".room-tariff-parameter")!;
    const ctSelect = card.querySelector<HTMLInputElement>(".room-tariff-client-type")!;
    const paramVal = paramSelect ? paramSelect.value : "";
    const clientTypeVal = ctSelect ? ctSelect.value : "";
    let tariffId = "",
      tariffDescription = "",
      tariffAmount = 0,
      tariffGlAccountCode = "";

    if (paramVal === "__custom__") {
      tariffDescription = card.querySelector<HTMLInputElement>(".room-tariff-custom-desc")!.value.trim();
      const rawAmount = card.querySelector<HTMLInputElement>(".room-tariff-custom-amount")!.value.trim();
      tariffAmount = parseFloat(rawAmount) || 0;
      tariffGlAccountCode = card.querySelector<HTMLSelectElement>(".room-tariff-custom-gl")!.value;
      // A filled-in description with a missing/invalid amount silently defaulted to a free ($0)
      // tariff — warn instead so the user notices before the activity gets saved that way.
      if (tariffDescription && (!rawAmount || isNaN(parseFloat(rawAmount)))) {
        pushIncompleteRowWarning(
          `Le tarif personnalisé "${tariffDescription}" n'a pas de montant valide : la salle sera facturée 0 $.`
        );
      }
    } else if (paramVal && clientTypeVal && !isOther) {
      const roomConfig = appState.settings.rooms.find(r => r.name === roomName);
      const slots = collectSlotsFromCard(card);
      const firstSlotDate = slots.length ? [...slots].map(s => s.date).sort()[0] : "";
      const grid = roomConfig ? getActivePricingGrid(roomConfig, firstSlotDate) : null;
      if (grid) {
        const param = grid.parameters.find((p: any) => p.id === paramVal);
        const ct = grid.client_types.find((c: any) => c.id === clientTypeVal);
        const cell = grid.cells.find((c: any) => c.parameter_id === paramVal && c.client_type_id === clientTypeVal);
        if (param && ct) {
          tariffId = `${paramVal}::${clientTypeVal}`;
          tariffDescription = grid.parameters.length > 1 ? `${param.name} - ${ct.name}` : ct.name;
          tariffAmount = cell ? cell.amount : 0;
          tariffGlAccountCode = ct.gl_account_code || "";
        }
      }
    }

    // A tariff can carry a GL account code from a custom entry or from a pricing grid's client
    // type that was configured before the account got deleted from Paramètres > Comptes GL. That
    // stale code still gets saved on the reservation, but distributions generated from it (and the
    // Grand Livre report reading them back) silently can't tie it to a real account — warn here.
    if (tariffGlAccountCode && !appState.settings.accounts.some(a => a.code === tariffGlAccountCode)) {
      pushIncompleteRowWarning(
        `Le tarif "${tariffDescription || roomName}" est lié au compte GL "${tariffGlAccountCode}", qui n'existe plus.`
      );
    }

    const installEnabled = card.querySelector<HTMLInputElement>(".reservation-install-toggle")!.classList.contains("active");
    const dismantleEnabled = card.querySelector<HTMLInputElement>(".reservation-dismantle-toggle")!.classList.contains("active");

    const barToggleActive = card.querySelector<HTMLInputElement>(".room-bar-toggle-group .pill-toggle.active")! !== null;
    const barDrinkType = getExclusivePillValueEl(card.querySelector<HTMLInputElement>(".room-bar-drink-group")!);
    const barServiceType = getExclusivePillValueEl(card.querySelector<HTMLInputElement>(".room-bar-service-type-group")!);
    const barHostessCount = parseInt(card.querySelector<HTMLInputElement>(".room-bar-hostess-count")!.value, 10) || 0;
    const barSpecialOrder = card.querySelector<HTMLInputElement>(".room-bar-special-order")!.value.trim();
    const hostDutiesSelected = Array.from(card.querySelectorAll<HTMLInputElement>(".room-host-duties-group .pill-toggle.active")!).map(
      b => b.dataset.value
    );
    const hostDutiesCount = parseInt(card.querySelector<HTMLInputElement>(".room-host-duties-count")!.value, 10) || 0;

    return {
      id: card.dataset.reservationId,
      room_name: roomName,
      room_other_details: isOther ? card.querySelector<HTMLInputElement>(".room-other-details-input")!.value.trim() : "",
      tariff_id: tariffId,
      tariff_description: tariffDescription,
      tariff_amount: tariffAmount,
      tariff_gl_account_code: tariffGlAccountCode,
      install: {
        enabled: installEnabled,
        date: installEnabled ? card.querySelector<HTMLInputElement>(`#${uid}-install-date`)!.value : "",
        start_time: installEnabled ? card.querySelector<HTMLInputElement>(`#${uid}-install-start-time`)!.value : "",
        end_time: installEnabled ? card.querySelector<HTMLInputElement>(`#${uid}-install-end-time`)!.value : ""
      },
      dismantle: {
        enabled: dismantleEnabled,
        date: dismantleEnabled ? card.querySelector<HTMLInputElement>(`#${uid}-dismantle-date`)!.value : "",
        start_time: dismantleEnabled ? card.querySelector<HTMLInputElement>(`#${uid}-dismantle-start-time`)!.value : "",
        end_time: dismantleEnabled ? card.querySelector<HTMLInputElement>(`#${uid}-dismantle-end-time`)!.value : ""
      },
      slots: collectSlotsFromCard(card),
      technical_services: Array.from(card.querySelectorAll<HTMLInputElement>(".room-technical-services-group .pill-toggle.active")!).map(
        b => b.dataset.value
      ),
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

function getAggregateEventDates(reservations: any[]) {
  const allDates: string[] = reservations.flatMap((r: any) => (r.slots || []).map((s: any) => s.date)).filter(Boolean);
  return {
    date_start: allDates.length ? allDates.reduce((min, d) => (d < min ? d : min)) : "",
    date_end: allDates.length ? allDates.reduce((max, d) => (d > max ? d : max)) : ""
  };
}

export { addSlotRow, collectSlotsFromCard, addNextSlotRow, buildSlotRangeGeneratorHtml, wireSlotRangeGenerator } from "./reservation-slots.ts";
export {
  buildTariffParameterOptionsHtml,
  buildTariffClientTypeOptionsHtml,
  updateResolvedPriceDisplay,
  refreshReservationTariffSelect
} from "./reservation-tariff.ts";
export { buildRoomSelectItems, buildRoomDateTimeFieldHtml, buildDatePeriodFieldHtml, addReservationCard } from "./reservation-card.ts";
export { getAggregateEventDates, initReservationsSection, collectReservationsFromForm };
