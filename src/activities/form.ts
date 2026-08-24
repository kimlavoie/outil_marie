/**
 * activities-form.ts - Activity drawer form wiring: modal/drawer lifecycle,
 * file link tabs, planning tab, and drawer field population.
 * Part 2/5 of the activities module (see activities-render.ts for context).
 *
 * The activity drawer/form itself isn't yet React (React migration in progress — see
 * components/activities/ActivityDrawer.tsx for the fields already converted: Responsable,
 * Informations générales, and the reservation-card shell/add/remove), so like
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

let lastFormEl: HTMLElement | null = null;

function initFormHandlers() {
  const currentFormEl = document.getElementById("activity-form");
  if (lastFormEl && lastFormEl === currentFormEl) return;
  lastFormEl = currentFormEl;

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
  // form-activity-responsable-postal-code is NOT masked here: it's a React-controlled input now
  // (see components/activities/ActivityDrawer.tsx), which formats it inline in its own onChange.

  // Manager "Fonction" = Externe reveals company/address fields. The "same as manager" client-type
  // lock this used to also trigger here (applyResponsableSameAsManager) is now handled reactively
  // in ActivityDrawer.tsx, which mirrors this field's value into React state for that purpose.
  el("form-activity-manager-type")?.addEventListener("change", e => {
    const externalGroup = el("form-activity-manager-external-group");
    if (externalGroup) externalGroup.style.display = (e.target as HTMLInputElement).value === "externe" ? "block" : "none";
  });

  // Estimation / Soumission mode toggle
  initActivityModeToggle();

  // "+ Ajouter une réservation" button is wired directly in ActivityDrawer.tsx now (React
  // onClick driving reservationCardIds state) — see reservations/index.ts's header comment.

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

// updateResponsableClientTypeDisplay() and applyResponsableSameAsManager() used to live here.
// Both are gone: the fields they drove (Responsable firstname/lastname/address/city/province/
// postal-code, client type, and the dept-vs-external-address group visibility) are now
// React-controlled state in components/activities/ActivityDrawer.tsx, which owns their initial
// population, their "same as manager" copy-and-lock behavior, and their visibility — see that
// file's state/effects around responsableSameAsManager/clientType/lockExternalClient.

function fillActivityFormFields(act: any) {
  applyActivityFormMode(act.mode || "estimation", act.state !== "brouillon");
  // COBA/name/attendees/description ("Informations générales") and Responsable firstname/
  // lastname/client-type/address/city/province/postal-code are no longer populated here —
  // ActivityDrawer.tsx seeds its own React state for them from `act` directly (see its "Seed the
  // React-controlled Informations générales fields" / "...Responsable fields" effects).
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
  // form-activity-responsable-same-as-manager is React-controlled now (ActivityDrawer.tsx seeds
  // it from act.responsable_same_as_manager directly) — nothing to do here.

  // Reservation cards are no longer built/emptied here — ActivityDrawer.tsx's
  // reservationCardIds React state owns which cards exist, seeded from act.reservations (or one
  // blank card with one blank créneau when there are none) in its own effect.
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
