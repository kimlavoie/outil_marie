/**
 * backup/restore.ts - Restoring the app database from a user-provided JSON backup file: schema
 * validation, the diff/options modal (what to restore), and the resulting read-only activity
 * preview. The modal's static markup lives in restore-modal-html.ts and the actual merge/
 * migration/rollback logic lives in restore-apply.ts — this file wires the two together with the
 * diff computed by diff.ts.
 */
import { appState } from "../../state/state.ts";
import { showToast, escapeHtml } from "../../utils/utils.ts";
import { validateBackupSchema } from "./validation.ts";
import { computeBackupDiff, ActivityDiff } from "./diff.ts";
import { ensureRestoreModalHtml } from "./restore-modal-html.ts";
import { runSelectiveRestore } from "./restore-apply.ts";

// Set right before hiding the restore-options modal to open the activity details preview, and
// consumed by the details modal's close buttons (see initRestoreActivityPreview below) to reopen
// the restore modal instead of leaving the user back at the bare backup view. Mirrors
// returnToDeletedModalAfterPreview in reminder.ts.
let returnToRestoreModalAfterPreview = false;

// Preview reuses the existing read-only "Voir les détails" modal, fed directly from the raw
// activity object found in the uploaded backup file (it never comes from appState, since these
// activities may not exist in the current database yet).
async function previewBackupActivity(act: any) {
  returnToRestoreModalAfterPreview = true;
  document.getElementById("restore-options-modal")?.classList.remove("active");

  const { buildActivityDetailsHtml } = await import("../../activities-dom/print-sheet.ts");
  const content = document.getElementById("activity-details-content");
  if (content) content.innerHTML = buildActivityDetailsHtml(act);
  document.getElementById("activity-details-modal")?.classList.add("active");
}

function handleActivityDetailsModalClosedForRestore() {
  if (!returnToRestoreModalAfterPreview) return;
  returnToRestoreModalAfterPreview = false;
  document.getElementById("restore-options-modal")?.classList.add("active");
}

function initRestoreActivityPreview() {
  document.getElementById("activity-details-modal-close")?.addEventListener("click", handleActivityDetailsModalClosedForRestore);
  document.getElementById("activity-details-modal-close-btn")?.addEventListener("click", handleActivityDetailsModalClosedForRestore);
}

