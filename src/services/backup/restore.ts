/**
 * backup/restore.ts - Restoring the app database from a user-provided JSON backup file: schema
 * validation, a pre-restore safety snapshot, migrating the restored data to the current format,
 * and rolling back in place if that migration fails.
 */
import { logError } from "../../utils/logger.ts";
import {
  appState,
  setAppState,
  saveDatabase,
  saveSafetyBackupToDb,
  sanitizeActivitiesList,
  migrateRoomsConfig,
  migrateSalariesConfig,
  migrateActivities,
  clearAllActivityVersionsFromDb
} from "../../state/state.ts";
import { showToast, escapeHtml } from "../../utils/utils.ts";
import { DEFAULT_CONFIG } from "../../state/config-defaults.ts";
import { validateBackupSchema } from "./validation.ts";
import { checkBackupReminder, renderSafetyBackupsList } from "./reminder.ts";
import { computeBackupDiff, ActivityDiff } from "./diff.ts";

function ensureRestoreModalHtml() {
  document.getElementById("restore-options-modal")?.remove();

  const modalHtml = `
    <div
      id="restore-options-modal"
      class="modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="restore-options-modal-title"
      style="width: 780px"
    >
      <div class="modal-header">
        <h3 class="modal-title" id="restore-options-modal-title">Options de restauration et aperçu</h3>
        <button id="restore-options-modal-close" class="btn-icon" aria-label="Fermer">
          <svg viewBox="0 0 24 24">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
          </svg>
        </button>
      </div>
      <div class="modal-content">
        <p style="font-size: 0.9rem; color: var(--text-secondary); margin-top: 0; margin-bottom: 16px;">
          Choisissez ce que vous souhaitez restaurer à partir du fichier de sauvegarde. La base de données actuelle sera écrasée ou fusionnée selon vos choix.
        </p>

        <!-- Diff Preview Summary Card -->
        <div id="restore-diff-summary-card" style="margin-bottom: 20px; padding: 14px 16px; border: 1px solid var(--border-color); border-radius: var(--radius-md); background-color: var(--bg-main);"></div>

        <!-- Main Options Grid -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px;">
          <label class="restore-option-card active" for="restore-mode-all">
            <input type="radio" id="restore-mode-all" name="restore-mode" value="all" checked />
            <div>
              <strong style="display: block; font-size: 0.95rem; margin-bottom: 4px;">Tout restaurer</strong>
              <span style="font-size: 0.8rem; color: var(--text-muted);">Importe l'intégralité du fichier (configurations et activités). Écrase les données existantes.</span>
            </div>
          </label>

          <label class="restore-option-card" for="restore-mode-config">
            <input type="radio" id="restore-mode-config" name="restore-mode" value="config" />
            <div>
              <strong style="display: block; font-size: 0.95rem; margin-bottom: 4px;">Configurations seulement</strong>
              <span style="font-size: 0.8rem; color: var(--text-muted);">Restaure uniquement les paramètres (tarifs, comptes, salaires...). Les activités courantes restent inchangées.</span>
            </div>
          </label>

          <label class="restore-option-card" for="restore-mode-activities">
            <input type="radio" id="restore-mode-activities" name="restore-mode" value="activities" />
            <div>
              <strong style="display: block; font-size: 0.95rem; margin-bottom: 4px;">Activités seulement</strong>
              <span style="font-size: 0.8rem; color: var(--text-muted);">Restaure uniquement les activités et les favoris. Les configurations et paramètres actuels restent inchangées.</span>
            </div>
          </label>

          <label class="restore-option-card" for="restore-mode-custom">
            <input type="radio" id="restore-mode-custom" name="restore-mode" value="custom" />
            <div>
              <strong style="display: block; font-size: 0.95rem; margin-bottom: 4px;">Sélection personnalisée</strong>
              <span style="font-size: 0.8rem; color: var(--text-muted);">Choisissez précisément quels types de données ou quelles activités individuelles vous souhaitez restaurer.</span>
            </div>
          </label>
        </div>

        <!-- Custom Selection Sub-panel (hidden by default) -->
        <div id="restore-custom-panel" style="display: none; border-top: 1px solid var(--border-color); padding-top: 20px;">
          <div style="display: grid; grid-template-columns: 1fr 1.2fr; gap: 24px;">
            <!-- Left column: Config selection -->
            <div style="border-right: 1px solid var(--border-color); padding-right: 16px;">
              <h4 style="font-size: 0.95rem; font-weight: 700; margin-top: 0; margin-bottom: 12px; color: var(--text-primary)">Configurations</h4>
              <div style="display: flex; flex-direction: column; gap: 10px;">
                <div>
                  <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 0.85rem;">
                    <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; flex-grow: 1;">
                      <input type="checkbox" id="restore-cb-rooms" checked />
                      Salles et Tarifs
                    </label>
                    <span id="restore-badge-rooms" style="cursor: pointer;" title="Cliquer pour voir les détails"></span>
                  </div>
                  <div id="restore-details-rooms" class="restore-config-details" style="display: none; font-size: 0.75rem; margin-top: 4px; margin-left: 24px; padding: 6px 10px; border-radius: var(--radius-sm); background-color: var(--bg-main); border: 1px solid var(--border-color); flex-direction: column; gap: 4px;"></div>
                </div>

                <div>
                  <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 0.85rem;">
                    <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; flex-grow: 1;">
                      <input type="checkbox" id="restore-cb-salaries" checked />
                      Salaires et main d'œuvre
                    </label>
                    <span id="restore-badge-salaries" style="cursor: pointer;" title="Cliquer pour voir les détails"></span>
                  </div>
                  <div id="restore-details-salaries" class="restore-config-details" style="display: none; font-size: 0.75rem; margin-top: 4px; margin-left: 24px; padding: 6px 10px; border-radius: var(--radius-sm); background-color: var(--bg-main); border: 1px solid var(--border-color); flex-direction: column; gap: 4px;"></div>
                </div>

                <div>
                  <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 0.85rem;">
                    <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; flex-grow: 1;">
                      <input type="checkbox" id="restore-cb-services" checked />
                      Équipements et Services
                    </label>
                    <span id="restore-badge-services" style="cursor: pointer;" title="Cliquer pour voir les détails"></span>
                  </div>
                  <div id="restore-details-services" class="restore-config-details" style="display: none; font-size: 0.75rem; margin-top: 4px; margin-left: 24px; padding: 6px 10px; border-radius: var(--radius-sm); background-color: var(--bg-main); border: 1px solid var(--border-color); flex-direction: column; gap: 4px;"></div>
                </div>

                <div>
                  <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 0.85rem;">
                    <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; flex-grow: 1;">
                      <input type="checkbox" id="restore-cb-accounts" checked />
                      Comptes de Grand Livre
                    </label>
                    <span id="restore-badge-accounts" style="cursor: pointer;" title="Cliquer pour voir les détails"></span>
                  </div>
                  <div id="restore-details-accounts" class="restore-config-details" style="display: none; font-size: 0.75rem; margin-top: 4px; margin-left: 24px; padding: 6px 10px; border-radius: var(--radius-sm); background-color: var(--bg-main); border: 1px solid var(--border-color); flex-direction: column; gap: 4px;"></div>
                </div>

                <div>
                  <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 0.85rem;">
                    <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; flex-grow: 1;">
                      <input type="checkbox" id="restore-cb-departments" checked />
                      Départements
                    </label>
                    <span id="restore-badge-departments" style="cursor: pointer;" title="Cliquer pour voir les détails"></span>
                  </div>
                  <div id="restore-details-departments" class="restore-config-details" style="display: none; font-size: 0.75rem; margin-top: 4px; margin-left: 24px; padding: 6px 10px; border-radius: var(--radius-sm); background-color: var(--bg-main); border: 1px solid var(--border-color); flex-direction: column; gap: 4px;"></div>
                </div>

                <div>
                  <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 0.85rem;">
                    <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; flex-grow: 1;">
                      <input type="checkbox" id="restore-cb-tasks" checked />
                      Tâches de planification
                    </label>
                    <span id="restore-badge-tasks" style="cursor: pointer;" title="Cliquer pour voir les détails"></span>
                  </div>
                  <div id="restore-details-tasks" class="restore-config-details" style="display: none; font-size: 0.75rem; margin-top: 4px; margin-left: 24px; padding: 6px 10px; border-radius: var(--radius-sm); background-color: var(--bg-main); border: 1px solid var(--border-color); flex-direction: column; gap: 4px;"></div>
                </div>

                <div>
                  <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 0.85rem;">
                    <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; flex-grow: 1;">
                      <input type="checkbox" id="restore-cb-taxes" checked />
                      Taxes
                    </label>
                    <span id="restore-badge-taxes" style="cursor: pointer;" title="Cliquer pour voir les détails"></span>
                  </div>
                  <div id="restore-details-taxes" class="restore-config-details" style="display: none; font-size: 0.75rem; margin-top: 4px; margin-left: 24px; padding: 6px 10px; border-radius: var(--radius-sm); background-color: var(--bg-main); border: 1px solid var(--border-color); flex-direction: column; gap: 4px;"></div>
                </div>

                <div>
                  <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 0.85rem;">
                    <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; flex-grow: 1;">
                      <input type="checkbox" id="restore-cb-preferences" checked />
                      Préférences (Thème, rappels...)
                    </label>
                    <span id="restore-badge-preferences" style="cursor: pointer;" title="Cliquer pour voir les détails"></span>
                  </div>
                  <div id="restore-details-preferences" class="restore-config-details" style="display: none; font-size: 0.75rem; margin-top: 4px; margin-left: 24px; padding: 6px 10px; border-radius: var(--radius-sm); background-color: var(--bg-main); border: 1px solid var(--border-color); flex-direction: column; gap: 4px;"></div>
                </div>
              </div>
            </div>

            <!-- Right column: Activities selection -->
            <div>
              <h4 style="font-size: 0.95rem; font-weight: 700; margin-top: 0; margin-bottom: 12px; color: var(--text-primary)">Activités et données</h4>
              
              <div style="display: flex; flex-direction: column; gap: 12px;">
                <label style="display: flex; align-items: center; gap: 8px; font-size: 0.85rem; cursor: pointer;">
                  <input type="radio" id="restore-act-all" name="restore-act-choice" value="all" checked />
                  Toutes les activités et favoris
                </label>
                
                <label style="display: flex; align-items: center; gap: 8px; font-size: 0.85rem; cursor: pointer;">
                  <input type="radio" id="restore-act-select" name="restore-act-choice" value="select" />
                  Sélectionner des activités spécifiques
                </label>

                <!-- Activities specific selection container (hidden by default) -->
                <div id="restore-specific-activities-container" style="display: none; flex-direction: column; gap: 8px; border: 1px solid var(--border-color); padding: 12px; border-radius: var(--radius-sm); background-color: var(--bg-main);">
                  
                  <!-- Diff Filter Tabs -->
                  <div id="restore-diff-filter-tabs" style="display: flex; gap: 4px; border-bottom: 1px solid var(--border-color); padding-bottom: 6px; margin-bottom: 4px;">
                    <button type="button" class="btn btn-secondary active" id="restore-filter-all" style="font-size: 0.75rem; padding: 2px 8px;">Toutes</button>
                    <button type="button" class="btn btn-secondary" id="restore-filter-diff" style="font-size: 0.75rem; padding: 2px 8px;">Modifications / Nouveautés</button>
                    <button type="button" class="btn btn-secondary" id="restore-filter-same" style="font-size: 0.75rem; padding: 2px 8px;">Identiques</button>
                  </div>

                  <!-- Search input -->
                  <input type="text" id="restore-activity-search" class="form-input" placeholder="Rechercher une activité..." style="font-size: 0.8rem; padding: 6px 10px; margin-bottom: 4px;" />
                  
                  <!-- Select all / none links -->
                  <div style="display: flex; justify-content: space-between; font-size: 0.75rem; margin-bottom: 4px;">
                    <a href="#" id="restore-act-btn-select-all" style="color: var(--primary); text-decoration: none; font-weight: 600;">Tout sélectionner</a>
                    <a href="#" id="restore-act-btn-deselect-all" style="color: var(--text-muted); text-decoration: none; font-weight: 600;">Tout désélectionner</a>
                  </div>

                  <!-- Scrollable checklist of activities -->
                  <div id="restore-activities-checklist" class="restore-activities-list" style="max-height: 180px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; padding: 4px;">
                    <!-- Populated dynamically via JS -->
                  </div>

                  <!-- Import Mode selection -->
                  <div style="border-top: 1px solid var(--border-color); margin-top: 8px; padding-top: 8px;">
                    <span style="font-size: 0.8rem; font-weight: 600; display: block; margin-bottom: 6px;">Mode d'importation :</span>
                    <div style="display: flex; gap: 16px;">
                      <label style="display: flex; align-items: center; gap: 6px; font-size: 0.75rem; cursor: pointer;">
                        <input type="radio" id="restore-import-merge" name="restore-import-mode" value="merge" checked />
                        Fusionner avec l'existant
                      </label>
                      <label style="display: flex; align-items: center; gap: 6px; font-size: 0.75rem; cursor: pointer;">
                        <input type="radio" id="restore-import-replace" name="restore-import-mode" value="replace" />
                        Écraser les activités existantes
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button id="restore-options-modal-cancel" class="btn btn-secondary">Annuler</button>
        <button id="restore-options-modal-submit" class="btn btn-primary">Restaurer</button>
      </div>
    </div>
  `;

  const wrapper = document.createElement("div");
  wrapper.innerHTML = modalHtml.trim();
  const modalNode = wrapper.firstElementChild!;
  document.body.appendChild(modalNode);

  // Ensure backdrop exists too
  if (!document.getElementById("modal-backdrop")) {
    const backdrop = document.createElement("div");
    backdrop.id = "modal-backdrop";
    backdrop.className = "modal-backdrop";
    backdrop.setAttribute("role", "presentation");
    document.body.appendChild(backdrop);
  }
}

