/**
 * reconciliation/ReconciliationRow.tsx - One row of the reconciliation results table: the
 * account/activity/reference, the saisi vs GL amounts and their diff, the status badge, "unlogged"
 * reconciliation suggestions, and the validate/ignore review actions.
 */
import { getAccountByCode } from "../../state/settings-repository.ts";
import { formatCurrency } from "../../utils/utils.ts";
import { RECON_STATUS_LABELS } from "./status-labels.ts";

export function ReconciliationRow({
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

  const accountDesc = getAccountByCode(r.account_code)?.description || "Inconnu";

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
          <button
            className="btn btn-secondary"
            style={{ padding: "6px 12px", fontSize: "0.8rem" }}
            title="Enregistrer l'activité"
            onClick={() => onQuickAdd(r)}
          >
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
                  className="btn btn-secondary btn-recon-validate"
                  style={{ padding: "4px 8px", fontSize: "0.72rem", display: "inline-flex", alignItems: "center", gap: "4px" }}
                  title="Marquer cet écart comme vérifié manuellement"
                  onClick={() => onSetReview(r.reviewKey, "validated")}
                >
                  <svg viewBox="0 0 24 24" style={{ width: 12, height: 12, fill: "currentColor" }}>
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                  </svg>
                  Valider
                </button>
                <button
                  className="btn btn-secondary btn-recon-ignore"
                  style={{ padding: "4px 8px", fontSize: "0.72rem", display: "inline-flex", alignItems: "center", gap: "4px" }}
                  title="Ignorer cet écart"
                  onClick={() => onSetReview(r.reviewKey, "ignored")}
                >
                  <svg viewBox="0 0 24 24" style={{ width: 12, height: 12, fill: "currentColor" }}>
                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                  </svg>
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
