/**
 * activities-history.js - Undo/redo snapshot stack, form submission, sort
 * init, room-conflict detection, and version history/diff.
 * Part 5/5 of the activities module (see activities-render.js for context).
 */

function scheduleActivityUndoSnapshot(idx) {
  clearTimeout(activityUndoSnapshotTimer);
  activityUndoSnapshotTimer = setTimeout(() => {
    const act = appState.activities[idx];
    // Skip if the drawer has since closed or moved on to a different activity.
    if (!act || document.getElementById("form-activity-internal-id").value !== act.id) return;
    pushActivityUndoSnapshot(act);
  }, ACTIVITY_UNDO_DEBOUNCE_MS);
}

// Records the activity's current state onto the undo stack (Ctrl+Z).
function pushActivityUndoSnapshot(act) {
  activitiesState.undoStack.push(JSON.parse(JSON.stringify(act)));
  if (activitiesState.undoStack.length > ACTIVITY_UNDO_HISTORY_LIMIT) {
    activitiesState.undoStack.shift();
  }
}

// Replaces the open activity's record with `snapshot`, then rebuilds the whole form from it
// (same rebuild openActivityDrawer does), without touching the undo/redo stacks themselves.
function restoreActivitySnapshot(snapshot) {
  const idx = appState.activities.findIndex(a => a.id === snapshot.id);
  if (idx === -1) return;

  // Cancel any pending debounced snapshot from the edit that's being undone/redone away, so it
  // can't fire afterwards and silently push a stale state back onto the stack.
  clearTimeout(activityUndoSnapshotTimer);

  appState.activities[idx] = JSON.parse(JSON.stringify(snapshot));

  document.getElementById("activity-drawer-title").textContent =
    appState.activities[idx].name && appState.activities[idx].name.trim() !== ""
      ? appState.activities[idx].name
      : `Activité ${appState.activities[idx].id}`;
  document.getElementById("form-activity-reservations").innerHTML = "";
  document.getElementById("form-distribution-list").innerHTML = "";
  fillActivityFormFields(appState.activities[idx]);
  renderActivityStateBar(appState.activities[idx]);

  saveDatabase();
  if (reconciliationState.ledgerTransactions.length > 0) {
    reconcileLedger();
  }
  renderActivities();
}

// Ctrl+Z: reverts to the previous auto-saved state of the activity currently open in the drawer.
function undoActivityFormChange() {
  if (activitiesState.undoStack.length <= 1) return;
  activitiesState.redoStack.push(activitiesState.undoStack.pop());
  const previous = activitiesState.undoStack[activitiesState.undoStack.length - 1];
  restoreActivitySnapshot(previous);
  showToast("Modification annulée.", "info", 2000);
}

// Ctrl+Y / Ctrl+Shift+Z: re-applies a change previously undone.
function redoActivityFormChange() {
  if (activitiesState.redoStack.length === 0) return;
  const next = activitiesState.redoStack.pop();
  activitiesState.undoStack.push(next);
  restoreActivitySnapshot(next);
  showToast("Modification rétablie.", "info", 2000);
}

function submitActivityForm(e) {
  if (e) e.preventDefault();

  const internalId = document.getElementById("form-activity-internal-id").value;
  const name = document.getElementById("form-activity-name").value.trim();
  if (!name) {
    showToast("Le nom de l'activité ne peut pas être vide.", "warning");
    return;
  }

  // Clear draft activity state first so autoSaveActivityForm is allowed to save it!
  if (activitiesState.draftActivityId === internalId) {
    activitiesState.draftActivityId = null;
  }

  autoSaveActivityForm();
  closeActivityDrawer();
}

function initActivitiesSort() {
  const headers = document.querySelectorAll("#view-activities table th[data-sort]");

  // Set initial class on default sort key header
  const defaultTh = document.querySelector(`#view-activities table th[data-sort="${activitiesState.sortKey}"]`);
  if (defaultTh) {
    defaultTh.classList.add(activitiesState.sortOrder === "asc" ? "sort-asc" : "sort-desc");
  }

  headers.forEach(th => {
    th.addEventListener("click", () => {
      const sortKey = th.getAttribute("data-sort");
      if (activitiesState.sortKey === sortKey) {
        activitiesState.sortOrder = activitiesState.sortOrder === "asc" ? "desc" : "asc";
      } else {
        activitiesState.sortKey = sortKey;
        activitiesState.sortOrder = "asc";
      }

      // Update header classes
      headers.forEach(h => {
        h.classList.remove("sort-asc", "sort-desc");
      });
      th.classList.add(activitiesState.sortOrder === "asc" ? "sort-asc" : "sort-desc");

      renderActivities();
    });
  });
}

