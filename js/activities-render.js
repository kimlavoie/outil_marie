/**
 * activities-render.js - Activities list view: table state, filtering/sorting,
 * row rendering, and bulk selection actions.
 * Part 1/5 of the activities module (split from a single 3400-line file for
 * maintainability); see activities-form.js, activities-reservations.js,
 * activities-financials.js, activities-history.js for the rest.
 */

// Activities view UI state, grouped so the module's moving parts live in one place
let activitiesState = {
  sortKey: "id",
  sortOrder: "asc",
  page: 1,
  pageSize: 10,
  // Id of an activity currently open in the drawer that hasn't been saved yet (created via the
  // "Estimation" quick button). Discarded (removed from appState.activities, not just closed) if
  // the drawer is closed/cancelled without clicking "Enregistrer".
  draftActivityId: null,
  openedActivitySnapshot: null,
  selectedIds: new Set(),
  // Undo/Redo history for the currently-open activity drawer (Ctrl+Z / Ctrl+Y): each entry is a
  // deep snapshot of the activity record taken right after a successful auto-save. Reset whenever
  // the drawer opens/closes so history never leaks between activities.
  undoStack: [],
  redoStack: []
};

const ACTIVITY_UNDO_HISTORY_LIMIT = 50;

// Which flow the "Nom de l'activité" modal is currently serving: "soumission" creates and saves
// the activity immediately in soumission mode; "estimation" only builds it in memory (estimation
// mode) until the user actually saves the drawer form.
let newActivityModalIntent = "soumission";

// Activity lifecycle states, in order
const ACTIVITY_STATES = [
  { value: "brouillon", label: "Brouillon" },
  { value: "soumise", label: "Soumise au client" },
  { value: "approuvee", label: "Approuvée" },
  { value: "planifiee", label: "Planifiée" },
  { value: "facturee", label: "Facturée" },
  { value: "terminee", label: "Terminée" }
];

function getActivityStateLabel(state) {
  return (ACTIVITY_STATES.find(s => s.value === state) || ACTIVITY_STATES[0]).label;
}

function getActivityStateBadgeClass(state) {
  switch (state) {
    case "terminee":
      return "badge-success";
    case "facturee":
    case "planifiee":
      return "badge-info";
    case "approuvee":
      return "badge-warning";
    case "soumise":
      return "badge-warning";
    default:
      return "badge-danger";
  }
}

// {done, total, percent} of an activity's planning tasks
function getPlanningProgress(act) {
  const tasks = act.planning_tasks || [];
  const done = tasks.filter(t => t.done).length;
  const total = tasks.length;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  return { done, total, percent };
}

// Small progress-bar HTML snippet reused in the activities list and the Planification tab
function buildProgressBarHtml(percent) {
  return `
    <div class="progress-bar" title="${percent}%">
      <div class="progress-bar-fill ${percent >= 100 ? "complete" : ""}" style="width: ${percent}%;"></div>
    </div>
  `;
}

