import { appState, getActiveSalaryRate, getActiveSalaryOvertimeRate, getActiveServiceRate } from "../../state/state.ts";
import {
  escapeHtml,
  formatCurrency,
  generateUid,
  rejectNegativeAmountOnBlur,
  maskTimeInput,
  calculateHoursFromTimes,
  maskDateInput,
  debounce
} from "../../utils/utils.ts";
import { updateSubmissionFinancialSummary, autoSaveActivityForm } from "../financials.ts";

function el<T extends Element = HTMLInputElement>(id: string): T {
  return document.getElementById(id) as unknown as T;
}

// Helper to query DOM for the earliest slot date to avoid circular dependency
// with activities-reservations.ts's collectReservationsFromForm()
function getEarliestSlotDateFromDom(): string {
  const dates = Array.from(document.querySelectorAll<HTMLInputElement>(".slot-date-input"))
    .map(el => el.value)
    .filter(Boolean)
    .sort();
  return dates[0] || "";
}

export function propagateFirstSlotTimesToStaff(card: HTMLElement) {
  const firstSlot = card.querySelector(".reservation-slots-list .reservation-slot-row");
  if (!firstSlot) return;

  const startVal = firstSlot.querySelector<HTMLInputElement>(".slot-start-time-input")?.value || "";
  const endVal = firstSlot.querySelector<HTMLInputElement>(".slot-end-time-input")?.value || "";

  if (!startVal && !endVal) return;

  const staffRows = card.querySelectorAll<HTMLElement>(".room-staff-list .distribution-row");
  staffRows.forEach(row => {
    const startInput = row.querySelector<HTMLInputElement>(".staff-start-time-input");
    const endInput = row.querySelector<HTMLInputElement>(".staff-end-time-input");
    const hoursInput = row.querySelector<HTMLInputElement>(".staff-hours-input");

    if (startInput && endInput) {
      const currentHours = hoursInput ? parseFloat(hoursInput.value) || 0 : 0;
      if (!startInput.value && !endInput.value && currentHours === 0) {
        startInput.value = startVal;
        endInput.value = endVal;
        if (hoursInput) {
          const computed = calculateHoursFromTimes(startVal, endVal);
          hoursInput.value = String(computed);
        }
        updateStaffRowSubtotal(row);
      }
    }
  });
}

// Builds the "Tarif" options shared by services and salaries: each a named price point (with its
// own budget account) configured in the Équipements/Salaires settings, e.g. one for internal
// clients, one for external ones. Falls back to a single "Aucun" option when none are configured.
function buildTarifOptionsHtml(
  entity: { tarifs?: { id: string; label: string; gl_account_code?: string }[] } | undefined,
  selectedTarifId = ""
): string {
  if (!entity) {
    return '<option value="">Aucun</option>';
  }
  const tarifs = entity.tarifs || [];
  let html = tarifs
    .map(t => {
      const label = t.label || "(sans nom)";
      return `<option value="${t.id}" ${t.id === selectedTarifId ? "selected" : ""}>${escapeHtml(label)}</option>`;
    })
    .join("");
  html += `<option value="__custom__" ${selectedTarifId === "__custom__" ? "selected" : ""}>Montant personnalisé...</option>`;
  return html;
}

export function getStaffRowHours(row: HTMLElement): { hours: number; overtimeHours: number } {
  const salaryId = row.querySelector<HTMLSelectElement>(".staff-salary-select")!.value;
  const salary = (appState.settings.salaries || []).find(s => s.id === salaryId);
  const isDT = salaryId === TECHNICAL_DIRECTOR_SALARY_ID || !!(salary && salary.job && salary.job.toLowerCase() === "directeur technique");

  const rawHours = parseFloat(row.querySelector<HTMLInputElement>(".staff-hours-input")!.value) || 0;

  if (isDT) {
    const overtimeCheckbox = row.querySelector<HTMLInputElement>(".staff-overtime-checkbox");
    const isOvertime = overtimeCheckbox && overtimeCheckbox.checked;
    return {
      hours: isOvertime ? 0 : rawHours,
      overtimeHours: isOvertime ? rawHours : 0
    };
  } else {
    return {
      hours: rawHours,
      overtimeHours: 0
    };
  }
}

