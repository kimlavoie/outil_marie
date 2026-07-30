/**
 * excel-export-modal.ts - UI controller for configuring and generating Excel reports.
 */
import { appState } from "../state/state.ts";
import { showToast } from "../utils/utils.ts";
import {
  exportToExcel,
  getDefaultExportOptions,
  filterActivitiesForExport,
  type ExcelExportOptions
} from "./excel-export.ts";

const PREFS_KEY = "outil_marie_excel_export_prefs";
const PRESETS_KEY = "outil_marie_excel_export_presets";

export interface ExcelReportPreset {
  id: string;
  name: string;
  options: ExcelExportOptions;
  created_at: string;
}

let currentOptions: ExcelExportOptions = getDefaultExportOptions();
let selectedPresetId: string = "";

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


function loadSavedOptions(): ExcelExportOptions {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return getDefaultExportOptions();
    const parsed = JSON.parse(raw);
    const defaults = getDefaultExportOptions();
    return {
      ...defaults,
      ...parsed,
      filters: { ...defaults.filters, ...(parsed.filters || {}) },
      columns: { ...defaults.columns, ...(parsed.columns || {}) },
      sheets: { ...defaults.sheets, ...(parsed.sheets || {}) }
    };
  } catch {
    return getDefaultExportOptions();
  }
}

function saveOptionsToStorage(options: ExcelExportOptions): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(options));
    showToast("Préférences d'exportation Excel sauvegardées.", "success");
  } catch {
    showToast("Impossible d'enregistrer les préférences.", "error");
  }
}

export function openExcelExportModal(): void {
  let modalEl = document.getElementById("excel-export-modal");
  if (!modalEl) {
    createExportModalContainer();
    modalEl = document.getElementById("excel-export-modal");
  }

  currentOptions = loadSavedOptions();
  selectedPresetId = "";
  renderModalBody();

  const backdrop = document.getElementById("modal-backdrop");
  if (backdrop) backdrop.classList.add("active");
  if (modalEl) modalEl.classList.add("active");

  updateLiveCounter();
}

export function closeExcelExportModal(): void {
  const modalEl = document.getElementById("excel-export-modal");
  const backdrop = document.getElementById("modal-backdrop");

  if (modalEl) modalEl.classList.remove("active");
  if (backdrop) backdrop.classList.remove("active");
}

function updateLiveCounter(): void {
  const countEl = document.getElementById("excel-export-live-count");
  if (!countEl) return;

  const totalActivities = appState.activities.filter(a => !a.deleted && a.name?.trim() !== "").length;
  const filteredActivities = filterActivitiesForExport(appState.activities, currentOptions.filters);

  countEl.innerHTML = `📊 <strong>${filteredActivities.length}</strong> activité(s) sélectionnée(s) sur <strong>${totalActivities}</strong> au total`;
}

function createExportModalContainer(): void {
  const container = document.createElement("div");
  container.id = "excel-export-modal";
  container.className = "modal excel-export-modal";
  container.setAttribute("role", "dialog");
  container.setAttribute("aria-modal", "true");
  container.setAttribute("aria-labelledby", "excel-export-modal-title");

  document.body.appendChild(container);
}

