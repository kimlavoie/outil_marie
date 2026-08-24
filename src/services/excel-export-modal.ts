/**
 * excel-export-modal.ts - Preset CRUD and saved-preferences loading for the Excel export
 * configuration. The modal UI itself lives in components/modals/ExcelExportModal.tsx (React) —
 * this file stays a plain, DOM-free data module so it can be imported from a .tsx component
 * without pulling JSX into it.
 */
import { getDefaultExportOptions, type ExcelExportOptions } from "./excel-export.ts";

const PREFS_KEY = "outil_marie_excel_export_prefs";
const PRESETS_KEY = "outil_marie_excel_export_presets";

export interface ExcelReportPreset {
  id: string;
  name: string;
  options: ExcelExportOptions;
  created_at: string;
}

export function loadPresets(): ExcelReportPreset[] {
  try {
    const raw = localStorage.getItem(PRESETS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function savePresetsToStorage(presets: ExcelReportPreset[]): void {
  try {
    localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
  } catch (err) {
    console.error("Error saving presets:", err);
  }
}

export function savePreset(name: string, options: ExcelExportOptions): ExcelReportPreset {
  const presets = loadPresets();
  const id = "preset_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);
  const newPreset: ExcelReportPreset = {
    id,
    name: name.trim(),
    options: JSON.parse(JSON.stringify(options)),
    created_at: new Date().toISOString()
  };
  presets.push(newPreset);
  savePresetsToStorage(presets);
  return newPreset;
}

export function deletePreset(id: string): void {
  const presets = loadPresets().filter(p => p.id !== id);
  savePresetsToStorage(presets);
}

export function loadSavedOptions(): ExcelExportOptions {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    const defaults = getDefaultExportOptions();
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    return {
      ...defaults,
      ...parsed,
      mode: "standard",
      filters: { ...defaults.filters, ...(parsed.filters || {}) },
      columns: { ...defaults.columns, ...(parsed.columns || {}) },
      sheets: { ...defaults.sheets, ...(parsed.sheets || {}) }
    };
  } catch {
    return getDefaultExportOptions();
  }
}
