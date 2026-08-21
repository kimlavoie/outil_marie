/**
 * activities-form.ts - Activity drawer form wiring: modal/drawer lifecycle,
 * file link tabs, planning tab, and drawer field population.
 * Part 2/5 of the activities module (see activities-render.ts for context).
 *
 * The activity drawer/form itself isn't yet React (that's Réservations, the last Phase 4 step —
 * addReservationCard/addSlotRow live there and this file calls into them), so like
 * js/datepicker.ts, js/activities-file-links.ts, js/activities-history.ts,
 * js/activities-financials.ts and js/activities-render.ts, this stays a plain TS module.
 *
 * New activity creation, the mode toggle/tabs/state bar, the planning tab and the billing tab
 * each live in their own module (new-activity-modal.ts, form-state-bar.ts, planning-tab.ts,
 * billing-tab.ts); this file keeps the top-level drawer event wiring and field population, and
 * re-exports the others' public API so existing imports from "./form.ts" keep working.
 */
import { appState } from "../state/state.ts";
import { debounce, generateUid, maskPhoneInput, initMultiSelectDropdown, maskPostalCodeInput, formatPostalCode } from "../utils/utils.ts";
import { activitiesState, renderActivities, initBulkActionsHandlers } from "./render.ts";
import {
  openActivityDrawer,
  autoSaveActivityForm,
  cancelActivityDrawer,
  addDistributionRow,
  addBarRevenueRow,
  showAutoSaveStatus,
  updateSubmissionFinancialSummary,
  openTaxOverrideModal
} from "./financials.ts";
import { undoActivityFormChange, redoActivityFormChange, loadAndRenderActivityHistory, updateFormDatesHelper } from "./history/index.ts";
import { submitActivityForm } from "./history/index.ts";
import { renderFileLinkStatus } from "./file-links/index.ts";
import { renderSupportingDocsStatus } from "./supporting-docs/index.ts";
import { addReservationCard, addSlotRow, initReservationsSection } from "./reservations/index.ts";

import {
  initNewActivityModal,
  openNewActivityModal,
  closeNewActivityModal,
  createActivity,
  createDraftActivity,
  duplicateActivityAndOpen
} from "./new-activity-modal.ts";
import {
  applyActivityFormMode,
  getActivityFormMode,
  initActivityModeToggle,
  switchActivityTab,
  renderActivityStateBar,
  updateFormTabIndicators,
  commitActivityPatch
} from "./form-state-bar.ts";
import { renderPlanningTab, generatePlanningTasks, addPlanningTaskRow } from "./planning-tab.ts";
import { generateBillingLines, renderBillingStateStatus, updateBarRevenueSectionVisibility } from "./billing-tab.ts";

// Typed shorthand for document.getElementById returning element or null safely
function el<T extends Element = HTMLInputElement>(id: string): T | null {
  return (document.getElementById(id) as unknown as T) || null;
}

