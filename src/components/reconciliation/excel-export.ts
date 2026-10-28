/**
 * reconciliation/excel-export.ts - Excel export of the reconciliation results table (the
 * "Exporter le rapprochement" button in reconciliation-view.tsx's table toolbar).
 */
import { appState } from "../../state/state.ts";
import { getAccountByCode } from "../../state/settings-repository.ts";
import { showToast, showLoadingOverlay, hideLoadingOverlay } from "../../utils/utils.ts";
import { logError } from "../../utils/logger.ts";
import { reconciliationState } from "../../services/reconciliation.ts";
import { RECON_STATUS_LABELS } from "./status-labels.ts";

function runReconciliationExcelExport(XLSX: any, excludeValid: boolean) {
  try {
    const header = [
      "Date",
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
    const sourceResults = excludeValid
      ? reconciliationState.results.filter((r: any) => r.status !== "valid")
      : reconciliationState.results;
    const rows = sourceResults.map((r: any) => {
      const accountDesc = getAccountByCode(r.account_code)?.description || "Inconnu";
      const activityLabel = r.activityId ? `${r.activityId} : ${r.activityName}` : r.activityName;
      const diff = r.status === "unlogged" ? r.amount_saisi : r.status === "unentered" ? -r.amount_gl : r.diff || 0;
      return [
        r.activity_date || r.ledger_date || "",
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
    ws["!cols"] = [{ wch: 12 }, { wch: 18 }, { wch: 20 }, { wch: 35 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 20 }, { wch: 20 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "RAPPROCHEMENT");

    const qStr = appState.selected_quarters
      .sort()
      .map((q: number) => `T${q}`)
      .join("-");
    const suffix = excludeValid ? "_sans_conformes" : "";
    const filename = `rapprochement_${appState.selected_year}_${qStr || "aucun"}${suffix}_${new Date().toISOString().split("T")[0]}.xlsx`;
    XLSX.writeFile(wb, filename);
    showToast("Export du rapprochement terminé.", "success");
  } catch (err: any) {
    logError("reconciliation", "export du rapprochement", err);
    showToast("Erreur lors de l'export du rapprochement : " + err.message, "error");
  } finally {
    hideLoadingOverlay();
  }
}

export function exportReconciliationToExcel(excludeValid: boolean) {
  if (reconciliationState.results.length === 0) {
    showToast("Aucun rapprochement à exporter. Importez d'abord un fichier du Grand Livre.", "warning");
    return;
  }
  if (excludeValid && reconciliationState.results.every((r: any) => r.status === "valid")) {
    showToast("Tous les éléments sont conformes : rien à exporter avec ce filtre.", "warning");
    return;
  }
  showLoadingOverlay("Génération de l'export du rapprochement...");
  setTimeout(async () => {
    try {
      const xlsxModule = await import("xlsx");
      runReconciliationExcelExport(xlsxModule, excludeValid);
    } catch (err: any) {
      logError("reconciliation", "importation de xlsx", err);
      showToast("La librairie Excel (XLSX) n'a pas pu être chargée.", "error");
      hideLoadingOverlay();
    }
  }, 20);
}
