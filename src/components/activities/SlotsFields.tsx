/**
 * SlotsFields.tsx - Créneaux (time slot rows) for one reservation card, plus the "+ Créneau" /
 * "+ Plage de jours" (date-range generator) controls above them ("sous-tranche C" of the
 * reservations React conversion — see card.ts's header comment and InstallDismantleFields.tsx
 * for sous-tranche B's version of the same pattern).
 *
 * Mounted as its own React root into a .reservation-slots-mount placeholder left by card.ts's
 * addReservationCard(), same reasoning as InstallDismantleFields.tsx: the rest of the card is
 * still legacy HTML built via insertAdjacentHTML.
 *
 * Row fields stay uncontrolled (defaultValue): maskDateInput()/maskTimeInput() write to .value
 * directly as the user types (digit-grouping masks), the same class of legacy behavior that made
 * install/dismantle's date fields uncontrolled too. Row identity/add/remove is real React state;
 * a row's own field values are not.
 */
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { validateDateFieldFiscalYear } from "../../activities/datepicker.ts";
import { WEEKDAY_PILL_OPTIONS } from "../../activities/form.ts";
import { formatDateStrLocal, parseLocalDateStr } from "../../state/state.ts";
import { generateUid, showToast, initPillToggleEl, maskDateInput, maskTimeInput } from "../../utils/utils.ts";
import { updateSubmissionFinancialSummary, autoSaveActivityForm } from "../../activities/financials.ts";
import { updateFormDatesHelper } from "../../activities/history/index.ts";
import { propagateFirstSlotTimesToStaff } from "../../activities/reservations/subrows.ts";
import { updateResolvedPriceDisplay } from "../../activities/reservations/tariff.ts";

export interface SlotData {
  date?: string;
  start_time?: string;
  end_time?: string;
  details?: string;
}