export function updateStaffRowOvertimeVisibility(row: HTMLElement, isOvertimeChecked = false) {
  const salarySelect = row.querySelector<HTMLSelectElement>(".staff-salary-select")!;
  const salaryId = salarySelect.value;
  const container = row.querySelector<HTMLElement>(".staff-overtime-container")!;
  if (!container) return;

  const salary = (appState.settings.salaries || []).find(s => s.id === salaryId);
  const isDT = salaryId === TECHNICAL_DIRECTOR_SALARY_ID || !!(salary && salary.job && salary.job.toLowerCase() === "directeur technique");

  if (isDT) {
    container.innerHTML = `
      <label class="staff-toggle-pill staff-overtime-pill ${isOvertimeChecked ? "active" : ""}" title="Cocher si le directeur technique est à temps supplémentaire" style="cursor: pointer;">
        <input type="checkbox" class="staff-overtime-checkbox" ${isOvertimeChecked ? "checked" : ""} style="display: none;">
        T.S.
      </label>
    `;
    const checkbox = container.querySelector<HTMLInputElement>(".staff-overtime-checkbox")!;
    checkbox.addEventListener("change", () => {
      checkbox.closest(".staff-toggle-pill")?.classList.toggle("active", checkbox.checked);
      updateStaffRowSubtotal(row);
      updateSubmissionFinancialSummary();
      autoSaveActivityForm();
    });
  } else {
    container.innerHTML = "";
  }
}

