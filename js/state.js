import { calculateDaysCount, generateUid } from "./utils.ts";
import { openVersionedDb } from "./db-utils.ts";
import { logError } from "./logger.ts";

import { DEFAULT_CONFIG } from "./config-defaults.ts";

// Free technical services (no fee): paid technical items (location de projecteur, piano à
// queue, projecteur / équipement informatique) live in appState.settings.services instead, so
// their amounts stay modifiable from the Services settings tab.
const TECHNICAL_SERVICES = ["Microphone", "Éclairage de scène", "Musique d'ambiance", "Fichier audio, vidéo ou présentation PowerPoint"];
const BAR_DRINK_TYPES = ["Avec alcool", "Sans alcool"];
const BAR_SERVICE_TYPES = ["Service autonome", "Service d'hôtesses", "Distribution de breuvages et nettoyage de coupes"];
const HOST_DUTY_OPTIONS = ["Distribution de bouchées"];
const EVENT_TYPES = [
  { value: "pedagogique", label: "Activité pédagogique" },
  { value: "parascolaire", label: "Activité parascolaire" },
  { value: "spectacle", label: "Spectacle" },
  { value: "conference", label: "Conférence" },
  { value: "diffusion", label: "Diffusion d'un film ou d'un court métrage" },
  { value: "autre", label: "Autre" }
];

// Global App State
let appState = {
  settings: {
    theme: "dark",
    rooms: [...DEFAULT_CONFIG.rooms],
    departments: [...DEFAULT_CONFIG.departments],
    accounts: [...DEFAULT_CONFIG.accounts],
    last_backup_date: "",
    backup_reminder_days: 7,
    salaries: [...DEFAULT_CONFIG.salaries],
    services: [...DEFAULT_CONFIG.services],
    global_tasks: [...DEFAULT_CONFIG.global_tasks]
  },
  activities: [],
  favorites: [], // ids of activities pinned (by the user) to the "Accès rapide" list
  selected_year: "",
  selected_quarters: [1, 2, 3, 4]
};

// Quick access (favorites) helpers
function isFavoriteActivity(id) {
  return (appState.favorites || []).includes(id);
}

