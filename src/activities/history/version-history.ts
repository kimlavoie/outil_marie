/**
 * activities/history/version-history.ts - Activity version snapshots (taken on every meaningful
 * drawer close), their diff against the current record, and the "Historique" tab's list/restore
 * UI. Split out of index.ts (see that file for why it stays a barrel importing/re-exporting this
 * alongside undo.ts/room-conflicts.ts).
 */
import {
  appState,
  EVENT_TYPES,
  saveDatabaseOrRollback,
  getActivityVersionsFromDb,
  addActivityVersionToDb,
  pruneActivityVersions
} from "../../state/state.ts";
import { showToast, escapeHtml, formatCurrency } from "../../utils/utils.ts";
import { logError } from "../../utils/logger.ts";
import { activitiesState, renderActivities, getActivityStateLabel, getActivityStateBadgeClass } from "../render.ts";
import { fillActivityFormFields, renderActivityStateBar } from "../form.ts";

function formatTimestampToFrench(isoString: string) {
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

async function saveActivityVersion(act: any) {
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
    logError("activities-history", "sauvegarde d'une version d'activité", e);
  }
}

function computeActivityDiff(oldAct: any, newAct: any) {
  const diffs: { label: string; oldVal: string; newVal: string }[] = [];

  // Helper to add diff
  function addDiff(label: string, oldVal: any, newVal: any) {
    const cleanOld = String(oldVal === undefined || oldVal === null ? "" : oldVal).trim();
    const cleanNew = String(newVal === undefined || newVal === null ? "" : newVal).trim();
    if (cleanOld !== cleanNew) {
      diffs.push({ label, oldVal: cleanOld || "[Vide]", newVal: cleanNew || "[Vide]" });
    }
  }

  // 1. Core text fields
  addDiff("Nom de l'activité", oldAct.name, newAct.name);
  addDiff("Responsable facturation: Prénom", oldAct.responsable_first_name, newAct.responsable_first_name);
  addDiff("Responsable facturation: Nom", oldAct.responsable_last_name, newAct.responsable_last_name);
  addDiff("Références COBA", oldAct.coba, newAct.coba);
  addDiff("Département", oldAct.department, newAct.department);

  // Event Type mapping
  const getEventLabel = (val: string) => {
    if (!val) return "";
    const found = EVENT_TYPES.find((t: any) => t.value === val);
    return found ? found.label : val;
  };
  addDiff("Type d'événement", getEventLabel(oldAct.event_type), getEventLabel(newAct.event_type));
  if (oldAct.event_type === "autre" || newAct.event_type === "autre") {
    addDiff("Autre type d'événement", oldAct.event_type_other, newAct.event_type_other);
  }

  const getClientTypeLabel = (val: string) => {
    if (val === "interne") return "Interne";
    if (val === "externe") return "Externe";
    return val || "";
  };
  addDiff("Type de client", getClientTypeLabel(oldAct.client_type), getClientTypeLabel(newAct.client_type));
  addDiff("Date de début", oldAct.date_start, newAct.date_start);
  addDiff("Date de fin", oldAct.date_end, newAct.date_end);
  addDiff("Description", oldAct.description, newAct.description);
  addDiff("Statut de l'activité", getActivityStateLabel(oldAct.state), getActivityStateLabel(newAct.state));

  const getModeLabel = (val: string) => {
    if (val === "estimation") return "Estimation";
    if (val === "soumission") return "Soumission";
    return val || "";
  };
  addDiff("Mode", getModeLabel(oldAct.mode), getModeLabel(newAct.mode));

  // 2. Activity manager contact info
  const oldManager = oldAct.activity_manager || {};
  const newManager = newAct.activity_manager || {};
  addDiff("Resp. Activité: Prénom", oldManager.first_name, newManager.first_name);
  addDiff("Resp. Activité: Nom", oldManager.last_name, newManager.last_name);
  addDiff("Resp. Activité: Téléphone", oldManager.phone, newManager.phone);
  addDiff("Resp. Activité: Courriel", oldManager.email, newManager.email);
  addDiff("Resp. Activité: Entreprise", oldManager.company_name, newManager.company_name);
  addDiff("Resp. Activité: No client (COBA)", oldManager.coba_client_number, newManager.coba_client_number);
  addDiff("Resp. Activité: Adresse", oldManager.address, newManager.address);
  addDiff("Resp. Activité: Ville", oldManager.city, newManager.city);
  addDiff("Resp. Activité: Province", oldManager.province, newManager.province);
  addDiff("Resp. Activité: Code postal", oldManager.postal_code, newManager.postal_code);

  // 3. Reservations summary
  const getReservationsSummary = (act: any) => {
    if (!act.reservations || act.reservations.length === 0) return "Aucune salle";
    return act.reservations
      .map((r: any) => {
        const room = r.room_name;
        const slotsCount = r.slots ? r.slots.length : 0;
        return `${room} (${slotsCount} créneau${slotsCount > 1 ? "x" : ""})`;
      })
      .join(", ");
  };
  addDiff("Réservations de salles", getReservationsSummary(oldAct), getReservationsSummary(newAct));

  // 4. Distributions summary
  const getDistributionsSummary = (act: any) => {
    if (!act.distributions || act.distributions.length === 0) return "Aucune ventilation";
    return act.distributions
      .map((d: any) => {
        return `${d.account_code} : ${formatCurrency(d.amount)}${d.reference ? ` (${d.reference})` : ""}`;
      })
      .join(" | ");
  };
  addDiff("Ventilations comptables", getDistributionsSummary(oldAct), getDistributionsSummary(newAct));

  return diffs;
}

