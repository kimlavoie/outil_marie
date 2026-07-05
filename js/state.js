/**
 * state.js - Configuration, global application state, and persistence
 * (loaded first: other modules depend on appState and the period helpers)
 */

// Embedded default configurations (Seed Data)
// Builds a single-parameter pricing grid (one row "Tarif" x one column per client type) from
// a flat list of {description, amount} pairs — used only to seed DEFAULT_CONFIG in the same
// shape the old flat `tarifs[]` used to produce, now expressed as a versioned pricing grid.
function buildSeedPricingGrid(gridId, paramId, tarifPairs) {
  return {
    id: gridId,
    effective_date: "", // "" means "in effect since the beginning"
    parameters: [{ id: paramId, name: "Tarif" }],
    client_types: tarifPairs.map((t, i) => ({ id: `${gridId}-ct${i}`, name: t.description })),
    cells: tarifPairs.map((t, i) => ({ parameter_id: paramId, client_type_id: `${gridId}-ct${i}`, amount: t.amount }))
  };
}

const DEFAULT_CONFIG = {
  rooms: [
    { name: "POLY", color: "#4f46e5", pricing_grids: [buildSeedPricingGrid("grid-poly", "param-poly", [{ description: "Interne", amount: 175.0 }])], linked_rooms: [], linked_staff: [], linked_fees: [], linked_tasks: [] },
    { name: "SALON", color: "#059669", pricing_grids: [buildSeedPricingGrid("grid-salon", "param-salon", [{ description: "Interne", amount: 50.0 }, { description: "Externe", amount: 100.0 }])], linked_rooms: [], linked_staff: [], linked_fees: [], linked_tasks: [] },
    { name: "SFB-SALON-HALL", color: "#d97706", pricing_grids: [buildSeedPricingGrid("grid-sfbsh", "param-sfbsh", [{ description: "Interne", amount: 200.0 }])], linked_rooms: [], linked_staff: [], linked_fees: [], linked_tasks: [] },
    { name: "SFB-POLY", color: "#db2777", pricing_grids: [buildSeedPricingGrid("grid-sfbp", "param-sfbp", [{ description: "Interne", amount: 375.0 }])], linked_rooms: [], linked_staff: [], linked_fees: [], linked_tasks: [] },
    { name: "HALL SFB", color: "#0891b2", pricing_grids: [buildSeedPricingGrid("grid-hallsfb", "param-hallsfb", [{ description: "Interne", amount: 0.0 }])], linked_rooms: [], linked_staff: [], linked_fees: [], linked_tasks: [] }
  ],
  departments: [
    "ACEECJ",
    "ANIMATION PÉDAGOGIQUE (ALEXANDRA  HÉBERT)",
    "BICQ",
    "BRI - BUREAU DE LA RECHERCHE ET DE L'INNOVATION",
    "CLIENT EXTERNE",
    "COMMUNICATION",
    "DIRECTION DES SERVICES INFORMATIONNELLES",
    "DIRECTION DES ÉTUDES (ENSEIGNANTS)",
    "DIRECTION GÉNÉRALE",
    "DRH - DIRECTION DES RESSOURCES HUMAINES",
    "DSATC",
    "FONDATION ASSELIN",
    "PARTENARIAT",
    "VIE ÉTUDIANTE (SOPHIE HUPPÉ)"
  ],
  accounts: [
    { code: "892-9020-00-849", description: "SCOLAIRE" },
    { code: "892-9020-01-849", description: "SCOLAIRE" },
    { code: "892-9020-04-849", description: "SCOLAIRE" },
    { code: "892-9020-00-851", description: "GOUV QC" },
    { code: "892-9020-01-851", description: "GOUV QC" },
    { code: "892-9020-04-851", description: "GOUV QC" },
    { code: "892-9020-00-853", description: "MUNICIPAL" },
    { code: "892-9020-01-853", description: "MUNICIPAL" },
    { code: "892-9020-04-853", description: "MUNICIPAL" },
    { code: "892-9020-00-864", description: "BAR SFB" },
    { code: "892-9020-01-864", description: "BAR POLY" },
    { code: "892-9020-00-869", description: "VESTIAIRE" },
    { code: "892-9020-01-869", description: "VESTIAIRE" },
    { code: "892-9020-00-870", description: "CIE EXTERNE (SFB, DT, HOTES)" },
    { code: "892-9020-01-870", description: "CIE EXTERNE (POLY, DT, HOTES)" },
    { code: "892-9020-04-870", description: "CIE EXTERNE (AGENT)" },
    { code: "892-9020-05-870", description: "CIE EXTERNE (PROJO CINÉ-CLUB)" },
    { code: "892-9020-06-870", description: "CIE EXTERNE (PROJO SFB)" },
    { code: "892-9020-07-870", description: "CIE EXTERNE (PROJO POLY)" },
    { code: "892-9020-00-889", description: "INTERNE (SFB, HOTES)" },
    { code: "892-9020-01-889", description: "INTERNE (POLY, HOTES)" },
    { code: "892-9020-04-889", description: "INTERNE (AGENT)" },
    { code: "892-9020-05-889", description: "INTERNE (PROJO CINÉ-CLUB)" },
    { code: "892-9020-06-889", description: "INTERNE (PROJO SFB)" },
    { code: "892-9020-07-889", description: "INTERNE (PROJO POLY)" }
  ],
  salaries: [
    { id: "salary-dt", job: "Directeur technique", rate_versions: [{ id: "rv-dt", effective_date: "", rate: 74 }] },
    { id: "salary-tc", job: "Technicien contractuel", rate_versions: [{ id: "rv-tc", effective_date: "", rate: 57 }] },
    { id: "salary-aet", job: "Appariteur étudiant technicien", rate_versions: [{ id: "rv-aet", effective_date: "", rate: 37 }] },
    { id: "salary-hote", job: "Hôte", rate_versions: [{ id: "rv-hote", effective_date: "", rate: 27 }] },
    { id: "salary-as", job: "Agent de sécurité", rate_versions: [{ id: "rv-as", effective_date: "", rate: 50 }] },
    { id: "salary-sauveteur", job: "Sauveteur", rate_versions: [{ id: "rv-sauveteur", effective_date: "", rate: 42 }] }
  ]
};