export function addStaffRow(
  container: HTMLElement,
  salaryId = "",
  date = "",
  hours = 0,
  overtimeHours = 0,
  autoGenerated = false,
  customRate = 0,
  customOvertimeRate = 0,
  useCustomRate = false,
  startTime = "",
  endTime = ""
) {
  const rowId = generateUid("staff-row");
  const wrapperId = rowId + "-wrapper";

  const salaryOptionsHtml = (appState.settings.salaries || [])
    .map(s => `<option value="${s.id}" ${s.id === salaryId ? "selected" : ""}>${s.job}</option>`)
    .join("");

  let defaultStart = startTime;
  let defaultEnd = endTime;

  if (!defaultStart && !defaultEnd) {
    const card = container.closest(".reservation-card");
    if (card) {
      const firstSlot = card.querySelector(".reservation-slots-list .reservation-slot-row");
      if (firstSlot) {
        defaultStart = firstSlot.querySelector<HTMLInputElement>(".slot-start-time-input")?.value || "";
        defaultEnd = firstSlot.querySelector<HTMLInputElement>(".slot-end-time-input")?.value || "";
      }
    }
  }

  let defaultDate = date;
  if (!defaultDate) {
    const card = container.closest(".reservation-card");
    if (card) {
      const firstSlot = card.querySelector(".reservation-slots-list .reservation-slot-row");
      if (firstSlot) {
        defaultDate = firstSlot.querySelector<HTMLInputElement>(".slot-date-input")?.value || "";
      }
    }
  }

  if (!hours && defaultStart && defaultEnd) {
    hours = calculateHoursFromTimes(defaultStart, defaultEnd);
  }

  const salary = (appState.settings.salaries || []).find(s => s.id === salaryId);
  const isDT = salaryId === TECHNICAL_DIRECTOR_SALARY_ID || !!(salary && salary.job && salary.job.toLowerCase() === "directeur technique");
  const displayedHours = isDT && overtimeHours > 0 ? overtimeHours : hours;
  const isOvertimeChecked = isDT && overtimeHours > 0;

  container.insertAdjacentHTML(
    "beforeend",
    `
    <div id="${wrapperId}" class="distribution-row-wrapper" data-auto-generated="${autoGenerated ? "1" : ""}" style="margin-bottom: 8px; width: 100%;">
      <div id="${rowId}" class="distribution-row" style="grid-template-columns: 1.2fr 110px 95px 95px 75px 75px 1fr 50px 100px 38px; align-items: center;">
        <select id="${rowId}-salary" class="select-input staff-salary-select" style="padding: 8px 12px; font-size: 0.85rem;">
          <option value="">Choisir un emploi...</option>
          ${salaryOptionsHtml}
        </select>
        <input type="text" id="${rowId}-date" class="form-input staff-date-input" placeholder="AAAA-MM-JJ" pattern="\\d{4}-\\d{2}-\\d{2}" value="${defaultDate}" style="padding: 8px 6px; text-align: center; font-size: 0.85rem;">
        <input type="time" id="${rowId}-start-time" class="form-input staff-start-time-input" value="${defaultStart}" style="padding: 8px 6px; font-size: 0.85rem;">
        <input type="time" id="${rowId}-end-time" class="form-input staff-end-time-input" value="${defaultEnd}" style="padding: 8px 6px; font-size: 0.85rem;">
        <input type="number" id="${rowId}-hours" class="form-input staff-hours-input" min="0" step="0.25" value="${displayedHours || 0}" placeholder="Heures" style="padding: 8px 6px; text-align: center; font-size: 0.85rem;">
        <span class="staff-salary-rate-display" title="Taux horaire configuré pour cet emploi" style="font-size: 0.85rem; color: var(--text-secondary); text-align: center; align-self: center;">—</span>
        <span class="staff-subtotal-display" style="font-size: 0.85rem; color: var(--text-secondary); align-self: center;">0,00 $</span>
        <div style="display: flex; align-items: center; justify-content: center; min-width: 50px;">
          ${autoGenerated ? `<span class="badge badge-auto" style="white-space: nowrap;" title="Généré automatiquement par l'application">Généré</span>` : ""}
        </div>
        <div class="staff-pills-container" style="display: flex; gap: 4px; align-items: center; justify-content: flex-end; min-width: 100px; height: 100%;">
          <div class="staff-overtime-container" style="display: flex; align-items: center; justify-content: center; height: 100%;"></div>
          <label class="staff-toggle-pill staff-custom-pill ${useCustomRate ? "active" : ""}" title="Taux personnalisé" style="cursor: pointer;">
            <input type="checkbox" id="${rowId}-use-custom-rate" class="staff-use-custom-rate" ${useCustomRate ? "checked" : ""} style="display: none;">
            Perso.
          </label>
        </div>
        <button type="button" class="btn-icon delete-staff-row-btn" data-row-id="${rowId}">
          <svg viewBox="0 0 24 24" style="width: 14px; height: 14px;"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
        </button>
      </div>
      <div class="staff-custom-fields" style="display: ${useCustomRate ? "grid" : "none"}; grid-template-columns: 1fr 1fr; gap: 12px; padding: 10px 12px; margin-top: 4px; background: rgba(255, 255, 255, 0.02); border-left: 3px solid var(--primary); border-radius: 0 4px 4px 0;">
        <div class="form-group" style="margin-bottom: 0;">
          <label style="font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase; margin-bottom: 4px; display: block;">Taux régulier personnalisé ($/h)</label>
          <input type="number" class="form-input staff-custom-rate-input" min="0" step="0.01" value="${customRate > 0 ? customRate : ""}" placeholder="0,00" style="padding: 6px 10px; font-size: 0.8rem;">
        </div>
        <div class="form-group" style="margin-bottom: 0;">
          <label style="font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase; margin-bottom: 4px; display: block;">Taux supplémentaire ($/h)</label>
          <input type="number" class="form-input staff-custom-overtime-rate-input" min="0" step="0.01" value="${customOvertimeRate > 0 ? customOvertimeRate : ""}" placeholder="0,00" style="padding: 6px 10px; font-size: 0.8rem;">
        </div>
      </div>
    </div>
    `
  );

  const wrapper = el(wrapperId);
  const row = el(rowId);
  const customFields = wrapper.querySelector<HTMLElement>(".staff-custom-fields")!;
  const useCustomRateCheckbox = row.querySelector<HTMLInputElement>(".staff-use-custom-rate")!;

  row.querySelector<HTMLInputElement>(".delete-staff-row-btn")!.addEventListener("click", () => {
    const hasContent = row.querySelector<HTMLSelectElement>(".staff-salary-select")!.value !== "";
    if (hasContent && !confirm("Retirer ce membre du personnel de la réservation ?")) return;
    wrapper.remove();
    updateSubmissionFinancialSummary();
    autoSaveActivityForm();
  });

  row.querySelector<HTMLSelectElement>(".staff-salary-select")!.addEventListener("change", () => {
    updateStaffRowOvertimeVisibility(row, false);
    updateStaffRowSubtotal(row);
    updateSubmissionFinancialSummary();
    autoSaveActivityForm();
  });

  useCustomRateCheckbox.addEventListener("change", () => {
    const isCustomActive = useCustomRateCheckbox.checked;
    useCustomRateCheckbox.closest(".staff-toggle-pill")?.classList.toggle("active", isCustomActive);
    customFields.style.display = isCustomActive ? "grid" : "none";
    updateSubmissionFinancialSummary();
    autoSaveActivityForm();
  });

  const dateInput = row.querySelector<HTMLInputElement>(".staff-date-input")!;
  const startTimeInput = row.querySelector<HTMLInputElement>(".staff-start-time-input")!;
  const endTimeInput = row.querySelector<HTMLInputElement>(".staff-end-time-input")!;
  const hoursInput = row.querySelector<HTMLInputElement>(".staff-hours-input")!;
  maskDateInput(dateInput);
  maskTimeInput(startTimeInput);
  maskTimeInput(endTimeInput);

  const handleTimeChange = () => {
    const startVal = startTimeInput.value;
    const endVal = endTimeInput.value;
    if (startVal && endVal) {
      const computed = calculateHoursFromTimes(startVal, endVal);
      hoursInput.value = String(computed);
      updateStaffRowSubtotal(row);
      updateSubmissionFinancialSummary();
      autoSaveActivityForm();
    }
  };

  const handleDateChange = () => {
    updateStaffRowSubtotal(row);
    updateSubmissionFinancialSummary();
    autoSaveActivityForm();
  };

  dateInput.addEventListener("input", handleDateChange);
  dateInput.addEventListener("change", handleDateChange);
  startTimeInput.addEventListener("input", handleTimeChange);
  startTimeInput.addEventListener("change", handleTimeChange);
  endTimeInput.addEventListener("input", handleTimeChange);
  endTimeInput.addEventListener("change", handleTimeChange);

  wrapper.querySelectorAll<HTMLInputElement>("select, input")!.forEach(el => {
    el.addEventListener("input", debounce(updateSubmissionFinancialSummary, 250));
    el.addEventListener("change", updateSubmissionFinancialSummary);
  });
  rejectNegativeAmountOnBlur(wrapper.querySelector<HTMLInputElement>(".staff-custom-rate-input")!);
  rejectNegativeAmountOnBlur(wrapper.querySelector<HTMLInputElement>(".staff-custom-overtime-rate-input")!);
  rejectNegativeAmountOnBlur(row.querySelector<HTMLInputElement>(".staff-hours-input")!);

  updateStaffRowOvertimeVisibility(row, isOvertimeChecked);
  updateStaffRowSubtotal(row);
}

