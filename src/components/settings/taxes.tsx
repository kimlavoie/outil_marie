import { useState, useEffect } from "react";
import { appState, saveDatabaseOrRollback } from "../../state/state.ts";
import { showToast } from "../../utils/utils.ts";
import { rateToPercentString } from "../../utils/format.ts";

// Default TPS/TVQ rates applied to every activity unless overridden for that specific activity
// (see the "Ajuster les taxes..." link in the activity drawer). Kept configurable here so a
// future rate change doesn't require touching the code.
export function TaxesPanel({ active }: { active: boolean }) {
  const rates = appState.settings.tax_rates || { tps: 0.05, tvq: 0.09975 };
  const [tpsPct, setTpsPct] = useState(rateToPercentString(rates.tps));
  const [tvqPct, setTvqPct] = useState(rateToPercentString(rates.tvq));

  useEffect(() => {
    const current = appState.settings.tax_rates || { tps: 0.05, tvq: 0.09975 };
    setTpsPct(rateToPercentString(current.tps));
    setTvqPct(rateToPercentString(current.tvq));
  }, [active]);

  const save = () => {
    const tps = parseFloat(tpsPct);
    const tvq = parseFloat(tvqPct);
    if (isNaN(tps) || isNaN(tvq) || tps < 0 || tvq < 0) {
      showToast("Les taux doivent être des nombres valides.", "warning");
      return;
    }

    const previous = appState.settings.tax_rates;
    appState.settings.tax_rates = { tps: tps / 100, tvq: tvq / 100 };
    saveDatabaseOrRollback(() => {
      appState.settings.tax_rates = previous;
    }, "L'enregistrement des taux de taxes a échoué. Réessayez.").then(saved => {
      if (saved) showToast("Taux de taxes enregistrés.", "success");
    });
  };

  return (
    <div id="panel-taxes" className={`settings-panel${active ? " active" : ""}`}>
      <div className="settings-panel-header">
        <h3 className="settings-panel-title">Taxes</h3>
      </div>
      <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", maxWidth: 520 }}>
        Taux par défaut appliqués au sous-total de chaque activité. À ajuster uniquement si le taux légal change — pour un cas particulier
        propre à une seule activité (organisme exonéré, entente particulière), utilisez plutôt "Ajuster les taxes..." dans le formulaire de
        cette activité.
      </p>
      <div className="form-group" style={{ maxWidth: 280 }}>
        <label htmlFor="form-tax-rate-tps">TPS (%)</label>
        <input
          type="number"
          id="form-tax-rate-tps"
          className="form-input"
          step="0.001"
          min={0}
          value={tpsPct}
          onChange={e => setTpsPct(e.target.value)}
        />
      </div>
      <div className="form-group" style={{ maxWidth: 280 }}>
        <label htmlFor="form-tax-rate-tvq">TVQ (%)</label>
        <input
          type="number"
          id="form-tax-rate-tvq"
          className="form-input"
          step="0.001"
          min={0}
          value={tvqPct}
          onChange={e => setTvqPct(e.target.value)}
        />
      </div>
      <button className="btn btn-primary" style={{ padding: "6px 12px", fontSize: "0.8rem" }} onClick={save}>
        Enregistrer
      </button>
    </div>
  );
}