function toggleFavoriteActivity(id) {
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

function getRecentlyViewedActivityIds() {
  try {
    const raw = localStorage.getItem(RECENT_ACTIVITIES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

// Moves `id` to the front of the recently-viewed list (de-duplicating), capped at
// RECENT_ACTIVITIES_MAX entries. Call whenever an activity record is opened.
function recordActivityView(id) {
  const ids = getRecentlyViewedActivityIds().filter(existingId => existingId !== id);
  ids.unshift(id);
  localStorage.setItem(RECENT_ACTIVITIES_KEY, JSON.stringify(ids.slice(0, RECENT_ACTIVITIES_MAX)));
}

// Period Helpers
function getFiscalYear(dateStr) {
  if (!dateStr) return "";
  const date = parseLocalDateStr(dateStr);
  if (isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-11
  return month >= 6 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}

function getQuarterNumber(dateStr) {
  if (!dateStr) return null;
  const date = parseLocalDateStr(dateStr);
  if (isNaN(date.getTime())) return null;
  const month = date.getMonth();
  if (month >= 6 && month <= 8) return 1;
  if (month >= 9 && month <= 11) return 2;
  if (month >= 0 && month <= 2) return 3;
  return 4;
}

function getDefaultFiscalYear() {
  const d = new Date();
  const year = d.getFullYear();
  const month = d.getMonth();
  return month >= 6 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}

// Returns the {start, end} "YYYY-MM-DD" bounds (juillet à juin) of a fiscal year string like "2024-2025".
function getFiscalYearRange(fy) {
  if (!fy) return null;
  const match = /^(\d{4})-(\d{4})$/.exec(fy);
  if (!match) return null;
  return { start: `${match[1]}-07-01`, end: `${match[2]}-06-30` };
}

// Helper: Check which quarter a date belongs to
function getQuarter(dateStr) {
  if (!dateStr) return null;
  const date = parseLocalDateStr(dateStr);
  if (isNaN(date)) return null;
  const month = date.getMonth(); // 0-11
  // Q1: Jul-Sep (months 6, 7, 8)
  // Q2: Oct-Dec (months 9, 10, 11)
  // Q3: Jan-Mar (months 0, 1, 2)
  // Q4: Apr-Jun (months 3, 4, 5)
  if (month >= 6 && month <= 8) return "T1 (Jul-Sep)";
  if (month >= 9 && month <= 11) return "T2 (Oct-Dec)";
  if (month >= 0 && month <= 2) return "T3 (Jan-Mar)";
  return "T4 (Apr-Jun)";
}

// Parses a "YYYY-MM-DD" string as a local date (avoids the UTC-midnight off-by-one
// that new Date("YYYY-MM-DD") causes in timezones behind UTC).
function parseLocalDateStr(dateStr) {
  if (!dateStr) return new Date(NaN);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) return new Date(dateStr);
  return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
}

// Formats a local Date back into a "YYYY-MM-DD" string (inverse of parseLocalDateStr)
function formatDateStrLocal(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// --- IndexedDB Configuration for App State ---
const APP_DB_NAME = "outil_marie_app";
const APP_STORE_NAME = "app_state_store";
const APP_STATE_KEY = "app_state";

const APP_DB_VERSION = 3;

// Each block runs only for databases that haven't reached that version yet, so re-opening an
// already-migrated database is a no-op and a fresh database walks through every step in order.
function upgradeAppDb(db, oldVersion) {
  if (oldVersion < 1 && !db.objectStoreNames.contains(APP_STORE_NAME)) {
    db.createObjectStore(APP_STORE_NAME);
  }
  if (oldVersion < 2 && !db.objectStoreNames.contains("activity_versions")) {
    const store = db.createObjectStore("activity_versions", { keyPath: "versionId" });
    store.createIndex("activityId", "activityId", { unique: false });
  }
  if (oldVersion < 3 && !db.objectStoreNames.contains("recon_decisions")) {
    db.createObjectStore("recon_decisions", { keyPath: "key" });
  }
}

function openAppDb() {
  return openVersionedDb(APP_DB_NAME, APP_DB_VERSION, upgradeAppDb);
}

// Manually-reviewed reconciliation lines (validated/ignored), keyed by "account_code||reference"
// so the decision survives across GL re-imports (a new import produces the same key for the same
// account+référence pair). Kept in their own IndexedDB store rather than appState so they aren't
// wiped out by a JSON backup restore of unrelated activity data.
function getReconDecisionsFromDb() {
  return openAppDb().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction("recon_decisions", "readonly");
      const store = tx.objectStore("recon_decisions");
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  });
}

function saveReconDecisionToDb(decision) {
  return openAppDb().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction("recon_decisions", "readwrite");
      const store = tx.objectStore("recon_decisions");
      const req = store.put(decision);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  });
}

function deleteReconDecisionFromDb(key) {
  return openAppDb().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction("recon_decisions", "readwrite");
      const store = tx.objectStore("recon_decisions");
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  });
}

function addActivityVersionToDb(versionRecord) {
  return openAppDb().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction("activity_versions", "readwrite");
      const store = tx.objectStore("activity_versions");
      const req = store.put(versionRecord);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  });
}

function getActivityVersionsFromDb(activityId) {
  return openAppDb().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction("activity_versions", "readonly");
      const store = tx.objectStore("activity_versions");
      const index = store.index("activityId");
      const req = index.getAll(activityId);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  });
}

function pruneActivityVersions(activityId, maxVersions = 20) {
  return getActivityVersionsFromDb(activityId).then(versions => {
    if (versions.length <= maxVersions) return Promise.resolve();

    // Sort oldest first to delete the oldest ones
    versions.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    const toDelete = versions.slice(0, versions.length - maxVersions);

    return openAppDb().then(db => {
      return new Promise((resolve, reject) => {
        const tx = db.transaction("activity_versions", "readwrite");
        const store = tx.objectStore("activity_versions");

        let count = 0;
        toDelete.forEach(v => {
          const req = store.delete(v.versionId);
          req.onsuccess = () => {
            count++;
            if (count === toDelete.length) resolve();
          };
          req.onerror = () => reject(req.error);
        });

        if (toDelete.length === 0) resolve();
      });
    });
  });
}

function clearAllActivityVersionsFromDb() {
  return openAppDb().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction("activity_versions", "readwrite");
      const store = tx.objectStore("activity_versions");
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  });
}

function getAppStateFromDb() {
  return openAppDb().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(APP_STORE_NAME, "readonly");
      const store = tx.objectStore(APP_STORE_NAME);
      const req = store.get(APP_STATE_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  });
}

function saveAppStateToDb(state) {
  return openAppDb().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(APP_STORE_NAME, "readwrite");
      const store = tx.objectStore(APP_STORE_NAME);
      const req = store.put(state, APP_STATE_KEY);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  });
}

