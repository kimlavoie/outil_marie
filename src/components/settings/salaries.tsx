import { useState, useEffect } from "react";
import { appState, saveDatabaseOrRollback, getActiveSalaryRate, getActiveSalaryOvertimeRate } from "../../state/state.ts";
import { showToast, generateUid, newRateVersionRow, RateVersionRow } from "../../utils/utils.ts";
import { requireNonEmpty } from "../../utils/validation.ts";
import { DeleteIcon, Modal, RateVersionsEditor } from "./common.tsx";

export function SalariesPanel({ active, openModal, bump }: { active: boolean; openModal: (id: string | null) => void; bump: () => void }) {
  const salaries: any[] = appState.settings.salaries || [];
  const deleteSalary = (id: string) => {
    const sal = salaries.find((s: { id: string }) => s.id === id);
    const jobName = sal ? sal.job : "";
    if (!confirm(`Voulez-vous vraiment supprimer l'emploi "${jobName}" ?`)) return;
    const prevSalaries = appState.settings.salaries;
    appState.settings.salaries = salaries.filter((s: { id: string }) => s.id !== id);
    saveDatabaseOrRollback(() => {
      appState.settings.salaries = prevSalaries;
    }, "La suppression n'a pas été enregistrée. Réessayez.").then(() => bump());
  };

  return (
    <div id="panel-salaries" className={`settings-panel${active ? " active" : ""}`}>
      <div className="settings-panel-header">
        <h3 className="settings-panel-title">Gestion de la main-d'oeuvre</h3>
        <button
          className="btn btn-primary btn-secondary"
          style={{ padding: "6px 12px", fontSize: "0.8rem" }}
          onClick={() => openModal(null)}
        >
          + Ajouter un emploi
        </button>
      </div>
      <div className="settings-list">
        {salaries.map((sal: { id: string; job: string; rate_versions?: any[] }) => {
          const currentRate = getActiveSalaryRate(sal, "");
          const currentOvertimeRate = getActiveSalaryOvertimeRate(sal, "");
          const isDT = sal.id === "salary-dt" || (sal.job && sal.job.toLowerCase() === "directeur technique");
          const overtimeNote = isDT && currentOvertimeRate > 0 ? ` · ${currentOvertimeRate.toFixed(2)} $ / heure (temps sup.)` : "";
          const versionsCount = (sal.rate_versions || []).length;
          const versionsNote = versionsCount > 1 ? ` (${versionsCount} versions)` : "";
          return (
            <div key={sal.id} className="settings-list-item" onClick={() => openModal(sal.id)}>
              <div className="settings-list-item-info">
                <span className="settings-list-item-code" style={{ fontFamily: "inherit" }}>
                  {sal.job}
                </span>
                <span className="settings-list-item-desc">
                  {currentRate.toFixed(2)} $ / heure{overtimeNote}
                  {versionsNote}
                </span>
              </div>
              <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                <button className="btn-icon" title="Supprimer" style={{ color: "var(--danger)" }} onClick={() => deleteSalary(sal.id)}>
                  <DeleteIcon />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function SalaryModal({ id, onClose, bump }: { id: string | null | undefined; onClose: () => void; bump: () => void }) {
  const isOpen = id !== undefined;
  const originalId = id || "";
  const [job, setJob] = useState("");
  const [rateRows, setRateRows] = useState<RateVersionRow[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    const salaries: any[] = appState.settings.salaries || [];
    const sal = originalId ? salaries.find((s: { id: string }) => s.id === originalId) : null;
    if (sal) {
      setJob(sal.job);
      setRateRows(
        (sal.rate_versions || []).map((v: any) =>
          newRateVersionRow(v.effective_date, String(v.rate), v.overtime_rate !== undefined ? String(v.overtime_rate) : "")
        )
      );
    } else {
      setJob("");
      setRateRows([newRateVersionRow()]);
    }
  }, [isOpen, originalId]);

  const submit = () => {
    const jobName = job.trim();
    const jobError = requireNonEmpty(jobName, "Le nom de l'emploi est obligatoire.");
    if (jobError) {
      showToast(jobError, "warning");
      return;
    }

    const isDirecteurTechnique = originalId === "salary-dt" || jobName.toLowerCase() === "directeur technique";

    let rateErrorMsg = "";
    const rateVersions: { id: string; effective_date: string; rate: number; overtime_rate: number }[] = [];
    rateRows.forEach(row => {
      const dateStr = row.effective_date.trim();
      const rateStr = row.rate.trim();
      const overtimeRateStr = isDirecteurTechnique ? (row.overtime_rate || "").trim() : "";
      const rate = parseFloat(rateStr);
      const overtimeRate = isDirecteurTechnique && overtimeRateStr ? parseFloat(overtimeRateStr) : 0;
      if (!dateStr && !rateStr && !overtimeRateStr) return;
      if (!rateStr || isNaN(rate) || rate < 0) {
        rateErrorMsg = "Veuillez saisir un taux horaire valide (supérieur ou égal à 0) pour chaque version.";
      } else if (isDirecteurTechnique && overtimeRateStr && (isNaN(overtimeRate) || overtimeRate < 0)) {
        rateErrorMsg = "Veuillez saisir un taux de temps supplémentaire valide (supérieur ou égal à 0), ou le laisser vide.";
      } else if (dateStr && !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        rateErrorMsg = "La date d'entrée en vigueur doit être au format AAAA-MM-JJ, ou vide.";
      } else {
        rateVersions.push({ id: generateUid("rv"), effective_date: dateStr, rate, overtime_rate: overtimeRate });
      }
    });

    if (rateErrorMsg) {
      showToast(rateErrorMsg, "warning");
      return;
    }
    if (rateVersions.length === 0) {
      showToast("Veuillez saisir au moins un taux horaire.", "warning");
      return;
    }

    const salaries: any[] = appState.settings.salaries || [];
    const duplicate = salaries.some(
      (s: { job: string; id: string }) => s.job.toUpperCase() === jobName.toUpperCase() && s.id !== originalId
    );
    if (duplicate) {
      showToast("Cet emploi existe déjà.", "warning");
      return;
    }

    const prevSalaries = [...salaries];
    if (originalId) {
      const idx = salaries.findIndex((s: { id: string }) => s.id === originalId);
      if (idx !== -1) salaries[idx] = { id: originalId, job: jobName, rate_versions: rateVersions };
    } else {
      salaries.push({ id: generateUid("salary"), job: jobName, rate_versions: rateVersions });
    }
    salaries.sort((a: { job: string }, b: { job: string }) => a.job.localeCompare(b.job));
    appState.settings.salaries = salaries;

    saveDatabaseOrRollback(() => {
      appState.settings.salaries = prevSalaries;
    }, "L'enregistrement de l'emploi a échoué. Réessayez.").then(saved => {
      if (!saved) {
        bump();
        return;
      }
      onClose();
      bump();
    });
  };

  const isDirecteurTechnique = originalId === "salary-dt" || job.trim().toLowerCase() === "directeur technique";

  return (
    <Modal
      id="salary-modal"
      titleId="salary-modal-title"
      title={originalId ? "Modifier l'emploi" : "Ajouter un emploi"}
      isOpen={isOpen}
      onClose={onClose}
      onSubmit={submit}
    >
      <div className="form-group">
        <label htmlFor="form-salary-job">Nom de l'emploi / fonction</label>
        <input
          type="text"
          id="form-salary-job"
          className="form-input"
          required
          placeholder="Ex: Technicien de scène"
          value={job}
          onChange={e => setJob(e.target.value)}
        />
      </div>
      <div className="distribution-section">
        <div className="distribution-header" style={{ marginBottom: 4 }}>
          <span className="field-label">Historique des taux horaires (taux régulier et temps supplémentaire)</span>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: "6px 12px", fontSize: "0.8rem" }}
            onClick={() => setRateRows([...rateRows, newRateVersionRow()])}
          >
            + Ajouter une version de tarif
          </button>
        </div>
        <p className="form-help-text" style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: 12, lineHeight: "1.4" }}>
          Saisissez les taux horaires applicables. Vous pouvez planifier des changements de taux futurs ou passés en indiquant une date
          d'effet (format AAAA-MM-JJ). Si aucune date n'est spécifiée, le taux s'applique par défaut (depuis toujours).
        </p>
        {rateRows.length > 0 && (
          <div
            className="distribution-row-header"
            style={{
              display: "grid",
              gridTemplateColumns: isDirecteurTechnique ? "1.4fr 1fr 1fr auto" : undefined,
              gap: 12,
              padding: "0 0 4px 0",
              borderBottom: "1px solid var(--border-color)",
              marginBottom: 8,
              fontSize: "0.75rem",
              textTransform: "uppercase",
              color: "var(--text-muted)",
              fontWeight: "bold"
            }}
          >
            <div>Date d'effet</div>
            <div>{isDirecteurTechnique ? "Taux régulier ($/h)" : "Taux horaire ($/h)"}</div>
            {isDirecteurTechnique && <div>Taux temps sup. ($/h)</div>}
            <div></div>
          </div>
        )}
        <RateVersionsEditor rows={rateRows} onChange={setRateRows} withOvertime={isDirecteurTechnique} />
      </div>
    </Modal>
  );
}