export function updateStaffRowSubtotal(row: HTMLElement) {
  const salaryId = row.querySelector<HTMLInputElement>(".staff-salary-select")!.value;
  const wrapper = row.closest(".distribution-row-wrapper");
  const useCustomRate = wrapper?.querySelector<HTMLInputElement>(".staff-use-custom-rate")?.checked || false;
  const { hours, overtimeHours } = getStaffRowHours(row);
  const salary = (appState.settings.salaries || []).find(s => s.id === salaryId);
  const staffDateInput = row.querySelector<HTMLInputElement>(".staff-date-input");
  const dateStr = (staffDateInput ? staffDateInput.value : "") || getEarliestSlotDateFromDom();

  let rate = 0;
  let overtimeRate = 0;
  if (useCustomRate) {
    rate = wrapper ? parseFloat(wrapper.querySelector<HTMLInputElement>(".staff-custom-rate-input")!.value) || 0 : 0;
    overtimeRate = wrapper ? parseFloat(wrapper.querySelector<HTMLInputElement>(".staff-custom-overtime-rate-input")!.value) || 0 : 0;
  } else {
    rate = salary ? getActiveSalaryRate(salary, dateStr) : 0;
    overtimeRate = salary ? getActiveSalaryOvertimeRate(salary, dateStr) : 0;
  }

  row.querySelector<HTMLInputElement>(".staff-subtotal-display")!.textContent = formatCurrency(rate * hours + overtimeRate * overtimeHours);

  const rateDisplay = row.querySelector<HTMLElement>(".staff-salary-rate-display")!;
  rateDisplay.textContent = salary ? `${formatCurrency(rate)}/h` : "—";
}

