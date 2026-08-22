/**
 * view-state.ts - Single source of truth for the top-level view ("dashboard", "activities", ...).
 *
 * Before this module existed, App.tsx owned `currentView` as local React state while legacy
 * modules (global-search.ts, quick-access.ts, bulk-actions.ts, backup/index.ts, backup/restore.ts,
 * backup/reminder.ts) called navigation.ts's switchToView(), which tried to switch views by
 * toggling DOM classes on #view-<id>/.view-section elements that App.tsx no longer renders (it
 * conditionally mounts view components instead). That made switchToView() a silent no-op in the
 * running app — those legacy call sites were not actually navigating anywhere. This store gives
 * both the React tree and the legacy modules the same view state to read and write.
 */
import { useSyncExternalStore } from "react";

export const VALID_VIEWS = ["dashboard", "activities", "validation", "account-report", "settings", "backup"];
const LAST_VIEW_KEY = "outil_marie_last_view";

function getInitialView(): string {
  const saved = typeof localStorage !== "undefined" ? localStorage.getItem(LAST_VIEW_KEY) : null;
  return saved && VALID_VIEWS.includes(saved) ? saved : "dashboard";
}

// Lazily initialized on first read rather than at module-evaluation time: many tests import
// this module transitively (via navigation.ts) without ever setting up a `localStorage` global,
// same reason App.tsx's old useState(() => ...) initializer read it lazily too.
let currentView: string | null = null;
const listeners = new Set<() => void>();

export function getCurrentView(): string {
  if (currentView === null) currentView = getInitialView();
  return currentView;
}

export function setCurrentView(view: string): void {
  if (!VALID_VIEWS.includes(view) || view === getCurrentView()) return;
  currentView = view;
  if (typeof localStorage !== "undefined") localStorage.setItem(LAST_VIEW_KEY, view);
  listeners.forEach(listener => listener());
}

export function subscribeCurrentView(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useCurrentView(): string {
  return useSyncExternalStore(subscribeCurrentView, getCurrentView);
}