function showRestoreOptionsModal(parsed: any) {
  // Ensure DOM elements exist (fallback for tests)
  ensureRestoreModalHtml();

  const modal = document.getElementById("restore-options-modal")!;
  const backdrop = document.getElementById("modal-backdrop")!;
  const customPanel = document.getElementById("restore-custom-panel")!;
  const specActContainer = document.getElementById("restore-specific-activities-container")!;
  const checklist = document.getElementById("restore-activities-checklist")!;
  const searchInput = document.getElementById("restore-activity-search") as HTMLInputElement;

  // Reset modal state
  modal.classList.add("active");
  backdrop.classList.add("active");

  // Reset inputs to default values
  const modeAll = document.getElementById("restore-mode-all") as HTMLInputElement;
  if (modeAll) modeAll.checked = true;
  customPanel.style.display = "none";
  specActContainer.style.display = "none";
  if (searchInput) searchInput.value = "";

  const actAll = document.getElementById("restore-act-all") as HTMLInputElement;
  if (actAll) actAll.checked = true;

  const importMerge = document.getElementById("restore-import-merge") as HTMLInputElement;
  if (importMerge) importMerge.checked = true;

  // Check all configs by default
  const configCbs = [
    "restore-cb-rooms",
    "restore-cb-salaries",
    "restore-cb-services",
    "restore-cb-accounts",
    "restore-cb-departments",
    "restore-cb-tasks",
    "restore-cb-taxes",
    "restore-cb-preferences"
  ];
  configCbs.forEach(id => {
    const cb = document.getElementById(id) as HTMLInputElement;
    if (cb) cb.checked = true;
  });

  // Update option cards active class
  const updateOptionCards = () => {
    modal.querySelectorAll(".restore-option-card").forEach(card => {
      const radio = card.querySelector("input[type='radio']") as HTMLInputElement;
      card.classList.toggle("active", Boolean(radio && radio.checked));
    });
  };
  updateOptionCards();

  // Wire up option cards radios
  modal.querySelectorAll("input[name='restore-mode']").forEach(radio => {
    (radio as HTMLInputElement).onchange = e => {
      const val = (e.target as HTMLInputElement).value;
      customPanel.style.display = val === "custom" ? "block" : "none";
      updateOptionCards();
    };
  });

  // Wire up activity choice radios
  modal.querySelectorAll("input[name='restore-act-choice']").forEach(radio => {
    (radio as HTMLInputElement).onchange = e => {
      const val = (e.target as HTMLInputElement).value;
      specActContainer.style.display = val === "select" ? "flex" : "none";
      if (val === "select") {
        renderActivitiesList();
      }
    };
  });

  // Calculate diff between uploaded backup and active appState
  const diff = computeBackupDiff(parsed, appState);
  const activityDiffMap = new Map<string, ActivityDiff>();
  diff.activities.all.forEach(d => activityDiffMap.set(d.id, d));

  // Render diff summary card
  const summaryContainer = document.getElementById("restore-diff-summary-card");
  if (summaryContainer) {
    const s = diff.activities.summary;
    summaryContainer.innerHTML = `
      <div style="font-weight: 700; font-size: 0.85rem; margin-bottom: 8px; color: var(--text-primary); display: flex; align-items: center; justify-content: space-between;">
        <span>Aperçu des différences avec l'application actuelle</span>
        <span style="font-size: 0.75rem; font-weight: 400; color: var(--text-secondary);">
          Fichier : ${s.totalBackup} activité(s) | Application : ${s.totalCurrent} activité(s)
        </span>
      </div>
      <div style="display: flex; gap: 8px; flex-wrap: wrap; font-size: 0.8rem;">
        <span id="restore-summary-badge-added" class="badge" style="background-color: var(--success-light, #dcfce7); color: var(--success-text, #166534); padding: 4px 8px; border-radius: var(--radius-sm); font-weight: 600; cursor: pointer;" title="Cliquer pour afficher le détail des nouvelles activités">
          🟢 ${s.addedCount} nouvelle(s) ▾
        </span>
        <span id="restore-summary-badge-modified" class="badge" style="background-color: var(--warning-light, #fef3c7); color: var(--warning-text, #92400e); padding: 4px 8px; border-radius: var(--radius-sm); font-weight: 600; cursor: pointer;" title="Cliquer pour afficher le détail des activités modifiées">
          🟡 ${s.modifiedCount} modifiée(s) ▾
        </span>
        <span id="restore-summary-badge-unchanged" class="badge" style="background-color: var(--border-color); color: var(--text-secondary); padding: 4px 8px; border-radius: var(--radius-sm); cursor: pointer;" title="Cliquer pour filtrer les activités identiques">
          ⚪ ${s.unchangedCount} identique(s)
        </span>
        ${s.appOnlyCount > 0 ? `
        <span id="restore-summary-badge-apponly" class="badge" style="background-color: rgba(244, 63, 94, 0.15); color: var(--danger, #e11d48); padding: 4px 8px; border-radius: var(--radius-sm); font-weight: 600; cursor: pointer;" title="Cliquer pour voir les activités absentes du fichier">
          🔴 ${s.appOnlyCount} non présente(s) dans le fichier ▾
        </span>` : ""}
        <span id="restore-summary-badge-configs" class="badge" style="background-color: var(--info-light, #e0f2fe); color: var(--info-text, #075985); padding: 4px 8px; border-radius: var(--radius-sm); cursor: pointer;" title="Cliquer pour afficher le détail des configurations">
          ⚙️ ${diff.configs.modifiedCount} config(s) modifiée(s) ▾
        </span>
      </div>
      <div id="restore-added-details" style="display: none; font-size: 0.75rem; margin-top: 10px; padding: 10px; border-radius: var(--radius-sm); background-color: var(--bg-card, #fff); border: 1px solid var(--success-text, #166534); flex-direction: column; gap: 6px;"></div>
      <div id="restore-modified-details" style="display: none; font-size: 0.75rem; margin-top: 10px; padding: 10px; border-radius: var(--radius-sm); background-color: var(--bg-card, #fff); border: 1px solid var(--warning-text, #92400e); flex-direction: column; gap: 6px;"></div>
      <div id="restore-app-only-details" style="display: none; font-size: 0.75rem; margin-top: 10px; padding: 10px; border-radius: var(--radius-sm); background-color: var(--bg-card, #fff); border: 1px solid rgba(244, 63, 94, 0.3); flex-direction: column; gap: 6px;"></div>
      <div id="restore-configs-summary-details" style="display: none; font-size: 0.75rem; margin-top: 10px; padding: 10px; border-radius: var(--radius-sm); background-color: var(--bg-card, #fff); border: 1px solid var(--info-text, #075985); flex-direction: column; gap: 6px;"></div>
    `;

    // Populate added details
    const addedDetails = document.getElementById("restore-added-details");
    if (addedDetails) {
      if (diff.activities.added.length > 0) {
        const itemsHtml = diff.activities.added
          .map(a => {
            const act = a.backupActivity || (a as any);
            const dateStr = act.date_start ? ` (${act.date_start})` : "";
            return `<div style="font-size: 0.75rem;">• <strong>${escapeHtml(act.id)}</strong> - ${escapeHtml(act.name || "Sans nom")}${escapeHtml(dateStr)}</div>`;
          })
          .join("");
        addedDetails.innerHTML = `
          <div style="font-weight: 700; color: var(--success-text, #166534);">Nouvelles activités dans le fichier (${diff.activities.added.length}) :</div>
          <div style="max-height: 140px; overflow-y: auto; display: flex; flex-direction: column; gap: 3px;">${itemsHtml}</div>
          <div style="font-size: 0.7rem; color: var(--text-muted); font-style: italic;">Ces activités seront créées dans votre application lors de la restauration.</div>
        `;
      } else {
        addedDetails.innerHTML = `<div style="color: var(--text-muted);">Aucune nouvelle activité dans ce fichier de sauvegarde.</div>`;
      }
    }

    // Populate modified details
    const modifiedDetails = document.getElementById("restore-modified-details");
    if (modifiedDetails) {
      if (diff.activities.modified.length > 0) {
        const itemsHtml = diff.activities.modified
          .map(a => {
            const actName = a.name || a.id;
            const changesText = a.changes.join(", ");
            const fieldRows = (a.fieldDiffs || []).map(fd => `
              <div style="display: flex; gap: 8px; justify-content: space-between; border-bottom: 1px dashed var(--border-color); padding: 2px 0;">
                <strong style="color: var(--text-primary); min-width: 130px;">${escapeHtml(fd.field)} :</strong>
                <span style="color: var(--warning-text, #92400e);">Fichier: <em>${escapeHtml(fd.backupValue)}</em></span>
                <span style="color: var(--text-secondary);">vs App: <em>${escapeHtml(fd.currentValue)}</em></span>
              </div>
            `).join("");

            return `
              <div style="padding: 6px; border: 1px solid var(--border-color); border-radius: var(--radius-sm); background-color: var(--bg-main);">
                <div style="font-weight: 700; color: var(--warning-text, #92400e); margin-bottom: 4px;">
                  • ${escapeHtml(a.id)} - ${escapeHtml(actName)} <span style="font-size: 0.7rem; font-weight: 400;">(${escapeHtml(changesText)})</span>
                </div>
                <div style="display: flex; flex-direction: column; gap: 2px;">${fieldRows}</div>
              </div>
            `;
          })
          .join("");

        modifiedDetails.innerHTML = `
          <div style="font-weight: 700; color: var(--warning-text, #92400e);">Détail des activités modifiées (${diff.activities.modified.length}) :</div>
          <div style="max-height: 200px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px;">${itemsHtml}</div>
        `;
      } else {
        modifiedDetails.innerHTML = `<div style="color: var(--text-muted);">Aucune activité modifiée par rapport à l'application.</div>`;
      }
    }

    // Populate app-only details
    const appOnlyDetails = document.getElementById("restore-app-only-details");
    if (appOnlyDetails && diff.activities.appOnly.length > 0) {
      const itemsHtml = diff.activities.appOnly
        .map(a => `<div style="font-size: 0.75rem;">• <strong>${escapeHtml(a.id)}</strong> - ${escapeHtml(a.name || "Sans nom")}</div>`)
        .join("");
      appOnlyDetails.innerHTML = `
        <div style="font-weight: 700; color: var(--danger, #e11d48);">Activités dans l'application actuelle non présentes dans le fichier :</div>
        <div style="max-height: 120px; overflow-y: auto; display: flex; flex-direction: column; gap: 3px;">${itemsHtml}</div>
        <div style="font-size: 0.7rem; color: var(--text-muted); font-style: italic;">Ces activités resteront inchangées en mode "Fusionner", mais seront effacées si vous choisissez "Écraser les activités existantes".</div>
      `;
    }
  }

  const configLabels: Record<string, string> = {
    rooms: "Salles et Tarifs",
    salaries: "Salaires et main d'œuvre",
    services: "Équipements et Services",
    accounts: "Comptes de Grand Livre",
    departments: "Départements",
    tasks: "Tâches de planification",
    taxes: "Taxes",
    preferences: "Préférences (Thème, rappels...)"
  };

  // Populate configs summary details (mirrors the activities modified-details block above)
  const configsSummaryDetails = document.getElementById("restore-configs-summary-details");
  if (configsSummaryDetails) {
    const modifiedKeys = Object.keys(configLabels).filter(key => diff.configs.categories[key]?.isDifferent);
    if (modifiedKeys.length > 0) {
      const itemsHtml = modifiedKeys
        .map(key => {
          const catDiff = diff.configs.categories[key];
          const changesHtml = (catDiff?.changesList && catDiff.changesList.length > 0)
            ? catDiff.changesList.map(c => `<div style="line-height: 1.4;">${c}</div>`).join("")
            : `<div style="color: var(--text-muted);">Modifié</div>`;
          return `
            <div style="padding: 6px; border: 1px solid var(--border-color); border-radius: var(--radius-sm); background-color: var(--bg-main);">
              <div style="font-weight: 700; color: var(--info-text, #075985); margin-bottom: 4px;">• ${escapeHtml(configLabels[key])}</div>
              <div style="display: flex; flex-direction: column; gap: 2px;">${changesHtml}</div>
            </div>
          `;
        })
        .join("");
      configsSummaryDetails.innerHTML = `
        <div style="font-weight: 700; color: var(--info-text, #075985);">Détail des configurations modifiées (${modifiedKeys.length}) :</div>
        <div style="max-height: 200px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px;">${itemsHtml}</div>
      `;
    } else {
      configsSummaryDetails.innerHTML = `<div style="color: var(--text-muted);">Aucune configuration modifiée par rapport à l'application.</div>`;
    }
  }

  // Update configuration badges & detail containers
  const configKeys = ["rooms", "salaries", "services", "accounts", "departments", "tasks", "taxes", "preferences"];
  configKeys.forEach(key => {
    const badgeEl = document.getElementById(`restore-badge-${key}`);
    const detailsEl = document.getElementById(`restore-details-${key}`);
    const catDiff = diff.configs.categories[key];

    if (detailsEl && catDiff) {
      if (catDiff.changesList && catDiff.changesList.length > 0) {
        detailsEl.innerHTML = catDiff.changesList
          .map(changeStr => `<div style="line-height: 1.4;">${changeStr}</div>`)
          .join("");
      } else {
        detailsEl.innerHTML = `<div style="color: var(--text-muted);">Identique (aucun changement)</div>`;
      }
    }

    if (badgeEl) {
      if (catDiff && catDiff.isDifferent) {
        badgeEl.className = "badge";
        badgeEl.style.cssText = "background-color: var(--warning-light, #fef3c7); color: var(--warning-text, #92400e); font-size: 0.7rem; padding: 2px 6px; border-radius: var(--radius-sm); font-weight: 600; cursor: pointer;";
        badgeEl.textContent = "Modifié ▾";
      } else {
        badgeEl.className = "badge";
        badgeEl.style.cssText = "background-color: var(--border-color); color: var(--text-secondary); font-size: 0.7rem; padding: 2px 6px; border-radius: var(--radius-sm); font-weight: 400; cursor: pointer;";
        badgeEl.textContent = "Identique ▾";
      }

      badgeEl.onclick = e => {
        e.preventDefault();
        e.stopPropagation();
        if (detailsEl) {
          const isHidden = detailsEl.style.display === "none" || !detailsEl.style.display;
          detailsEl.style.display = isHidden ? "flex" : "none";
        }
      };
    }
  });

  // Make config badge on summary card open custom selection & expand modified config details
  const configsBtn = document.getElementById("restore-summary-badge-configs");
  if (configsBtn) {
    configsBtn.onclick = () => {
      toggleSummaryDetail(configsSummaryDetails);
      const customRadio = document.getElementById("restore-mode-custom") as HTMLInputElement;
      if (customRadio) {
        customRadio.checked = true;
        customRadio.dispatchEvent(new Event("change", { bubbles: true }));
      }
      configKeys.forEach(key => {
        const catDiff = diff.configs.categories[key];
        const detailsEl = document.getElementById(`restore-details-${key}`);
        if (detailsEl && catDiff?.isDifferent) {
          detailsEl.style.display = "flex";
        }
      });
    };
  }

  // Populate activities list
  const activities = parsed.activities || [];
  let currentActivityFilter: "all" | "diff" | "same" = "all";
  let autoExpandActivities = false;

  function openCustomActivitySelection(filter: "all" | "diff" | "same", autoExpand = false) {
    const customRadio = document.getElementById("restore-mode-custom") as HTMLInputElement;
    if (customRadio) {
      customRadio.checked = true;
      customRadio.dispatchEvent(new Event("change", { bubbles: true }));
    }
    const specRadio = document.getElementById("restore-act-select") as HTMLInputElement;
    if (specRadio) {
      specRadio.checked = true;
      specRadio.dispatchEvent(new Event("change", { bubbles: true }));
    }
    autoExpandActivities = autoExpand;
    const btnAll = document.getElementById("restore-filter-all");
    const btnDiff = document.getElementById("restore-filter-diff");
    const btnSame = document.getElementById("restore-filter-same");
    if (btnAll && btnDiff && btnSame) {
      currentActivityFilter = filter;
      btnAll.classList.toggle("active", filter === "all");
      btnDiff.classList.toggle("active", filter === "diff");
      btnSame.classList.toggle("active", filter === "same");
      renderActivitiesList();
    }
  }

  const addedDetails = document.getElementById("restore-added-details");
  const modifiedDetails = document.getElementById("restore-modified-details");
  const appOnlyDetails = document.getElementById("restore-app-only-details");

  const toggleSummaryDetail = (target: HTMLElement | null) => {
    [addedDetails, modifiedDetails, appOnlyDetails, configsSummaryDetails].forEach(el => {
      if (!el) return;
      if (el === target) {
        const isHidden = el.style.display === "none" || !el.style.display;
        el.style.display = isHidden ? "flex" : "none";
      } else {
        el.style.display = "none";
      }
    });
  };

  const addedBadgeBtn = document.getElementById("restore-summary-badge-added");
  if (addedBadgeBtn) {
    addedBadgeBtn.onclick = () => {
      toggleSummaryDetail(addedDetails);
      openCustomActivitySelection("diff", true);
    };
  }
  const modifiedBadgeBtn = document.getElementById("restore-summary-badge-modified");
  if (modifiedBadgeBtn) {
    modifiedBadgeBtn.onclick = () => {
      toggleSummaryDetail(modifiedDetails);
      openCustomActivitySelection("diff", true);
    };
  }
  const appOnlyBtn = document.getElementById("restore-summary-badge-apponly");
  if (appOnlyBtn) {
    appOnlyBtn.onclick = () => {
      toggleSummaryDetail(appOnlyDetails);
    };
  }
  const unchangedBadgeBtn = document.getElementById("restore-summary-badge-unchanged");
  if (unchangedBadgeBtn) {
    unchangedBadgeBtn.onclick = () => {
      toggleSummaryDetail(null);
      openCustomActivitySelection("same", false);
    };
  }

  function renderActivitiesList() {
    const liveChecklist = document.getElementById("restore-activities-checklist") || checklist;
    liveChecklist.innerHTML = "";
    if (activities.length === 0) {
      liveChecklist.innerHTML =
        "<div style='font-size: 0.8rem; color: var(--text-muted); text-align: center; padding: 12px;'>Aucune activité dans cette sauvegarde.</div>";
      return;
    }

    const query = searchInput ? searchInput.value.toLowerCase().trim() : "";
    const filtered = activities.filter((a: any) => {
      const name = (a.name || "").toLowerCase();
      const id = (a.id || "").toLowerCase();
      const matchesQuery = name.includes(query) || id.includes(query);
      if (!matchesQuery) return false;

      const actDiff = activityDiffMap.get(a.id);
      if (currentActivityFilter === "diff") {
        return actDiff?.status === "added" || actDiff?.status === "modified";
      } else if (currentActivityFilter === "same") {
        return actDiff?.status === "unchanged";
      }
      return true;
    });

    if (filtered.length === 0) {
      liveChecklist.innerHTML =
        "<div style='font-size: 0.8rem; color: var(--text-muted); text-align: center; padding: 12px;'>Aucun résultat pour cette sélection.</div>";
      return;
    }

    filtered.forEach((a: any) => {
      const wrapper = document.createElement("div");
      wrapper.style.cssText = "display: flex; flex-direction: column; gap: 2px;";

      const item = document.createElement("label");
      item.style.cssText =
        "display: flex; align-items: center; gap: 8px; font-size: 0.8rem; cursor: pointer; padding: 4px; border-radius: var(--radius-sm);";
      item.className = "restore-activity-item";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "restore-activity-cb";
      checkbox.dataset.id = a.id;
      checkbox.checked = true;

      const textSpan = document.createElement("span");
      textSpan.style.cssText =
        "flex-grow: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-decoration: underline dotted;";
      const dateStr = a.date_start ? ` (${a.date_start})` : "";
      textSpan.textContent = `${a.id} - ${a.name || "Sans nom"}${dateStr}`;
      textSpan.title = "Voir l'aperçu complet de l'activité";
      textSpan.onclick = e => {
        e.preventDefault();
        e.stopPropagation();
        previewBackupActivity(a);
      };

      const actDiff = activityDiffMap.get(a.id);
      const diffBadge = document.createElement("span");
      diffBadge.style.cursor = "pointer";

      const detailsPanel = document.createElement("div");
      detailsPanel.style.cssText =
        "display: none; font-size: 0.75rem; margin-left: 24px; padding: 6px 10px; border-radius: var(--radius-sm); background-color: var(--bg-main); border: 1px solid var(--border-color); flex-direction: column; gap: 4px;";

      if (actDiff?.status === "added") {
        diffBadge.style.cssText = "font-size: 0.7rem; padding: 2px 6px; border-radius: var(--radius-sm); font-weight: 600; background-color: var(--success-light, #dcfce7); color: var(--success-text, #166534); cursor: pointer;";
        diffBadge.textContent = "Nouveau ▾";
        detailsPanel.innerHTML = `<div style="color: var(--success-text, #166534); font-weight: 600;">🟢 Activité nouvelle. Absente de votre application, elle sera créée lors de la restauration.</div>`;
      } else if (actDiff?.status === "modified") {
        diffBadge.style.cssText = "font-size: 0.7rem; padding: 2px 6px; border-radius: var(--radius-sm); font-weight: 600; background-color: var(--warning-light, #fef3c7); color: var(--warning-text, #92400e); cursor: pointer;";
        const changesText = actDiff.changes.join(", ");
        diffBadge.textContent = `Modifié (${changesText}) ▾`;
        diffBadge.title = `Changements: ${changesText}`;

        const fieldRows = (actDiff.fieldDiffs || []).map(fd => `
          <div style="display: flex; gap: 8px; justify-content: space-between; border-bottom: 1px dashed var(--border-color); padding-bottom: 2px;">
            <strong style="color: var(--text-primary); min-width: 140px;">${fd.field} :</strong>
            <span style="color: var(--warning-text, #92400e);">Fichier: <em>${fd.backupValue}</em></span>
            <span style="color: var(--text-secondary);">vs Application: <em>${fd.currentValue}</em></span>
          </div>
        `).join("");

        detailsPanel.innerHTML = `
          <div style="font-weight: 600; color: var(--text-primary); margin-bottom: 4px;">Changements comparés (Fichier de sauvegarde vs Application actuelle) :</div>
          <div style="display: flex; flex-direction: column; gap: 3px;">${fieldRows}</div>
        `;
      } else {
        diffBadge.style.cssText = "font-size: 0.7rem; padding: 2px 6px; border-radius: var(--radius-sm); font-weight: 400; background-color: var(--border-color); color: var(--text-secondary); cursor: pointer;";
        diffBadge.textContent = "Identique ▾";
        detailsPanel.innerHTML = `<div style="color: var(--text-muted);">⚪ Activité strictement identique entre le fichier et l'application.</div>`;
      }

      diffBadge.onclick = e => {
        e.preventDefault();
        e.stopPropagation();
        const isHidden = detailsPanel.style.display === "none" || !detailsPanel.style.display;
        detailsPanel.style.display = isHidden ? "flex" : "none";
      };

      if (autoExpandActivities && (actDiff?.status === "added" || actDiff?.status === "modified")) {
        detailsPanel.style.display = "flex";
      }

      const stateBadge = document.createElement("span");
      stateBadge.style.cssText = "font-size: 0.7rem; padding: 2px 6px; border-radius: var(--radius-full); font-weight: 600;";

      if (a.state === "facture") {
        stateBadge.style.backgroundColor = "var(--success-light)";
        stateBadge.style.color = "var(--success-text)";
        stateBadge.textContent = "Facturé";
      } else if (a.state === "approuve") {
        stateBadge.style.backgroundColor = "var(--info-light)";
        stateBadge.style.color = "var(--info-text)";
        stateBadge.textContent = "Approuvé";
      } else {
        stateBadge.style.backgroundColor = "var(--border-color)";
        stateBadge.style.color = "var(--text-secondary)";
        stateBadge.textContent = a.state || "Brouillon";
      }

      item.appendChild(checkbox);
      item.appendChild(textSpan);
      item.appendChild(diffBadge);
      item.appendChild(stateBadge);

      wrapper.appendChild(item);
      wrapper.appendChild(detailsPanel);
      liveChecklist.appendChild(wrapper);
    });
  }

  // Wire up filter tab buttons
  const btnFilterAll = document.getElementById("restore-filter-all");
  const btnFilterDiff = document.getElementById("restore-filter-diff");
  const btnFilterSame = document.getElementById("restore-filter-same");

  if (btnFilterAll && btnFilterDiff && btnFilterSame) {
    const updateFilterTabs = (activeFilter: "all" | "diff" | "same") => {
      currentActivityFilter = activeFilter;
      btnFilterAll.classList.toggle("active", activeFilter === "all");
      btnFilterDiff.classList.toggle("active", activeFilter === "diff");
      btnFilterSame.classList.toggle("active", activeFilter === "same");
      renderActivitiesList();
    };

    btnFilterAll.onclick = (e) => { e.preventDefault(); updateFilterTabs("all"); };
    btnFilterDiff.onclick = (e) => { e.preventDefault(); updateFilterTabs("diff"); };
    btnFilterSame.onclick = (e) => { e.preventDefault(); updateFilterTabs("same"); };
  }

  // Bind search input
  if (searchInput) {
    searchInput.oninput = () => {
      renderActivitiesList();
    };
  }

  // Bind Select all / Deselect all
  const selectAllBtn = document.getElementById("restore-act-btn-select-all");
  if (selectAllBtn) {
    selectAllBtn.onclick = e => {
      e.preventDefault();
      checklist.querySelectorAll(".restore-activity-cb").forEach((cb: any) => ((cb as HTMLInputElement).checked = true));
    };
  }

  const deselectAllBtn = document.getElementById("restore-act-btn-deselect-all");
  if (deselectAllBtn) {
    deselectAllBtn.onclick = e => {
      e.preventDefault();
      checklist.querySelectorAll(".restore-activity-cb").forEach((cb: any) => ((cb as HTMLInputElement).checked = false));
    };
  }

  renderActivitiesList();

  // Close modal helper
  const closeModal = () => {
    modal.classList.remove("active");
    backdrop.classList.remove("active");
  };

  // Bind cancel buttons
  const closeBtn = document.getElementById("restore-options-modal-close");
  if (closeBtn) closeBtn.onclick = closeModal;

  const cancelBtn = document.getElementById("restore-options-modal-cancel");
  if (cancelBtn) cancelBtn.onclick = closeModal;

  // Bind submit button
  const submitBtn = document.getElementById("restore-options-modal-submit");
  if (submitBtn) {
    const handleSubmit = async () => {
      const mode = (modal.querySelector("input[name='restore-mode']:checked") as HTMLInputElement).value;

      let restoreConfigs = false;
      let restoreAllActivities = false;
      let restoreSpecificActivities = false;

      const customOptions = {
        rooms: false,
        salaries: false,
        services: false,
        accounts: false,
        departments: false,
        tasks: false,
        taxes: false,
        preferences: false
      };

      const selectedActIds: string[] = [];
      let importMode = "merge";

      if (mode === "all") {
        restoreConfigs = true;
        restoreAllActivities = true;
      } else if (mode === "config") {
        restoreConfigs = true;
      } else if (mode === "activities") {
        restoreAllActivities = true;
      } else if (mode === "custom") {
        customOptions.rooms = (document.getElementById("restore-cb-rooms") as HTMLInputElement).checked;
        customOptions.salaries = (document.getElementById("restore-cb-salaries") as HTMLInputElement).checked;
        customOptions.services = (document.getElementById("restore-cb-services") as HTMLInputElement).checked;
        customOptions.accounts = (document.getElementById("restore-cb-accounts") as HTMLInputElement).checked;
        customOptions.departments = (document.getElementById("restore-cb-departments") as HTMLInputElement).checked;
        customOptions.tasks = (document.getElementById("restore-cb-tasks") as HTMLInputElement).checked;
        customOptions.taxes = (document.getElementById("restore-cb-taxes") as HTMLInputElement).checked;
        customOptions.preferences = (document.getElementById("restore-cb-preferences") as HTMLInputElement).checked;

        const actChoice = (modal.querySelector("input[name='restore-act-choice']:checked") as HTMLInputElement).value;
        if (actChoice === "all") {
          restoreAllActivities = true;
        } else {
          restoreSpecificActivities = true;
          checklist.querySelectorAll(".restore-activity-cb:checked").forEach((cb: any) => {
            selectedActIds.push(cb.dataset.id);
          });
          importMode = (modal.querySelector("input[name='restore-import-mode']:checked") as HTMLInputElement).value;
        }

        const anyConfigSelected = Object.values(customOptions).some(v => v);
        if (!anyConfigSelected && !restoreAllActivities && (!restoreSpecificActivities || selectedActIds.length === 0)) {
          showToast("Veuillez sélectionner au moins un élément à restaurer.", "warning");
          return;
        }
      }

      if (confirm("La restauration va modifier vos données actuelles. Voulez-vous continuer ?")) {
        closeModal();
        await runSelectiveRestore(parsed, {
          restoreConfigs,
          restoreAllActivities,
          restoreSpecificActivities,
          customOptions,
          selectedActIds,
          importMode
        });
      }
    };

    submitBtn.onclick = handleSubmit;
    submitBtn.addEventListener("click", handleSubmit);
  }
}

function handleJsonBackupFile(file: File) {
  const reader = new FileReader();

  reader.onload = async function (e) {
    try {
      const result = e.target?.result;
      if (typeof result !== "string") return;
      const parsed = JSON.parse(result);
      const validation = validateBackupSchema(parsed);
      if (!validation.valid) {
        console.log("BACKUP VALIDATION FAILED:", validation.error);
        showToast("Échec de la validation : " + validation.error, "error", 6000);
        return;
      }

      showRestoreOptionsModal(parsed);
    } catch (err: any) {
      showToast("Erreur lors de la lecture du fichier JSON : " + err.message, "error");
    }
  };

  reader.readAsText(file);
}

export { handleJsonBackupFile, initRestoreActivityPreview };