function renderModalBody(): void {
  const container = document.getElementById("excel-export-modal");
  if (!container) return;

  const allFiscalYears = Array.from(
    new Set(
      appState.activities
        .filter(a => !a.deleted && a.date_start)
        .map(a => a.date_start.substring(0, 4))
    )
  ).sort().reverse();

  const depts = appState.settings.departments || [];
  const rooms = (appState.settings.rooms || []).map(r => r.name);
  const accounts = appState.settings.accounts || [];
  const presets = loadPresets();

  container.innerHTML = `
    <div class="modal-header">
      <div>
        <h3 class="modal-title" id="excel-export-modal-title">Exporter les activités au format Excel</h3>
        <p class="modal-subtitle">Configurez le rapport Excel, appliquez un préréglage ou utilisez le format standard.</p>
      </div>
      <button type="button" class="btn-icon" id="excel-export-close" title="Fermer (Échap)">✕</button>
    </div>

    <div class="modal-content">
      <!-- Mode Selection -->
      <div class="excel-export-mode-selector">
        <label class="excel-export-mode-card ${currentOptions.mode === "standard" ? "active" : ""}">
          <input type="radio" name="excel_mode" value="standard" ${currentOptions.mode === "standard" ? "checked" : ""} />
          <div class="mode-card-content">
            <span class="mode-card-title">📄 Rapport Standard</span>
            <span class="mode-card-desc">Génère le rapport Excel complet avec la période active et les colonnes par défaut.</span>
          </div>
        </label>

        <label class="excel-export-mode-card ${currentOptions.mode === "custom" ? "active" : ""}">
          <input type="radio" name="excel_mode" value="custom" ${currentOptions.mode === "custom" ? "checked" : ""} />
          <div class="mode-card-content">
            <span class="mode-card-title">⚙️ Rapport Personnalisé</span>
            <span class="mode-card-desc">Permet d'appliquer des filtres précis, d'utiliser des préréglages enregistrés et de choisir les colonnes.</span>
          </div>
        </label>
      </div>

      <!-- Custom Settings Container -->
      <div id="excel-export-custom-section" style="display: ${currentOptions.mode === "custom" ? "block" : "none"}; margin-top: 16px;">
        <!-- Presets Bar (Single line condensed with icon buttons and auto-load on selection) -->
        <div class="excel-presets-bar">
          <label for="excel-preset-select" style="font-weight: 700; font-size: 0.85rem; color: var(--text-secondary); white-space: nowrap;">📌 Préréglage :</label>
          <select id="excel-preset-select" class="form-control form-control-sm" style="flex: 1; max-width: 260px;">
            <option value="">-- Configuration actuelle --</option>
            ${presets.map(p => `<option value="${p.id}" ${selectedPresetId === p.id ? "selected" : ""}>${p.name}</option>`).join("")}
          </select>
          <button type="button" class="btn btn-danger-outline btn-compact" id="excel-preset-delete" title="Supprimer ce préréglage" ${!selectedPresetId ? "disabled" : ""} style="padding: 4px 6px;">
            <svg viewBox="0 0 24 24" style="width: 15px; height: 15px; fill: currentColor; display: block;"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
          </button>

          <span class="excel-preset-divider"></span>

          <button type="button" class="btn btn-secondary btn-compact" id="excel-preset-save-toggle" title="Sauvegarder la configuration actuelle comme préréglage" style="padding: 4px 6px;">
            <svg viewBox="0 0 24 24" style="width: 15px; height: 15px; fill: currentColor; display: block;"><path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/></svg>
          </button>
        </div>

        <!-- Inline Save Preset Form -->
        <div id="excel-preset-save-box" class="excel-sub-box" style="display: none; margin-bottom: 12px; padding: 8px 12px;">
          <div style="display: flex; gap: 8px; align-items: center;">
            <input type="text" id="excel-preset-name-input" class="form-control form-control-sm" style="flex: 1;" placeholder="Nom du préréglage (ex: Rapport Mensuel Musique)" />
            <button type="button" class="btn btn-primary btn-sm" id="excel-preset-save-confirm">Enregistrer</button>
            <button type="button" class="btn btn-secondary btn-sm" id="excel-preset-save-cancel">Annuler</button>
          </div>
        </div>



        <!-- Tabs -->
        <div class="excel-export-tabs">
          <button type="button" class="excel-export-tab-btn active" data-tab="filters">🔍 Filtres d'activités</button>
          <button type="button" class="excel-export-tab-btn" data-tab="columns">📋 Colonnes & Contenu</button>
        </div>


        <!-- Tab 1: Filters -->
        <div class="excel-export-tab-panel active" id="excel-tab-filters">
          <div class="excel-form-section">
            <h4 class="excel-section-title">📅 Période & Dates</h4>
            <div class="excel-grid-2">
              <label class="form-label-radio">
                <input type="radio" name="period_mode" value="active" ${currentOptions.filters.periodMode === "active" ? "checked" : ""} />
                Période active de l'application (${appState.selected_year || "Année courante"})
              </label>
              <label class="form-label-radio">
                <input type="radio" name="period_mode" value="all" ${currentOptions.filters.periodMode === "all" ? "checked" : ""} />
                Toutes les périodes (aucun filtre de date)
              </label>
              <label class="form-label-radio">
                <input type="radio" name="period_mode" value="fiscal_year" ${currentOptions.filters.periodMode === "fiscal_year" ? "checked" : ""} />
                Année fiscale spécifique
              </label>
              <label class="form-label-radio">
                <input type="radio" name="period_mode" value="custom_dates" ${currentOptions.filters.periodMode === "custom_dates" ? "checked" : ""} />
                Plage de dates personnalisée
              </label>
            </div>

            <!-- Sub-options for Fiscal Year -->
            <div id="period-fy-options" class="excel-sub-box" style="display: ${currentOptions.filters.periodMode === "fiscal_year" ? "block" : "none"};">
              <div class="form-group" style="margin-bottom: 8px;">
                <label for="excel-filter-fy">Année fiscale :</label>
                <select id="excel-filter-fy" class="form-control form-control-sm">
                  <option value="">-- Toutes les années --</option>
                  ${allFiscalYears.map(y => `<option value="${y}" ${currentOptions.filters.fiscalYear === y ? "selected" : ""}>${y}</option>`).join("")}
                </select>
              </div>
              <div>
                <span style="font-size: 0.85rem; font-weight: 600; color: var(--text-secondary);">Trimestres :</span>
                <div style="display: flex; gap: 12px; margin-top: 4px;">
                  ${[1, 2, 3, 4].map(q => `
                    <label style="font-size: 0.85rem; cursor: pointer;">
                      <input type="checkbox" class="excel-q-chk" value="${q}" ${currentOptions.filters.quarters.includes(q) ? "checked" : ""} />
                      T${q}
                    </label>
                  `).join("")}
                </div>
              </div>
            </div>

            <!-- Sub-options for Custom Dates -->
            <div id="period-dates-options" class="excel-sub-box" style="display: ${currentOptions.filters.periodMode === "custom_dates" ? "flex" : "none"}; gap: 12px;">
              <div class="form-group" style="flex: 1;">
                <label for="excel-filter-start">Du (Date début) :</label>
                <input type="date" id="excel-filter-start" class="form-control form-control-sm" value="${currentOptions.filters.startDate || ""}" />
              </div>
              <div class="form-group" style="flex: 1;">
                <label for="excel-filter-end">Au (Date fin) :</label>
                <input type="date" id="excel-filter-end" class="form-control form-control-sm" value="${currentOptions.filters.endDate || ""}" />
              </div>
            </div>
          </div>

          <div class="excel-form-section" style="margin-top: 16px;">
            <h4 class="excel-section-title">📌 Statuts & Caractéristiques</h4>
            <div class="excel-grid-2">
              <div class="form-group">
                <label>Statuts de l'activité :</label>
                <div class="excel-chk-group">
                  ${[
                    { val: "brouillon", lbl: "Brouillon" },
                    { val: "soumission", lbl: "Soumission" },
                    { val: "confirmee", lbl: "Confirmée" },
                    { val: "facturee", lbl: "Facturée" },
                    { val: "completee", lbl: "Complétée" },
                    { val: "annulee", lbl: "Annulée" }
                  ].map(st => `
                    <label class="excel-chk-item">
                      <input type="checkbox" class="excel-state-chk" value="${st.val}" ${currentOptions.filters.states.includes(st.val) ? "checked" : ""} />
                      ${st.lbl}
                    </label>
                  `).join("")}
                </div>
              </div>

              <div class="form-group">
                <label>Type de client :</label>
                <div class="excel-chk-group">
                  <label class="excel-chk-item">
                    <input type="checkbox" class="excel-clienttype-chk" value="interne" ${currentOptions.filters.clientTypes.includes("interne") ? "checked" : ""} />
                    Client Interne
                  </label>
                  <label class="excel-chk-item">
                    <input type="checkbox" class="excel-clienttype-chk" value="externe" ${currentOptions.filters.clientTypes.includes("externe") ? "checked" : ""} />
                    Client Externe
                  </label>
                </div>
              </div>
            </div>
          </div>

          <div class="excel-form-section" style="margin-top: 16px;">
            <h4 class="excel-section-title">🏬 Départements & Salles</h4>
            <div class="excel-grid-2">
              <div class="form-group">
                <label>Départements :</label>
                <div class="excel-chk-group excel-scrollable-box">
                  ${depts.length === 0 ? `<span style="font-size: 0.8rem; color: var(--text-muted)">Aucun département configuré</span>` : depts.map(d => `
                    <label class="excel-chk-item">
                      <input type="checkbox" class="excel-dept-chk" value="${d}" ${currentOptions.filters.departments.includes(d) ? "checked" : ""} />
                      ${d}
                    </label>
                  `).join("")}
                </div>
              </div>

              <div class="form-group">
                <label>Salles utilisées :</label>
                <div class="excel-chk-group excel-scrollable-box">
                  ${rooms.length === 0 ? `<span style="font-size: 0.8rem; color: var(--text-muted)">Aucune salle configurée</span>` : rooms.map(r => `
                    <label class="excel-chk-item">
                      <input type="checkbox" class="excel-room-chk" value="${r}" ${currentOptions.filters.rooms.includes(r) ? "checked" : ""} />
                      ${r}
                    </label>
                  `).join("")}
                </div>
              </div>
            </div>
          </div>

          <div class="excel-form-section" style="margin-top: 16px;">
            <h4 class="excel-section-title">🔎 Recherche & Filtres Financiers</h4>
            <div class="excel-grid-2">
              <div class="form-group">
                <label for="excel-filter-search">Recherche par mot-clé :</label>
                <input type="text" id="excel-filter-search" class="form-control form-control-sm" placeholder="Nom, notes, N° facture..." value="${currentOptions.filters.searchText || ""}" />
              </div>

              <div class="form-group">
                <label for="excel-filter-financial">Filtre financier :</label>
                <select id="excel-filter-financial" class="form-control form-control-sm">
                  <option value="all" ${currentOptions.filters.financialFilter === "all" ? "selected" : ""}>Toutes les activités</option>
                  <option value="with_revenue" ${currentOptions.filters.financialFilter === "with_revenue" ? "selected" : ""}>Uniquement avec des revenus (> 0 $)</option>
                  <option value="zero_revenue" ${currentOptions.filters.financialFilter === "zero_revenue" ? "selected" : ""}>Uniquement sans frais (0 $)</option>
                  <option value="non_taxable" ${currentOptions.filters.financialFilter === "non_taxable" ? "selected" : ""}>Uniquement non taxables</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <!-- Tab 2: Columns & Content -->
        <div class="excel-export-tab-panel" id="excel-tab-columns" style="display: none;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <h4 class="excel-section-title" style="margin: 0;">📊 Sélection des colonnes du tableau</h4>
            <div>
              <button type="button" class="btn btn-secondary btn-sm" id="excel-cols-select-all">Tout cocher</button>
              <button type="button" class="btn btn-secondary btn-sm" id="excel-cols-deselect-all">Tout décocher</button>
            </div>
          </div>

          <div class="excel-grid-3">
            ${[
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
            ].map(col => `
              <label class="excel-chk-item">
                <input type="checkbox" class="excel-col-toggle" data-col="${col.key}" ${(currentOptions.columns as any)[col.key] ? "checked" : ""} />
                ${col.label}
              </label>
            `).join("")}
          </div>

          <div class="excel-form-section" style="margin-top: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
              <h4 class="excel-section-title" style="margin: 0;">💰 Comptes GL à inclure</h4>
              <div>
                <button type="button" class="btn btn-secondary btn-sm" id="excel-accs-select-all">Tout cocher</button>
                <button type="button" class="btn btn-secondary btn-sm" id="excel-accs-deselect-all">Tout décocher</button>
              </div>
            </div>
            <div class="excel-grid-2">
              ${accounts.map(acc => `
                <label class="excel-chk-item">
                  <input type="checkbox" class="excel-acc-chk" value="${acc.code}" ${currentOptions.columns.accounts.includes(acc.code) ? "checked" : ""} />
                  <strong>${acc.code}</strong> - ${acc.description}
                </label>
              `).join("")}
            </div>
            <div style="margin-top: 8px;">
              <label class="excel-chk-item">
                <input type="checkbox" id="excel-col-total-revenue" ${currentOptions.columns.total_revenue ? "checked" : ""} />
                <strong>REVENUS TOTAL RÉÈL</strong> (Ligne de somme totale par activité)
              </label>
            </div>
          </div>


          <div class="excel-form-section" style="margin-top: 16px;">
            <h4 class="excel-section-title">📁 Configuration du classeur</h4>
            <div class="excel-grid-2">
              <label class="excel-chk-item">
                <input type="checkbox" id="excel-sheet-totalrow" ${currentOptions.sheets.includeTotalRow ? "checked" : ""} />
                Ligne de totaux généraux au bas du tableau
              </label>
              <label class="excel-chk-item">
                <input type="checkbox" id="excel-sheet-formulas" ${currentOptions.sheets.useExcelFormulas ? "checked" : ""} />
                Utiliser des formules Excel (SUM, calcul de dates)
              </label>
              <label class="excel-chk-item">
                <input type="checkbox" id="excel-sheet-rooms" ${currentOptions.sheets.includeRoomsSheet ? "checked" : ""} />
                Inclure l'onglet "SALLES & TARIFS"
              </label>
              <label class="excel-chk-item">
                <input type="checkbox" id="excel-sheet-summary" ${currentOptions.sheets.includeSummarySheet ? "checked" : ""} />
                Inclure l'onglet "SOMMAIRE SYNTHÉTIQUE"
              </label>
            </div>
          </div>
        </div>
      </div>

      <!-- Live Counter Bar -->
      <div id="excel-export-live-count" class="excel-live-counter">
        <!-- Computed via updateLiveCounter() -->
      </div>
    </div>

    <div class="modal-footer">
      <button type="button" class="btn btn-secondary" id="excel-export-reset" title="Réinitialiser la configuration">Réinitialiser</button>
      <div style="flex: 1;"></div>
      <button type="button" class="btn btn-primary" id="excel-export-submit">Générer et télécharger (.xlsx)</button>
    </div>
  `;

  bindModalEvents();
}

