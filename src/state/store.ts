import { DEFAULT_CONFIG } from "./config-defaults.ts";
import type { Activity } from "../types/activity.ts";

// Domain types for src/state/config-defaults.ts's seed data and everything stored under
// appState.settings — shared here (rather than left as `any[]` on AppState) so a typo on a field
// name (e.g. reading `s.rate` on a Service, which has none — rates live under its tarifs' own
// rate_versions) is caught at compile time instead of silently computing 0 at runtime.

export interface RateVersion {
  id: string;
  effective_date: string;
  rate: number;
  overtime_rate?: number;
}

// A named price point (e.g. "Interne" / "Externe") a salary or service can be billed under, each
// with its own GL account and its own dated rate history.
export interface Tarif {
  id: string;
  label: string;
  gl_account_code?: string;
  rate_versions: RateVersion[];
}

export interface Salary {
  id: string;
  job: string;
  rate_versions: RateVersion[];
}

export interface Service {
  id: string;
  name: string;
  type: "hourly" | "fixed";
  tarifs: Tarif[];
}

export interface Account {
  code: string;
  description: string;
}

export interface GlobalTask {
  id: string;
  description: string;
}

export interface LinkedStaff {
  id: string;
  salary_id: string;
  count: number;
}

export interface LinkedFee {
  id: string;
  description: string;
  amount: number;
}

export interface LinkedTask {
  id: string;
  description: string;
}

export interface GridParameter {
  id: string;
  name: string;
  details?: string;
}

export interface GridClientType {
  id: string;
  name: string;
  gl_account_code?: string;
}

export interface GridCell {
  parameter_id: string;
  client_type_id: string;
  amount: number;
}

// One dated version of a room's pricing matrix (parameters x client_types, one $ amount per
// cell). A room can carry several, each taking effect from its own effective_date.
export interface PricingGrid {
  id: string;
  effective_date: string;
  parameters: GridParameter[];
  client_types: GridClientType[];
  cells: GridCell[];
}

export interface Room {
  name: string;
  color: string;
  abbreviation?: string;
  rate_type?: "daily" | "hourly";
  setup_fee?: number;
  pricing_grids: PricingGrid[];
  linked_rooms: string[];
  linked_staff: LinkedStaff[];
  linked_fees: LinkedFee[];
  linked_tasks: LinkedTask[];
}

export interface TaskCondition {
  id: string;
  field: string;
  operator: string;
  value: string | number;
}

export interface ConditionGroup {
  id: string;
  logic: "AND" | "OR";
  conditions: TaskCondition[];
}

// A planning task auto-suggested on an activity when its conditions (event type, client type,
// department, rooms/services reserved, attendee count...) match. See activities/planning-tab.ts.
export interface SchedulableTask {
  id: string;
  description: string;
  groups_logic: "AND" | "OR";
  groups: ConditionGroup[];
}

export interface AppState {
  settings: {
    theme: string;
    rooms: Room[];
    departments: string[];
    accounts: Account[];
    last_backup_date: string;
    backup_reminder_days: number;
    salaries: Salary[];
    services: Service[];
    global_tasks: GlobalTask[];
    schedulable_tasks: SchedulableTask[];
    tax_rates: { tps: number; tvq: number };
  };
  activities: Activity[];
  favorites: string[];
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

import { useSyncExternalStore } from "react";

type StateChangeListener = () => void;
const listeners = new Set<StateChangeListener>();

/**
 * Subscribes a callback to appState change notifications.
 * Returns an unsubscribe function.
 */
export function subscribeAppState(listener: StateChangeListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Notifies all registered subscribers that appState has been mutated or replaced.
 */
export function notifyAppStateChange(): void {
  appState = { ...appState };
  listeners.forEach(listener => {
    try {
      listener();
    } catch (e) {
      console.error("Error in appState listener:", e);
    }
  });
}

/**
 * React 19 hook to subscribe to appState or a selected slice of appState.
 */
export function useAppState(): AppState;
export function useAppState<T>(selector: (state: AppState) => T): T;
export function useAppState<T>(selector?: (state: AppState) => T): T | AppState {
  return useSyncExternalStore(
    subscribeAppState,
    () => (selector ? selector(appState) : appState)
  );
}

// ES modules only give importers a read-only live view of an exported `let` — backup.js's JSON
// restore needs to actually replace the whole object (not just mutate fields), so it goes
// through this setter instead of assigning the imported binding directly (same pattern as
// activities-financials.ts's setActivityUndoSnapshotTimer).
export function setAppState(newState: AppState) {
  appState = newState;
  notifyAppStateChange();
}