export function addServiceRow(container: HTMLElement, serviceId = "", hours = 0, tarifId = "", autoGenerated = false, customRate = 0) {
  const rowId = generateUid("service-row");
  const wrapperId = rowId + "-wrapper";
  const isCustom = tarifId === "__custom__";

  const serviceOptionsHtml = (appState.settings.services || [])
    .map(s => `<option value="${s.id}" ${s.id === serviceId ? "selected" : ""}>${s.name}</option>`)
    .join("");
  const initialService = (appState.settings.services || []).find(s => s.id === serviceId);

  container.insertAdjacentHTML(
    "beforeend",
    `
    <div id="${wrapperId}" class="distribution-row-wrapper" data-auto-generated="${autoGenerated ? "1" : ""}" style="margin-bottom: 8px; width: 100%;">
      <div id="${rowId}" class="distribution-row" style="grid-template-columns: 1.4fr 1fr 0.8fr 0.6fr 1fr 50px 38px; align-items: center;">
        <select id="${rowId}-service" class="select-input service-select" style="padding: 8px 12px; font-size: 0.85rem;">
          <option value="">Choisir un équipement...</option>
          ${serviceOptionsHtml}
        </select>
        <select id="${rowId}-tarif" class="select-input service-tarif-select" title="Tarif à facturer" style="padding: 8px 12px; font-size: 0.85rem;">
          ${buildTarifOptionsHtml(initialService, tarifId)}
        </select>
        <span class="service-rate-display" style="font-size: 0.85rem; color: var(--text-secondary); text-align: center; align-self: center;">—</span>
        <input type="number" id="${rowId}-hours" class="form-input service-hours-input" min="0" step="0.25" value="${hours || 0}" placeholder="Heures" style="padding: 8px 12px; font-size: 0.85rem; text-align: center;">
        <span class="service-subtotal-display" style="font-size: 0.85rem; color: var(--text-secondary); align-self: center;">0,00 $</span>
        <div style="display: flex; align-items: center; justify-content: center; min-width: 50px;">
          ${autoGenerated ? `<span class="badge badge-auto" style="white-space: nowrap;" title="Généré automatiquement par l'application">Généré</span>` : ""}
        </div>
        <button type="button" class="btn-icon delete-service-row-btn" data-row-id="${rowId}">
          <svg viewBox="0 0 24 24" style="width: 14px; height: 14px;"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
        </button>
      </div>
      <div class="service-custom-fields" style="display: ${isCustom ? "block" : "none"}; padding: 10px 12px; margin-top: 4px; background: rgba(255, 255, 255, 0.02); border-left: 3px solid var(--primary); border-radius: 0 4px 4px 0;">
        <div class="form-group" style="margin-bottom: 0;">
          <label style="font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase; margin-bottom: 4px; display: block;">Tarif personnalisé ($)</label>
          <input type="number" class="form-input service-custom-rate-input" min="0" step="0.01" value="${customRate > 0 ? customRate : ""}" placeholder="0,00" style="padding: 6px 10px; font-size: 0.8rem;">
        </div>
      </div>
    </div>
    `
  );

  const wrapper = el(wrapperId);
  const row = el(rowId);
  const customFields = wrapper.querySelector<HTMLElement>(".service-custom-fields")!;
  const tarifSelect = row.querySelector<HTMLSelectElement>(".service-tarif-select")!;

  row.querySelector<HTMLInputElement>(".delete-service-row-btn")!.addEventListener("click", () => {
    const hasContent = row.querySelector<HTMLSelectElement>(".service-select")!.value !== "";
    if (hasContent && !confirm("Retirer cet équipement/service de la réservation ?")) return;
    wrapper.remove();
    updateSubmissionFinancialSummary();
    autoSaveActivityForm();
  });

  row.querySelector<HTMLSelectElement>(".service-select")!.addEventListener("change", e => {
    const service = (appState.settings.services || []).find(s => s.id === (e.target as HTMLSelectElement).value);
    tarifSelect.innerHTML = buildTarifOptionsHtml(service);
    customFields.style.display = tarifSelect.value === "__custom__" ? "block" : "none";
  });

  tarifSelect.addEventListener("change", () => {
    const isCustomActive = tarifSelect.value === "__custom__";
    customFields.style.display = isCustomActive ? "block" : "none";
    updateSubmissionFinancialSummary();
    autoSaveActivityForm();
  });

  wrapper.querySelectorAll<HTMLInputElement>("select, input")!.forEach(el => {
    el.addEventListener("input", debounce(updateSubmissionFinancialSummary, 250));
    el.addEventListener("change", updateSubmissionFinancialSummary);
  });
  rejectNegativeAmountOnBlur(wrapper.querySelector<HTMLInputElement>(".service-custom-rate-input")!);
  rejectNegativeAmountOnBlur(row.querySelector<HTMLInputElement>(".service-hours-input")!);

  updateServiceRowSubtotal(row);
}

