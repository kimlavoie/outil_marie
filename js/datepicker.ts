/**
 * datepicker.ts - Custom calendar popover for date inputs, plus fiscal-year
 * date validation used by the activity form.
 *
 * A reusable multi-instance widget (attached to every .datepicker-wrapper in the DOM, including
 * ones created dynamically later), not a single view — so unlike Dashboard/Settings/Calendar it
 * stays a plain TS module (Phase 2 style: renamed + typed, behavior unchanged) rather than a
 * React component. Its call sites (activities-form.js, activities-reservations.js) are still
 * vanilla and haven't had their turn in Phase 4 yet.
 */
import { appState, parseLocalDateStr, getFiscalYearRange } from "./state.js";
import { maskDateInput } from "./utils.ts";

// Validates a date input's value against the active fiscal year and shows/hides
// the associated .field-error-msg (id: "<input-id>-fy-error") in real time.
function validateDateFieldFiscalYear(input: any) {
  const errorEl = document.getElementById(`${input.id}-fy-error`);
  if (!errorEl) return true;

  const value = input.value.trim();
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  const fyRange = getFiscalYearRange(appState.selected_year);

  let message = "";
  if (value && dateRegex.test(value) && fyRange) {
    const d = parseLocalDateStr(value);
    const minDate = parseLocalDateStr(fyRange.start);
    const maxDate = parseLocalDateStr(fyRange.end);
    if (!isNaN(d.getTime()) && (d < minDate || d > maxDate)) {
      message = `Cette date doit être comprise dans l'année financière active (${appState.selected_year}).`;
    }
  }

  errorEl.textContent = message;
  errorEl.classList.toggle("visible", !!message);
  input.classList.toggle("invalid", !!message);
  return !message;
}

// Clears all fiscal-year date error messages/styling in the activity form (used on drawer open).
function clearDateFieldErrors() {
  document.querySelectorAll("#activity-form .field-error-msg").forEach(el => {
    el.textContent = "";
    el.classList.remove("visible");
  });
  document.querySelectorAll("#activity-form .form-input.invalid").forEach(el => {
    el.classList.remove("invalid");
  });
}

function initCustomDatepickers() {
  document.querySelectorAll(".datepicker-wrapper").forEach(initDatepickerWrapper);

  // Single delegated "click outside" listener for every datepicker wrapper
  // (including ones added dynamically later), instead of one per wrapper.
  document.addEventListener("click", e => {
    document.querySelectorAll(".calendar-popover.active").forEach(popover => {
      const wrapper = popover.closest(".datepicker-wrapper");
      if (wrapper && !wrapper.contains(e.target as Node)) {
        popover.classList.remove("active");
      }
    });
  });
}

// Wires a single .datepicker-wrapper element (mask, fiscal-year validation, popover
// trigger). Safe to call individually for wrappers created dynamically after page load
// (e.g. per-room schedule cards), so listeners aren't re-attached to existing wrappers.
function initDatepickerWrapper(wrapper: any) {
  if (wrapper.dataset.datepickerInit) return;
  wrapper.dataset.datepickerInit = "true";

  const input = wrapper.querySelector(".form-input");
  const btn = wrapper.querySelector(".datepicker-trigger-btn");
  const popover = wrapper.querySelector(".calendar-popover");

  // Auto-mask date formatting on keyboard input
  maskDateInput(input);

  // Real-time validation against the active fiscal year
  input.addEventListener("input", () => validateDateFieldFiscalYear(input));
  input.addEventListener("change", () => validateDateFieldFiscalYear(input));
  input.addEventListener("blur", () => validateDateFieldFiscalYear(input));

  let currentDate = new Date(); // Tracks the displayed month

  btn.addEventListener("click", () => {
    // Toggle active
    const wasActive = popover.classList.contains("active");
    document.querySelectorAll(".calendar-popover").forEach(p => p.classList.remove("active"));

    if (!wasActive) {
      // Set display month based on input value if valid
      const val = input.value;
      const parsed = parseLocalDateStr(val);
      if (val && !isNaN(parsed.getTime())) {
        currentDate = parsed;
      } else {
        currentDate = new Date();
      }
      renderCalendar(popover, input, currentDate);
      popover.classList.add("active");
    }
  });
}

