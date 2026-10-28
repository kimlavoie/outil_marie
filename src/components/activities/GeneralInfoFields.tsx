/**
 * GeneralInfoFields.tsx - The "Informations générales" accordion section of the activity drawer's
 * Soumission tab (numéro d'activité, références COBA, nom, nombre de personnes, description).
 * Fully controlled by ActivityDrawer.tsx, which owns this state alongside the Manager/Responsable
 * field groups since autoSaveActivityForm() reads all of them together off the DOM.
 */
export function GeneralInfoFields({
  coba,
  setCoba,
  name,
  setName,
  attendeesCount,
  setAttendeesCount,
  description,
  setDescription
}: {
  coba: string;
  setCoba: (v: string) => void;
  name: string;
  setName: (v: string) => void;
  attendeesCount: string;
  setAttendeesCount: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
}) {
  return (
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
            <input
              type="text"
              id="form-activity-coba"
              className="form-input"
              placeholder="Ex: 123456; 789012"
              value={coba}
              onChange={e => setCoba(e.target.value)}
            />
          </div>
        </div>

        <div className="form-group-row">
          <div className="form-group">
            <label htmlFor="form-activity-name">Nom de l'activité *</label>
            <input
              type="text"
              id="form-activity-name"
              className="form-input"
              required
              placeholder="Ex: Réunion SCOUTS"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>
          <div className="form-group estimation-hide">
            <label htmlFor="form-activity-attendees">Nombre de personnes attendues</label>
            <input
              type="number"
              id="form-activity-attendees"
              className="form-input"
              min="0"
              placeholder="Ex: 50"
              value={attendeesCount}
              onChange={e => setAttendeesCount(e.target.value)}
            />
          </div>
        </div>

        <div className="form-group estimation-hide">
          <label htmlFor="form-activity-description">Description de l'activité</label>
          <textarea
            id="form-activity-description"
            className="form-input"
            rows={2}
            placeholder="Décrivez l'activité..."
            value={description}
            onChange={e => setDescription(e.target.value)}
          />
        </div>
      </div>
    </details>
  );
}
