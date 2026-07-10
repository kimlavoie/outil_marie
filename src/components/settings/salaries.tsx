import { useState, useEffect } from "react";
import { appState, saveDatabaseOrRollback, getActiveSalaryRate, getActiveSalaryOvertimeRate } from "../../state/state.ts";
import { showToast, generateUid, newRateVersionRow } from "../../utils/utils.ts";
import { requireNonEmpty } from "../../utils/validation.ts";
import { DeleteIcon, Modal, TarifsEditor, TarifRow } from "./common.tsx";

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
        <h3 className="settings-panel-title">Gestion des Salaires / Emplois</h3>
        <button
          className="btn btn-primary btn-secondary"
          style={{ padding: "6px 12px", fontSize: "0.8rem" }}
          onClick={() => openModal(null)}
        >
          + Ajouter un emploi
        </button>
      </div>
      <div className="settings-list">
        {salaries.map((sal: { id: string; job: string; tarifs: { label: string }[] }) => {
          const tarifs = sal.tarifs || [];
          const currentRate = getActiveSalaryRate(sal, "");
          const currentOvertimeRate = getActiveSalaryOvertimeRate(sal, "");
          const overtimeNote = currentOvertimeRate > 0 ? ` · ${currentOvertimeRate.toFixed(2)} $ / heure (temps sup.)` : "";
          const tarifNote = tarifs.length > 1 ? ` (${tarifs.length} tarifs)` : "";
          return (
            <div key={sal.id} className="settings-list-item" onClick={() => openModal(sal.id)}>
              <div className="settings-list-item-info">
                <span className="settings-list-item-code" style={{ fontFamily: "inherit" }}>
                  {sal.job}
                </span>
                <span className="settings-list-item-desc">
                  {currentRate.toFixed(2)} $ / heure{overtimeNote}
                  {tarifNote}
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
  const [tarifs, setTarifs] = useState<TarifRow[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    const salaries: any[] = appState.settings.salaries || [];
    const sal = originalId ? salaries.find((s: { id: string }) => s.id === originalId) : null;
    if (sal) {
      setJob(sal.job);
      setTarifs(
        (sal.tarifs || []).map((t: any) => ({
          key: generateUid("tarif-row"),
          label: t.label || "",
          gl_account_code: t.gl_account_code || "",
          rateRows: (t.rate_versions || []).map((v: any) =>
            newRateVersionRow(v.effective_date, String(v.rate), v.overtime_rate !== undefined ? String(v.overtime_rate) : "")
          )
        }))
      );
    } else {
      setJob("");
      setTarifs([{ key: generateUid("tarif-row"), label: "", gl_account_code: "", rateRows: [newRateVersionRow()] }]);
    }
  }, [isOpen, originalId]);

  const submit = () => {
    const jobName = job.trim();
    const jobError = requireNonEmpty(jobName, "Le nom de l'emploi est obligatoire.");
    if (jobError) {
      showToast(jobError, "warning");
      return;
    }

    let rateErrorMsg = "";
    const tarifsResult = tarifs.map(tarif => {
      const rateVersions: { id: string; effective_date: string; rate: number; overtime_rate: number }[] = [];
      tarif.rateRows.forEach(row => {
        const dateStr = row.effective_date.trim();
        const rateStr = row.rate.trim();
        const overtimeRateStr = (row.overtime_rate || "").trim();
        const rate = parseFloat(rateStr);
        const overtimeRate = overtimeRateStr ? parseFloat(overtimeRateStr) : 0;
        if (!dateStr && !rateStr && !overtimeRateStr) return;
        if (!rateStr || isNaN(rate) || rate < 0) {
          rateErrorMsg = "Veuillez saisir un taux horaire valide (supérieur ou égal à 0) pour chaque version.";
        } else if (overtimeRateStr && (isNaN(overtimeRate) || overtimeRate < 0)) {
          rateErrorMsg = "Veuillez saisir un taux de temps supplémentaire valide (supérieur ou égal à 0), ou le laisser vide.";
        } else if (dateStr && !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
          rateErrorMsg = "La date d'entrée en vigueur doit être au format AAAA-MM-JJ, ou vide.";
        } else {
          rateVersions.push({ id: generateUid("rv"), effective_date: dateStr, rate, overtime_rate: overtimeRate });
        }
      });
      return { id: generateUid("tarif"), label: tarif.label.trim(), gl_account_code: tarif.gl_account_code, rate_versions: rateVersions };
    });

    if (rateErrorMsg) {
      showToast(rateErrorMsg, "warning");
      return;
    }
    if (tarifsResult.length === 0 || tarifsResult.every(t => t.rate_versions.length === 0)) {
      showToast("Veuillez saisir au moins un tarif avec un taux horaire.", "warning");
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
      if (idx !== -1) salaries[idx] = { id: originalId, job: jobName, tarifs: tarifsResult };
    } else {
      salaries.push({ id: generateUid("salary"), job: jobName, tarifs: tarifsResult });
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
        <div className="distribution-header">
          <span className="field-label">Tarifs (compte budgétaire et historique de taux horaires)</span>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: "6px 12px", fontSize: "0.8rem" }}
            onClick={() =>
              setTarifs([...tarifs, { key: generateUid("tarif-row"), label: "", gl_account_code: "", rateRows: [newRateVersionRow()] }])
            }
          >
            + Ajouter un tarif
          </button>
        </div>
        <TarifsEditor rows={tarifs} onChange={setTarifs} withOvertime />
      </div>
    </Modal>
  );
}
