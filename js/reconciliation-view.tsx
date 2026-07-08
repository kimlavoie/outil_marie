/**
 * reconciliation-view.tsx - Reconciliation ("Rapprochement GL") view: file drop zone, column
 * mapping modal, results table (tabs/pagination/manual review/fuzzy-match suggestions), and the
 * ledger detail modal. Ported from reconciliation.js to React as the final step of Phase 4 of the
 * Vite/React/TS migration (see TODO.txt) — the engine/state (matching algorithm, decisions store)
 * stayed behind in js/reconciliation.ts so it can keep being imported by plain `node --test`
 * (Node can't execute .tsx) and by the several activities-*.ts files that read reconciliationState/
 * reconcileLedger, same split as js/dashboard.js/js/dashboard-view.tsx.
 *
 * Only two entry points are called from outside this file (checked via grep): main.js's
 * DOMContentLoaded bootstrap calls initReconciliationHandlers() once, and navigation.js's
 * renderView() calls renderReconciliation() on every switch to the "validation" tab. Everything
 * else (file handling, modals, row actions) is internal to the React component now.
 */
import { useEffect, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { appState, saveDatabase } from "./state.js";
import { showToast, showLoadingOverlay, hideLoadingOverlay, formatCurrency, renderPaginationBar } from "./utils.ts";
import { logError } from "./logger.ts";
import {
  reconciliationState,
  loadReconDecisions,
  setReconDecision,
  validateLedgerStructure,
  findBestColumnMatch,
  reconcileLedger
} from "./reconciliation.ts";
import { createActivity, switchActivityTab } from "./activities-form.ts";
import { renderActivities } from "./activities-render.ts";
import { openActivityDrawer, addDistributionRow } from "./activities-financials.ts";

const RECON_STATUS_LABELS: Record<string, string> = {
  valid: "Conforme",
  diff: "Écart de montant",
  unlogged: "Manquant dans le GL",
  unentered: "Manquant dans l'App"
};

// ---------------------------------------------------------------------------
// Excel export (button in the table toolbar)
// ---------------------------------------------------------------------------

function runReconciliationExcelExport() {
  try {
    const header = [
      "Compte",
      "Description du compte",
      "Activité",
      "Référence",
      "Montant saisi",
      "Montant GL",
      "Écart",
      "Statut",
      "Décision manuelle"
    ];
    const reviewLabels: Record<string, string> = { validated: "Validé manuellement", ignored: "Ignoré" };
    const rows = reconciliationState.results.map((r: any) => {
      const accountDesc = appState.settings.accounts.find((a: any) => a.code === r.account_code)?.description || "Inconnu";
      const activityLabel = r.activityId ? `${r.activityId} : ${r.activityName}` : r.activityName;
      const diff = r.status === "unlogged" ? r.amount_saisi : r.status === "unentered" ? -r.amount_gl : r.diff || 0;
      return [
        r.account_code,
        accountDesc,
        activityLabel,
        r.reference || "",
        r.amount_saisi,
        r.amount_gl,
        diff,
        RECON_STATUS_LABELS[r.status] || r.status,
        reviewLabels[r.reviewStatus] || ""
      ];
    });

    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    ws["!cols"] = [{ wch: 18 }, { wch: 20 }, { wch: 35 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 20 }, { wch: 20 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "RAPPROCHEMENT");

    const qStr = appState.selected_quarters
      .sort()
      .map((q: number) => `T${q}`)
      .join("-");
    const filename = `rapprochement_${appState.selected_year}_${qStr || "aucun"}_${new Date().toISOString().split("T")[0]}.xlsx`;
    XLSX.writeFile(wb, filename);
    showToast("Export du rapprochement terminé.", "success");
  } catch (err: any) {
    logError("reconciliation", "export du rapprochement", err);
    showToast("Erreur lors de l'export du rapprochement : " + err.message, "error");
  } finally {
    hideLoadingOverlay();
  }
}

function exportReconciliationToExcel() {
  if (reconciliationState.results.length === 0) {
    showToast("Aucun rapprochement à exporter. Importez d'abord un fichier du Grand Livre.", "warning");
    return;
  }
  showLoadingOverlay("Génération de l'export du rapprochement...");
  setTimeout(runReconciliationExcelExport, 20);
}

// ---------------------------------------------------------------------------
// Pagination (reuses the shared imperative helper, like a small Chart.js-style widget)
// ---------------------------------------------------------------------------

function PaginationBar({
  page,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange
}: {
  page: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (p: number) => void;
  onPageSizeChange: (s: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const clamped = renderPaginationBar(ref.current, { page, pageSize, totalItems, onPageChange, onPageSizeChange });
    if (clamped !== page) reconciliationState.page = clamped;
  });
  return <div className="pagination-bar" ref={ref} />;
}

// ---------------------------------------------------------------------------
// Drop zone
// ---------------------------------------------------------------------------

function DropZone({ onFile }: { onFile: (file: File) => void }) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      id="drop-zone"
      className={`drop-zone${dragOver ? " dragover" : ""}`}
      onClick={() => inputRef.current?.click()}
      onDragOver={e => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file) onFile(file);
      }}
    >
      <svg className="drop-zone-icon" viewBox="0 0 24 24">
        <path d="M19 12v7H5v-7H3v7c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-7h-2zm-6 .67l2.59-2.58L17 11.5l-5 5-5-5 1.41-1.41L11 12.67V3h2v9.67z" />
      </svg>
      <div className="drop-zone-text">Déposez le fichier extrait du Grand Livre (.xls, .xlsx) ici</div>
      <div className="drop-zone-desc">ou cliquez pour parcourir vos fichiers</div>
      <input
        type="file"
        id="ledger-file-input"
        ref={inputRef}
        style={{ display: "none" }}
        accept=".xls,.xlsx"
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ledger column mapping modal
// ---------------------------------------------------------------------------