function renderActivities() {
  saveUiState();
  const tbody = document.getElementById("activities-table-body");
  const searchQuery = document.getElementById("activity-search").value.toLowerCase();
  const filterSalle = document.getElementById("filter-salle").value;
  const filterClientType = document.getElementById("filter-client-type").value;
  const filterStatus = document.getElementById("filter-status")?.value || "";

  tbody.innerHTML = "";

  // Filter activities
  const filtered = appState.activities.filter(act => {
    if (act.deleted) return false;

    // Search filter: ID, Name, Responsable, Reference, or any ventilated Account Code
    const matchesSearch =
      act.id.toLowerCase().includes(searchQuery) ||
      act.name.toLowerCase().includes(searchQuery) ||
      act.responsable.toLowerCase().includes(searchQuery) ||
      act.distributions.some(
        d => d.account_code.toLowerCase().includes(searchQuery) || (d.reference || "").toLowerCase().includes(searchQuery)
      );

    // Salle filter
    const matchesSalle = !filterSalle || (act.reservations || []).some(r => r.room_name === filterSalle);

    // Client type filter
    const matchesClientType = !filterClientType || act.client_type === filterClientType;

    // Status filter
    const matchesStatus = !filterStatus || act.state === filterStatus;

    // Period filter
    let matchesPeriod = false;
    if (!act.date_start) {
      matchesPeriod = true;
    } else {
      const fy = getFiscalYear(act.date_start);
      const q = getQuarterNumber(act.date_start);
      matchesPeriod = fy === appState.selected_year && appState.selected_quarters.includes(q);
    }

    return matchesSearch && matchesSalle && matchesClientType && matchesStatus && matchesPeriod;
  });

  // Sort filtered activities
  filtered.sort((a, b) => {
    let valA = "";
    let valB = "";

    switch (activitiesState.sortKey) {
      case "id":
        valA = a.id;
        valB = b.id;
        break;
      case "name":
        valA = a.name.toLowerCase();
        valB = b.name.toLowerCase();
        break;
      case "responsable":
        valA = (a.responsable || "").toLowerCase();
        valB = (b.responsable || "").toLowerCase();
        break;
      case "date_start":
        valA = a.date_start || "";
        valB = b.date_start || "";
        break;
      case "room_name":
        valA = (a.reservations || []).map(getReservationRoomLabel).join(", ").toLowerCase();
        valB = (b.reservations || []).map(getReservationRoomLabel).join(", ").toLowerCase();
        break;
      case "reference":
        valA = getActivityReferences(a).toLowerCase();
        valB = getActivityReferences(b).toLowerCase();
        break;
      case "totalRev":
        valA = a.distributions.reduce((sum, d) => sum + d.amount, 0);
        valB = b.distributions.reduce((sum, d) => sum + d.amount, 0);
        break;
      case "sansFrais":
        valA = a.client_type === "interne" ? getRoomsTariffTotal(a) : 0;
        valB = b.client_type === "interne" ? getRoomsTariffTotal(b) : 0;
        break;
    }

    // Use localeCompare for strings (accents robust) and subtraction for numbers
    if (typeof valA === "string" && typeof valB === "string") {
      return activitiesState.sortOrder === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
    } else {
      return activitiesState.sortOrder === "asc" ? valA - valB : valB - valA;
    }
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="11" class="text-center" style="color: var(--text-muted); padding: 32px;">Aucune activité trouvée. Cliquez sur "+ Nouvelle Activité" pour en créer une.</td></tr>`;
    renderPaginationBar(document.getElementById("activities-pagination"), {
      page: activitiesState.page,
      pageSize: activitiesState.pageSize,
      totalItems: 0,
      onPageChange: () => {},
      onPageSizeChange: () => {}
    });
    return;
  }

  activitiesState.page = renderPaginationBar(document.getElementById("activities-pagination"), {
    page: activitiesState.page,
    pageSize: activitiesState.pageSize,
    totalItems: filtered.length,
    onPageChange: p => {
      activitiesState.page = p;
      activitiesState.selectedIds.clear();
      renderActivities();
    },
    onPageSizeChange: s => {
      activitiesState.pageSize = s;
      activitiesState.page = 1;
      activitiesState.selectedIds.clear();
      renderActivities();
    }
  });
  const pageItems = filtered.slice((activitiesState.page - 1) * activitiesState.pageSize, activitiesState.page * activitiesState.pageSize);

  pageItems.forEach(act => {
    const isFilled = act.name.trim() !== "";
    const totalRev = act.distributions.reduce((sum, d) => sum + d.amount, 0);

    // Format distributions for visualization
    let distHtml = "";
    if (isFilled && act.distributions && act.distributions.length > 0) {
      distHtml = `
        <div class="activity-dist-list" style="margin-top: 6px; display: flex; flex-wrap: wrap; gap: 4px; font-size: 0.72rem;">
          ${act.distributions
            .map(d => {
              const accDesc = appState.settings.accounts.find(a => a.code === d.account_code)?.description || "";
              return `
              <span class="font-mono" style="background-color: var(--bg-main); border: 1px solid var(--border-color); padding: 2px 6px; border-radius: var(--radius-sm); color: var(--text-secondary);" title="${escapeHtml(accDesc)}">
                <strong>${d.account_code}</strong>: ${formatCurrency(d.amount)}${d.reference ? ` (${escapeHtml(d.reference)})` : ""}
              </span>
            `;
            })
            .join("")}
        </div>
      `;
    }

    // Format dates
    let datesText = "-";
    let daysCount = 0;
    if (act.date_start || act.date_end) {
      if (act.date_start && act.date_end) {
        daysCount = calculateDaysCount(act.date_start, act.date_end);
        const start = parseLocalDateStr(act.date_start).toLocaleDateString("fr-CA", { month: "short", day: "numeric" });
        const end = parseLocalDateStr(act.date_end).toLocaleDateString("fr-CA", { month: "short", day: "numeric" });
        datesText = `${start} au ${end} (${daysCount}j)`;
      } else if (act.date_start) {
        const start = parseLocalDateStr(act.date_start).toLocaleDateString("fr-CA", { month: "short", day: "numeric" });
        datesText = `À partir du ${start}`;
      } else if (act.date_end) {
        const end = parseLocalDateStr(act.date_end).toLocaleDateString("fr-CA", { month: "short", day: "numeric" });
        datesText = `Jusqu'au ${end}`;
      }
    }

    // Sans Frais estimated cost if internal client
    let sansFraisText = "-";
    if (act.client_type === "interne" && isFilled) {
      sansFraisText = formatCurrency(getRoomsTariffTotal(act));
    }

    // Reconciliation badge if ledger file has been uploaded
    const activityReferences = getActivityReferences(act);
    let statusBadge = "";
    if (reconciliationState.ledgerTransactions.length > 0 && isFilled && activityReferences) {
      // Find reconciliation statuses for this activity
      const related = reconciliationState.results.filter(r => r.activityId === act.id);
      if (related.length > 0) {
        const hasDiff = related.some(r => r.status === "diff");
        const hasUnlogged = related.some(r => r.status === "unlogged");
        const allValid = related.every(r => r.status === "valid");

        if (allValid) {
          statusBadge = `<span class="badge badge-success">Rapproché</span>`;
        } else if (hasDiff) {
          statusBadge = `<span class="badge badge-danger">Écart montant</span>`;
        } else if (hasUnlogged) {
          statusBadge = `<span class="badge badge-warning">Non dans GL</span>`;
        }
      }
    }

    const progress = getPlanningProgress(act);
    const stateCellHtml = isFilled
      ? `
      <div style="display: flex; flex-direction: column; gap: 6px;">
        <span class="badge ${getActivityStateBadgeClass(act.state)}">${getActivityStateLabel(act.state)}</span>
        ${progress.total > 0 ? `${buildProgressBarHtml(progress.percent)}<span style="font-size: 0.7rem; color: var(--text-muted);">${progress.done}/${progress.total} tâches</span>` : ""}
      </div>
    `
      : "-";

    tbody.innerHTML += `
      <tr class="activity-row ${isFilled ? "" : "row-empty"} ${activitiesState.selectedIds.has(act.id) ? "selected" : ""}" data-id="${act.id}" style="cursor: pointer; ${isFilled ? "" : "opacity: 0.5; font-style: italic;"}">
        <td onclick="event.stopPropagation();" style="text-align: center; vertical-align: middle; width: 40px;">
          <input type="checkbox" class="activity-select-checkbox" data-id="${act.id}" ${activitiesState.selectedIds.has(act.id) ? "checked" : ""} style="cursor: pointer;" />
        </td>
        <td class="font-mono bold">${act.id}</td>
        <td>
          <span class="bold">${isFilled ? escapeHtml(act.name) : "Vierge"}</span> ${statusBadge}
          ${distHtml}
        </td>
        <td>${isFilled && act.responsable ? escapeHtml(act.responsable) : "-"}</td>
        <td>${datesText}</td>
        <td>${isFilled ? `${escapeHtml((act.reservations || []).map(getReservationRoomLabel).join(", "))} (${act.client_type})` : "-"}</td>
        <td class="font-mono">${isFilled && activityReferences ? escapeHtml(activityReferences) : "-"}</td>
        <td class="bold">${isFilled ? formatCurrency(totalRev) : "-"}</td>
        <td style="color: var(--text-muted);">${sansFraisText}</td>
        <td>${stateCellHtml}</td>
        <td class="text-right" style="white-space: nowrap;">
          ${
            isFilled
              ? `
          <button class="btn-icon favorite-act-btn" data-id="${act.id}" title="${isFavoriteActivity(act.id) ? "Retirer des accès rapides" : "Ajouter aux accès rapides"}" style="margin-right: 4px; color: ${isFavoriteActivity(act.id) ? "var(--warning-text, #f59e0b)" : "inherit"};">
            <svg viewBox="0 0 24 24" style="width: 16px; height: 16px; fill: currentColor;">${isFavoriteActivity(act.id) ? '<path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>' : '<path d="M12 15.39l-3.76 2.27 1-4.28-3.32-2.88 4.38-.38L12 6.09l1.71 4.04 4.38.38-3.32 2.88 1 4.28L12 15.39zM12 2L9.19 8.62 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.63-7.03L22 9.24l-7.19-.62L12 2z"/>'}</svg>
          </button>
          `
              : ""
          }
          ${
            isFilled
              ? `
          <button class="btn-icon open-act-tab-btn" data-id="${act.id}" title="Ouvrir dans un nouvel onglet" style="margin-right: 4px;">
            <svg viewBox="0 0 24 24" style="width: 16px; height: 16px; fill: currentColor;"><path d="M14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7zM5 5h5V3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-5h-2v5H5V5z"/></svg>
          </button>
          `
              : ""
          }
          ${
            isFilled
              ? `
          <button class="btn-icon duplicate-act-btn" data-id="${act.id}" title="Dupliquer" style="margin-right: 4px;">
            <svg viewBox="0 0 24 24" style="width: 16px; height: 16px; fill: currentColor;"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
          </button>
          `
              : ""
          }
          <button class="btn-icon delete-act-list-btn" data-id="${act.id}" title="Supprimer" style="color: var(--danger);">
            <svg viewBox="0 0 24 24" style="width: 16px; height: 16px; fill: currentColor;"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
          </button>
        </td>
      </tr>
    `;
  });

  // Attach checkbox change event listeners
  document.querySelectorAll(".activity-select-checkbox").forEach(cb => {
    cb.addEventListener("change", e => {
      const id = cb.getAttribute("data-id");
      if (cb.checked) {
        activitiesState.selectedIds.add(id);
        cb.closest("tr").classList.add("selected");
      } else {
        activitiesState.selectedIds.delete(id);
        cb.closest("tr").classList.remove("selected");
      }
      updateBulkActionsBar();
    });
  });

  // Attach row click listeners to open the activity record (tabbed lifecycle view)
  document.querySelectorAll(".activity-row").forEach(row => {
    row.addEventListener("click", () => {
      openActivityDrawer(row.getAttribute("data-id"));
    });
  });

  // Attach favorite (accès rapide) toggle buttons event listeners
  document.querySelectorAll(".favorite-act-btn").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      toggleFavoriteActivity(btn.getAttribute("data-id"));
      renderActivities();
      renderQuickAccessAll();
    });
  });

  // Attach "open in new tab" buttons event listeners
  document.querySelectorAll(".open-act-tab-btn").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const id = btn.getAttribute("data-id");
      const url = new URL(window.location.href);
      url.search = `?activity=${encodeURIComponent(id)}`;
      window.open(url.toString(), "_blank");
    });
  });

  // Attach duplicate buttons event listeners
  document.querySelectorAll(".duplicate-act-btn").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      duplicateActivityAndOpen(btn.getAttribute("data-id"));
    });
  });

  // Attach delete buttons event listeners
  document.querySelectorAll(".delete-act-list-btn").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const id = btn.getAttribute("data-id");
      if (confirm(`Voulez-vous vraiment supprimer l'activité ${id} ?`)) {
        const act = appState.activities.find(a => a.id === id);
        if (act) {
          act.deleted = true;
        }
        appState.favorites = (appState.favorites || []).filter(f => f !== id);
        saveDatabase();
        if (reconciliationState.ledgerTransactions.length > 0) {
          reconcileLedger();
        }
        renderAll();
      }
    });
  });

  // Update floating bulk actions bar status
  updateBulkActionsBar();
}