function SlotRow({ rowId, initial, card, onRemove }: { rowId: string; initial: SlotData; card: HTMLElement; onRemove: () => void }) {
  const dateInputRef = useRef<HTMLInputElement>(null);
  const startInputRef = useRef<HTMLInputElement>(null);
  const endInputRef = useRef<HTMLInputElement>(null);
  const wiredRef = useRef(false);

  useEffect(() => {
    if (wiredRef.current) return;
    wiredRef.current = true;
    const dateInput = dateInputRef.current!;
    const startInput = startInputRef.current!;
    const endInput = endInputRef.current!;

    maskDateInput(dateInput);
    dateInput.addEventListener("input", () => validateDateFieldFiscalYear(dateInput));
    dateInput.addEventListener("change", () => validateDateFieldFiscalYear(dateInput));
    dateInput.addEventListener("blur", () => validateDateFieldFiscalYear(dateInput));
    validateDateFieldFiscalYear(dateInput);

    maskTimeInput(startInput);
    maskTimeInput(endInput);
    const handleSlotTimeChange = () => propagateFirstSlotTimesToStaff(card);
    startInput.addEventListener("input", handleSlotTimeChange);
    startInput.addEventListener("change", handleSlotTimeChange);
    endInput.addEventListener("input", handleSlotTimeChange);
    endInput.addEventListener("change", handleSlotTimeChange);
    if (initial.start_time && initial.end_time) handleSlotTimeChange();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDelete = () => {
    const hasContent = (dateInputRef.current?.value || "").trim() !== "";
    if (hasContent && !confirm("Retirer ce créneau ?")) return;
    onRemove();
    updateFormDatesHelper();
    updateSubmissionFinancialSummary();
    autoSaveActivityForm();
  };

  return (
    <div id={rowId} className="distribution-row reservation-slot-row" style={{ gridTemplateColumns: "1.2fr 0.8fr 0.8fr 1.5fr auto", gap: 8 }}>
      <div>
        <input
          ref={dateInputRef}
          type="text"
          id={`${rowId}-date`}
          className="form-input slot-date-input"
          placeholder="AAAA-MM-JJ"
          pattern="\d{4}-\d{2}-\d{2}"
          defaultValue={initial.date || ""}
        />
        <div className="field-error-msg" id={`${rowId}-date-fy-error`} />
      </div>
      <input
        ref={startInputRef}
        type="time"
        id={`${rowId}-start-time`}
        className="form-input slot-start-time-input"
        defaultValue={initial.start_time || ""}
      />
      <input
        ref={endInputRef}
        type="time"
        id={`${rowId}-end-time`}
        className="form-input slot-end-time-input"
        defaultValue={initial.end_time || ""}
      />
      <input
        type="text"
        id={`${rowId}-details`}
        className="form-input slot-details-input"
        placeholder="Détails"
        defaultValue={initial.details || ""}
      />
      <button type="button" className="btn-icon delete-slot-row-btn" title="Retirer ce créneau" onClick={handleDelete}>
        <svg viewBox="0 0 24 24" style={{ width: 14, height: 14 }}>
          <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
        </svg>
      </button>
    </div>
  );
}

function RangeGenerator({
  uid,
  open,
  onClose,
  onGenerate
}: {
  uid: string;
  open: boolean;
  onClose: () => void;
  onGenerate: (rows: SlotData[]) => void;
}) {
  const startDateRef = useRef<HTMLInputElement>(null);
  const endDateRef = useRef<HTMLInputElement>(null);
  const startTimeRef = useRef<HTMLInputElement>(null);
  const endTimeRef = useRef<HTMLInputElement>(null);
  const weekdaysGroupRef = useRef<HTMLDivElement>(null);
  const wiredRef = useRef(false);

  useEffect(() => {
    if (wiredRef.current) return;
    wiredRef.current = true;
    initPillToggleEl(weekdaysGroupRef.current);
    for (const input of [startDateRef.current!, endDateRef.current!]) {
      maskDateInput(input);
      input.addEventListener("input", () => validateDateFieldFiscalYear(input));
      input.addEventListener("change", () => validateDateFieldFiscalYear(input));
      input.addEventListener("blur", () => validateDateFieldFiscalYear(input));
    }
    maskTimeInput(startTimeRef.current);
    maskTimeInput(endTimeRef.current);
  }, []);

  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  const handleGenerate = () => {
    const startVal = startDateRef.current?.value || "";
    const endVal = endDateRef.current?.value || "";
    const startTime = startTimeRef.current?.value || "";
    const endTime = endTimeRef.current?.value || "";
    if (
      !dateRegex.test(startVal) ||
      !dateRegex.test(endVal) ||
      isNaN(parseLocalDateStr(startVal).getTime()) ||
      isNaN(parseLocalDateStr(endVal).getTime())
    ) {
      showToast("Veuillez entrer une date de début et une date de fin valides (AAAA-MM-JJ).", "warning");
      return;
    }
    const start = parseLocalDateStr(startVal);
    const end = parseLocalDateStr(endVal);
    if (start > end) {
      showToast("La date de début doit être antérieure ou égale à la date de fin.", "warning");
      return;
    }
    const activeWeekdays = Array.from(weekdaysGroupRef.current?.querySelectorAll<HTMLElement>(".pill-toggle.active") || []).map(b =>
      parseInt(b.dataset.value as string, 10)
    );
    const rows: SlotData[] = [];
    const d = new Date(start);
    while (d <= end) {
      if (activeWeekdays.includes(d.getDay())) rows.push({ date: formatDateStrLocal(d), start_time: startTime, end_time: endTime });
      d.setDate(d.getDate() + 1);
    }
    onGenerate(rows);
  };

  return (
    <div
      className="reservation-slot-range-generator"
      style={{
        display: open ? "block" : "none",
        border: "1px dashed var(--border-color)",
        borderRadius: "var(--radius-md)",
        padding: 12,
        marginBottom: 12
      }}
    >
      <div className="form-group-row">
        <div className="form-group">
          <label htmlFor={`${uid}-slot-range-start-date`}>Du</label>
          <input
            ref={startDateRef}
            type="text"
            id={`${uid}-slot-range-start-date`}
            className="form-input slot-range-start-date"
            placeholder="AAAA-MM-JJ"
            pattern="\d{4}-\d{2}-\d{2}"
          />
          <div className="field-error-msg" id={`${uid}-slot-range-start-date-fy-error`} />
        </div>
        <div className="form-group">
          <label htmlFor={`${uid}-slot-range-end-date`}>Au</label>
          <input
            ref={endDateRef}
            type="text"
            id={`${uid}-slot-range-end-date`}
            className="form-input slot-range-end-date"
            placeholder="AAAA-MM-JJ"
            pattern="\d{4}-\d{2}-\d{2}"
          />
          <div className="field-error-msg" id={`${uid}-slot-range-end-date-fy-error`} />
        </div>
      </div>
      <div className="form-group-row">
        <div className="form-group">
          <label htmlFor={`${uid}-slot-range-start-time`}>Heure de début</label>
          <input ref={startTimeRef} type="time" id={`${uid}-slot-range-start-time`} className="form-input slot-range-start-time" />
        </div>
        <div className="form-group">
          <label htmlFor={`${uid}-slot-range-end-time`}>Heure de fin</label>
          <input ref={endTimeRef} type="time" id={`${uid}-slot-range-end-time`} className="form-input slot-range-end-time" />
        </div>
      </div>
      <div className="form-group">
        <span className="field-label" id={`${uid}-slot-range-weekdays-label`}>
          Jours à inclure
        </span>
        <div
          ref={weekdaysGroupRef}
          className="pill-toggle-group slot-range-weekdays-group"
          role="group"
          aria-labelledby={`${uid}-slot-range-weekdays-label`}
        >
          {WEEKDAY_PILL_OPTIONS.map(d => (
            <button key={d.value} type="button" className="pill-toggle active" data-value={d.value}>
              {d.label}
            </button>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" className="btn btn-secondary slot-range-cancel-btn" style={{ padding: "6px 12px", fontSize: "0.8rem" }} onClick={onClose}>
          Annuler
        </button>
        <button type="button" className="btn btn-primary slot-range-generate-btn" style={{ padding: "6px 12px", fontSize: "0.8rem" }} onClick={handleGenerate}>
          Générer les créneaux
        </button>
      </div>
    </div>
  );
}

export function SlotsFields({ card, initialSlots }: { card: HTMLElement; initialSlots: SlotData[] }) {
  const rowDataRef = useRef<Record<string, SlotData>>({});
  const [rowIds, setRowIds] = useState<string[]>(() =>
    initialSlots.map(s => {
      const id = generateUid("slot-row");
      rowDataRef.current[id] = s;
      return id;
    })
  );
  const [generatorOpen, setGeneratorOpen] = useState(false);

  // Re-run now that the rows are in the DOM: card.ts's earlier resolution (via
  // refreshReservationTariffSelect) ran before any slot existed, so it couldn't resolve the
  // pricing grid for the right date yet.
  useEffect(() => {
    updateResolvedPriceDisplay(card);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // flushSync throughout: collectSlotsFromCard()/collectReservationsFromForm() read the rows
  // straight from the DOM, and some callers (e.g. the "+ Créneau" button's own
  // updateFormDatesHelper()/updateSubmissionFinancialSummary() calls right below) expect the just
  // -added/-removed row to already be there. Safe here (unlike ActivityDrawer.tsx's ref-callback
  // mount, see card.tsx's header comment): these all run from plain onClick handlers, not nested
  // inside another component's commit.
  const handleRemoveRow = (id: string) => {
    delete rowDataRef.current[id];
    flushSync(() => setRowIds(ids => ids.filter(x => x !== id)));
  };

  const handleAddSlot = () => {
    const rows = card.querySelectorAll<HTMLElement>(".reservation-slot-row");
    const last = rows[rows.length - 1];
    let nextDate = "";
    let startTime = "";
    let endTime = "";
    if (last) {
      const lastDate = last.querySelector<HTMLInputElement>(".slot-date-input")?.value || "";
      startTime = last.querySelector<HTMLInputElement>(".slot-start-time-input")?.value || "";
      endTime = last.querySelector<HTMLInputElement>(".slot-end-time-input")?.value || "";
      if (lastDate) {
        const d = parseLocalDateStr(lastDate);
        d.setDate(d.getDate() + 1);
        nextDate = formatDateStrLocal(d);
      }
    }
    const id = generateUid("slot-row");
    rowDataRef.current[id] = { date: nextDate, start_time: startTime, end_time: endTime };
    flushSync(() => setRowIds(ids => [...ids, id]));
    updateFormDatesHelper();
    updateSubmissionFinancialSummary();
    autoSaveActivityForm();
  };

  const handleGenerateRange = (rows: SlotData[]) => {
    const newIds = rows.map(row => {
      const id = generateUid("slot-row");
      rowDataRef.current[id] = row;
      return id;
    });
    flushSync(() => {
      setRowIds(ids => [...ids, ...newIds]);
      setGeneratorOpen(false);
    });
    updateFormDatesHelper();
    updateSubmissionFinancialSummary();
    autoSaveActivityForm();
  };

  return (
    <div className="distribution-section">
      <div className="distribution-header">
        <span className="field-label">Créneaux</span>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            className="btn btn-secondary reservation-add-slot-range-btn"
            style={{ padding: "6px 12px", fontSize: "0.8rem" }}
            onClick={() => flushSync(() => setGeneratorOpen(v => !v))}
          >
            + Plage de jours
          </button>
          <button
            type="button"
            className="btn btn-secondary reservation-add-slot-btn"
            style={{ padding: "6px 12px", fontSize: "0.8rem" }}
            onClick={handleAddSlot}
          >
            + Créneau
          </button>
        </div>
      </div>
      <RangeGenerator
        uid={card.id}
        open={generatorOpen}
        onClose={() => flushSync(() => setGeneratorOpen(false))}
        onGenerate={handleGenerateRange}
      />
      <div className="distribution-list reservation-slots-list">
        {rowIds.map(id => (
          <SlotRow key={id} rowId={id} initial={rowDataRef.current[id] || {}} card={card} onRemove={() => handleRemoveRow(id)} />
        ))}
      </div>
      <div
        className="reservation-slots-days-helper"
        style={{ marginTop: 8, fontSize: "0.78rem", color: "var(--text-secondary)", display: "none", alignItems: "center", gap: 6 }}
      >
        <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, fill: "var(--primary)" }}>
          <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zm3.3 14.3L11 12.5V7h1.5v4.7l3.7 2.2-.7 1.4z" />
        </svg>
        <span>
          <strong>Jours de la semaine :</strong> <span className="reservation-slots-days-list" style={{ color: "var(--text-primary)" }} />
        </span>
      </div>
    </div>
  );
}
