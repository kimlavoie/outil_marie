/**
 * reservations/subrows.ts - Barrel re-exporting staff-rows.ts/service-rows.ts/fee-rows.ts/
 * incomplete-row-warnings.ts under this original shared import path (the same pattern used by
 * src/services/backup/index.ts and reservations/index.ts itself), plus
 * autoAddLinkedStaffAndFees() which ties staff rows and fee rows together and so doesn't belong
 * to either on its own. Originally one file mixing all three row types with their pricing/DOM
 * logic — split by row type for maintainability, each still covered by the same tests
 * (test/reservations/subrows.test.ts) importing from this path.
 */
import { getRoomByName } from "../../state/settings-repository.ts";
import { addStaffRow } from "./staff-rows.ts";
import { addFeeRow } from "./fee-rows.ts";

export function autoAddLinkedStaffAndFees(card: HTMLElement, roomName: string) {
  const room = getRoomByName(roomName);
  if (!room) return;

  // Non-null-safe: .room-staff-list/.room-fees-list live in StaffServicesFeesFields.tsx, a
  // separate React root mounted asynchronously by card.tsx's addReservationCard() — this can run
  // (from RoomTariffFields.tsx's room-select onChange) before it's committed. Silently skipping
  // in that unlikely window beats crashing; a user picking a room always has this section
  // already visible on screen in practice.
  const staffList = card.querySelector<HTMLInputElement>(".room-staff-list");
  if (staffList) {
    (room.linked_staff || []).forEach((s: any) => {
      const numToCreate = typeof s.count === "number" ? s.count : 1;
      for (let i = 0; i < numToCreate; i++) {
        addStaffRow(staffList, s.salary_id, "", 0, 0, true);
      }
    });
  }

  const feesList = card.querySelector<HTMLInputElement>(".room-fees-list");
  if (feesList) {
    (room.linked_fees || []).forEach((f: any) => addFeeRow(feesList, f.description, f.amount, true));
  }
}

export {
  propagateFirstSlotTimesToStaff,
  getStaffRowHours,
  addStaffRow,
  updateStaffRowSubtotal,
  collectStaffFromForm,
  TECHNICAL_DIRECTOR_SALARY_ID,
  HOSTESS_SALARY_ID
} from "./staff-rows.ts";
export {
  addServiceRow,
  updateServiceRowSubtotal,
  collectServicesFromForm,
  PROJECTOR_SERVICE_ID,
  autoAddProjectorIfNeeded,
  autoRemoveProjectorIfNeeded
} from "./service-rows.ts";
export { addFeeRow, collectFeesFromForm } from "./fee-rows.ts";
export { resetIncompleteRowWarnings, getIncompleteRowWarnings, pushIncompleteRowWarning } from "./incomplete-row-warnings.ts";