function initFormHandlers() {
  initBulkActionsHandlers();
  const backdrop = document.getElementById("drawer-backdrop");
  const drawer = document.getElementById("activity-drawer");

  document.addEventListener("click", e => {
    const target = e.target as HTMLElement;
    if (target.closest("#add-activity-btn-quick") || target.closest("#add-activity-btn")) {
      openNewActivityModal("soumission");
    } else if (target.closest("#add-estimation-btn-quick") || target.closest("#add-estimation-btn")) {
      openActivityDrawer(createDraftActivity(""));
    } else if (target.closest("#open-calendar-btn")) {
      import("../components/calendar-view.tsx").then(m => m.openCalendarModal());
    }
  });

  document.getElementById("activity-drawer-close")?.addEventListener("click", cancelActivityDrawer);
  backdrop?.addEventListener("click", cancelActivityDrawer);

  document.getElementById("accordion-section-financial-summary")?.addEventListener("click", e => {
    const target = e.target as HTMLElement;

    const pillBtn = target.closest("#activity-non-taxable-toggle .pill-toggle");
    if (pillBtn) {
      const id = el("form-activity-internal-id")?.value;
      if (!id) return;
      const active = !pillBtn.classList.contains("active");
      commitActivityPatch(id, (a: any) => {
        a.non_taxable = active;
      });
      updateSubmissionFinancialSummary();
      return;
    }

    if (target.closest("#adjust-taxes-link")) {
      const id = el("form-activity-internal-id")?.value;
      if (id) openTaxOverrideModal(id);
    }
  });

  // Undo/Redo (Ctrl+Z / Ctrl+Y, or Ctrl+Shift+Z for redo) while the activity drawer is open
  document.addEventListener("keydown", e => {
    if (!drawer?.classList.contains("active")) return;
    const ctrlOrCmd = e.ctrlKey || e.metaKey;
    if (!ctrlOrCmd) return;

    if (e.key === "z" || e.key === "Z") {
      e.preventDefault();
      if (e.shiftKey) redoActivityFormChange();
      else undoActivityFormChange();
    } else if (e.key === "y" || e.key === "Y") {
      e.preventDefault();
      redoActivityFormChange();
    }
  });

  // Activity record tabs (Soumission et contrat / Planification / Facturation / Historique)
  document.querySelectorAll(".activity-tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const tabName = btn.getAttribute("data-activity-tab") || "";
      switchActivityTab(tabName);
      if (tabName === "history") {
        const id = el("form-activity-internal-id")?.value;
        if (id) {
          loadAndRenderActivityHistory(id);
        }
      }
      if (tabName === "billing") {
        updateBarRevenueSectionVisibility();
      }
      if (tabName === "supporting-docs") {
        const id = el("form-activity-internal-id")?.value;
        const act = appState.activities.find((a: any) => a.id === id);
        if (act) renderSupportingDocsStatus(act);
      }
    });
  });

  // Re-list linked docs on window focus
  window.addEventListener("focus", () => {
    if (!drawer?.classList.contains("active")) return;
    const docsTab = el("activity-tab-panel-supporting-docs");
    if (!docsTab || !docsTab.classList.contains("active")) return;
    const id = el("form-activity-internal-id")?.value;
    const act = appState.activities.find((a: any) => a.id === id);
    if (act) renderSupportingDocsStatus(act);
  });

  // Back to calendar button
  document.getElementById("activity-drawer-back-to-calendar-btn")?.addEventListener("click", () => {
    const calendarReturn = activitiesState.calendarReturn;
    cancelActivityDrawer();
    if (calendarReturn) import("../components/calendar-view.tsx").then(m => m.reopenCalendarModal(calendarReturn as any));
  });

  initActivitiesViewHandlers();

  // Account distributions buttons
  el("form-add-distribution-btn")?.addEventListener("click", () => {
    addDistributionRow("", 0);
    autoSaveActivityForm();
  });

  // Bar revenue buttons
  const addBarRevenueBtn = document.getElementById("form-add-bar-revenue-btn");
  if (addBarRevenueBtn) {
    addBarRevenueBtn.addEventListener("click", () => {
      addBarRevenueRow("", 0, "", "");
      autoSaveActivityForm();
    });
  }

  // Submit Button
  const submitBtn = el("activity-drawer-submit");
  if (submitBtn) {
    submitBtn.addEventListener("click", submitActivityForm);
  }

  // Auto-save form-level inputs and changes
  const activityForm = el("activity-form");
  if (activityForm) {
    activityForm.addEventListener("input", () => {
      showAutoSaveStatus("saving");
    });
    activityForm.addEventListener("input", debounce(autoSaveActivityForm, 500));
    activityForm.addEventListener("change", () => {
      showAutoSaveStatus("saving");
      autoSaveActivityForm();
    });
  }

  // Dates helper updates
  const reservationsContainer = el("form-activity-reservations");
  if (reservationsContainer) {
    reservationsContainer.addEventListener("input", () => {
      updateFormDatesHelper();
      updateSubmissionFinancialSummary();
      updateBarRevenueSectionVisibility();
    });
    reservationsContainer.addEventListener("change", () => {
      updateFormDatesHelper();
      updateSubmissionFinancialSummary();
      updateBarRevenueSectionVisibility();
    });
  }

  // Planification tab buttons
  el("generate-planning-tasks-btn")?.addEventListener("click", () => {
    const id = el("form-activity-internal-id")?.value;
    const act = appState.activities.find(a => a.id === id);
    if (act) generatePlanningTasks(act);
  });
  el("add-planning-task-btn")?.addEventListener("click", () => {
    addPlanningTaskRow({ id: generateUid("task"), description: "", done: false, auto_generated: false });
  });

  // Facturation tab button
  el("generate-billing-lines-btn")?.addEventListener("click", () => {
    const id = el("form-activity-internal-id")?.value;
    const act = appState.activities.find(a => a.id === id) || { id, distributions: [] };
    generateBillingLines(act);
  });

  // Phone and Postal code masks
  const managerPhone = el("form-activity-manager-phone");
  if (managerPhone) maskPhoneInput(managerPhone);

  const managerPostalCode = el("form-activity-manager-postal-code");
  if (managerPostalCode) maskPostalCodeInput(managerPostalCode);

  const respPostalCode = el("form-activity-responsable-postal-code");
  if (respPostalCode) maskPostalCodeInput(respPostalCode);

  // Manager "Fonction" = Externe reveals company/address fields
  el("form-activity-manager-type")?.addEventListener("change", e => {
    const externalGroup = el("form-activity-manager-external-group");
    if (externalGroup) externalGroup.style.display = (e.target as HTMLInputElement).value === "externe" ? "block" : "none";
    const sameCb = document.getElementById("form-activity-responsable-same-as-manager") as HTMLInputElement | null;
    applyResponsableSameAsManager(!!sameCb?.checked);
  });

  // Client type change toggles Département vs Adresse fields
  const clientTypeEl = document.getElementById("form-activity-client-type");
  if (clientTypeEl) {
    clientTypeEl.addEventListener("change", () => {
      updateResponsableClientTypeDisplay();
      const sameCb = document.getElementById("form-activity-responsable-same-as-manager") as HTMLInputElement | null;
      if (sameCb?.checked) applyResponsableSameAsManager(true);
    });
  }

  const responsableSameCb = document.getElementById("form-activity-responsable-same-as-manager") as HTMLInputElement | null;
  if (responsableSameCb) {
    responsableSameCb.addEventListener("change", e => {
      applyResponsableSameAsManager((e.target as HTMLInputElement).checked);
    });
  }
  [
    "form-activity-manager-firstname",
    "form-activity-manager-lastname",
    "form-activity-manager-address",
    "form-activity-manager-city",
    "form-activity-manager-province",
    "form-activity-manager-postal-code"
  ].forEach(id => {
    const input = document.getElementById(id);
    if (input) {
      input.addEventListener("input", () => {
        const sameCb = document.getElementById("form-activity-responsable-same-as-manager") as HTMLInputElement | null;
        if (sameCb?.checked) applyResponsableSameAsManager(true);
      });
    }
  });

  // Estimation / Soumission mode toggle
  initActivityModeToggle();

  // "+ Ajouter une réservation" button
  initReservationsSection();

  // Event type "Autre" reveals a free-text field
  el("form-activity-event-type")?.addEventListener("change", e => {
    const otherGroup = el("form-activity-event-type-other-group");
    if (otherGroup) otherGroup.style.display = (e.target as HTMLInputElement).value === "autre" ? "flex" : "none";
  });

  // Keyboard Shortcuts: Navigation, Add, and Escape
  window.addEventListener("keydown", e => {
    if (e.altKey && e.key >= "1" && e.key <= "6") {
      e.preventDefault();
      const views = ["dashboard", "activities", "validation", "account-report", "settings", "backup"];
      const targetView = views[parseInt(e.key) - 1];
      if (targetView) {
        const navBtn = document.querySelector<HTMLButtonElement>(`.nav-item[data-view="${targetView}"] button`);
        if (navBtn) navBtn.click();
      }
    }

    if (e.altKey && (e.key.toLowerCase() === "n" || e.key.toLowerCase() === "a")) {
      e.preventDefault();
      openNewActivityModal();
    }

    if (e.altKey && e.key.toLowerCase() === "e") {
      e.preventDefault();
      openActivityDrawer(createDraftActivity(""));
    }

    if (e.key === "Escape") {
      if (document.querySelector(".pdf-custom-viewer.pdf-fullscreen-mode")) {
        return;
      }
      cancelActivityDrawer();
      closeNewActivityModal();
      import("../components/settings/mount.ts").then(m => m.closeAllSettingsModals());
    }
  });
}

