import { useState, useEffect } from "react";
import { appState, saveDatabase, getActiveSalaryRate, getActiveSalaryOvertimeRate } from "../../state/state.js";
import { showToast, generateUid } from "../../utils/utils.ts";
import { EditIcon, DeleteIcon, Modal, GlAccountOptions, RateVersionsEditor, RateVersionRow, newRateVersionRow } from "./common.tsx";

export function SalariesPanel({ active, openModal, bump }: { active: boolean; openModal: (id: string | null) => void; bump: () => void }) {
  const salaries: any[] = appState.settings.salaries || [];
  const deleteSalary = (id: string) => {
    const sal = salaries.find((s: { id: string }) => s.id === id);
    const jobName = sal ? sal.job : "";
    if (!confirm(`Voulez-vous vraiment supprimer l'emploi "${jobName}" ?`)) return;
    appState.settings.salaries = salaries.filter((s: { id: string }) => s.id !== id);
    saveDatabase();
    bump();
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
        {salaries.map((sal: { id: string; job: string; rate_versions: unknown[] }) => {
          const currentRate = getActiveSalaryRate(sal, "");
          const currentOvertimeRate = getActiveSalaryOvertimeRate(sal, "");
          const overtimeNote = currentOvertimeRate > 0 ? ` · ${parseFloat(currentOvertimeRate).toFixed(2)} $ / heure (temps sup.)` : "";
          const versionCount = (sal.rate_versions || []).length;
          const versionNote = versionCount > 1 ? ` (${versionCount} versions)` : "";
          return (
            <div key={sal.id} className="settings-list-item">
              <div className="settings-list-item-info">
                <span className="settings-list-item-code" style={{ fontFamily: "inherit" }}>
                  {sal.job}
                </span>
                <span className="settings-list-item-desc">
                  {parseFloat(currentRate).toFixed(2)} $ / heure{overtimeNote}
                  {versionNote}
                </span>
              </div>
              <div className="flex gap-2">
                <button className="btn-icon" title="Modifier" onClick={() => openModal(sal.id)}>
                  <EditIcon />
                </button>
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
  const [glAccountCode, setGlAccountCode] = useState("");
  const [rows, setRows] = useState<RateVersionRow[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    const salaries: any[] = appState.settings.salaries || [];
    const sal = originalId ? salaries.find((s: { id: string }) => s.id === originalId) : null;
    if (sal) {
      setJob(sal.job);
      setGlAccountCode(sal.gl_account_code || "");
      setRows(
        (sal.rate_versions || []).map((v: { effective_date: string; rate: number; overtime_rate?: number }) =>
          newRateVersionRow(v.effective_date, String(v.rate), v.overtime_rate !== undefined ? String(v.overtime_rate) : "")
        )
      );
    } else {
      setJob("");
      setGlAccountCode("");
      setRows([newRateVersionRow()]);
    }
  }, [isOpen, originalId]);

  const submit = () => {
    const jobName = job.trim();
    if (!jobName) {
      showToast("Le nom de l'emploi est obligatoire.", "warning");
      return;
    }

    const rateVersions: { id: string; effective_date: string; rate: number; overtime_rate: number }[] = [];
    let rateErrorMsg = "";
    rows.forEach(row => {
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

    if (originalId) {
      const idx = salaries.findIndex((s: { id: string }) => s.id === originalId);
      if (idx !== -1) salaries[idx] = { id: originalId, job: jobName, gl_account_code: glAccountCode, rate_versions: rateVersions };
    } else {
      salaries.push({ id: generateUid("salary"), job: jobName, gl_account_code: glAccountCode, rate_versions: rateVersions });
    }
    salaries.sort((a: { job: string }, b: { job: string }) => a.job.localeCompare(b.job));
    appState.settings.salaries = salaries;

    saveDatabase();
    onClose();
    bump();
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
      <div className="form-group">
        <label htmlFor="form-salary-gl-account">Compte GL associé (optionnel, pour la facturation)</label>
        <select id="form-salary-gl-account" className="select-input" value={glAccountCode} onChange={e => setGlAccountCode(e.target.value)}>
          <GlAccountOptions />
        </select>
      </div>
      <div className="distribution-section">
        <div className="distribution-header">
          <span className="field-label">
            Historique des taux horaires (date d'entrée en vigueur, taux régulier et taux en temps supplémentaire)
          </span>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: "6px 12px", fontSize: "0.8rem" }}
            onClick={() => setRows([...rows, newRateVersionRow()])}
          >
            + Ajouter une version
          </button>
        </div>
        <RateVersionsEditor rows={rows} onChange={setRows} withOvertime />
      </div>
    </Modal>
  );
}
