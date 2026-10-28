import { appState } from "../../../state/state.ts";
import type { ExcelExportOptions } from "../../../services/excel-export.ts";

const STATE_OPTIONS = [
  { val: "brouillon", lbl: "Brouillon" },
  { val: "soumission", lbl: "Soumission" },
  { val: "confirmee", lbl: "Confirmée" },
  { val: "facturee", lbl: "Facturée" },
  { val: "completee", lbl: "Complétée" },
  { val: "annulee", lbl: "Annulée" }
];

/**
 * ExcelExportFiltersTab.tsx - "Personnalisé" mode's first tab: période/dates, statuts & type de
 * client, départements & salles, recherche & filtre financier. Fully controlled by
 * ExcelExportModal.tsx, which owns `options.filters`.
 */
export function ExcelExportFiltersTab({
  filters,
  patchFilters,
  toggleListFilter,
  toggleQuarter,
  allFiscalYears,
  departments,
  rooms
}: {
  filters: ExcelExportOptions["filters"];
  patchFilters: (patch: Partial<ExcelExportOptions["filters"]>) => void;
  toggleListFilter: (key: "states" | "clientTypes" | "departments" | "rooms", value: string) => void;
  toggleQuarter: (q: number) => void;
  allFiscalYears: string[];
  departments: string[];
  rooms: string[];
}) {
  return (
    <>
      <div className="excel-form-section">
        <h4 className="excel-section-title">📅 Période &amp; Dates</h4>
        <div className="excel-grid-2">
          <label className="form-label-radio">
            <input type="radio" name="period_mode" checked={filters.periodMode === "active"} onChange={() => patchFilters({ periodMode: "active" })} />
            Période active de l'application ({appState.selected_year || "Année courante"})
          </label>
          <label className="form-label-radio">
            <input type="radio" name="period_mode" checked={filters.periodMode === "all"} onChange={() => patchFilters({ periodMode: "all" })} />
            Toutes les périodes (aucun filtre de date)
          </label>
          <label className="form-label-radio">
            <input type="radio" name="period_mode" checked={filters.periodMode === "fiscal_year"} onChange={() => patchFilters({ periodMode: "fiscal_year" })} />
            Année fiscale spécifique
          </label>
          <label className="form-label-radio">
            <input type="radio" name="period_mode" checked={filters.periodMode === "custom_dates"} onChange={() => patchFilters({ periodMode: "custom_dates" })} />
            Plage de dates personnalisée
          </label>
        </div>

        {filters.periodMode === "fiscal_year" && (
          <div className="excel-sub-box">
            <div className="form-group" style={{ marginBottom: 8 }}>
              <label htmlFor="excel-filter-fy">Année fiscale :</label>
              <select
                id="excel-filter-fy"
                className="form-control form-control-sm"
                value={filters.fiscalYear}
                onChange={e => patchFilters({ fiscalYear: e.target.value })}
              >
                <option value="">-- Toutes les années --</option>
                {allFiscalYears.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <div>
              <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-secondary)" }}>Trimestres :</span>
              <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
                {[1, 2, 3, 4].map(q => (
                  <label key={q} style={{ fontSize: "0.85rem", cursor: "pointer" }}>
                    <input type="checkbox" checked={filters.quarters.includes(q)} onChange={() => toggleQuarter(q)} />
                    T{q}
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        {filters.periodMode === "custom_dates" && (
          <div className="excel-sub-box" style={{ display: "flex", gap: 12 }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label htmlFor="excel-filter-start">Du (Date début) :</label>
              <input
                type="date"
                id="excel-filter-start"
                className="form-control form-control-sm"
                value={filters.startDate || ""}
                onChange={e => patchFilters({ startDate: e.target.value })}
              />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label htmlFor="excel-filter-end">Au (Date fin) :</label>
              <input
                type="date"
                id="excel-filter-end"
                className="form-control form-control-sm"
                value={filters.endDate || ""}
                onChange={e => patchFilters({ endDate: e.target.value })}
              />
            </div>
          </div>
        )}
      </div>

      <div className="excel-form-section" style={{ marginTop: 16 }}>
        <h4 className="excel-section-title">📌 Statuts &amp; Caractéristiques</h4>
        <div className="excel-grid-2">
          <div className="form-group">
            <label>Statuts de l'activité :</label>
            <div className="excel-chk-group">
              {STATE_OPTIONS.map(st => (
                <label key={st.val} className="excel-chk-item">
                  <input type="checkbox" checked={filters.states.includes(st.val)} onChange={() => toggleListFilter("states", st.val)} />
                  {st.lbl}
                </label>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label>Type de client :</label>
            <div className="excel-chk-group">
              <label className="excel-chk-item">
                <input type="checkbox" checked={filters.clientTypes.includes("interne")} onChange={() => toggleListFilter("clientTypes", "interne")} />
                Client Interne
              </label>
              <label className="excel-chk-item">
                <input type="checkbox" checked={filters.clientTypes.includes("externe")} onChange={() => toggleListFilter("clientTypes", "externe")} />
                Client Externe
              </label>
            </div>
          </div>
        </div>
      </div>

      <div className="excel-form-section" style={{ marginTop: 16 }}>
        <h4 className="excel-section-title">🏬 Départements &amp; Salles</h4>
        <div className="excel-grid-2">
          <div className="form-group">
            <label>Départements :</label>
            <div className="excel-chk-group excel-scrollable-box">
              {departments.length === 0 ? (
                <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Aucun département configuré</span>
              ) : (
                departments.map((d: string) => (
                  <label key={d} className="excel-chk-item">
                    <input type="checkbox" checked={filters.departments.includes(d)} onChange={() => toggleListFilter("departments", d)} />
                    {d}
                  </label>
                ))
              )}
            </div>
          </div>

          <div className="form-group">
            <label>Salles utilisées :</label>
            <div className="excel-chk-group excel-scrollable-box">
              {rooms.length === 0 ? (
                <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Aucune salle configurée</span>
              ) : (
                rooms.map((r: string) => (
                  <label key={r} className="excel-chk-item">
                    <input type="checkbox" checked={filters.rooms.includes(r)} onChange={() => toggleListFilter("rooms", r)} />
                    {r}
                  </label>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="excel-form-section" style={{ marginTop: 16 }}>
        <h4 className="excel-section-title">🔎 Recherche &amp; Filtres Financiers</h4>
        <div className="excel-grid-2">
          <div className="form-group">
            <label htmlFor="excel-filter-search">Recherche par mot-clé :</label>
            <input
              type="text"
              id="excel-filter-search"
              className="form-control form-control-sm"
              placeholder="Nom, notes, N° facture..."
              value={filters.searchText || ""}
              onChange={e => patchFilters({ searchText: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label htmlFor="excel-filter-financial">Filtre financier :</label>
            <select
              id="excel-filter-financial"
              className="form-control form-control-sm"
              value={filters.financialFilter}
              onChange={e => patchFilters({ financialFilter: e.target.value as ExcelExportOptions["filters"]["financialFilter"] })}
            >
              <option value="all">Toutes les activités</option>
              <option value="with_revenue">Uniquement avec des revenus (&gt; 0 $)</option>
              <option value="zero_revenue">Uniquement sans frais (0 $)</option>
              <option value="non_taxable">Uniquement non taxables</option>
            </select>
          </div>
        </div>
      </div>
    </>
  );
}
