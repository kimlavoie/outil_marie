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
import { debounce, generateUid, maskPhoneInput, initMultiSelectDropdown } from "../utils/utils.ts";
import { activitiesState, renderActivities, initBulkActionsHandlers } from "./render.ts";
import {
  openActivityDrawer,
  autoSaveActivityForm,
  cancelActivityDrawer,
  addDistributionRow,
  showAutoSaveStatus,
  updateSubmissionFinancialSummary,
  openTaxOverrideModal
} from "./financials.ts";
import { undoActivityFormChange, redoActivityFormChange, loadAndRenderActivityHistory, updateFormDatesHelper } from "./history/index.ts";
import { submitActivityForm } from "./history/index.ts";
import { renderFileLinkStatus } from "./file-links/index.ts";
import { renderSupportingDocsStatus } from "./supporting-docs/index.ts";
import { addReservationCard, addSlotRow, initReservationsSection } from "./reservations/index.ts";

import { initNewActivityModal, openNewActivityModal, closeNewActivityModal, createActivity, createDraftActivity, duplicateActivityAndOpen } from "./new-activity-modal.ts";
import { applyActivityFormMode, getActivityFormMode, initActivityModeToggle, switchActivityTab, renderActivityStateBar, updateFormTabIndicators, commitActivityPatch } from "./form-state-bar.ts";
import { renderPlanningTab, generatePlanningTasks, addPlanningTaskRow } from "./planning-tab.ts";
import { generateBillingLines, renderBillingStateStatus } from "./billing-tab.ts";

// Typed shorthand for document.getElementById — see activities-financials.ts's `el` helper doc
// comment for why this cast is needed/safe.
function el<T extends Element = HTMLInputElement>(id: string): T {
  return document.getElementById(id) as unknown as T;
}

