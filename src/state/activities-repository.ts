/**
 * activities-repository.ts - Single point of access to appState.activities, so call sites stop
 * reaching into appState.activities directly (find/findIndex/push/filter scattered across ~50
 * files). Pure wrapper around the existing in-memory array: no behavior change, no change to what
 * gets persisted or how (loadDatabase/saveDatabase in state.ts are untouched). This is the first
 * step towards a storage backend that isn't "serialize the whole appState object" (e.g. Firestore,
 * where each activity would be its own document) — that swap happens inside this file later,
 * without every caller needing to change again.
 */
import { appState } from "./store.ts";
import type { Activity } from "../types/activity.ts";

/** Returns the live activities array (same reference as appState.activities). */
function getActivities(): Activity[] {
  return appState.activities;
}

/** Replaces the entire activities list (migrations, restore-from-backup, seeding). */
function replaceAllActivities(activities: Activity[]): void {
  appState.activities = activities;
}

/** Returns the live Activity object for `id` (mutating it in place is reflected in appState), or undefined. */
function getActivityById(id: string): Activity | undefined {
  return appState.activities.find(a => a.id === id);
}

/** Returns the index of `id` in the activities array, or -1. */
function getActivityIndex(id: string): number {
  return appState.activities.findIndex(a => a.id === id);
}

/** Appends a newly-created activity to the list. */
function addActivity(activity: Activity): void {
  appState.activities.push(activity);
}

/** Replaces the activity at `id` wholesale (e.g. undo/restore to a snapshot). Returns false if not found. */
function replaceActivity(id: string, activity: Activity): boolean {
  const idx = getActivityIndex(id);
  if (idx === -1) return false;
  appState.activities[idx] = activity;
  return true;
}

/** Shallow-merges `patch` into the activity at `id`. Returns the updated activity, or undefined if not found. */
function updateActivity(id: string, patch: Partial<Activity>): Activity | undefined {
  const idx = getActivityIndex(id);
  if (idx === -1) return undefined;
  appState.activities[idx] = { ...appState.activities[idx], ...patch };
  return appState.activities[idx];
}

/** Removes the activity at `id` from the list outright (hard delete, not the soft `.deleted` flag). */
function removeActivity(id: string): void {
  appState.activities = appState.activities.filter(a => a.id !== id);
}

export {
  getActivities,
  replaceAllActivities,
  getActivityById,
  getActivityIndex,
  addActivity,
  replaceActivity,
  updateActivity,
  removeActivity
};
