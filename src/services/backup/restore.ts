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
import { showToast } from "../../utils/utils.ts";
import { DEFAULT_CONFIG } from "../../state/config-defaults.ts";
import { validateBackupSchema } from "./validation.ts";
import { checkBackupReminder, renderSafetyBackupsList } from "./reminder.ts";

function ensureRestoreModalHtml() {
  if (document.getElementById("restore-options-modal")) return;

  const modalHtml = `
    <div
      id="restore-options-modal"
      class="modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="restore-options-modal-title"
      style="width: 750px"
    >
      <div class="modal-header">
        <h3 class="modal-title" id="restore-options-modal-title">Options de restauration</h3>
        <button id="restore-options-modal-close" class="btn-icon" aria-label="Fermer">
          <svg viewBox="0 0 24 24">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
          </svg>
        </button>
      </div>
      <div class="modal-content">
        <p style="font-size: 0.9rem; color: var(--text-secondary); margin-top: 0">
          Choisissez ce que vous souhaitez restaurer à partir du fichier de sauvegarde. La base de données actuelle sera écrasée ou fusionnée selon vos choix.
        </p>

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
                <label style="display: flex; align-items: center; gap: 8px; font-size: 0.85rem; cursor: pointer;">
                  <input type="checkbox" id="restore-cb-rooms" checked />
                  Salles et Tarifs
                </label>
                <label style="display: flex; align-items: center; gap: 8px; font-size: 0.85rem; cursor: pointer;">
                  <input type="checkbox" id="restore-cb-salaries" checked />
                  Salaires et main d'œuvre
                </label>
                <label style="display: flex; align-items: center; gap: 8px; font-size: 0.85rem; cursor: pointer;">
                  <input type="checkbox" id="restore-cb-services" checked />
                  Équipements et Services
                </label>
                <label style="display: flex; align-items: center; gap: 8px; font-size: 0.85rem; cursor: pointer;">
                  <input type="checkbox" id="restore-cb-accounts" checked />
                  Comptes de Grand Livre
                </label>
                <label style="display: flex; align-items: center; gap: 8px; font-size: 0.85rem; cursor: pointer;">
                  <input type="checkbox" id="restore-cb-departments" checked />
                  Départements
                </label>
                <label style="display: flex; align-items: center; gap: 8px; font-size: 0.85rem; cursor: pointer;">
                  <input type="checkbox" id="restore-cb-tasks" checked />
                  Tâches de planification
                </label>
                <label style="display: flex; align-items: center; gap: 8px; font-size: 0.85rem; cursor: pointer;">
                  <input type="checkbox" id="restore-cb-taxes" checked />
                  Taxes
                </label>
                <label style="display: flex; align-items: center; gap: 8px; font-size: 0.85rem; cursor: pointer;">
                  <input type="checkbox" id="restore-cb-preferences" checked />
                  Préférences (Thème, rappels...)
                </label>
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
                <div id="restore-specific-activities-container" style="display: none; flex-direction: column; gap: 8px; margin-left: 20px; border: 1px solid var(--border-color); padding: 12px; border-radius: var(--radius-sm); background-color: var(--bg-main);">
                  <!-- Search input -->
                  <input type="text" id="restore-activity-search" class="form-input" placeholder="Rechercher une activité..." style="font-size: 0.8rem; padding: 6px 10px; margin-bottom: 8px;" />
                  
                  <!-- Select all / none links -->
                  <div style="display: flex; justify-content: space-between; font-size: 0.75rem; margin-bottom: 8px;">
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
  let searchInput = document.getElementById("restore-activity-search") as HTMLInputElement;

  // Reset modal state
  modal.classList.add("active");
  backdrop.classList.add("active");

  // Reset inputs
  (document.getElementById("restore-mode-all") as HTMLInputElement).checked = true;
  customPanel.style.display = "none";
  specActContainer.style.display = "none";
  searchInput.value = "";
  (document.getElementById("restore-act-all") as HTMLInputElement).checked = true;
  (document.getElementById("restore-import-merge") as HTMLInputElement).checked = true;

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
  const cards = modal.querySelectorAll(".restore-option-card");
  cards.forEach(card => {
    const radio = card.querySelector("input[type='radio']") as HTMLInputElement;
    card.classList.toggle("active", radio.checked);
  });

  // Wire up option cards radios
  const modeRadios = modal.querySelectorAll("input[name='restore-mode']");
  modeRadios.forEach(radio => {
    radio.replaceWith(radio.cloneNode(true)); // remove old listeners
  });
  const newModeRadios = modal.querySelectorAll("input[name='restore-mode']");
  newModeRadios.forEach(radio => {
    radio.addEventListener("change", e => {
      const val = (e.target as HTMLInputElement).value;
      customPanel.style.display = val === "custom" ? "block" : "none";

      // update card active classes
      newModeRadios.forEach(r => {
        const card = r.closest(".restore-option-card")!;
        card.classList.toggle("active", (r as HTMLInputElement).checked);
      });
    });
  });

  // Wire up activity choice radios
  const actChoiceRadios = modal.querySelectorAll("input[name='restore-act-choice']");
  actChoiceRadios.forEach(radio => {
    radio.replaceWith(radio.cloneNode(true));
  });
  const newActChoiceRadios = modal.querySelectorAll("input[name='restore-act-choice']");
  newActChoiceRadios.forEach(radio => {
    radio.addEventListener("change", e => {
      const val = (e.target as HTMLInputElement).value;
      specActContainer.style.display = val === "select" ? "flex" : "none";
    });
  });

  // Populate activities list
  const activities = parsed.activities || [];
  function renderActivitiesList() {
    checklist.innerHTML = "";
    if (activities.length === 0) {
      checklist.innerHTML =
        "<div style='font-size: 0.8rem; color: var(--text-muted); text-align: center; padding: 12px;'>Aucune activité dans cette sauvegarde.</div>";
      return;
    }

    const query = searchInput.value.toLowerCase().trim();
    const filtered = activities.filter((a: any) => {
      const name = (a.name || "").toLowerCase();
      const id = (a.id || "").toLowerCase();
      return name.includes(query) || id.includes(query);
    });

    if (filtered.length === 0) {
      checklist.innerHTML =
        "<div style='font-size: 0.8rem; color: var(--text-muted); text-align: center; padding: 12px;'>Aucun résultat.</div>";
      return;
    }

    filtered.forEach((a: any) => {
      const item = document.createElement("label");
      item.style.cssText =
        "display: flex; align-items: center; gap: 8px; font-size: 0.8rem; cursor: pointer; padding: 4px; border-radius: var(--radius-sm);";
      item.className = "restore-activity-item";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "restore-activity-cb";
      checkbox.dataset.id = a.id;
      checkbox.checked = true; // checked by default

      const textSpan = document.createElement("span");
      textSpan.style.cssText =
        "flex-grow: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-decoration: underline dotted;";
      const dateStr = a.date_start ? ` (${a.date_start})` : "";
      textSpan.textContent = `${a.id} - ${a.name || "Sans nom"}${dateStr}`;
      textSpan.title = "Voir l'aperçu de l'activité";
      // Prevent the click from bubbling to the wrapping <label>, which would otherwise toggle
      // the checkbox (labels toggle their associated control on any click inside them).
      textSpan.addEventListener("click", e => {
        e.preventDefault();
        e.stopPropagation();
        previewBackupActivity(a);
      });

      const stateBadge = document.createElement("span");
      stateBadge.style.cssText = "font-size: 0.7rem; padding: 2px 6px; border-radius: var(--radius-full); font-weight: 600;";

      // color status badge
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
      item.appendChild(stateBadge);
      checklist.appendChild(item);
    });
  }

  // Bind search input
  searchInput.replaceWith(searchInput.cloneNode(true));
  searchInput = document.getElementById("restore-activity-search") as HTMLInputElement;
  searchInput.addEventListener("input", () => {
    renderActivitiesList();
  });

  // Bind Select all / Deselect all
  const selectAllBtn = document.getElementById("restore-act-btn-select-all")!;
  const deselectAllBtn = document.getElementById("restore-act-btn-deselect-all")!;

  selectAllBtn.replaceWith(selectAllBtn.cloneNode(true));
  deselectAllBtn.replaceWith(deselectAllBtn.cloneNode(true));

  document.getElementById("restore-act-btn-select-all")!.addEventListener("click", e => {
    e.preventDefault();
    checklist.querySelectorAll(".restore-activity-cb").forEach((cb: any) => ((cb as HTMLInputElement).checked = true));
  });

  document.getElementById("restore-act-btn-deselect-all")!.addEventListener("click", e => {
    e.preventDefault();
    checklist.querySelectorAll(".restore-activity-cb").forEach((cb: any) => ((cb as HTMLInputElement).checked = false));
  });

  renderActivitiesList();

  // Close modal helper
  const closeModal = () => {
    modal.classList.remove("active");
    backdrop.classList.remove("active");
  };

  // Bind cancel buttons
  const closeBtn = document.getElementById("restore-options-modal-close")!;
  const cancelBtn = document.getElementById("restore-options-modal-cancel")!;

  closeBtn.replaceWith(closeBtn.cloneNode(true));
  cancelBtn.replaceWith(cancelBtn.cloneNode(true));

  document.getElementById("restore-options-modal-close")!.addEventListener("click", closeModal);
  document.getElementById("restore-options-modal-cancel")!.addEventListener("click", closeModal);

  // Bind submit button
  const submitBtn = document.getElementById("restore-options-modal-submit")!;
  submitBtn.replaceWith(submitBtn.cloneNode(true));
  const newSubmitBtn = document.getElementById("restore-options-modal-submit")!;

  newSubmitBtn.addEventListener("click", async () => {
    const mode = (modal.querySelector("input[name='restore-mode']:checked") as HTMLInputElement).value;

    let restoreConfigs = false;
    let restoreAllActivities = false;
    let restoreSpecificActivities = false;

    // Custom selection detail map
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
    let importMode = "merge"; // "merge" or "replace"

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
        // Collect checked activity IDs
        checklist.querySelectorAll(".restore-activity-cb:checked").forEach((cb: any) => {
          selectedActIds.push(cb.dataset.id);
        });
        importMode = (modal.querySelector("input[name='restore-import-mode']:checked") as HTMLInputElement).value;
      }

      // Check if anything at all is selected
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
  });
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
