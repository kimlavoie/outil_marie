import { useState, useEffect } from "react";
import { saveDatabaseOrRollback } from "../../state/state.ts";
import { getGlobalTasks, setGlobalTasks, addGlobalTask, replaceGlobalTaskAt, removeGlobalTaskById } from "../../state/settings-repository.ts";
import { showToast, generateUid } from "../../utils/utils.ts";
import { DeleteIcon, Modal } from "./common.tsx";

export function GlobalTasksPanel({
  active,
  openModal,
  bump
}: {
  active: boolean;
  openModal: (id: string | null) => void;
  bump: () => void;
}) {
  const globalTasks = getGlobalTasks() || [];
  const deleteGlobalTask = (id: string) => {
    if (!confirm("Voulez-vous vraiment supprimer cette tâche globale ?")) return;
    const prevGlobalTasks = getGlobalTasks();
    removeGlobalTaskById(id);
    saveDatabaseOrRollback(() => {
      setGlobalTasks(prevGlobalTasks);
    }, "La suppression n'a pas été enregistrée. Réessayez.").then(() => bump());
  };

  return (
    <div id="panel-global-tasks" className={`settings-panel${active ? " active" : ""}`}>
      <div className="settings-panel-header">
        <h3 className="settings-panel-title">Tâches globales de planification</h3>
        <button
          className="btn btn-primary btn-secondary"
          style={{ padding: "6px 12px", fontSize: "0.8rem" }}
          onClick={() => openModal(null)}
        >
          + Ajouter une tâche globale
        </button>
      </div>
      <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", margin: "0 0 12px" }}>
        Ces tâches sont ajoutées automatiquement à la liste de planification de chaque activité lors de l'insertion automatique des tâches.
      </p>
      <div className="settings-list">
        {globalTasks.map((t: { id: string; description: string }) => (
          <div key={t.id} className="settings-list-item" onClick={() => openModal(t.id)}>
            <div className="settings-list-item-info">
              <span className="settings-list-item-desc">{t.description}</span>
            </div>
            <div className="flex gap-2" onClick={e => e.stopPropagation()}>
              <button className="btn-icon" title="Supprimer" style={{ color: "var(--danger)" }} onClick={() => deleteGlobalTask(t.id)}>
                <DeleteIcon />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function GlobalTaskModal({ id, onClose, bump }: { id: string | null | undefined; onClose: () => void; bump: () => void }) {
  const isOpen = id !== undefined;
  const originalId = id || "";
  const [desc, setDesc] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    const task = originalId ? (getGlobalTasks() || []).find((t: { id: string }) => t.id === originalId) : null;
    setDesc(task ? task.description : "");
  }, [isOpen, originalId]);

  const submit = () => {
    const description = desc.trim();
    if (!description) {
      showToast("Veuillez saisir une description.", "warning");
      return;
    }

    const globalTasks = getGlobalTasks() || [];
    const prevGlobalTasks = [...globalTasks];
    if (originalId) {
      replaceGlobalTaskAt(originalId, { id: originalId, description });
    } else {
      addGlobalTask({ id: generateUid("global-task"), description });
    }

    saveDatabaseOrRollback(() => {
      setGlobalTasks(prevGlobalTasks);
    }, "L'enregistrement de la tâche a échoué. Réessayez.").then(saved => {
      if (!saved) {
        bump();
        return;
      }
      onClose();
      bump();
    });
  };

  return (
    <Modal
      id="global-task-modal"
      titleId="global-task-modal-title"
      title={originalId ? "Modifier la tâche globale" : "Ajouter une tâche globale"}
      isOpen={isOpen}
      onClose={onClose}
      onSubmit={submit}
    >
      <div className="form-group">
        <label htmlFor="form-global-task-desc">Description de la tâche</label>
        <input
          type="text"
          id="form-global-task-desc"
          className="form-input"
          required
          placeholder="Ex: Envoyer la confirmation au client"
          value={desc}
          onChange={e => setDesc(e.target.value)}
        />
      </div>
    </Modal>
  );
}
