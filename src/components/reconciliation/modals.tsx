/**
 * reconciliation/modals.tsx - The three modals reconciliation-view.tsx opens on top of the
 * results table: the ledger column-mapping modal (shown when a dropped file's columns can't be
 * auto-detected), the ledger-lines detail modal (behind a result's "Détails GL" button), and the
 * export options modal (behind "Exporter le rapprochement").
 */
import { useEffect, useState } from "react";
import { getAccountByCode } from "../../state/settings-repository.ts";
import { showToast, formatCurrency } from "../../utils/utils.ts";
import { logError } from "../../utils/logger.ts";
import { findBestColumnMatch } from "../../services/reconciliation.ts";

export const MAPPING_FIELDS = [
  { key: "poste", label: "Poste budgétaire (Compte) *", required: true, names: ["poste", "compte", "gl", "budget", "account"] },
  {
    key: "date",
    label: "Date versée *",
    required: true,
    names: ["date versée", "date versee", "date", "versement", "transaction"]
  },
  {
    key: "montant",
    label: "Montant courant *",
    required: true,
    names: ["montant courant", "montant", "courant", "valeur", "amount", "solde"]
  },
  {
    key: "ref",
    label: "Numéro de référence (optionnel)",
    required: false,
    names: ["référence", "reference", "ref", "numéro de référence", "no reference", "no doc"]
  },
  { key: "nom", label: "Nom de l'auxiliaire (optionnel)", required: false, names: ["nom", "auxiliaire", "client", "fournisseur", "name"] },
  {
    key: "desc",
    label: "Description (optionnel)",
    required: false,
    names: ["description", "libellé", "libelle", "details", "détails", "memo", "texte"]
  }
] as const;

export type MappingKey = (typeof MAPPING_FIELDS)[number]["key"];

