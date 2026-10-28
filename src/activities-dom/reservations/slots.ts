/**
 * reservations/slots.ts - Time slot rows within a reservation card: single-row add/collect
 * helpers plus the "plage de jours" (date range) generator that bulk-adds slots by weekday.
 */
import { validateDateFieldFiscalYear } from "../datepicker.ts";
import { formatDateStrLocal, parseLocalDateStr } from "../../state/state.ts";
import { generateUid, maskDateInput, maskTimeInput, escapeHtml, debounce } from "../../utils/utils.ts";
import { updateSubmissionFinancialSummary, autoSaveActivityForm } from "../financials.ts";
import { updateFormDatesHelper } from "../history/index.ts";
import { propagateFirstSlotTimesToStaff } from "./subrows.ts";

function el<T extends Element = HTMLInputElement>(id: string): T {
  return document.getElementById(id) as unknown as T;
}

function addSlotRow(container: HTMLElement, date = "", startTime = "", endTime = "", details = "") {
  const rowId = generateUid("slot-row");
  container.insertAdjacentHTML(
    "beforeend",
    `
    <div id="${rowId}" class="distribution-row reservation-slot-row" style="grid-template-columns: 1.2fr 0.8fr 0.8fr 1.5fr auto; gap: 8px;">
      <div>
        <input type="text" id="${rowId}-date" class="form-input slot-date-input" placeholder="AAAA-MM-JJ" pattern="\\d{4}-\\d{2}-\\d{2}" value="${date}">
        <div class="field-error-msg" id="${rowId}-date-fy-error"></div>
      </div>
      <input type="time" id="${rowId}-start-time" class="form-input slot-start-time-input" value="${startTime}">
      <input type="time" id="${rowId}-end-time" class="form-input slot-end-time-input" value="${endTime}">
      <input type="text" id="${rowId}-details" class="form-input slot-details-input" placeholder="Détails" value="${escapeHtml(details)}">
      <button type="button" class="btn-icon delete-slot-row-btn" data-row-id="${rowId}" title="Retirer ce créneau">
        <svg viewBox="0 0 24 24" style="width: 14px; height: 14px;"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
      </button>
    </div>
  `
  );
  const row = el(rowId);
  const slotDateInput = row.querySelector<HTMLInputElement>(".slot-date-input")!;
  maskDateInput(slotDateInput);
  slotDateInput.addEventListener("input", () => validateDateFieldFiscalYear(slotDateInput));
  slotDateInput.addEventListener("change", () => validateDateFieldFiscalYear(slotDateInput));
  slotDateInput.addEventListener("blur", () => validateDateFieldFiscalYear(slotDateInput));
  validateDateFieldFiscalYear(slotDateInput);

  const startInput = row.querySelector<HTMLInputElement>(".slot-start-time-input")!;
  const endInput = row.querySelector<HTMLInputElement>(".slot-end-time-input")!;
  maskTimeInput(startInput);
  maskTimeInput(endInput);
  const handleSlotTimeChange = () => {
    const card = row.closest(".reservation-card");
    if (card) {
      propagateFirstSlotTimesToStaff(card as HTMLElement);
    }
  };
  startInput.addEventListener("input", handleSlotTimeChange);
  startInput.addEventListener("change", handleSlotTimeChange);
  endInput.addEventListener("input", handleSlotTimeChange);
  endInput.addEventListener("change", handleSlotTimeChange);

  if (startTime && endTime) {
    handleSlotTimeChange();
  }

  const detailsInput = row.querySelector<HTMLInputElement>(".slot-details-input")!;
  detailsInput.addEventListener("input", debounce(autoSaveActivityForm, 500));
  detailsInput.addEventListener("change", autoSaveActivityForm);

  row.querySelector<HTMLInputElement>(".delete-slot-row-btn")!.addEventListener("click", () => {
    const hasContent = row.querySelector<HTMLInputElement>(".slot-date-input")!.value.trim() !== "";
    if (hasContent && !confirm("Retirer ce créneau ?")) return;
    row.remove();
    updateFormDatesHelper();
    updateSubmissionFinancialSummary();
    autoSaveActivityForm();
  });
}

function collectSlotsFromCard(card: HTMLElement) {
  return Array.from(card.querySelectorAll<HTMLInputElement>(".reservation-slots-list .reservation-slot-row"))
    .map(row => ({
      id: generateUid("slot"),
      date: row.querySelector<HTMLInputElement>(".slot-date-input")!.value,
      start_time: row.querySelector<HTMLInputElement>(".slot-start-time-input")!.value,
      end_time: row.querySelector<HTMLInputElement>(".slot-end-time-input")!.value,
      details: row.querySelector<HTMLInputElement>(".slot-details-input")?.value || ""
    }))
    .filter(s => s.date);
}

function addNextSlotRow(container: HTMLElement) {
  const rows = container.querySelectorAll<HTMLInputElement>(".reservation-slot-row");
  const last = rows[rows.length - 1];
  if (!last) {
    addSlotRow(container);
    return;
  }

  const lastDate = last.querySelector<HTMLInputElement>(".slot-date-input")!.value;
  const startTime = last.querySelector<HTMLInputElement>(".slot-start-time-input")!.value;
  const endTime = last.querySelector<HTMLInputElement>(".slot-end-time-input")!.value;
  let nextDate = "";
  if (lastDate) {
    const d = parseLocalDateStr(lastDate);
    d.setDate(d.getDate() + 1);
    nextDate = formatDateStrLocal(d);
  }
  addSlotRow(container, nextDate, startTime, endTime);
}

export { addSlotRow, collectSlotsFromCard, addNextSlotRow };
