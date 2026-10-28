// Shared between the results table (ReconciliationRow) and the Excel export — kept in one place
// so the French label for a given reconciliation status never drifts between the two.
export const RECON_STATUS_LABELS: Record<string, string> = {
  valid: "Conforme",
  diff: "Écart de montant",
  unlogged: "Manquant dans le GL",
  unentered: "Manquant dans l'App"
};