function updateResponsableClientTypeDisplay() {
  const clientTypeSelect = document.getElementById("form-activity-client-type") as HTMLSelectElement | null;
  const clientType = clientTypeSelect ? clientTypeSelect.value : "";
  const deptGroup = document.getElementById("form-activity-dept-group");
  const extGroup = document.getElementById("form-activity-responsable-external-group");
  if (deptGroup) deptGroup.style.display = clientType === "externe" ? "none" : "block";
  if (extGroup) extGroup.style.display = clientType === "externe" ? "block" : "none";
}

function applyResponsableSameAsManager(checked: boolean) {
  const firstNameEl = el("form-activity-responsable-firstname");
  const lastNameEl = el("form-activity-responsable-lastname");
  if (firstNameEl) {
    firstNameEl.readOnly = checked;
    firstNameEl.classList.toggle("form-input-readonly", checked);
    if (checked) firstNameEl.value = el("form-activity-manager-firstname")?.value || "";
  }
  if (lastNameEl) {
    lastNameEl.readOnly = checked;
    lastNameEl.classList.toggle("form-input-readonly", checked);
    if (checked) lastNameEl.value = el("form-activity-manager-lastname")?.value || "";
  }

  const managerTypeEl = document.getElementById("form-activity-manager-type") as HTMLSelectElement | null;
  const clientTypeEl = document.getElementById("form-activity-client-type") as HTMLSelectElement | null;
  if (clientTypeEl) {
    const isManagerExternal = managerTypeEl?.value === "externe";
    const lockExternalClient = checked && isManagerExternal;
    if (lockExternalClient) {
      if (clientTypeEl.value !== "externe") {
        clientTypeEl.value = "externe";
        updateResponsableClientTypeDisplay();
        updateSubmissionFinancialSummary();
      }
    }
    clientTypeEl.disabled = lockExternalClient;
    clientTypeEl.classList.toggle("form-input-readonly", lockExternalClient);
  }

  const addressEl = document.getElementById("form-activity-responsable-address") as HTMLInputElement | null;
  const cityEl = document.getElementById("form-activity-responsable-city") as HTMLInputElement | null;
  const provinceEl = document.getElementById("form-activity-responsable-province") as HTMLInputElement | null;
  const postalCodeEl = document.getElementById("form-activity-responsable-postal-code") as HTMLInputElement | null;
  if (addressEl && cityEl && provinceEl && postalCodeEl) {
    addressEl.readOnly = checked;
    cityEl.readOnly = checked;
    provinceEl.readOnly = checked;
    postalCodeEl.readOnly = checked;
    addressEl.classList.toggle("form-input-readonly", checked);
    cityEl.classList.toggle("form-input-readonly", checked);
    provinceEl.classList.toggle("form-input-readonly", checked);
    postalCodeEl.classList.toggle("form-input-readonly", checked);
    if (checked) {
      addressEl.value = el("form-activity-manager-address")?.value || "";
      cityEl.value = el("form-activity-manager-city")?.value || "";
      provinceEl.value = el("form-activity-manager-province")?.value || "";
      postalCodeEl.value = el("form-activity-manager-postal-code")?.value || "";
    }
  }
}

