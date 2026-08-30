/**
 * ExcelExportModal.tsx - Configure and generate the Excel export ("Rapport Standard" or
 * "Rapport Personnalisé" with filters/columns/presets). React reimplementation of
 * services/excel-export-modal.ts's renderModalBody()/bindModalEvents(), which built the whole
 * form via insertAdjacentHTML and re-rendered it from scratch on every option change.
 *
 * Opened the same way as before — a module-level subscriber callback that
 * services/excel-export.ts's exportToExcel() (no-args form) calls through a dynamic import, same
 * pattern as TaxOverrideModal.tsx's triggerOpenTaxOverrideModal(). Preset CRUD
 * (loadPresets/savePreset/deletePreset) and default-options loading stay in
 * services/excel-export-modal.ts — plain data logic, no DOM.
 */
import React, { useEffect, useState } from "react";
import { appState } from "../../state/state.ts";
import { getActivities } from "../../state/activities-repository.ts";
import { getAccounts, getRooms, getDepartments } from "../../state/settings-repository.ts";
import { showToast } from "../../utils/utils.ts";
import { exportToExcel, getDefaultExportOptions, filterActivitiesForExport, type ExcelExportOptions } from "../../services/excel-export.ts";
import { loadPresets, savePreset, deletePreset, loadSavedOptions, type ExcelReportPreset } from "../../services/excel-export-modal.ts";

const STATE_OPTIONS = [
  { val: "brouillon", lbl: "Brouillon" },
  { val: "soumission", lbl: "Soumission" },
  { val: "confirmee", lbl: "Confirmée" },
  { val: "facturee", lbl: "Facturée" },
  { val: "completee", lbl: "Complétée" },
  { val: "annulee", lbl: "Annulée" }
];

const COLUMN_OPTIONS: { key: keyof ExcelExportOptions["columns"]; label: string }[] = [
  { key: "id", label: "N° Activité (ID)" },
  { key: "responsable", label: "Responsable facturation" },
  { key: "name", label: "Nom de l'activité" },
  { key: "date_start", label: "Date de début" },
  { key: "date_end", label: "Date de fin" },
  { key: "days_count", label: "Nombre de jours d'occupation" },
  { key: "client_type", label: "Type de client (interne/externe)" },
  { key: "category", label: "Catégorie / Type d'événement" },
  { key: "rooms", label: "Salle(s) réservée(s)" },
  { key: "remi_time", label: "Temps Rémi" },
  { key: "department", label: "Département" },
  { key: "room_sans_frais", label: "Prix salle sans frais" },
  { key: "references", label: "Numéro de facture / Réquisition" },
  { key: "state", label: "Statut de l'activité" },
  { key: "attendees_count", label: "Nombre de participants" },
  { key: "manager_name", label: "Nom du gestionnaire / contact" },
  { key: "manager_company", label: "Entreprise du client" },
  { key: "manager_contact_info", label: "Courriel & Tél. du client" },
  { key: "description", label: "Description complète" },
  { key: "notes", label: "Notes internes" }
];

let openExcelExportSubscriber: (() => void) | null = null;

export function openExcelExportModal() {
  if (openExcelExportSubscriber) openExcelExportSubscriber();
}

