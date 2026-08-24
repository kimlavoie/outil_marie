import React, { useState, useEffect, useRef } from "react";
import { useAppState, appState, saveDatabase, saveDatabaseOrRollback, saveSafetyBackupToDb, seedDatabase } from "../../state/state.ts";
import { showToast } from "../../utils/utils.ts";
import { logError } from "../../utils/logger.ts";
import { exportToExcel } from "../../services/excel-export.ts";
import { handleJsonBackupFile } from "../../services/backup/restore.ts";
import {
  checkBackupReminder,
  getDaysSinceLastBackup,
  formatLocalDateToFrench,
  renderSafetyBackupsList,
  openDeletedActivitiesModal,
  exportDiagnosticLogs
} from "../../services/backup/reminder.ts";
import { initAutoBackup } from "../../services/backup/auto-backup.ts";

export const BackupView: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const lastBackup = useAppState(s => s.settings.last_backup_date);
  const reminderDays = useAppState(s => s.settings.backup_reminder_days || 7);
  const activities = useAppState(s => s.activities);
  const deletedCount = activities.filter(a => a.deleted).length;

  useEffect(() => {
    // Initialise auto backup & safety backups logic on mount
    initAutoBackup();
    renderSafetyBackupsList();
  }, []);

  const handleExportJson = async () => {
    import("../../state/state.ts").then(async m => {
      m.appState.settings.last_backup_date = new Date().toISOString().split("T")[0];
      await saveDatabase();
      checkBackupReminder();

      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(m.appState, null, 2));
      const dlAnchorElem = document.createElement("a");
      dlAnchorElem.setAttribute("href", dataStr);
      const timestamp = new Date().toISOString().split("T")[0];
      dlAnchorElem.setAttribute("download", `compta_marie_sauvegarde_${timestamp}.json`);
      dlAnchorElem.click();
      showToast("Sauvegarde réussie.", "success");
    });
  };

  const handleExportExcel = () => {
    exportToExcel();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleJsonBackupFile(file);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleJsonBackupFile(file);
    }
  };

  const handleReminderDaysChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val) && val >= 1 && val <= 365) {
      import("../../state/state.ts").then(m => {
        const prev = m.appState.settings.backup_reminder_days;
        m.appState.settings.backup_reminder_days = val;
        saveDatabaseOrRollback(() => {
          m.appState.settings.backup_reminder_days = prev;
        }, "Erreur de sauvegarde");
      });
    }
  };

  const handleResetDatabase = () => {
    if (window.confirm("ÊTES-VOUS SÛR ? Cette action va EFFACER TOUTES LES ACTIVITÉS saisies et réinitialiser l'application.")) {
      if (window.confirm("CONFIRMATION FINALE : Réinitialiser complètement la base de données ?")) {
        (async () => {
          try {
            await saveSafetyBackupToDb("avant_reinitialisation", JSON.parse(JSON.stringify(appState)));
          } catch (err) {
            logError("backup", "sauvegarde de sécurité avant réinitialisation", err);
          }
          await seedDatabase();
          showToast("Base de données réinitialisée.", "info");
          window.location.reload();
        })();
      }
    }
  };

  return (
    <div className="view-content" style={{ padding: "20px 0" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", marginBottom: "24px" }}>
        {/* Export Card */}
        <div className="stat-card" style={{ gap: "16px" }}>
          <h3 className="chart-title">Exportations de Données</h3>
          <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>
            Exportez les données de l'application dans des formats réutilisables ou pour archivage.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <button
              id="backup-export-json"
              type="button"
              className="btn btn-primary btn-secondary"
              onClick={handleExportJson}
              style={{ justifyContent: "flex-start" }}
            >
              <svg viewBox="0 0 24 24" style={{ width: "20px", height: "20px", fill: "currentColor", marginRight: "8px" }}>
                <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
              </svg>
              Sauvegarder la base de données (Fichier JSON)
            </button>

            <button
              id="backup-export-excel"
              type="button"
              className="btn btn-primary"
              onClick={handleExportExcel}
              style={{ justifyContent: "flex-start" }}
            >
              <svg viewBox="0 0 24 24" style={{ width: "20px", height: "20px", fill: "currentColor", marginRight: "8px" }}>
                <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-6 2h6v2h-6V5zm0 4h6v2h-6V9zm-8 8l3.5-4.5 2.5 3 3.5-4.5 4.5 6H5z" />
              </svg>
              Générer le rapport d'activités (Format Excel)
            </button>
          </div>
        </div>

        {/* Restore Card */}
        <div className="stat-card" style={{ gap: "16px" }}>
          <h3 className="chart-title">Restauration des Données</h3>
          <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>
            Restaurez la base de données de l'application à partir d'un fichier de sauvegarde JSON précédemment exporté.
          </p>

          <div
            id="json-drop-zone"
            className={isDragOver ? "dragover" : ""}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => {
              e.preventDefault();
              e.stopPropagation();
              setIsDragOver(true);
            }}
            onDragEnter={e => {
              e.preventDefault();
              e.stopPropagation();
              setIsDragOver(true);
            }}
            onDragLeave={e => {
              e.preventDefault();
              e.stopPropagation();
              setIsDragOver(false);
            }}
            onDrop={e => {
              e.preventDefault();
              e.stopPropagation();
              setIsDragOver(false);
              handleDrop(e);
            }}
            style={{
              border: isDragOver ? "2px dashed var(--primary)" : "2px dashed var(--border-color)",
              backgroundColor: isDragOver ? "var(--primary-light)" : "transparent",
              padding: "24px",
              borderRadius: "var(--radius-md)",
              textAlign: "center",
              cursor: "pointer",
              transition: "var(--transition-smooth)"
            }}
          >
            <svg viewBox="0 0 24 24" style={{ width: "32px", height: "32px", fill: isDragOver ? "var(--primary)" : "var(--text-secondary)", marginBottom: "8px", transition: "fill var(--transition-smooth)" }}>
              <path d="M9 16h6v-6h4l-7-7-7 7h4v6zm-4 2h14v2H5v-2z" />
            </svg>
            <div style={{ fontSize: "0.85rem", fontWeight: 600, color: isDragOver ? "var(--primary)" : "var(--text-secondary)" }}>
              {isDragOver ? "Déposez votre fichier JSON ici" : "Sélectionnez ou déposez votre sauvegarde (.json)"}
            </div>
            <input ref={fileInputRef} type="file" id="json-file-input" style={{ display: "none" }} accept=".json" onChange={handleFileChange} />
          </div>
        </div>
      </div>

      {/* Status & Reminder Parameters */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", marginBottom: "24px" }}>
        <div className="stat-card" style={{ gap: "16px" }}>
          <h3 className="chart-title">Statut de la Sauvegarde</h3>
          <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>Consultez la date de la dernière exportation réussie et le statut actuel.</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", fontSize: "0.95rem" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--border-color)", paddingBottom: "8px" }}>
              <span style={{ color: "var(--text-secondary)" }}>Dernière sauvegarde :</span>
              <span style={{ fontWeight: 600 }}>
                {lastBackup ? `${formatLocalDateToFrench(lastBackup)} (${lastBackup})` : "Aucune sauvegarde effectuée"}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: "4px" }}>
              <span style={{ color: "var(--text-secondary)" }}>Statut :</span>
              <span>
                {activities.length === 0 ? (
                  <span className="badge badge-info">Aucune donnée à sauvegarder</span>
                ) : !lastBackup ? (
                  <span className="badge badge-danger">Non sauvegardé</span>
                ) : (() => {
                    const days = getDaysSinceLastBackup();
                    return days !== null && days >= reminderDays ? (
                      <span className="badge badge-warning">Sauvegarde requise</span>
                    ) : (
                      <span className="badge badge-success">À jour</span>
                    );
                  })()}
              </span>
            </div>
          </div>
        </div>

        <div className="stat-card" style={{ gap: "16px" }}>
          <h3 className="chart-title">Paramètres de Rappel</h3>
          <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>Configurez le nombre de jours au-delà duquel un rappel de sauvegarde vous sera présenté.</p>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              marginTop: "auto",
              marginBottom: "auto",
              backgroundColor: "var(--bg-main)",
              padding: "12px",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-color)"
            }}
          >
            <label htmlFor="backup-reminder-days-input" style={{ fontSize: "0.9rem", fontWeight: 500, color: "var(--text-secondary)", cursor: "pointer" }}>
              Rappeler après :
            </label>
            <input
              type="number"
              id="backup-reminder-days-input"
              className="form-input"
              min="1"
              max="365"
              style={{ width: "80px", padding: "6px 10px", textAlign: "center" }}
              value={reminderDays}
              onChange={handleReminderDaysChange}
            />
            <span style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>jours</span>
          </div>
        </div>
      </div>

      {/* Auto Backup status */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "24px", marginBottom: "24px" }}>
        <div className="stat-card" style={{ gap: "16px" }}>
          <h3 className="chart-title">Sauvegarde automatique (dossier local)</h3>
          <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>
            Choisissez un dossier sur votre ordinateur : l'application y conservera automatiquement plusieurs versions de vos données à chaque modification. Fonctionne sur Chrome et Edge uniquement.
          </p>
          <div id="auto-backup-status" style={{ fontSize: "0.9rem", display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}></div>
        </div>
      </div>

      {/* Diagnostic logs */}
      <div className="stat-card" style={{ gap: "16px", marginBottom: "24px" }}>
        <h3 className="chart-title">Journaux de diagnostic</h3>
        <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>
          Téléchargez l'historique des 200 derniers messages de diagnostic enregistrés par l'application.
        </p>
        <div>
          <button id="backup-export-logs" type="button" className="btn btn-secondary" onClick={() => exportDiagnosticLogs()}>
            Télécharger les journaux (JSON)
          </button>
        </div>
      </div>

      {/* Safety Backups */}
      <div className="stat-card" style={{ gap: "16px", marginBottom: "24px" }}>
        <h3 className="chart-title">Sauvegardes de sécurité automatiques</h3>
        <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>
          Avant une restauration, une réinitialisation ou une mise à jour, l'application conserve une copie automatique des données précédentes.
        </p>
        <div id="safety-backups-list" style={{ display: "flex", flexDirection: "column", gap: "8px" }}></div>
      </div>

      {/* Soft-deleted activities */}
      <div className="stat-card" style={{ gap: "16px", marginBottom: "24px" }}>
        <h3 className="chart-title">Activités supprimées</h3>
        <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>
          Les activités supprimées ne sont pas effacées immédiatement : vous pouvez les retrouver et les récupérer.
        </p>
        <div>
          <button id="backup-open-deleted-activities" type="button" className="btn btn-secondary" onClick={() => openDeletedActivitiesModal()}>
            Voir les activités supprimées {deletedCount > 0 && <span className="badge badge-info" style={{ marginLeft: "8px" }}>{deletedCount}</span>}
          </button>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="stat-card" style={{ gap: "16px", borderColor: "rgba(244, 63, 94, 0.2)", backgroundColor: "rgba(244, 63, 94, 0.02)" }}>
        <h3 className="chart-title" style={{ color: "var(--danger)" }}>Zone de Danger</h3>
        <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>
          Effacez définitivement toutes les activités saisies localement et réinitialisez l'application à son état d'origine.
        </p>
        <div>
          <button id="backup-reset-db" type="button" className="btn btn-danger" onClick={handleResetDatabase}>
            Réinitialiser la base de données (Effacer toutes les activités)
          </button>
        </div>
      </div>
    </div>
  );
};
