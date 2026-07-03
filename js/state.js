/**
 * state.js - Configuration, global application state, and persistence
 * (loaded first: other modules depend on appState and the period helpers)
 */

// Embedded default configurations (Seed Data)
const DEFAULT_CONFIG = {
  rooms: [
    { name: "POLY", color: "#4f46e5", tarifs: [{ id: "tarif-poly-int", description: "Interne", amount: 175.0 }] },
    { name: "SALON", color: "#059669", tarifs: [{ id: "tarif-salon-int", description: "Interne", amount: 50.0 }, { id: "tarif-salon-ext", description: "Externe", amount: 100.0 }] },
    { name: "SFB-SALON-HALL", color: "#d97706", tarifs: [{ id: "tarif-sfbsh-int", description: "Interne", amount: 200.0 }] },
    { name: "SFB-POLY", color: "#db2777", tarifs: [{ id: "tarif-sfbp-int", description: "Interne", amount: 375.0 }] },
    { name: "HALL SFB", color: "#0891b2", tarifs: [{ id: "tarif-hallsfb-int", description: "Interne", amount: 0.0 }] }
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
    backup_reminder_days: 7
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

// Load DB from LocalStorage
function loadDatabase() {
  const localData = localStorage.getItem("outil_marie_db");
  if (localData) {
    try {
      const parsed = JSON.parse(localData);
      appState.settings = parsed.settings || appState.settings;
      appState.activities = parsed.activities || [];
      appState.selected_year = parsed.selected_year || getDefaultFiscalYear();
      appState.selected_quarters = parsed.selected_quarters || [1, 2, 3, 4];

      // Safety check: ensure accounts, rooms, departments exist
      if (!appState.settings.accounts) appState.settings.accounts = [...DEFAULT_CONFIG.accounts];
      if (!appState.settings.rooms) appState.settings.rooms = [...DEFAULT_CONFIG.rooms];
      if (!appState.settings.departments) appState.settings.departments = [...DEFAULT_CONFIG.departments];
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
      migrateActivities();
    } catch (e) {
      console.error("Error parsing local database, using defaults", e);
      seedDatabase();
    }
  } else {
    seedDatabase();
  }
}

// Migrate legacy room config (price_internal/price_external) to a list of named tarifs per room
function migrateRoomsConfig() {
  (appState.settings.rooms || []).forEach(room => {
    if (room.tarifs) return; // already migrated
    const tarifs = [{ id: generateUid("tarif"), description: "Interne", amount: room.price_internal || 0 }];
    if (room.price_external > 0) {
      tarifs.push({ id: generateUid("tarif"), description: "Externe", amount: room.price_external });
    }
    room.tarifs = tarifs;
    delete room.price_internal;
    delete room.price_external;
  });
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
        const matchedTariff = roomConfig && roomConfig.tarifs
          ? (roomConfig.tarifs.find(t => t.description === wantedTariffDesc) || roomConfig.tarifs[0])
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
  });
}

// Seed Initial Database with empty activities list
function seedDatabase() {
  appState.settings = {
    theme: "dark",
    rooms: [...DEFAULT_CONFIG.rooms],
    departments: [...DEFAULT_CONFIG.departments],
    accounts: [...DEFAULT_CONFIG.accounts].sort((a, b) => a.code.localeCompare(b.code)),
    last_backup_date: "",
    backup_reminder_days: 7
  };

  appState.activities = [];
  appState.selected_year = getDefaultFiscalYear();
  appState.selected_quarters = [1, 2, 3, 4];
  saveDatabase();
}

// Save state to LocalStorage
function saveDatabase() {
  localStorage.setItem("outil_marie_db", JSON.stringify(appState));
  checkBackupReminder();
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