// Load DB from IndexedDB (with transparent migration from localStorage)
// Guards against a corrupted or partially-written database record crashing the whole app: list
// rendering, search and financial totals all assume every activity has these fields/arrays
// (e.g. act.name.toLowerCase(), act.distributions.some(...)) without their own fallback. Drops
// only entries that aren't recoverable objects (no id); everything else gets safe defaults.
function sanitizeActivitiesList(rawActivities) {
  if (!Array.isArray(rawActivities)) return [];
  return rawActivities
    .filter(act => act && typeof act === "object" && typeof act.id === "string" && act.id)
    .map(act => {
      if (typeof act.name !== "string") act.name = "";
      if (typeof act.responsable !== "string") act.responsable = "";
      if (!Array.isArray(act.distributions)) act.distributions = [];
      if (!Array.isArray(act.reservations)) act.reservations = [];
      act.distributions = act.distributions.filter(d => d && typeof d === "object");
      act.reservations = act.reservations.filter(r => r && typeof r === "object");
      return act;
    });
}

async function loadDatabase() {
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
      if (appState.settings.last_backup_date === undefined) appState.settings.last_backup_date = "";
      appState.settings.backup_reminder_days = parseInt(appState.settings.backup_reminder_days, 10);
      if (isNaN(appState.settings.backup_reminder_days)) {
        appState.settings.backup_reminder_days = 7;
      }

      // Sort accounts by code
      if (appState.settings.accounts) {
        appState.settings.accounts.sort((a, b) => a.code.localeCompare(b.code));
      }

      migrateRoomsConfig();
      migrateSalariesConfig();
      migrateServicesConfig();
      migrateActivities();

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

// Migrate legacy room config (price_internal/price_external) to a list of named tarifs per room,
// then migrate that flat tarifs[] list to a versioned pricing grid (paramètre x type de client),
// and ensure the linked_* configuration arrays exist.
function migrateRoomsConfig() {
  (appState.settings.rooms || []).forEach(room => {
    if (!room.tarifs && !room.pricing_grids) {
      const tarifs = [{ id: generateUid("tarif"), description: "Interne", amount: room.price_internal || 0 }];
      if (room.price_external > 0) {
        tarifs.push({ id: generateUid("tarif"), description: "Externe", amount: room.price_external });
      }
      room.tarifs = tarifs;
      delete room.price_internal;
      delete room.price_external;
    }

    if (!room.pricing_grids) {
      const paramId = generateUid("param");
      const tarifs = room.tarifs || [];
      room.pricing_grids = [
        {
          id: generateUid("grid"),
          effective_date: "",
          parameters: [{ id: paramId, name: "Tarif" }],
          client_types: tarifs.map(t => ({ id: t.id, name: t.description })),
          cells: tarifs.map(t => ({ parameter_id: paramId, client_type_id: t.id, amount: t.amount }))
        }
      ];
    }
    delete room.tarifs;

    if (!room.linked_rooms) room.linked_rooms = [];
    if (!room.linked_staff) room.linked_staff = [];
    if (!room.linked_fees) room.linked_fees = [];
    if (!room.linked_tasks) room.linked_tasks = [];
  });
}

// Migrate legacy flat salary rate to a versioned rate history per job, and ensure every
// version carries an overtime_rate (added later, defaults to 0 for pre-existing versions).
function migrateSalariesConfig() {
  (appState.settings.salaries || []).forEach(sal => {
    if (!sal.rate_versions) {
      sal.rate_versions = [{ id: generateUid("rv"), effective_date: "", rate: sal.rate || 0 }];
      delete sal.rate;
    }
    sal.rate_versions.forEach(v => {
      if (v.overtime_rate === undefined) v.overtime_rate = 0;
    });
  });
}

// Adds the hardcoded technical service fees (location de projecteur, piano à queue, projecteur /
// équipement informatique) to existing databases that predate them, matched by id so it never
// duplicates or overwrites amounts the user has already customized.
function migrateServicesConfig() {
  if (!appState.settings.services) appState.settings.services = [];
  DEFAULT_CONFIG.services.forEach(defaultSvc => {
    if (!appState.settings.services.some(s => s.id === defaultSvc.id)) {
      appState.settings.services.push(JSON.parse(JSON.stringify(defaultSvc)));
    }
  });
}

// Returns the pricing grid version in effect for `dateStr` (the most recent grid whose
// effective_date is empty or <= dateStr). Falls back to the earliest grid if dateStr is empty
// or precedes every version.
function getActivePricingGrid(room, dateStr) {
  const grids = (room && room.pricing_grids) || [];
  if (grids.length === 0) return null;
  const sorted = [...grids].sort((a, b) => (a.effective_date || "").localeCompare(b.effective_date || ""));
  if (!dateStr) return sorted[0];
  let applicable = sorted[0];
  sorted.forEach(g => {
    if (!g.effective_date || g.effective_date <= dateStr) applicable = g;
  });
  return applicable;
}

// Resolves the value of `field` from whichever rate version is in effect for `dateStr` (the
// most recent version whose effective_date is empty or <= dateStr; falls back to the earliest
// version if dateStr is empty or precedes every version).
function getActiveRateVersionField(versions, dateStr, field) {
  versions = versions || [];
  if (versions.length === 0) return 0;
  const sorted = [...versions].sort((a, b) => (a.effective_date || "").localeCompare(b.effective_date || ""));
  if (!dateStr) return sorted[0][field] || 0;
  let applicable = sorted[0];
  sorted.forEach(v => {
    if (!v.effective_date || v.effective_date <= dateStr) applicable = v;
  });
  return applicable[field] || 0;
}

// Returns the salary rate in effect for `dateStr` (same resolution rule as getActivePricingGrid)
function getActiveSalaryRate(salary, dateStr) {
  return getActiveRateVersionField(salary && salary.rate_versions, dateStr, "rate");
}

// Returns the overtime (temps supplémentaire) rate in effect for `dateStr`
function getActiveSalaryOvertimeRate(salary, dateStr) {
  return getActiveRateVersionField(salary && salary.rate_versions, dateStr, "overtime_rate");
}

// Returns the service rate in effect for `dateStr` (services share the same versioned
// rate_versions shape as salaries, so the resolution logic is identical)
function getActiveServiceRate(service, dateStr) {
  return getActiveSalaryRate(service, dateStr);
}

// Compat shim: flattens a room's active pricing grid (cross product of parameters x client_types)
// into the old {id, description, amount} tarifs[] shape, so activities.js's room-tariff selector
// keeps working unchanged until Phase 3 makes it grid-aware (parameter + client type selects).
// `id` encodes "parameterId::clientTypeId" so the amount can be looked back up.
function getFlattenedRoomTarifs(room, dateStr) {
  const grid = getActivePricingGrid(room, dateStr);
  if (!grid) return [];
  const tarifs = [];
  grid.parameters.forEach(param => {
    grid.client_types.forEach(ct => {
      const cell = grid.cells.find(c => c.parameter_id === param.id && c.client_type_id === ct.id);
      const desc = grid.parameters.length > 1 ? `${param.name} - ${ct.name}` : ct.name;
      tarifs.push({
        id: `${param.id}::${ct.id}`,
        description: desc,
        amount: cell ? cell.amount : 0,
        gl_account_code: param.gl_account_code || ""
      });
    });
  });
  return tarifs;
}

// Migrate legacy activity records to the current data shape (room_name -> rooms, new fields)
function migrateActivities() {
  appState.activities.forEach(act => {
    if (act.room_name !== undefined) {
      if (!act.rooms) act.rooms = act.room_name ? [act.room_name] : [];
      delete act.room_name;
    }
    if (!act.rooms) act.rooms = [];
    if (act.attendees_count === undefined) act.attendees_count = 0;
    if (act.install_date === undefined) act.install_date = "";
    if (act.install_time === undefined) act.install_time = "";
    if (act.dismantle_date === undefined) act.dismantle_date = "";
    if (act.dismantle_time === undefined) act.dismantle_time = "";
    if (act.start_time === undefined) act.start_time = "";
    if (act.end_time === undefined) act.end_time = "";

    // Legacy: rooms used to be a flat array of room name strings, with a single
    // shared install/dismantle/start/end schedule for the whole activity. Each
    // room now carries its own schedule and a snapshotted tariff.
    if (act.rooms.length > 0 && typeof act.rooms[0] === "string") {
      act.rooms = act.rooms.map(name => {
        const roomConfig = (appState.settings.rooms || []).find(r => r.name === name);
        const wantedTariffDesc = act.client_type === "interne" ? "Interne" : "Externe";
        const flatTarifs = roomConfig ? getFlattenedRoomTarifs(roomConfig, act.date_start) : [];
        const matchedTariff = flatTarifs.length ? flatTarifs.find(t => t.description === wantedTariffDesc) || flatTarifs[0] : null;
        return {
          name,
          tariff_id: matchedTariff ? matchedTariff.id : "",
          tariff_description: matchedTariff ? matchedTariff.description : "",
          tariff_amount: matchedTariff ? matchedTariff.amount : 0,
          install_date: act.install_date || "",
          install_time: act.install_time || "",
          dismantle_date: act.dismantle_date || "",
          dismantle_time: act.dismantle_time || "",
          date_start: act.date_start || "",
          start_time: act.start_time || "",
          date_end: act.date_end || "",
          end_time: act.end_time || ""
        };
      });
    }
    delete act.install_date;
    delete act.install_time;
    delete act.dismantle_date;
    delete act.dismantle_time;
    delete act.start_time;
    delete act.end_time;

    // Legacy: "Services techniques", "Consommation" and "Service d'hôtes.ses" used to be a
    // single set of fields shared by the whole activity. An activity can book several rooms
    // with different technical/bar/hostess needs, so these now live per room instead. Any
    // pre-existing activity-level values (including the older flat consumption/host_services
    // pill lists) are folded into a single legacy bar_service/host_duties shape here, then
    // broadcast onto every already-booked room before being dropped from the activity itself.
    let legacyBarService = act.bar_service;
    if (!legacyBarService) {
      legacyBarService = {
        active: false,
        drink_type: "",
        service_type: "",
        hostess_count: 0,
        special_order: act.consumption_special_products || ""
      };
      if (Array.isArray(act.consumption) && act.consumption.length > 0) {
        legacyBarService.active = true;
        if (act.consumption.some(c => c.includes("avec alcool"))) legacyBarService.drink_type = "Avec alcool";
        else if (act.consumption.some(c => c.includes("sans alcool"))) legacyBarService.drink_type = "Sans alcool";
      }
      if (Array.isArray(act.host_services) && act.host_services.includes("Service de bar payant")) {
        legacyBarService.active = true;
        legacyBarService.service_type = "Service d'hôtesses";
      } else if (legacyBarService.active) {
        legacyBarService.service_type = "Service autonome";
      }
    }
    let legacyHostDuties = act.host_duties;
    if (!legacyHostDuties) {
      legacyHostDuties = { duties: [], hostess_count: 0 };
      if (Array.isArray(act.host_services)) {
        if (act.host_services.some(h => h.startsWith("Distribution de breuvages"))) {
          legacyHostDuties.duties.push("Distribution de breuvages et nettoyage de coupes");
        }
        if (act.host_services.includes("Distribution de bouchées")) {
          legacyHostDuties.duties.push("Distribution de bouchées");
        }
      }
    }
    const legacyTechnicalServices = act.technical_services || [];

    // Legacy: "Personnel requis", "Services" and "Autres frais" were also shared by the whole
    // activity (each row tagged with a source_room only when auto-added from a room's linked
    // config). They now live per room too. Rows with a source_room matching a still-booked room
    // go there; anything else (manually added rows never carried a source_room) has no reliable
    // room to attribute to, so it's attached to the activity's first room.
    const legacyStaff = act.staff || [];
    const legacyServices = act.services || [];
    const legacyFees = act.fees || [];

    (act.rooms || []).forEach((r, idx) => {
      if (r.tariff_gl_account_code === undefined) r.tariff_gl_account_code = "";
      if (!r.technical_services) r.technical_services = [...legacyTechnicalServices];
      if (!r.bar_service) r.bar_service = JSON.parse(JSON.stringify(legacyBarService));
      if (!r.host_duties) r.host_duties = JSON.parse(JSON.stringify(legacyHostDuties));
      if (!r.staff) {
        r.staff = legacyStaff
          .filter(s => s.source_room === r.name || (!s.source_room && idx === 0))
          .map(s => {
            const c = { ...s };
            delete c.source_room;
            return c;
          });
      }
      if (!r.services) {
        r.services = legacyServices
          .filter(s => s.source_room === r.name || (!s.source_room && idx === 0))
          .map(s => {
            const c = { ...s };
            delete c.source_room;
            return c;
          });
      }
      if (!r.fees) {
        r.fees = legacyFees
          .filter(f => f.source_room === r.name || (!f.source_room && idx === 0))
          .map(f => {
            const c = { ...f };
            delete c.source_room;
            return c;
          });
      }
    });

    delete act.technical_services;
    delete act.bar_service;
    delete act.host_duties;
    delete act.consumption;
    delete act.consumption_special_products;
    delete act.host_services;
    delete act.staff;
    delete act.services;
    delete act.fees;
    delete act.remi_hours;

    if (act.description === undefined) act.description = "";
    if (act.coba === undefined) act.coba = "";
    if (!act.activity_manager) {
      act.activity_manager = { first_name: "", last_name: "", type: "employe", phone: "", email: "" };
    }

    if (act.event_type === undefined) act.event_type = "";
    if (act.event_type_other === undefined) act.event_type_other = "";

    // Legacy: reference was a single field on the activity. Move it onto each
    // distribution (per-account reference) since it is now defined per compte.
    if (act.reference !== undefined) {
      (act.distributions || []).forEach(d => {
        if (d.reference === undefined) d.reference = act.reference;
      });
      delete act.reference;
    }
    (act.distributions || []).forEach(d => {
      if (d.reference === undefined) d.reference = "";
    });

    // Activity lifecycle fields (state, client identification, planning tasks, submission/contract
    // file links, staff/fees for the cost calculation, billing dates)
    if (act.state === undefined) act.state = "brouillon";
    // Legacy activities predate the Estimation/Soumission mode toggle and already carry full
    // submission data, so they default to "soumission" rather than the lighter estimation mode.
    if (act.mode === undefined) act.mode = "soumission";
    if (!act.client) act.client = { first_name: "", last_name: "", phone: "", email: "" };
    (act.rooms || []).forEach(r => {
      (r.staff || []).forEach(s => {
        if (s.overtime_hours === undefined) s.overtime_hours = 0;
      });
    });
    if (!act.submission) act.submission = { file_link_id: "", generated_at: "", sent_at: "" };
    if (!act.contract) act.contract = { file_link_id: "", approved_at: "" };
    if (!act.planning_tasks) act.planning_tasks = [];
    if (act.billed_at === undefined) act.billed_at = "";
    if (act.completed_at === undefined) act.completed_at = "";

    // Legacy: a booked room used to carry a single continuous date_start -> date_end
    // event span plus a single optional install/dismantle pair. A room can now be
    // booked several times (different services) with several non-contiguous slots,
    // so rooms[] becomes reservations[], with one slot generated per day of the old
    // span (same start_time/end_time on each) to keep the tariff total (days x tariff)
    // identical after migration.
    if (!act.reservations) {
      act.reservations = (act.rooms || []).map(r => {
        const slots = [];
        if (r.date_start) {
          const dayCount = calculateDaysCount(r.date_start, r.date_end || r.date_start);
          const start = parseLocalDateStr(r.date_start);
          for (let i = 0; i < dayCount; i++) {
            const d = new Date(start);
            d.setDate(d.getDate() + i);
            slots.push({
              id: generateUid("slot"),
              date: formatDateStrLocal(d),
              start_time: r.start_time || "",
              end_time: r.end_time || ""
            });
          }
        }
        return {
          id: generateUid("res"),
          room_name: r.name,
          room_other_details: "",
          tariff_id: r.tariff_id || "",
          tariff_description: r.tariff_description || "",
          tariff_amount: r.tariff_amount || 0,
          tariff_gl_account_code: r.tariff_gl_account_code || "",
          install: { enabled: !!r.install_date, date: r.install_date || "", start_time: r.install_time || "", end_time: "" },
          dismantle: { enabled: !!r.dismantle_date, date: r.dismantle_date || "", start_time: r.dismantle_time || "", end_time: "" },
          slots,
          technical_services: r.technical_services || [],
          bar_service: r.bar_service || { active: false, drink_type: "", service_type: "", hostess_count: 0, special_order: "" },
          host_duties: r.host_duties || { duties: [], hostess_count: 0 },
          staff: r.staff || [],
          services: r.services || [],
          fees: r.fees || []
        };
      });
      delete act.rooms;
    }

    // Legacy: montage/démontage briefly had a full début/fin date range (two dates), and before
    // that a single moment (one date + one heure, field named `time`). Both collapse to a single
    // date with a start/end heure: the range's start_date becomes the date (end_date is dropped,
    // now meaningless), and the single moment's `time` becomes start_time with an empty end_time.
    (act.reservations || []).forEach(r => {
      if (r.install) {
        if (r.install.start_date !== undefined) {
          r.install = {
            enabled: r.install.enabled,
            date: r.install.start_date || "",
            start_time: r.install.start_time || "",
            end_time: r.install.end_time || ""
          };
        } else if (r.install.time !== undefined) {
          r.install = { enabled: r.install.enabled, date: r.install.date || "", start_time: r.install.time || "", end_time: "" };
        }
      }
      if (r.dismantle) {
        if (r.dismantle.start_date !== undefined) {
          r.dismantle = {
            enabled: r.dismantle.enabled,
            date: r.dismantle.start_date || "",
            start_time: r.dismantle.start_time || "",
            end_time: r.dismantle.end_time || ""
          };
        } else if (r.dismantle.time !== undefined) {
          r.dismantle = { enabled: r.dismantle.enabled, date: r.dismantle.date || "", start_time: r.dismantle.time || "", end_time: "" };
        }
      }
    });
  });
}

// Seed Initial Database with empty activities list
async function seedDatabase() {
  appState.settings = {
    theme: "dark",
    rooms: [...DEFAULT_CONFIG.rooms],
    departments: [...DEFAULT_CONFIG.departments],
    accounts: [...DEFAULT_CONFIG.accounts].sort((a, b) => a.code.localeCompare(b.code)),
    last_backup_date: "",
    backup_reminder_days: 7,
    salaries: [...DEFAULT_CONFIG.salaries],
    services: [...DEFAULT_CONFIG.services],
    global_tasks: [...DEFAULT_CONFIG.global_tasks]
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

// Save state to IndexedDB
async function saveDatabase() {
  try {
    await saveAppStateToDb(appState);
    if (lastSaveFailed && typeof showToast === "function") {
      showToast("La sauvegarde a repris normalement.", "success");
    }
    lastSaveFailed = false;
  } catch (e) {
    logError("state", "sauvegarde de la base IndexedDB", e);
    if (!lastSaveFailed && typeof showToast === "function") {
      showToast("Échec de la sauvegarde des données. Vos dernières modifications pourraient être perdues.", "error", 8000);
    }
    lastSaveFailed = true;
  }
  checkBackupReminder();
  if (typeof scheduleAutoBackupWrite === "function") scheduleAutoBackupWrite();
}

// Persist search/filter/sort/pagination state per view, so reloading the
// page or coming back later drops the user exactly where they left off.
const UI_STATE_KEY = "outil_marie_ui_state";

function saveUiState() {
  const uiState = {
    activities: {
      search: document.getElementById("activity-search")?.value || "",
      filterSalle: document.getElementById("filter-salle")?.value || "",
      filterClientType: document.getElementById("filter-client-type")?.value || "",
      filterStatus: document.getElementById("filter-status")?.value || "",
      sortKey: activitiesState.sortKey,
      sortOrder: activitiesState.sortOrder,
      page: activitiesState.page,
      pageSize: activitiesState.pageSize
    },
    reconciliation: {
      filter: reconciliationState.filter,
      page: reconciliationState.page,
      pageSize: reconciliationState.pageSize
    },
    accountReport: {
      filterAccount: document.getElementById("filter-report-account")?.value || "",
      sortKey: accountReportState.sortKey,
      sortOrder: accountReportState.sortOrder,
      pageSize: accountReportState.pageSize,
      pages: accountReportState.pages
    }
  };
  localStorage.setItem(UI_STATE_KEY, JSON.stringify(uiState));
}

// Restores the UI state saved above. Must run after the DOM is ready and
// before the views first render, so the restored values are picked up by
// renderActivities/renderReconciliationTable/renderAccountReport on the
// initial render pass.
function restoreUiState() {
  const raw = localStorage.getItem(UI_STATE_KEY);
  if (!raw) return;

  let uiState;
  try {
    uiState = JSON.parse(raw);
  } catch (e) {
    logError("state", "lecture de l'état d'interface sauvegardé, ignoré", e);
    return;
  }

  const act = uiState.activities || {};
  const searchEl = document.getElementById("activity-search");
  const salleEl = document.getElementById("filter-salle");
  const clientTypeEl = document.getElementById("filter-client-type");
  const statusEl = document.getElementById("filter-status");
  if (searchEl && act.search !== undefined) searchEl.value = act.search;
  if (salleEl && act.filterSalle !== undefined) salleEl.value = act.filterSalle;
  if (clientTypeEl && act.filterClientType !== undefined) clientTypeEl.value = act.filterClientType;
  if (statusEl && act.filterStatus !== undefined) statusEl.value = act.filterStatus;
  if (act.sortKey) activitiesState.sortKey = act.sortKey;
  if (act.sortOrder) activitiesState.sortOrder = act.sortOrder;
  if (act.page) activitiesState.page = act.page;
  if (act.pageSize) activitiesState.pageSize = act.pageSize;

  const recon = uiState.reconciliation || {};
  if (recon.filter) {
    reconciliationState.filter = recon.filter;
    document.querySelectorAll(".reconcile-tab").forEach(t => {
      t.classList.toggle("active", t.getAttribute("data-recon-filter") === recon.filter);
    });
  }
  if (recon.page) reconciliationState.page = recon.page;
  if (recon.pageSize) reconciliationState.pageSize = recon.pageSize;

  const report = uiState.accountReport || {};
  const reportAccountEl = document.getElementById("filter-report-account");
  if (reportAccountEl && report.filterAccount !== undefined) reportAccountEl.value = report.filterAccount;
  if (report.sortKey) accountReportState.sortKey = report.sortKey;
  if (report.sortOrder) accountReportState.sortOrder = report.sortOrder;
  if (report.pageSize) accountReportState.pageSize = report.pageSize;
  if (report.pages) accountReportState.pages = report.pages;
}

export {
  DEFAULT_CONFIG,
  TECHNICAL_SERVICES,
  BAR_DRINK_TYPES,
  BAR_SERVICE_TYPES,
  HOST_DUTY_OPTIONS,
  EVENT_TYPES,
  appState,
  isFavoriteActivity,
  toggleFavoriteActivity,
  getRecentlyViewedActivityIds,
  recordActivityView,
  getFiscalYear,
  getQuarterNumber,
  getDefaultFiscalYear,
  getFiscalYearRange,
  getQuarter,
  parseLocalDateStr,
  formatDateStrLocal,
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
  sanitizeActivitiesList,
  loadDatabase,
  migrateRoomsConfig,
  migrateSalariesConfig,
  migrateServicesConfig,
  getActivePricingGrid,
  getActiveRateVersionField,
  getActiveSalaryRate,
  getActiveSalaryOvertimeRate,
  getActiveServiceRate,
  getFlattenedRoomTarifs,
  migrateActivities,
  seedDatabase,
  saveDatabase,
  saveUiState,
  restoreUiState
};

if (typeof window !== "undefined") {
  window.DEFAULT_CONFIG = DEFAULT_CONFIG;
  window.TECHNICAL_SERVICES = TECHNICAL_SERVICES;
  window.BAR_DRINK_TYPES = BAR_DRINK_TYPES;
  window.BAR_SERVICE_TYPES = BAR_SERVICE_TYPES;
  window.HOST_DUTY_OPTIONS = HOST_DUTY_OPTIONS;
  window.EVENT_TYPES = EVENT_TYPES;
  window.appState = appState;
  window.isFavoriteActivity = isFavoriteActivity;
  window.toggleFavoriteActivity = toggleFavoriteActivity;
  window.getRecentlyViewedActivityIds = getRecentlyViewedActivityIds;
  window.recordActivityView = recordActivityView;
  window.getFiscalYear = getFiscalYear;
  window.getQuarterNumber = getQuarterNumber;
  window.getDefaultFiscalYear = getDefaultFiscalYear;
  window.getFiscalYearRange = getFiscalYearRange;
  window.getQuarter = getQuarter;
  window.parseLocalDateStr = parseLocalDateStr;
  window.formatDateStrLocal = formatDateStrLocal;
  window.openAppDb = openAppDb;
  window.getReconDecisionsFromDb = getReconDecisionsFromDb;
  window.saveReconDecisionToDb = saveReconDecisionToDb;
  window.deleteReconDecisionFromDb = deleteReconDecisionFromDb;
  window.addActivityVersionToDb = addActivityVersionToDb;
  window.getActivityVersionsFromDb = getActivityVersionsFromDb;
  window.pruneActivityVersions = pruneActivityVersions;
  window.clearAllActivityVersionsFromDb = clearAllActivityVersionsFromDb;
  window.getAppStateFromDb = getAppStateFromDb;
  window.saveAppStateToDb = saveAppStateToDb;
  window.sanitizeActivitiesList = sanitizeActivitiesList;
  window.loadDatabase = loadDatabase;
  window.migrateRoomsConfig = migrateRoomsConfig;
  window.migrateSalariesConfig = migrateSalariesConfig;
  window.migrateServicesConfig = migrateServicesConfig;
  window.getActivePricingGrid = getActivePricingGrid;
  window.getActiveRateVersionField = getActiveRateVersionField;
  window.getActiveSalaryRate = getActiveSalaryRate;
  window.getActiveSalaryOvertimeRate = getActiveSalaryOvertimeRate;
  window.getActiveServiceRate = getActiveServiceRate;
  window.getFlattenedRoomTarifs = getFlattenedRoomTarifs;
  window.migrateActivities = migrateActivities;
  window.seedDatabase = seedDatabase;
  window.saveDatabase = saveDatabase;
  window.saveUiState = saveUiState;
  window.restoreUiState = restoreUiState;
}
