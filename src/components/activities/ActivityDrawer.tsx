import React, { useState, useEffect, useRef } from "react";
import { useAppState, appState, recordActivityView, saveDatabaseOrRollback } from "../../state/state.ts";
import { showToast, elById, debounce } from "../../utils/utils.ts";
import { activitiesState, renderActivities } from "../../activities/render.ts";
import {
  fillActivityFormFields,
  switchActivityTab,
  renderActivityStateBar,
  commitActivityPatch,
  initFormHandlers
} from "../../activities/form.ts";
import { updateSubmissionFinancialSummary } from "../../activities/financial-summary.ts";
import { showAutoSaveStatus, autoSaveActivityForm } from "../../activities/autosave.ts";
import { cancelActivityDrawer, closeActivityDrawer as legacyCloseActivityDrawer } from "../../activities/drawer.ts";
import { updateFormDatesHelper, loadAndRenderActivityHistory } from "../../activities/history/index.ts";
import { renderPlanningTab } from "../../activities/planning-tab.ts";
import { renderBillingStateStatus } from "../../activities/billing-tab.ts";
import { renderFileLinkStatus } from "../../activities/file-links/index.ts";
import { renderSupportingDocsStatus } from "../../activities/supporting-docs/index.ts";
import type { Activity } from "../../types/activity.ts";

let openDrawerSubscriber: ((id: string, calendarReturn?: any, initialTab?: string) => void) | null = null;
let closeDrawerSubscriber: (() => void) | null = null;

export function isActivityDrawerSubscribed(): boolean {
  return openDrawerSubscriber !== null;
}

export function triggerOpenActivityDrawer(id: string, calendarReturn: any = null, initialTab: string = "submission"): void {
  if (openDrawerSubscriber) {
    openDrawerSubscriber(id, calendarReturn, initialTab);
  }
}

export function triggerCloseActivityDrawer(): void {
  if (closeDrawerSubscriber) {
    closeDrawerSubscriber();
  }
}

