/**
 * backup/restore-apply.ts - Applying a restore decision (which configs/activities, merge vs
 * replace) onto appState: safety snapshot, selective merge, sanitization/defaults, migration,
 * and rollback to the pre-restore snapshot if anything fails. Split out of restore.ts, whose
 * showRestoreOptionsModal() builds the `options` this takes from the user's choices in the modal.
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
import { checkBackupReminder, renderSafetyBackupsList } from "./reminder.ts";

export async function runSelectiveRestore(
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
