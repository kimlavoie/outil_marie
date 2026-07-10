import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { SettingsView } from "./view.tsx";

export type Command =
  | { type: "openPanel"; panel: string; seq: number }
  | { type: "openAccountModal"; code: string; seq: number }
  | { type: "openDeptModal"; name: string; seq: number }
  | { type: "closeAll"; seq: number }
  | null;

let root: Root | null = null;
let pendingCommand: Command = null;
let seqCounter = 0;

function mount() {
  const container = document.getElementById("settings-root");
  if (!container) return;
  if (!root) root = createRoot(container);
  root.render(createElement(SettingsView, { command: pendingCommand }));
}

export function renderSettings() {
  mount();
}

export function openSettingsPanel(panel: string) {
  pendingCommand = { type: "openPanel", panel, seq: ++seqCounter };
  mount();
}

export function openAccountModal(code: string) {
  pendingCommand = { type: "openAccountModal", code, seq: ++seqCounter };
  mount();
}

export function openDeptModal(name: string) {
  pendingCommand = { type: "openDeptModal", name, seq: ++seqCounter };
  mount();
}

export function closeAllSettingsModals() {
  pendingCommand = { type: "closeAll", seq: ++seqCounter };
  mount();
}
