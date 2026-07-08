/**
 * settings-view.tsx - Settings view (6 CRUD sections: Comptes GL, Salles & Tarifs, Départements,
 * Salaires, Services, Tâches globales), ported from settings.js to React as part of Phase 4 of
 * the Vite/React/TS migration (see TODO.txt).
 *
 * appState.settings.* stays the single source of truth (same objects saveDatabase() persists) —
 * this component reads/mutates it directly and bumps a local `version` counter to re-render,
 * mirroring the old renderSettings()/renderXxxList() re-invocation pattern rather than
 * introducing a separate reactive state layer for data that already has one owner.
 *
 * navigation.js's global search ("jump to this record") calls openSettingsPanel(panel),
 * openAccountModal(code) and openDeptModal(name) as bare globals, and renderSettings() on every
 * view switch to "settings" — see js/navigation.js. Since those are imperative calls from
 * outside React, they're bridged through a small command/sequence-number queue that the mounted
 * component applies via useEffect (see `pendingCommand`/`mount()` at the bottom).
 */
import { useEffect, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  appState,
  saveDatabase,
  getActiveSalaryRate,
  getActiveSalaryOvertimeRate,
  getActiveServiceRate,
  getFlattenedRoomTarifs
} from "./state.js";
import { generateUid, formatCurrency, getRoomColor, FALLBACK_ROOM_COLORS, showToast } from "./utils.ts";
import { requireNonEmpty } from "./validation.ts";

// ---------------------------------------------------------------------------
// Shared bits: icons, GL account <select> options, modal wrapper, rate-versions editor
// ---------------------------------------------------------------------------

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
    </svg>
  );
}

function DeleteIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
    </svg>
  );
}

function GlAccountOptions({ selectedCode = "" }: { selectedCode?: string }) {
  return (
    <>
      <option value="">Aucun</option>
      {appState.settings.accounts.map(acc => (
        <option key={acc.code} value={acc.code} selected={acc.code === selectedCode}>
          {acc.code} ({acc.description})
        </option>
      ))}
    </>
  );
}

// Toggles the app-wide shared modal-backdrop element (used by every modal in the app, not just
// settings — see index.html #modal-backdrop) based on whether any settings modal is open.
function useSharedBackdrop(isOpen: boolean) {
  useEffect(() => {
    const backdrop = document.getElementById("modal-backdrop");
    if (backdrop) backdrop.classList.toggle("active", isOpen);
  }, [isOpen]);
}

function Modal({
  id,
  titleId,
  title,
  isOpen,
  onClose,
  onSubmit,
  submitLabel = "Enregistrer",
  width,
  children
}: {
  id: string;
  titleId: string;
  title: string;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: () => void;
  submitLabel?: string;
  width?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      id={id}
      className={`modal${isOpen ? " active" : ""}`}
      style={width ? { width, maxWidth: "95vw" } : undefined}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="modal-header">
        <h3 id={titleId} className="modal-title">
          {title}
        </h3>
        <button className="btn-icon" aria-label="Fermer" onClick={onClose}>
          <CloseIcon />
        </button>
      </div>
      <div className="modal-content">
        <form
          onSubmit={e => {
            e.preventDefault();
            onSubmit();
          }}
        >
          {children}
        </form>
      </div>
      <div className="modal-footer">
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Annuler
        </button>
        <button type="button" className="btn btn-primary" onClick={onSubmit}>
          {submitLabel}
        </button>
      </div>
    </div>
  );
}

interface RateVersionRow {
  key: string;
  effective_date: string;
  rate: string;
  overtime_rate?: string;
}

function newRateVersionRow(effective_date = "", rate = "", overtime_rate?: string): RateVersionRow {
  return { key: generateUid("rate-row"), effective_date, rate, overtime_rate };
}

