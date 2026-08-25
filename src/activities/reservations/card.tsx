/**
 * reservations/card.tsx - Builds and wires a single reservation card in the activity form: room
 * selection, tariff, technical services, bar service, host duties, and its staff/equipment/fees
 * sub-lists. Montage/Démontage is a separate React root (InstallDismantleFields.tsx) mounted by
 * ActivityDrawer.tsx's mountReservationCard() into the .reservation-install-dismantle-mount
 * placeholder this file leaves — see that component's header comment for why. Créneaux
 * (SlotsFields.tsx) is also a separate root, but built right here instead — see its mount call
 * below for why the two differ.
 */
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { initDatepickerWrapper } from "../datepicker.ts";
import { SlotsFields, type SlotData } from "../../components/activities/SlotsFields.tsx";
import { RoomTariffFields } from "../../components/activities/RoomTariffFields.tsx";
import { BarHostTechFields } from "../../components/activities/BarHostTechFields.tsx";
import { StaffServicesFeesFields } from "../../components/activities/StaffServicesFeesFields.tsx";
import { appState } from "../../state/state.ts";
import { generateUid, OTHER_ROOM_VALUE, maskTimeInput } from "../../utils/utils.ts";
import { updateSubmissionFinancialSummary, autoSaveActivityForm } from "../financials.ts";
import { updateFormDatesHelper } from "../history/index.ts";

function el<T extends Element = HTMLInputElement>(id: string): T {
  return document.getElementById(id) as unknown as T;
}

function buildRoomSelectItems() {
  return [...appState.settings.rooms.map(r => ({ value: r.name, label: r.name })), { value: OTHER_ROOM_VALUE, label: "Autre" }];
}

// Tracks each card's five React roots by the card's own DOM id, so the remove closure below can
// unmount them however the card itself ends up being removed (React-driven or card.remove()) —
// this file creates all five roots, so it's the one responsible for tearing them down.
const slotsRootsByCardId = new Map<string, Root>();
const roomTariffRootsByCardId = new Map<string, Root>();
const barHostTechRootsByCardId = new Map<string, Root>();
const staffServicesFeesRootsByCardId = new Map<string, Root>();

