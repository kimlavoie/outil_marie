import type { ExcelExportOptions } from "../../../services/excel-export.ts";

/**
 * ExcelExportModeSelector.tsx - The 3 report-mode radio cards at the top of ExcelExportModal.tsx
 * (Standard / Fin de trimestre / Personnalisé).
 */
export function ExcelExportModeSelector({
  mode,
  onModeChange
}: {
  mode: ExcelExportOptions["mode"];
  onModeChange: (mode: ExcelExportOptions["mode"]) => void;
}) {
  return (
    <div className="excel-export-mode-selector">
      <label className={`excel-export-mode-card ${mode === "standard" ? "active" : ""}`}>
        <input type="radio" name="excel_mode" value="standard" checked={mode === "standard"} onChange={() => onModeChange("standard")} />
        <div className="mode-card-content">
          <span className="mode-card-title">📄 Rapport Standard</span>
          <span className="mode-card-desc">Génère le rapport Excel complet avec la période active et les colonnes par défaut.</span>
        </div>
      </label>

      <label className={`excel-export-mode-card ${mode === "quarter_end" ? "active" : ""}`}>
        <input
          type="radio"
          name="excel_mode"
          value="quarter_end"
          checked={mode === "quarter_end"}
          onChange={() => onModeChange("quarter_end")}
        />
        <div className="mode-card-content">
          <span className="mode-card-title">📅 Rapport de fin de trimestre</span>
          <span className="mode-card-desc">Rapport simplifié (activité, date, référence, comptes 892 utilisés et revenus totaux) pour la fin de trimestre.</span>
        </div>
      </label>

      <label className={`excel-export-mode-card ${mode === "custom" ? "active" : ""}`}>
        <input type="radio" name="excel_mode" value="custom" checked={mode === "custom"} onChange={() => onModeChange("custom")} />
        <div className="mode-card-content">
          <span className="mode-card-title">⚙️ Rapport Personnalisé</span>
          <span className="mode-card-desc">Permet d'appliquer des filtres précis, d'utiliser des préréglages enregistrés et de choisir les colonnes.</span>
        </div>
      </label>
    </div>
  );
}