/* ==========================================================================
   FORM DATES HELPER FUNCTIONS
   ========================================================================== */

function updateFormDatesHelper() {
  const helperEl = document.getElementById("form-activity-dates-helper");
  const listEl = document.getElementById("form-activity-days-list");

  const reservations = collectReservationsFromForm();

  if (helperEl && listEl) {
    const { date_start: startVal, date_end: endVal } = getAggregateEventDates(reservations);
    const daysText = getDaysOfWeekInRange(startVal, endVal);
    if (daysText) {
      listEl.textContent = daysText;
      helperEl.style.display = "flex";
    } else {
      helperEl.style.display = "none";
    }
  }

  checkRoomReservationConflicts(reservations);
}

// Returns true if two "HH:MM" time ranges on the same day overlap. A missing start/end time is
// treated as spanning the whole day (conservative: flags a conflict rather than missing one).
function timeRangesOverlap(startA, endA, startB, endB) {
  const a1 = startA || "00:00";
  const a2 = endA || "23:59";
  const b1 = startB || "00:00";
  const b2 = endB || "23:59";
  return a1 < b2 && b1 < a2;
}

// Flattens a reservation into a list of {date, start_time, end_time} occupied ranges: its
// créneaux plus its montage/démontage windows (a room is unavailable during setup/teardown too).
function getReservationOccupiedRanges(reservation) {
  const ranges = (reservation.slots || [])
    .filter(s => s.date)
    .map(s => ({ date: s.date, start_time: s.start_time, end_time: s.end_time }));
  if (reservation.install && reservation.install.enabled && reservation.install.date) {
    ranges.push({ date: reservation.install.date, start_time: reservation.install.start_time, end_time: reservation.install.end_time });
  }
  if (reservation.dismantle && reservation.dismantle.enabled && reservation.dismantle.date) {
    ranges.push({ date: reservation.dismantle.date, start_time: reservation.dismantle.start_time, end_time: reservation.dismantle.end_time });
  }
  return ranges;
}

// Compares the reservations currently in the activity form against every other non-deleted
// activity's reservations, and displays a warning banner listing any room booked by both on an
// overlapping date/time. Runs on every form change that can affect scheduling (room, créneaux,
// montage/démontage).
function checkRoomReservationConflicts(reservations) {
  const bannerEl = document.getElementById("form-activity-room-conflicts");
  if (!bannerEl) return;

  const currentId = document.getElementById("form-activity-internal-id").value;
  const conflicts = []; // {roomName, otherActivityName}

  reservations.forEach(res => {
    if (!res.room_name || res.room_name === OTHER_ROOM_VALUE) return;
    const myRanges = getReservationOccupiedRanges(res);
    if (myRanges.length === 0) return;

    appState.activities.forEach(other => {
      if (other.deleted || other.id === currentId) return;
      (other.reservations || []).forEach(otherRes => {
        if (otherRes.room_name !== res.room_name) return;
        const otherRanges = getReservationOccupiedRanges(otherRes);
        const overlaps = myRanges.some(mr => otherRanges.some(or => mr.date === or.date && timeRangesOverlap(mr.start_time, mr.end_time, or.start_time, or.end_time)));
        if (overlaps && !conflicts.some(c => c.roomName === res.room_name && c.otherActivityName === other.name)) {
          conflicts.push({ roomName: res.room_name, otherActivityName: other.name || "(sans nom)" });
        }
      });
    });
  });

  if (conflicts.length === 0) {
    bannerEl.style.display = "none";
    bannerEl.innerHTML = "";
    return;
  }

  bannerEl.style.display = "block";
  bannerEl.innerHTML = `
    <div class="room-conflict-banner">
      <svg viewBox="0 0 24 24" style="width: 16px; height: 16px; flex-shrink: 0;"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>
      <div>
        <strong>Conflit de réservation détecté :</strong>
        <ul style="margin: 4px 0 0 18px; padding: 0;">
          ${conflicts.map(c => `<li>${escapeHtml(c.roomName)} — également réservée par « ${escapeHtml(c.otherActivityName)} »</li>`).join("")}
        </ul>
      </div>
    </div>
  `;
}

