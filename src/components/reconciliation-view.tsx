/**
 * reconciliation-view.tsx - Reconciliation ("Rapprochement GL") view: file drop zone, column
 * mapping modal, results table (tabs/pagination/manual review/fuzzy-match suggestions), and the
 * ledger detail modal. The engine/state (matching algorithm, decisions store) resides in
 * src/services/reconciliation.ts so it can be unit-tested directly and imported by Node test runners
 * and other TypeScript modules.
 *
 * The Excel export, the drop zone/pagination widgets, the three modals and the result row each
 * live in their own module under components/reconciliation/; this file keeps only the top-level
 * view (import/filter/review state and the table it drives).
 *
 * External entry points called from outside this file:
 * - main.ts's DOMContentLoaded bootstrap calls initReconciliationHandlers() once.
 * - src/navigation.ts's renderView() calls renderReconciliation() on every switch to the "validation" tab.
 */
import { useEffect, useState } from "react";
import { saveDatabaseOrRollback } from "../state/state.ts";
import { getActivityById } from "../state/activities-repository.ts";
import { showToast, showLoadingOverlay, hideLoadingOverlay } from "../utils/utils.ts";
import { logError } from "../utils/logger.ts";
import { reconciliationState, setReconDecision, validateLedgerStructure, reconcileLedger } from "../services/reconciliation.ts";
import { createActivity, switchActivityTab } from "../activities-dom/form.ts";
import { renderActivities } from "../activities-dom/render.ts";
import { openActivityDrawer, addDistributionRow } from "../activities-dom/financials.ts";
import { useReconciliationRefreshToken } from "./reconciliation-mount.ts";
import { exportReconciliationToExcel } from "./reconciliation/excel-export.ts";
import { PaginationBar, DropZone } from "./reconciliation/widgets.tsx";
import { LedgerMappingModal, ReconDetailModal, ExportOptionsModal, type MappingKey } from "./reconciliation/modals.tsx";
import { ReconciliationRow } from "./reconciliation/ReconciliationRow.tsx";

