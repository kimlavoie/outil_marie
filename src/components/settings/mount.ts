/**
 * mount.ts - Shared command channel into the Settings view.
 *
 * Used to create a second, detached React root at #settings-root so imperative callers
 * (GlobalSearch.tsx, activities/form.ts, navigation.ts's renderView) could open a specific
 * settings tab/modal without going through App.tsx's props. But #settings-root was never
 * actually rendered anywhere in the DOM (App.tsx mounts <SettingsView /> directly inside its own
 * tree instead), so every call to openSettingsPanel/openAccountModal/openDeptModal/
 * closeAllSettingsModals/renderSettings silently did nothing — e.g. clicking a GL account or
 * department result in the global search box switched to the Settings view but never opened the
 * right tab or modal.
 *
 * Fixed the same way as switchToView (see state/view-state.ts): this is now a plain command
 * store (useSyncExternalStore, same pattern as appState/useAppState) that the live <SettingsView>
 * instance in App.tsx reads via useSettingsCommand(), instead of a second root nobody mounts.
 */
import { useSyncExternalStore } from "react";

export type Command =
  | { type: "openPanel"; panel: string; seq: number }
  | { type: "openAccountModal"; code: string; seq: number }
  | { type: "openDeptModal"; name: string; seq: number }
  | { type: "closeAll"; seq: number }
  | null;

let pendingCommand: Command = null;
let seqCounter = 0;
const listeners = new Set<() => void>();

function setCommand(command: Command) {
  pendingCommand = command;
  listeners.forEach(listener => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSettingsCommand(): Command {
  return useSyncExternalStore(subscribe, () => pendingCommand);
}

export function openSettingsPanel(panel: string) {
  setCommand({ type: "openPanel", panel, seq: ++seqCounter });
}

export function openAccountModal(code: string) {
  setCommand({ type: "openAccountModal", code, seq: ++seqCounter });
}

export function openDeptModal(name: string) {
  setCommand({ type: "openDeptModal", name, seq: ++seqCounter });
}

export function closeAllSettingsModals() {
  setCommand({ type: "closeAll", seq: ++seqCounter });
}
