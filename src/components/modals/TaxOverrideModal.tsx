import React, { useState, useEffect } from "react";
import { getActivityById } from "../../state/activities-repository.ts";
import { commitActivityPatch } from "../../activities/form-state-bar.ts";
import { updateSubmissionFinancialSummary } from "../../activities/financial-summary.ts";

interface TaxSectionState {
  mode: "default" | "rate" | "amount";
  value: string;
  note: string;
}

let openTaxSubscriber: ((activityId: string) => void) | null = null;

export function isTaxOverrideModalSubscribed() {
  return openTaxSubscriber !== null;
}

export function triggerOpenTaxOverrideModal(activityId: string) {
  if (openTaxSubscriber) {
    openTaxSubscriber(activityId);
  }
}

export const TaxOverrideModal: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [activityId, setActivityId] = useState<string | null>(null);
  const [isNonTaxable, setIsNonTaxable] = useState(false);

  const [tps, setTps] = useState<TaxSectionState>({ mode: "default", value: "", note: "" });
  const [tvq, setTvq] = useState<TaxSectionState>({ mode: "default", value: "", note: "" });

  useEffect(() => {
    openTaxSubscriber = (id: string) => {
      const act = getActivityById(id);
      if (!act) return;

      setActivityId(id);
      setIsNonTaxable(!!act.non_taxable);

      const overrides = act.tax_overrides || {};
      const initTax = (override: any): TaxSectionState => {
        if (!override || override.mode === "default") {
          return { mode: "default", value: "", note: "" };
        }
        const valStr = override.mode === "rate" ? String(override.value * 100) : String(override.value);
        return { mode: override.mode, value: valStr, note: override.note || "" };
      };

      setTps(initTax(overrides.tps));
      setTvq(initTax(overrides.tvq));
      setIsOpen(true);
    };
    return () => {
      openTaxSubscriber = null;
    };
  }, []);

  if (!isOpen || !activityId) return null;

  const handleSave = () => {
    const parseSection = (sec: TaxSectionState) => {
      if (sec.mode === "default") return undefined;
      const rawValue = Math.max(0, parseFloat(sec.value) || 0);
      const value = sec.mode === "rate" ? rawValue / 100 : rawValue;
      return { mode: sec.mode, value, note: sec.note.trim() };
    };

    const tpsOverride = parseSection(tps);
    const tvqOverride = parseSection(tvq);
    const tax_overrides = tpsOverride || tvqOverride ? { tps: tpsOverride, tvq: tvqOverride } : null;

    commitActivityPatch(activityId, (a: any) => {
      a.tax_overrides = tax_overrides;
    });

    setIsOpen(false);
    updateSubmissionFinancialSummary();
  };

  return (
    <>
      <div className="modal-backdrop active" onClick={() => setIsOpen(false)} />
      <div
        className="modal active"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tax-override-modal-title"
        style={{ width: "520px" }}
      >
        <div className="modal-header">
          <h3 className="modal-title" id="tax-override-modal-title">Ajuster les taxes</h3>
          <button type="button" className="btn-icon" aria-label="Fermer" onClick={() => setIsOpen(false)}>
            <svg viewBox="0 0 24 24" style={{ width: 18, height: 18, fill: "currentColor" }}>
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        </div>
        <div className="modal-content">
          <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginTop: 0 }}>
            Par défaut, les taux configurés dans Paramètres &gt; Taxes s'appliquent. Utilisez ceci uniquement pour un cas particulier propre à cette activité (organisme exonéré, entente particulière).
          </p>
          {isNonTaxable && (
            <p style={{ fontSize: "0.85rem", color: "var(--warning, #b45309)" }}>
              La case "Non taxable" est cochée pour cette activité : elle exempte déjà TPS et TVQ, et primera sur les réglages ci-dessous tant qu'elle reste cochée.
            </p>
          )}

          {/* TPS Section */}
          <div className="form-group">
            <label>TPS</label>
            <div style={{ display: "flex", gap: "8px" }}>
              <select
                className="select-input"
                style={{ flex: "0 0 150px" }}
                value={tps.mode}
                onChange={e => setTps(prev => ({ ...prev, mode: e.target.value as any }))}
              >
                <option value="default">Taux par défaut</option>
                <option value="rate">Taux personnalisé</option>
                <option value="amount">Montant fixe</option>
              </select>
              <input
                type="number"
                className="form-input"
                min="0"
                step="0.01"
                placeholder={tps.mode === "amount" ? "Montant ($)" : "Ex: 0 pour une exonération complète (%)"}
                disabled={tps.mode === "default"}
                value={tps.value}
                onChange={e => setTps(prev => ({ ...prev, value: e.target.value }))}
              />
            </div>
            <textarea
              className="form-input"
              rows={2}
              placeholder="Motif du remplacement (optionnel)..."
              style={{ marginTop: "6px" }}
              value={tps.note}
              onChange={e => setTps(prev => ({ ...prev, note: e.target.value }))}
            />
          </div>

          {/* TVQ Section */}
          <div className="form-group">
            <label>TVQ</label>
            <div style={{ display: "flex", gap: "8px" }}>
              <select
                className="select-input"
                style={{ flex: "0 0 150px" }}
                value={tvq.mode}
                onChange={e => setTvq(prev => ({ ...prev, mode: e.target.value as any }))}
              >
                <option value="default">Taux par défaut</option>
                <option value="rate">Taux personnalisé</option>
                <option value="amount">Montant fixe</option>
              </select>
              <input
                type="number"
                className="form-input"
                min="0"
                step="0.01"
                placeholder={tvq.mode === "amount" ? "Montant ($)" : "Ex: 0 pour une exonération complète (%)"}
                disabled={tvq.mode === "default"}
                value={tvq.value}
                onChange={e => setTvq(prev => ({ ...prev, value: e.target.value }))}
              />
            </div>
            <textarea
              className="form-input"
              rows={2}
              placeholder="Motif du remplacement (optionnel)..."
              style={{ marginTop: "6px" }}
              value={tvq.note}
              onChange={e => setTvq(prev => ({ ...prev, note: e.target.value }))}
            />
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={() => setIsOpen(false)}>
            Annuler
          </button>
          <button type="button" className="btn btn-primary" onClick={handleSave}>
            Enregistrer
          </button>
        </div>
      </div>
    </>
  );
};
