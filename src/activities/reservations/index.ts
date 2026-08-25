/**
 * reservations/index.ts - Room reservation cards: init/collection entry points. Split into
 * slots.ts (créneau rows + date-range generator), tariff.ts (pricing grid resolution) and
 * card.ts (the card builder itself) — this file re-exports all of them so existing imports
 * keep working, and keeps the section init + form-collection logic that ties them together.
 * Part 3/5 of the activities module (see render.ts for context).
 */
import { appState, getActivePricingGrid } from "../../state/state.ts";
import { OTHER_ROOM_VALUE, getExclusivePillValueEl } from "../../utils/utils.ts";
import {
  collectStaffFromForm,
  collectServicesFromForm,
  collectFeesFromForm,
  resetIncompleteRowWarnings,
  pushIncompleteRowWarning
} from "./subrows.ts";
import { collectSlotsFromCard } from "./slots.ts";

// initReservationsSection() (wired the #add-reservation-btn click) used to live here. It's gone:
// ActivityDrawer.tsx now owns that button's onClick directly, driving a reservationCardIds React
// state array instead of calling addReservationCard()/card.remove() straight against
// #form-activity-reservations — see that file's handleAddReservation, which reproduces the same
// "carry the previous card's créneaux into a new blank one" behavior this used to have.

function collectReservationsFromForm() {
  resetIncompleteRowWarnings();
  const cards = document.querySelectorAll<HTMLInputElement>("#form-activity-reservations .reservation-card")!;
  return Array.from(cards).map(card => {
    const uid = card.id;
    // Non-null-safe below (room/tariff fields): RoomTariffFields.tsx, a separate React root
    // mounted asynchronously by card.tsx's addReservationCard() — same reasoning as the
    // install/dismantle fields further down. Treat "not committed yet" as empty rather than
    // crashing collectReservationsFromForm().
    const roomName = card.querySelector<HTMLInputElement>(".searchable-select-value")?.value || "";
    const isOther = roomName === OTHER_ROOM_VALUE;

    const paramSelect = card.querySelector<HTMLInputElement>(".room-tariff-parameter")!;
    const ctSelect = card.querySelector<HTMLInputElement>(".room-tariff-client-type")!;
    const paramVal = paramSelect ? paramSelect.value : "";
    const clientTypeVal = ctSelect ? ctSelect.value : "";
    let tariffId = "",
      tariffDescription = "",
      tariffAmount = 0;

    if (paramVal === "__custom__") {
      tariffDescription = card.querySelector<HTMLInputElement>(".room-tariff-custom-desc")?.value.trim() || "";
      const rawAmount = card.querySelector<HTMLInputElement>(".room-tariff-custom-amount")?.value.trim() || "";
      tariffAmount = parseFloat(rawAmount) || 0;
      // A filled-in description with a missing/invalid amount silently defaulted to a free ($0)
      // tariff — warn instead so the user notices before the activity gets saved that way.
      if (tariffDescription && (!rawAmount || isNaN(parseFloat(rawAmount)))) {
        pushIncompleteRowWarning(`Le tarif personnalisé "${tariffDescription}" n'a pas de montant valide : la salle sera facturée 0 $.`);
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
        }
      }
    }

    // Non-null-safe on purpose: the Montage/Démontage toggle is InstallDismantleFields.tsx, a
    // separate React root mounted into the card asynchronously (see card.tsx's addReservationCard
    // and ActivityDrawer.tsx's mountReservationCard) — it may not have committed to the DOM yet
    // in the brief window right after the card itself is inserted. Treat "not there yet" the same
    // as "toggled off" rather than crashing collectReservationsFromForm().
    const installEnabled = card.querySelector<HTMLInputElement>(".reservation-install-toggle")?.classList.contains("active") || false;
    const dismantleEnabled = card.querySelector<HTMLInputElement>(".reservation-dismantle-toggle")?.classList.contains("active") || false;

    // Same non-null-safety reasoning as install/dismantle above: BarHostTechFields.tsx (bar
    // service, host duties, technical services) is also a separate, asynchronously-mounted root.
    const barToggleActive = card.querySelector<HTMLInputElement>(".room-bar-toggle-group .pill-toggle.active") !== null;
    const barDrinkType = getExclusivePillValueEl(card.querySelector<HTMLInputElement>(".room-bar-drink-group"));
    const barServiceType = getExclusivePillValueEl(card.querySelector<HTMLInputElement>(".room-bar-service-type-group"));
    const barHostessCount = parseInt(card.querySelector<HTMLInputElement>(".room-bar-hostess-count")?.value || "", 10) || 0;
    const barSpecialOrder = card.querySelector<HTMLInputElement>(".room-bar-special-order")?.value.trim() || "";
    const hostDutiesSelected = Array.from(card.querySelectorAll<HTMLInputElement>(".room-host-duties-group .pill-toggle.active")).map(
      b => b.dataset.value
    );
    const hostDutiesCount = parseInt(card.querySelector<HTMLInputElement>(".room-host-duties-count")?.value || "", 10) || 0;

    return {
      id: card.dataset.reservationId,
      room_name: roomName,
      room_other_details: isOther ? card.querySelector<HTMLInputElement>(".room-other-details-input")?.value.trim() || "" : "",
      tariff_id: tariffId,
      tariff_description: tariffDescription,
      tariff_amount: tariffAmount,
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

export { addSlotRow, collectSlotsFromCard, addNextSlotRow } from "./slots.ts";
export {
  buildTariffParameterOptionsHtml,
  buildTariffClientTypeOptionsHtml,
  updateResolvedPriceDisplay,
  refreshReservationTariffSelect
} from "./tariff.ts";
export { buildRoomSelectItems, addReservationCard } from "./card.tsx";
export { getAggregateEventDates, collectReservationsFromForm };
