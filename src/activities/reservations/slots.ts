/**
 * reservations/slots.ts - Time slot rows within a reservation card: single-row add/collect
 * helpers plus the "plage de jours" (date range) generator that bulk-adds slots by weekday.
 */
import { validateDateFieldFiscalYear } from "../datepicker.ts";
import { WEEKDAY_PILL_OPTIONS } from "../form.ts";
import { formatDateStrLocal, parseLocalDateStr } from "../../state/state.ts";
import { generateUid, showToast, initPillToggleEl, maskDateInput, maskTimeInput } from "../../utils/utils.ts";
import { updateSubmissionFinancialSummary, autoSaveActivityForm } from "../financials.ts";
import { updateFormDatesHelper } from "../history/index.ts";
import { propagateFirstSlotTimesToStaff } from "./subrows.ts";

function el<T extends Element = HTMLInputElement>(id: string): T {
  return document.getElementById(id) as unknown as T;
}

function addSlotRow(container: HTMLElement, date = "", startTime = "", endTime = "") {
  const rowId = generateUid("slot-row");
  container.insertAdjacentHTML(
    "beforeend",
    `
    <div id="${rowId}" class="distribution-row reservation-slot-row" style="grid-template-columns: 1fr 0.8fr 0.8fr auto;">
      <div>
        <input type="text" id="${rowId}-date" class="form-input slot-date-input" placeholder="AAAA-MM-JJ" pattern="\\d{4}-\\d{2}-\\d{2}" value="${date}">
        <div class="field-error-msg" id="${rowId}-date-fy-error"></div>
      </div>
      <input type="time" id="${rowId}-start-time" class="form-input slot-start-time-input" value="${startTime}">
      <input type="time" id="${rowId}-end-time" class="form-input slot-end-time-input" value="${endTime}">
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
      end_time: row.querySelector<HTMLInputElement>(".slot-end-time-input")!.value
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

function buildSlotRangeGeneratorHtml(uid: string) {
  return `
    <div class="reservation-slot-range-generator" style="display: none; border: 1px dashed var(--border-color); border-radius: var(--radius-md); padding: 12px; margin-bottom: 12px;">
      <div class="form-group-row">
        <div class="form-group">
          <label for="${uid}-slot-range-start-date">Du</label>
          <input type="text" id="${uid}-slot-range-start-date" class="form-input slot-range-start-date" placeholder="AAAA-MM-JJ" pattern="\\d{4}-\\d{2}-\\d{2}">
          <div class="field-error-msg" id="${uid}-slot-range-start-date-fy-error"></div>
        </div>
        <div class="form-group">
          <label for="${uid}-slot-range-end-date">Au</label>
          <input type="text" id="${uid}-slot-range-end-date" class="form-input slot-range-end-date" placeholder="AAAA-MM-JJ" pattern="\\d{4}-\\d{2}-\\d{2}">
          <div class="field-error-msg" id="${uid}-slot-range-end-date-fy-error"></div>
        </div>
      </div>
      <div class="form-group-row">
        <div class="form-group">
          <label for="${uid}-slot-range-start-time">Heure de début</label>
          <input type="time" id="${uid}-slot-range-start-time" class="form-input slot-range-start-time">
        </div>
        <div class="form-group">
          <label for="${uid}-slot-range-end-time">Heure de fin</label>
          <input type="time" id="${uid}-slot-range-end-time" class="form-input slot-range-end-time">
        </div>
      </div>
      <div class="form-group">
        <span class="field-label" id="${uid}-slot-range-weekdays-label">Jours à inclure</span>
        <div class="pill-toggle-group slot-range-weekdays-group" role="group" aria-labelledby="${uid}-slot-range-weekdays-label">
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

function wireSlotRangeGenerator(card: HTMLElement) {
  const generatorEl = card.querySelector<HTMLElement>(".reservation-slot-range-generator")!;
  const toggleBtn = card.querySelector<HTMLElement>(".reservation-add-slot-range-btn")!;
  const weekdaysGroup = generatorEl.querySelector<HTMLElement>(".slot-range-weekdays-group");
  const slotsList = card.querySelector<HTMLElement>(".reservation-slots-list")!;
  initPillToggleEl(weekdaysGroup);
  const rangeStartInput = generatorEl.querySelector<HTMLInputElement>(".slot-range-start-date")!;
  const rangeEndInput = generatorEl.querySelector<HTMLInputElement>(".slot-range-end-date")!;
  maskDateInput(rangeStartInput);
  maskDateInput(rangeEndInput);
  maskTimeInput(generatorEl.querySelector<HTMLInputElement>(".slot-range-start-time")!);
  maskTimeInput(generatorEl.querySelector<HTMLInputElement>(".slot-range-end-time")!);
  for (const input of [rangeStartInput, rangeEndInput]) {
    input.addEventListener("input", () => validateDateFieldFiscalYear(input));
    input.addEventListener("change", () => validateDateFieldFiscalYear(input));
    input.addEventListener("blur", () => validateDateFieldFiscalYear(input));
  }

  toggleBtn.addEventListener("click", () => {
    generatorEl.style.display = generatorEl.style.display === "none" ? "block" : "none";
  });
  generatorEl.querySelector<HTMLElement>(".slot-range-cancel-btn")!.addEventListener("click", () => {
    generatorEl.style.display = "none";
  });

  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  generatorEl.querySelector<HTMLElement>(".slot-range-generate-btn")!.addEventListener("click", () => {
    const startVal = generatorEl.querySelector<HTMLInputElement>(".slot-range-start-date")!.value;
    const endVal = generatorEl.querySelector<HTMLInputElement>(".slot-range-end-date")!.value;
    const startTime = generatorEl.querySelector<HTMLInputElement>(".slot-range-start-time")!.value;
    const endTime = generatorEl.querySelector<HTMLInputElement>(".slot-range-end-time")!.value;
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
    const activeWeekdays = Array.from(weekdaysGroup!.querySelectorAll<HTMLElement>(".pill-toggle.active")).map(b =>
      parseInt(b.dataset.value as string, 10)
    );
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

export { addSlotRow, collectSlotsFromCard, addNextSlotRow, buildSlotRangeGeneratorHtml, wireSlotRangeGenerator };