export function updateServiceRowSubtotal(row: HTMLElement) {
  const serviceId = row.querySelector<HTMLInputElement>(".service-select")!.value;
  const tarifId = row.querySelector<HTMLInputElement>(".service-tarif-select")!.value;
  const count = 1;
  const hours = parseFloat(row.querySelector<HTMLInputElement>(".service-hours-input")!.value) || 0;
  const service = (appState.settings.services || []).find(s => s.id === serviceId);
  const dateStr = getEarliestSlotDateFromDom();

  let rate = 0;
  if (tarifId === "__custom__") {
    const wrapper = row.closest(".distribution-row-wrapper");
    rate = wrapper ? parseFloat(wrapper.querySelector<HTMLInputElement>(".service-custom-rate-input")!.value) || 0 : 0;
  } else {
    rate = service ? getActiveServiceRate(service, dateStr, tarifId) : 0;
  }

  const hoursInput = row.querySelector<HTMLInputElement>(".service-hours-input")!;
  const isHourly = service && service.type === "hourly";
  hoursInput.style.visibility = isHourly ? "visible" : "hidden";
  const subtotal = isHourly ? rate * hours * count : rate * count;
  row.querySelector<HTMLInputElement>(".service-subtotal-display")!.textContent = formatCurrency(subtotal);

  const rateDisplay = row.querySelector<HTMLElement>(".service-rate-display")!;
  rateDisplay.textContent = service ? `${formatCurrency(rate)}${isHourly ? "/h" : ""}` : "—";
}

export function addFeeRow(container: HTMLElement, description = "", amount: string | number = "", autoGenerated = false) {
  const rowId = generateUid("fee-row");

  container.insertAdjacentHTML(
    "beforeend",
    `
    <div id="${rowId}" class="distribution-row" data-auto-generated="${autoGenerated ? "1" : ""}" style="grid-template-columns: 1.5fr 1fr auto auto; align-items: center;">
      <input type="text" id="${rowId}-desc" class="form-input fee-desc-input" value="${escapeHtml(description)}" placeholder="Ex: Entretien ménager" style="padding: 8px 12px; font-size: 0.85rem;">
      <input type="number" id="${rowId}-amount" class="form-input fee-amount-input" min="0" step="0.01" value="${amount !== "" ? amount : ""}" placeholder="Montant $" style="padding: 8px 12px; font-size: 0.85rem;">
      <div style="display: flex; align-items: center; justify-content: center; min-width: 50px;">
        ${autoGenerated ? `<span class="badge badge-auto" style="white-space: nowrap;" title="Généré automatiquement par l'application">Généré</span>` : ""}
      </div>
      <button type="button" class="btn-icon delete-fee-row-btn" data-row-id="${rowId}">
        <svg viewBox="0 0 24 24" style="width: 14px; height: 14px;"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
      </button>
    </div>
  `
  );

  const row = el(rowId);
  row.querySelector<HTMLInputElement>(".delete-fee-row-btn")!.addEventListener("click", () => {
    const hasContent =
      row.querySelector<HTMLInputElement>(".fee-desc-input")!.value.trim() !== "" ||
      (parseFloat(row.querySelector<HTMLInputElement>(".fee-amount-input")!.value) || 0) > 0;
    if (hasContent && !confirm("Retirer ces frais de la réservation ?")) return;
    row.remove();
    updateSubmissionFinancialSummary();
    autoSaveActivityForm();
  });

  row.querySelectorAll<HTMLInputElement>(".fee-desc-input, .fee-amount-input")!.forEach(el => {
    el.addEventListener("input", debounce(updateSubmissionFinancialSummary, 250));
    el.addEventListener("change", updateSubmissionFinancialSummary);
  });
  rejectNegativeAmountOnBlur(row.querySelector<HTMLInputElement>(".fee-amount-input")!);
}