export function LedgerMappingModal({
  headers,
  onClose,
  onSubmit
}: {
  headers: string[] | null;
  onClose: () => void;
  onSubmit: (values: Record<MappingKey, string>) => void;
}) {
  const isOpen = headers !== null;
  const [values, setValues] = useState<Record<MappingKey, string>>({ poste: "", date: "", montant: "", ref: "", nom: "", desc: "" });

  useEffect(() => {
    if (!headers) return;

    let savedMapping: Record<string, string> | null = null;
    try {
      const raw = localStorage.getItem("outil_marie_ledger_col_mapping");
      if (raw) savedMapping = JSON.parse(raw);
    } catch (e) {
      logError("reconciliation", "lecture du mapping de colonnes sauvegardé", e);
    }

    const next = {} as Record<MappingKey, string>;
    MAPPING_FIELDS.forEach(field => {
      const savedKey = `map-${field.key === "poste" ? "poste-budgetaire" : field.key === "date" ? "date-versee" : field.key === "montant" ? "montant-courant" : field.key === "ref" ? "no-reference" : field.key}`;
      if (savedMapping && savedMapping[savedKey] && headers.includes(savedMapping[savedKey])) {
        next[field.key] = savedMapping[savedKey];
      } else {
        const matched = findBestColumnMatch(headers, [...field.names]);
        next[field.key] = matched || "";
      }
    });
    setValues(next);
  }, [headers]);

  if (!isOpen) {
    return (
      <div id="ledger-mapping-modal" className="modal" style={{ width: 500, maxWidth: "95vw" }} role="dialog" aria-modal="true">
        <div />
      </div>
    );
  }

  const submit = () => {
    const { poste, date, montant } = values;
    if (poste === date || poste === montant || date === montant) {
      showToast("Veuillez sélectionner des colonnes distinctes pour les champs obligatoires.", "warning");
      return;
    }

    try {
      localStorage.setItem(
        "outil_marie_ledger_col_mapping",
        JSON.stringify({
          "map-poste-budgetaire": poste,
          "map-date-versee": date,
          "map-montant-courant": montant,
          "map-no-reference": values.ref,
          "map-nom": values.nom,
          "map-description": values.desc
        })
      );
    } catch (e) {
      logError("reconciliation", "sauvegarde du mapping de colonnes", e);
    }

    onSubmit(values);
  };

  return (
    <div
      id="ledger-mapping-modal"
      className="modal active"
      style={{ width: 500, maxWidth: "95vw" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="ledger-mapping-modal-title"
    >
      <div className="modal-header">
        <h3 className="modal-title" id="ledger-mapping-modal-title">
          Associer les colonnes du Grand Livre
        </h3>
        <button className="btn-icon" aria-label="Fermer" onClick={onClose}>
          <svg viewBox="0 0 24 24">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
          </svg>
        </button>
      </div>
      <div className="modal-content">
        <p style={{ marginBottom: 16, fontSize: "0.9rem", color: "var(--text-secondary)" }}>
          Certaines colonnes obligatoires n'ont pas été détectées automatiquement. Veuillez associer les champs requis aux colonnes de votre
          fichier Excel.
        </p>
        <form
          onSubmit={e => {
            e.preventDefault();
            submit();
          }}
        >
          {MAPPING_FIELDS.map(field => (
            <div className="form-group" key={field.key}>
              <label htmlFor={`map-${field.key}`}>{field.label}</label>
              <select
                id={`map-${field.key}`}
                className="form-input select-input"
                required={field.required}
                value={values[field.key]}
                onChange={e => setValues(v => ({ ...v, [field.key]: e.target.value }))}
              >
                {!field.required && <option value="">(Non associé)</option>}
                {headers.map(h => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </form>
      </div>
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={onClose}>
          Annuler
        </button>
        <button className="btn btn-primary" onClick={submit}>
          Valider et Importer
        </button>
      </div>
    </div>
  );
}

export function ReconDetailModal({ record, onClose }: { record: any; onClose: () => void }) {
  const isOpen = record !== null;
  return (
    <div
      id="recon-detail-modal"
      className={`modal${isOpen ? " active" : ""}`}
      style={{ width: 800, maxWidth: "95vw" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="recon-detail-modal-title"
    >
      <div className="modal-header">
        <h3 className="modal-title" id="recon-detail-modal-title">
          Lignes de Grand Livre détaillées
        </h3>
        <button className="btn-icon" aria-label="Fermer" onClick={onClose}>
          <svg viewBox="0 0 24 24">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
          </svg>
        </button>
      </div>
      {isOpen && (
        <div className="modal-content" style={{ padding: 0 }}>
          <div
            style={{
              padding: "16px 24px",
              borderBottom: "1px solid var(--border-color)",
              backgroundColor: "var(--bg-main)",
              fontSize: "0.9rem"
            }}
          >
            <div>
              <strong>Compte :</strong> {record.account_code} (
              {getAccountByCode(record.account_code)?.description || "Inconnu"})
            </div>
            <div style={{ marginTop: 4 }}>
              <strong>Référence :</strong> {record.reference}
            </div>
          </div>
          <div className="table-responsive" style={{ maxHeight: 400, overflowY: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Auxiliaire</th>
                  <th>Description</th>
                  <th>Type Tr.</th>
                  <th>No Doc GL</th>
                  <th className="text-right">Montant</th>
                </tr>
              </thead>
              <tbody>
                {record.ledgerTxs.map((tx: any, i: number) => (
                  <tr key={i}>
                    <td className="font-mono" style={{ whiteSpace: "nowrap" }}>
                      {tx["Date versée"] || "-"}
                    </td>
                    <td>{tx["Auxiliaire"] || "-"}</td>
                    <td style={{ fontSize: "0.82rem" }}>{tx["Description"] || "-"}</td>
                    <td>{tx["Tr. type"] || "-"}</td>
                    <td className="font-mono">{tx["No doc. GL"] || "-"}</td>
                    <td className="text-right bold font-mono">{formatCurrency(parseFloat(tx["Montant courant"]))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={onClose}>
          Fermer
        </button>
      </div>
    </div>
  );
}

export function ExportOptionsModal({
  isOpen,
  excludeValid,
  onExcludeValidChange,
  onConfirm,
  onClose
}: {
  isOpen: boolean;
  excludeValid: boolean;
  onExcludeValidChange: (value: boolean) => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <div
      id="recon-export-modal"
      className={`modal${isOpen ? " active" : ""}`}
      style={{ width: 420, maxWidth: "95vw" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="recon-export-modal-title"
    >
      <div className="modal-header">
        <h3 className="modal-title" id="recon-export-modal-title">
          Exporter le rapprochement
        </h3>
        <button className="btn-icon" aria-label="Fermer" onClick={onClose}>
          <svg viewBox="0 0 24 24">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
          </svg>
        </button>
      </div>
      {isOpen && (
        <div className="modal-content">
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={excludeValid}
              onChange={e => onExcludeValidChange(e.target.checked)}
            />
            Exclure les éléments conformes
          </label>
        </div>
      )}
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={onClose}>
          Annuler
        </button>
        <button className="btn btn-primary" onClick={onConfirm}>
          Exporter
        </button>
      </div>
    </div>
  );
}
