import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { DashboardView } from "./dashboard-view.tsx";

let root: Root | null = null;

export function renderDashboardReact() {
  const container = document.getElementById("dashboard-root");
  if (!container) return;
  if (!root) root = createRoot(container);
  root.render(createElement(DashboardView));
}

// Both re-render the same React tree: the split only mattered for the old imperative DOM code
// (stats vs. charts were separate DOM writes), React recomputes everything together either way.
// navigation.js imports and calls these on every view switch to "dashboard" and on theme
// toggle — see js/navigation.js.
export function renderDashboard() {
  renderDashboardReact();
}

export function renderDashboardCharts() {
  renderDashboardReact();
}
