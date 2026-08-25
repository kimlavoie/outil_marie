import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { logError } from "./utils/logger.ts";
import { showToast } from "./utils/utils.ts";
import { appState, loadDatabase } from "./state/state.ts";
import { applyTheme } from "./navigation.ts";

window.addEventListener("error", e => {
  logError("main", "erreur non gérée", e.error || e.message);
  showToast("Une erreur inattendue est survenue. Voir la console pour les détails.", "error");
});

window.addEventListener("unhandledrejection", e => {
  logError("main", "promesse rejetée non gérée", e.reason);
  showToast("Une erreur inattendue est survenue. Voir la console pour les détails.", "error");
});

document.addEventListener("DOMContentLoaded", async () => {
  // Blocking, in this order, before the first render: appState must hold real data (not
  // defaults) and the theme must be applied before React ever paints, or the app would flash
  // empty/default content and the wrong theme for a frame. Everything else the app used to wire
  // up here at startup (activity drawer/backup/reconciliation/calendar/datepicker handlers,
  // dropdown population, saved UI state) now happens in App.tsx's own mount effect instead —
  // it doesn't need to block the first paint, just to run once React has actually committed.
  await loadDatabase();
  applyTheme(appState.settings.theme || "dark");

  const rootElement = document.getElementById("root");
  if (rootElement) {
    createRoot(rootElement).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  }
});