function fillActivityFormFields(act: any) {
  applyActivityFormMode(act.mode || "estimation", act.state !== "brouillon");
  const cubaEl = el("form-activity-coba");
  if (cubaEl) cubaEl.value = act.coba || "";
  const nameEl = el("form-activity-name");
  if (nameEl) nameEl.value = act.name;
  const attendeesEl = el("form-activity-attendees");
  if (attendeesEl) attendeesEl.value = act.attendees_count || "";
  const respFnEl = el("form-activity-responsable-firstname");
  if (respFnEl) respFnEl.value = act.responsable_first_name || "";
  const respLnEl = el("form-activity-responsable-lastname");
  if (respLnEl) respLnEl.value = act.responsable_last_name || "";
  const clientTypeEl = el("form-activity-client-type");
  if (clientTypeEl) clientTypeEl.value = act.client_type;

  const respAddrEl = document.getElementById("form-activity-responsable-address") as HTMLInputElement | null;
  const respCityEl = document.getElementById("form-activity-responsable-city") as HTMLInputElement | null;
  const respProvEl = document.getElementById("form-activity-responsable-province") as HTMLInputElement | null;
  const respPcEl = document.getElementById("form-activity-responsable-postal-code") as HTMLInputElement | null;
  if (respAddrEl) respAddrEl.value = act.responsable_address || "";
  if (respCityEl) respCityEl.value = act.responsable_city || "";
  if (respProvEl) respProvEl.value = act.responsable_province || "";
  if (respPcEl) respPcEl.value = formatPostalCode(act.responsable_postal_code || "");

  updateResponsableClientTypeDisplay();

  const descEl = el("form-activity-description");
  if (descEl) descEl.value = act.description || "";
  const notesEl = el("form-activity-notes");
  if (notesEl) notesEl.value = act.notes || "";
  const mgrFnEl = el("form-activity-manager-firstname");
  if (mgrFnEl) mgrFnEl.value = act.activity_manager?.first_name || "";
  const mgrLnEl = el("form-activity-manager-lastname");
  if (mgrLnEl) mgrLnEl.value = act.activity_manager?.last_name || "";
  const mgrTypeEl = el("form-activity-manager-type");
  if (mgrTypeEl) mgrTypeEl.value = act.activity_manager?.type || "employe";
  const mgrPhoneEl = el("form-activity-manager-phone");
  if (mgrPhoneEl) mgrPhoneEl.value = act.activity_manager?.phone || "";
  const mgrEmailEl = el("form-activity-manager-email");
  if (mgrEmailEl) mgrEmailEl.value = act.activity_manager?.email || "";
  const mgrCompanyEl = el("form-activity-manager-company");
  if (mgrCompanyEl) mgrCompanyEl.value = act.activity_manager?.company_name || "";
  const mgrClientNumEl = el("form-activity-manager-coba-client-number");
  if (mgrClientNumEl) mgrClientNumEl.value = act.activity_manager?.coba_client_number || "";
  const mgrAddrEl = el("form-activity-manager-address");
  if (mgrAddrEl) mgrAddrEl.value = act.activity_manager?.address || "";
  const mgrCityEl = el("form-activity-manager-city");
  if (mgrCityEl) mgrCityEl.value = act.activity_manager?.city || "";
  const mgrProvEl = el("form-activity-manager-province");
  if (mgrProvEl) mgrProvEl.value = act.activity_manager?.province || "";
  const mgrPcEl = el("form-activity-manager-postal-code");
  if (mgrPcEl) mgrPcEl.value = formatPostalCode(act.activity_manager?.postal_code || "");
  const mgrExtGrp = el("form-activity-manager-external-group");
  if (mgrExtGrp) mgrExtGrp.style.display = act.activity_manager?.type === "externe" ? "block" : "none";
  const sameCbEl = el("form-activity-responsable-same-as-manager");
  if (sameCbEl) sameCbEl.checked = !!act.responsable_same_as_manager;

  applyResponsableSameAsManager(!!act.responsable_same_as_manager);
  const resContainer = el("form-activity-reservations");
  if (resContainer) {
    resContainer.innerHTML = "";
    (act.reservations || []).forEach((r: any) => addReservationCard(r));
    if ((act.reservations || []).length === 0) {
      const card = addReservationCard();
      if (card) {
        const slotsList = card.querySelector(".reservation-slots-list");
        if (slotsList) addSlotRow(slotsList as HTMLElement);
      }
    }
  }
  updateFormDatesHelper();
  const deptEl = el("form-activity-dept");
  if (deptEl) deptEl.value = act.department;
  const evtTypeEl = el("form-activity-event-type");
  if (evtTypeEl) evtTypeEl.value = act.event_type || "";
  const evtOtherEl = el("form-activity-event-type-other");
  if (evtOtherEl) evtOtherEl.value = act.event_type_other || "";
  const evtOtherGrp = el("form-activity-event-type-other-group");
  if (evtOtherGrp) evtOtherGrp.style.display = act.event_type === "autre" ? "flex" : "none";

  // Load distributions
  (act.distributions || []).forEach((d: any) => {
    addDistributionRow(d.account_code, d.amount, d.reference, d.details, d.auto_generated);
  });

  renderFileLinkStatus("form", act);
  renderSupportingDocsStatus(act);
  renderFileLinkStatus("submission", act);
  renderFileLinkStatus("contract", act);
  updateSubmissionFinancialSummary();
  renderPlanningTab(act);
  renderBillingStateStatus(act);
  const barRevenueListEl = document.getElementById("form-bar-revenue-list");
  if (barRevenueListEl) {
    barRevenueListEl.innerHTML = "";
    const lines = act.bar_revenue_lines || [];
    if (lines.length > 0) {
      lines.forEach((line: any) => {
        addBarRevenueRow(line.account_code, line.amount, line.receipt_number, line.payment_method);
      });
    } else if (typeof act.bar_revenue === "number" && act.bar_revenue > 0) {
      addBarRevenueRow("", act.bar_revenue, "", "");
    } else {
      addBarRevenueRow("", 0, "", "");
    }
  }
  updateBarRevenueSectionVisibility(act);
}

