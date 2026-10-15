/**
 * activities-form.ts - Activity drawer form wiring: modal/drawer lifecycle,
 * file link tabs, planning tab, and drawer field population.
 * Part 2/5 of the activities module (see activities-render.ts for context).
 *
 * The activity drawer/form itself isn't yet React (React migration in progress — see
 * components/activities/ActivityDrawer.tsx for the fields already converted: Responsable de
 * l'activité (manager), Responsable de la facturation, Informations générales, and the
 * reservation-card shell/add/remove), so like
 * js/datepicker.ts, js/activities-file-links.ts, js/activities-history.ts,
 * js/activities-financials.ts and js/activities-render.ts, this stays a plain TS module.
 *
 * New activity creation, the mode toggle/tabs/state bar, the planning tab and the billing tab
 * each live in their own module (new-activity-modal.ts, form-state-bar.ts, planning-tab.ts,
 * billing-tab.ts); this file keeps the top-level drawer event wiring and field population, and
 * re-exports the others' public API so existing imports from "./form.ts" keep working.
 */
import { getActivityById } from "../state/activities-repository.ts";
import { debounce, generateUid, initMultiSelectDropdown } from "../utils/utils.ts";
import { activitiesState, renderActivities, initBulkActionsHandlers } from "./render.ts";
import {
  openActivityDrawer,
  autoSaveActivityForm,
  cancelActivityDrawer,
  addDistributionRow,
  addBarRevenueRow,
  showAutoSaveStatus,
  updateSubmissionFinancialSummary,
  openTaxOverrideModal,
  closeActivityDetailsModal
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
        const act = id ? getActivityById(id) : undefined;
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
    const act = id ? getActivityById(id) : undefined;
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

  // Discreet manual override to show the "Revenus du bar" section for activities that don't have
  // a "Service d'hôtesses" bar service (the section's normal, automatic trigger)
  const enableBarRevenueBtn = document.getElementById("enable-bar-revenue-btn");
  if (enableBarRevenueBtn) {
    enableBarRevenueBtn.addEventListener("click", () => {
      const id = el("form-activity-internal-id")?.value;
      if (!id) return;
      commitActivityPatch(id, (a: any) => {
        a.bar_revenue_manually_enabled = true;
      });
      const updated = id ? getActivityById(id) : undefined;
      updateBarRevenueSectionVisibility(updated);
    });
  }

  // Undoes the manual override above — only offered while it's the sole reason the section is
  // showing (see updateBarRevenueSectionVisibility), so there's always a way back after an
  // accidental click. Clears any lines already entered so they don't linger, hidden, in the saved
  // activity.
  const disableBarRevenueBtn = document.getElementById("disable-bar-revenue-btn");
  if (disableBarRevenueBtn) {
    disableBarRevenueBtn.addEventListener("click", () => {
      const id = el("form-activity-internal-id")?.value;
      if (!id) return;

      const hasContent = Array.from(document.querySelectorAll<HTMLElement>("#form-bar-revenue-list .bar-revenue-row")).some(row => {
        const amt = parseFloat(row.querySelector<HTMLInputElement>(".bar-amount-input")?.value || "") || 0;
        const acc = row.querySelector<HTMLInputElement>(".bar-account-select-wrapper .searchable-select-value")?.value || "";
        const receipt = row.querySelector<HTMLInputElement>(".bar-receipt-input")?.value.trim() || "";
        const pay = row.querySelector<HTMLSelectElement>(".bar-payment-method-select")?.value || "";
        return amt > 0 || !!acc || !!receipt || !!pay;
      });
      if (hasContent && !confirm("Des revenus de bar ont été saisis. Retirer la section et effacer ces lignes ?")) return;

      const list = el("form-bar-revenue-list");
      if (list) list.innerHTML = "";
      addBarRevenueRow("", 0, "", "");

      commitActivityPatch(id, (a: any) => {
        a.bar_revenue_manually_enabled = false;
        a.bar_revenue_lines = [];
        a.bar_revenue = 0;
      });
      const updated = id ? getActivityById(id) : undefined;
      updateBarRevenueSectionVisibility(updated);
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
    const act = id ? getActivityById(id) : undefined;
    if (act) generatePlanningTasks(act);
  });
  el("add-planning-task-btn")?.addEventListener("click", () => {
    addPlanningTaskRow({ id: generateUid("task"), description: "", done: false, auto_generated: false });
  });

  // Facturation tab button
  el("generate-billing-lines-btn")?.addEventListener("click", () => {
    const id = el("form-activity-internal-id")?.value;
    const act = (id ? getActivityById(id) : undefined) || { id, distributions: [] };
    generateBillingLines(act);
  });

  // form-activity-responsable-postal-code and form-activity-manager-* fields are NOT masked here:
  // they're React-controlled inputs now (see components/activities/ActivityDrawer.tsx), which
  // format/toggle themselves inline in their own onChange handlers and state.

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
      closeActivityDetailsModal();
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
  // COBA/name/attendees/description ("Informations générales"), Responsable firstname/lastname/
  // client-type/address/city/province/postal-code, and activity_manager's firstname/lastname/
  // type/phone/email/company/coba-client-number/address/city/province/postal-code are no longer
  // populated here — ActivityDrawer.tsx seeds its own React state for them from `act` directly
  // (see its "Seed the React-controlled Responsable fields" / "...Manager fields" effects).
  const notesEl = el("form-activity-notes");
  if (notesEl) notesEl.value = act.notes || "";
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

export { initFormHandlers, fillActivityFormFields, WEEKDAY_PILL_OPTIONS };
export { initNewActivityModal, createActivity, createDraftActivity, duplicateActivityAndOpen };
export { getActivityFormMode, switchActivityTab, renderActivityStateBar, commitActivityPatch, updateFormTabIndicators };