export const ActivityDrawer: React.FC = () => {
  const state = useAppState();
  const [isOpen, setIsOpen] = useState(false);
  const [activityId, setActivityId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("submission");
  const [calendarReturn, setCalendarReturn] = useState<any>(null);

  const drawerRef = useRef<HTMLDivElement>(null);
  const debouncedAutoSaveRef = useRef(debounce(autoSaveActivityForm, 500));

  useEffect(() => {
    openDrawerSubscriber = (id: string, calReturn: any = null, initialTab: string = "submission") => {
      const act = appState.activities.find((a: any) => a.id === id);
      if (!act) return;

      activitiesState.openedActivitySnapshot = JSON.parse(JSON.stringify(act));
      activitiesState.undoStack = [JSON.parse(JSON.stringify(act))];
      activitiesState.redoStack = [];

      if (act.name.trim() !== "") {
        recordActivityView(act.id);
        import("../../navigation.ts").then(m => m.renderQuickAccessAll());
      }

      setActivityId(id);
      setCalendarReturn(calReturn);
      setActiveTab(initialTab || "submission");
      setIsOpen(true);
    };

    closeDrawerSubscriber = () => {
      setIsOpen(false);
      setActivityId(null);
      activitiesState.openedActivitySnapshot = null;
      activitiesState.undoStack = [];
      activitiesState.redoStack = [];
    };

    return () => {
      openDrawerSubscriber = null;
      closeDrawerSubscriber = null;
    };
  }, []);

  // Populate form fields only when drawer opens or activityId changes
  useEffect(() => {
    if (!isOpen || !activityId) return;

    const act = appState.activities.find((a: any) => a.id === activityId);
    if (!act) return;

    setTimeout(() => {
      fillActivityFormFields(act);
      renderActivityStateBar(act);
      initFormHandlers();
      showAutoSaveStatus("saved");
      updateFormDatesHelper();
    }, 50);
  }, [isOpen, activityId]);

  // Update tab sub-views when activeTab changes
  useEffect(() => {
    if (!isOpen || !activityId) return;

    const act = appState.activities.find((a: any) => a.id === activityId);
    if (!act) return;

    setTimeout(() => {
      switchActivityTab(activeTab);
      if (activeTab === "form") {
        renderFileLinkStatus("form", act);
      } else if (activeTab === "supporting-docs") {
        renderSupportingDocsStatus(act);
      } else if (activeTab === "submission") {
        updateSubmissionFinancialSummary();
        renderFileLinkStatus("submission", act);
        renderFileLinkStatus("contract", act);
      } else if (activeTab === "planning") {
        renderPlanningTab(act);
      } else if (activeTab === "billing") {
        renderBillingStateStatus(act);
      } else if (activeTab === "history") {
        loadAndRenderActivityHistory(act.id);
      }
    }, 50);
  }, [isOpen, activityId, activeTab]);

  if (!isOpen || !activityId) return null;

  const currentActivity = appState.activities.find((a: any) => a.id === activityId);
  const titleText = currentActivity?.name.trim() ? currentActivity.name : `Activité ${activityId}`;

  const handleClose = () => {
    cancelActivityDrawer();
    setIsOpen(false);
    setActivityId(null);
  };

  const handleSelectTab = (tab: string) => {
    setActiveTab(tab);
    switchActivityTab(tab);
  };

  const handleFormInput = (e: React.FormEvent) => {
    showAutoSaveStatus("saving");
    updateFormDatesHelper();
    updateSubmissionFinancialSummary();
    debouncedAutoSaveRef.current();
  };

  const handleFormChange = (e: React.FormEvent) => {
    showAutoSaveStatus("saving");
    updateFormDatesHelper();
    updateSubmissionFinancialSummary();
    autoSaveActivityForm();
  };

  const isDraft = activitiesState.draftActivityId === activityId;

  return (
    <>
      <div className="drawer-backdrop active" onClick={handleClose} />
      <aside
        id="activity-drawer"
        ref={drawerRef}
        className="drawer activity-drawer active"
        role="dialog"
        aria-modal="true"
        aria-labelledby="activity-drawer-title"
      >
        {/* Header */}
        <div className="drawer-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <h2 id="activity-drawer-title" className="drawer-title">
              {titleText}
            </h2>
            <span id="auto-save-status" className="auto-save-status">
              <svg className="auto-save-spinner" viewBox="0 0 24 24" style={{ display: "none" }}>
                <path d="M12 4V2C6.48 2 2 6.48 2 12h2c0-4.41 3.59-8 8-8z" />
              </svg>
              <span className="auto-save-text">Enregistré</span>
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button type="button" id="activity-drawer-close" className="btn-icon" aria-label="Fermer" onClick={handleClose}>
              <svg viewBox="0 0 24 24" style={{ width: 18, height: 18, fill: "currentColor" }}>
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
              </svg>
            </button>
          </div>
        </div>

        {/* State Bar */}
        <div id="activity-state-bar" className="activity-state-bar" />

        {/* Navigation Tabs */}
        <div className="activity-tabs">
          <button
            type="button"
            className={`activity-tab-btn ${activeTab === "form" ? "active" : ""}`}
            onClick={() => handleSelectTab("form")}
          >
            Formulaire <span className="tab-indicator" id="tab-ind-form" />
          </button>
          <button
            type="button"
            className={`activity-tab-btn ${activeTab === "submission" ? "active" : ""}`}
            onClick={() => handleSelectTab("submission")}
          >
            Soumission <span className="tab-indicator" id="tab-ind-submission" />
          </button>
          <button
            type="button"
            className={`activity-tab-btn ${activeTab === "planning" ? "active" : ""}`}
            onClick={() => handleSelectTab("planning")}
          >
            Planification <span className="tab-indicator" id="tab-ind-planning" />
          </button>
          <button
            type="button"
            className={`activity-tab-btn ${activeTab === "billing" ? "active" : ""}`}
            onClick={() => handleSelectTab("billing")}
          >
            Facturation <span className="tab-indicator" id="tab-ind-billing" />
          </button>
          <button
            type="button"
            className={`activity-tab-btn ${activeTab === "supporting-docs" ? "active" : ""}`}
            onClick={() => handleSelectTab("supporting-docs")}
          >
            Pièces justificatives
          </button>
          <button
            type="button"
            className={`activity-tab-btn ${activeTab === "history" ? "active" : ""}`}
            onClick={() => handleSelectTab("history")}
          >
            Historique
          </button>
          <button
            type="button"
            className={`activity-tab-btn ${activeTab === "notes" ? "active" : ""}`}
            onClick={() => handleSelectTab("notes")}
          >
            Notes <span className="tab-indicator" id="tab-ind-notes" />
          </button>
        </div>

        {/* Drawer Content Form Shell */}
        <div className="drawer-content">
          <form id="activity-form" onSubmit={e => e.preventDefault()} onInput={handleFormInput} onChange={handleFormChange}>
            <input type="hidden" id="form-activity-internal-id" value={activityId} />

            {/* TAB: Formulaire */}
            <div id="activity-tab-panel-form" className={`activity-tab-panel ${activeTab === "form" ? "active" : ""}`}>
              <div style={{ marginBottom: "16px", fontSize: "0.85rem", color: "var(--text-muted)" }}>
                Liez le formulaire PDF rempli pour cette réservation afin de pouvoir le consulter en tout temps.
              </div>
              <div className="distribution-section">
                <div className="distribution-header">
                  <span className="field-label">Formulaire de réservation</span>
                </div>
                <div id="form-file-status" className="file-link-status" />
              </div>
              <div id="form-pdf-preview" style={{ marginTop: "20px" }} />
            </div>

            {/* TAB: Pièces justificatives */}
            <div
              id="activity-tab-panel-supporting-docs"
              className={`activity-tab-panel ${activeTab === "supporting-docs" ? "active" : ""}`}
            >
              <div style={{ marginBottom: "16px", fontSize: "0.85rem", color: "var(--text-muted)" }}>
                Liez un dossier contenant les pièces justificatives de cette activité (factures, reçus, etc.) afin de les consulter en tout temps.
              </div>
              <div className="distribution-section">
                <div className="distribution-header">
                  <span className="field-label">Dossier de pièces justificatives</span>
                </div>
                <div id="supporting-docs-status" />
              </div>
            </div>

            {/* TAB: Soumission et contrat */}
            <div id="activity-tab-panel-submission" className={`activity-tab-panel ${activeTab === "submission" ? "active" : ""}`}>
              <div className="form-group" id="activity-mode-group">
                <span className="field-label" id="activity-mode-toggle-label">Mode</span>
                <div id="activity-mode-toggle" className="pill-toggle-group" role="group" aria-labelledby="activity-mode-toggle-label">
                  <button type="button" className="pill-toggle" data-mode="estimation">Estimation</button>
                  <button type="button" className="pill-toggle" data-mode="soumission">Soumission</button>
                </div>
              </div>

              {/* Informations générales */}
              <details className="form-accordion-section" id="accordion-section-general" open>
                <summary className="form-accordion-summary">
                  <span className="form-accordion-check" id="accordion-check-general" />
                  <span>Informations générales</span>
                </summary>
                <div className="form-accordion-content">
                  <div className="form-group-row">
                    <div className="form-group">
                      <label htmlFor="form-activity-id" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        Numéro d'activité <span className="badge badge-auto">Auto</span>
                      </label>
                      <input type="text" id="form-activity-id" className="form-input input-auto" placeholder="Généré automatiquement" disabled />
                    </div>
                    <div className="form-group">
                      <label htmlFor="form-activity-coba">Références COBA collégial</label>
                      <input type="text" id="form-activity-coba" className="form-input" placeholder="Ex: 123456; 789012" />
                    </div>
                  </div>

                  <div className="form-group-row">
                    <div className="form-group">
                      <label htmlFor="form-activity-name">Nom de l'activité *</label>
                      <input type="text" id="form-activity-name" className="form-input" required placeholder="Ex: Réunion SCOUTS" />
                    </div>
                    <div className="form-group estimation-hide">
                      <label htmlFor="form-activity-attendees">Nombre de personnes attendues</label>
                      <input type="number" id="form-activity-attendees" className="form-input" min="0" placeholder="Ex: 50" />
                    </div>
                  </div>

                  <div className="form-group estimation-hide">
                    <label htmlFor="form-activity-description">Description de l'activité</label>
                    <textarea id="form-activity-description" className="form-input" rows={2} placeholder="Décrivez l'activité..." />
                  </div>
                </div>
              </details>

              {/* Responsable de l'activité */}
              <details className="form-accordion-section estimation-hide" id="accordion-section-manager">
                <summary className="form-accordion-summary">
                  <span className="form-accordion-check" id="accordion-check-manager" />
                  <span>Responsable de l'activité</span>
                </summary>
                <div className="form-accordion-content">
                  <div className="form-group-row">
                    <div className="form-group">
                      <label htmlFor="form-activity-manager-firstname">Prénom</label>
                      <input type="text" id="form-activity-manager-firstname" className="form-input" placeholder="Prénom" />
                    </div>
                    <div className="form-group">
                      <label htmlFor="form-activity-manager-lastname">Nom</label>
                      <input type="text" id="form-activity-manager-lastname" className="form-input" placeholder="Nom" />
                    </div>
                  </div>
                  <div className="form-group-row">
                    <div className="form-group">
                      <label htmlFor="form-activity-manager-type">Fonction</label>
                      <select id="form-activity-manager-type" className="select-input" style={{ padding: "10px 14px" }}>
                        <option value="">Sélectionner...</option>
                        <option value="employe">Employé</option>
                        <option value="etudiant">Étudiant</option>
                        <option value="externe">Externe</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label htmlFor="form-activity-manager-phone">Numéro de téléphone</label>
                      <input type="tel" id="form-activity-manager-phone" className="form-input" placeholder="Ex: 514-555-1234" />
                    </div>
                  </div>
                  <div className="form-group">
                    <label htmlFor="form-activity-manager-email">Courriel</label>
                    <input type="email" id="form-activity-manager-email" className="form-input" placeholder="nom@exemple.com" />
                  </div>

                  <div id="form-activity-manager-external-group" style={{ display: "none" }}>
                    <div className="form-group-row">
                      <div className="form-group">
                        <label htmlFor="form-activity-manager-company">Nom de l'entreprise</label>
                        <input type="text" id="form-activity-manager-company" className="form-input" placeholder="Ex: Entreprise inc." />
                      </div>
                      <div className="form-group">
                        <label htmlFor="form-activity-manager-coba-client-number">Numéro de client (COBA Finance)</label>
                        <input type="text" id="form-activity-manager-coba-client-number" className="form-input" placeholder="Ex: 12345" />
                      </div>
                    </div>
                    <div className="form-group">
                      <label htmlFor="form-activity-manager-address">Adresse</label>
                      <input type="text" id="form-activity-manager-address" className="form-input" placeholder="Ex: 123 rue Principale" />
                    </div>
                    <div className="form-group-row">
                      <div className="form-group">
                        <label htmlFor="form-activity-manager-city">Ville</label>
                        <input type="text" id="form-activity-manager-city" className="form-input" placeholder="Ex: Montréal" />
                      </div>
                      <div className="form-group">
                        <label htmlFor="form-activity-manager-province">Province</label>
                        <input type="text" id="form-activity-manager-province" className="form-input" placeholder="Ex: QC" />
                      </div>
                    </div>
                    <div className="form-group">
                      <label htmlFor="form-activity-manager-postal-code">Code postal</label>
                      <input type="text" id="form-activity-manager-postal-code" className="form-input" placeholder="Ex: H1A 1A1" />
                    </div>
                  </div>
                </div>
              </details>

              {/* Responsable de la facturation */}
              <details className="form-accordion-section estimation-hide" id="accordion-section-billing">
                <summary className="form-accordion-summary">
                  <span className="form-accordion-check" id="accordion-check-billing" />
                  <span>Responsable de la facturation</span>
                </summary>
                <div className="form-accordion-content">
                  <div className="form-group form-checkbox-group">
                    <label className="form-checkbox-label">
                      <input type="checkbox" id="form-activity-responsable-same-as-manager" />
                      <span>Même personne que le responsable de l'activité</span>
                    </label>
                  </div>
                  <div className="form-group-row">
                    <div className="form-group">
                      <label htmlFor="form-activity-responsable-firstname">Prénom du responsable</label>
                      <input type="text" id="form-activity-responsable-firstname" className="form-input" placeholder="Prénom" />
                    </div>
                    <div className="form-group">
                      <label htmlFor="form-activity-responsable-lastname">Nom du responsable</label>
                      <input type="text" id="form-activity-responsable-lastname" className="form-input" placeholder="Nom" />
                    </div>
                  </div>

                  <div className="form-group">
                    <label htmlFor="form-activity-client-type">Client interne ou externe</label>
                    <select id="form-activity-client-type" className="select-input" style={{ padding: "10px 14px" }}>
                      <option value="">Sélectionner...</option>
                      <option value="interne">Interne</option>
                      <option value="externe">Externe</option>
                    </select>
                  </div>

                  <div className="form-group" id="form-activity-dept-group">
                    <label htmlFor="form-activity-dept">Département</label>
                    <select id="form-activity-dept" className="select-input" style={{ padding: "10px 14px" }} />
                  </div>

                  <div id="form-activity-responsable-external-group" style={{ display: "none" }}>
                    <div className="form-group">
                      <label htmlFor="form-activity-responsable-address">Adresse</label>
                      <input type="text" id="form-activity-responsable-address" className="form-input" placeholder="Ex: 123 rue Principale" />
                    </div>
                    <div className="form-group-row">
                      <div className="form-group">
                        <label htmlFor="form-activity-responsable-city">Ville</label>
                        <input type="text" id="form-activity-responsable-city" className="form-input" placeholder="Ex: Montréal" />
                      </div>
                      <div className="form-group">
                        <label htmlFor="form-activity-responsable-province">Province</label>
                        <input type="text" id="form-activity-responsable-province" className="form-input" placeholder="Ex: QC" />
                      </div>
                    </div>
                    <div className="form-group">
                      <label htmlFor="form-activity-responsable-postal-code">Code postal</label>
                      <input type="text" id="form-activity-responsable-postal-code" className="form-input" placeholder="Ex: H1A 1A1" />
                    </div>
                  </div>
                </div>
              </details>

              {/* Réservations de salle */}
              <details className="form-accordion-section" id="accordion-section-rooms">
                <summary className="form-accordion-summary">
                  <span className="form-accordion-check" id="accordion-check-rooms" />
                  <span>Réservation de salles</span>
                </summary>
                <div className="form-accordion-content">
                  <div id="form-activity-reservations" />
                  <div id="form-activity-room-conflicts" style={{ display: "none", marginTop: "8px", marginBottom: "4px" }} />
                  <div style={{ marginTop: "8px", marginBottom: "12px" }}>
                    <button type="button" id="add-reservation-btn" className="btn btn-secondary" style={{ padding: "6px 12px", fontSize: "0.8rem" }}>
                      + Ajouter une réservation
                    </button>
                  </div>
                </div>
              </details>

              {/* Type d'événements */}
              <details className="form-accordion-section estimation-hide" id="accordion-section-eventtype">
                <summary className="form-accordion-summary">
                  <span className="form-accordion-check" id="accordion-check-eventtype" />
                  <span>Type d'événements</span>
                </summary>
                <div className="form-accordion-content">
                  <div className="form-group">
                    <label htmlFor="form-activity-event-type">Type d'événement</label>
                    <select id="form-activity-event-type" className="select-input" style={{ padding: "10px 14px" }} />
                  </div>
                  <div className="form-group" id="form-activity-event-type-other-group" style={{ display: "none" }}>
                    <label htmlFor="form-activity-event-type-other">Précisez le type d'événement</label>
                    <input type="text" id="form-activity-event-type-other" className="form-input" placeholder="Précisez..." />
                  </div>
                </div>
              </details>

              {/* Estimation des coûts */}
              <details className="form-accordion-section" id="accordion-section-financial-summary">
                <summary className="form-accordion-summary">
                  <span className="form-accordion-check-spacer" />
                  <span>Estimation des coûts</span>
                </summary>
                <div className="form-accordion-content">
                  <div id="submission-financial-summary" className="financial-summary" />
                </div>
              </details>

              {/* Soumission */}
              <details className="form-accordion-section estimation-hide" id="accordion-section-submission-file">
                <summary className="form-accordion-summary">
                  <span className="form-accordion-check" id="accordion-check-submission-file" />
                  <span>Soumission</span>
                </summary>
                <div className="form-accordion-content">
                  <div id="submission-file-status" className="file-link-status" />
                  <div id="submission-xlsx-preview" style={{ marginTop: "20px", display: "none" }} />
                </div>
              </details>

              {/* Contrat */}
              <details className="form-accordion-section estimation-hide" id="accordion-section-contract-file">
                <summary className="form-accordion-summary">
                  <span className="form-accordion-check" id="accordion-check-contract-file" />
                  <span>Contrat</span>
                </summary>
                <div className="form-accordion-content">
                  <div id="contract-file-status" className="file-link-status" />
                  <div id="contract-xlsx-preview" style={{ marginTop: "20px", display: "none" }} />
                </div>
              </details>
            </div>

            {/* TAB: Planification */}
            <div id="activity-tab-panel-planning" className={`activity-tab-panel ${activeTab === "planning" ? "active" : ""}`}>
              <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "16px" }}>
                <div id="planning-progress-wrapper" style={{ flexGrow: 1, display: "flex", alignItems: "center", gap: "10px" }}>
                  <div id="planning-progress-bar-container" style={{ flexGrow: 1 }} />
                  <span id="planning-progress-label" style={{ fontSize: "0.85rem", color: "var(--text-muted)", whiteSpace: "nowrap" }} />
                </div>
              </div>
              <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
                <button type="button" id="generate-planning-tasks-btn" className="btn btn-secondary">
                  Générer les tâches automatiquement
                </button>
                <button type="button" id="add-planning-task-btn" className="btn btn-secondary">
                  + Ajouter une tâche
                </button>
              </div>
              <div id="planning-tasks-list" className="distribution-list" />
            </div>

            {/* TAB: Facturation */}
            <div id="activity-tab-panel-billing" className={`activity-tab-panel ${activeTab === "billing" ? "active" : ""}`}>
              <div className="distribution-section">
                <div className="distribution-header">
                  <span className="field-label">
                    Ventilation par compte de revenus (avec Numéro Facture, RI ou Encaissement par compte)
                    <span className="help-tooltip-trigger" title="Chaque ligne indique quel montant va dans quel compte comptable.">
                      ?
                    </span>
                  </span>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button type="button" id="generate-billing-lines-btn" className="btn btn-secondary" style={{ padding: "6px 12px", fontSize: "0.8rem" }}>
                      Générer les lignes de facturation
                    </button>
                    <button type="button" id="form-add-distribution-btn" className="btn btn-secondary" style={{ padding: "6px 12px", fontSize: "0.8rem" }}>
                      + Ajouter
                    </button>
                  </div>
                </div>
                <div id="form-distribution-list" className="distribution-list" />
                <div className="distribution-total">
                  <span>Total saisi</span>
                  <span id="form-distribution-total-val">0,00 $</span>
                </div>
                <div style={{ textAlign: "right" }}>
                  <span id="form-distribution-total-warning" style={{ display: "none", color: "var(--warning-text)", fontSize: "0.8rem" }} />
                </div>
              </div>

              <div className="distribution-section" id="billing-bar-revenue-section" style={{ display: "none" }}>
                <div className="distribution-header">
                  <span className="field-label">Revenus du bar</span>
                  <button type="button" id="form-add-bar-revenue-btn" className="btn btn-secondary" style={{ padding: "6px 12px", fontSize: "0.8rem" }}>
                    + Ajouter une ligne de bar
                  </button>
                </div>
                <div id="form-bar-revenue-list" className="distribution-list" />
                <div className="distribution-total">
                  <span>Total des revenus du bar</span>
                  <span id="form-bar-revenue-total-val">0,00 $</span>
                </div>
              </div>

              <div className="distribution-section">
                <div className="distribution-header">
                  <span className="field-label">État de la facturation</span>
                </div>
                <div id="billing-state-status" className="file-link-status" />
              </div>
            </div>

            {/* TAB: Historique */}
            <div id="activity-tab-panel-history" className={`activity-tab-panel ${activeTab === "history" ? "active" : ""}`}>
              <div style={{ marginBottom: "16px", fontSize: "0.85rem", color: "var(--text-muted)" }}>
                Consultez les versions enregistrées de cette activité et restaurez l'une d'elles en cas de besoin.
              </div>
              <div id="activity-history-list" className="history-list" />
            </div>

            {/* TAB: Notes */}
            <div id="activity-tab-panel-notes" className={`activity-tab-panel ${activeTab === "notes" ? "active" : ""}`}>
              <div className="form-group">
                <label htmlFor="form-activity-notes">Notes</label>
                <textarea id="form-activity-notes" className="form-input" rows={12} placeholder="Notes concernant cette activité..." />
              </div>
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="drawer-footer">
          {calendarReturn && (
            <button
              type="button"
              id="activity-drawer-back-to-calendar-btn"
              className="btn btn-secondary"
              style={{ marginRight: "auto" }}
              onClick={() => {
                handleClose();
                import("../calendar-view.tsx").then(m => m.reopenCalendarModal(calendarReturn));
              }}
            >
              <svg viewBox="0 0 24 24" style={{ width: "16px", height: "16px", fill: "currentColor", marginRight: "6px", verticalAlign: "-3px" }}>
                <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
              </svg>
              Retour au calendrier
            </button>
          )}
          {isDraft && (
            <button
              type="button"
              id="activity-drawer-submit"
              className="btn btn-primary"
              onClick={() => {
                commitActivityPatch(activityId, (a: any) => {
                  a.mode = "soumission";
                });
                activitiesState.draftActivityId = null;
                handleClose();
                renderActivities();
              }}
            >
              Enregistrer
            </button>
          )}
        </div>
      </aside>
    </>
  );
};