function getDaysOfWeekInRange(startDateStr, endDateStr) {
  if (!startDateStr || !endDateStr) return "";

  const start = parseLocalDateStr(startDateStr);
  const end = parseLocalDateStr(endDateStr);

  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
    return "";
  }

  // French day names
  const dayNames = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

  const uniqueDays = new Set();
  let current = new Date(start);

  // Limit loop to prevent freezing if dates are extremely far apart (e.g. max 31 days)
  const maxIterations = 31;
  let iterations = 0;

  while (current <= end && iterations < maxIterations) {
    uniqueDays.add(current.getDay());
    current.setDate(current.getDate() + 1);
    iterations++;
  }

  // Sort day indexes (1=lundi, 2=mardi, ... 6=samedi, 0=dimanche)
  const sortedDays = Array.from(uniqueDays).sort((a, b) => {
    const orderA = a === 0 ? 7 : a;
    const orderB = b === 0 ? 7 : b;
    return orderA - orderB;
  });

  const dayStrings = sortedDays.map(d => dayNames[d]);

  if (iterations >= maxIterations) {
    return "Tous les jours de la semaine";
  }

  return dayStrings.join(", ");
}

// --- Activity Versioning Logic ---

function formatTimestampToFrench(isoString) {
  if (!isoString) return "";
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return "";

  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const seconds = String(d.getSeconds()).padStart(2, "0");

  return `${day}/${month}/${year} à ${hours}h${minutes}:${seconds}`;
}

async function saveActivityVersion(act) {
  if (!act || !act.id) return;
  // Deep copy the activity object to prevent reference leaks
  const activityData = JSON.parse(JSON.stringify(act));

  const timestamp = new Date().toISOString();
  const versionId = `${act.id}_${Date.now()}`;

  const versionRecord = {
    versionId,
    activityId: act.id,
    timestamp,
    state: act.state,
    activityData
  };

  try {
    await addActivityVersionToDb(versionRecord);
    await pruneActivityVersions(act.id, 20); // Maintain a limit of 20 versions
  } catch (e) {
    console.error("Error saving activity version", e);
  }
}

function computeActivityDiff(oldAct, newAct) {
  const diffs = [];

  // Helper to add diff
  function addDiff(label, oldVal, newVal) {
    const cleanOld = String(oldVal === undefined || oldVal === null ? "" : oldVal).trim();
    const cleanNew = String(newVal === undefined || newVal === null ? "" : newVal).trim();
    if (cleanOld !== cleanNew) {
      diffs.push({ label, oldVal: cleanOld || "[Vide]", newVal: cleanNew || "[Vide]" });
    }
  }

  // 1. Core text fields
  addDiff("Nom de l'activité", oldAct.name, newAct.name);
  addDiff("Responsable facturation", oldAct.responsable, newAct.responsable);
  addDiff("Références COBA", oldAct.coba, newAct.coba);
  addDiff("Département", oldAct.department, newAct.department);

  // Event Type mapping
  const getEventLabel = val => {
    if (!val) return "";
    const found = EVENT_TYPES.find(t => t.value === val);
    return found ? found.label : val;
  };
  addDiff("Type d'événement", getEventLabel(oldAct.event_type), getEventLabel(newAct.event_type));
  if (oldAct.event_type === "autre" || newAct.event_type === "autre") {
    addDiff("Autre type d'événement", oldAct.event_type_other, newAct.event_type_other);
  }

  const getClientTypeLabel = val => {
    if (val === "interne") return "Interne";
    if (val === "externe") return "Externe";
    return val || "";
  };
  addDiff("Type de client", getClientTypeLabel(oldAct.client_type), getClientTypeLabel(newAct.client_type));
  addDiff("Date de début", oldAct.date_start, newAct.date_start);
  addDiff("Date de fin", oldAct.date_end, newAct.date_end);
  addDiff("Description", oldAct.description, newAct.description);
  addDiff("Statut de l'activité", getActivityStateLabel(oldAct.state), getActivityStateLabel(newAct.state));

  const getModeLabel = val => {
    if (val === "estimation") return "Estimation";
    if (val === "soumission") return "Soumission";
    return val || "";
  };
  addDiff("Mode", getModeLabel(oldAct.mode), getModeLabel(newAct.mode));

  // 2. Client contact info
  const oldClient = oldAct.client || {};
  const newClient = newAct.client || {};
  addDiff("Client: Prénom", oldClient.first_name, newClient.first_name);
  addDiff("Client: Nom", oldClient.last_name, newClient.last_name);
  addDiff("Client: Téléphone", oldClient.phone, newClient.phone);
  addDiff("Client: Courriel", oldClient.email, newClient.email);

  // 3. Activity manager contact info
  const oldManager = oldAct.activity_manager || {};
  const newManager = newAct.activity_manager || {};
  addDiff("Resp. Activité: Prénom", oldManager.first_name, newManager.first_name);
  addDiff("Resp. Activité: Nom", oldManager.last_name, newManager.last_name);
  addDiff("Resp. Activité: Téléphone", oldManager.phone, newManager.phone);
  addDiff("Resp. Activité: Courriel", oldManager.email, newManager.email);

  // 4. Reservations summary
  const getReservationsSummary = act => {
    if (!act.reservations || act.reservations.length === 0) return "Aucune salle";
    return act.reservations
      .map(r => {
        const room = r.room_name;
        const slotsCount = r.slots ? r.slots.length : 0;
        return `${room} (${slotsCount} créneau${slotsCount > 1 ? "x" : ""})`;
      })
      .join(", ");
  };
  addDiff("Réservations de salles", getReservationsSummary(oldAct), getReservationsSummary(newAct));

  // 5. Distributions summary
  const getDistributionsSummary = act => {
    if (!act.distributions || act.distributions.length === 0) return "Aucune ventilation";
    return act.distributions
      .map(d => {
        return `${d.account_code} : ${formatCurrency(d.amount)}${d.reference ? ` (${d.reference})` : ""}`;
      })
      .join(" | ");
  };
  addDiff("Ventilations comptables", getDistributionsSummary(oldAct), getDistributionsSummary(newAct));

  return diffs;
}

