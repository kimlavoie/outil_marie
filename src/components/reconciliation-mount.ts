import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { loadReconDecisions } from "../services/reconciliation.ts";
import { ReconciliationView } from "./reconciliation-view.tsx";

let root: Root | null = null;

function mount() {
  const container = document.getElementById("validation-root");
  if (!container) return;
  if (!root) root = createRoot(container);
  root.render(createElement(ReconciliationView));
}

export function initReconciliationHandlers() {
  loadReconDecisions();
  mount();
}

export function renderReconciliation() {
  mount();
}