// Salary id of the default "Directeur technique" entry seeded in config-defaults.ts. Activating
// any "service technique" (Microphone, éclairage, etc.) on a reservation requires a technical
// director on site, so we auto-add one to "Personnel requis" the first time such a service is
// toggled on for that room.
export const TECHNICAL_DIRECTOR_SALARY_ID = "salary-dt";

export function autoAddTechnicalDirectorIfNeeded(staffList: HTMLElement) {
  const salaryExists = (appState.settings.salaries || []).some(s => s.id === TECHNICAL_DIRECTOR_SALARY_ID);
  if (!salaryExists) return;

  const alreadyPresent = Array.from(staffList.querySelectorAll<HTMLSelectElement>(".staff-salary-select")).some(
    sel => sel.value === TECHNICAL_DIRECTOR_SALARY_ID
  );
  if (alreadyPresent) return;

  addStaffRow(staffList, TECHNICAL_DIRECTOR_SALARY_ID, "", 0, 0, true);
}

export function autoAddLinkedStaffAndFees(card: HTMLElement, roomName: string) {
  const room = appState.settings.rooms.find((r: any) => r.name === roomName);
  if (!room) return;

  const staffList = card.querySelector<HTMLInputElement>(".room-staff-list")!;
  (room.linked_staff || []).forEach((s: any) => {
    const numToCreate = typeof s.count === "number" ? s.count : 1;
    for (let i = 0; i < numToCreate; i++) {
      addStaffRow(staffList, s.salary_id, "", 0, 0, true);
    }
  });

  const feesList = card.querySelector<HTMLInputElement>(".room-fees-list")!;
  (room.linked_fees || []).forEach((f: any) => addFeeRow(feesList, f.description, f.amount, true));
}

// Rows dropped by collectStaffFromForm/collectServicesFromForm/collectFeesFromForm because they're
// missing their identifier (salary/service/description) but otherwise had data entered (hours,
// count, rate...) would previously disappear silently on save. resetIncompleteRowWarnings() is
// called once per form collection (see collectReservationsFromForm in reservations.ts) so callers
// can warn the user instead.
let incompleteRowWarnings: string[] = [];

export function resetIncompleteRowWarnings() {
  incompleteRowWarnings = [];
}

export function getIncompleteRowWarnings() {
  return incompleteRowWarnings;
}

export function pushIncompleteRowWarning(message: string) {
  incompleteRowWarnings.push(message);
}

export function collectStaffFromForm(card: HTMLElement) {
  const rows = Array.from(card.querySelectorAll<HTMLInputElement>(".room-staff-list .distribution-row")!).map(row => {
    const wrapper = row.closest(".distribution-row-wrapper");
    const useCustomRate = row.querySelector<HTMLInputElement>(".staff-use-custom-rate")?.checked || false;
    const { hours, overtimeHours } = getStaffRowHours(row);
    return {
      id: row.dataset.id || generateUid("staff"),
      salary_id: row.querySelector<HTMLInputElement>(".staff-salary-select")!.value,
      date: row.querySelector<HTMLInputElement>(".staff-date-input")!.value,
      hours: hours,
      overtime_hours: overtimeHours,
      tarif_id: useCustomRate ? "__custom__" : "",
      auto_generated: row.dataset.autoGenerated === "1",
      custom_rate:
        wrapper && useCustomRate ? parseFloat(wrapper.querySelector<HTMLInputElement>(".staff-custom-rate-input")!.value) || 0 : 0,
      custom_overtime_rate:
        wrapper && useCustomRate ? parseFloat(wrapper.querySelector<HTMLInputElement>(".staff-custom-overtime-rate-input")!.value) || 0 : 0,
      start_time: row.querySelector<HTMLInputElement>(".staff-start-time-input")?.value || "",
      end_time: row.querySelector<HTMLInputElement>(".staff-end-time-input")?.value || ""
    };
  });
  const dropped = rows.filter(
    s =>
      !s.salary_id &&
      (s.date || s.hours > 0 || s.overtime_hours > 0 || s.tarif_id === "__custom__" || s.custom_rate > 0 || s.custom_overtime_rate > 0)
  );
  if (dropped.length > 0) {
    incompleteRowWarnings.push(
      `${dropped.length} ligne${dropped.length > 1 ? "s" : ""} de personnel sans poste sélectionné n'${dropped.length > 1 ? "ont" : "a"} pas été enregistrée${dropped.length > 1 ? "s" : ""}.`
    );
  }
  return rows.filter(s => s.salary_id);
}

