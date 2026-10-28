/**
 * backup/restore-modal-html.ts - Builds the "Options de restauration et aperçu" modal's static
 * DOM skeleton (markup only, no behavior). Split out of restore.ts, whose showRestoreOptionsModal()
 * wires up the interactivity on top of the elements this creates.
 */
export function ensureRestoreModalHtml() {
  document.getElementById("restore-options-modal")?.remove();

  const modalHtml = `
    <div
      id="restore-options-modal"
      class="modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="restore-options-modal-title"
      style="width: 780px"
    >
      <div class="modal-header">
        <h3 class="modal-title" id="restore-options-modal-title">Options de restauration et aperçu</h3>
        <button id="restore-options-modal-close" class="btn-icon" aria-label="Fermer">
          <svg viewBox="0 0 24 24">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
          </svg>
        </button>
      </div>
      <div class="modal-content">
        <p style="font-size: 0.9rem; color: var(--text-secondary); margin-top: 0; margin-bottom: 16px;">
          Choisissez ce que vous souhaitez restaurer à partir du fichier de sauvegarde. La base de données actuelle sera écrasée ou fusionnée selon vos choix.
        </p>

        <!-- Diff Preview Summary Card -->
        <div id="restore-diff-summary-card" style="margin-bottom: 20px; padding: 14px 16px; border: 1px solid var(--border-color); border-radius: var(--radius-md); background-color: var(--bg-main);"></div>

        <!-- Main Options Grid -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px;">
          <label class="restore-option-card active" for="restore-mode-all">
            <input type="radio" id="restore-mode-all" name="restore-mode" value="all" checked />
            <div>
              <strong style="display: block; font-size: 0.95rem; margin-bottom: 4px;">Tout restaurer</strong>
              <span style="font-size: 0.8rem; color: var(--text-muted);">Importe l'intégralité du fichier (configurations et activités). Écrase les données existantes.</span>
            </div>
          </label>

          <label class="restore-option-card" for="restore-mode-config">
            <input type="radio" id="restore-mode-config" name="restore-mode" value="config" />
            <div>
              <strong style="display: block; font-size: 0.95rem; margin-bottom: 4px;">Configurations seulement</strong>
              <span style="font-size: 0.8rem; color: var(--text-muted);">Restaure uniquement les paramètres (tarifs, comptes, salaires...). Les activités courantes restent inchangées.</span>
            </div>
          </label>

          <label class="restore-option-card" for="restore-mode-activities">
            <input type="radio" id="restore-mode-activities" name="restore-mode" value="activities" />
            <div>
              <strong style="display: block; font-size: 0.95rem; margin-bottom: 4px;">Activités seulement</strong>
              <span style="font-size: 0.8rem; color: var(--text-muted);">Restaure uniquement les activités et les favoris. Les configurations et paramètres actuels restent inchangées.</span>
            </div>
          </label>

          <label class="restore-option-card" for="restore-mode-custom">
            <input type="radio" id="restore-mode-custom" name="restore-mode" value="custom" />
            <div>
              <strong style="display: block; font-size: 0.95rem; margin-bottom: 4px;">Sélection personnalisée</strong>
              <span style="font-size: 0.8rem; color: var(--text-muted);">Choisissez précisément quels types de données ou quelles activités individuelles vous souhaitez restaurer.</span>
            </div>
          </label>
        </div>

        <!-- Custom Selection Sub-panel (hidden by default) -->
        <div id="restore-custom-panel" style="display: none; border-top: 1px solid var(--border-color); padding-top: 20px;">
          <div style="display: grid; grid-template-columns: 1fr 1.2fr; gap: 24px;">
            <!-- Left column: Config selection -->
            <div style="border-right: 1px solid var(--border-color); padding-right: 16px;">
              <h4 style="font-size: 0.95rem; font-weight: 700; margin-top: 0; margin-bottom: 12px; color: var(--text-primary)">Configurations</h4>
              <div style="display: flex; flex-direction: column; gap: 10px;">
                <div>
                  <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 0.85rem;">
                    <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; flex-grow: 1;">
                      <input type="checkbox" id="restore-cb-rooms" checked />
                      Salles et Tarifs
                    </label>
                    <span id="restore-badge-rooms" style="cursor: pointer;" title="Cliquer pour voir les détails"></span>
                  </div>
                  <div id="restore-details-rooms" class="restore-config-details" style="display: none; font-size: 0.75rem; margin-top: 4px; margin-left: 24px; padding: 6px 10px; border-radius: var(--radius-sm); background-color: var(--bg-main); border: 1px solid var(--border-color); flex-direction: column; gap: 4px;"></div>
                </div>

                <div>
                  <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 0.85rem;">
                    <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; flex-grow: 1;">
                      <input type="checkbox" id="restore-cb-salaries" checked />
                      Salaires et main d'œuvre
                    </label>
                    <span id="restore-badge-salaries" style="cursor: pointer;" title="Cliquer pour voir les détails"></span>
                  </div>
                  <div id="restore-details-salaries" class="restore-config-details" style="display: none; font-size: 0.75rem; margin-top: 4px; margin-left: 24px; padding: 6px 10px; border-radius: var(--radius-sm); background-color: var(--bg-main); border: 1px solid var(--border-color); flex-direction: column; gap: 4px;"></div>
                </div>

                <div>
                  <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 0.85rem;">
                    <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; flex-grow: 1;">
                      <input type="checkbox" id="restore-cb-services" checked />
                      Équipements et Services
                    </label>
                    <span id="restore-badge-services" style="cursor: pointer;" title="Cliquer pour voir les détails"></span>
                  </div>
                  <div id="restore-details-services" class="restore-config-details" style="display: none; font-size: 0.75rem; margin-top: 4px; margin-left: 24px; padding: 6px 10px; border-radius: var(--radius-sm); background-color: var(--bg-main); border: 1px solid var(--border-color); flex-direction: column; gap: 4px;"></div>
                </div>

                <div>
                  <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 0.85rem;">
                    <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; flex-grow: 1;">
                      <input type="checkbox" id="restore-cb-accounts" checked />
                      Comptes de Grand Livre
                    </label>
                    <span id="restore-badge-accounts" style="cursor: pointer;" title="Cliquer pour voir les détails"></span>
                  </div>
                  <div id="restore-details-accounts" class="restore-config-details" style="display: none; font-size: 0.75rem; margin-top: 4px; margin-left: 24px; padding: 6px 10px; border-radius: var(--radius-sm); background-color: var(--bg-main); border: 1px solid var(--border-color); flex-direction: column; gap: 4px;"></div>
                </div>

                <div>
                  <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 0.85rem;">
                    <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; flex-grow: 1;">
                      <input type="checkbox" id="restore-cb-departments" checked />
                      Départements
                    </label>
                    <span id="restore-badge-departments" style="cursor: pointer;" title="Cliquer pour voir les détails"></span>
                  </div>
                  <div id="restore-details-departments" class="restore-config-details" style="display: none; font-size: 0.75rem; margin-top: 4px; margin-left: 24px; padding: 6px 10px; border-radius: var(--radius-sm); background-color: var(--bg-main); border: 1px solid var(--border-color); flex-direction: column; gap: 4px;"></div>
                </div>

                <div>
                  <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 0.85rem;">
                    <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; flex-grow: 1;">
                      <input type="checkbox" id="restore-cb-tasks" checked />
                      Tâches de planification
                    </label>
                    <span id="restore-badge-tasks" style="cursor: pointer;" title="Cliquer pour voir les détails"></span>
                  </div>
                  <div id="restore-details-tasks" class="restore-config-details" style="display: none; font-size: 0.75rem; margin-top: 4px; margin-left: 24px; padding: 6px 10px; border-radius: var(--radius-sm); background-color: var(--bg-main); border: 1px solid var(--border-color); flex-direction: column; gap: 4px;"></div>
                </div>

                <div>
                  <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 0.85rem;">
                    <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; flex-grow: 1;">
                      <input type="checkbox" id="restore-cb-taxes" checked />
                      Taxes
                    </label>
                    <span id="restore-badge-taxes" style="cursor: pointer;" title="Cliquer pour voir les détails"></span>
                  </div>
                  <div id="restore-details-taxes" class="restore-config-details" style="display: none; font-size: 0.75rem; margin-top: 4px; margin-left: 24px; padding: 6px 10px; border-radius: var(--radius-sm); background-color: var(--bg-main); border: 1px solid var(--border-color); flex-direction: column; gap: 4px;"></div>
                </div>

                <div>
                  <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 0.85rem;">
                    <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; flex-grow: 1;">
                      <input type="checkbox" id="restore-cb-preferences" checked />
                      Préférences (Thème, rappels...)
                    </label>
                    <span id="restore-badge-preferences" style="cursor: pointer;" title="Cliquer pour voir les détails"></span>
                  </div>
                  <div id="restore-details-preferences" class="restore-config-details" style="display: none; font-size: 0.75rem; margin-top: 4px; margin-left: 24px; padding: 6px 10px; border-radius: var(--radius-sm); background-color: var(--bg-main); border: 1px solid var(--border-color); flex-direction: column; gap: 4px;"></div>
                </div>
              </div>
            </div>

            <!-- Right column: Activities selection -->
            <div>
              <h4 style="font-size: 0.95rem; font-weight: 700; margin-top: 0; margin-bottom: 12px; color: var(--text-primary)">Activités et données</h4>

              <div style="display: flex; flex-direction: column; gap: 12px;">
                <label style="display: flex; align-items: center; gap: 8px; font-size: 0.85rem; cursor: pointer;">
                  <input type="radio" id="restore-act-all" name="restore-act-choice" value="all" checked />
                  Toutes les activités et favoris
                </label>

                <label style="display: flex; align-items: center; gap: 8px; font-size: 0.85rem; cursor: pointer;">
                  <input type="radio" id="restore-act-select" name="restore-act-choice" value="select" />
                  Sélectionner des activités spécifiques
                </label>

                <!-- Activities specific selection container (hidden by default) -->
                <div id="restore-specific-activities-container" style="display: none; flex-direction: column; gap: 8px; border: 1px solid var(--border-color); padding: 12px; border-radius: var(--radius-sm); background-color: var(--bg-main);">

                  <!-- Diff Filter Tabs -->
                  <div id="restore-diff-filter-tabs" style="display: flex; gap: 4px; border-bottom: 1px solid var(--border-color); padding-bottom: 6px; margin-bottom: 4px;">
                    <button type="button" class="btn btn-secondary active" id="restore-filter-all" style="font-size: 0.75rem; padding: 2px 8px;">Toutes</button>
                    <button type="button" class="btn btn-secondary" id="restore-filter-diff" style="font-size: 0.75rem; padding: 2px 8px;">Modifications / Nouveautés</button>
                    <button type="button" class="btn btn-secondary" id="restore-filter-same" style="font-size: 0.75rem; padding: 2px 8px;">Identiques</button>
                  </div>

                  <!-- Search input -->
                  <input type="text" id="restore-activity-search" class="form-input" placeholder="Rechercher une activité..." style="font-size: 0.8rem; padding: 6px 10px; margin-bottom: 4px;" />

                  <!-- Select all / none links -->
                  <div style="display: flex; justify-content: space-between; font-size: 0.75rem; margin-bottom: 4px;">
                    <a href="#" id="restore-act-btn-select-all" style="color: var(--primary); text-decoration: none; font-weight: 600;">Tout sélectionner</a>
                    <a href="#" id="restore-act-btn-deselect-all" style="color: var(--text-muted); text-decoration: none; font-weight: 600;">Tout désélectionner</a>
                  </div>

                  <!-- Scrollable checklist of activities -->
                  <div id="restore-activities-checklist" class="restore-activities-list" style="max-height: 180px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; padding: 4px;">
                    <!-- Populated dynamically via JS -->
                  </div>

                  <!-- Import Mode selection -->
                  <div style="border-top: 1px solid var(--border-color); margin-top: 8px; padding-top: 8px;">
                    <span style="font-size: 0.8rem; font-weight: 600; display: block; margin-bottom: 6px;">Mode d'importation :</span>
                    <div style="display: flex; gap: 16px;">
                      <label style="display: flex; align-items: center; gap: 6px; font-size: 0.75rem; cursor: pointer;">
                        <input type="radio" id="restore-import-merge" name="restore-import-mode" value="merge" checked />
                        Fusionner avec l'existant
                      </label>
                      <label style="display: flex; align-items: center; gap: 6px; font-size: 0.75rem; cursor: pointer;">
                        <input type="radio" id="restore-import-replace" name="restore-import-mode" value="replace" />
                        Écraser les activités existantes
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button id="restore-options-modal-cancel" class="btn btn-secondary">Annuler</button>
        <button id="restore-options-modal-submit" class="btn btn-primary">Restaurer</button>
      </div>
    </div>
  `;

  const wrapper = document.createElement("div");
  wrapper.innerHTML = modalHtml.trim();
  const modalNode = wrapper.firstElementChild!;
  document.body.appendChild(modalNode);

  // Ensure backdrop exists too
  if (!document.getElementById("modal-backdrop")) {
    const backdrop = document.createElement("div");
    backdrop.id = "modal-backdrop";
    backdrop.className = "modal-backdrop";
    backdrop.setAttribute("role", "presentation");
    document.body.appendChild(backdrop);
  }
}