function renderCalendar(popover: any, input: any, displayDate: Date) {
  const year = displayDate.getFullYear();
  const month = displayDate.getMonth(); // 0-11

  // Month names in French
  const monthNames = [
    "Janvier",
    "Février",
    "Mars",
    "Avril",
    "Mai",
    "Juin",
    "Juillet",
    "Août",
    "Septembre",
    "Octobre",
    "Novembre",
    "Décembre"
  ];

  // Days of week headers
  const daysHeaderHtml = ["D", "L", "M", "M", "J", "V", "S"].map(d => `<div class="calendar-day-header">${d}</div>`).join("");

  // First day of current month (0: Sunday, 1: Monday, etc)
  const firstDayIndex = new Date(year, month, 1).getDay();

  // Last day of current month (number of days)
  const lastDay = new Date(year, month + 1, 0).getDate();

  // Last day of previous month
  const prevLastDay = new Date(year, month, 0).getDate();

  let daysHtml = "";

  // Render empty cells for previous month padding
  for (let x = firstDayIndex; x > 0; x--) {
    daysHtml += `<div class="calendar-day other-month">${prevLastDay - x + 1}</div>`;
  }

  // Render current month days
  const activeVal = input.value;
  const activeDate = activeVal ? parseLocalDateStr(activeVal) : null;
  const activeYear = activeDate ? activeDate.getFullYear() : null;
  const activeMonth = activeDate ? activeDate.getMonth() : null;
  const activeDay = activeDate ? activeDate.getDate() : null;

  const fyRange = getFiscalYearRange(appState.selected_year);
  const minDate = fyRange ? parseLocalDateStr(fyRange.start) : null;
  const maxDate = fyRange ? parseLocalDateStr(fyRange.end) : null;

  for (let i = 1; i <= lastDay; i++) {
    const isSelected = activeYear === year && activeMonth === month && activeDay === i ? "selected" : "";
    const dayDate = new Date(year, month, i);
    const isDisabled = (minDate && dayDate < minDate) || (maxDate && dayDate > maxDate);
    daysHtml += `<div class="calendar-day ${isSelected}${isDisabled ? " disabled" : ""}" ${isDisabled ? "" : `data-day="${i}"`}>${i}</div>`;
  }

  // Render next month padding to complete 42 grid cells
  const totalCells = firstDayIndex + lastDay;
  const nextMonthPadding = 42 - totalCells;
  for (let j = 1; j <= nextMonthPadding; j++) {
    daysHtml += `<div class="calendar-day other-month">${j}</div>`;
  }

  popover.innerHTML = `
    <div class="calendar-header">
      <button type="button" class="calendar-nav-btn prev-btn">&lt;</button>
      <span>${monthNames[month]} ${year}</span>
      <button type="button" class="calendar-nav-btn next-btn">&gt;</button>
    </div>
    <div class="calendar-grid">
      ${daysHeaderHtml}
      ${daysHtml}
    </div>
  `;

  // Wire nav buttons
  popover.querySelector(".prev-btn").addEventListener("click", (e: Event) => {
    e.stopPropagation();
    displayDate.setMonth(displayDate.getMonth() - 1);
    renderCalendar(popover, input, displayDate);
  });

  popover.querySelector(".next-btn").addEventListener("click", (e: Event) => {
    e.stopPropagation();
    displayDate.setMonth(displayDate.getMonth() + 1);
    renderCalendar(popover, input, displayDate);
  });

  // Wire day clicks
  popover.querySelectorAll(".calendar-grid .calendar-day").forEach((dayEl: any) => {
    dayEl.addEventListener("click", (e: Event) => {
      e.stopPropagation();
      const day = dayEl.getAttribute("data-day");
      if (day) {
        const paddedMonth = String(month + 1).padStart(2, "0");
        const paddedDay = String(day).padStart(2, "0");
        input.value = `${year}-${paddedMonth}-${paddedDay}`;
        popover.classList.remove("active");

        // Dispatch input event so validation runs if needed
        input.dispatchEvent(new Event("change"));
        input.dispatchEvent(new Event("input"));
      }
    });
  });
}

export { validateDateFieldFiscalYear, clearDateFieldErrors, initCustomDatepickers, initDatepickerWrapper };
if (typeof window !== "undefined") {
  window.validateDateFieldFiscalYear = validateDateFieldFiscalYear;
  window.clearDateFieldErrors = clearDateFieldErrors;
  window.initCustomDatepickers = initCustomDatepickers;
  window.initDatepickerWrapper = initDatepickerWrapper;
}
