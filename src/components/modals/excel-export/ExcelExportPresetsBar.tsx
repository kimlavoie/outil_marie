import type { ExcelReportPreset } from "../../../services/excel-export-modal.ts";

/**
 * ExcelExportPresetsBar.tsx - The "Personnalisé" mode's preset select/delete/save row, plus the
 * save-as-new-preset input box it reveals. Fully controlled by ExcelExportModal.tsx, which owns
 * the preset list and the current options being named/saved.
 */
export function ExcelExportPresetsBar({
  presets,
  selectedPresetId,
  onApplyPreset,
  onDeletePreset,
  saveBoxOpen,
  onToggleSaveBox,
  presetNameInput,
  onPresetNameInputChange,
  onSavePreset,
  onCancelSaveBox
}: {
  presets: ExcelReportPreset[];
  selectedPresetId: string;
  onApplyPreset: (id: string) => void;
  onDeletePreset: () => void;
  saveBoxOpen: boolean;
  onToggleSaveBox: () => void;
  presetNameInput: string;
  onPresetNameInputChange: (v: string) => void;
  onSavePreset: () => void;
  onCancelSaveBox: () => void;
}) {
  return (
    <>
      <div className="excel-presets-bar">
        <label htmlFor="excel-preset-select" style={{ fontWeight: 700, fontSize: "0.85rem", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
          📌 Préréglage :
        </label>
        <select
          id="excel-preset-select"
          className="form-control form-control-sm"
          style={{ flex: 1, maxWidth: 260 }}
          value={selectedPresetId}
          onChange={e => onApplyPreset(e.target.value)}
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
          onClick={onDeletePreset}
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
          onClick={onToggleSaveBox}
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
              onChange={e => onPresetNameInputChange(e.target.value)}
              autoFocus
            />
            <button type="button" className="btn btn-primary btn-sm" onClick={onSavePreset}>Enregistrer</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={onCancelSaveBox}>Annuler</button>
          </div>
        </div>
      )}
    </>
  );
}