const WEEKDAY_PILL_OPTIONS = [
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mer" },
  { value: 4, label: "Jeu" },
  { value: 5, label: "Ven" },
  { value: 6, label: "Sam" },
  { value: 0, label: "Dim" }
];

function initActivitiesViewHandlers() {
  const resetActivitiesPageAndRender = () => {
    activitiesState.page = 1;
    activitiesState.selectedIds.clear();
    renderActivities();
  };

  const searchInput = el("activity-search");
  if (searchInput) {
    searchInput.oninput = debounce(resetActivitiesPageAndRender, 250);
  }
  initMultiSelectDropdown("filter-salle-btn", "filter-salle-panel", resetActivitiesPageAndRender);
  initMultiSelectDropdown("filter-client-type-btn", "filter-client-type-panel", resetActivitiesPageAndRender);
  initMultiSelectDropdown("filter-status-btn", "filter-status-panel", resetActivitiesPageAndRender);

  const resetFiltersBtn = document.getElementById("reset-filters-btn");
  if (resetFiltersBtn) {
    resetFiltersBtn.onclick = () => {
      const searchInput = el("activity-search");
      if (searchInput) searchInput.value = "";

      const panels = ["filter-salle-panel", "filter-client-type-panel", "filter-status-panel"];
      panels.forEach(panelId => {
        const panel = document.getElementById(panelId);
        if (panel) {
          panel.querySelectorAll<HTMLInputElement>("input[type=checkbox]").forEach(cb => {
            cb.checked = false;
          });
          const btn = document.getElementById(panelId.replace(/-panel$/, "-btn"));
          if (btn) {
            btn.textContent = btn.dataset.defaultLabel || "";
            btn.classList.remove("filter-active");
          }
        }
      });

      resetActivitiesPageAndRender();
    };
  }
}

export { initFormHandlers, initActivitiesViewHandlers, fillActivityFormFields, WEEKDAY_PILL_OPTIONS };
export { initNewActivityModal, createActivity, createDraftActivity, duplicateActivityAndOpen };
export { getActivityFormMode, switchActivityTab, renderActivityStateBar, commitActivityPatch, updateFormTabIndicators };
