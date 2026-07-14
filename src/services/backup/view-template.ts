// Static markup for the Backup view (#view-backup in index.html).
// Kept as a template here instead of inline HTML to keep index.html small.
// All ids/classes are unchanged so the existing wiring in backup.ts keeps working
// untouched — this must run before initBackupHandlers() queries the DOM (see main.ts).

const BACKUP_VIEW_HTML = `
  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 24px">
    <div class="stat-card" style="gap: 16px">
      <h3 class="chart-title">Exportations de Données</h3>
      <p style="font-size: 0.9rem; color: var(--text-secondary)">
        Exportez les données de l'application dans des formats réutilisables ou pour archivage.
      </p>

      <div style="display: flex; flex-direction: column; gap: 12px">
        <button id="backup-export-json" class="btn btn-primary btn-secondary" style="justify-content: flex-start">
          <svg viewBox="0 0 24 24" style="width: 20px; height: 20px; fill: currentColor; margin-right: 8px">
            <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
          </svg>
          Sauvegarder la base de données (Fichier JSON)
        </button>
        <button id="backup-export-excel" class="btn btn-primary" style="justify-content: flex-start">
          <svg viewBox="0 0 24 24" style="width: 20px; height: 20px; fill: currentColor; margin-right: 8px">
            <path
              d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-6 2h6v2h-6V5zm0 4h6v2h-6V9zm-8 8l3.5-4.5 2.5 3 3.5-4.5 4.5 6H5z"
            />
          </svg>
          Générer le rapport d'activités (Format Excel)
        </button>
      </div>
    </div>

    <div class="stat-card" style="gap: 16px">
      <h3 class="chart-title">Restauration des Données</h3>
      <p style="font-size: 0.9rem; color: var(--text-secondary)">
        Restaurez la base de données de l'application à partir d'un fichier de sauvegarde JSON précédemment exporté.
      </p>

      <div
        style="
          border: 2px dashed var(--border-color);
          padding: 24px;
          border-radius: var(--radius-md);
          text-align: center;
          cursor: pointer;
        "
        id="json-drop-zone"
      >
        <svg viewBox="0 0 24 24" style="width: 32px; height: 32px; fill: var(--text-secondary); margin-bottom: 8px">
          <path d="M9 16h6v-6h4l-7-7-7 7h4v6zm-4 2h14v2H5v-2z" />
        </svg>
        <div style="font-size: 0.85rem; font-weight: 600; color: var(--text-secondary)">
          Sélectionnez ou déposez votre sauvegarde (.json)
        </div>
        <input type="file" id="json-file-input" style="display: none" accept=".json" />
      </div>
    </div>
  </div>

  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 24px">
    <div class="stat-card" style="gap: 16px">
      <h3 class="chart-title">Statut de la Sauvegarde</h3>
      <p style="font-size: 0.9rem; color: var(--text-secondary)">
        Consultez la date de la dernière exportation réussie et le statut actuel.
      </p>
      <div style="display: flex; flex-direction: column; gap: 12px; font-size: 0.95rem">
        <div
          style="
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-bottom: 1px solid var(--border-color);
            padding-bottom: 8px;
          "
        >
          <span style="color: var(--text-secondary)">Dernière sauvegarde :</span>
          <span id="backup-status-date" style="font-weight: 600">Aucune sauvegarde effectuée</span>
        </div>
        <div style="display: flex; align-items: center; justify-content: space-between; padding-top: 4px">
          <span style="color: var(--text-secondary)">Statut :</span>
          <span id="backup-status-badge-container">
            <!-- populated dynamically via JS -->
          </span>
        </div>
      </div>
    </div>

    <div class="stat-card" style="gap: 16px">
      <h3 class="chart-title">Paramètres de Rappel</h3>
      <p style="font-size: 0.9rem; color: var(--text-secondary)">
        Configurez le nombre de jours au-delà duquel un rappel de sauvegarde vous sera présenté.
      </p>
      <div
        style="
          display: flex;
          align-items: center;
          gap: 12px;
          margin-top: auto;
          margin-bottom: auto;
          background-color: var(--bg-main);
          padding: 12px;
          border-radius: var(--radius-md);
          border: 1px solid var(--border-color);
        "
      >
        <label
          for="backup-reminder-days-input"
          style="font-size: 0.9rem; font-weight: 500; color: var(--text-secondary); cursor: pointer"
          >Rappeler après :</label
        >
        <input
          type="number"
          id="backup-reminder-days-input"
          class="form-input"
          min="1"
          max="365"
          style="width: 80px; padding: 6px 10px; text-align: center"
          value="7"
        />
        <span style="font-size: 0.9rem; color: var(--text-secondary)">jours</span>
      </div>
    </div>
  </div>

  <div style="display: grid; grid-template-columns: 1fr; gap: 24px; margin-bottom: 24px">
    <div class="stat-card" style="gap: 16px">
      <h3 class="chart-title">Sauvegarde automatique (dossier local)</h3>
      <p style="font-size: 0.9rem; color: var(--text-secondary)">
        Choisissez un dossier sur votre ordinateur : l'application y conservera automatiquement plusieurs versions de vos données (régulier, 15 minutes, à l'heure, à la journée et à la semaine) à chaque modification. Fonctionne sur Chrome et Edge uniquement.
      </p>
      <div id="auto-backup-status" style="font-size: 0.9rem; display: flex; align-items: center; gap: 12px; flex-wrap: wrap">
        <!-- Populated dynamically via JS -->
      </div>
    </div>
  </div>

  <!-- Diagnostic logs export -->
  <div class="stat-card" style="gap: 16px; margin-bottom: 24px">
    <h3 class="chart-title">Journaux de diagnostic</h3>
    <p style="font-size: 0.9rem; color: var(--text-secondary)">
      Téléchargez l'historique des 200 derniers messages de diagnostic (infos, avertissements, erreurs) enregistrés par
      l'application, utile pour signaler un problème.
    </p>
    <div>
      <button id="backup-export-logs" class="btn btn-secondary">Télécharger les journaux (JSON)</button>
    </div>
  </div>

  <!-- Automatic safety backups taken before destructive operations (restore, reset, migration) -->
  <div class="stat-card" style="gap: 16px; margin-bottom: 24px">
    <h3 class="chart-title">Sauvegardes de sécurité automatiques</h3>
    <p style="font-size: 0.9rem; color: var(--text-secondary)">
      Avant une restauration, une réinitialisation ou une mise à jour du format des données, l'application conserve
      automatiquement une copie des données précédentes (les 5 plus récentes).
    </p>
    <div id="safety-backups-list" style="display: flex; flex-direction: column; gap: 8px">
      <!-- Populated dynamically via JS -->
    </div>
  </div>

  <!-- Danger Zone to clear local database -->
  <div class="stat-card" style="gap: 16px; border-color: rgba(244, 63, 94, 0.2); background-color: rgba(244, 63, 94, 0.02)">
    <h3 class="chart-title" style="color: var(--danger)">Zone de Danger</h3>
    <p style="font-size: 0.9rem; color: var(--text-secondary)">
      Effacez définitivement toutes les activités saisies localement et réinitialisez l'application à son état d'origine.
    </p>
    <div>
      <button id="backup-reset-db" class="btn btn-danger">Réinitialiser la base de données (Effacer toutes les activités)</button>
    </div>
  </div>
`;

export function renderBackupViewShell(): void {
  const container = document.getElementById("view-backup");
  if (!container) return;
  container.innerHTML = BACKUP_VIEW_HTML;
}
