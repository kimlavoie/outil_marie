import { useState, useEffect } from "react";
import { appState, saveDatabaseOrRollback, getActiveServiceRate } from "../../state/state.ts";
import { showToast, generateUid, newRateVersionRow } from "../../utils/utils.ts";
import { requireNonEmpty } from "../../utils/validation.ts";
import { DeleteIcon, Modal, TarifsEditor, TarifRow } from "./common.tsx";

export function ServicesPanel({ active, openModal, bump }: { active: boolean; openModal: (id: string | null) => void; bump: () => void }) {
  const services = appState.settings.services || [];
  const deleteService = (id: string) => {
    const svc = services.find((s: { id: string }) => s.id === id);
    const serviceName = svc ? svc.name : "";
    if (!confirm(`Voulez-vous vraiment supprimer l'équipement "${serviceName}" ?`)) return;
    const prevServices = appState.settings.services;
    appState.settings.services = services.filter((s: { id: string }) => s.id !== id);
    saveDatabaseOrRollback(() => {
      appState.settings.services = prevServices;
    }, "La suppression n'a pas été enregistrée. Réessayez.").then(() => bump());
  };

  return (
    <div id="panel-services" className={`settings-panel${active ? " active" : ""}`}>
      <div className="settings-panel-header">
        <h3 className="settings-panel-title">Gestion des Équipements</h3>
        <button
          className="btn btn-primary btn-secondary"
          style={{ padding: "6px 12px", fontSize: "0.8rem" }}
          onClick={() => openModal(null)}
        >
          + Ajouter un équipement
        </button>
      </div>
      <div className="settings-list">
        {services.map((svc: { id: string; name: string; type: string; tarifs: { label: string }[] }) => {
          const tarifs = svc.tarifs || [];
          const currentRate = getActiveServiceRate(svc, "");
          const unit = svc.type === "hourly" ? "$ / heure" : "$";
          const tarifNote = tarifs.length > 1 ? ` (${tarifs.length} tarifs)` : "";
          return (
            <div key={svc.id} className="settings-list-item" onClick={() => openModal(svc.id)}>
              <div className="settings-list-item-info">
                <span className="settings-list-item-code" style={{ fontFamily: "inherit" }}>
                  {svc.name}
                </span>
                <span className="settings-list-item-desc">
                  {currentRate.toFixed(2)} {unit}
                  {tarifNote}
                </span>
              </div>
              <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                <button className="btn-icon" title="Supprimer" style={{ color: "var(--danger)" }} onClick={() => deleteService(svc.id)}>
                  <DeleteIcon />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ServiceModal({ id, onClose, bump }: { id: string | null | undefined; onClose: () => void; bump: () => void }) {
  const isOpen = id !== undefined;
  const originalId = id || "";
  const [name, setName] = useState("");
  const [type, setType] = useState<"fixed" | "hourly">("fixed");
  const [tarifs, setTarifs] = useState<TarifRow[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    const services = appState.settings.services || [];
    const svc = originalId ? services.find((s: { id: string }) => s.id === originalId) : null;
    if (svc) {
      setName(svc.name);
      setType(svc.type || "fixed");
      setTarifs(
        (svc.tarifs || []).map((t: any) => ({
          key: generateUid("tarif-row"),
          label: t.label || "",
          gl_account_code: t.gl_account_code || "",
          rateRows: (t.rate_versions || []).map((v: any) => newRateVersionRow(v.effective_date, String(v.rate)))
        }))
      );
    } else {
      setName("");
      setType("fixed");
      setTarifs([{ key: generateUid("tarif-row"), label: "", gl_account_code: "", rateRows: [newRateVersionRow()] }]);
    }
  }, [isOpen, originalId]);

  const submit = () => {
    const serviceName = name.trim();
    const nameError = requireNonEmpty(serviceName, "Le nom de l'équipement est obligatoire.");
    if (nameError) {
      showToast(nameError, "warning");
      return;
    }

    let rateErrorMsg = "";
    const tarifsResult = tarifs.map(tarif => {
      const rateVersions: { id: string; effective_date: string; rate: number }[] = [];
      tarif.rateRows.forEach(row => {
        const dateStr = row.effective_date.trim();
        const rateStr = row.rate.trim();
        const rate = parseFloat(rateStr);
        if (!dateStr && !rateStr) return;
        if (!rateStr || isNaN(rate) || rate < 0) {
          rateErrorMsg = "Veuillez saisir un montant valide (supérieur ou égal à 0) pour chaque version.";
        } else if (dateStr && !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
          rateErrorMsg = "La date d'entrée en vigueur doit être au format AAAA-MM-JJ, ou vide.";
        } else {
          rateVersions.push({ id: generateUid("rv"), effective_date: dateStr, rate });
        }
      });
      return { id: generateUid("tarif"), label: tarif.label.trim(), gl_account_code: tarif.gl_account_code, rate_versions: rateVersions };
    });

    if (rateErrorMsg) {
      showToast(rateErrorMsg, "warning");
      return;
    }
    if (tarifsResult.length === 0 || tarifsResult.every(t => t.rate_versions.length === 0)) {
      showToast("Veuillez saisir au moins un tarif avec un montant.", "warning");
      return;
    }

    const services = appState.settings.services || [];
    const duplicate = services.some(
      (s: { name: string; id: string }) => s.name.toUpperCase() === serviceName.toUpperCase() && s.id !== originalId
    );
    if (duplicate) {
      showToast("Cet équipement existe déjà.", "warning");
      return;
    }

    const prevServices = [...services];
    if (originalId) {
      const idx = services.findIndex((s: { id: string }) => s.id === originalId);
      if (idx !== -1) {
        services[idx] = { id: originalId, name: serviceName, type, tarifs: tarifsResult };
      }
    } else {
      services.push({
        id: generateUid("service"),
        name: serviceName,
        type,
        tarifs: tarifsResult
      });
    }
    services.sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name));
    appState.settings.services = services;

    saveDatabaseOrRollback(() => {
      appState.settings.services = prevServices;
    }, "L'enregistrement de l'équipement a échoué. Réessayez.").then(saved => {
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
      id="service-modal"
      titleId="service-modal-title"
      title={originalId ? "Modifier l'équipement" : "Ajouter un équipement"}
      isOpen={isOpen}
      onClose={onClose}
      onSubmit={submit}
    >
      <div className="form-group">
        <label htmlFor="form-service-name">Nom de l'équipement</label>
        <input
          type="text"
          id="form-service-name"
          className="form-input"
          required
          placeholder="Ex: Location d'écran"
          value={name}
          onChange={e => setName(e.target.value)}
        />
      </div>
      <div className="form-group">
        <label htmlFor="form-service-type">Type de frais</label>
        <select
          id="form-service-type"
          className="select-input"
          value={type}
          onChange={e => setType(e.target.value as "fixed" | "hourly")}
        >
          <option value="fixed">Frais fixe</option>
          <option value="hourly">Frais horaire</option>
        </select>
      </div>
      <div className="distribution-section">
        <div className="distribution-header">
          <span className="field-label">Tarifs (compte budgétaire et historique de montants)</span>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: "6px 12px", fontSize: "0.8rem" }}
            onClick={() =>
              setTarifs([...tarifs, { key: generateUid("tarif-row"), label: "", gl_account_code: "", rateRows: [newRateVersionRow()] }])
            }
          >
            + Ajouter un tarif
          </button>
        </div>
        <TarifsEditor rows={tarifs} onChange={setTarifs} />
      </div>
    </Modal>
  );
}
