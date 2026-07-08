import { useState, useEffect } from "react";
import { appState, saveDatabase } from "../../state/state.js";
import { showToast } from "../../utils/utils.ts";
import { requireNonEmpty } from "../../utils/validation.ts";
import { populateDropdowns } from "../../navigation.js";
import { EditIcon, DeleteIcon, Modal } from "./common.tsx";

export function DepartmentsPanel({
  active,
  openModal,
  bump
}: {
  active: boolean;
  openModal: (name: string | null) => void;
  bump: () => void;
}) {
  const deleteDept = (name: string) => {
    if (!confirm(`Voulez-vous vraiment supprimer le département "${name}" ?`)) return;
    appState.settings.departments = appState.settings.departments.filter((d: string) => d !== name);
    saveDatabase();
    populateDropdowns();
    bump();
  };

  return (
    <div id="panel-departments" className={`settings-panel${active ? " active" : ""}`}>
      <div className="settings-panel-header">
        <h3 className="settings-panel-title">Départements pour Facturation</h3>
        <button
          className="btn btn-primary btn-secondary"
          style={{ padding: "6px 12px", fontSize: "0.8rem" }}
          onClick={() => openModal(null)}
        >
          + Ajouter un département
        </button>
      </div>
      <div className="settings-list">
        {appState.settings.departments.map((dept: string) => (
          <div key={dept} className="settings-list-item">
            <div className="settings-list-item-info">
              <span className="settings-list-item-code" style={{ fontFamily: "inherit" }}>
                {dept}
              </span>
            </div>
            <div className="flex gap-2">
              <button className="btn-icon" title="Modifier" onClick={() => openModal(dept)}>
                <EditIcon />
              </button>
              <button className="btn-icon" title="Supprimer" style={{ color: "var(--danger)" }} onClick={() => deleteDept(dept)}>
                <DeleteIcon />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DeptModal({ name, onClose, bump }: { name: string | null | undefined; onClose: () => void; bump: () => void }) {
  const isOpen = name !== undefined;
  const originalName = name || "";
  const [nameVal, setNameVal] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setNameVal(originalName);
  }, [isOpen, originalName]);

  const submit = () => {
    const newName = nameVal.trim();
    const nameError = requireNonEmpty(newName, "Le nom du département est obligatoire.");
    if (nameError) {
      showToast(nameError, "warning");
      return;
    }

    const duplicate = appState.settings.departments.some(
      (d: string) => d.toUpperCase() === newName.toUpperCase() && d.toUpperCase() !== originalName.toUpperCase()
    );
    if (duplicate) {
      showToast("Ce département existe déjà.", "warning");
      return;
    }

    if (originalName) {
      const idx = appState.settings.departments.findIndex((d: string) => d === originalName);
      if (idx !== -1) {
        appState.settings.departments[idx] = newName;
        appState.activities.forEach(act => {
          if (act.department === originalName) act.department = newName;
        });
      }
    } else {
      appState.settings.departments.push(newName);
    }

    appState.settings.departments.sort();
    saveDatabase();
    onClose();
    populateDropdowns();
    bump();
  };

  return (
    <Modal
      id="dept-modal"
      titleId="dept-modal-title"
      title={originalName ? "Modifier le département" : "Ajouter un département"}
      isOpen={isOpen}
      onClose={onClose}
      onSubmit={submit}
    >
      <div className="form-group">
        <label htmlFor="form-dept-name">Nom du département</label>
        <input
          type="text"
          id="form-dept-name"
          className="form-input"
          required
          placeholder="Ex: ACEECJ"
          value={nameVal}
          onChange={e => setNameVal(e.target.value)}
        />
      </div>
    </Modal>
  );
}
