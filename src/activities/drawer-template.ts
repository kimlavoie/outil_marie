// Static markup for the Activity Record Drawer (#activity-drawer in index.html).
// Kept as a template here instead of inline HTML to keep index.html small.
// All ids/classes are unchanged so the existing wiring in form.ts, financials.ts,
// drawer.ts, reservations.ts, etc. keeps working untouched — this must run before
// any of those init functions query the DOM (see main.ts).

const ACTIVITY_DRAWER_HTML = `
  <div class="drawer-header" style="display: flex; align-items: center; justify-content: space-between; width: 100%">
    <div style="display: flex; align-items: center; gap: 8px">
      <h2 id="activity-drawer-title" class="drawer-title">Activité</h2>
      <span id="auto-save-status" class="auto-save-status">
        <svg class="auto-save-spinner" viewBox="0 0 24 24" style="display: none">
          <path d="M12 4V2C6.48 2 2 6.48 2 12h2c0-4.41 3.59-8 8-8z" />
        </svg>
        <span class="auto-save-text">Enregistré</span>
      </span>
    </div>
    <div style="display: flex; align-items: center; gap: 8px">
      <button id="activity-drawer-close" class="btn-icon" aria-label="Fermer">
        <svg viewBox="0 0 24 24">
          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
        </svg>
      </button>
    </div>
  </div>

  <div id="activity-state-bar" class="activity-state-bar">
    <!-- Populated dynamically: state badge, planning progress, transition buttons -->
  </div>

  <div class="activity-tabs">
    <button type="button" class="activity-tab-btn" data-activity-tab="form">
      Formulaire <span class="tab-indicator" id="tab-ind-form"></span>
    </button>
    <button type="button" class="activity-tab-btn active" data-activity-tab="submission">
      Soumission <span class="tab-indicator" id="tab-ind-submission"></span>
    </button>
    <button type="button" class="activity-tab-btn" data-activity-tab="planning">
      Planification <span class="tab-indicator" id="tab-ind-planning"></span>
    </button>
    <button type="button" class="activity-tab-btn" data-activity-tab="billing">
      Facturation <span class="tab-indicator" id="tab-ind-billing"></span>
    </button>
    <button type="button" class="activity-tab-btn" data-activity-tab="supporting-docs">
      Pièces justificatives
    </button>
    <button type="button" class="activity-tab-btn" data-activity-tab="history">Historique</button>
    <button type="button" class="activity-tab-btn" data-activity-tab="notes">
      Notes <span class="tab-indicator" id="tab-ind-notes"></span>
    </button>
  </div>

  <div class="drawer-content">
    <form id="activity-form">
      <input type="hidden" id="form-activity-internal-id" />

      <!-- ============ TAB: Formulaire ============ -->
      <div id="activity-tab-panel-form" class="activity-tab-panel">
        <div style="margin-bottom: 16px; font-size: 0.85rem; color: var(--text-muted)">
          Liez le formulaire PDF rempli pour cette réservation afin de pouvoir le consulter en tout temps.
        </div>
        <div class="distribution-section">
          <div class="distribution-header">
            <span class="field-label">Formulaire de réservation</span>
          </div>
          <div id="form-file-status" class="file-link-status"></div>
        </div>
        <!-- Dynamic PDF preview container -->
        <div id="form-pdf-preview" style="margin-top: 20px"></div>
      </div>

      <!-- ============ TAB: Pièces justificatives ============ -->
      <div id="activity-tab-panel-supporting-docs" class="activity-tab-panel">
        <div style="margin-bottom: 16px; font-size: 0.85rem; color: var(--text-muted)">
          Liez un dossier contenant les pièces justificatives de cette activité (factures, reçus, etc.) afin de les consulter en tout temps.
        </div>
        <div class="distribution-section">
          <div class="distribution-header">
            <span class="field-label">Dossier de pièces justificatives</span>
          </div>
          <div id="supporting-docs-status"></div>
        </div>
      </div>

      <!-- ============ TAB: Soumission et contrat ============ -->
      <div id="activity-tab-panel-submission" class="activity-tab-panel active">
        <!-- Mode: Estimation (calcul allégé) vs Soumission (formulaire complet) — hidden once
             the activity has moved past Brouillon, since the mode is then locked to Soumission. -->
        <div class="form-group" id="activity-mode-group">
          <span class="field-label" id="activity-mode-toggle-label">Mode</span>
          <div id="activity-mode-toggle" class="pill-toggle-group" role="group" aria-labelledby="activity-mode-toggle-label">
            <button type="button" class="pill-toggle" data-mode="estimation">Estimation</button>
            <button type="button" class="pill-toggle" data-mode="soumission">Soumission</button>
          </div>
        </div>

        <!-- Informations générales -->
        <details class="form-accordion-section" id="accordion-section-general">
          <summary class="form-accordion-summary">
            <span class="form-accordion-check" id="accordion-check-general"></span>
            <span>Informations générales</span>
          </summary>
          <div class="form-accordion-content">
            <div class="form-group-row">
              <div class="form-group">
                <label for="form-activity-id" style="display: flex; align-items: center; gap: 6px">
                  Numéro d'activité <span class="badge badge-auto">Auto</span>
                </label>
                <input type="text" id="form-activity-id" class="form-input input-auto" placeholder="Généré automatiquement" disabled />
              </div>
              <div class="form-group">
                <label for="form-activity-coba">Références COBA collégial</label>
                <input type="text" id="form-activity-coba" class="form-input" placeholder="Ex: 123456; 789012" />
              </div>
            </div>

            <div class="form-group-row">
              <div class="form-group">
                <label for="form-activity-name">Nom de l'activité *</label>
                <input type="text" id="form-activity-name" class="form-input" required placeholder="Ex: Réunion SCOUTS" />
              </div>
              <div class="form-group estimation-hide">
                <label for="form-activity-attendees">Nombre de personnes attendues</label>
                <input type="number" id="form-activity-attendees" class="form-input" min="0" placeholder="Ex: 50" />
              </div>
            </div>

            <div class="form-group estimation-hide">
              <label for="form-activity-description">Description de l'activité</label>
              <textarea id="form-activity-description" class="form-input" rows="2" placeholder="Décrivez l'activité..."></textarea>
            </div>
          </div>
        </details>

        <!-- Responsable de l'activité -->
        <details class="form-accordion-section estimation-hide" id="accordion-section-manager">
          <summary class="form-accordion-summary">
            <span class="form-accordion-check" id="accordion-check-manager"></span>
            <span>Responsable de l'activité</span>
          </summary>
          <div class="form-accordion-content">
            <div class="form-group-row">
              <div class="form-group">
                <label for="form-activity-manager-firstname">Prénom</label>
                <input type="text" id="form-activity-manager-firstname" class="form-input" placeholder="Prénom" />
              </div>
              <div class="form-group">
                <label for="form-activity-manager-lastname">Nom</label>
                <input type="text" id="form-activity-manager-lastname" class="form-input" placeholder="Nom" />
              </div>
            </div>
            <div class="form-group-row">
              <div class="form-group">
                <label for="form-activity-manager-type">Fonction</label>
                <select id="form-activity-manager-type" class="select-input" style="padding: 10px 14px">
                  <option value="">Sélectionner...</option>
                  <option value="employe">Employé</option>
                  <option value="etudiant">Étudiant</option>
                  <option value="externe">Externe</option>
                </select>
              </div>
              <div class="form-group">
                <label for="form-activity-manager-phone">Numéro de téléphone</label>
                <input type="tel" id="form-activity-manager-phone" class="form-input" placeholder="Ex: 514-555-1234" />
              </div>
            </div>
            <div class="form-group">
              <label for="form-activity-manager-email">Courriel</label>
              <input type="email" id="form-activity-manager-email" class="form-input" placeholder="nom@exemple.com" />
            </div>

            <!-- Shown only when Fonction = Externe -->
            <div id="form-activity-manager-external-group" style="display: none">
              <div class="form-group-row">
                <div class="form-group">
                  <label for="form-activity-manager-company">Nom de l'entreprise</label>
                  <input type="text" id="form-activity-manager-company" class="form-input" placeholder="Ex: Entreprise inc." />
                </div>
                <div class="form-group">
                  <label for="form-activity-manager-coba-client-number">Numéro de client (COBA Finance)</label>
                  <input type="text" id="form-activity-manager-coba-client-number" class="form-input" placeholder="Ex: 12345" />
                </div>
              </div>
              <div class="form-group">
                <label for="form-activity-manager-address">Adresse</label>
                <input type="text" id="form-activity-manager-address" class="form-input" placeholder="Ex: 123 rue Principale" />
              </div>
              <div class="form-group-row">
                <div class="form-group">
                  <label for="form-activity-manager-city">Ville</label>
                  <input type="text" id="form-activity-manager-city" class="form-input" placeholder="Ex: Montréal" />
                </div>
                <div class="form-group">
                  <label for="form-activity-manager-province">Province</label>
                  <input type="text" id="form-activity-manager-province" class="form-input" placeholder="Ex: QC" />
                </div>
              </div>
              <div class="form-group">
                <label for="form-activity-manager-postal-code">Code postal</label>
                <input type="text" id="form-activity-manager-postal-code" class="form-input" placeholder="Ex: H1A 1A1" />
              </div>
            </div>
          </div>
        </details>

        <!-- Responsable de la facturation -->
        <details class="form-accordion-section estimation-hide" id="accordion-section-billing">
          <summary class="form-accordion-summary">
            <span class="form-accordion-check" id="accordion-check-billing"></span>
            <span>Responsable de la facturation</span>
          </summary>
          <div class="form-accordion-content">
            <div class="form-group form-checkbox-group">
              <label class="form-checkbox-label">
                <input type="checkbox" id="form-activity-responsable-same-as-manager" />
                <span>Même personne que le responsable de l'activité</span>
              </label>
            </div>
            <div class="form-group-row">
              <div class="form-group">
                <label for="form-activity-responsable-firstname">Prénom du responsable</label>
                <input type="text" id="form-activity-responsable-firstname" class="form-input" placeholder="Prénom" />
              </div>
              <div class="form-group">
                <label for="form-activity-responsable-lastname">Nom du responsable</label>
                <input type="text" id="form-activity-responsable-lastname" class="form-input" placeholder="Nom" />
              </div>
            </div>

            <div class="form-group">
              <label for="form-activity-client-type">Client interne ou externe</label>
              <select id="form-activity-client-type" class="select-input" style="padding: 10px 14px">
                <option value="">Sélectionner...</option>
                <option value="interne">Interne</option>
                <option value="externe">Externe</option>
              </select>
            </div>

            <div class="form-group" id="form-activity-dept-group">
              <label for="form-activity-dept">Département</label>
              <select id="form-activity-dept" class="select-input" style="padding: 10px 14px">
                <!-- Populated dynamically -->
              </select>
            </div>

            <!-- Shown only when Client = Externe -->
            <div id="form-activity-responsable-external-group" style="display: none">
              <div class="form-group">
                <label for="form-activity-responsable-address">Adresse</label>
                <input type="text" id="form-activity-responsable-address" class="form-input" placeholder="Ex: 123 rue Principale" />
              </div>
              <div class="form-group-row">
                <div class="form-group">
                  <label for="form-activity-responsable-city">Ville</label>
                  <input type="text" id="form-activity-responsable-city" class="form-input" placeholder="Ex: Montréal" />
                </div>
                <div class="form-group">
                  <label for="form-activity-responsable-province">Province</label>
                  <input type="text" id="form-activity-responsable-province" class="form-input" placeholder="Ex: QC" />
                </div>
              </div>
              <div class="form-group">
                <label for="form-activity-responsable-postal-code">Code postal</label>
                <input type="text" id="form-activity-responsable-postal-code" class="form-input" placeholder="Ex: H1A 1A1" />
              </div>
            </div>
          </div>
        </details>

        <!-- Réservations de salle -->
        <details class="form-accordion-section" id="accordion-section-rooms">
          <summary class="form-accordion-summary">
            <span class="form-accordion-check" id="accordion-check-rooms"></span>
            <span>Réservation de salles</span>
          </summary>
          <div class="form-accordion-content">
            <div id="form-activity-reservations">
              <!-- One reservation card per réservation, populated dynamically -->
            </div>
            <div id="form-activity-room-conflicts" style="display: none; margin-top: 8px; margin-bottom: 4px"></div>
            <div style="margin-top: 8px; margin-bottom: 12px">
              <button type="button" id="add-reservation-btn" class="btn btn-secondary" style="padding: 6px 12px; font-size: 0.8rem">
                + Ajouter une réservation
              </button>
            </div>
          </div>
        </details>

        <!-- Type d'événements -->
        <details class="form-accordion-section estimation-hide" id="accordion-section-eventtype">
          <summary class="form-accordion-summary">
            <span class="form-accordion-check" id="accordion-check-eventtype"></span>
            <span>Type d'événements</span>
          </summary>
          <div class="form-accordion-content">
            <div class="form-group">
              <label for="form-activity-event-type">Type d'événement</label>
              <select id="form-activity-event-type" class="select-input" style="padding: 10px 14px">
                <!-- Populated dynamically -->
              </select>
            </div>
            <div class="form-group" id="form-activity-event-type-other-group" style="display: none">
              <label for="form-activity-event-type-other">Précisez le type d'événement</label>
              <input type="text" id="form-activity-event-type-other" class="form-input" placeholder="Précisez..." />
            </div>
          </div>
        </details>

        <!-- Estimation des coûts (taxes québécoises) -->
        <details class="form-accordion-section" id="accordion-section-financial-summary">
          <summary class="form-accordion-summary">
            <span class="form-accordion-check-spacer"></span>
            <span>Estimation des coûts</span>
          </summary>
          <div class="form-accordion-content">
            <div id="submission-financial-summary" class="financial-summary">
              <!-- Populated dynamically, including the "Non taxable" pill and the adjust-taxes icon
                   right above the TPS/TVQ rows — see updateSubmissionFinancialSummary() -->
            </div>
          </div>
        </details>

        <!-- Soumission -->
        <details class="form-accordion-section estimation-hide" id="accordion-section-submission-file">
          <summary class="form-accordion-summary">
            <span class="form-accordion-check" id="accordion-check-submission-file"></span>
            <span>Soumission</span>
          </summary>
          <div class="form-accordion-content">
            <div id="submission-file-status" class="file-link-status"></div>
            <!-- Dynamic Excel preview container, hidden until the user clicks "Afficher l'aperçu" -->
            <div id="submission-xlsx-preview" style="margin-top: 20px; display: none"></div>
          </div>
        </details>

        <!-- Contrat -->
        <details class="form-accordion-section estimation-hide" id="accordion-section-contract-file">
          <summary class="form-accordion-summary">
            <span class="form-accordion-check" id="accordion-check-contract-file"></span>
            <span>Contrat</span>
          </summary>
          <div class="form-accordion-content">
            <div id="contract-file-status" class="file-link-status"></div>
            <!-- Dynamic Excel preview container, hidden until the user clicks "Afficher l'aperçu" -->
            <div id="contract-xlsx-preview" style="margin-top: 20px; display: none"></div>
          </div>
        </details>
      </div>

      <!-- ============ TAB: Planification ============ -->
      <div id="activity-tab-panel-planning" class="activity-tab-panel">
        <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 16px">
          <div id="planning-progress-wrapper" style="flex-grow: 1; display: flex; align-items: center; gap: 10px">
            <div id="planning-progress-bar-container" style="flex-grow: 1"></div>
            <span id="planning-progress-label" style="font-size: 0.85rem; color: var(--text-muted); white-space: nowrap"></span>
          </div>
        </div>
        <div style="display: flex; gap: 8px; margin-bottom: 16px">
          <button type="button" id="generate-planning-tasks-btn" class="btn btn-secondary">Générer les tâches automatiquement</button>
          <button type="button" id="add-planning-task-btn" class="btn btn-secondary">+ Ajouter une tâche</button>
        </div>
        <div id="planning-tasks-list" class="distribution-list">
          <!-- Dynamic rows -->
        </div>
      </div>

      <!-- ============ TAB: Facturation ============ -->
      <div id="activity-tab-panel-billing" class="activity-tab-panel">
        <!-- Accounts Dynamic Distribution Interface -->
        <div class="distribution-section">
          <div class="distribution-header">
            <span class="field-label">
              Ventilation par compte de revenus (avec Numéro Facture, RI ou Encaissement par compte)
              <span class="help-tooltip-trigger" title="Chaque ligne indique quel montant va dans quel compte comptable. Le bouton « Générer les lignes de facturation » remplit automatiquement ces lignes à partir de toutes les dépenses saisies (salles, personnel, équipements et frais).">?</span>
            </span>
            <div style="display: flex; gap: 8px">
              <button
                type="button"
                id="generate-billing-lines-btn"
                class="btn btn-secondary"
                style="padding: 6px 12px; font-size: 0.8rem"
              >
                Générer les lignes de facturation
              </button>
              <button
                type="button"
                id="form-add-distribution-btn"
                class="btn btn-secondary"
                style="padding: 6px 12px; font-size: 0.8rem"
              >
                + Ajouter
              </button>
            </div>
          </div>
          <div id="form-distribution-list" class="distribution-list">
            <!-- Dynamic rows -->
          </div>
          <div class="distribution-total">
            <span>Total saisi</span>
            <span id="form-distribution-total-val">0,00 $</span>
          </div>
          <div style="text-align: right">
            <span id="form-distribution-total-warning" style="display: none; color: var(--warning-text); font-size: 0.8rem"></span>
          </div>
        </div>

        <div class="distribution-section" id="billing-bar-revenue-section" style="display: none;">
          <div class="distribution-header">
            <span class="field-label">
              Revenus du bar
              <span class="help-tooltip-trigger" title="Indiquez les revenus générés par le service de bar. Ce montant est conservé à titre indicatif et n'est pas inclus dans la ventilation budgétaire ni les totaux facturés.">?</span>
            </span>
            <button
              type="button"
              id="form-add-bar-revenue-btn"
              class="btn btn-secondary"
              style="padding: 6px 12px; font-size: 0.8rem"
            >
              + Ajouter une ligne de bar
            </button>
          </div>
          <div id="form-bar-revenue-list" class="distribution-list">
            <!-- Dynamic rows -->
          </div>
          <div class="distribution-total">
            <span>Total des revenus du bar</span>
            <span id="form-bar-revenue-total-val">0,00 $</span>
          </div>

        </div>

        <div class="distribution-section">
          <div class="distribution-header">
            <span class="field-label">État de la facturation</span>
          </div>
          <div id="billing-state-status" class="file-link-status"></div>
        </div>
      </div>

      <!-- ============ TAB: Historique ============ -->
      <div id="activity-tab-panel-history" class="activity-tab-panel">
        <div style="margin-bottom: 16px; font-size: 0.85rem; color: var(--text-muted)">
          Consultez les versions enregistrées de cette activité et restaurez l'une d'elles en cas de besoin.
        </div>
        <div id="activity-history-list" class="history-list">
          <!-- Dynamically populated list of versions -->
        </div>
      </div>

      <!-- ============ TAB: Notes ============ -->
      <div id="activity-tab-panel-notes" class="activity-tab-panel">
        <div class="form-group">
          <label for="form-activity-notes">Notes</label>
          <textarea id="form-activity-notes" class="form-input" rows="12" placeholder="Notes concernant cette activité..."></textarea>
        </div>
      </div>
    </form>
  </div>

  <div class="drawer-footer">
    <button id="activity-drawer-back-to-calendar-btn" class="btn btn-secondary" style="margin-right: auto; display: none">
      <svg viewBox="0 0 24 24" style="width: 16px; height: 16px; fill: currentColor; margin-right: 6px; vertical-align: -3px">
        <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
      </svg>
      Retour au calendrier
    </button>
    <button id="activity-drawer-submit" class="btn btn-primary" style="display: none">Enregistrer</button>
  </div>
`;

export function renderActivityDrawerShell(): void {
  const container = document.getElementById("activity-drawer");
  if (!container) return;
  container.innerHTML = ACTIVITY_DRAWER_HTML;
}