function initFormHandlers() {
  initBulkActionsHandlers();
  const backdrop = el("drawer-backdrop");
  const drawer = el("activity-drawer");

  // Open drawers buttons: creating a "soumission" activity only asks for a name first (see
  // initNewActivityModal); "estimation" skips that step and opens the drawer directly on a
  // blank draft, since the drawer's own name field already handles an empty name (see
  // openActivityDrawer()).
  el("add-activity-btn-quick").addEventListener("click", () => openNewActivityModal("soumission"));
  el("add-estimation-btn-quick").addEventListener("click", () => openActivityDrawer(createDraftActivity("")));

  // Close buttons: discard the activity if it was only an in-memory draft (Estimation flow)
  // that was never actually saved via "Enregistrer".
  el("activity-drawer-close").addEventListener("click", cancelActivityDrawer);
  backdrop.addEventListener("click", cancelActivityDrawer);

  // "Non taxable" pill and "Ajuster les taxes..." icon: both render fresh on every
  // updateSubmissionFinancialSummary() call (see financial-summary.ts), so they're wired via
  // delegation on the accordion — which itself is never rebuilt — rather than bound directly.
  el("accordion-section-financial-summary").addEventListener("click", e => {
    const target = e.target as HTMLElement;

    const pillBtn = target.closest("#activity-non-taxable-toggle .pill-toggle");
    if (pillBtn) {
      const id = el("form-activity-internal-id").value;
      if (!id) return;
      const active = !pillBtn.classList.contains("active");
      commitActivityPatch(id, (a: any) => {
        a.non_taxable = active;
      });
      updateSubmissionFinancialSummary();
      return;
    }

    if (target.closest("#adjust-taxes-link")) {
      const id = el("form-activity-internal-id").value;
      if (id) openTaxOverrideModal(id);
    }
  });

  // Undo/Redo (Ctrl+Z / Ctrl+Y, or Ctrl+Shift+Z for redo) while the activity drawer is open
  document.addEventListener("keydown", e => {
    if (!drawer.classList.contains("active")) return;
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
        const id = el("form-activity-internal-id").value;
        if (id) {
          loadAndRenderActivityHistory(id);
        }
      }
    });
  });

  // Back to calendar button (only visible when opened from the calendar view)
  el("activity-drawer-back-to-calendar-btn").addEventListener("click", () => {
    const calendarReturn = activitiesState.calendarReturn;
    cancelActivityDrawer();
    // calendar-view.tsx isn't imported statically: it's a .tsx (JSX) file, and this module needs
    // to stay importable by plain `node --test` (see js/dashboard-view.tsx's/js/settings-view.tsx's
    // same constraint) — Node can't load .tsx. A dynamic import is only ever resolved when this
    // handler actually runs, so it doesn't affect the test suite's static import graph.
    if (calendarReturn) import("../components/calendar-view.tsx").then(m => m.reopenCalendarModal(calendarReturn));
  });

  // Inputs search
  const resetActivitiesPageAndRender = () => {
    activitiesState.page = 1;
    activitiesState.selectedIds.clear();
    renderActivities();
  };
  el("activity-search").addEventListener("input", debounce(resetActivitiesPageAndRender, 250));
  initMultiSelectDropdown("filter-salle-btn", "filter-salle-panel", resetActivitiesPageAndRender);
  initMultiSelectDropdown("filter-client-type-btn", "filter-client-type-panel", resetActivitiesPageAndRender);
  initMultiSelectDropdown("filter-status-btn", "filter-status-panel", resetActivitiesPageAndRender);

  // Reset filters button handler
  const resetFiltersBtn = document.getElementById("reset-filters-btn");
  if (resetFiltersBtn) {
    resetFiltersBtn.addEventListener("click", () => {
      // Clear search query
      el("activity-search").value = "";

      // Uncheck all checkboxes in the multi-select panels
      const panels = ["filter-salle-panel", "filter-client-type-panel", "filter-status-panel"];
      panels.forEach(panelId => {
        const panel = document.getElementById(panelId);
        if (panel) {
          panel.querySelectorAll<HTMLInputElement>("input[type=checkbox]").forEach(cb => {
            cb.checked = false;
          });
          // Update the label on the dropdown button to its default
          const btn = document.getElementById(panelId.replace(/-panel$/, "-btn"));
          if (btn) {
            btn.textContent = btn.dataset.defaultLabel || "";
            btn.classList.remove("filter-active");
          }
        }
      });

      // Re-render
      resetActivitiesPageAndRender();
    });
  }

  // Account distributions buttons
  el("form-add-distribution-btn").addEventListener("click", () => {
    addDistributionRow("", 0);
    autoSaveActivityForm();
  });

  // Submit Button (only for draft activities/estimations)
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

  // Dates helper updates: recompute whenever any créneau's date/time changes. The actual
  // autosave isn't triggered here — #form-activity-reservations is inside #activity-form, so
  // these input/change events already bubble up to the listeners registered on activityForm
  // above; calling autoSaveActivityForm() again here would double-save (and double-push an undo
  // snapshot) for every keystroke in a reservation field.
  const reservationsContainer = el("form-activity-reservations");
  reservationsContainer.addEventListener("input", () => {
    updateFormDatesHelper();
    updateSubmissionFinancialSummary();
  });
  reservationsContainer.addEventListener("change", () => {
    updateFormDatesHelper();
    updateSubmissionFinancialSummary();
  });

  // Note: Personnel requis / Services / Autres frais buttons are wired per reservation card in
  // addReservationCard(), since each réservation has its own set of rows.

  // Planification tab buttons
  el("generate-planning-tasks-btn").addEventListener("click", () => {
    const id = el("form-activity-internal-id").value;
    const act = appState.activities.find(a => a.id === id);
    if (act) generatePlanningTasks(act);
  });
  el("add-planning-task-btn").addEventListener("click", () => {
    addPlanningTaskRow({ id: generateUid("task"), description: "", done: false, auto_generated: false });
  });

  // Facturation tab button
  el("generate-billing-lines-btn").addEventListener("click", () => {
    const id = el("form-activity-internal-id").value;
    const act = appState.activities.find(a => a.id === id);
    if (act) generateBillingLines(act);
  });

  // Phone number masks
  maskPhoneInput(el("form-activity-manager-phone"));

  // Manager "Fonction" = Externe reveals company/address fields
  el("form-activity-manager-type").addEventListener("change", e => {
    const externalGroup = el("form-activity-manager-external-group");
    externalGroup.style.display = (e.target as HTMLInputElement).value === "externe" ? "block" : "none";
  });

  // "Même personne que le responsable de l'activité" checkbox: mirrors the manager's name into
  // the billing responsable fields and locks them, instead of the user re-typing it a second time.
  el("form-activity-responsable-same-as-manager").addEventListener("change", e => {
    applyResponsableSameAsManager((e.target as HTMLInputElement).checked);
  });
  el("form-activity-manager-firstname").addEventListener("input", () => {
    if (el("form-activity-responsable-same-as-manager").checked) applyResponsableSameAsManager(true);
  });
  el("form-activity-manager-lastname").addEventListener("input", () => {
    if (el("form-activity-responsable-same-as-manager").checked) applyResponsableSameAsManager(true);
  });

  // Estimation / Soumission mode toggle
  initActivityModeToggle();

  // "+ Ajouter une réservation" button
  initReservationsSection();

  // Note: Services techniques / Service de bar / Autres services pill groups are wired
  // per reservation card in addReservationCard(), since each réservation has its own set of fields.

  // Event type "Autre" reveals a free-text field
  el("form-activity-event-type").addEventListener("change", e => {
    const otherGroup = el("form-activity-event-type-other-group");
    otherGroup.style.display = (e.target as HTMLInputElement).value === "autre" ? "flex" : "none";
  });

  // Keyboard Shortcuts: Navigation, Add, and Escape
  window.addEventListener("keydown", e => {
    // Alt + [1-6] for switching tabs
    if (e.altKey && e.key >= "1" && e.key <= "6") {
      e.preventDefault();
      const views = ["dashboard", "activities", "validation", "account-report", "settings", "backup"];
      const targetView = views[parseInt(e.key) - 1];
      if (targetView) {
        const navBtn = document.querySelector<HTMLButtonElement>(`.nav-item[data-view="${targetView}"] button`);
        if (navBtn) navBtn.click();
      }
    }

    // Alt + N or Alt + A to open the new activity modal
    if (e.altKey && (e.key.toLowerCase() === "n" || e.key.toLowerCase() === "a")) {
      e.preventDefault();
      openNewActivityModal();
    }

    // Alt + E for a new estimation, same behavior as the "add-estimation-btn-quick" button
    // (skips the name modal, opens the drawer directly on a blank draft)
    if (e.altKey && e.key.toLowerCase() === "e") {
      e.preventDefault();
      openActivityDrawer(createDraftActivity(""));
    }

    // Escape to close drawers and modals
    if (e.key === "Escape") {
      // If a PDF is currently displayed in pseudo-fullscreen mode, let the PDF viewer
      // handle the Escape key to close fullscreen, but do not close the drawer or modals.
      if (document.querySelector(".pdf-custom-viewer.pdf-fullscreen-mode")) {
        return;
      }
      cancelActivityDrawer();
      closeNewActivityModal();
      // Settings' 6 modals became React state (see js/settings-view.tsx) when that view was
      // converted; this replaces the old vanilla closeSettingsModal(type) calls, which had
      // silently stopped doing anything (closeSettingsModal no longer existed) and only ever
      // covered 4 of the 6 modals anyway. Dynamic import for the same .tsx/node --test reason as
      // reopenCalendarModal above.
      import("../components/settings/mount.ts").then(m => m.closeAllSettingsModals());
    }
  });
}

