// Static markup for the Activités view (#view-activities in index.html).
// Kept as a template here instead of inline HTML to keep index.html small.
// All ids/classes are unchanged so the existing wiring in navigation.ts, form.ts,
// render.ts, calendar-view.tsx, etc. keeps working untouched — this must run before
// any of those init functions query the DOM (see main.ts).

const ACTIVITIES_VIEW_HTML = `
  <div class="table-card">
    <div class="table-toolbar">
      <div class="search-wrapper">
        <svg class="search-icon" viewBox="0 0 24 24">
          <path
            d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"
          />
        </svg>
        <label for="activity-search" class="sr-only">Rechercher une activité</label>
        <input
          type="text"
          id="activity-search"
          class="search-input"
          placeholder="Rechercher par activité, responsable, facture..."
        />
      </div>

      <div class="filter-actions">
        <div class="multi-select" id="filter-salle-wrapper">
          <button
            type="button"
            class="select-input multi-select-btn"
            id="filter-salle-btn"
            aria-haspopup="true"
            aria-expanded="false"
            data-default-label="Toutes les salles"
          >
            Toutes les salles
          </button>
          <div class="multi-select-panel" id="filter-salle-panel" hidden>
            <!-- Populated dynamically -->
          </div>
        </div>
        <div class="multi-select" id="filter-client-type-wrapper">
          <button
            type="button"
            class="select-input multi-select-btn"
            id="filter-client-type-btn"
            aria-haspopup="true"
            aria-expanded="false"
            data-default-label="Tous types clients"
          >
            Tous types clients
          </button>
          <div class="multi-select-panel" id="filter-client-type-panel" hidden>
            <label class="multi-select-option"><input type="checkbox" value="interne" /> Interne</label>
            <label class="multi-select-option"><input type="checkbox" value="externe" /> Externe</label>
          </div>
        </div>
        <div class="multi-select" id="filter-status-wrapper">
          <button
            type="button"
            class="select-input multi-select-btn"
            id="filter-status-btn"
            aria-haspopup="true"
            aria-expanded="false"
            data-default-label="Tous les états"
          >
            Tous les états
          </button>
          <div class="multi-select-panel" id="filter-status-panel" hidden>
            <label class="multi-select-option"><input type="checkbox" value="brouillon" /> Brouillon</label>
            <label class="multi-select-option"><input type="checkbox" value="soumise" /> Soumise au client</label>
            <label class="multi-select-option"><input type="checkbox" value="approuvee" /> Approuvée</label>
            <label class="multi-select-option"><input type="checkbox" value="planifiee" /> Planifiée</label>
            <label class="multi-select-option"><input type="checkbox" value="facturee" /> Facturée</label>
            <label class="multi-select-option"><input type="checkbox" value="terminee" /> Terminée</label>
          </div>
        </div>
        <button
          type="button"
          id="reset-filters-btn"
          class="btn btn-secondary btn-reset-filters"
          disabled
          title="Réinitialiser tous les filtres de recherche et critères de sélection"
        >
          <svg
            viewBox="0 0 24 24"
            class="reset-icon"
            style="width: 16px; height: 16px; fill: currentColor; margin-right: 6px; vertical-align: -3px"
          >
            <path
              d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"
            />
          </svg>
          Réinitialiser les filtres
        </button>
        <button id="open-calendar-btn" class="btn btn-secondary" title="Voir le calendrier des événements">
          <svg viewBox="0 0 24 24" style="width: 16px; height: 16px; fill: currentColor; margin-right: 6px; vertical-align: -3px">
            <path
              d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 18H5V8h14v13zM7 10h5v5H7z"
            />
          </svg>
          Calendrier
        </button>
      </div>
    </div>

    <div class="table-responsive">
      <table>
        <thead>
          <tr>
            <th style="width: 22px; padding-left: 8px; padding-right: 2px; text-align: center; vertical-align: middle">
              <label for="activities-select-all" class="sr-only">Tout sélectionner</label>
              <input type="checkbox" id="activities-select-all" style="cursor: pointer" />
            </th>
            <th data-sort="date_start">Date</th>
            <th data-sort="coba">COBA COLL.</th>
            <th data-sort="name">Activité</th>
            <th data-sort="room_name">Salle</th>
            <th data-sort="bar">Bar</th>
            <th data-sort="hostess">Hôtesse</th>
            <th style="width: 90px">Dir. technique</th>
            <th data-sort="reference">Facture</th>
            <th data-sort="totalRev">Revenu</th>
            <th style="width: 160px">État</th>
          </tr>
        </thead>
        <tbody id="activities-table-body">
          <!-- Loaded dynamically -->
        </tbody>
      </table>
    </div>
    <div id="activities-pagination" class="pagination-bar"></div>

    <!-- Floating Bulk Actions Bar -->
    <div id="bulk-actions-bar" class="bulk-actions-bar">
      <div class="bulk-actions-content">
        <span id="bulk-selected-count" class="bulk-selected-count">0 sélectionnée(s)</span>
        <div class="bulk-actions-buttons">
          <button id="bulk-delete-btn" class="btn btn-danger btn-compact" title="Supprimer les activités sélectionnées">
            <svg
              viewBox="0 0 24 24"
              style="width: 16px; height: 16px; fill: currentColor; margin-right: 6px; vertical-align: -3px"
            >
              <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
            </svg>
            Supprimer
          </button>
          <div class="bulk-dropdown-container">
            <button id="bulk-state-btn" class="btn btn-secondary btn-compact" title="Changer l'état des activités sélectionnées">
              Changer le statut...
            </button>
            <div id="bulk-state-menu" class="bulk-state-menu hidden">
              <button class="bulk-state-item" data-state="brouillon">Brouillon</button>
              <button class="bulk-state-item" data-state="soumise">Soumise au client</button>
              <button class="bulk-state-item" data-state="approuvee">Approuvée</button>
              <button class="bulk-state-item" data-state="planifiee">Planifiée</button>
              <button class="bulk-state-item" data-state="facturee">Facturée</button>
              <button class="bulk-state-item" data-state="terminee">Terminée</button>
            </div>
          </div>
          <button id="bulk-clear-btn" class="btn btn-ghost btn-compact">Annuler</button>
        </div>
      </div>
    </div>
  </div>
`;

export function renderActivitiesViewShell(): void {
  const container = document.getElementById("view-activities");
  if (!container) return;
  container.innerHTML = ACTIVITIES_VIEW_HTML;
}
