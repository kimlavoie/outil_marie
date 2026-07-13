import { generateUid, showToast } from "../utils/utils.ts";
import { logError } from "../utils/logger.ts";

import { DEFAULT_CONFIG } from "./config-defaults.ts";
import { checkBackupReminder } from "../services/backup/reminder.ts";
import { scheduleAutoBackupWrite } from "../services/backup/auto-backup.ts";

import { type AppState, appState, setAppState } from "./store.ts";
import { getDefaultFiscalYear } from "./date-helpers.ts";
import { sanitizeActivitiesList, migrateRoomsConfig, migrateSalariesConfig, migrateServicesConfig, migrateActivities } from "./migrations.ts";
import { getAppStateFromDb, saveAppStateToDb, saveSafetyBackupToDb, clearAllActivityVersionsFromDb } from "./db.ts";

// Free technical services (no fee): paid technical items (location de projecteur, piano à
// queue, projecteur / équipement informatique) live in appState.settings.services instead, so
// their amounts stay modifiable from the Équipements settings tab.
const TECHNICAL_SERVICES: string[] = [
  "Microphone",
  "Éclairage de scène",
  "Musique d'ambiance",
  "Fichier audio, vidéo ou présentation PowerPoint",
  "Projecteur"
];
const BAR_DRINK_TYPES: string[] = ["Avec alcool", "Sans alcool"];
const BAR_SERVICE_TYPES: string[] = ["Service autonome", "Service d'hôtesses", "Distribution de breuvages et nettoyage de coupes"];
const HOST_DUTY_OPTIONS: string[] = ["Distribution de bouchées"];
const EVENT_TYPES = [
  { value: "pedagogique", label: "Activité pédagogique" },
  { value: "parascolaire", label: "Activité parascolaire" },
  { value: "spectacle", label: "Spectacle" },
  { value: "conference", label: "Conférence" },
  { value: "diffusion", label: "Diffusion d'un film ou d'un court métrage" },
  { value: "autre", label: "Autre" }
];

// Quick access (favorites) helpers
function isFavoriteActivity(id: string) {
  return (appState.favorites || []).includes(id);
}

function toggleFavoriteActivity(id: string) {
  if (!appState.favorites) appState.favorites = [];
  if (appState.favorites.includes(id)) {
    appState.favorites = appState.favorites.filter(f => f !== id);
  } else {
    appState.favorites.push(id);
  }
  saveDatabase();
}

// Recently-viewed activities (ephemeral browsing history for the "Accès rapide" list — kept in
// localStorage rather than appState since it's per-device UI history, not app data to back up).
const RECENT_ACTIVITIES_KEY = "outil_marie_recent_activities";
const RECENT_ACTIVITIES_MAX = 5;