const TECHNICAL_SERVICES = ["Microphone", "Écran projecteur", "Éclairage de scène", "Musique d'ambiance", "Fichier audio, vidéo ou présentation PowerPoint"];
const CONSUMPTION_OPTIONS = ["Consommation de breuvage avec alcool", "Consommation de breuvage sans alcool", "Cueillette au bar et paiement de ce qui est consommé", "Breuvages aux frais des participants (service de bar)", "Commande spéciale de produit"];
const HOST_SERVICES_OPTIONS = ["Service de bar payant", "Surveillance aux portes", "Distribution de breuvages et nettoyages de coupes", "Distribution de bouchées", "Aide au montage", "Aide au démontage"];
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
    salaries: [...DEFAULT_CONFIG.salaries]
  },
  activities: [],
  selected_year: "",
  selected_quarters: [1, 2, 3, 4]
};

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

// --- IndexedDB Configuration for App State ---
const APP_DB_NAME = "outil_marie_app";
const APP_STORE_NAME = "app_state_store";
const APP_STATE_KEY = "app_state";

function openAppDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(APP_DB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(APP_STORE_NAME)) {
        db.createObjectStore(APP_STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
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
          console.error("Error parsing legacy localStorage database", e);
        }
      }
    }

    if (dbData) {
      appState.settings = dbData.settings || appState.settings;
      appState.activities = dbData.activities || [];
      appState.selected_year = dbData.selected_year || getDefaultFiscalYear();
      appState.selected_quarters = dbData.selected_quarters || [1, 2, 3, 4];

      // Safety check: ensure accounts, rooms, departments exist
      if (!appState.settings.accounts) appState.settings.accounts = [...DEFAULT_CONFIG.accounts];
      if (!appState.settings.rooms) appState.settings.rooms = [...DEFAULT_CONFIG.rooms];
      if (!appState.settings.departments) appState.settings.departments = [...DEFAULT_CONFIG.departments];
      if (!appState.settings.salaries || appState.settings.salaries.length === 0) appState.settings.salaries = [...DEFAULT_CONFIG.salaries];
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
      migrateActivities();
    } else {
      await seedDatabase();
    }
  } catch (e) {
    console.error("Error loading database from IndexedDB, using defaults", e);
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
      room.pricing_grids = [{
        id: generateUid("grid"),
        effective_date: "",
        parameters: [{ id: paramId, name: "Tarif" }],
        client_types: tarifs.map(t => ({ id: t.id, name: t.description })),
        cells: tarifs.map(t => ({ parameter_id: paramId, client_type_id: t.id, amount: t.amount }))
      }];
    }
    delete room.tarifs;

    if (!room.linked_rooms) room.linked_rooms = [];
    if (!room.linked_staff) room.linked_staff = [];
    if (!room.linked_fees) room.linked_fees = [];
    if (!room.linked_tasks) room.linked_tasks = [];
  });
}