export function collectServicesFromForm(card: HTMLElement) {
  const rows = Array.from(card.querySelectorAll<HTMLInputElement>(".room-services-list .distribution-row")!).map(row => {
    const wrapper = row.closest(".distribution-row-wrapper");
    return {
      id: row.dataset.id || generateUid("service"),
      service_id: row.querySelector<HTMLInputElement>(".service-select")!.value,
      count: 1,
      hours: parseFloat(row.querySelector<HTMLInputElement>(".service-hours-input")!.value) || 0,
      tarif_id: row.querySelector<HTMLSelectElement>(".service-tarif-select")!.value,
      auto_generated: row.dataset.autoGenerated === "1",
      custom_rate: wrapper ? parseFloat(wrapper.querySelector<HTMLInputElement>(".service-custom-rate-input")!.value) || 0 : 0
    };
  });
  const dropped = rows.filter(s => !s.service_id && (s.hours > 0 || s.tarif_id || s.custom_rate > 0));
  if (dropped.length > 0) {
    incompleteRowWarnings.push(
      `${dropped.length} ligne${dropped.length > 1 ? "s" : ""} de service sans service sélectionné n'${dropped.length > 1 ? "ont" : "a"} pas été enregistrée${dropped.length > 1 ? "s" : ""}.`
    );
  }
  return rows.filter(s => s.service_id);
}

export function collectFeesFromForm(card: HTMLElement) {
  const rows = Array.from(card.querySelectorAll<HTMLInputElement>(".room-fees-list .distribution-row")!).map(row => ({
    id: row.dataset.id || generateUid("fee"),
    description: row.querySelector<HTMLInputElement>(".fee-desc-input")!.value.trim(),
    amount: parseFloat(row.querySelector<HTMLInputElement>(".fee-amount-input")!.value) || 0,
    auto_generated: row.dataset.autoGenerated === "1"
  }));
  const dropped = rows.filter(f => !f.description && f.amount > 0);
  if (dropped.length > 0) {
    incompleteRowWarnings.push(
      `${dropped.length} frais sans description n'${dropped.length > 1 ? "ont" : "a"} pas été enregistré${dropped.length > 1 ? "s" : ""}.`
    );
  }
  return rows.filter(f => f.description);
}

export const PROJECTOR_SERVICE_ID = "service-location-projecteur";

export function autoAddProjectorIfNeeded(servicesList: HTMLElement) {
  const serviceExists = (appState.settings.services || []).some(s => s.id === PROJECTOR_SERVICE_ID);
  if (!serviceExists) return;

  const alreadyPresent = Array.from(servicesList.querySelectorAll<HTMLSelectElement>(".service-select")).some(
    sel => sel.value === PROJECTOR_SERVICE_ID
  );
  if (alreadyPresent) return;

  addServiceRow(servicesList, PROJECTOR_SERVICE_ID, 0, "", true);
}

export function autoRemoveProjectorIfNeeded(servicesList: HTMLElement) {
  const rows = Array.from(servicesList.querySelectorAll<HTMLElement>(".distribution-row-wrapper"));
  for (const row of rows) {
    const select = row.querySelector<HTMLSelectElement>(".service-select");
    if (select && select.value === PROJECTOR_SERVICE_ID && row.dataset.autoGenerated === "1") {
      row.remove();
      break;
    }
  }
}
