import { useState, useEffect } from "react";
import { saveDatabaseOrRollback } from "../../state/state.ts";
import { getActivities } from "../../state/activities-repository.ts";
import { getAccounts, setAccounts, removeAccountByCode, replaceAccountAt, addAccount, sortAccountsByCode } from "../../state/settings-repository.ts";
import { showToast } from "../../utils/utils.ts";
import { populateDropdowns } from "../../navigation.ts";
import { DeleteIcon, Modal } from "./common.tsx";

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
    const prevAccounts = getAccounts();
    const prevDistributions = getActivities().map(act => ({ act, distributions: act.distributions }));
    removeAccountByCode(code);
    getActivities().forEach(act => {
      act.distributions = act.distributions.filter((d: { account_code: string }) => d.account_code !== code);
    });
    saveDatabaseOrRollback(() => {
      setAccounts(prevAccounts);
      prevDistributions.forEach(({ act, distributions }) => {
        act.distributions = distributions;
      });
    }, "La suppression n'a pas été enregistrée. Réessayez.").then(() => {
      populateDropdowns();
      bump();
    });
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
        {getAccounts().map(acc => (
          <div key={acc.code} className="settings-list-item" onClick={() => openModal(acc.code)}>
            <div className="settings-list-item-info">
              <span className="settings-list-item-code">{acc.code}</span>
              <span className="settings-list-item-desc">{acc.description}</span>
            </div>
            <div className="flex gap-2" onClick={e => e.stopPropagation()}>
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
  const existing = originalCode ? getAccounts().find(a => a.code === originalCode) : null;
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
    const prevAccounts = [...getAccounts()];
    const touchedDistributions: { dist: { account_code: string }; prevCode: string }[] = [];

    if (originalCode) {
      const replaced = replaceAccountAt(originalCode, payload);
      if (replaced) {
        getActivities().forEach(act => {
          act.distributions.forEach((dist: { account_code: string }) => {
            if (dist.account_code === originalCode) {
              touchedDistributions.push({ dist, prevCode: dist.account_code });
              dist.account_code = newCode;
            }
          });
        });
      }
    } else {
      if (getAccounts().some(a => a.code === newCode)) {
        showToast("Ce code de compte existe déjà.", "warning");
        return;
      }
      addAccount(payload);
    }

    sortAccountsByCode();
    saveDatabaseOrRollback(() => {
      setAccounts(prevAccounts);
      touchedDistributions.forEach(({ dist, prevCode }) => {
        dist.account_code = prevCode;
      });
    }, "L'enregistrement du compte a échoué. Réessayez.").then(saved => {
      if (!saved) {
        bump();
        return;
      }
      onClose();
      populateDropdowns();
      bump();
    });
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