export const ExcelExportModal: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<ExcelExportOptions>(getDefaultExportOptions);
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [activeTab, setActiveTab] = useState<"filters" | "columns">("filters");
  const [saveBoxOpen, setSaveBoxOpen] = useState(false);
  const [presetNameInput, setPresetNameInput] = useState("");
  const [presets, setPresets] = useState<ExcelReportPreset[]>([]);

  useEffect(() => {
    openExcelExportSubscriber = () => {
      setOptions(loadSavedOptions());
      setSelectedPresetId("");
      setActiveTab("filters");
      setSaveBoxOpen(false);
      setPresets(loadPresets());
      setIsOpen(true);
    };
    return () => {
      openExcelExportSubscriber = null;
    };
  }, []);

  if (!isOpen) return null;

  const close = () => setIsOpen(false);

  const patchFilters = (patch: Partial<ExcelExportOptions["filters"]>) =>
    setOptions(prev => ({ ...prev, filters: { ...prev.filters, ...patch } }));

  const toggleListFilter = <K extends "states" | "clientTypes" | "departments" | "rooms">(key: K, value: string) => {
    setOptions(prev => {
      const list = prev.filters[key];
      const next = list.includes(value) ? list.filter(v => v !== value) : [...list, value];
      return { ...prev, filters: { ...prev.filters, [key]: next } };
    });
  };

  const toggleQuarter = (q: number) => {
    setOptions(prev => {
      const next = prev.filters.quarters.includes(q) ? prev.filters.quarters.filter(v => v !== q) : [...prev.filters.quarters, q];
      return { ...prev, filters: { ...prev.filters, quarters: next } };
    });
  };

  const setColumn = (key: keyof ExcelExportOptions["columns"], value: boolean) =>
    setOptions(prev => ({ ...prev, columns: { ...prev.columns, [key]: value } }));

  const setAllColumns = (value: boolean) =>
    setOptions(prev => ({
      ...prev,
      columns: COLUMN_OPTIONS.reduce((acc, c) => ({ ...acc, [c.key]: value }), { ...prev.columns })
    }));

  const toggleAccount = (code: string) =>
    setOptions(prev => {
      const list = prev.columns.accounts;
      const next = list.includes(code) ? list.filter(c => c !== code) : [...list, code];
      return { ...prev, columns: { ...prev.columns, accounts: next } };
    });

  const setAllAccounts = (checked: boolean) =>
    setOptions(prev => ({
      ...prev,
      columns: { ...prev.columns, accounts: checked ? (getAccounts() || []).map(a => a.code) : [] }
    }));

  const applyPreset = (presetId: string) => {
    setSelectedPresetId(presetId);
    if (!presetId) return;
    const preset = presets.find(p => p.id === presetId);
    if (!preset) return;
    setOptions(JSON.parse(JSON.stringify(preset.options)));
    showToast(`Préréglage "${preset.name}" appliqué.`, "info");
  };

  const handleDeletePreset = () => {
    if (!selectedPresetId) return;
    const preset = presets.find(p => p.id === selectedPresetId);
    if (!preset || !confirm(`Voulez-vous vraiment supprimer le préréglage "${preset.name}" ?`)) return;
    deletePreset(selectedPresetId);
    setSelectedPresetId("");
    setPresets(loadPresets());
    showToast("Préréglage supprimé.", "info");
  };

  const handleSavePreset = () => {
    const name = presetNameInput.trim();
    if (!name) {
      showToast("Veuillez saisir un nom pour votre préréglage.", "warning");
      return;
    }
    const newPreset = savePreset(name, options);
    setSelectedPresetId(newPreset.id);
    setPresets(loadPresets());
    setSaveBoxOpen(false);
    showToast(`Préréglage "${name}" sauvegardé avec succès !`, "success");
  };

  const handleReset = () => {
    setOptions(getDefaultExportOptions());
    setSelectedPresetId("");
    showToast("Paramètres d'exportation réinitialisés.", "info");
  };

  const handleSubmit = () => {
    close();
    exportToExcel(options.mode === "standard" ? getDefaultExportOptions() : options);
  };

  const allFiscalYears = Array.from(
    new Set(getActivities().filter(a => !a.deleted && a.date_start).map(a => a.date_start.substring(0, 4)))
  )
    .sort()
    .reverse();
  const depts = getDepartments() || [];
  const rooms = (getRooms() || []).map(r => r.name);
  const accounts = getAccounts() || [];

  const totalActivities = getActivities().filter(a => !a.deleted && a.name?.trim() !== "").length;
  const filteredCount = filterActivitiesForExport(getActivities(), options.filters).length;

  return (
    <>
      <div className="modal-backdrop active" onClick={close} />
      <div
        className="modal excel-export-modal active"
        role="dialog"
        aria-modal="true"
        aria-labelledby="excel-export-modal-title"
      >
        <div className="modal-header">
          <div>
            <h3 className="modal-title" id="excel-export-modal-title">Exporter les activités au format Excel</h3>
            <p className="modal-subtitle">Configurez le rapport Excel, appliquez un préréglage ou utilisez le format standard.</p>
          </div>
          <button type="button" className="btn-icon" title="Fermer (Échap)" onClick={close}>✕</button>
        </div>

        <div className="modal-content">
          {/* Mode Selection */}
          <div className="excel-export-mode-selector">
            <label className={`excel-export-mode-card ${options.mode === "standard" ? "active" : ""}`}>
              <input
                type="radio"
                name="excel_mode"
                value="standard"
                checked={options.mode === "standard"}
                onChange={() => setOptions(prev => ({ ...prev, mode: "standard" }))}
              />
              <div className="mode-card-content">
                <span className="mode-card-title">📄 Rapport Standard</span>
                <span className="mode-card-desc">Génère le rapport Excel complet avec la période active et les colonnes par défaut.</span>
              </div>
            </label>

            <label className={`excel-export-mode-card ${options.mode === "custom" ? "active" : ""}`}>
              <input
                type="radio"
                name="excel_mode"
                value="custom"
                checked={options.mode === "custom"}
                onChange={() => setOptions(prev => ({ ...prev, mode: "custom" }))}
              />
              <div className="mode-card-content">
                <span className="mode-card-title">⚙️ Rapport Personnalisé</span>
                <span className="mode-card-desc">Permet d'appliquer des filtres précis, d'utiliser des préréglages enregistrés et de choisir les colonnes.</span>
              </div>
            </label>
          </div>

          {options.mode === "custom" && (
            <div id="excel-export-custom-section" style={{ marginTop: 16 }}>
              {/* Presets Bar */}
              <div className="excel-presets-bar">
                <label htmlFor="excel-preset-select" style={{ fontWeight: 700, fontSize: "0.85rem", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                  📌 Préréglage :
                </label>
                <select
                  id="excel-preset-select"
                  className="form-control form-control-sm"
                  style={{ flex: 1, maxWidth: 260 }}
                  value={selectedPresetId}
                  onChange={e => applyPreset(e.target.value)}
                >
                  <option value="">-- Configuration actuelle --</option>
                  {presets.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-danger-outline btn-compact"
                  title="Supprimer ce préréglage"
                  disabled={!selectedPresetId}
                  style={{ padding: "4px 6px" }}
                  onClick={handleDeletePreset}
                >
                  <svg viewBox="0 0 24 24" style={{ width: 15, height: 15, fill: "currentColor", display: "block" }}>
                    <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
                  </svg>
                </button>

                <span className="excel-preset-divider" />

                <button
                  type="button"
                  className="btn btn-secondary btn-compact"
                  title="Sauvegarder la configuration actuelle comme préréglage"
                  style={{ padding: "4px 6px" }}
                  onClick={() => {
                    setPresetNameInput("");
                    setSaveBoxOpen(prev => !prev);
                  }}
                >
                  <svg viewBox="0 0 24 24" style={{ width: 15, height: 15, fill: "currentColor", display: "block" }}>
                    <path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z" />
                  </svg>
                </button>
              </div>

              {saveBoxOpen && (
                <div className="excel-sub-box" style={{ marginBottom: 12, padding: "8px 12px" }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      style={{ flex: 1 }}
                      placeholder="Nom du préréglage (ex: Rapport Mensuel Musique)"
                      value={presetNameInput}
                      onChange={e => setPresetNameInput(e.target.value)}
                      autoFocus
                    />
                    <button type="button" className="btn btn-primary btn-sm" onClick={handleSavePreset}>Enregistrer</button>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSaveBoxOpen(false)}>Annuler</button>
                  </div>
                </div>
              )}

              {/* Tabs */}
              <div className="excel-export-tabs">
                <button
                  type="button"
                  className={`excel-export-tab-btn ${activeTab === "filters" ? "active" : ""}`}
                  onClick={() => setActiveTab("filters")}
                >
                  🔍 Filtres d'activités
                </button>
                <button
                  type="button"
                  className={`excel-export-tab-btn ${activeTab === "columns" ? "active" : ""}`}
                  onClick={() => setActiveTab("columns")}
                >
                  📋 Colonnes &amp; Contenu
                </button>
              </div>

              {/* Tab 1: Filters */}
              <div className="excel-export-tab-panel active" style={{ display: activeTab === "filters" ? "block" : "none" }}>
                <div className="excel-form-section">
                  <h4 className="excel-section-title">📅 Période &amp; Dates</h4>
                  <div className="excel-grid-2">
                    <label className="form-label-radio">
                      <input
                        type="radio"
                        name="period_mode"
                        checked={options.filters.periodMode === "active"}
                        onChange={() => patchFilters({ periodMode: "active" })}
                      />
                      Période active de l'application ({appState.selected_year || "Année courante"})
                    </label>
                    <label className="form-label-radio">
                      <input
                        type="radio"
                        name="period_mode"
                        checked={options.filters.periodMode === "all"}
                        onChange={() => patchFilters({ periodMode: "all" })}
                      />
                      Toutes les périodes (aucun filtre de date)
                    </label>
                    <label className="form-label-radio">
                      <input
                        type="radio"
                        name="period_mode"
                        checked={options.filters.periodMode === "fiscal_year"}
                        onChange={() => patchFilters({ periodMode: "fiscal_year" })}
                      />
                      Année fiscale spécifique
                    </label>
                    <label className="form-label-radio">
                      <input
                        type="radio"
                        name="period_mode"
                        checked={options.filters.periodMode === "custom_dates"}
                        onChange={() => patchFilters({ periodMode: "custom_dates" })}
                      />
                      Plage de dates personnalisée
                    </label>
                  </div>

                  {options.filters.periodMode === "fiscal_year" && (
                    <div className="excel-sub-box">
                      <div className="form-group" style={{ marginBottom: 8 }}>
                        <label htmlFor="excel-filter-fy">Année fiscale :</label>
                        <select
                          id="excel-filter-fy"
                          className="form-control form-control-sm"
                          value={options.filters.fiscalYear}
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
                              <input type="checkbox" checked={options.filters.quarters.includes(q)} onChange={() => toggleQuarter(q)} />
                              T{q}
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {options.filters.periodMode === "custom_dates" && (
                    <div className="excel-sub-box" style={{ display: "flex", gap: 12 }}>
                      <div className="form-group" style={{ flex: 1 }}>
                        <label htmlFor="excel-filter-start">Du (Date début) :</label>
                        <input
                          type="date"
                          id="excel-filter-start"
                          className="form-control form-control-sm"
                          value={options.filters.startDate || ""}
                          onChange={e => patchFilters({ startDate: e.target.value })}
                        />
                      </div>
                      <div className="form-group" style={{ flex: 1 }}>
                        <label htmlFor="excel-filter-end">Au (Date fin) :</label>
                        <input
                          type="date"
                          id="excel-filter-end"
                          className="form-control form-control-sm"
                          value={options.filters.endDate || ""}
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
                            <input
                              type="checkbox"
                              checked={options.filters.states.includes(st.val)}
                              onChange={() => toggleListFilter("states", st.val)}
                            />
                            {st.lbl}
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="form-group">
                      <label>Type de client :</label>
                      <div className="excel-chk-group">
                        <label className="excel-chk-item">
                          <input
                            type="checkbox"
                            checked={options.filters.clientTypes.includes("interne")}
                            onChange={() => toggleListFilter("clientTypes", "interne")}
                          />
                          Client Interne
                        </label>
                        <label className="excel-chk-item">
                          <input
                            type="checkbox"
                            checked={options.filters.clientTypes.includes("externe")}
                            onChange={() => toggleListFilter("clientTypes", "externe")}
                          />
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
                        {depts.length === 0 ? (
                          <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Aucun département configuré</span>
                        ) : (
                          depts.map((d: string) => (
                            <label key={d} className="excel-chk-item">
                              <input
                                type="checkbox"
                                checked={options.filters.departments.includes(d)}
                                onChange={() => toggleListFilter("departments", d)}
                              />
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
                              <input
                                type="checkbox"
                                checked={options.filters.rooms.includes(r)}
                                onChange={() => toggleListFilter("rooms", r)}
                              />
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
                        value={options.filters.searchText || ""}
                        onChange={e => patchFilters({ searchText: e.target.value })}
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="excel-filter-financial">Filtre financier :</label>
                      <select
                        id="excel-filter-financial"
                        className="form-control form-control-sm"
                        value={options.filters.financialFilter}
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
              </div>

              {/* Tab 2: Columns & Content */}
              <div className="excel-export-tab-panel" style={{ display: activeTab === "columns" ? "block" : "none" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <h4 className="excel-section-title" style={{ margin: 0 }}>📊 Sélection des colonnes du tableau</h4>
                  <div>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAllColumns(true)}>Tout cocher</button>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAllColumns(false)}>Tout décocher</button>
                  </div>
                </div>

                <div className="excel-grid-3">
                  {COLUMN_OPTIONS.map(col => (
                    <label key={col.key} className="excel-chk-item">
                      <input
                        type="checkbox"
                        checked={!!options.columns[col.key]}
                        onChange={e => setColumn(col.key, e.target.checked)}
                      />
                      {col.label}
                    </label>
                  ))}
                </div>

                <div className="excel-form-section" style={{ marginTop: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <h4 className="excel-section-title" style={{ margin: 0 }}>💰 Comptes GL à inclure</h4>
                    <div>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAllAccounts(true)}>Tout cocher</button>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAllAccounts(false)}>Tout décocher</button>
                    </div>
                  </div>
                  <div className="excel-grid-2">
                    {accounts.map(acc => (
                      <label key={acc.code} className="excel-chk-item">
                        <input
                          type="checkbox"
                          checked={options.columns.accounts.includes(acc.code)}
                          onChange={() => toggleAccount(acc.code)}
                        />
                        <strong>{acc.code}</strong> - {acc.description}
                      </label>
                    ))}
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <label className="excel-chk-item">
                      <input
                        type="checkbox"
                        checked={options.columns.total_revenue}
                        onChange={e => setColumn("total_revenue", e.target.checked)}
                      />
                      <strong>REVENUS TOTAL RÉÈL</strong> (Ligne de somme totale par activité)
                    </label>
                  </div>
                </div>

                <div className="excel-form-section" style={{ marginTop: 16 }}>
                  <h4 className="excel-section-title">📁 Configuration du classeur</h4>
                  <div className="excel-grid-2">
                    <label className="excel-chk-item">
                      <input
                        type="checkbox"
                        checked={options.sheets.includeTotalRow}
                        onChange={e => setOptions(prev => ({ ...prev, sheets: { ...prev.sheets, includeTotalRow: e.target.checked } }))}
                      />
                      Ligne de totaux généraux au bas du tableau
                    </label>
                    <label className="excel-chk-item">
                      <input
                        type="checkbox"
                        checked={options.sheets.useExcelFormulas}
                        onChange={e => setOptions(prev => ({ ...prev, sheets: { ...prev.sheets, useExcelFormulas: e.target.checked } }))}
                      />
                      Utiliser des formules Excel (SUM, calcul de dates)
                    </label>
                    <label className="excel-chk-item">
                      <input
                        type="checkbox"
                        checked={options.sheets.includeRoomsSheet}
                        onChange={e => setOptions(prev => ({ ...prev, sheets: { ...prev.sheets, includeRoomsSheet: e.target.checked } }))}
                      />
                      Inclure l'onglet "SALLES &amp; TARIFS"
                    </label>
                    <label className="excel-chk-item">
                      <input
                        type="checkbox"
                        checked={options.sheets.includeSummarySheet}
                        onChange={e => setOptions(prev => ({ ...prev, sheets: { ...prev.sheets, includeSummarySheet: e.target.checked } }))}
                      />
                      Inclure l'onglet "SOMMAIRE SYNTHÉTIQUE"
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Live Counter Bar */}
          <div className="excel-live-counter">
            📊 <strong>{filteredCount}</strong> activité(s) sélectionnée(s) sur <strong>{totalActivities}</strong> au total
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" title="Réinitialiser la configuration" onClick={handleReset}>
            Réinitialiser
          </button>
          <div style={{ flex: 1 }} />
          <button type="button" className="btn btn-primary" onClick={handleSubmit}>
            Générer et télécharger (.xlsx)
          </button>
        </div>
      </div>
    </>
  );
};