async function loadAndRenderActivityHistory(activityId) {
  const container = document.getElementById("activity-history-list");
  if (!container) return;

  container.innerHTML = `<div style="color: var(--text-muted); font-size: 0.85rem; padding: 4px;">Chargement de l'historique...</div>`;

  try {
    const versions = await getActivityVersionsFromDb(activityId);
    // Sort versions by timestamp descending (most recent first)
    versions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    if (versions.length === 0) {
      container.innerHTML = `<div style="color: var(--text-muted); font-size: 0.85rem; padding: 4px;">Aucune version enregistrée pour cette activité.</div>`;
      return;
    }

    // Fetch the current version of the activity
    const currentAct = appState.activities.find(a => a.id === activityId);

    let html = "";
    versions.forEach((v, index) => {
      const dateStr = formatTimestampToFrench(v.timestamp);
      const stateLabel = getActivityStateLabel(v.state);
      const isCurrent = index === 0 ? " <span style='color: var(--success-text); font-weight: bold;'>(Actuelle)</span>" : "";

      // Calculate diffs between this version and the current activity
      const diffs = currentAct ? computeActivityDiff(v.activityData, currentAct) : [];

      let diffsHtml = "";
      if (diffs.length === 0) {
        diffsHtml = `<div style="color: var(--text-muted); font-style: italic; margin-bottom: 8px;">Identique à la version actuelle</div>`;
      } else {
        diffs.forEach(d => {
          diffsHtml += `
            <div class="diff-line">
              <span class="diff-field">${escapeHtml(d.label)} :</span>
              <del class="diff-old">${escapeHtml(d.oldVal)}</del>
              <span style="color: var(--text-muted);">➜</span>
              <ins class="diff-new">${escapeHtml(d.newVal)}</ins>
            </div>
          `;
        });
      }

      html += `
        <div class="history-item" data-version-id="${v.versionId}">
          <div class="history-item-header">
            <div class="version-info">
              <div class="version-title">Version du ${dateStr}${isCurrent}</div>
              <div class="version-meta">
                Statut : <span class="badge ${getActivityStateBadgeClass(v.state)}" style="font-size: 0.7rem; padding: 1px 6px;">${stateLabel}</span>
              </div>
            </div>
            <div style="display: flex; align-items: center;">
              <span class="history-arrow-indicator">➔</span>
            </div>
          </div>
          <div class="history-item-content">
            <div style="font-weight: 600; margin-bottom: 8px; font-size: 0.85rem; color: var(--text-primary);">Modifications apportées (par rapport à la version actuelle) :</div>
            <div class="version-diff-container">
              ${diffsHtml}
            </div>
            <div style="display: flex; justify-content: flex-end; margin-top: 12px;">
              <button type="button" class="btn btn-secondary restore-version-btn" style="padding: 4px 12px; font-size: 0.78rem;">
                Restaurer cette version
              </button>
            </div>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;

    // Wire up expand toggles on header click
    container.querySelectorAll(".history-item-header").forEach(header => {
      header.addEventListener("click", () => {
        const item = header.closest(".history-item");

        // Collapse all others (accordion style)
        container.querySelectorAll(".history-item").forEach(otherItem => {
          if (otherItem !== item) {
            otherItem.classList.remove("expanded");
          }
        });

        item.classList.toggle("expanded");
      });
    });

    // Wire up restore buttons
    container.querySelectorAll(".history-item").forEach(item => {
      const vId = item.getAttribute("data-version-id");
      const btn = item.querySelector(".restore-version-btn");
      if (btn) {
        btn.addEventListener("click", e => {
          e.stopPropagation(); // prevent header toggle
          const ver = versions.find(x => x.versionId === vId);
          if (
            ver &&
            confirm(
              `Êtes-vous sûr de vouloir restaurer l'activité à sa version du ${formatTimestampToFrench(ver.timestamp)} ? Les modifications actuelles seront écrasées.`
            )
          ) {
            restoreActivityVersion(ver);
          }
        });
      }
    });
  } catch (e) {
    console.error("Error loading versions", e);
    container.innerHTML = `<div style="color: var(--danger-text); font-size: 0.85rem; padding: 4px;">Erreur lors du chargement de l'historique : ${e.message}</div>`;
  }
}