// Shared by the Salaries and Services modals: a list of {effective_date, rate[, overtime_rate]}
// rows. `withOvertime` toggles the 3rd column (salaries only).
function RateVersionsEditor({
  rows,
  onChange,
  withOvertime
}: {
  rows: RateVersionRow[];
  onChange: (rows: RateVersionRow[]) => void;
  withOvertime: boolean;
}) {
  const update = (i: number, patch: Partial<RateVersionRow>) => {
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  };
  const remove = (i: number) => onChange(rows.filter((_, idx) => idx !== i));

  return (
    <div className="distribution-list">
      {rows.map((row, i) => (
        <div key={row.key} className="distribution-row" style={{ gridTemplateColumns: withOvertime ? "1.4fr 1fr 1fr auto" : undefined }}>
          <input
            type="text"
            className="form-input"
            value={row.effective_date}
            placeholder="AAAA-MM-JJ (vide = depuis toujours)"
            style={{ padding: "8px 12px", fontSize: "0.85rem" }}
            onChange={e => update(i, { effective_date: e.target.value })}
          />
          <input
            type="number"
            className="form-input"
            min={0}
            step={0.01}
            value={row.rate}
            placeholder={withOvertime ? "Taux régulier $/h" : "Montant $"}
            style={{ padding: "8px 12px", fontSize: "0.85rem" }}
            onChange={e => update(i, { rate: e.target.value })}
          />
          {withOvertime && (
            <input
              type="number"
              className="form-input"
              min={0}
              step={0.01}
              value={row.overtime_rate ?? ""}
              placeholder="Taux temps sup. $/h"
              title="Taux horaire en temps supplémentaire (optionnel)"
              style={{ padding: "8px 12px", fontSize: "0.85rem" }}
              onChange={e => update(i, { overtime_rate: e.target.value })}
            />
          )}
          <button type="button" className="btn-icon" style={{ width: 14, height: 14 }} onClick={() => remove(i)}>
            <DeleteIcon />
          </button>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Accounts (Comptes GL)
// ---------------------------------------------------------------------------

function AccountsPanel({
  active,
  bump,
  openModal
}: {
  active: boolean;
  bump: () => void;
  openModal: (code: string | null) => void;
}) {
  const deleteAccount = (code: string) => {
    if (!confirm(`Voulez-vous vraiment supprimer le compte ${code} ? Les ventilations liées à ce compte seront effacées.`)) return;
    appState.settings.accounts = appState.settings.accounts.filter(a => a.code !== code);
    appState.activities.forEach(act => {
      act.distributions = act.distributions.filter((d: { account_code: string }) => d.account_code !== code);
    });
    saveDatabase();
    window.populateDropdowns();
    bump();
  };

  return (
    <div id="panel-accounts" className={`settings-panel${active ? " active" : ""}`}>
      <div className="settings-panel-header">
        <h3 className="settings-panel-title">Comptes de Grand Livre (Postes budgétaires)</h3>
        <button className="btn btn-primary btn-secondary" style={{ padding: "6px 12px", fontSize: "0.8rem" }} onClick={() => openModal(null)}>
          + Ajouter un compte
        </button>
      </div>
      <div className="settings-list">
        {appState.settings.accounts.map(acc => (
          <div key={acc.code} className="settings-list-item">
            <div className="settings-list-item-info">
              <span className="settings-list-item-code">{acc.code}</span>
              <span className="settings-list-item-desc">{acc.description}</span>
            </div>
            <div className="flex gap-2">
              <button className="btn-icon" title="Modifier" onClick={() => openModal(acc.code)}>
                <EditIcon />
              </button>
              <button className="btn-icon" title="Supprimer" style={{ color: "var(--danger)" }} onClick={() => deleteAccount(acc.code)}>
                <DeleteIcon />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AccountModal({ code, onClose, bump }: { code: string | null | undefined; onClose: () => void; bump: () => void }) {
  const isOpen = code !== undefined;
  const originalCode = code || "";
  const existing = originalCode ? appState.settings.accounts.find(a => a.code === originalCode) : null;
  const [codeVal, setCodeVal] = useState("");
  const [desc, setDesc] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setCodeVal(existing ? existing.code : "");
    setDesc(existing ? existing.description : "");
    // Only re-run when the modal is (re)opened for a given code, not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, originalCode]);

  const submit = () => {
    const newCode = codeVal.trim();
    const description = desc.trim();

    if (!newCode.match(/^\d{3}-\d{4}-\d{2}-\d{3}$/)) {
      showToast("Le code du compte doit respecter le format XXX-XXXX-XX-XXX (ex: 892-9020-00-849).", "warning");
      return;
    }
    if (!description) {
      showToast("Veuillez saisir un libellé.", "warning");
      return;
    }

    const payload = { code: newCode, description };

    if (originalCode) {
      const idx = appState.settings.accounts.findIndex(a => a.code === originalCode);
      if (idx !== -1) {
        appState.settings.accounts[idx] = payload;
        appState.activities.forEach(act => {
          act.distributions.forEach((dist: { account_code: string }) => {
            if (dist.account_code === originalCode) dist.account_code = newCode;
          });
        });
      }
    } else {
      if (appState.settings.accounts.some(a => a.code === newCode)) {
        showToast("Ce code de compte existe déjà.", "warning");
        return;
      }
      appState.settings.accounts.push(payload);
    }

    appState.settings.accounts.sort((a, b) => a.code.localeCompare(b.code));
    saveDatabase();
    onClose();
    window.populateDropdowns();
    bump();
  };

  return (
    <Modal
      id="account-modal"
      titleId="account-modal-title"
      title={originalCode ? "Modifier le compte GL" : "Ajouter un compte"}
      isOpen={isOpen}
      onClose={onClose}
      onSubmit={submit}
    >
      <div className="form-group">
        <label htmlFor="form-account-code">Numéro de compte (XXX-XXXX-XX-XXX)</label>
        <input
          type="text"
          id="form-account-code"
          className="form-input"
          required
          placeholder="XXX-XXXX-XX-XXX"
          value={codeVal}
          onChange={e => setCodeVal(e.target.value)}
        />
      </div>
      <div className="form-group">
        <label htmlFor="form-account-desc">Description / Libellé</label>
        <input
          type="text"
          id="form-account-desc"
          className="form-input"
          required
          placeholder="Ex: SCOLAIRE"
          value={desc}
          onChange={e => setDesc(e.target.value)}
        />
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Departments (Départements)
// ---------------------------------------------------------------------------

function DepartmentsPanel({
  active,
  openModal,
  bump
}: {
  active: boolean;
  openModal: (name: string | null) => void;
  bump: () => void;
}) {
  const deleteDept = (name: string) => {
    if (!confirm(`Voulez-vous vraiment supprimer le département "${name}" ?`)) return;
    appState.settings.departments = appState.settings.departments.filter((d: string) => d !== name);
    saveDatabase();
    window.populateDropdowns();
    bump();
  };

  return (
    <div id="panel-departments" className={`settings-panel${active ? " active" : ""}`}>
      <div className="settings-panel-header">
        <h3 className="settings-panel-title">Départements pour Facturation</h3>
        <button className="btn btn-primary btn-secondary" style={{ padding: "6px 12px", fontSize: "0.8rem" }} onClick={() => openModal(null)}>
          + Ajouter un département
        </button>
      </div>
      <div className="settings-list">
        {appState.settings.departments.map((dept: string) => (
          <div key={dept} className="settings-list-item">
            <div className="settings-list-item-info">
              <span className="settings-list-item-code" style={{ fontFamily: "inherit" }}>
                {dept}
              </span>
            </div>
            <div className="flex gap-2">
              <button className="btn-icon" title="Modifier" onClick={() => openModal(dept)}>
                <EditIcon />
              </button>
              <button className="btn-icon" title="Supprimer" style={{ color: "var(--danger)" }} onClick={() => deleteDept(dept)}>
                <DeleteIcon />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DeptModal({ name, onClose, bump }: { name: string | null | undefined; onClose: () => void; bump: () => void }) {
  const isOpen = name !== undefined;
  const originalName = name || "";
  const [nameVal, setNameVal] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setNameVal(originalName);
  }, [isOpen, originalName]);

  const submit = () => {
    const newName = nameVal.trim();
    const nameError = requireNonEmpty(newName, "Le nom du département est obligatoire.");
    if (nameError) {
      showToast(nameError, "warning");
      return;
    }

    const duplicate = appState.settings.departments.some(
      (d: string) => d.toUpperCase() === newName.toUpperCase() && d.toUpperCase() !== originalName.toUpperCase()
    );
    if (duplicate) {
      showToast("Ce département existe déjà.", "warning");
      return;
    }

    if (originalName) {
      const idx = appState.settings.departments.findIndex((d: string) => d === originalName);
      if (idx !== -1) {
        appState.settings.departments[idx] = newName;
        appState.activities.forEach(act => {
          if (act.department === originalName) act.department = newName;
        });
      }
    } else {
      appState.settings.departments.push(newName);
    }

    appState.settings.departments.sort();
    saveDatabase();
    onClose();
    window.populateDropdowns();
    bump();
  };

  return (
    <Modal
      id="dept-modal"
      titleId="dept-modal-title"
      title={originalName ? "Modifier le département" : "Ajouter un département"}
      isOpen={isOpen}
      onClose={onClose}
      onSubmit={submit}
    >
      <div className="form-group">
        <label htmlFor="form-dept-name">Nom du département</label>
        <input
          type="text"
          id="form-dept-name"
          className="form-input"
          required
          placeholder="Ex: ACEECJ"
          value={nameVal}
          onChange={e => setNameVal(e.target.value)}
        />
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Global tasks (Tâches globales)
// ---------------------------------------------------------------------------

function GlobalTasksPanel({
  active,
  openModal,
  bump
}: {
  active: boolean;
  openModal: (id: string | null) => void;
  bump: () => void;
}) {
  const globalTasks = appState.settings.global_tasks || [];
  const deleteGlobalTask = (id: string) => {
    if (!confirm("Voulez-vous vraiment supprimer cette tâche globale ?")) return;
    appState.settings.global_tasks = globalTasks.filter((t: { id: string }) => t.id !== id);
    saveDatabase();
    bump();
  };

  return (
    <div id="panel-global-tasks" className={`settings-panel${active ? " active" : ""}`}>
      <div className="settings-panel-header">
        <h3 className="settings-panel-title">Tâches globales de planification</h3>
        <button className="btn btn-primary btn-secondary" style={{ padding: "6px 12px", fontSize: "0.8rem" }} onClick={() => openModal(null)}>
          + Ajouter une tâche globale
        </button>
      </div>
      <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", margin: "0 0 12px" }}>
        Ces tâches sont ajoutées automatiquement à la liste de planification de chaque activité lors de l'insertion automatique des
        tâches.
      </p>
      <div className="settings-list">
        {globalTasks.map((t: { id: string; description: string }) => (
          <div key={t.id} className="settings-list-item">
            <div className="settings-list-item-info">
              <span className="settings-list-item-desc">{t.description}</span>
            </div>
            <div className="flex gap-2">
              <button className="btn-icon" title="Modifier" onClick={() => openModal(t.id)}>
                <EditIcon />
              </button>
              <button className="btn-icon" title="Supprimer" style={{ color: "var(--danger)" }} onClick={() => deleteGlobalTask(t.id)}>
                <DeleteIcon />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function GlobalTaskModal({ id, onClose, bump }: { id: string | null | undefined; onClose: () => void; bump: () => void }) {
  const isOpen = id !== undefined;
  const originalId = id || "";
  const [desc, setDesc] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    const task = originalId ? (appState.settings.global_tasks || []).find((t: { id: string }) => t.id === originalId) : null;
    setDesc(task ? task.description : "");
  }, [isOpen, originalId]);

  const submit = () => {
    const description = desc.trim();
    if (!description) {
      showToast("Veuillez saisir une description.", "warning");
      return;
    }

    const globalTasks = appState.settings.global_tasks || [];
    if (originalId) {
      const idx = globalTasks.findIndex((t: { id: string }) => t.id === originalId);
      if (idx !== -1) globalTasks[idx].description = description;
    } else {
      globalTasks.push({ id: generateUid("global-task"), description });
    }
    appState.settings.global_tasks = globalTasks;

    saveDatabase();
    onClose();
    bump();
  };

  return (
    <Modal
      id="global-task-modal"
      titleId="global-task-modal-title"
      title={originalId ? "Modifier la tâche globale" : "Ajouter une tâche globale"}
      isOpen={isOpen}
      onClose={onClose}
      onSubmit={submit}
    >
      <div className="form-group">
        <label htmlFor="form-global-task-desc">Description de la tâche</label>
        <input
          type="text"
          id="form-global-task-desc"
          className="form-input"
          required
          placeholder="Ex: Envoyer la confirmation au client"
          value={desc}
          onChange={e => setDesc(e.target.value)}
        />
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Salaries (Salaires) — versioned hourly rates
// ---------------------------------------------------------------------------

function SalariesPanel({
  active,
  openModal,
  bump
}: {
  active: boolean;
  openModal: (id: string | null) => void;
  bump: () => void;
}) {
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
        <button className="btn btn-primary btn-secondary" style={{ padding: "6px 12px", fontSize: "0.8rem" }} onClick={() => openModal(null)}>
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

function SalaryModal({ id, onClose, bump }: { id: string | null | undefined; onClose: () => void; bump: () => void }) {
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
    const duplicate = salaries.some((s: { job: string; id: string }) => s.job.toUpperCase() === jobName.toUpperCase() && s.id !== originalId);
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
          <label>Historique des taux horaires (date d'entrée en vigueur, taux régulier et taux en temps supplémentaire)</label>
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

// ---------------------------------------------------------------------------
// Services — fixed or hourly, versioned rates
// ---------------------------------------------------------------------------

function ServicesPanel({
  active,
  openModal,
  bump
}: {
  active: boolean;
  openModal: (id: string | null) => void;
  bump: () => void;
}) {
  const services = appState.settings.services || [];
  const deleteService = (id: string) => {
    const svc = services.find((s: { id: string }) => s.id === id);
    const serviceName = svc ? svc.name : "";
    if (!confirm(`Voulez-vous vraiment supprimer le service "${serviceName}" ?`)) return;
    appState.settings.services = services.filter((s: { id: string }) => s.id !== id);
    saveDatabase();
    bump();
  };

  return (
    <div id="panel-services" className={`settings-panel${active ? " active" : ""}`}>
      <div className="settings-panel-header">
        <h3 className="settings-panel-title">Gestion des Services</h3>
        <button className="btn btn-primary btn-secondary" style={{ padding: "6px 12px", fontSize: "0.8rem" }} onClick={() => openModal(null)}>
          + Ajouter un service
        </button>
      </div>
      <div className="settings-list">
        {services.map((svc: { id: string; name: string; type: string; rate_versions: unknown[] }) => {
          const currentRate = getActiveServiceRate(svc, "");
          const versionCount = (svc.rate_versions || []).length;
          const versionNote = versionCount > 1 ? ` (${versionCount} versions)` : "";
          const unit = svc.type === "hourly" ? "$ / heure" : "$";
          return (
            <div key={svc.id} className="settings-list-item">
              <div className="settings-list-item-info">
                <span className="settings-list-item-code" style={{ fontFamily: "inherit" }}>
                  {svc.name}
                </span>
                <span className="settings-list-item-desc">
                  {parseFloat(currentRate).toFixed(2)} {unit}
                  {versionNote}
                </span>
              </div>
              <div className="flex gap-2">
                <button className="btn-icon" title="Modifier" onClick={() => openModal(svc.id)}>
                  <EditIcon />
                </button>
                <button className="btn-icon" title="Supprimer" style={{ color: "var(--danger)" }} onClick={() => deleteService(svc.id)}>
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

function ServiceModal({ id, onClose, bump }: { id: string | null | undefined; onClose: () => void; bump: () => void }) {
  const isOpen = id !== undefined;
  const originalId = id || "";
  const [name, setName] = useState("");
  const [type, setType] = useState("fixed");
  const [glAccountCode, setGlAccountCode] = useState("");
  const [rows, setRows] = useState<RateVersionRow[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    const services = appState.settings.services || [];
    const svc = originalId ? services.find((s: { id: string }) => s.id === originalId) : null;
    if (svc) {
      setName(svc.name);
      setType(svc.type || "fixed");
      setGlAccountCode(svc.gl_account_code || "");
      setRows((svc.rate_versions || []).map((v: { effective_date: string; rate: number }) => newRateVersionRow(v.effective_date, String(v.rate))));
    } else {
      setName("");
      setType("fixed");
      setGlAccountCode("");
      setRows([newRateVersionRow()]);
    }
  }, [isOpen, originalId]);

  const submit = () => {
    const serviceName = name.trim();
    const nameError = requireNonEmpty(serviceName, "Le nom du service est obligatoire.");
    if (nameError) {
      showToast(nameError, "warning");
      return;
    }

    const rateVersions: { id: string; effective_date: string; rate: number }[] = [];
    let rateErrorMsg = "";
    rows.forEach(row => {
      const dateStr = row.effective_date.trim();
      const rateStr = row.rate.trim();
      const rate = parseFloat(rateStr);
      if (!dateStr && !rateStr) return;
      if (!rateStr || isNaN(rate) || rate < 0) {
        rateErrorMsg = "Veuillez saisir un montant valide (supérieur ou égal à 0) pour chaque version.";
      } else if (dateStr && !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        rateErrorMsg = "La date d'entrée en vigueur doit être au format AAAA-MM-JJ, ou vide.";
      } else {
        rateVersions.push({ id: generateUid("rv"), effective_date: dateStr, rate });
      }
    });

    if (rateErrorMsg) {
      showToast(rateErrorMsg, "warning");
      return;
    }
    if (rateVersions.length === 0) {
      showToast("Veuillez saisir au moins un montant.", "warning");
      return;
    }

    const services = appState.settings.services || [];
    const duplicate = services.some(
      (s: { name: string; id: string }) => s.name.toUpperCase() === serviceName.toUpperCase() && s.id !== originalId
    );
    if (duplicate) {
      showToast("Ce service existe déjà.", "warning");
      return;
    }

    if (originalId) {
      const idx = services.findIndex((s: { id: string }) => s.id === originalId);
      if (idx !== -1) {
        services[idx] = { id: originalId, name: serviceName, type, gl_account_code: glAccountCode, rate_versions: rateVersions };
      }
    } else {
      services.push({ id: generateUid("service"), name: serviceName, type, gl_account_code: glAccountCode, rate_versions: rateVersions });
    }
    services.sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name));
    appState.settings.services = services;

    saveDatabase();
    onClose();
    bump();
  };

  return (
    <Modal
      id="service-modal"
      titleId="service-modal-title"
      title={originalId ? "Modifier le service" : "Ajouter un service"}
      isOpen={isOpen}
      onClose={onClose}
      onSubmit={submit}
    >
      <div className="form-group">
        <label htmlFor="form-service-name">Nom du service</label>
        <input
          type="text"
          id="form-service-name"
          className="form-input"
          required
          placeholder="Ex: Location d'écran"
          value={name}
          onChange={e => setName(e.target.value)}
        />
      </div>
      <div className="form-group">
        <label htmlFor="form-service-type">Type de frais</label>
        <select id="form-service-type" className="select-input" value={type} onChange={e => setType(e.target.value)}>
          <option value="fixed">Frais fixe</option>
          <option value="hourly">Frais horaire</option>
        </select>
      </div>
      <div className="form-group">
        <label htmlFor="form-service-gl-account">Compte budgétaire associé (optionnel, pour la facturation)</label>
        <select id="form-service-gl-account" className="select-input" value={glAccountCode} onChange={e => setGlAccountCode(e.target.value)}>
          <GlAccountOptions />
        </select>
      </div>
      <div className="distribution-section">
        <div className="distribution-header">
          <label>Historique des tarifs (date d'entrée en vigueur et montant)</label>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: "6px 12px", fontSize: "0.8rem" }}
            onClick={() => setRows([...rows, newRateVersionRow()])}
          >
            + Ajouter une version
          </button>
        </div>
        <RateVersionsEditor rows={rows} onChange={setRows} withOvertime={false} />
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Rooms (Salles & Tarifs) — pricing grid editor + linked rooms/staff/fees/tasks
// ---------------------------------------------------------------------------

interface GridParam {
  id: string;
  name: string;
  gl_account_code?: string;
}
interface GridClientType {
  id: string;
  name: string;
}
interface GridCell {
  parameter_id: string;
  client_type_id: string;
  amount: number;
}
interface PricingGrid {
  id: string;
  effective_date: string;
  parameters: GridParam[];
  client_types: GridClientType[];
  cells: GridCell[];
}
interface LinkedStaffRow {
  key: string;
  salaryId: string;
  count: string;
}
interface LinkedFeeRow {
  key: string;
  desc: string;
  amount: string;
  glCode: string;
}
interface LinkedTaskRow {
  key: string;
  desc: string;
}

function RoomsPanel({
  active,
  openModal,
  bump
}: {
  active: boolean;
  openModal: (name: string | null) => void;
  bump: () => void;
}) {
  const deleteRoom = (name: string) => {
    if (!confirm(`Voulez-vous vraiment supprimer la salle ${name} ?`)) return;
    appState.settings.rooms = appState.settings.rooms.filter((r: { name: string }) => r.name !== name);
    appState.settings.rooms.forEach((r: { linked_rooms?: string[] }) => {
      r.linked_rooms = (r.linked_rooms || []).filter((n: string) => n !== name);
    });
    saveDatabase();
    window.populateDropdowns();
    bump();
  };

  return (
    <div id="panel-rooms" className={`settings-panel${active ? " active" : ""}`}>
      <div className="settings-panel-header">
        <h3 className="settings-panel-title">Gestion des Salles</h3>
        <button className="btn btn-primary btn-secondary" style={{ padding: "6px 12px", fontSize: "0.8rem" }} onClick={() => openModal(null)}>
          + Ajouter une salle
        </button>
      </div>
      <div className="settings-list">
        {appState.settings.rooms.map((r: { name: string; pricing_grids?: unknown[] }) => {
          const tarifs = getFlattenedRoomTarifs(r, "");
          const tarifsDesc = tarifs.length
            ? tarifs.map((t: { description: string; amount: number }) => `${t.description}: ${formatCurrency(t.amount)}/jour`).join(" · ")
            : "Aucun tarif défini";
          const versionCount = (r.pricing_grids || []).length;
          const versionNote = versionCount > 1 ? ` (${versionCount} versions)` : "";
          return (
            <div key={r.name} className="settings-list-item">
              <div className="settings-list-item-info">
                <span className="room-color-swatch" style={{ backgroundColor: getRoomColor(r.name) }} title="Couleur de la salle" />
                <span className="settings-list-item-code">{r.name}</span>
                <span className="settings-list-item-desc">
                  {tarifsDesc}
                  {versionNote}
                </span>
              </div>
              <div className="flex gap-2">
                <button className="btn-icon" title="Modifier" onClick={() => openModal(r.name)}>
                  <EditIcon />
                </button>
                <button className="btn-icon" title="Supprimer" style={{ color: "var(--danger)" }} onClick={() => deleteRoom(r.name)}>
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

function RoomModal({ name, onClose, bump }: { name: string | null | undefined; onClose: () => void; bump: () => void }) {
  const isOpen = name !== undefined;
  const originalName = name || "";

  const [roomName, setRoomName] = useState("");
  const [color, setColor] = useState("#4f46e5");
  const [grids, setGrids] = useState<PricingGrid[]>([]);
  const [activeGridIndex, setActiveGridIndex] = useState(0);
  const [linkedRooms, setLinkedRooms] = useState<string[]>([]);
  const [linkedStaff, setLinkedStaff] = useState<LinkedStaffRow[]>([]);
  const [linkedFees, setLinkedFees] = useState<LinkedFeeRow[]>([]);
  const [linkedTasks, setLinkedTasks] = useState<LinkedTaskRow[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    const room = originalName ? appState.settings.rooms.find((r: { name: string }) => r.name === originalName) : null;

    setRoomName(room ? room.name : "");
    setColor(room ? getRoomColor(room.name) : FALLBACK_ROOM_COLORS[appState.settings.rooms.length % FALLBACK_ROOM_COLORS.length]);

    let initialGrids: PricingGrid[] = room ? JSON.parse(JSON.stringify(room.pricing_grids || [])) : [];
    if (initialGrids.length === 0) {
      initialGrids = [{ id: generateUid("grid"), effective_date: "", parameters: [], client_types: [], cells: [] }];
    }
    setGrids(initialGrids);
    setActiveGridIndex(initialGrids.length - 1);

    setLinkedRooms((room && room.linked_rooms) || []);
    setLinkedStaff(
      ((room && room.linked_staff) || []).map((s: { salary_id: string; count: number }) => ({
        key: generateUid("linked-staff-row"),
        salaryId: s.salary_id,
        count: String(s.count)
      }))
    );
    setLinkedFees(
      ((room && room.linked_fees) || []).map((f: { description: string; amount: number; gl_account_code: string }) => ({
        key: generateUid("linked-fee-row"),
        desc: f.description,
        amount: String(f.amount),
        glCode: f.gl_account_code || ""
      }))
    );
    setLinkedTasks(
      ((room && room.linked_tasks) || []).map((t: { description: string }) => ({ key: generateUid("linked-task-row"), desc: t.description }))
    );
  }, [isOpen, originalName]);

  const activeGrid = grids[activeGridIndex];

  const updateActiveGrid = (patch: Partial<PricingGrid>) => {
    setGrids(prev => prev.map((g, i) => (i === activeGridIndex ? { ...g, ...patch } : g)));
  };

  const addVersion = () => {
    const clone: PricingGrid = { ...JSON.parse(JSON.stringify(activeGrid)), id: generateUid("grid"), effective_date: "" };
    setGrids(prev => [...prev, clone]);
    setActiveGridIndex(grids.length);
  };

  const deleteVersion = () => {
    if (grids.length <= 1) {
      showToast("Une salle doit conserver au moins une version de grille tarifaire.", "warning");
      return;
    }
    if (!confirm("Supprimer cette version de la grille tarifaire ?")) return;
    setGrids(prev => prev.filter((_, i) => i !== activeGridIndex));
    setActiveGridIndex(prev => Math.max(0, prev - 1));
  };

  const addParameter = () => {
    updateActiveGrid({ parameters: [...activeGrid.parameters, { id: generateUid("param"), name: "" }] });
  };
  const updateParameter = (i: number, patch: Partial<GridParam>) => {
    updateActiveGrid({ parameters: activeGrid.parameters.map((p, idx) => (idx === i ? { ...p, ...patch } : p)) });
  };
  const deleteParameter = (i: number) => {
    const removedId = activeGrid.parameters[i].id;
    updateActiveGrid({
      parameters: activeGrid.parameters.filter((_, idx) => idx !== i),
      cells: activeGrid.cells.filter(c => c.parameter_id !== removedId)
    });
  };

  const addClientType = () => {
    updateActiveGrid({ client_types: [...activeGrid.client_types, { id: generateUid("ct"), name: "" }] });
  };
  const updateClientType = (i: number, patch: Partial<GridClientType>) => {
    updateActiveGrid({ client_types: activeGrid.client_types.map((ct, idx) => (idx === i ? { ...ct, ...patch } : ct)) });
  };
  const deleteClientType = (i: number) => {
    const removedId = activeGrid.client_types[i].id;
    updateActiveGrid({
      client_types: activeGrid.client_types.filter((_, idx) => idx !== i),
      cells: activeGrid.cells.filter(c => c.client_type_id !== removedId)
    });
  };

  const setCellAmount = (paramId: string, ctId: string, amount: number) => {
    const existing = activeGrid.cells.find(c => c.parameter_id === paramId && c.client_type_id === ctId);
    if (existing) {
      updateActiveGrid({ cells: activeGrid.cells.map(c => (c === existing ? { ...c, amount } : c)) });
    } else {
      updateActiveGrid({ cells: [...activeGrid.cells, { parameter_id: paramId, client_type_id: ctId, amount }] });
    }
  };

  const toggleLinkedRoom = (roomName: string) => {
    setLinkedRooms(prev => (prev.includes(roomName) ? prev.filter(n => n !== roomName) : [...prev, roomName]));
  };

  const submit = () => {
    const newName = roomName.trim().toUpperCase();
    if (!newName) {
      showToast("Le nom de la salle est obligatoire.", "warning");
      return;
    }

    let gridErrorMsg = "";
    grids.forEach(g => {
      if (g.parameters.length === 0 || g.client_types.length === 0) {
        gridErrorMsg = "Chaque version de la grille tarifaire doit avoir au moins un paramètre et un type de client.";
      } else if (g.parameters.some(p => !p.name.trim()) || g.client_types.some(ct => !ct.name.trim())) {
        gridErrorMsg = "Veuillez nommer chaque paramètre et chaque type de client de la grille tarifaire.";
      }
    });
    if (gridErrorMsg) {
      showToast(gridErrorMsg, "warning");
      return;
    }

    const linkedStaffPayload: { id: string; salary_id: string; count: number }[] = [];
    let staffErrorMsg = "";
    linkedStaff.forEach(row => {
      const salaryId = row.salaryId;
      const countStr = row.count.trim();
      const count = parseInt(countStr, 10);
      if (!salaryId && !countStr) return;
      if (!salaryId) {
        staffErrorMsg = "Veuillez sélectionner un emploi pour chaque ligne de personnel lié.";
      } else if (!countStr || isNaN(count) || count < 1) {
        staffErrorMsg = "Veuillez saisir une quantité valide (au moins 1) pour chaque personnel lié.";
      } else {
        linkedStaffPayload.push({ id: generateUid("linked-staff"), salary_id: salaryId, count });
      }
    });
    if (staffErrorMsg) {
      showToast(staffErrorMsg, "warning");
      return;
    }

    const linkedFeesPayload: { id: string; description: string; amount: number; gl_account_code: string }[] = [];
    let feeErrorMsg = "";
    linkedFees.forEach(row => {
      const desc = row.desc.trim();
      const amtStr = row.amount.trim();
      const amt = parseFloat(amtStr);
      if (!desc && !amtStr) return;
      if (!desc) {
        feeErrorMsg = "Veuillez saisir une description pour chaque frais lié.";
      } else if (!amtStr || isNaN(amt) || amt < 0) {
        feeErrorMsg = "Veuillez saisir un montant valide pour chaque frais lié.";
      } else {
        linkedFeesPayload.push({ id: generateUid("linked-fee"), description: desc, amount: amt, gl_account_code: row.glCode });
      }
    });
    if (feeErrorMsg) {
      showToast(feeErrorMsg, "warning");
      return;
    }

    const linkedTasksPayload = linkedTasks
      .map(row => row.desc.trim())
      .filter(Boolean)
      .map(desc => ({ id: generateUid("linked-task"), description: desc }));

    const payload = {
      name: newName,
      color,
      pricing_grids: grids,
      linked_rooms: linkedRooms,
      linked_staff: linkedStaffPayload,
      linked_fees: linkedFeesPayload,
      linked_tasks: linkedTasksPayload
    };

    if (originalName) {
      const idx = appState.settings.rooms.findIndex((r: { name: string }) => r.name === originalName);
      if (idx !== -1) {
        appState.settings.rooms[idx] = payload;
        appState.activities.forEach(act => {
          (act.reservations || []).forEach((r: { room_name: string }) => {
            if (r.room_name === originalName) r.room_name = newName;
          });
        });
        appState.settings.rooms.forEach((r: { linked_rooms?: string[] }) => {
          r.linked_rooms = (r.linked_rooms || []).map((n: string) => (n === originalName ? newName : n));
        });
      }
    } else {
      if (appState.settings.rooms.some((r: { name: string }) => r.name === newName)) {
        showToast("Cette salle existe déjà.", "warning");
        return;
      }
      appState.settings.rooms.push(payload);
    }

    saveDatabase();
    onClose();
    window.populateDropdowns();
    bump();
  };

  if (!isOpen || !activeGrid) {
    return (
      <Modal
        id="room-modal"
        titleId="room-modal-title"
        title={originalName ? "Modifier la salle" : "Ajouter une salle"}
        isOpen={false}
        onClose={onClose}
        onSubmit={submit}
        width="760px"
      >
        <div />
      </Modal>
    );
  }

  return (
    <Modal
      id="room-modal"
      titleId="room-modal-title"
      title={originalName ? "Modifier la salle" : "Ajouter une salle"}
      isOpen={isOpen}
      onClose={onClose}
      onSubmit={submit}
      width="760px"
    >
      <div className="form-group-row">
        <div className="form-group" style={{ flexGrow: 1 }}>
          <label htmlFor="form-room-name">Nom de la salle</label>
          <input
            type="text"
            id="form-room-name"
            className="form-input"
            required
            placeholder="Ex: POLY"
            value={roomName}
            onChange={e => setRoomName(e.target.value)}
          />
        </div>
        <div className="form-group" style={{ flexGrow: 0 }}>
          <label htmlFor="form-room-color">Couleur</label>
          <input
            type="color"
            id="form-room-color"
            className="form-input"
            value={color}
            style={{ width: 56, padding: 4, cursor: "pointer" }}
            onChange={e => setColor(e.target.value)}
          />
        </div>
      </div>

      <div className="distribution-section">
        <div className="distribution-header">
          <label>Grille tarifaire (paramètre × type de client)</label>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn btn-secondary" style={{ padding: "6px 12px", fontSize: "0.8rem" }} onClick={addVersion}>
              + Nouvelle version
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: "6px 12px", fontSize: "0.8rem", color: "var(--danger)" }}
              onClick={deleteVersion}
            >
              Supprimer la version
            </button>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          {grids.map((g, i) => (
            <button
              key={g.id}
              type="button"
              className={`pill-toggle grid-version-tab${i === activeGridIndex ? " active" : ""}`}
              onClick={() => setActiveGridIndex(i)}
            >
              {g.effective_date ? g.effective_date : "Depuis toujours"}
            </button>
          ))}
        </div>
        <div className="form-group" style={{ maxWidth: 260 }}>
          <label htmlFor="room-grid-effective-date">Date d'entrée en vigueur de cette version</label>
          <input
            type="text"
            id="room-grid-effective-date"
            className="form-input"
            placeholder="AAAA-MM-JJ (vide = depuis toujours)"
            value={activeGrid.effective_date}
            onChange={e => updateActiveGrid({ effective_date: e.target.value.trim() })}
          />
        </div>
        <div className="form-group-row">
          <div className="form-group">
            <div className="distribution-header" style={{ marginBottom: 8 }}>
              <label style={{ fontSize: "0.8rem" }}>Paramètres (lignes)</label>
              <button type="button" className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: "0.75rem" }} onClick={addParameter}>
                + Paramètre
              </button>
            </div>
            <div className="distribution-list">
              {activeGrid.parameters.map((p, i) => (
                <div key={p.id} className="distribution-row room-tarif-row" style={{ gridTemplateColumns: "1fr 1fr auto" }}>
                  <input
                    type="text"
                    className="form-input"
                    value={p.name}
                    placeholder="Ex: Journée"
                    style={{ padding: "8px 12px", fontSize: "0.85rem" }}
                    onChange={e => updateParameter(i, { name: e.target.value })}
                  />
                  <select
                    className="select-input"
                    style={{ padding: "8px 12px", fontSize: "0.85rem" }}
                    title="Compte GL pour la facturation (optionnel)"
                    value={p.gl_account_code || ""}
                    onChange={e => updateParameter(i, { gl_account_code: e.target.value })}
                  >
                    <GlAccountOptions selectedCode={p.gl_account_code || ""} />
                  </select>
                  <button type="button" className="btn-icon" style={{ width: 14, height: 14 }} onClick={() => deleteParameter(i)}>
                    <DeleteIcon />
                  </button>
                </div>
              ))}
            </div>
          </div>
          <div className="form-group">
            <div className="distribution-header" style={{ marginBottom: 8 }}>
              <label style={{ fontSize: "0.8rem" }}>Types de client (colonnes)</label>
              <button type="button" className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: "0.75rem" }} onClick={addClientType}>
                + Type de client
              </button>
            </div>
            <div className="distribution-list">
              {activeGrid.client_types.map((ct, i) => (
                <div key={ct.id} className="distribution-row room-tarif-row" style={{ gridTemplateColumns: "1fr auto" }}>
                  <input
                    type="text"
                    className="form-input"
                    value={ct.name}
                    placeholder="Ex: Interne"
                    style={{ padding: "8px 12px", fontSize: "0.85rem" }}
                    onChange={e => updateClientType(i, { name: e.target.value })}
                  />
                  <button type="button" className="btn-icon" style={{ width: 14, height: 14 }} onClick={() => deleteClientType(i)}>
                    <DeleteIcon />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div style={{ overflowX: "auto" }}>
          {activeGrid.parameters.length === 0 || activeGrid.client_types.length === 0 ? (
            <div style={{ color: "var(--text-muted)", fontSize: "0.85rem", padding: "12px 0" }}>
              Ajoutez au moins un paramètre et un type de client pour saisir les tarifs.
            </div>
          ) : (
            <table className="detail-dist-table">
              <thead>
                <tr>
                  <th></th>
                  {activeGrid.client_types.map(ct => (
                    <th key={ct.id}>{ct.name || "(sans nom)"}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeGrid.parameters.map(p => (
                  <tr key={p.id}>
                    <td className="bold" style={{ whiteSpace: "nowrap", paddingRight: 12 }}>
                      {p.name || "(sans nom)"}
                    </td>
                    {activeGrid.client_types.map(ct => {
                      const cell = activeGrid.cells.find(c => c.parameter_id === p.id && c.client_type_id === ct.id);
                      return (
                        <td key={ct.id}>
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            className="form-input"
                            value={cell ? cell.amount : ""}
                            style={{ padding: "6px 10px", fontSize: "0.85rem", width: 100 }}
                            onChange={e => setCellAmount(p.id, ct.id, parseFloat(e.target.value) || 0)}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="distribution-section">
        <div className="distribution-header">
          <label>Salles liées (réservées automatiquement avec cette salle)</label>
        </div>
        <div className="pill-toggle-group">
          {appState.settings.rooms
            .filter((r: { name: string }) => r.name !== originalName)
            .map((r: { name: string }) => (
              <button
                key={r.name}
                type="button"
                className={`pill-toggle${linkedRooms.includes(r.name) ? " active" : ""}`}
                onClick={() => toggleLinkedRoom(r.name)}
              >
                {r.name}
              </button>
            ))}
        </div>
      </div>

      <div className="distribution-section">
        <div className="distribution-header">
          <label>Personnel lié (ajouté automatiquement à la réservation)</label>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: "6px 12px", fontSize: "0.8rem" }}
            onClick={() => setLinkedStaff([...linkedStaff, { key: generateUid("linked-staff-row"), salaryId: "", count: "1" }])}
          >
            + Ajouter
          </button>
        </div>
        <div className="distribution-list">
          {linkedStaff.map((row, i) => (
            <div key={row.key} className="distribution-row">
              <select
                className="select-input"
                style={{ padding: "8px 12px", fontSize: "0.85rem" }}
                value={row.salaryId}
                onChange={e => setLinkedStaff(linkedStaff.map((r, idx) => (idx === i ? { ...r, salaryId: e.target.value } : r)))}
              >
                <option value="">Choisir un emploi...</option>
                {(appState.settings.salaries || []).map((s: { id: string; job: string }) => (
                  <option key={s.id} value={s.id}>
                    {s.job}
                  </option>
                ))}
              </select>
              <input
                type="number"
                className="form-input"
                min={1}
                step={1}
                value={row.count}
                placeholder="Quantité"
                style={{ padding: "8px 12px", fontSize: "0.85rem" }}
                onChange={e => setLinkedStaff(linkedStaff.map((r, idx) => (idx === i ? { ...r, count: e.target.value } : r)))}
              />
              <div></div>
              <button
                type="button"
                className="btn-icon"
                style={{ width: 14, height: 14 }}
                onClick={() => setLinkedStaff(linkedStaff.filter((_, idx) => idx !== i))}
              >
                <DeleteIcon />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="distribution-section">
        <div className="distribution-header">
          <label>Frais liés (ajoutés automatiquement à la réservation)</label>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: "6px 12px", fontSize: "0.8rem" }}
            onClick={() => setLinkedFees([...linkedFees, { key: generateUid("linked-fee-row"), desc: "", amount: "", glCode: "" }])}
          >
            + Ajouter
          </button>
        </div>
        <div className="distribution-list">
          {linkedFees.map((row, i) => (
            <div key={row.key} className="distribution-row">
              <input
                type="text"
                className="form-input"
                value={row.desc}
                placeholder="Ex: Montage et démontage"
                style={{ padding: "8px 12px", fontSize: "0.85rem" }}
                onChange={e => setLinkedFees(linkedFees.map((r, idx) => (idx === i ? { ...r, desc: e.target.value } : r)))}
              />
              <input
                type="number"
                className="form-input"
                min={0}
                step={0.01}
                value={row.amount}
                placeholder="Montant $"
                style={{ padding: "8px 12px", fontSize: "0.85rem" }}
                onChange={e => setLinkedFees(linkedFees.map((r, idx) => (idx === i ? { ...r, amount: e.target.value } : r)))}
              />
              <select
                className="select-input"
                style={{ padding: "8px 12px", fontSize: "0.85rem" }}
                value={row.glCode}
                onChange={e => setLinkedFees(linkedFees.map((r, idx) => (idx === i ? { ...r, glCode: e.target.value } : r)))}
              >
                <GlAccountOptions selectedCode={row.glCode} />
              </select>
              <button
                type="button"
                className="btn-icon"
                style={{ width: 14, height: 14 }}
                onClick={() => setLinkedFees(linkedFees.filter((_, idx) => idx !== i))}
              >
                <DeleteIcon />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="distribution-section">
        <div className="distribution-header">
          <label>Tâches du gestionnaire liées (générées automatiquement en planification)</label>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: "6px 12px", fontSize: "0.8rem" }}
            onClick={() => setLinkedTasks([...linkedTasks, { key: generateUid("linked-task-row"), desc: "" }])}
          >
            + Ajouter
          </button>
        </div>
        <div className="distribution-list">
          {linkedTasks.map((row, i) => (
            <div key={row.key} className="distribution-row room-tarif-row" style={{ gridTemplateColumns: "1fr auto" }}>
              <input
                type="text"
                className="form-input"
                value={row.desc}
                placeholder="Ex: Envoyer un courriel au responsable de la salle"
                style={{ padding: "8px 12px", fontSize: "0.85rem" }}
                onChange={e => setLinkedTasks(linkedTasks.map((r, idx) => (idx === i ? { ...r, desc: e.target.value } : r)))}
              />
              <button
                type="button"
                className="btn-icon"
                style={{ width: 14, height: 14 }}
                onClick={() => setLinkedTasks(linkedTasks.filter((_, idx) => idx !== i))}
              >
                <DeleteIcon />
              </button>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Top-level view: tabs + panels + modals, and the imperative bridge to
// navigation.js (renderSettings/openSettingsPanel/openAccountModal/openDeptModal)
// ---------------------------------------------------------------------------

type Command =
  | { type: "openPanel"; panel: string; seq: number }
  | { type: "openAccountModal"; code: string; seq: number }
  | { type: "openDeptModal"; name: string; seq: number }
  | { type: "closeAll"; seq: number }
  | null;

function SettingsView({ command }: { command: Command }) {
  const [, setVersion] = useState(0);
  const bump = () => setVersion(v => v + 1);

  const [activeTab, setActiveTab] = useState("accounts");
  const [accountModalCode, setAccountModalCode] = useState<string | null | undefined>(undefined);
  const [roomModalName, setRoomModalName] = useState<string | null | undefined>(undefined);
  const [deptModalName, setDeptModalName] = useState<string | null | undefined>(undefined);
  const [salaryModalId, setSalaryModalId] = useState<string | null | undefined>(undefined);
  const [serviceModalId, setServiceModalId] = useState<string | null | undefined>(undefined);
  const [globalTaskModalId, setGlobalTaskModalId] = useState<string | null | undefined>(undefined);

  const lastSeqRef = useRef(0);
  useEffect(() => {
    if (!command || command.seq === lastSeqRef.current) return;
    lastSeqRef.current = command.seq;
    if (command.type === "openPanel") {
      setActiveTab(command.panel);
    } else if (command.type === "openAccountModal") {
      setActiveTab("accounts");
      setAccountModalCode(command.code);
    } else if (command.type === "openDeptModal") {
      setActiveTab("departments");
      setDeptModalName(command.name);
    } else if (command.type === "closeAll") {
      setAccountModalCode(undefined);
      setRoomModalName(undefined);
      setDeptModalName(undefined);
      setSalaryModalId(undefined);
      setServiceModalId(undefined);
      setGlobalTaskModalId(undefined);
    }
  }, [command]);

  const anyModalOpen =
    accountModalCode !== undefined ||
    roomModalName !== undefined ||
    deptModalName !== undefined ||
    salaryModalId !== undefined ||
    serviceModalId !== undefined ||
    globalTaskModalId !== undefined;
  useSharedBackdrop(anyModalOpen);

  const tabs: { key: string; label: string }[] = [
    { key: "accounts", label: "Comptes GL" },
    { key: "rooms", label: "Salles & Tarifs" },
    { key: "departments", label: "Départements" },
    { key: "salaries", label: "Salaires" },
    { key: "services", label: "Services" },
    { key: "global-tasks", label: "Tâches globales" }
  ];

  return (
    <>
      <div className="settings-container">
        <aside className="settings-tabs">
          {tabs.map(t => (
            <button
              key={t.key}
              className={`settings-tab-btn${activeTab === t.key ? " active" : ""}`}
              onClick={() => setActiveTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </aside>

        <div className="settings-content">
          <AccountsPanel active={activeTab === "accounts"} bump={bump} openModal={setAccountModalCode} />
          <RoomsPanel active={activeTab === "rooms"} openModal={setRoomModalName} bump={bump} />
          <DepartmentsPanel active={activeTab === "departments"} openModal={setDeptModalName} bump={bump} />
          <SalariesPanel active={activeTab === "salaries"} openModal={setSalaryModalId} bump={bump} />
          <ServicesPanel active={activeTab === "services"} openModal={setServiceModalId} bump={bump} />
          <GlobalTasksPanel active={activeTab === "global-tasks"} openModal={setGlobalTaskModalId} bump={bump} />
        </div>
      </div>

      <AccountModal code={accountModalCode} onClose={() => setAccountModalCode(undefined)} bump={bump} />
      <RoomModal name={roomModalName} onClose={() => setRoomModalName(undefined)} bump={bump} />
      <DeptModal name={deptModalName} onClose={() => setDeptModalName(undefined)} bump={bump} />
      <SalaryModal id={salaryModalId} onClose={() => setSalaryModalId(undefined)} bump={bump} />
      <ServiceModal id={serviceModalId} onClose={() => setServiceModalId(undefined)} bump={bump} />
      <GlobalTaskModal id={globalTaskModalId} onClose={() => setGlobalTaskModalId(undefined)} bump={bump} />
    </>
  );
}

let root: Root | null = null;
let pendingCommand: Command = null;
let seqCounter = 0;

function mount() {
  const container = document.getElementById("settings-root");
  if (!container) return;
  if (!root) root = createRoot(container);
  root.render(<SettingsView command={pendingCommand} />);
}

function renderSettings() {
  mount();
}

function openSettingsPanel(panel: string) {
  pendingCommand = { type: "openPanel", panel, seq: ++seqCounter };
  mount();
}

function openAccountModal(code: string) {
  pendingCommand = { type: "openAccountModal", code, seq: ++seqCounter };
  mount();
}

function openDeptModal(name: string) {
  pendingCommand = { type: "openDeptModal", name, seq: ++seqCounter };
  mount();
}

// Closes all 6 settings modals — bridges the Escape-key handler in activities-form.ts, which
// used to call the old vanilla closeSettingsModal(type) for 4 of the 6 modals before they became
// React state here (see TODO.txt: this had silently stopped working since the Settings
// conversion, since `typeof closeSettingsModal === "function"` was false and the check just
// no-op'd — fixed while converting the Formulaire step, and extended to all 6 modals).
function closeAllSettingsModals() {
  pendingCommand = { type: "closeAll", seq: ++seqCounter };
  mount();
}

export { renderSettings, openSettingsPanel, openAccountModal, openDeptModal, closeAllSettingsModals };
if (typeof window !== "undefined") {
  window.renderSettings = renderSettings;
  window.openSettingsPanel = openSettingsPanel;
  window.openAccountModal = openAccountModal;
  window.openDeptModal = openDeptModal;
  window.closeAllSettingsModals = closeAllSettingsModals;
}
