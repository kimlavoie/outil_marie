import { generateUid } from "../../utils/utils.ts";
import { DeleteIcon } from "./common.tsx";

export interface LinkedStaffRow {
  key: string;
  salaryId: string;
  count: string;
}
export interface LinkedFeeRow {
  key: string;
  desc: string;
  amount: string;
}
export interface LinkedTaskRow {
  key: string;
  desc: string;
}

// Rooms automatically booked alongside this room (e.g. an adjoining space that always comes with it).
export function LinkedRoomsSection({
  rooms,
  originalName,
  linkedRooms,
  toggleLinkedRoom
}: {
  rooms: { name: string }[];
  originalName: string;
  linkedRooms: string[];
  toggleLinkedRoom: (roomName: string) => void;
}) {
  return (
    <div className="distribution-section">
      <div className="distribution-header">
        <span className="field-label">Salles liées (réservées automatiquement avec cette salle)</span>
      </div>
      <div className="pill-toggle-group">
        {rooms
          .filter(r => r.name !== originalName)
          .map(r => (
            <button
              key={r.name}
              type="button"
              className={`pill-toggle${linkedRooms.includes(r.name) ? " active" : ""}`}
              onClick={() => toggleLinkedRoom(r.name)}
            >
              {r.name}
            </button>
          ))}
      </div>
    </div>
  );
}

// Staff automatically added to the reservation when this room is booked.
export function LinkedStaffSection({
  linkedStaff,
  setLinkedStaff,
  salaries
}: {
  linkedStaff: LinkedStaffRow[];
  setLinkedStaff: (rows: LinkedStaffRow[]) => void;
  salaries: { id: string; job: string }[];
}) {
  return (
    <div className="distribution-section">
      <div className="distribution-header">
        <span className="field-label">Personnel lié (ajouté automatiquement à la réservation)</span>
        <button
          type="button"
          className="btn btn-secondary"
          style={{ padding: "6px 12px", fontSize: "0.8rem" }}
          onClick={() => setLinkedStaff([...linkedStaff, { key: generateUid("linked-staff-row"), salaryId: "", count: "1" }])}
        >
          + Ajouter
        </button>
      </div>
      <div className="distribution-list">
        {linkedStaff.map((row, i) => (
          <div key={row.key} className="distribution-row">
            <select
              name={`${row.key}-salary`}
              className="select-input"
              aria-label="Emploi lié"
              style={{ padding: "8px 12px", fontSize: "0.85rem" }}
              value={row.salaryId}
              onChange={e => setLinkedStaff(linkedStaff.map((r, idx) => (idx === i ? { ...r, salaryId: e.target.value } : r)))}
            >
              <option value="">Choisir un emploi...</option>
              {salaries.map(s => (
                <option key={s.id} value={s.id}>
                  {s.job}
                </option>
              ))}
            </select>
            <input
              type="number"
              name={`${row.key}-count`}
              className="form-input"
              min={1}
              step={1}
              value={row.count}
              placeholder="Quantité"
              aria-label="Quantité de personnel"
              style={{ padding: "8px 12px", fontSize: "0.85rem" }}
              onChange={e => setLinkedStaff(linkedStaff.map((r, idx) => (idx === i ? { ...r, count: e.target.value } : r)))}
            />
            <div></div>
            <button type="button" className="btn-icon" onClick={() => setLinkedStaff(linkedStaff.filter((_, idx) => idx !== i))}>
              <DeleteIcon />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// Extra fees automatically added to the reservation when this room is booked.
export function LinkedFeesSection({
  linkedFees,
  setLinkedFees
}: {
  linkedFees: LinkedFeeRow[];
  setLinkedFees: (rows: LinkedFeeRow[]) => void;
}) {
  return (
    <div className="distribution-section">
      <div className="distribution-header">
        <span className="field-label">Frais liés (ajoutés automatiquement à la réservation)</span>
        <button
          type="button"
          className="btn btn-secondary"
          style={{ padding: "6px 12px", fontSize: "0.8rem" }}
          onClick={() => setLinkedFees([...linkedFees, { key: generateUid("linked-fee-row"), desc: "", amount: "" }])}
        >
          + Ajouter
        </button>
      </div>
      <div className="distribution-list">
        {linkedFees.map((row, i) => (
          <div key={row.key} className="distribution-row linked-fee-row">
            <input
              type="text"
              name={`${row.key}-desc`}
              className="form-input"
              value={row.desc}
              placeholder="Ex: Montage et démontage"
              aria-label="Description du frais lié"
              style={{ padding: "8px 12px", fontSize: "0.85rem" }}
              onChange={e => setLinkedFees(linkedFees.map((r, idx) => (idx === i ? { ...r, desc: e.target.value } : r)))}
            />
            <input
              type="number"
              name={`${row.key}-amount`}
              className="form-input"
              min={0}
              step={0.01}
              value={row.amount}
              placeholder="Montant $"
              aria-label="Montant du frais en dollars"
              style={{ padding: "8px 12px", fontSize: "0.85rem" }}
              onChange={e => setLinkedFees(linkedFees.map((r, idx) => (idx === i ? { ...r, amount: e.target.value } : r)))}
            />
            <button type="button" className="btn-icon" onClick={() => setLinkedFees(linkedFees.filter((_, idx) => idx !== i))}>
              <DeleteIcon />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// Planning tasks automatically generated for the activity manager when this room is booked.
export function LinkedTasksSection({
  linkedTasks,
  setLinkedTasks
}: {
  linkedTasks: LinkedTaskRow[];
  setLinkedTasks: (rows: LinkedTaskRow[]) => void;
}) {
  return (
    <div className="distribution-section">
      <div className="distribution-header">
        <span className="field-label">Tâches du gestionnaire liées (générées automatiquement en planification)</span>
        <button
          type="button"
          className="btn btn-secondary"
          style={{ padding: "6px 12px", fontSize: "0.8rem" }}
          onClick={() => setLinkedTasks([...linkedTasks, { key: generateUid("linked-task-row"), desc: "" }])}
        >
          + Ajouter
        </button>
      </div>
      <div className="distribution-list">
        {linkedTasks.map((row, i) => (
          <div key={row.key} className="distribution-row room-tarif-row" style={{ gridTemplateColumns: "1fr auto" }}>
            <input
              type="text"
              name={`${row.key}-desc`}
              className="form-input"
              value={row.desc}
              placeholder="Ex: Envoyer un courriel au responsable de la salle"
              aria-label="Description de la tâche liée"
              style={{ padding: "8px 12px", fontSize: "0.85rem" }}
              onChange={e => setLinkedTasks(linkedTasks.map((r, idx) => (idx === i ? { ...r, desc: e.target.value } : r)))}
            />
            <button type="button" className="btn-icon" onClick={() => setLinkedTasks(linkedTasks.filter((_, idx) => idx !== i))}>
              <DeleteIcon />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