// targetContainer/onRemove let a caller own where the card is mounted and how it's torn down —
// used by ActivityDrawer.tsx (see its reservationCardIds state) so the card's presence is driven
// by React instead of container.insertAdjacentHTML/card.remove() reaching around it. Callers that
// don't pass them (existing tests, and anything not yet converted) keep the original behavior:
// insert into #form-activity-reservations, and have the remove button remove the card itself.
//
// initialSlotsOverride lets a caller seed créneaux that aren't part of reservationData itself
// (ActivityDrawer.tsx's handleAddReservation carries the previous card's créneaux into a new
// blank one, and its blank-activity seed starts a lone card with one blank créneau) — when
// omitted, initial slots come from reservationData.slots as usual.
function addReservationCard(
  reservationData: any = null,
  targetContainer: HTMLElement | null = null,
  onRemove: (() => void) | null = null,
  initialSlotsOverride?: SlotData[]
) {
  const container = targetContainer || el("form-activity-reservations");
  if (!container) return;

  const uid = generateUid("res-card");

  container.insertAdjacentHTML(
    "beforeend",
    `
    <div class="reservation-card" id="${uid}" data-reservation-id="${reservationData ? reservationData.id : generateUid("res")}">
      <div class="reservation-room-tariff-mount"></div>

      <div class="reservation-install-dismantle-mount"></div>

      <div class="reservation-slots-mount"></div>

      <div class="reservation-bar-host-tech-mount"></div>

      <div class="reservation-staff-services-fees-mount"></div>
    </div>
  `
  );

  const card = el(uid);
  card.querySelectorAll<HTMLInputElement>('input[type="time"]').forEach(maskTimeInput);

  // Remember the amount/tariff in effect when this reservation was saved so the resolved-price
  // display can flag it if the room's pricing grid has since changed for that date (getActivePricingGrid).
  if (reservationData && reservationData.tariff_id && typeof reservationData.tariff_amount === "number") {
    card.dataset.storedTariffId = reservationData.tariff_id;
    card.dataset.storedTariffAmount = String(reservationData.tariff_amount);
  }

  // Room + tariff ("sous-tranche D") is RoomTariffFields.tsx, another React root built here —
  // same reasons as créneaux (collectReservationsFromForm() reads .searchable-select-value/
  // .room-tariff-parameter/etc. unconditionally) plus it owns the remove button now, so its
  // removal closure needs to do everything the old inline click handler did.
  const removeThisCard = () => {
    const slotsRoot = slotsRootsByCardId.get(card.id);
    if (slotsRoot) {
      slotsRoot.unmount();
      slotsRootsByCardId.delete(card.id);
    }
    const roomTariffRoot = roomTariffRootsByCardId.get(card.id);
    if (roomTariffRoot) {
      roomTariffRoot.unmount();
      roomTariffRootsByCardId.delete(card.id);
    }
    const barHostTechRoot = barHostTechRootsByCardId.get(card.id);
    if (barHostTechRoot) {
      barHostTechRoot.unmount();
      barHostTechRootsByCardId.delete(card.id);
    }
    const staffServicesFeesRoot = staffServicesFeesRootsByCardId.get(card.id);
    if (staffServicesFeesRoot) {
      staffServicesFeesRoot.unmount();
      staffServicesFeesRootsByCardId.delete(card.id);
    }
    if (onRemove) {
      onRemove();
    } else {
      card.remove();
    }
    updateFormDatesHelper();
    updateSubmissionFinancialSummary();
    autoSaveActivityForm();
  };

  const roomTariffMount = card.querySelector<HTMLElement>(".reservation-room-tariff-mount");
  if (roomTariffMount) {
    const roomTariffRoot = createRoot(roomTariffMount);
    roomTariffRootsByCardId.set(card.id, roomTariffRoot);
    const renderRoomTariff = () =>
      roomTariffRoot.render(<RoomTariffFields card={card} initialData={reservationData} onRemoveCard={removeThisCard} />);
    try {
      flushSync(renderRoomTariff);
    } catch {
      renderRoomTariff();
    }
  }

  // Install/dismantle toggle + date fields are the InstallDismantleFields React root mounted
  // into .reservation-install-dismantle-mount (see ActivityDrawer.tsx) — it wires its own
  // toggle clicks, datepicker init, updateFormDatesHelper()/autoSaveActivityForm() calls.

  card.querySelectorAll<HTMLInputElement>(".datepicker-wrapper")!.forEach(initDatepickerWrapper);

  // Créneaux (add/remove rows, the "+ Plage de jours" range generator) are SlotsFields.tsx, a
  // separate React root — built here (not by the caller, unlike InstallDismantleFields) so that
  // any caller of addReservationCard() gets working créneaux immediately: collectSlotsFromCard()/
  // computeFormRevenueSubtotal() depend on the rows actually existing, unlike install/dismantle's
  // toggle which is safe to read as "off" for a brief moment. flushSync forces the initial rows to
  // commit synchronously when nothing else is already mid-render (e.g. called directly, as in
  // financial-summary.test.ts); when this runs from ActivityDrawer.tsx's ref callback instead
  // (already inside a commit), flushSync can't force it and the render is deferred a macrotask —
  // ActivityDrawer.tsx's mountReservationCard() already accounts for that.
  const slotsMount = card.querySelector<HTMLElement>(".reservation-slots-mount");
  if (slotsMount) {
    const slotsRoot = createRoot(slotsMount);
    slotsRootsByCardId.set(card.id, slotsRoot);
    const initialSlots = initialSlotsOverride ?? (reservationData && reservationData.slots) ?? [];
    const renderSlots = () => slotsRoot.render(<SlotsFields card={card} initialSlots={initialSlots} />);
    try {
      flushSync(renderSlots);
    } catch {
      renderSlots();
    }
  }

  // Services techniques / Service de bar / Autres services ("sous-tranche E") are
  // BarHostTechFields.tsx, another React root built here — same reasons as créneaux/salle+tarif
  // (collectReservationsFromForm() reads .room-bar-*/.room-host-duties-* unconditionally). The
  // technical-services pill group still reaches into the still-legacy .room-staff-list/
  // .room-services-list (sous-tranche F) via `card`, exactly like the original code did.
  const barHostTechMount = card.querySelector<HTMLElement>(".reservation-bar-host-tech-mount");
  if (barHostTechMount) {
    const barHostTechRoot = createRoot(barHostTechMount);
    barHostTechRootsByCardId.set(card.id, barHostTechRoot);
    const renderBarHostTech = () => barHostTechRoot.render(<BarHostTechFields card={card} initialData={reservationData} />);
    try {
      flushSync(renderBarHostTech);
    } catch {
      renderBarHostTech();
    }
  }

  // Personnel / Équipements / Autres frais ("sous-tranche F", the last one) are
  // StaffServicesFeesFields.tsx, the final React root built here. Unlike the other four, it does
  // NOT own its row lists as React state/reconciled children — the .room-staff-list/
  // .room-services-list/.room-fees-list containers stay "opaque" to React (mounted once, never
  // re-rendered), with addStaffRow()/addServiceRow()/addFeeRow() still doing raw
  // insertAdjacentHTML into them exactly as before. That's deliberate: autoAddLinkedStaffAndFees/
  // autoAddProjectorIfNeeded/autoRemoveProjectorIfNeeded are called from
  // *other* React roots on this same card (BarHostTechFields.tsx's technical-services toggle,
  // RoomTariffFields.tsx's room select) reaching into these containers directly — if React
  // reconciled their children from its own state, those cross-root DOM insertions would be
  // invisible to it and could get wiped out on the next re-render (the same class of conflict
  // fixed in bulk-actions.ts earlier). Keeping these three lists imperative-only, like the
  // original code, sidesteps that entirely.
  const staffServicesFeesMount = card.querySelector<HTMLElement>(".reservation-staff-services-fees-mount");
  if (staffServicesFeesMount) {
    const staffServicesFeesRoot = createRoot(staffServicesFeesMount);
    staffServicesFeesRootsByCardId.set(card.id, staffServicesFeesRoot);
    const renderStaffServicesFees = () =>
      staffServicesFeesRoot.render(<StaffServicesFeesFields card={card} initialData={reservationData} />);
    try {
      flushSync(renderStaffServicesFees);
    } catch {
      renderStaffServicesFees();
    }
  }

  return card;
}

export { buildRoomSelectItems, addReservationCard };