function getRecentlyViewedActivityIds(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_ACTIVITIES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

// Moves `id` to the front of the recently-viewed list (de-duplicating), capped at
// RECENT_ACTIVITIES_MAX entries. Call whenever an activity record is opened.
function recordActivityView(id: string) {
  const ids = getRecentlyViewedActivityIds().filter(existingId => existingId !== id);
  ids.unshift(id);
  localStorage.setItem(RECENT_ACTIVITIES_KEY, JSON.stringify(ids.slice(0, RECENT_ACTIVITIES_MAX)));
}

// Load DB from IndexedDB (with transparent migration from localStorage)
async function loadDatabase(): Promise<void> {
  try {
    let dbData = await getAppStateFromDb();

    if (!dbData) {
      // IndexedDB is empty, check localStorage
      const localData = localStorage.getItem("outil_marie_db");
      if (localData) {
        try {
          dbData = JSON.parse(localData);
          console.log("Migrating data from localStorage to IndexedDB...");
          await saveAppStateToDb(dbData);
          localStorage.setItem("outil_marie_db_migrated_backup", localData);
          localStorage.removeItem("outil_marie_db");
          console.log("Migration successful, backup created in localStorage under 'outil_marie_db_migrated_backup'");
        } catch (e) {
          logError("state", "conversion de l'ancienne base localStorage", e);
        }
      }
    }

    if (dbData) {
      appState.settings = dbData.settings || appState.settings;
      appState.activities = sanitizeActivitiesList(dbData.activities);
      appState.favorites = dbData.favorites || [];
      appState.selected_year = dbData.selected_year || getDefaultFiscalYear();
      appState.selected_quarters = dbData.selected_quarters || [1, 2, 3, 4];

      // Safety check: ensure accounts, rooms, departments exist
      if (!appState.settings.accounts) appState.settings.accounts = [...DEFAULT_CONFIG.accounts];
      if (!appState.settings.rooms) appState.settings.rooms = [...DEFAULT_CONFIG.rooms];
      if (!appState.settings.departments) appState.settings.departments = [...DEFAULT_CONFIG.departments];
      if (!appState.settings.salaries || appState.settings.salaries.length === 0) appState.settings.salaries = [...DEFAULT_CONFIG.salaries];
      if (!appState.settings.services) appState.settings.services = [...DEFAULT_CONFIG.services];
      if (!appState.settings.global_tasks || appState.settings.global_tasks.length === 0)
        appState.settings.global_tasks = [...DEFAULT_CONFIG.global_tasks];
      if (!appState.settings.schedulable_tasks) appState.settings.schedulable_tasks = [...DEFAULT_CONFIG.schedulable_tasks];
      if (!appState.settings.tax_rates) appState.settings.tax_rates = { ...DEFAULT_CONFIG.tax_rates };
      if (appState.settings.last_backup_date === undefined) appState.settings.last_backup_date = "";
      appState.settings.backup_reminder_days = parseInt(appState.settings.backup_reminder_days as any, 10);
      if (isNaN(appState.settings.backup_reminder_days)) {
        appState.settings.backup_reminder_days = 7;
      }

      // Sort accounts by code
      if (appState.settings.accounts) {
        appState.settings.accounts.sort((a, b) => a.code.localeCompare(b.code));
      }

      // Migrations below rewrite legacy data shapes in place and aren't reversible, so snapshot
      // the as-loaded (pre-migration) data first. Best-effort: a failure here shouldn't block
      // startup.
      try {
        await saveSafetyBackupToDb("migration", dbData);
      } catch (e) {
        logError("state", "sauvegarde de sécurité avant migration", e);
      }

      // Guard: run migrations in their own try/catch, separate from the outer one, whose only
      // other failure path is a genuinely unreadable database and calls seedDatabase() — which
      // would otherwise wipe every activity and setting if a migration bug threw partway
      // through. A migration failing here must never be treated the same as "no database".
      const preMigrationActivityCount = appState.activities.length;
      let migrationFailed = false;
      try {
        migrateRoomsConfig(appState.settings.rooms);
        migrateServicesConfig(appState.settings.services);
        migrateActivities(appState.activities, appState.settings);
        migrateSalariesConfig(appState.settings.salaries);
      } catch (e) {
        migrationFailed = true;
        logError("state", "migration des données au chargement", e);
      }

      // Second guard: even without throwing, a migration bug could still silently empty out
      // activities that existed a moment ago. Either way, fall back to the as-loaded (unmigrated)
      // data rather than let a corrupted/emptied state be what the next saveDatabase() persists —
      // the safety backup taken above remains available regardless.
      if (migrationFailed || (preMigrationActivityCount > 0 && appState.activities.length === 0)) {
        appState.settings = dbData.settings || appState.settings;
        appState.activities = sanitizeActivitiesList(dbData.activities);
        showToast(
          "La mise à jour du format des données a échoué ou a produit un résultat inattendu : vos données précédentes ont été conservées telles quelles. Une copie de sécurité est aussi disponible dans Sauvegarde & Export.",
          "error",
          12000
        );
      }

      // Drop favorites pointing at activities that no longer exist (deleted since last save)
      appState.favorites = (appState.favorites || []).filter(id => appState.activities.some(a => a.id === id && !a.deleted));
    } else {
      await seedDatabase();
    }
  } catch (e) {
    logError("state", "chargement de la base IndexedDB, valeurs par défaut utilisées", e);
    await seedDatabase();
  }
}

// Seed Initial Database with empty activities list
async function seedDatabase(): Promise<void> {
  appState.settings = {
    theme: "dark",
    rooms: [...DEFAULT_CONFIG.rooms],
    departments: [...DEFAULT_CONFIG.departments],
    accounts: [...DEFAULT_CONFIG.accounts].sort((a, b) => a.code.localeCompare(b.code)),
    last_backup_date: "",
    backup_reminder_days: 7,
    salaries: [...DEFAULT_CONFIG.salaries],
    services: [...DEFAULT_CONFIG.services],
    global_tasks: [...DEFAULT_CONFIG.global_tasks],
    schedulable_tasks: [...DEFAULT_CONFIG.schedulable_tasks],
    tax_rates: { ...DEFAULT_CONFIG.tax_rates }
  };

  appState.activities = [];
  appState.favorites = [];
  appState.selected_year = getDefaultFiscalYear();
  appState.selected_quarters = [1, 2, 3, 4];
  try {
    await clearAllActivityVersionsFromDb();
  } catch (e) {
    logError("state", "suppression des versions lors du seed", e);
  }
  await saveDatabase();
}

// Tracks whether the last save attempt failed, so repeated failures (e.g. IndexedDB quota
// exceeded) don't spam a toast on every keystroke — only the first failure and the eventual
// recovery are surfaced.
let lastSaveFailed = false;

// Cross-tab change notification: the app has no locking around IndexedDB, so if the user opens
// it in two tabs, the second tab's saveDatabase() calls silently overwrite whatever the first
// tab wrote, with no indication either tab is now working from stale in-memory data. Each tab
// broadcasts a heartbeat after every successful save; on hearing one from a different tab, a
// persistent (non-auto-dismissing) toast tells the user to reload before their next edit
// clobbers the other tab's changes. Guarded by a feature check since BroadcastChannel doesn't
// exist in the Node test environment. Also requires `window` (rather than just checking
// BroadcastChannel itself) because Node exposes a global BroadcastChannel too — creating one
// there would leave an open handle that keeps the test process alive indefinitely.
const TAB_INSTANCE_ID = generateUid("tab");
const crossTabSyncChannel =
  typeof window !== "undefined" && typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("outil_marie_sync") : null;
let remoteChangeWarningShown = false;

if (crossTabSyncChannel) {
  crossTabSyncChannel.onmessage = (e: MessageEvent) => {
    if (remoteChangeWarningShown || e.data?.tabId === TAB_INSTANCE_ID) return;
    remoteChangeWarningShown = true;
    showToast(
      "Les données ont été modifiées dans un autre onglet. Rechargez cette page avant de continuer, sinon vos prochaines modifications risquent d'écraser ces changements.",
      "warning",
      0
    );
  };
}

// Save state to IndexedDB. Returns whether the write actually succeeded, so callers that
// mutate appState in place (e.g. bulk operations) can roll back their in-memory change when
// persistence fails, instead of leaving the UI showing a change that never made it to disk.
async function saveDatabase(): Promise<boolean> {
  let success = true;
  try {
    await saveAppStateToDb(appState);
    if (lastSaveFailed) {
      showToast("La sauvegarde a repris normalement.", "success");
    }
    lastSaveFailed = false;
    crossTabSyncChannel?.postMessage({ tabId: TAB_INSTANCE_ID, ts: Date.now() });
  } catch (e) {
    logError("state", "sauvegarde de la base IndexedDB", e);
    if (!lastSaveFailed) {
      showToast("Échec de la sauvegarde des données. Vos dernières modifications pourraient être perdues.", "error", 8000);
    }
    lastSaveFailed = true;
    success = false;
  }
  checkBackupReminder();
  scheduleAutoBackupWrite();
  return success;
}

// Calls saveDatabase(), and if persistence fails, invokes restore() to revert the in-memory
// mutation the caller already applied (plus an optional re-render) instead of leaving the UI
// showing a change that never made it to disk. Mirrors the pattern used by the bulk
// delete/state-change handlers (src/activities/render.ts).
async function saveDatabaseOrRollback(
  restore: () => void,
  errorMessage = "La modification n'a pas été enregistrée. Réessayez.",
  rerender?: () => void
): Promise<boolean> {
  const saved = await saveDatabase();
  if (!saved) {
    restore();
    showToast(errorMessage, "error", 8000);
    rerender?.();
  }
  return saved;
}

export type { AppState };
export {
  DEFAULT_CONFIG,
  TECHNICAL_SERVICES,
  BAR_DRINK_TYPES,
  BAR_SERVICE_TYPES,
  HOST_DUTY_OPTIONS,
  EVENT_TYPES,
  appState,
  setAppState,
  isFavoriteActivity,
  toggleFavoriteActivity,
  getRecentlyViewedActivityIds,
  recordActivityView,
  loadDatabase,
  seedDatabase,
  saveDatabase,
  saveDatabaseOrRollback
};

export { activityMatchesTask } from "./tasks.ts";
export { getFiscalYear, getQuarterNumber, getDefaultFiscalYear, getFiscalYearRange, getQuarter, parseLocalDateStr, formatDateStrLocal } from "./date-helpers.ts";
export {
  openAppDb,
  getReconDecisionsFromDb,
  saveReconDecisionToDb,
  deleteReconDecisionFromDb,
  addActivityVersionToDb,
  getActivityVersionsFromDb,
  pruneActivityVersions,
  clearAllActivityVersionsFromDb,
  getAppStateFromDb,
  saveAppStateToDb,
  saveSafetyBackupToDb,
  getSafetyBackupsFromDb
} from "./db.ts";
export { sanitizeActivitiesList, migrateRoomsConfig, migrateSalariesConfig, migrateServicesConfig, migrateActivities } from "./migrations.ts";
export {
  getActivePricingGrid,
  getActiveRateVersionField,
  getActiveSalaryRate,
  getActiveSalaryOvertimeRate,
  getSalaryTarif,
  getActiveServiceRate,
  getServiceTarif,
  getFlattenedRoomTarifs
} from "./pricing.ts";
export { saveUiState, restoreUiState } from "./ui-state.ts";
