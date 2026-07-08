import { useState, useEffect } from "react";
import { appState, saveDatabase } from "../../state/state.js";
import { showToast } from "../../utils/utils.ts";
import { populateDropdowns } from "../../navigation.js";
import { EditIcon, DeleteIcon, Modal } from "./common.tsx";

export function AccountsPanel({
  active,
  bump,
  openModal
}: {
  active: boolean;
  bump: () => void;
  openModal: (code: string | null) => void;
}) {
  const deleteAccount = (code: string) => {
    if (!confirm(`Voulez-vous vraiment supprimer le compte ${code} ? Les ventilations liées à ce compte seront effacées.`)) return;
    appState.settings.accounts = appState.settings.accounts.filter(a => a.code !== code);
    appState.activities.forEach(act => {
      act.distributions = act.distributions.filter((d: { account_code: string }) => d.account_code !== code);
    });
    saveDatabase();
    populateDropdowns();
    bump();
  };

  return (
    <div id="panel-accounts" className={`settings-panel${active ? " active" : ""}`}>
      <div className="settings-panel-header">
        <h3 className="settings-panel-title">Comptes de Grand Livre (Postes budgétaires)</h3>
        <button
          className="btn btn-primary btn-secondary"
          style={{ padding: "6px 12px", fontSize: "0.8rem" }}
          onClick={() => openModal(null)}
        >
          + Ajouter un compte
        </button>
      </div>
      <div className="settings-list">
        {appState.settings.accounts.map(acc => (
          <div key={acc.code} className="settings-list-item">
            <div className="settings-list-item-info">
              <span className="settings-list-item-code">{acc.code}</span>
              <span className="settings-list-item-desc">{acc.description}</span>
            </div>
            <div className="flex gap-2">
              <button className="btn-icon" title="Modifier" onClick={() => openModal(acc.code)}>
                <EditIcon />
              </button>
              <button className="btn-icon" title="Supprimer" style={{ color: "var(--danger)" }} onClick={() => deleteAccount(acc.code)}>
                <DeleteIcon />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AccountModal({ code, onClose, bump }: { code: string | null | undefined; onClose: () => void; bump: () => void }) {
  const isOpen = code !== undefined;
  const originalCode = code || "";
  const existing = originalCode ? appState.settings.accounts.find(a => a.code === originalCode) : null;
  const [codeVal, setCodeVal] = useState("");
  const [desc, setDesc] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setCodeVal(existing ? existing.code : "");
    setDesc(existing ? existing.description : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, originalCode]);

  const submit = () => {
    const newCode = codeVal.trim();
    const description = desc.trim();

    if (!newCode.match(/^\d{3}-\d{4}-\d{2}-\d{3}$/)) {
      showToast("Le code du compte doit respecter le format XXX-XXXX-XX-XXX (ex: 892-9020-00-849).", "warning");
      return;
    }
    if (!description) {
      showToast("Veuillez saisir un libellé.", "warning");
      return;
    }

    const payload = { code: newCode, description };

    if (originalCode) {
      const idx = appState.settings.accounts.findIndex(a => a.code === originalCode);
      if (idx !== -1) {
        appState.settings.accounts[idx] = payload;
        appState.activities.forEach(act => {
          act.distributions.forEach((dist: { account_code: string }) => {
            if (dist.account_code === originalCode) dist.account_code = newCode;
          });
        });
      }
    } else {
      if (appState.settings.accounts.some(a => a.code === newCode)) {
        showToast("Ce code de compte existe déjà.", "warning");
        return;
      }
      appState.settings.accounts.push(payload);
    }

    appState.settings.accounts.sort((a, b) => a.code.localeCompare(b.code));
    saveDatabase();
    onClose();
    populateDropdowns();
    bump();
  };

  return (
    <Modal
      id="account-modal"
      titleId="account-modal-title"
      title={originalCode ? "Modifier le compte GL" : "Ajouter un compte"}
      isOpen={isOpen}
      onClose={onClose}
      onSubmit={submit}
    >
      <div className="form-group">
        <label htmlFor="form-account-code">Numéro de compte (XXX-XXXX-XX-XXX)</label>
        <input
          type="text"
          id="form-account-code"
          className="form-input"
          required
          placeholder="XXX-XXXX-XX-XXX"
          value={codeVal}
          onChange={e => setCodeVal(e.target.value)}
        />
      </div>
      <div className="form-group">
        <label htmlFor="form-account-desc">Description / Libellé</label>
        <input
          type="text"
          id="form-account-desc"
          className="form-input"
          required
          placeholder="Ex: SCOLAIRE"
          value={desc}
          onChange={e => setDesc(e.target.value)}
        />
      </div>
    </Modal>
  );
}
