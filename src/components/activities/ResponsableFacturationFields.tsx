import type React from "react";

/**
 * ResponsableFacturationFields.tsx - The "Responsable de la facturation" accordion section of the
 * activity drawer's Soumission tab. Fully controlled by ActivityDrawer.tsx, which also owns the
 * "même personne que le responsable de l'activité" mirroring effect and the client-type lock
 * (both depend on ManagerFields' state too).
 */
export function ResponsableFacturationFields({
  responsableSameAsManager,
  onSameAsManagerChange,
  responsableFirstName,
  setResponsableFirstName,
  responsableLastName,
  setResponsableLastName,
  clientType,
  setClientType,
  lockClientType,
  responsableAddress,
  setResponsableAddress,
  responsableCity,
  setResponsableCity,
  responsableProvince,
  setResponsableProvince,
  responsablePostalCode,
  onResponsablePostalCodeChange
}: {
  responsableSameAsManager: boolean;
  onSameAsManagerChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  responsableFirstName: string;
  setResponsableFirstName: (v: string) => void;
  responsableLastName: string;
  setResponsableLastName: (v: string) => void;
  clientType: string;
  setClientType: (v: string) => void;
  lockClientType: boolean;
  responsableAddress: string;
  setResponsableAddress: (v: string) => void;
  responsableCity: string;
  setResponsableCity: (v: string) => void;
  responsableProvince: string;
  setResponsableProvince: (v: string) => void;
  responsablePostalCode: string;
  onResponsablePostalCodeChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <details className="form-accordion-section estimation-hide" id="accordion-section-billing">
      <summary className="form-accordion-summary">
        <span className="form-accordion-check" id="accordion-check-billing" />
        <span>Responsable de la facturation</span>
      </summary>
      <div className="form-accordion-content">
        <div className="form-group form-checkbox-group">
          <label className="form-checkbox-label">
            <input
              type="checkbox"
              id="form-activity-responsable-same-as-manager"
              checked={responsableSameAsManager}
              onChange={onSameAsManagerChange}
            />
            <span>Même personne que le responsable de l'activité</span>
          </label>
        </div>
        <div className="form-group-row">
          <div className="form-group">
            <label htmlFor="form-activity-responsable-firstname">Prénom</label>
            <input
              type="text"
              id="form-activity-responsable-firstname"
              className={`form-input${responsableSameAsManager ? " form-input-readonly" : ""}`}
              placeholder="Prénom"
              readOnly={responsableSameAsManager}
              value={responsableFirstName}
              onChange={e => setResponsableFirstName(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="form-activity-responsable-lastname">Nom</label>
            <input
              type="text"
              id="form-activity-responsable-lastname"
              className={`form-input${responsableSameAsManager ? " form-input-readonly" : ""}`}
              placeholder="Nom"
              readOnly={responsableSameAsManager}
              value={responsableLastName}
              onChange={e => setResponsableLastName(e.target.value)}
            />
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="form-activity-client-type">Client interne ou externe</label>
          <select
            id="form-activity-client-type"
            className={`select-input${lockClientType ? " form-input-readonly" : ""}`}
            style={{ padding: "10px 14px" }}
            disabled={lockClientType}
            value={clientType}
            onChange={e => setClientType(e.target.value)}
          >
            <option value="">Sélectionner...</option>
            <option value="interne">Interne</option>
            <option value="externe">Externe</option>
          </select>
        </div>

        <div className="form-group" id="form-activity-dept-group" style={{ display: clientType === "externe" ? "none" : "block" }}>
          <label htmlFor="form-activity-dept">Département</label>
          <select id="form-activity-dept" className="select-input" style={{ padding: "10px 14px" }} />
        </div>

        <div id="form-activity-responsable-external-group" style={{ display: clientType === "externe" ? "block" : "none" }}>
          <div className="form-group">
            <label htmlFor="form-activity-responsable-address">Adresse</label>
            <input
              type="text"
              id="form-activity-responsable-address"
              className={`form-input${responsableSameAsManager ? " form-input-readonly" : ""}`}
              placeholder="Ex: 123 rue Principale"
              readOnly={responsableSameAsManager}
              value={responsableAddress}
              onChange={e => setResponsableAddress(e.target.value)}
            />
          </div>
          <div className="form-group-row">
            <div className="form-group">
              <label htmlFor="form-activity-responsable-city">Ville</label>
              <input
                type="text"
                id="form-activity-responsable-city"
                className={`form-input${responsableSameAsManager ? " form-input-readonly" : ""}`}
                placeholder="Ex: Montréal"
                readOnly={responsableSameAsManager}
                value={responsableCity}
                onChange={e => setResponsableCity(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label htmlFor="form-activity-responsable-province">Province</label>
              <input
                type="text"
                id="form-activity-responsable-province"
                className={`form-input${responsableSameAsManager ? " form-input-readonly" : ""}`}
                placeholder="Ex: QC"
                readOnly={responsableSameAsManager}
                value={responsableProvince}
                onChange={e => setResponsableProvince(e.target.value)}
              />
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="form-activity-responsable-postal-code">Code postal</label>
            <input
              type="text"
              id="form-activity-responsable-postal-code"
              className={`form-input${responsableSameAsManager ? " form-input-readonly" : ""}`}
              placeholder="Ex: H1A 1A1"
              readOnly={responsableSameAsManager}
              value={responsablePostalCode}
              onChange={onResponsablePostalCodeChange}
            />
          </div>
        </div>
      </div>
    </details>
  );
}
