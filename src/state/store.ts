import { DEFAULT_CONFIG } from "./config-defaults.ts";

export interface AppState {
  settings: {
    theme: string;
    rooms: any[];
    departments: any[];
    accounts: any[];
    last_backup_date: string;
    backup_reminder_days: number;
    salaries: any[];
    services: any[];
    global_tasks: any[];
    schedulable_tasks: any[];
    tax_rates: { tps: number; tvq: number };
  };
  activities: any[];
  favorites: any[];
  selected_year: string;
  selected_quarters: number[];
}

// Global App State
export let appState: AppState = {
  settings: {
    theme: "dark",
    rooms: [...DEFAULT_CONFIG.rooms],
    departments: [...DEFAULT_CONFIG.departments],
    accounts: [...DEFAULT_CONFIG.accounts],
    last_backup_date: "",
    backup_reminder_days: 7,
    salaries: [...DEFAULT_CONFIG.salaries],
    services: [...DEFAULT_CONFIG.services],
    global_tasks: [...DEFAULT_CONFIG.global_tasks],
    schedulable_tasks: [...DEFAULT_CONFIG.schedulable_tasks],
    tax_rates: { ...DEFAULT_CONFIG.tax_rates }
  },
  activities: [],
  favorites: [], // ids of activities pinned (by the user) to the "Accès rapide" list
  selected_year: "",
  selected_quarters: [1, 2, 3, 4]
};

// ES modules only give importers a read-only live view of an exported `let` — backup.js's JSON
// restore needs to actually replace the whole object (not just mutate fields), so it goes
// through this setter instead of assigning the imported binding directly (same pattern as
// activities-financials.ts's setActivityUndoSnapshotTimer).
export function setAppState(newState: AppState) {
  appState = newState;
}
