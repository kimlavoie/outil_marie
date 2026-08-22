import React from "react";
import { useAppState, saveDatabaseOrRollback, getFiscalYear, getDefaultFiscalYear } from "../../state/state.ts";
import { reconciliationState, reconcileLedger } from "../../services/reconciliation.ts";

const FISCAL_YEAR_RANGE_PAST = 1;
const FISCAL_YEAR_RANGE_FUTURE = 3;

function getFiscalYearWindow(): string[] {
  const currentStartYear = parseInt(getDefaultFiscalYear().split("-")[0], 10);
  const years: string[] = [];
  for (let offset = -FISCAL_YEAR_RANGE_PAST; offset <= FISCAL_YEAR_RANGE_FUTURE; offset++) {
    const startYear = currentStartYear + offset;
    years.push(`${startYear}-${startYear + 1}`);
  }
  return years;
}

export const PeriodSelector: React.FC = () => {
  const selectedYear = useAppState(s => s.selected_year);
  const selectedQuarters = useAppState(s => s.selected_quarters);
  const activities = useAppState(s => s.activities);

  // Derive available fiscal years
  const availableYears = React.useMemo(() => {
    const yearsSet = new Set(getFiscalYearWindow());
    activities.forEach(act => {
      if (!act.deleted && act.date_start) {
        const fy = getFiscalYear(act.date_start);
        if (fy) yearsSet.add(fy);
      }
    });
    return Array.from(yearsSet).sort();
  }, [activities]);

  // Build active period description string
  const activePeriodDescription = React.useMemo(() => {
    const fy = selectedYear;
    const qs = selectedQuarters;

    if (!fy) return "Aucune année financière sélectionnée.";
    if (qs.length === 0) return "⚠️ Aucun trimestre sélectionné";

    const match = /^(\d{4})-(\d{4})$/.exec(fy);
    if (!match) return `Période : ${fy}`;

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

    return `📅 Activités affichées : ${dateRangeStr}`;
  }, [selectedYear, selectedQuarters]);

  const QUARTER_LABELS = [
    { q: 1, label: "T1 (Juil - Sept)" },
    { q: 2, label: "T2 (Oct - Déc)" },
    { q: 3, label: "T3 (Jan - Mars)" },
    { q: 4, label: "T4 (Avr - Juin)" }
  ];

  return (
    <div className="period-selector-widget">
      <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-secondary)" }}>
        Année financière :
      </span>
      <select
        id="top-fiscal-year"
        className="select-input period-select"
        value={selectedYear}
        onChange={e => {
          const val = e.target.value;
          import("../../state/state.ts").then(m => {
            const prev = m.appState.selected_year;
            m.appState.selected_year = val;
            m.notifyAppStateChange();
            saveDatabaseOrRollback(() => {
              m.appState.selected_year = prev;
            }, "Le changement d'année n'a pas été enregistré. Réessayez.").then(() => {
              if (reconciliationState.ledgerTransactions.length > 0) {
                reconcileLedger();
              }
            });
          });
        }}
      >
        {availableYears.map(fy => (
          <option key={fy} value={fy}>
            {fy}
          </option>
        ))}
      </select>

      <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-secondary)", marginLeft: "4px" }}>
        Trimestres :
      </span>
      <div className="quarter-toggles" style={{ display: "flex", gap: "6px" }}>
        {QUARTER_LABELS.map(({ q, label }) => {
          const isActive = selectedQuarters.includes(q);
          return (
            <button
              key={q}
              type="button"
              className={`quarter-toggle ${isActive ? "active" : ""}`}
              data-q={q}
              onClick={() => {
                import("../../state/state.ts").then(m => {
                  const prev = [...m.appState.selected_quarters];
                  if (isActive) {
                    m.appState.selected_quarters = m.appState.selected_quarters.filter(x => x !== q);
                  } else {
                    m.appState.selected_quarters = [...m.appState.selected_quarters, q];
                  }
                  m.notifyAppStateChange();
                  saveDatabaseOrRollback(() => {
                    m.appState.selected_quarters = prev;
                  }, "La sélection de trimestre n'a pas été enregistrée. Réessayez.").then(() => {
                    if (reconciliationState.ledgerTransactions.length > 0) {
                      reconcileLedger();
                    }
                  });
                });
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div
        id="active-period-description"
        className="active-period-description"
        dangerouslySetInnerHTML={{ __html: activePeriodDescription }}
      />
    </div>
  );
};