// Migrate legacy flat salary rate to a versioned rate history per job
function migrateSalariesConfig() {
  (appState.settings.salaries || []).forEach(sal => {
    if (sal.rate_versions) return; // already migrated
    sal.rate_versions = [{ id: generateUid("rv"), effective_date: "", rate: sal.rate || 0 }];
    delete sal.rate;
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

// Returns the salary rate in effect for `dateStr` (same resolution rule as getActivePricingGrid)
function getActiveSalaryRate(salary, dateStr) {
  const versions = (salary && salary.rate_versions) || [];
  if (versions.length === 0) return 0;
  const sorted = [...versions].sort((a, b) => (a.effective_date || "").localeCompare(b.effective_date || ""));
  if (!dateStr) return sorted[0].rate;
  let applicable = sorted[0];
  sorted.forEach(v => {
    if (!v.effective_date || v.effective_date <= dateStr) applicable = v;
  });
  return applicable.rate;
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
      tarifs.push({ id: `${param.id}::${ct.id}`, description: desc, amount: cell ? cell.amount : 0, gl_account_code: param.gl_account_code || "" });
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
        const matchedTariff = flatTarifs.length
          ? (flatTarifs.find(t => t.description === wantedTariffDesc) || flatTarifs[0])
          : null;
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

    (act.rooms || []).forEach(r => {
      if (r.tariff_gl_account_code === undefined) r.tariff_gl_account_code = "";
    });

    if (act.description === undefined) act.description = "";
    if (!act.activity_manager) {
      act.activity_manager = { first_name: "", last_name: "", type: "employe", phone: "", email: "" };
    }
    if (!act.technical_services) act.technical_services = [];
    if (!act.consumption) act.consumption = [];
    if (act.consumption_special_products === undefined) act.consumption_special_products = "";
    if (!act.host_services) act.host_services = [];
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
    if (!act.client) act.client = { first_name: "", last_name: "", phone: "", email: "" };
    if (!act.staff) act.staff = [];
    if (!act.fees) act.fees = [];
    if (!act.submission) act.submission = { file_link_id: "", generated_at: "", sent_at: "" };
    if (!act.contract) act.contract = { file_link_id: "", approved_at: "" };
    if (!act.planning_tasks) act.planning_tasks = [];
    if (act.billed_at === undefined) act.billed_at = "";
    if (act.completed_at === undefined) act.completed_at = "";
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
    salaries: [...DEFAULT_CONFIG.salaries]
  };

  appState.activities = [];
  appState.selected_year = getDefaultFiscalYear();
  appState.selected_quarters = [1, 2, 3, 4];
  await saveDatabase();
}

// Save state to IndexedDB
async function saveDatabase() {
  try {
    await saveAppStateToDb(appState);
  } catch (e) {
    console.error("Error saving database to IndexedDB", e);
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
    console.error("Error parsing saved UI state, ignoring", e);
    return;
  }

  const act = uiState.activities || {};
  const searchEl = document.getElementById("activity-search");
  const salleEl = document.getElementById("filter-salle");
  const clientTypeEl = document.getElementById("filter-client-type");
  if (searchEl && act.search !== undefined) searchEl.value = act.search;
  if (salleEl && act.filterSalle !== undefined) salleEl.value = act.filterSalle;
  if (clientTypeEl && act.filterClientType !== undefined) clientTypeEl.value = act.filterClientType;
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