async function loadAndRenderActivityHistory(activityId: string) {
  const container = document.getElementById("activity-history-list");
  if (!container) return;

  container.innerHTML = `<div style="color: var(--text-muted); font-size: 0.85rem; padding: 4px;">Chargement de l'historique...</div>`;

  try {
    const versions = await getActivityVersionsFromDb(activityId);
    // Sort versions by timestamp descending (most recent first)
    versions.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    if (versions.length === 0) {
      container.innerHTML = `<div style="color: var(--text-muted); font-size: 0.85rem; padding: 4px;">Aucune version enregistrée pour cette activité.</div>`;
      return;
    }

    // Fetch the current version of the activity
    const currentAct = appState.activities.find((a: any) => a.id === activityId);

    let html = "";
    versions.forEach((v: any, index: number) => {
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

        item!.classList.toggle("expanded");
      });
    });

    // Wire up restore buttons
    container.querySelectorAll(".history-item").forEach(item => {
      const vId = item.getAttribute("data-version-id");
      const btn = item.querySelector(".restore-version-btn");
      if (btn) {
        btn.addEventListener("click", e => {
          e.stopPropagation(); // prevent header toggle
          const ver = versions.find((x: any) => x.versionId === vId);
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
  } catch (e: any) {
    logError("activities-history", "chargement de l'historique des versions", e);
    container.innerHTML = `<div style="color: var(--danger-text); font-size: 0.85rem; padding: 4px;">Erreur lors du chargement de l'historique : ${e.message}</div>`;
  }
}

function restoreActivityVersion(versionRecord: any) {
  const currentId = (document.getElementById("form-activity-internal-id") as HTMLInputElement).value;
  if (!currentId) return;

  const idx = appState.activities.findIndex((a: any) => a.id === currentId);
  if (idx === -1) return;

  // Restore the activity data
  const previous = appState.activities[idx];
  appState.activities[idx] = JSON.parse(JSON.stringify(versionRecord.activityData));

  // Re-save DB
  saveDatabaseOrRollback(() => {
    appState.activities[idx] = previous;
    fillActivityFormFields(previous);
    renderActivityStateBar(previous);
  }, "La restauration de version n'a pas été enregistrée. Réessayez.").then(saved => {
    if (!saved) return;

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
  });
}

export { formatTimestampToFrench, saveActivityVersion, computeActivityDiff, loadAndRenderActivityHistory, restoreActivityVersion };