export function ReconciliationView() {
  const [, setVersion] = useState(0);
  const bump = () => setVersion(v => v + 1);

  // Re-render whenever an external module (period selector, bulk actions, backup restore, undo,
  // ...) mutates reconciliationState directly via renderReconciliation() — see reconciliation-mount.ts.
  useReconciliationRefreshToken();

  useEffect(() => {
    if (reconciliationState.ledgerTransactions.length > 0) {
      reconcileLedger();
      bump();
    }
  }, []);

  const [mappingHeaders, setMappingHeaders] = useState<string[] | null>(null);
  const [pendingLedgerRows, setPendingLedgerRows] = useState<any[]>([]);
  const [detailRecord, setDetailRecord] = useState<any>(null);
  const [excludeValidOnExport, setExcludeValidOnExport] = useState(true);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showHelp, setShowHelp] = useState(() => {
    try {
      return localStorage.getItem("outil_marie_recon_show_help") !== "false";
    } catch {
      return true;
    }
  });

  const toggleHelp = () => {
    const next = !showHelp;
    setShowHelp(next);
    try {
      localStorage.setItem("outil_marie_recon_show_help", String(next));
    } catch (e) {
      logError("reconciliation", "sauvegarde de showHelp", e);
    }
  };

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

    const totalRows = rawRows.length;
    reconciliationState.ledgerTransactions = rawRows.filter((row: any) => {
      const poste = String(row["Poste budgétaire"] || "").trim();
      const dateVersee = String(row["Date versée"] || "").trim();
      const montant = parseFloat(row["Montant courant"]);
      return (
        poste !== "" && poste !== "Total" && dateVersee !== "" && dateVersee !== "Total" && dateVersee !== "Grand Total" && !isNaN(montant)
      );
    });

    if (reconciliationState.ledgerTransactions.length === 0) {
      showToast("Aucune transaction valide n'a été trouvée dans le fichier. Veuillez vérifier la structure du fichier Excel.", "warning");
      return;
    }

    const skippedCount = totalRows - reconciliationState.ledgerTransactions.length;
    if (skippedCount > 0) {
      showToast(
        `${skippedCount} ligne(s) du fichier ont été ignorées (montant ou date manquant/invalide) : le rapprochement peut être incomplet.`,
        "warning"
      );
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

    reader.onload = async e => {
      try {
        const XLSX = await import("xlsx");
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

    const totalRows = mappedTransactions.length;
    reconciliationState.ledgerTransactions = mappedTransactions.filter(row => {
      const poste = row["Poste budgétaire"];
      const dateVersee = row["Date versée"];
      const montant = row["Montant courant"];
      return (
        poste !== "" && poste !== "Total" && dateVersee !== "" && dateVersee !== "Total" && dateVersee !== "Grand Total" && !isNaN(montant)
      );
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

    const skippedCount = totalRows - reconciliationState.ledgerTransactions.length;
    showToast(
      skippedCount > 0
        ? `Importation réussie avec mappage de colonnes (${skippedCount} ligne(s) ignorée(s) : montant ou date manquant/invalide).`
        : "Importation réussie avec mappage de colonnes.",
      skippedCount > 0 ? "warning" : "success"
    );
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
    const saved = await setReconDecision(key, status);
    reconcileLedger();
    bump();
    if (!saved) {
      showToast("La décision a été appliquée mais n'a pas pu être enregistrée : elle sera perdue au prochain rechargement.", "warning");
    }
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
    const act = getActivityById(result.activityId);
    // A result can represent several app-side lines combined (same compte+référence within the
    // same activity, matching how the GL combines them into one line — see reconcileLedger()), so
    // every underlying line must get the corrected reference, not just the first one.
    const indices: number[] = result.distIndexes || [result.distIndex];
    const lines = indices.map(i => (result.isBarRevenue ? act?.bar_revenue_lines?.[i] : act?.distributions[i]));
    if (!act || lines.some((l: any) => !l)) return;
    const prevReferences = lines.map((l: any) => (result.isBarRevenue ? l.receipt_number : l.reference));
    lines.forEach((l: any) => {
      if (result.isBarRevenue) {
        l.receipt_number = newReference;
      } else {
        l.reference = newReference;
      }
    });
    saveDatabaseOrRollback(() => {
      lines.forEach((l: any, i: number) => {
        if (result.isBarRevenue) {
          l.receipt_number = prevReferences[i];
        } else {
          l.reference = prevReferences[i];
        }
      });
    }, "La mise à jour de la référence n'a pas été enregistrée. Réessayez.").then(saved => {
      if (!saved) {
        bump();
        return;
      }
      reconcileLedger();
      bump();
      showToast(`Référence mise à jour pour « ${act.name} ».`, "success");
    });
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
        <div id="reconciliation-panel" className="reconciliation-grid">
          {showHelp && (
            <div className="reconcile-help-banner">
              <div className="reconcile-help-header">
                <span className="reconcile-help-title">💡 Guide du Rapprochement Comptable</span>
                <button
                  className="btn-icon"
                  onClick={toggleHelp}
                  aria-label="Fermer le guide"
                  style={{
                    width: 24,
                    height: 24,
                    padding: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "1.1rem"
                  }}
                >
                  &times;
                </button>
              </div>
              <div className="reconcile-help-content">
                <p style={{ margin: "0 0 10px 0" }}>
                  Ce tableau compare vos <strong>Activités saisies</strong> dans l'application avec les lignes de votre{" "}
                  <strong>Grand Livre (comptabilité externe)</strong>.
                </p>
                <div className="reconcile-help-grid">
                  <div className="reconcile-help-item">
                    <span className="badge badge-success">Conforme</span>
                    <p>Les montants et références correspondent parfaitement. Tout est en ordre !</p>
                  </div>
                  <div className="reconcile-help-item">
                    <span className="badge badge-danger">Écart de montant</span>
                    <p>
                      La référence correspond, mais le montant saisi diffère de celui du Grand Livre. Vous pouvez vérifier ou forcer la
                      validation.
                    </p>
                  </div>
                  <div className="reconcile-help-item">
                    <span className="badge badge-warning">Manquant dans le GL</span>
                    <p>L'activité est dans l'application, mais aucun montant correspondant n'a été trouvé dans le Grand Livre comptable.</p>
                  </div>
                  <div className="reconcile-help-item">
                    <span className="badge badge-info">Manquant dans l'App</span>
                    <p>
                      Cette ligne existe dans le Grand Livre mais n'est pas saisie dans l'application. Cliquez sur{" "}
                      <strong>+ Créer activité</strong> pour l'ajouter.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
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
                <button
                  className={`reconcile-tab${reconciliationState.filter === "all" ? " active" : ""}`}
                  onClick={() => setFilter("all")}
                >
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
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button className="btn btn-secondary" onClick={toggleHelp}>
                  {showHelp ? "Masquer l'aide" : "Afficher l'aide (?) "}
                </button>
                <button className="btn btn-secondary" onClick={() => setShowExportModal(true)}>
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
                    <th>
                      Poste Budgétaire / Description
                      <span className="help-tooltip-trigger" title="Le numéro de compte comptable associé (ex: 4100) et son libellé">
                        ?
                      </span>
                    </th>
                    <th>
                      RI / Facture Réf.
                      <span className="help-tooltip-trigger" title="La référence du reçu de versement ou de la facture pour rapprochement">
                        ?
                      </span>
                    </th>
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
      <ExportOptionsModal
        isOpen={showExportModal}
        excludeValid={excludeValidOnExport}
        onExcludeValidChange={setExcludeValidOnExport}
        onConfirm={() => {
          setShowExportModal(false);
          exportReconciliationToExcel(excludeValidOnExport);
        }}
        onClose={() => setShowExportModal(false)}
      />
    </>
  );
}