// Mirrors the activity manager's name into the billing responsable fields and locks them (readonly)
// while the "même personne" checkbox is checked, so the two stay in sync without re-typing.
function applyResponsableSameAsManager(checked: boolean) {
  const firstNameEl = el("form-activity-responsable-firstname");
  const lastNameEl = el("form-activity-responsable-lastname");
  firstNameEl.readOnly = checked;
  lastNameEl.readOnly = checked;
  firstNameEl.classList.toggle("form-input-readonly", checked);
  lastNameEl.classList.toggle("form-input-readonly", checked);
  if (checked) {
    firstNameEl.value = el("form-activity-manager-firstname").value;
    lastNameEl.value = el("form-activity-manager-lastname").value;
  }
}

// Fills the activity form fields (everything except the id/internal-id keys)
// from an existing activity object. Used by both Edit Mode and Duplicate Mode.
function fillActivityFormFields(act: any) {
  applyActivityFormMode(act.mode || "estimation", act.state !== "brouillon");
  el("form-activity-coba").value = act.coba || "";
  el("form-activity-name").value = act.name;
  el("form-activity-attendees").value = act.attendees_count || "";
  el("form-activity-responsable-firstname").value = act.responsable_first_name || "";
  el("form-activity-responsable-lastname").value = act.responsable_last_name || "";
  el("form-activity-client-type").value = act.client_type;
  el("form-activity-description").value = act.description || "";
  el("form-activity-notes").value = act.notes || "";
  el("form-activity-manager-firstname").value = act.activity_manager?.first_name || "";
  el("form-activity-manager-lastname").value = act.activity_manager?.last_name || "";
  el("form-activity-manager-type").value = act.activity_manager?.type || "employe";
  el("form-activity-manager-phone").value = act.activity_manager?.phone || "";
  el("form-activity-manager-email").value = act.activity_manager?.email || "";
  el("form-activity-manager-company").value = act.activity_manager?.company_name || "";
  el("form-activity-manager-coba-client-number").value = act.activity_manager?.coba_client_number || "";
  el("form-activity-manager-address").value = act.activity_manager?.address || "";
  el("form-activity-manager-city").value = act.activity_manager?.city || "";
  el("form-activity-manager-province").value = act.activity_manager?.province || "";
  el("form-activity-manager-postal-code").value = act.activity_manager?.postal_code || "";
  el("form-activity-manager-external-group").style.display = act.activity_manager?.type === "externe" ? "block" : "none";
  el("form-activity-responsable-same-as-manager").checked = !!act.responsable_same_as_manager;
  applyResponsableSameAsManager(!!act.responsable_same_as_manager);
  el("form-activity-reservations").innerHTML = "";
  (act.reservations || []).forEach((r: any) => addReservationCard(r));
  // A brand-new activity starts with one réservation and one créneau pre-filled, so the user
  // doesn't have to click "+ Ajouter une réservation" just to get going.
  if ((act.reservations || []).length === 0) {
    const card = addReservationCard();
    addSlotRow(card!.querySelector(".reservation-slots-list") as HTMLElement);
  }
  updateFormDatesHelper();
  el("form-activity-dept").value = act.department;
  el("form-activity-event-type").value = act.event_type || "";
  el("form-activity-event-type-other").value = act.event_type_other || "";
  el("form-activity-event-type-other-group").style.display = act.event_type === "autre" ? "flex" : "none";

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
}

/* ==========================================================================
   RÉSERVATIONS (activity form "Réservations de salle") — one card per
   réservation (salle + tarif + créneaux + services), several réservations may
   share the same salle (different services each time).
   ========================================================================== */

const WEEKDAY_PILL_OPTIONS = [
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mer" },
  { value: 4, label: "Jeu" },
  { value: 5, label: "Ven" },
  { value: 6, label: "Sam" },
  { value: 0, label: "Dim" }
];

export { initFormHandlers, fillActivityFormFields, WEEKDAY_PILL_OPTIONS };
export { initNewActivityModal, createActivity, createDraftActivity, duplicateActivityAndOpen };
export { getActivityFormMode, switchActivityTab, renderActivityStateBar, commitActivityPatch, updateFormTabIndicators };