function bindModalEvents(): void {
  const container = document.getElementById("excel-export-modal");
  if (!container) return;

  // Close handler
  document.getElementById("excel-export-close")?.addEventListener("click", closeExcelExportModal);


  // Presets Handlers
  const presetSelect = document.getElementById("excel-preset-select") as HTMLSelectElement | null;
  const presetDeleteBtn = document.getElementById("excel-preset-delete") as HTMLButtonElement | null;

  if (presetSelect) {
    presetSelect.addEventListener("change", () => {
      selectedPresetId = presetSelect.value;
      if (presetDeleteBtn) presetDeleteBtn.disabled = !selectedPresetId;

      if (selectedPresetId) {
        const presets = loadPresets();
        const preset = presets.find(p => p.id === selectedPresetId);
        if (preset) {
          currentOptions = JSON.parse(JSON.stringify(preset.options));
          renderModalBody();
          showToast(`Préréglage "${preset.name}" appliqué.`, "info");
        }
      }
    });
  }


  presetDeleteBtn?.addEventListener("click", () => {
    if (!selectedPresetId) return;
    const presets = loadPresets();
    const preset = presets.find(p => p.id === selectedPresetId);
    if (preset && confirm(`Voulez-vous vraiment supprimer le préréglage "${preset.name}" ?`)) {
      deletePreset(selectedPresetId);
      selectedPresetId = "";
      renderModalBody();
      showToast("Préréglage supprimé.", "info");
    }
  });

  // Save preset toggle & confirm
  const saveBox = document.getElementById("excel-preset-save-box");
  const saveToggleBtn = document.getElementById("excel-preset-save-toggle");
  const saveCancelBtn = document.getElementById("excel-preset-save-cancel");
  const saveConfirmBtn = document.getElementById("excel-preset-save-confirm");
  const nameInput = document.getElementById("excel-preset-name-input") as HTMLInputElement | null;

  saveToggleBtn?.addEventListener("click", () => {
    if (saveBox) {
      const isHidden = saveBox.style.display === "none";
      saveBox.style.display = isHidden ? "block" : "none";
      if (isHidden && nameInput) {
        nameInput.value = "";
        nameInput.focus();
      }
    }
  });

  saveCancelBtn?.addEventListener("click", () => {
    if (saveBox) saveBox.style.display = "none";
  });

  saveConfirmBtn?.addEventListener("click", () => {
    if (!nameInput || !nameInput.value.trim()) {
      showToast("Veuillez saisir un nom pour votre préréglage.", "warning");
      return;
    }
    const name = nameInput.value.trim();
    const newPreset = savePreset(name, currentOptions);
    selectedPresetId = newPreset.id;
    renderModalBody();
    showToast(`Préréglage "${name}" sauvegardé avec succès !`, "success");
  });


  // Mode cards toggle
  container.querySelectorAll<HTMLInputElement>("input[name='excel_mode']").forEach(radio => {
    radio.addEventListener("change", e => {
      const mode = (e.target as HTMLInputElement).value as "standard" | "custom";
      currentOptions.mode = mode;

      container.querySelectorAll(".excel-export-mode-card").forEach(card => {
        card.classList.toggle("active", (card.querySelector("input") as HTMLInputElement).value === mode);
      });

      const customSec = document.getElementById("excel-export-custom-section");
      if (customSec) customSec.style.display = mode === "custom" ? "block" : "none";

      updateLiveCounter();
    });
  });


  // Tab switching
  container.querySelectorAll<HTMLButtonElement>(".excel-export-tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const tabName = btn.dataset.tab;
      container.querySelectorAll(".excel-export-tab-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      document.getElementById("excel-tab-filters")!.style.display = tabName === "filters" ? "block" : "none";
      document.getElementById("excel-tab-columns")!.style.display = tabName === "columns" ? "block" : "none";
    });
  });

  // Period mode change
  container.querySelectorAll<HTMLInputElement>("input[name='period_mode']").forEach(radio => {
    radio.addEventListener("change", e => {
      const pMode = (e.target as HTMLInputElement).value as any;
      currentOptions.filters.periodMode = pMode;

      const fyBox = document.getElementById("period-fy-options");
      const datesBox = document.getElementById("period-dates-options");
      if (fyBox) fyBox.style.display = pMode === "fiscal_year" ? "block" : "none";
      if (datesBox) datesBox.style.display = pMode === "custom_dates" ? "flex" : "none";

      updateLiveCounter();
    });
  });

  // Fiscal Year & Quarters
  document.getElementById("excel-filter-fy")?.addEventListener("change", e => {
    currentOptions.filters.fiscalYear = (e.target as HTMLSelectElement).value;
    updateLiveCounter();
  });

  container.querySelectorAll<HTMLInputElement>(".excel-q-chk").forEach(chk => {
    chk.addEventListener("change", () => {
      currentOptions.filters.quarters = Array.from(container.querySelectorAll<HTMLInputElement>(".excel-q-chk:checked")).map(c => Number(c.value));
      updateLiveCounter();
    });
  });

  // Custom Dates
  document.getElementById("excel-filter-start")?.addEventListener("change", e => {
    currentOptions.filters.startDate = (e.target as HTMLInputElement).value;
    updateLiveCounter();
  });
  document.getElementById("excel-filter-end")?.addEventListener("change", e => {
    currentOptions.filters.endDate = (e.target as HTMLInputElement).value;
    updateLiveCounter();
  });

  // Checkboxes (States, ClientTypes, Depts, Rooms)
  container.querySelectorAll<HTMLInputElement>(".excel-state-chk").forEach(chk => {
    chk.addEventListener("change", () => {
      currentOptions.filters.states = Array.from(container.querySelectorAll<HTMLInputElement>(".excel-state-chk:checked")).map(c => c.value);
      updateLiveCounter();
    });
  });

  container.querySelectorAll<HTMLInputElement>(".excel-clienttype-chk").forEach(chk => {
    chk.addEventListener("change", () => {
      currentOptions.filters.clientTypes = Array.from(container.querySelectorAll<HTMLInputElement>(".excel-clienttype-chk:checked")).map(c => c.value);
      updateLiveCounter();
    });
  });

  container.querySelectorAll<HTMLInputElement>(".excel-dept-chk").forEach(chk => {
    chk.addEventListener("change", () => {
      currentOptions.filters.departments = Array.from(container.querySelectorAll<HTMLInputElement>(".excel-dept-chk:checked")).map(c => c.value);
      updateLiveCounter();
    });
  });

  container.querySelectorAll<HTMLInputElement>(".excel-room-chk").forEach(chk => {
    chk.addEventListener("change", () => {
      currentOptions.filters.rooms = Array.from(container.querySelectorAll<HTMLInputElement>(".excel-room-chk:checked")).map(c => c.value);
      updateLiveCounter();
    });
  });

  // Search & Financial Filter
  document.getElementById("excel-filter-search")?.addEventListener("input", e => {
    currentOptions.filters.searchText = (e.target as HTMLInputElement).value;
    updateLiveCounter();
  });

  document.getElementById("excel-filter-financial")?.addEventListener("change", e => {
    currentOptions.filters.financialFilter = (e.target as HTMLSelectElement).value as any;
    updateLiveCounter();
  });

  // Column Select All / Deselect All
  document.getElementById("excel-cols-select-all")?.addEventListener("click", () => {
    container.querySelectorAll<HTMLInputElement>(".excel-col-toggle").forEach(chk => {
      chk.checked = true;
      const colKey = chk.dataset.col;
      if (colKey) (currentOptions.columns as any)[colKey] = true;
    });
  });

  document.getElementById("excel-cols-deselect-all")?.addEventListener("click", () => {
    container.querySelectorAll<HTMLInputElement>(".excel-col-toggle").forEach(chk => {
      chk.checked = false;
      const colKey = chk.dataset.col;
      if (colKey) (currentOptions.columns as any)[colKey] = false;
    });
  });

  container.querySelectorAll<HTMLInputElement>(".excel-col-toggle").forEach(chk => {
    chk.addEventListener("change", () => {
      const colKey = chk.dataset.col;
      if (colKey) (currentOptions.columns as any)[colKey] = chk.checked;
    });
  });

  // Accounts Select All / Deselect All
  document.getElementById("excel-accs-select-all")?.addEventListener("click", () => {
    container.querySelectorAll<HTMLInputElement>(".excel-acc-chk").forEach(chk => {
      chk.checked = true;
    });
    currentOptions.columns.accounts = (appState.settings.accounts || []).map(a => a.code);
  });

  document.getElementById("excel-accs-deselect-all")?.addEventListener("click", () => {
    container.querySelectorAll<HTMLInputElement>(".excel-acc-chk").forEach(chk => {
      chk.checked = false;
    });
    currentOptions.columns.accounts = [];
  });

  // Accounts checkboxes
  container.querySelectorAll<HTMLInputElement>(".excel-acc-chk").forEach(chk => {
    chk.addEventListener("change", () => {
      currentOptions.columns.accounts = Array.from(container.querySelectorAll<HTMLInputElement>(".excel-acc-chk:checked")).map(c => c.value);
    });
  });


  document.getElementById("excel-col-total-revenue")?.addEventListener("change", e => {
    currentOptions.columns.total_revenue = (e.target as HTMLInputElement).checked;
  });

  // Sheets options
  document.getElementById("excel-sheet-totalrow")?.addEventListener("change", e => {
    currentOptions.sheets.includeTotalRow = (e.target as HTMLInputElement).checked;
  });
  document.getElementById("excel-sheet-formulas")?.addEventListener("change", e => {
    currentOptions.sheets.useExcelFormulas = (e.target as HTMLInputElement).checked;
  });
  document.getElementById("excel-sheet-rooms")?.addEventListener("change", e => {
    currentOptions.sheets.includeRoomsSheet = (e.target as HTMLInputElement).checked;
  });
  document.getElementById("excel-sheet-summary")?.addEventListener("change", e => {
    currentOptions.sheets.includeSummarySheet = (e.target as HTMLInputElement).checked;
  });

  // Footer Buttons
  document.getElementById("excel-export-reset")?.addEventListener("click", () => {
    currentOptions = getDefaultExportOptions();
    renderModalBody();
    showToast("Paramètres d'exportation réinitialisés.", "info");
  });

  document.getElementById("excel-export-submit")?.addEventListener("click", () => {
    closeExcelExportModal();
    if (currentOptions.mode === "standard") {
      exportToExcel(getDefaultExportOptions());
    } else {
      exportToExcel(currentOptions);
    }
  });

}

export function initExcelExportModal(): void {
  // Global backdrop listener to close modal on backdrop click
  document.getElementById("modal-backdrop")?.addEventListener("click", () => {
    const modalEl = document.getElementById("excel-export-modal");
    if (modalEl?.classList.contains("active")) {
      closeExcelExportModal();
    }
  });
}
