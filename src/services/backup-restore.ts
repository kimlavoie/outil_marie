/**
 * backup-restore.ts - Restoring the app database from a user-provided JSON backup file: schema
 * validation, a pre-restore safety snapshot, migrating the restored data to the current format,
 * and rolling back in place if that migration fails.
 */
import { logError } from "../utils/logger.ts";
import {
  appState,
  setAppState,
  saveDatabase,
  saveSafetyBackupToDb,
  migrateRoomsConfig,
  migrateSalariesConfig,
  migrateActivities,
  clearAllActivityVersionsFromDb
} from "../state/state.ts";
import { showToast } from "../utils/utils.ts";
import { validateBackupSchema } from "./backup-validation.ts";
import { checkBackupReminder, renderSafetyBackupsList } from "./backup-reminder.ts";

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

      if (confirm("La restauration va écraser la base de données actuelle. Continuer ?")) {
        const preRestoreSnapshot = JSON.parse(JSON.stringify(appState));
        try {
          await saveSafetyBackupToDb("avant_restauration", preRestoreSnapshot);
        } catch (err) {
          logError("backup", "sauvegarde de sécurité avant restauration", err);
        }
        renderSafetyBackupsList();

        setAppState(parsed);

        // Sanitize settings on restoration
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
            schedulable_tasks: []
          };
        }
        if (!appState.settings.rooms) appState.settings.rooms = [];
        if (!appState.settings.salaries) appState.settings.salaries = [];
        if (!appState.settings.services) appState.settings.services = [];
        if (!appState.settings.schedulable_tasks) appState.settings.schedulable_tasks = [];
        if (appState.settings.last_backup_date === undefined) appState.settings.last_backup_date = "";
        appState.settings.backup_reminder_days = parseInt(appState.settings.backup_reminder_days as any, 10);
        if (isNaN(appState.settings.backup_reminder_days)) {
          appState.settings.backup_reminder_days = 7;
        }

        // Sort accounts on restoration
        if (appState.settings && appState.settings.accounts) {
          appState.settings.accounts.sort((a, b) => a.code.localeCompare(b.code));
        }

        // Restored files may predate the pricing-grid/rate-versioning/activity migrations —
        // run the same migrations loadDatabase() applies on normal startup. Guarded separately:
        // a migration bug here must not leave the running app on a half-migrated appState that
        // an unrelated later save() would then persist over the still-intact on-disk data.
        try {
          migrateRoomsConfig(appState.settings.rooms);
          migrateSalariesConfig(appState.settings.salaries);
          migrateActivities(appState.activities, appState.settings);
        } catch (err) {
          logError("backup", "migration des données lors de la restauration", err);
          setAppState(preRestoreSnapshot);
          showToast(
            "La restauration a échoué pendant la mise à jour du format des données. Vos données précédentes ont été conservées (rien n'a été écrasé sur le disque). Veuillez recharger la page.",
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
        const { applyTheme, renderAll } = await import("../navigation.ts");
        applyTheme(appState.settings.theme || "dark");
        renderAll();
        checkBackupReminder();
        showToast("Base de données restaurée avec succès !", "success");
      }
    } catch (err: any) {
      showToast("Erreur lors de la lecture du fichier JSON : " + err.message, "error");
    }
  };

  reader.readAsText(file);
}

export { handleJsonBackupFile };