const MAPPING_FIELDS = [
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

type MappingKey = (typeof MAPPING_FIELDS)[number]["key"];

function LedgerMappingModal({
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
          Certaines colonnes obligatoires n'ont pas été détectées automatiquement. Veuillez associer les champs requis aux colonnes de
          votre fichier Excel.
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

// ---------------------------------------------------------------------------
// Reconciliation detail modal (ledger lines behind one result)
// ---------------------------------------------------------------------------

function ReconDetailModal({ record, onClose }: { record: any; onClose: () => void }) {
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
          <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--border-color)", backgroundColor: "var(--bg-main)", fontSize: "0.9rem" }}>
            <div>
              <strong>Compte :</strong>{" "}
              {record.account_code} ({appState.settings.accounts.find((a: any) => a.code === record.account_code)?.description || "Inconnu"})
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

// ---------------------------------------------------------------------------
// One reconciliation result row
// ---------------------------------------------------------------------------

function ReconciliationRow({
  r,
  onQuickAdd,
  onViewDetails,
  onSetReview,
  onAcceptSuggestion
}: {
  r: any;
  onQuickAdd: (r: any) => void;
  onViewDetails: (r: any) => void;
  onSetReview: (key: string, status: string) => void;
  onAcceptSuggestion: (r: any, ref: string) => void;
}) {
  const badgeClass =
    { valid: "badge-success", diff: "badge-danger", unlogged: "badge-warning", unentered: "badge-info" }[r.status as string] || "";

  let diffNode: React.ReactNode = "-";
  if (r.status === "diff") {
    const sign = r.diff > 0 ? "+" : "";
    diffNode = (
      <span className="text-danger bold">
        {sign}
        {formatCurrency(r.diff)}
      </span>
    );
  } else if (r.status === "unlogged") {
    diffNode = <span className="text-warning bold">+{formatCurrency(r.amount_saisi)}</span>;
  } else if (r.status === "unentered") {
    diffNode = <span className="text-info bold">-{formatCurrency(r.amount_gl)}</span>;
  }

  const accountDesc = appState.settings.accounts.find((a: any) => a.code === r.account_code)?.description || "Inconnu";

  return (
    <tr style={r.reviewStatus ? { opacity: 0.65 } : undefined}>
      <td>
        <div className="bold font-mono">{r.account_code}</div>
        <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>{accountDesc}</div>
        <div style={{ fontSize: "0.78rem", fontStyle: "italic", color: "var(--text-muted)", marginTop: 4 }}>
          {r.activityId ? `${r.activityId} : ${r.activityName}` : r.activityName}
        </div>

        {r.status === "unlogged" && r.suggestions && r.suggestions.length > 0 && (
          <div style={{ marginTop: 6, fontSize: "0.75rem", color: "var(--text-secondary)" }}>
            <div style={{ fontStyle: "italic", marginBottom: 2 }}>Suggestions de rapprochement :</div>
            {r.suggestions.map((s: any) => (
              <div key={s.reference} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                <span className="font-mono">{s.reference}</span> — {formatCurrency(s.amount_gl)} ({s.ledger_date || "date inconnue"})
                <button
                  className="btn-icon"
                  title="Corriger la référence de cette activité"
                  onClick={() => onAcceptSuggestion(r, s.reference)}
                >
                  <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, fill: "var(--success)" }}>
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
        {r.status === "unentered" && r.suggestedFor && r.suggestedFor.length > 0 && (
          <div style={{ marginTop: 6, fontSize: "0.75rem", fontStyle: "italic", color: "var(--text-secondary)" }}>
            Ressemble à : {r.suggestedFor.join(", ")}
          </div>
        )}
      </td>
      <td className="font-mono">{r.reference || "-"}</td>
      <td className="bold">{r.amount_saisi > 0 ? formatCurrency(r.amount_saisi) : "-"}</td>
      <td className="bold">{r.amount_gl > 0 ? formatCurrency(r.amount_gl) : "-"}</td>
      <td>{diffNode}</td>
      <td>
        <span className={`badge ${badgeClass}`}>{RECON_STATUS_LABELS[r.status]}</span>
      </td>
      <td className="text-right">
        {r.status === "unentered" && (
          <button className="btn btn-secondary" style={{ padding: "6px 12px", fontSize: "0.8rem" }} title="Enregistrer l'activité" onClick={() => onQuickAdd(r)}>
            + Créer activité
          </button>
        )}
        {r.status !== "unentered" && r.ledgerTxs && r.ledgerTxs.length > 0 && (
          <button className="btn btn-secondary" style={{ padding: "6px 12px", fontSize: "0.8rem" }} onClick={() => onViewDetails(r)}>
            Détails GL
          </button>
        )}

        {r.status !== "valid" && r.reviewKey && (
          <>
            {r.reviewStatus === "validated" && (
              <div className="recon-review-note text-success" style={{ fontSize: "0.75rem", marginTop: 6 }}>
                ✓ Validé manuellement
                <button
                  className="btn-icon"
                  title="Annuler la validation"
                  style={{ width: 18, height: 18 }}
                  onClick={() => onSetReview(r.reviewKey, "")}
                >
                  &times;
                </button>
              </div>
            )}
            {r.reviewStatus === "ignored" && (
              <div className="recon-review-note text-muted" style={{ fontSize: "0.75rem", marginTop: 6 }}>
                Ignoré
                <button className="btn-icon" title="Annuler" style={{ width: 18, height: 18 }} onClick={() => onSetReview(r.reviewKey, "")}>
                  &times;
                </button>
              </div>
            )}
            {!r.reviewStatus && (
              <div style={{ display: "flex", gap: 4, marginTop: 6, justifyContent: "flex-end" }}>
                <button
                  className="btn btn-secondary"
                  style={{ padding: "4px 8px", fontSize: "0.72rem" }}
                  title="Marquer cet écart comme vérifié manuellement"
                  onClick={() => onSetReview(r.reviewKey, "validated")}
                >
                  Valider
                </button>
                <button
                  className="btn btn-secondary"
                  style={{ padding: "4px 8px", fontSize: "0.72rem" }}
                  title="Ignorer cet écart"
                  onClick={() => onSetReview(r.reviewKey, "ignored")}
                >
                  Ignorer
                </button>
              </div>
            )}
          </>
        )}
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Top-level view
// ---------------------------------------------------------------------------

function ReconciliationView() {
  const [, setVersion] = useState(0);
  const bump = () => setVersion(v => v + 1);

  const [mappingHeaders, setMappingHeaders] = useState<string[] | null>(null);
  const [pendingLedgerRows, setPendingLedgerRows] = useState<any[]>([]);
  const [detailRecord, setDetailRecord] = useState<any>(null);

  const parseAndImportRows = (rawRows: any[]) => {
    if (!Array.isArray(rawRows) || rawRows.length === 0) {
      showToast("Échec de l'importation : Le fichier Excel est vide ou invalide.", "error");
      return;
    }

    const validation = validateLedgerStructure(rawRows);
    if (!validation.valid) {
      setPendingLedgerRows(rawRows);
      setMappingHeaders(Object.keys(rawRows[0]));
      return;
    }

    reconciliationState.ledgerTransactions = rawRows.filter((row: any) => {
      const poste = String(row["Poste budgétaire"] || "").trim();
      const dateVersee = String(row["Date versée"] || "").trim();
      const montant = parseFloat(row["Montant courant"]);
      return poste !== "" && poste !== "Total" && dateVersee !== "" && dateVersee !== "Total" && dateVersee !== "Grand Total" && !isNaN(montant);
    });

    if (reconciliationState.ledgerTransactions.length === 0) {
      showToast("Aucune transaction valide n'a été trouvée dans le fichier. Veuillez vérifier la structure du fichier Excel.", "warning");
      return;
    }

    reconcileLedger();
    reconciliationState.imported = true;
    bump();
  };

  const handleLedgerFile = (file: File) => {
    const reader = new FileReader();
    showLoadingOverlay("Lecture du fichier du Grand Livre...");

    reader.onerror = () => {
      hideLoadingOverlay();
      logError("reconciliation", "lecture du fichier grand livre", reader.error);
      showToast("Erreur lors de la lecture du fichier.", "error");
    };

    reader.onload = e => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const firstSheet = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheet];
        const rawRows = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
        parseAndImportRows(rawRows);
      } catch (err: any) {
        logError("reconciliation", "lecture du fichier grand livre", err);
        showToast("Erreur lors de la lecture du fichier : " + err.message, "error");
      } finally {
        hideLoadingOverlay();
      }
    };

    reader.readAsArrayBuffer(file);
  };

  const applyColumnMappingAndImport = (values: Record<MappingKey, string>) => {
    const mappedTransactions = pendingLedgerRows.map(row => ({
      "Poste budgétaire": String(row[values.poste] || "").trim(),
      "Date versée": String(row[values.date] || "").trim(),
      "Montant courant": parseFloat(row[values.montant]) || 0.0,
      "No référence": values.ref ? String(row[values.ref] || "").trim() : "",
      Nom: values.nom ? String(row[values.nom] || "").trim() : "",
      Description: values.desc ? String(row[values.desc] || "").trim() : "",
      Auxiliaire: values.nom ? String(row[values.nom] || "").trim() : "",
      "Tr. type": String(row["Tr. type"] || "").trim(),
      "No doc. GL": String(row["No doc. GL"] || "").trim()
    }));

    reconciliationState.ledgerTransactions = mappedTransactions.filter(row => {
      const poste = row["Poste budgétaire"];
      const dateVersee = row["Date versée"];
      const montant = row["Montant courant"];
      return poste !== "" && poste !== "Total" && dateVersee !== "" && dateVersee !== "Total" && dateVersee !== "Grand Total" && !isNaN(montant);
    });

    setMappingHeaders(null);
    setPendingLedgerRows([]);

    if (reconciliationState.ledgerTransactions.length === 0) {
      showToast("Aucune transaction valide n'a été trouvée après application du mappage.", "warning");
      return;
    }

    reconcileLedger();
    reconciliationState.imported = true;
    bump();
    showToast("Importation réussie avec mappage de colonnes.", "success");
  };

  const clearImport = () => {
    reconciliationState.ledgerTransactions = [];
    reconciliationState.results = [];
    reconciliationState.imported = false;
    bump();
  };

  const setFilter = (filter: string) => {
    reconciliationState.filter = filter;
    reconciliationState.page = 1;
    bump();
  };

  const setReview = async (key: string, status: string) => {
    await setReconDecision(key, status);
    reconcileLedger();
    bump();
  };

  const quickAddFromLedger = (r: any) => {
    const id = createActivity(`Ajustement GL - Réf ${r.reference}`);
    renderActivities();
    openActivityDrawer(id);
    const distList = document.getElementById("form-distribution-list");
    if (distList) distList.innerHTML = "";
    addDistributionRow(r.account_code, r.amount_gl, r.reference);
    switchActivityTab("billing");
  };

  const acceptSuggestion = (result: any, newReference: string) => {
    const act = appState.activities.find((a: any) => a.id === result.activityId);
    if (!act || !act.distributions[result.distIndex]) return;
    act.distributions[result.distIndex].reference = newReference;
    saveDatabase();
    reconcileLedger();
    bump();
    showToast(`Référence mise à jour pour « ${act.name} ».`, "success");
  };

  const results = reconciliationState.results;
  const valid = results.filter((r: any) => r.status === "valid").length;
  const diff = results.filter((r: any) => r.status === "diff").length;
  const unlogged = results.filter((r: any) => r.status === "unlogged").length;
  const unentered = results.filter((r: any) => r.status === "unentered").length;

  const filtered = results.filter((r: any) => reconciliationState.filter === "all" || r.status === reconciliationState.filter);
  const startIdx = (reconciliationState.page - 1) * reconciliationState.pageSize;
  const pageItems = filtered.slice(startIdx, startIdx + reconciliationState.pageSize);

  return (
    <>
      {!reconciliationState.imported && <DropZone onFile={handleLedgerFile} />}

      {reconciliationState.imported && (
        <div id="reconciliation-panel" style={{ display: "grid" }} className="reconciliation-grid">
          <div className="reconcile-summary-bar">
            <div className="summary-box" style={{ borderLeft: "4px solid var(--success)" }}>
              <div className="summary-box-val text-success">{valid}</div>
              <div className="summary-box-lbl">Validés</div>
            </div>
            <div className="summary-box" style={{ borderLeft: "4px solid var(--danger)" }}>
              <div className="summary-box-val text-danger">{diff}</div>
              <div className="summary-box-lbl">Écarts Montant</div>
            </div>
            <div className="summary-box" style={{ borderLeft: "4px solid var(--warning)" }}>
              <div className="summary-box-val text-warning">{unlogged}</div>
              <div className="summary-box-lbl">Non dans le GL</div>
            </div>
            <div className="summary-box" style={{ borderLeft: "4px solid var(--info)" }}>
              <div className="summary-box-val text-info">{unentered}</div>
              <div className="summary-box-lbl">Non saisis (GL seul)</div>
            </div>
          </div>

          <div className="table-card">
            <div className="table-toolbar">
              <div className="reconcile-tabs">
                <button className={`reconcile-tab${reconciliationState.filter === "all" ? " active" : ""}`} onClick={() => setFilter("all")}>
                  Tous ({results.length})
                </button>
                <button
                  className={`reconcile-tab text-success${reconciliationState.filter === "valid" ? " active" : ""}`}
                  onClick={() => setFilter("valid")}
                >
                  Validés ({valid})
                </button>
                <button
                  className={`reconcile-tab text-danger${reconciliationState.filter === "diff" ? " active" : ""}`}
                  onClick={() => setFilter("diff")}
                >
                  Écarts ({diff})
                </button>
                <button
                  className={`reconcile-tab text-warning${reconciliationState.filter === "unlogged" ? " active" : ""}`}
                  onClick={() => setFilter("unlogged")}
                >
                  Non dans GL ({unlogged})
                </button>
                <button
                  className={`reconcile-tab text-info${reconciliationState.filter === "unentered" ? " active" : ""}`}
                  onClick={() => setFilter("unentered")}
                >
                  Non saisis ({unentered})
                </button>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-secondary" onClick={exportReconciliationToExcel}>
                  Exporter le rapprochement
                </button>
                <button className="btn btn-secondary btn-danger" onClick={clearImport}>
                  Effacer l'import
                </button>
              </div>
            </div>

            <div className="table-responsive">
              <table>
                <thead>
                  <tr>
                    <th>Poste Budgétaire / Description</th>
                    <th>RI / Facture Réf.</th>
                    <th>Montant Saisi</th>
                    <th>Montant Réel (GL)</th>
                    <th>Écart</th>
                    <th>Statut Rapprochement</th>
                    <th className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center" style={{ color: "var(--text-muted)", padding: 32 }}>
                        Aucun enregistrement dans cette catégorie.
                      </td>
                    </tr>
                  ) : (
                    pageItems.map((r: any) => (
                      <ReconciliationRow
                        key={`${r.account_code}||${r.reference}||${r.activityId}||${r.distIndex ?? ""}`}
                        r={r}
                        onQuickAdd={quickAddFromLedger}
                        onViewDetails={setDetailRecord}
                        onSetReview={setReview}
                        onAcceptSuggestion={acceptSuggestion}
                      />
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {filtered.length > 0 && (
              <PaginationBar
                page={reconciliationState.page}
                pageSize={reconciliationState.pageSize}
                totalItems={filtered.length}
                onPageChange={p => {
                  reconciliationState.page = p;
                  bump();
                }}
                onPageSizeChange={s => {
                  reconciliationState.pageSize = s;
                  reconciliationState.page = 1;
                  bump();
                }}
              />
            )}
          </div>
        </div>
      )}

      <LedgerMappingModal
        headers={mappingHeaders}
        onClose={() => {
          setMappingHeaders(null);
          setPendingLedgerRows([]);
        }}
        onSubmit={applyColumnMappingAndImport}
      />
      <ReconDetailModal record={detailRecord} onClose={() => setDetailRecord(null)} />
    </>
  );
}

let root: Root | null = null;

function mount() {
  const container = document.getElementById("validation-root");
  if (!container) return;
  if (!root) root = createRoot(container);
  root.render(<ReconciliationView />);
}

function initReconciliationHandlers() {
  loadReconDecisions();
  mount();
}

function renderReconciliation() {
  mount();
}

export { initReconciliationHandlers, renderReconciliation };
if (typeof window !== "undefined") {
  window.initReconciliationHandlers = initReconciliationHandlers;
  window.renderReconciliation = renderReconciliation;
}