function restoreActivityVersion(versionRecord) {
  const currentId = document.getElementById("form-activity-internal-id").value;
  if (!currentId) return;

  const idx = appState.activities.findIndex(a => a.id === currentId);
  if (idx === -1) return;

  // Restore the activity data
  appState.activities[idx] = JSON.parse(JSON.stringify(versionRecord.activityData));

  // Re-save DB
  saveDatabase();

  // Refresh the drawer fields and state bar
  fillActivityFormFields(appState.activities[idx]);
  renderActivityStateBar(appState.activities[idx]);

  // Update openedActivitySnapshot to prevent saving immediately a new version upon closing
  activitiesState.openedActivitySnapshot = JSON.parse(JSON.stringify(appState.activities[idx]));

  // Save a new version to the history representing the restored state
  saveActivityVersion(appState.activities[idx]).then(() => {
    // Reload history list
    loadAndRenderActivityHistory(currentId);
  });

  // Close the drawer and refresh activities list to reflect the restored state
  renderActivities();

  showToast("Version restaurée avec succès !", "success");
}

export {
  timeRangesOverlap,
  getReservationOccupiedRanges,
  computeActivityDiff,
  scheduleActivityUndoSnapshot,
  pushActivityUndoSnapshot,
  restoreActivitySnapshot,
  undoActivityFormChange,
  redoActivityFormChange,
  submitActivityForm,
  initActivitiesSort,
  updateFormDatesHelper,
  checkRoomReservationConflicts,
  getDaysOfWeekInRange,
  formatTimestampToFrench,
  saveActivityVersion,
  loadAndRenderActivityHistory,
  restoreActivityVersion
};

if (typeof window !== "undefined") {
  window.timeRangesOverlap = timeRangesOverlap;
  window.getReservationOccupiedRanges = getReservationOccupiedRanges;
  window.computeActivityDiff = computeActivityDiff;
  window.scheduleActivityUndoSnapshot = scheduleActivityUndoSnapshot;
  window.pushActivityUndoSnapshot = pushActivityUndoSnapshot;
  window.restoreActivitySnapshot = restoreActivitySnapshot;
  window.undoActivityFormChange = undoActivityFormChange;
  window.redoActivityFormChange = redoActivityFormChange;
  window.submitActivityForm = submitActivityForm;
  window.initActivitiesSort = initActivitiesSort;
  window.updateFormDatesHelper = updateFormDatesHelper;
  window.checkRoomReservationConflicts = checkRoomReservationConflicts;
  window.getDaysOfWeekInRange = getDaysOfWeekInRange;
  window.formatTimestampToFrench = formatTimestampToFrench;
  window.saveActivityVersion = saveActivityVersion;
  window.loadAndRenderActivityHistory = loadAndRenderActivityHistory;
  window.restoreActivityVersion = restoreActivityVersion;
}
