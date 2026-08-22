import React, { useState, useEffect } from "react";
import { requireNonEmpty } from "../../utils/validation.ts";
import { showToast } from "../../utils/utils.ts";
import { createActivity, createDraftActivity } from "../../activities/new-activity-modal.ts";
import { openActivityDrawer } from "../../activities/financials.ts";

let openSubscriber: ((intent: string) => void) | null = null;

export function isNewActivityModalSubscribed() {
  return openSubscriber !== null;
}

export function triggerOpenNewActivityModal(intent = "soumission") {
  if (openSubscriber) {
    openSubscriber(intent);
  }
}

export const NewActivityModal: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [intent, setIntent] = useState("soumission");
  const [name, setName] = useState("");

  useEffect(() => {
    openSubscriber = (intentVal: string) => {
      setIntent(intentVal);
      setName("");
      setIsOpen(true);
    };
    return () => {
      openSubscriber = null;
    };
  }, []);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    const nameError = requireNonEmpty(trimmed, "Veuillez saisir le nom de l'activité.");
    if (nameError) {
      showToast(nameError, "warning");
      return;
    }
    const id = intent === "estimation" ? createDraftActivity(trimmed) : createActivity(trimmed, "soumission");
    setIsOpen(false);
    openActivityDrawer(id);
  };

  return (
    <>
      <div className="modal-backdrop active" onClick={() => setIsOpen(false)} />
      <div className="modal active" role="dialog" aria-modal="true" aria-labelledby="new-activity-modal-title">
        <div className="modal-header">
          <h3 className="modal-title" id="new-activity-modal-title">
            {intent === "estimation" ? "Nouvelle estimation" : "Nouvelle activité"}
          </h3>
          <button type="button" className="btn-icon" aria-label="Fermer" onClick={() => setIsOpen(false)}>
            <svg viewBox="0 0 24 24" style={{ width: 18, height: 18, fill: "currentColor" }}>
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-content">
            <div className="form-group">
              <label htmlFor="form-new-activity-name">Nom de l'activité *</label>
              <input
                type="text"
                id="form-new-activity-name"
                className="form-input"
                required
                autoFocus
                placeholder="Ex: Réunion SCOUTS"
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={() => setIsOpen(false)}>
              Annuler
            </button>
            <button type="submit" className="btn btn-primary">
              Créer
            </button>
          </div>
        </form>
      </div>
    </>
  );
};