async function runSelectiveRestore(
  parsed: any,
  options: {
    restoreConfigs: boolean;
    restoreAllActivities: boolean;
    restoreSpecificActivities: boolean;
    customOptions: Record<string, boolean>;
    selectedActIds: string[];
    importMode: string;
  }
) {
  const preRestoreSnapshot = JSON.parse(JSON.stringify(appState));
  try {
    await saveSafetyBackupToDb("avant_restauration", preRestoreSnapshot);
  } catch (err) {
    logError("backup", "sauvegarde de sécurité avant restauration", err);
  }
  renderSafetyBackupsList();

  try {
    // Clone appState to apply changes selectively
    const tempState = JSON.parse(JSON.stringify(appState));

    // Restore whole configurations (settings)
    if (options.restoreConfigs) {
      tempState.settings = parsed.settings;
    } else if (options.customOptions) {
      // Restore individual configurations
      if (!tempState.settings) {
        tempState.settings = {
          theme: "dark",
          rooms: [],
          departments: [],
          accounts: [],
          last_backup_date: "",
          backup_reminder_days: 7,
          salaries: [],
          services: [],
          global_tasks: [],
          schedulable_tasks: [],
          tax_rates: { ...DEFAULT_CONFIG.tax_rates }
        };
      }

      if (options.customOptions.rooms) {
        tempState.settings.rooms = parsed.settings?.rooms || [];
      }
      if (options.customOptions.salaries) {
        tempState.settings.salaries = parsed.settings?.salaries || [];
      }
      if (options.customOptions.services) {
        tempState.settings.services = parsed.settings?.services || [];
      }
      if (options.customOptions.accounts) {
        tempState.settings.accounts = parsed.settings?.accounts || [];
      }
      if (options.customOptions.departments) {
        tempState.settings.departments = parsed.settings?.departments || [];
      }
      if (options.customOptions.tasks) {
        tempState.settings.global_tasks = parsed.settings?.global_tasks || [];
        tempState.settings.schedulable_tasks = parsed.settings?.schedulable_tasks || [];
      }
      if (options.customOptions.taxes) {
        tempState.settings.tax_rates = parsed.settings?.tax_rates || { ...DEFAULT_CONFIG.tax_rates };
      }
      if (options.customOptions.preferences) {
        tempState.settings.theme = parsed.settings?.theme || "dark";
        tempState.settings.backup_reminder_days = parsed.settings?.backup_reminder_days || 7;
        tempState.settings.last_backup_date = parsed.settings?.last_backup_date || "";
      }
    }

    // Restore activities
    if (options.restoreAllActivities) {
      tempState.activities = parsed.activities || [];
      tempState.favorites = parsed.favorites || [];
    } else if (options.restoreSpecificActivities) {
      const selectedBackupActs = (parsed.activities || []).filter((a: any) => options.selectedActIds.includes(a.id));

      if (options.importMode === "replace") {
        tempState.activities = selectedBackupActs;
        tempState.favorites = (parsed.favorites || []).filter((id: string) => options.selectedActIds.includes(id));
      } else {
        // merge mode
        const currentActivities = [...tempState.activities];
        selectedBackupActs.forEach((newAct: any) => {
          const idx = currentActivities.findIndex((a: any) => a.id === newAct.id);
          if (idx !== -1) {
            currentActivities[idx] = newAct;
          } else {
            currentActivities.push(newAct);
          }
        });
        tempState.activities = currentActivities;

        // merge favorites
        const backupFavs = (parsed.favorites || []).filter((id: string) => options.selectedActIds.includes(id));
        const mergedFavs = [...(tempState.favorites || [])];
        backupFavs.forEach((favId: string) => {
          if (!mergedFavs.includes(favId)) {
            mergedFavs.push(favId);
          }
        });
        tempState.favorites = mergedFavs;
      }
    }

    // Apply sanitization and defaults on the tempState
    setAppState(tempState);
    appState.activities = sanitizeActivitiesList(appState.activities);

    if (!appState.favorites) appState.favorites = [];
    if (!appState.settings) {
      appState.settings = {
        theme: "dark",
        rooms: [],
        departments: [],
        accounts: [],
        last_backup_date: "",
        backup_reminder_days: 7,
        salaries: [],
        services: [],
        global_tasks: [],
        schedulable_tasks: [],
        tax_rates: { ...DEFAULT_CONFIG.tax_rates }
      };
    }
    if (!appState.settings.rooms) appState.settings.rooms = [];
    if (!appState.settings.salaries) appState.settings.salaries = [];
    if (!appState.settings.services) appState.settings.services = [];
    if (!appState.settings.schedulable_tasks) appState.settings.schedulable_tasks = [];
    if (!appState.settings.tax_rates) appState.settings.tax_rates = { ...DEFAULT_CONFIG.tax_rates };
    if (appState.settings.last_backup_date === undefined) appState.settings.last_backup_date = "";
    appState.settings.backup_reminder_days = parseInt(appState.settings.backup_reminder_days as any, 10);
    if (isNaN(appState.settings.backup_reminder_days)) {
      appState.settings.backup_reminder_days = 7;
    }

    if (appState.settings && appState.settings.accounts) {
      appState.settings.accounts.sort((a, b) => a.code.localeCompare(b.code));
    }

    // Run migrations
    try {
      migrateRoomsConfig(appState.settings.rooms);
      migrateActivities(appState.activities, appState.settings);
      migrateSalariesConfig(appState.settings.salaries);
    } catch (err) {
      logError("backup", "migration des données lors de la restauration", err);
      setAppState(preRestoreSnapshot);
      try {
        await saveDatabase();
      } catch (saveErr) {
        logError("backup", "réécriture des données pré-restauration après échec de migration", saveErr);
      }
      showToast(
        "La restauration a échoué pendant la mise à jour du format des données. Vos données précédentes ont été restaurées. Veuillez recharger la page.",
        "error",
        12000
      );
      return;
    }

    try {
      await clearAllActivityVersionsFromDb();
    } catch (err) {
      logError("backup", "suppression des versions lors de la restauration", err);
    }
    await saveDatabase();

    // UI update
    const { applyTheme, renderAll } = await import("../../navigation.ts");
    applyTheme(appState.settings.theme || "dark");
    renderAll();
    checkBackupReminder();
    showToast("Base de données restaurée avec succès !", "success");
  } catch (err: any) {
    logError("backup", "restauration sélective des données", err);
    setAppState(preRestoreSnapshot);
    await saveDatabase();
    showToast("Une erreur est survenue lors de la restauration. Vos données initiales ont été restaurées.", "error");
  }
}

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

  const { buildActivityDetailsHtml } = await import("../../activities/print-sheet.ts");
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
