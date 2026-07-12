import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { loadReconDecisions } from "../services/reconciliation.ts";
import { showToast } from "../utils/utils.ts";
import { ReconciliationView } from "./reconciliation-view.tsx";

let root: Root | null = null;

function mount() {
  const container = document.getElementById("validation-root");
  if (!container) return;
  if (!root) root = createRoot(container);
  root.render(createElement(ReconciliationView));
}

export function initReconciliationHandlers() {
  loadReconDecisions().then(success => {
    if (!success) {
      showToast(
        "Impossible de charger les décisions de rapprochement précédemment enregistrées. Elles pourraient sembler manquantes.",
        "error"
      );
    }
  });
  mount();
}

export function renderReconciliation() {
  mount();
}
