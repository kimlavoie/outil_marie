/**
 * navigation/period-selector.ts - The top-bar fiscal year/quarter selector: populating the year
 * dropdown, wiring the quarter toggle pills, and the human-readable "Activités affichées : ..."
 * description. Split out of navigation.ts (see that file for why it stays a barrel importing/
 * re-exporting this alongside global-search.ts/quick-access.ts).
 *
 * Imports renderAll back from navigation.ts (a real circular import, same as global-search.ts/
 * quick-access.ts) — safe since nothing runs during either module's top-level evaluation.
 */
import { appState, saveDatabaseOrRollback, getFiscalYear, getDefaultFiscalYear } from "../state/state.ts";
import { reconciliationState, reconcileLedger } from "../services/reconciliation.ts";
import { renderAll } from "../navigation.ts";

function updateActivePeriodDescription() {
  const descEl = document.getElementById("active-period-description");
  if (!descEl) return;

  const fy = appState.selected_year;
  const qs = appState.selected_quarters;

  if (!fy) {
    descEl.innerHTML = "Aucune année financière sélectionnée.";
    return;
  }

  if (qs.length === 0) {
    descEl.innerHTML = `⚠️ <span style="color: var(--danger-text, #f43f5e);">Aucun trimestre sélectionné</span>`;
    return;
  }

  const match = /^(\d{4})-(\d{4})$/.exec(fy);
  if (!match) {
    descEl.innerHTML = `Période : ${fy}`;
    return;
  }

  const y1 = match[1];
  const y2 = match[2];

  const sortedQs = [...qs].sort((a, b) => a - b);

  const isContiguous = (() => {
    for (let i = 0; i < sortedQs.length - 1; i++) {
      if (sortedQs[i + 1] !== sortedQs[i] + 1) return false;
    }
    return true;
  })();

  let dateRangeStr = "";
  if (sortedQs.length === 4) {
    dateRangeStr = `du <strong>1er juillet ${y1}</strong> au <strong>30 juin ${y2}</strong>`;
  } else if (isContiguous) {
    const startQ = sortedQs[0];
    const endQ = sortedQs[sortedQs.length - 1];

    let startStr = "";
    if (startQ === 1) startStr = `1er juillet ${y1}`;
    else if (startQ === 2) startStr = `1er octobre ${y1}`;
    else if (startQ === 3) startStr = `1er janvier ${y2}`;
    else startStr = `1er avril ${y2}`;

    let endStr = "";
    if (endQ === 1) endStr = `30 septembre ${y1}`;
    else if (endQ === 2) endStr = `31 décembre ${y1}`;
    else if (endQ === 3) endStr = `31 mars ${y2}`;
    else endStr = `30 juin ${y2}`;

    dateRangeStr = `du <strong>${startStr}</strong> au <strong>${endStr}</strong>`;
  } else {
    const qDetails = sortedQs.map(q => {
      if (q === 1) return `T1 (Juil-Sept ${y1})`;
      if (q === 2) return `T2 (Oct-Déc ${y1})`;
      if (q === 3) return `T3 (Janv-Mars ${y2})`;
      return `T4 (Avr-Juin ${y2})`;
    });
    dateRangeStr = `trimestres ${qDetails.join(", ")}`;
  }

  descEl.innerHTML = `📅 Activités affichées : ${dateRangeStr}`;
}

function initPeriodSelector() {
  populateFiscalYears();

  document.querySelectorAll(".quarter-toggle").forEach(btn => {
    const q = parseInt(btn.getAttribute("data-q") || "0", 10);

    if (appState.selected_quarters.includes(q)) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }

    btn.addEventListener("click", () => {
      btn.classList.toggle("active");
      const isActive = btn.classList.contains("active");
      const prevQuarters = appState.selected_quarters;

      if (isActive) {
        if (!appState.selected_quarters.includes(q)) {
          appState.selected_quarters = [...appState.selected_quarters, q];
        }
      } else {
        appState.selected_quarters = appState.selected_quarters.filter(x => x !== q);
      }

      saveDatabaseOrRollback(() => {
        appState.selected_quarters = prevQuarters;
        btn.classList.toggle("active");
      }, "La sélection de trimestre n'a pas été enregistrée. Réessayez.").then(() => {
        if (reconciliationState.ledgerTransactions.length > 0) {
          reconcileLedger();
        }

        renderAll();
      });
    });
  });

  const yearSelect = document.getElementById("top-fiscal-year") as HTMLSelectElement | null;
  if (yearSelect) {
    yearSelect.addEventListener("change", e => {
      const prevYear = appState.selected_year;
      appState.selected_year = (e.target as HTMLSelectElement).value;
      saveDatabaseOrRollback(() => {
        appState.selected_year = prevYear;
        yearSelect.value = prevYear;
      }, "Le changement d'année n'a pas été enregistré. Réessayez.").then(() => {
        if (reconciliationState.ledgerTransactions.length > 0) {
          reconcileLedger();
        }

        renderAll();
      });
    });
  }
}

// How far around the current fiscal year the dropdown always offers, so it never needs a code
// change as years pass (see TODO.txt's former "années fiscales codées en dur" entry). One year
// back covers activities still being wrapped up from the previous year; three years forward
// covers rooms booked well ahead of time.
const FISCAL_YEAR_RANGE_PAST = 1;
const FISCAL_YEAR_RANGE_FUTURE = 3;

// Builds the rolling window of fiscal years always offered, regardless of any existing activity:
// [current - FISCAL_YEAR_RANGE_PAST, current + FISCAL_YEAR_RANGE_FUTURE].
function getFiscalYearWindow(): string[] {
  const currentStartYear = parseInt(getDefaultFiscalYear().split("-")[0], 10);
  const years: string[] = [];
  for (let offset = -FISCAL_YEAR_RANGE_PAST; offset <= FISCAL_YEAR_RANGE_FUTURE; offset++) {
    const startYear = currentStartYear + offset;
    years.push(`${startYear}-${startYear + 1}`);
  }
  return years;
}

function populateFiscalYears() {
  const select = document.getElementById("top-fiscal-year") as HTMLSelectElement | null;
  if (!select) return;

  const years = new Set(getFiscalYearWindow());

  appState.activities.forEach(act => {
    if (act.deleted) return;
    if (act.date_start) {
      const fy = getFiscalYear(act.date_start);
      if (fy) years.add(fy);
    }
  });

  const sortedYears = Array.from(years).sort();

  select.innerHTML = "";
  sortedYears.forEach(fy => {
    const isSelected = fy === appState.selected_year ? "selected" : "";
    select.innerHTML += `<option value="${fy}" ${isSelected}>${fy}</option>`;
  });
}

export { updateActivePeriodDescription, initPeriodSelector, populateFiscalYears, getFiscalYearWindow };
