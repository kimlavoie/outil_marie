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
import { getActivities } from "../../state/activities-repository.ts";
import { getAccounts, getRooms, getDepartments } from "../../state/settings-repository.ts";
import { showToast } from "../../utils/utils.ts";
import {
  exportToExcel,
  getDefaultExportOptions,
  getQuarterEndExportOptions,
  filterActivitiesForExport,
  type ExcelExportOptions
} from "../../services/excel-export.ts";
import { loadPresets, savePreset, deletePreset, loadSavedOptions, type ExcelReportPreset } from "../../services/excel-export-modal.ts";
import { ExcelExportModeSelector } from "./excel-export/ExcelExportModeSelector.tsx";
import { ExcelExportPresetsBar } from "./excel-export/ExcelExportPresetsBar.tsx";
import { ExcelExportFiltersTab } from "./excel-export/ExcelExportFiltersTab.tsx";
import { ExcelExportColumnsTab, COLUMN_OPTIONS } from "./excel-export/ExcelExportColumnsTab.tsx";

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

  const patchSheets = (patch: Partial<ExcelExportOptions["sheets"]>) =>
    setOptions(prev => ({ ...prev, sheets: { ...prev.sheets, ...patch } }));

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
    if (options.mode === "standard") exportToExcel(getDefaultExportOptions());
    else if (options.mode === "quarter_end") exportToExcel(getQuarterEndExportOptions());
    else exportToExcel(options);
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
          <ExcelExportModeSelector mode={options.mode} onModeChange={mode => setOptions(prev => ({ ...prev, mode }))} />

          {options.mode === "custom" && (
            <div id="excel-export-custom-section" style={{ marginTop: 16 }}>
              <ExcelExportPresetsBar
                presets={presets}
                selectedPresetId={selectedPresetId}
                onApplyPreset={applyPreset}
                onDeletePreset={handleDeletePreset}
                saveBoxOpen={saveBoxOpen}
                onToggleSaveBox={() => {
                  setPresetNameInput("");
                  setSaveBoxOpen(prev => !prev);
                }}
                presetNameInput={presetNameInput}
                onPresetNameInputChange={setPresetNameInput}
                onSavePreset={handleSavePreset}
                onCancelSaveBox={() => setSaveBoxOpen(false)}
              />

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
                <ExcelExportFiltersTab
                  filters={options.filters}
                  patchFilters={patchFilters}
                  toggleListFilter={toggleListFilter}
                  toggleQuarter={toggleQuarter}
                  allFiscalYears={allFiscalYears}
                  departments={depts}
                  rooms={rooms}
                />
              </div>

              {/* Tab 2: Columns & Content */}
              <div className="excel-export-tab-panel" style={{ display: activeTab === "columns" ? "block" : "none" }}>
                <ExcelExportColumnsTab
                  columns={options.columns}
                  sheets={options.sheets}
                  accounts={accounts}
                  onSetColumn={setColumn}
                  onSetAllColumns={setAllColumns}
                  onToggleAccount={toggleAccount}
                  onSetAllAccounts={setAllAccounts}
                  onPatchSheets={patchSheets}
                />
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
