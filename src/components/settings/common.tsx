import { useEffect } from "react";
import { appState } from "../../state/state.ts";
import { formatDateMask, RateVersionRow, newRateVersionRow } from "../../utils/utils.ts";

export function EditIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
    </svg>
  );
}

export function DeleteIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
    </svg>
  );
}

export function GlAccountOptions() {
  return (
    <>
      <option value="">Aucun</option>
      {appState.settings.accounts.map(acc => (
        <option key={acc.code} value={acc.code}>
          {acc.code} ({acc.description})
        </option>
      ))}
    </>
  );
}

export function useSharedBackdrop(isOpen: boolean) {
  useEffect(() => {
    const backdrop = document.getElementById("modal-backdrop");
    if (backdrop) backdrop.classList.toggle("active", isOpen);
  }, [isOpen]);
}

export function Modal({
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

export function RateVersionsEditor({
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
            name={`${row.key}-effective-date`}
            className="form-input"
            value={row.effective_date}
            placeholder="AAAA-MM-JJ (vide = depuis toujours)"
            aria-label="Date d'entrée en vigueur (AAAA-MM-JJ, vide = depuis toujours)"
            style={{ padding: "8px 12px", fontSize: "0.85rem" }}
            onChange={e => {
              const inputType = (e.nativeEvent as InputEvent).inputType;
              const value =
                inputType === "deleteContentBackward" || inputType === "deleteContentForward"
                  ? e.target.value
                  : formatDateMask(e.target.value);
              update(i, { effective_date: value });
            }}
          />
          <input
            type="number"
            name={`${row.key}-rate`}
            className="form-input"
            min={0}
            step={0.01}
            value={row.rate}
            placeholder={withOvertime ? "Taux régulier $/h" : "Montant $"}
            aria-label={withOvertime ? "Taux régulier en dollars par heure" : "Montant en dollars"}
            style={{ padding: "8px 12px", fontSize: "0.85rem" }}
            onChange={e => update(i, { rate: e.target.value })}
          />
          {withOvertime && (
            <input
              type="number"
              name={`${row.key}-overtime-rate`}
              className="form-input"
              min={0}
              step={0.01}
              value={row.overtime_rate ?? ""}
              placeholder="Taux temps sup. $/h"
              title="Taux horaire en temps supplémentaire (optionnel)"
              aria-label="Taux horaire en temps supplémentaire (optionnel), en dollars par heure"
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

export interface TarifRow {
  key: string;
  label: string;
  gl_account_code: string;
  rateRows: RateVersionRow[];
}

// One block per named tarif a service (or salary) can be billed under (e.g. "Interne" / "Externe"),
// each carrying its own budget account and its own dated rate history (via the nested
// RateVersionsEditor). The reservation form's service/staff line then picks one of these tarifs
// instead of an account and a rate independently. `withOvertime` adds the overtime rate column
// used by salary tarifs (services have no overtime rate).
export function TarifsEditor({
  rows,
  onChange,
  withOvertime = false
}: {
  rows: TarifRow[];
  onChange: (rows: TarifRow[]) => void;
  withOvertime?: boolean;
}) {
  const update = (i: number, patch: Partial<TarifRow>) => {
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  };
  const remove = (i: number) => onChange(rows.filter((_, idx) => idx !== i));

  return (
    <div className="distribution-list">
      {rows.map((row, i) => (
        <div
          key={row.key}
          className="tarif-editor-block"
          style={{ border: "1px solid var(--border)", borderRadius: 6, padding: 8, marginBottom: 8 }}
        >
          <div className="distribution-row" style={{ gridTemplateColumns: "1fr 1.4fr auto", marginBottom: 8 }}>
            <input
              type="text"
              className="form-input"
              value={row.label}
              placeholder="Ex: Interne"
              aria-label="Nom du tarif"
              style={{ padding: "8px 12px", fontSize: "0.85rem" }}
              onChange={e => update(i, { label: e.target.value })}
            />
            <select
              className="select-input"
              value={row.gl_account_code}
              aria-label="Compte du grand livre associé au tarif"
              style={{ padding: "8px 12px", fontSize: "0.85rem" }}
              onChange={e => update(i, { gl_account_code: e.target.value })}
            >
              <GlAccountOptions />
            </select>
            <button type="button" className="btn-icon" style={{ width: 14, height: 14 }} onClick={() => remove(i)}>
              <DeleteIcon />
            </button>
          </div>
          <RateVersionsEditor rows={row.rateRows} onChange={rateRows => update(i, { rateRows })} withOvertime={withOvertime} />
          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: "4px 10px", fontSize: "0.75rem" }}
            onClick={() => update(i, { rateRows: [...row.rateRows, newRateVersionRow()] })}
          >
            + Ajouter une version de tarif
          </button>
        </div>
      ))}
    </div>
  );
}