function updateBulkActionsBar() {
  const bar = document.getElementById("bulk-actions-bar");
  const countSpan = document.getElementById("bulk-selected-count");
  const selectAllCheckbox = document.getElementById("activities-select-all");

  const selectedCount = activitiesState.selectedIds.size;

  if (selectedCount > 0) {
    if (bar) {
      bar.classList.add("visible");
    }
    if (countSpan) {
      countSpan.textContent = `${selectedCount} activité${selectedCount > 1 ? "s" : ""} sélectionnée${selectedCount > 1 ? "s" : ""}`;
    }
  } else {
    if (bar) {
      bar.classList.remove("visible");
    }
  }

  // Update the select-all checkbox state based on visible rows
  if (selectAllCheckbox) {
    const checkboxes = document.querySelectorAll(".activity-select-checkbox");
    if (checkboxes.length > 0) {
      const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
      if (checkedCount === 0) {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
      } else if (checkedCount === checkboxes.length) {
        selectAllCheckbox.checked = true;
        selectAllCheckbox.indeterminate = false;
      } else {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = true;
      }
    } else {
      selectAllCheckbox.checked = false;
      selectAllCheckbox.indeterminate = false;
    }
  }
}

function initBulkActionsHandlers() {
  const selectAllCheckbox = document.getElementById("activities-select-all");
  if (selectAllCheckbox) {
    selectAllCheckbox.addEventListener("change", e => {
      const checkboxes = document.querySelectorAll(".activity-select-checkbox");
      const isChecked = e.target.checked;
      checkboxes.forEach(cb => {
        const id = cb.getAttribute("data-id");
        cb.checked = isChecked;
        if (isChecked) {
          activitiesState.selectedIds.add(id);
          cb.closest("tr").classList.add("selected");
        } else {
          activitiesState.selectedIds.delete(id);
          cb.closest("tr").classList.remove("selected");
        }
      });
      updateBulkActionsBar();
    });
  }

  // Clear selections button
  const clearBtn = document.getElementById("bulk-clear-btn");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      activitiesState.selectedIds.clear();
      renderActivities();
    });
  }

  // Delete bulk button
  const deleteBtn = document.getElementById("bulk-delete-btn");
  if (deleteBtn) {
    deleteBtn.addEventListener("click", () => {
      const count = activitiesState.selectedIds.size;
      if (count === 0) return;
      if (confirm(`Voulez-vous vraiment supprimer les ${count} activités sélectionnées ?`)) {
        activitiesState.selectedIds.forEach(id => {
          const act = appState.activities.find(a => a.id === id);
          if (act) {
            act.deleted = true;
          }
          appState.favorites = (appState.favorites || []).filter(f => f !== id);
        });
        activitiesState.selectedIds.clear();
        saveDatabase();
        if (reconciliationState.ledgerTransactions.length > 0) {
          reconcileLedger();
        }
        renderAll();
      }
    });
  }

  // State bulk dropdown toggle
  const stateBtn = document.getElementById("bulk-state-btn");
  const stateMenu = document.getElementById("bulk-state-menu");
  if (stateBtn && stateMenu) {
    stateBtn.addEventListener("click", e => {
      e.stopPropagation();
      stateMenu.classList.toggle("hidden");
    });
  }

  // State menu items
  document.querySelectorAll(".bulk-state-item").forEach(item => {
    item.addEventListener("click", e => {
      const newState = item.getAttribute("data-state");
      const count = activitiesState.selectedIds.size;
      if (count === 0) return;

      activitiesState.selectedIds.forEach(id => {
        const act = appState.activities.find(a => a.id === id);
        if (act) {
          act.state = newState;
        }
      });

      activitiesState.selectedIds.clear();
      saveDatabase();
      renderAll();

      if (stateMenu) {
        stateMenu.classList.add("hidden");
      }
    });
  });

  // Close dropdown on click outside
  document.addEventListener("click", e => {
    const stateMenu = document.getElementById("bulk-state-menu");
    const stateBtn = document.getElementById("bulk-state-btn");
    if (stateMenu && stateBtn && !stateBtn.contains(e.target) && !stateMenu.contains(e.target)) {
      stateMenu.classList.add("hidden");
    }
  });
}

export {
  activitiesState,
  ACTIVITY_STATES,
  ACTIVITY_UNDO_HISTORY_LIMIT,
  newActivityModalIntent,
  getActivityStateLabel,
  getActivityStateBadgeClass,
  getPlanningProgress,
  buildProgressBarHtml,
  renderActivities,
  updateBulkActionsBar,
  initBulkActionsHandlers
};

if (typeof window !== "undefined") {
  window.activitiesState = activitiesState;
  window.ACTIVITY_STATES = ACTIVITY_STATES;
  window.ACTIVITY_UNDO_HISTORY_LIMIT = ACTIVITY_UNDO_HISTORY_LIMIT;
  window.newActivityModalIntent = newActivityModalIntent;
  window.getActivityStateLabel = getActivityStateLabel;
  window.getActivityStateBadgeClass = getActivityStateBadgeClass;
  window.getPlanningProgress = getPlanningProgress;
  window.buildProgressBarHtml = buildProgressBarHtml;
  window.renderActivities = renderActivities;
  window.updateBulkActionsBar = updateBulkActionsBar;
  window.initBulkActionsHandlers = initBulkActionsHandlers;
}

