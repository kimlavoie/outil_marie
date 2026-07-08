import { useState, useEffect } from "react";
import { appState, saveDatabase, getActiveServiceRate } from "../../state/state.ts";
import { showToast, generateUid, RateVersionRow, newRateVersionRow } from "../../utils/utils.ts";
import { requireNonEmpty } from "../../utils/validation.ts";
import { EditIcon, DeleteIcon, Modal, RateVersionsEditor, BillingAccountsEditor, BillingAccountRow } from "./common.tsx";

export function ServicesPanel({ active, openModal, bump }: { active: boolean; openModal: (id: string | null) => void; bump: () => void }) {
  const services = appState.settings.services || [];
  const deleteService = (id: string) => {
    const svc = services.find((s: { id: string }) => s.id === id);
    const serviceName = svc ? svc.name : "";
    if (!confirm(`Voulez-vous vraiment supprimer l'équipement "${serviceName}" ?`)) return;
    appState.settings.services = services.filter((s: { id: string }) => s.id !== id);
    saveDatabase();
    bump();
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
        {services.map((svc: { id: string; name: string; type: string; rate_versions: unknown[] }) => {
          const currentRate = getActiveServiceRate(svc, "");
          const versionCount = (svc.rate_versions || []).length;
          const versionNote = versionCount > 1 ? ` (${versionCount} versions)` : "";
          const unit = svc.type === "hourly" ? "$ / heure" : "$";
          return (
            <div key={svc.id} className="settings-list-item">
              <div className="settings-list-item-info">
                <span className="settings-list-item-code" style={{ fontFamily: "inherit" }}>
                  {svc.name}
                </span>
                <span className="settings-list-item-desc">
                  {currentRate.toFixed(2)} {unit}
                  {versionNote}
                </span>
              </div>
              <div className="flex gap-2">
                <button className="btn-icon" title="Modifier" onClick={() => openModal(svc.id)}>
                  <EditIcon />
                </button>
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
  const [type, setType] = useState("fixed");
  const [billingAccounts, setBillingAccounts] = useState<BillingAccountRow[]>([]);
  const [rows, setRows] = useState<RateVersionRow[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    const services = appState.settings.services || [];
    const svc = originalId ? services.find((s: { id: string }) => s.id === originalId) : null;
    if (svc) {
      setName(svc.name);
      setType(svc.type || "fixed");
      setBillingAccounts(
        (svc.billing_accounts || []).map((a: { label: string; gl_account_code: string }) => ({
          key: generateUid("billing-row"),
          label: a.label || "",
          gl_account_code: a.gl_account_code || ""
        }))
      );
      setRows(
        (svc.rate_versions || []).map((v: { effective_date: string; rate: number }) => newRateVersionRow(v.effective_date, String(v.rate)))
      );
    } else {
      setName("");
      setType("fixed");
      setBillingAccounts([]);
      setRows([newRateVersionRow()]);
    }
  }, [isOpen, originalId]);

  const submit = () => {
    const serviceName = name.trim();
    const nameError = requireNonEmpty(serviceName, "Le nom de l'équipement est obligatoire.");
    if (nameError) {
      showToast(nameError, "warning");
      return;
    }

    const rateVersions: { id: string; effective_date: string; rate: number }[] = [];
    let rateErrorMsg = "";
    rows.forEach(row => {
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

    if (rateErrorMsg) {
      showToast(rateErrorMsg, "warning");
      return;
    }
    if (rateVersions.length === 0) {
      showToast("Veuillez saisir au moins un montant.", "warning");
      return;
    }

    const billingAccountsResult = billingAccounts
      .filter(a => a.gl_account_code)
      .map(a => ({ id: generateUid("billing"), label: a.label.trim(), gl_account_code: a.gl_account_code }));

    const services = appState.settings.services || [];
    const duplicate = services.some(
      (s: { name: string; id: string }) => s.name.toUpperCase() === serviceName.toUpperCase() && s.id !== originalId
    );
    if (duplicate) {
      showToast("Cet équipement existe déjà.", "warning");
      return;
    }

    if (originalId) {
      const idx = services.findIndex((s: { id: string }) => s.id === originalId);
      if (idx !== -1) {
        services[idx] = { id: originalId, name: serviceName, type, billing_accounts: billingAccountsResult, rate_versions: rateVersions };
      }
    } else {
      services.push({
        id: generateUid("service"),
        name: serviceName,
        type,
        billing_accounts: billingAccountsResult,
        rate_versions: rateVersions
      });
    }
    services.sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name));
    appState.settings.services = services;

    saveDatabase();
    onClose();
    bump();
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
        <select id="form-service-type" className="select-input" value={type} onChange={e => setType(e.target.value)}>
          <option value="fixed">Frais fixe</option>
          <option value="hourly">Frais horaire</option>
        </select>
      </div>
      <div className="distribution-section">
        <div className="distribution-header">
          <span className="field-label">Comptes budgétaires (optionnel, pour la facturation)</span>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: "6px 12px", fontSize: "0.8rem" }}
            onClick={() => setBillingAccounts([...billingAccounts, { key: generateUid("billing-row"), label: "", gl_account_code: "" }])}
          >
            + Ajouter un compte
          </button>
        </div>
        <BillingAccountsEditor rows={billingAccounts} onChange={setBillingAccounts} />
      </div>
      <div className="distribution-section">
        <div className="distribution-header">
          <span className="field-label">Historique des tarifs (date d'entrée en vigueur et montant)</span>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: "6px 12px", fontSize: "0.8rem" }}
            onClick={() => setRows([...rows, newRateVersionRow()])}
          >
            + Ajouter une version
          </button>
        </div>
        <RateVersionsEditor rows={rows} onChange={setRows} withOvertime={false} />
      </div>
    </Modal>
  );
}
