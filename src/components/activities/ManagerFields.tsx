/**
 * ManagerFields.tsx - The "Responsable de l'activité" accordion section of the activity drawer's
 * Soumission tab. Fully controlled by ActivityDrawer.tsx: the "Responsable de la facturation"
 * section (ResponsableFacturationFields.tsx) mirrors these fields live while "même personne..."
 * is checked, and the client-type lock depends on managerType, so the parent needs this state
 * regardless.
 */
import type React from "react";

export function ManagerFields({
  managerFirstName,
  setManagerFirstName,
  managerLastName,
  setManagerLastName,
  managerType,
  setManagerType,
  managerPhone,
  onManagerPhoneChange,
  managerEmail,
  setManagerEmail,
  managerCompany,
  setManagerCompany,
  managerCobaClientNumber,
  setManagerCobaClientNumber,
  managerAddress,
  setManagerAddress,
  managerCity,
  setManagerCity,
  managerProvince,
  setManagerProvince,
  managerPostalCode,
  onManagerPostalCodeChange
}: {
  managerFirstName: string;
  setManagerFirstName: (v: string) => void;
  managerLastName: string;
  setManagerLastName: (v: string) => void;
  managerType: string;
  setManagerType: (v: string) => void;
  managerPhone: string;
  onManagerPhoneChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  managerEmail: string;
  setManagerEmail: (v: string) => void;
  managerCompany: string;
  setManagerCompany: (v: string) => void;
  managerCobaClientNumber: string;
  setManagerCobaClientNumber: (v: string) => void;
  managerAddress: string;
  setManagerAddress: (v: string) => void;
  managerCity: string;
  setManagerCity: (v: string) => void;
  managerProvince: string;
  setManagerProvince: (v: string) => void;
  managerPostalCode: string;
  onManagerPostalCodeChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <details className="form-accordion-section estimation-hide" id="accordion-section-manager">
      <summary className="form-accordion-summary">
        <span className="form-accordion-check" id="accordion-check-manager" />
        <span>Responsable de l'activité</span>
      </summary>
      <div className="form-accordion-content">
        <div className="form-group-row">
          <div className="form-group">
            <label htmlFor="form-activity-manager-firstname">Prénom</label>
            <input
              type="text"
              id="form-activity-manager-firstname"
              className="form-input"
              placeholder="Prénom"
              value={managerFirstName}
              onChange={e => setManagerFirstName(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="form-activity-manager-lastname">Nom</label>
            <input
              type="text"
              id="form-activity-manager-lastname"
              className="form-input"
              placeholder="Nom"
              value={managerLastName}
              onChange={e => setManagerLastName(e.target.value)}
            />
          </div>
        </div>
        <div className="form-group-row">
          <div className="form-group">
            <label htmlFor="form-activity-manager-type">Fonction</label>
            <select
              id="form-activity-manager-type"
              className="select-input"
              style={{ padding: "10px 14px" }}
              value={managerType}
              onChange={e => setManagerType(e.target.value)}
            >
              <option value="">Sélectionner...</option>
              <option value="employe">Employé</option>
              <option value="etudiant">Étudiant</option>
              <option value="externe">Externe</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="form-activity-manager-phone">Numéro de téléphone</label>
            <input
              type="tel"
              id="form-activity-manager-phone"
              className="form-input"
              placeholder="Ex: 514-555-1234"
              value={managerPhone}
              onChange={onManagerPhoneChange}
            />
          </div>
        </div>
        <div className="form-group">
          <label htmlFor="form-activity-manager-email">Courriel</label>
          <input
            type="email"
            id="form-activity-manager-email"
            className="form-input"
            placeholder="nom@exemple.com"
            value={managerEmail}
            onChange={e => setManagerEmail(e.target.value)}
          />
        </div>

        <div id="form-activity-manager-external-group" style={{ display: managerType === "externe" ? "block" : "none" }}>
          <div className="form-group-row">
            <div className="form-group">
              <label htmlFor="form-activity-manager-company">Nom de l'entreprise</label>
              <input
                type="text"
                id="form-activity-manager-company"
                className="form-input"
                placeholder="Ex: Entreprise inc."
                value={managerCompany}
                onChange={e => setManagerCompany(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label htmlFor="form-activity-manager-coba-client-number">Numéro de client (COBA Finance)</label>
              <input
                type="text"
                id="form-activity-manager-coba-client-number"
                className="form-input"
                placeholder="Ex: 12345"
                value={managerCobaClientNumber}
                onChange={e => setManagerCobaClientNumber(e.target.value)}
              />
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="form-activity-manager-address">Adresse</label>
            <input
              type="text"
              id="form-activity-manager-address"
              className="form-input"
              placeholder="Ex: 123 rue Principale"
              value={managerAddress}
              onChange={e => setManagerAddress(e.target.value)}
            />
          </div>
          <div className="form-group-row">
            <div className="form-group">
              <label htmlFor="form-activity-manager-city">Ville</label>
              <input
                type="text"
                id="form-activity-manager-city"
                className="form-input"
                placeholder="Ex: Montréal"
                value={managerCity}
                onChange={e => setManagerCity(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label htmlFor="form-activity-manager-province">Province</label>
              <input
                type="text"
                id="form-activity-manager-province"
                className="form-input"
                placeholder="Ex: QC"
                value={managerProvince}
                onChange={e => setManagerProvince(e.target.value)}
              />
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="form-activity-manager-postal-code">Code postal</label>
            <input
              type="text"
              id="form-activity-manager-postal-code"
              className="form-input"
              placeholder="Ex: H1A 1A1"
              value={managerPostalCode}
              onChange={onManagerPostalCodeChange}
            />
          </div>
        </div>
      </div>
    </details>
  );
}
