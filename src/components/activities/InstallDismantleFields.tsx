/**
 * InstallDismantleFields.tsx - Montage/Démontage toggle + date/time period fields for one
 * reservation card ("sous-tranche B" of the reservations React conversion — see card.ts's
 * header comment and ActivityDrawer.tsx's mountReservationCard()).
 *
 * Mounted as its own React root into a .reservation-install-dismantle-mount placeholder left by
 * card.ts's addReservationCard(), since the rest of that card is still legacy HTML built via
 * insertAdjacentHTML — this is a React "island" inside it, the same idea as the app's other
 * legitimate secondary roots (main.tsx's #root, calendar-view.tsx's #calendar-modal-root).
 *
 * The date/time inputs stay uncontrolled (defaultValue, not value): datepicker.ts's
 * initDatepickerWrapper() writes to their .value directly when a day is picked from the popover,
 * exactly like it always has for every other datepicker field in this app — making them
 * React-controlled would fight that write, the same class of bug fixed earlier in
 * bulk-actions.ts. Only the toggle buttons (shown/hidden, active/inactive) are real React state;
 * the fields themselves are always rendered and only display:none/flex toggles, matching the
 * original behavior of never destroying the input (so a value typed before toggling off survives
 * toggling back on) instead of conditionally mounting/unmounting them.
 */
import { useEffect, useRef, useState } from "react";
import { updateFormDatesHelper } from "../../activities/history/index.ts";
import { autoSaveActivityForm } from "../../activities/financials.ts";
import { initDatepickerWrapper } from "../../activities/datepicker.ts";
import { maskTimeInput } from "../../utils/utils.ts";

interface PeriodDefaults {
  date: string;
  start_time: string;
  end_time: string;
}

function DatePeriodField({
  idPrefix,
  label,
  defaults,
  wrapperRef
}: {
  idPrefix: string;
  label: string;
  defaults: PeriodDefaults;
  wrapperRef: (el: HTMLDivElement | null) => void;
}) {
  const dateId = `${idPrefix}-date`;
  const startTimeId = `${idPrefix}-start-time`;
  const endTimeId = `${idPrefix}-end-time`;
  return (
    <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
      <label htmlFor={dateId}>{label}</label>
      <div className="datetime-input-row">
        <div className="datepicker-wrapper" ref={wrapperRef}>
          <input
            type="text"
            id={dateId}
            className="form-input"
            placeholder="AAAA-MM-JJ"
            pattern="\d{4}-\d{2}-\d{2}"
            defaultValue={defaults.date}
          />
          <button type="button" className="datepicker-trigger-btn" data-target={dateId} title="Sélectionner depuis le calendrier">
            <svg viewBox="0 0 24 24" style={{ width: 16, height: 16, fill: "currentColor" }}>
              <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11zM7 11h5v5H7z" />
            </svg>
          </button>
          <div className="calendar-popover" id={`cal-popover-${dateId}`} />
        </div>
        <input
          type="time"
          id={startTimeId}
          className="form-input datetime-row-time-input"
          title="Heure de début"
          defaultValue={defaults.start_time}
        />
        <span style={{ alignSelf: "center", color: "var(--text-muted)" }}>à</span>
        <input
          type="time"
          id={endTimeId}
          className="form-input datetime-row-time-input"
          title="Heure de fin"
          defaultValue={defaults.end_time}
        />
        <button type="button" className="view-calendar-btn" data-target={dateId} title="Consulter le calendrier à cette date">
          <svg viewBox="0 0 24 24" style={{ width: 16, height: 16, fill: "currentColor" }}>
            <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" />
          </svg>
        </button>
      </div>
      <div className="field-error-msg" id={`${dateId}-fy-error`} />
    </div>
  );
}

export interface InstallDismantlePeriod {
  enabled?: boolean;
  date?: string;
  start_time?: string;
  end_time?: string;
}

export function InstallDismantleFields({
  uid,
  initialInstall,
  initialDismantle
}: {
  uid: string;
  initialInstall?: InstallDismantlePeriod;
  initialDismantle?: InstallDismantlePeriod;
}) {
  const [installEnabled, setInstallEnabled] = useState(!!initialInstall?.enabled);
  const [dismantleEnabled, setDismantleEnabled] = useState(!!initialDismantle?.enabled);

  const install: PeriodDefaults = {
    date: initialInstall?.date || "",
    start_time: initialInstall?.start_time || "",
    end_time: initialInstall?.end_time || ""
  };
  const dismantle: PeriodDefaults = {
    date: initialDismantle?.date || "",
    start_time: initialDismantle?.start_time || "",
    end_time: initialDismantle?.end_time || ""
  };

  const initedWrappers = useRef<Set<HTMLDivElement>>(new Set());
  const wireWrapper = (el: HTMLDivElement | null) => {
    if (!el || initedWrappers.current.has(el)) return;
    initedWrappers.current.add(el);
    initDatepickerWrapper(el);
  };

  // Time inputs aren't inside the datepicker wrapper (initDatepickerWrapper only masks the date
  // field), so mask them here once, matching card.ts's card-wide maskTimeInput sweep for every
  // other .datetime-row-time-input. The fields are always mounted (only display: none/flex
  // toggles — see the JSX below), so this only ever needs to run once.
  useEffect(() => {
    [`${uid}-install-start-time`, `${uid}-install-end-time`, `${uid}-dismantle-start-time`, `${uid}-dismantle-end-time`].forEach(id => {
      maskTimeInput(document.getElementById(id) as HTMLInputElement | null);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleToggleInstall = () => {
    setInstallEnabled(v => !v);
    updateFormDatesHelper();
    autoSaveActivityForm();
  };
  const handleToggleDismantle = () => {
    setDismantleEnabled(v => !v);
    updateFormDatesHelper();
    autoSaveActivityForm();
  };

  return (
    <>
      <div className="form-group">
        <span className="field-label" id={`${uid}-install-dismantle-label`}>
          Montage / Démontage
        </span>
        <div className="pill-toggle-group" role="group" aria-labelledby={`${uid}-install-dismantle-label`}>
          <button
            type="button"
            className={`pill-toggle reservation-install-toggle${installEnabled ? " active" : ""}`}
            onClick={handleToggleInstall}
          >
            Montage
          </button>
          <button
            type="button"
            className={`pill-toggle reservation-dismantle-toggle${dismantleEnabled ? " active" : ""}`}
            onClick={handleToggleDismantle}
          >
            Démontage
          </button>
        </div>
      </div>
      {/* Always mounted (not conditionally rendered) so a value typed before toggling off
          survives toggling back on — matches the original display:none/flex-only behavior. */}
      <div className="form-group-row reservation-install-fields" style={{ display: installEnabled ? "flex" : "none" }}>
        <DatePeriodField idPrefix={`${uid}-install`} label="Montage" defaults={install} wrapperRef={wireWrapper} />
      </div>
      <div className="form-group-row reservation-dismantle-fields" style={{ display: dismantleEnabled ? "flex" : "none" }}>
        <DatePeriodField idPrefix={`${uid}-dismantle`} label="Démontage" defaults={dismantle} wrapperRef={wireWrapper} />
      </div>
    </>
  );
}
