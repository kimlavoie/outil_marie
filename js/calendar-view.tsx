/**
 * calendar-view.tsx - Activities calendar modal (day/week/month views of activities, colored by
 * the room(s) they're booked in — see js/settings-view.tsx for room color CRUD), ported from
 * calendar.js to React as part of Phase 4 of the Vite/React/TS migration (see TODO.txt).
 *
 * Same external entry points as before, called as bare globals from outside this module:
 * - main.js's DOMContentLoaded bootstrap calls initCalendarModal()/initViewCalendarButtons() once
 * - js/activities-form.js calls reopenCalendarModal(calendarReturn) ("back to calendar" button)
 * These are bridged through a small command/sequence-number queue the mounted component applies
 * via useEffect, same pattern as js/dashboard-view.tsx and js/settings-view.tsx.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { appState, parseLocalDateStr } from "./state.js";
import { getRoomColor, getReservationRoomLabel } from "./utils.ts";
import { openActivityDrawer, openActivityDetailModal } from "./activities-financials.ts";
import { createDraftActivity } from "./activities-form.ts";

const MONTH_NAMES_FR = [
  "Janvier",
  "Février",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Août",
  "Septembre",
  "Octobre",
  "Novembre",
  "Décembre"
];
const DAY_NAMES_FR = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const MAX_EVENTS_PER_DAY = 3;

type ViewMode = "day" | "week" | "month";

// ---------------------------------------------------------------------------
// Pure helpers (no DOM) — ported as-is from calendar.js
// ---------------------------------------------------------------------------

function getWeekStart(date: Date) {
  const start = new Date(date);
  start.setDate(start.getDate() - start.getDay());
  return start;
}

function toDateStr(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getActivitiesForDay(dateStr: string) {
  const day = parseLocalDateStr(dateStr);
  const matches: any[] = [];
  appState.activities.forEach(act => {
    if (act.deleted) return;
    if (!act.name || act.name.trim() === "" || !act.date_start) return;
    const start = parseLocalDateStr(act.date_start);
    const end = act.date_end ? parseLocalDateStr(act.date_end) : start;
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return;
    if (day >= start && day <= end) matches.push(act);
  });
  return matches;
}

// ---------------------------------------------------------------------------
// Hover preview (measured after render via useLayoutEffect, same clamp-to-viewport logic
// as the original's "set innerHTML then measure offsetWidth/Height" sequence)
// ---------------------------------------------------------------------------

interface HoverState {
  act: any;
  anchorRect: DOMRect;
}

function EventHoverPreview({ hover }: { hover: HoverState | null }) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!hover || !ref.current) return;
    const popover = ref.current;
    const popoverWidth = popover.offsetWidth;
    const popoverHeight = popover.offsetHeight;
    let left = hover.anchorRect.right + 8;
    if (left + popoverWidth > window.innerWidth) left = hover.anchorRect.left - popoverWidth - 8;
    let top = hover.anchorRect.top;
    if (top + popoverHeight > window.innerHeight) top = window.innerHeight - popoverHeight - 8;
    popover.style.left = `${Math.max(8, left)}px`;
    popover.style.top = `${Math.max(8, top)}px`;
  }, [hover]);

  if (!hover) return <div id="event-calendar-hover-preview" className="event-calendar-hover-preview" ref={ref} />;

  const act = hover.act;
  const roomsLabel = (act.reservations || []).map(getReservationRoomLabel).filter(Boolean).join(", ") || "-";
  const dateLabel = act.date_start ? (act.date_end && act.date_end !== act.date_start ? `${act.date_start} → ${act.date_end}` : act.date_start) : "-";

  return (
    <div id="event-calendar-hover-preview" className="event-calendar-hover-preview active" ref={ref}>
      <div className="event-calendar-hover-preview-title">{act.name || "(Sans nom)"}</div>
      <div className="event-calendar-hover-preview-row">Salle(s) : {roomsLabel}</div>
      <div className="event-calendar-hover-preview-row">Dates : {dateLabel}</div>
      {act.responsable && <div className="event-calendar-hover-preview-row">Responsable : {act.responsable}</div>}
      {act.department && <div className="event-calendar-hover-preview-row">Département : {act.department}</div>}
      <div className="event-calendar-hover-preview-row">Client : {act.client_type === "interne" ? "Interne" : "Externe"}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Day cell (shared by month/week views) and day-view event row
// ---------------------------------------------------------------------------

function DayCell({
  dateStr,
  dayNum,
  isToday,
  tall,
  onOpenDay,
  onQuickAdd,
  onEventClick,
  onHover,
  onUnhover
}: {
  dateStr: string;
  dayNum: number | null;
  isToday: boolean;
  tall?: boolean;
  onOpenDay: (dateStr: string) => void;
  onQuickAdd: (dateStr: string) => void;
  onEventClick: (id: string) => void;
  onHover: (act: any, e: React.MouseEvent) => void;
  onUnhover: () => void;
}) {
  const dayActivities = getActivitiesForDay(dateStr);
  const displayNum = dayNum !== null ? dayNum : parseLocalDateStr(dateStr).getDate();
  const maxVisible = tall ? MAX_EVENTS_PER_DAY + 2 : MAX_EVENTS_PER_DAY;
  const visible = dayActivities.slice(0, maxVisible);
  const remaining = dayActivities.slice(maxVisible);

  return (
    <div
      className={`event-calendar-cell${isToday ? " today" : ""}${tall ? " tall" : ""}`}
      data-date={dateStr}
      onClick={e => {
        if ((e.target as HTMLElement).closest(".event-calendar-event") || (e.target as HTMLElement).closest(".event-calendar-quick-add-btn")) {
          return;
        }
        onOpenDay(dateStr);
      }}
    >
      <button
        type="button"
        className="event-calendar-quick-add-btn"
        title="Créer une activité à cette date"
        onClick={e => {
          e.stopPropagation();
          onQuickAdd(dateStr);
        }}
      >
        +
      </button>
      <div className="event-calendar-cell-daynum">{displayNum}</div>
      {visible.map(act => {
        const color = getRoomColor(getReservationRoomLabel((act.reservations || [])[0]));
        const roomsLabel = (act.reservations || []).map(getReservationRoomLabel).join(", ");
        return (
          <div
            key={act.id}
            className="event-calendar-event"
            style={{ backgroundColor: color }}
            title={`${act.name}${roomsLabel ? ` (${roomsLabel})` : ""}`}
            onClick={e => {
              e.stopPropagation();
              onEventClick(act.id);
            }}
            onMouseEnter={e => onHover(act, e)}
            onMouseLeave={onUnhover}
          >
            {act.name}
          </div>
        );
      })}
      {remaining.length > 0 && (
        <div className="event-calendar-more" title={remaining.map(a => a.name).join(", ")}>
          +{remaining.length} de plus
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Top-level modal
// ---------------------------------------------------------------------------

interface Command {
  seq: number;
  refDate: Date;
  viewMode: ViewMode;
}

function CalendarModal({ command }: { command: Command | null }) {
  const [isOpen, setIsOpen] = useState(false);
  const [refDate, setRefDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [legendOpen, setLegendOpen] = useState(true);
  const [hover, setHover] = useState<HoverState | null>(null);

  const lastSeqRef = useRef(0);
  useEffect(() => {
    if (!command || command.seq === lastSeqRef.current) return;
    lastSeqRef.current = command.seq;
    setRefDate(command.refDate);
    setViewMode(command.viewMode);
    setLegendOpen(appState.settings.rooms.length <= 5);
    setIsOpen(true);
  }, [command]);

  // Clicking the shared modal-backdrop (used by every modal in the app) closes this one, same as
  // the original's static listener — only attached while open.
  useEffect(() => {
    if (!isOpen) return;
    const backdrop = document.getElementById("modal-backdrop");
    if (!backdrop) return;
    const handler = () => setIsOpen(false);
    backdrop.addEventListener("click", handler);
    backdrop.classList.add("active");
    return () => {
      backdrop.removeEventListener("click", handler);
      backdrop.classList.remove("active");
    };
  }, [isOpen]);

  const close = () => {
    setIsOpen(false);
    setHover(null);
  };

  const goToDay = (dateStr: string) => {
    setRefDate(parseLocalDateStr(dateStr));
    setViewMode("day");
  };

  const openEvent = (id: string) => {
    const calendarReturn = { refDate: new Date(refDate), viewMode };
    close();
    openActivityDetailModal(id, calendarReturn);
  };

  const quickAdd = (dateStr: string) => {
    const id = createDraftActivity("");
    close();
    openActivityDrawer(id);

    const dateInput = document.querySelector<HTMLInputElement>("#form-activity-reservations .reservation-card .slot-date-input");
    if (dateInput) {
      dateInput.value = dateStr;
      dateInput.dispatchEvent(new Event("input", { bubbles: true }));
      dateInput.dispatchEvent(new Event("change", { bubbles: true }));
    }
  };

  const onHover = (act: any, e: React.MouseEvent) => setHover({ act, anchorRect: (e.currentTarget as HTMLElement).getBoundingClientRect() });
  const onUnhover = () => setHover(null);

  const navigate = (direction: number) => {
    const d = new Date(refDate);
    if (viewMode === "month") d.setMonth(d.getMonth() + direction);
    else if (viewMode === "week") d.setDate(d.getDate() + direction * 7);
    else d.setDate(d.getDate() + direction);
    setRefDate(d);
  };

  const rooms = appState.settings.rooms;

  let monthLabel = "";
  let gridClass = "event-calendar-grid-month";
  let body: React.ReactNode = null;

  if (viewMode === "month") {
    const year = refDate.getFullYear();
    const month = refDate.getMonth();
    monthLabel = `${MONTH_NAMES_FR[month]} ${year}`;

    const firstDayIndex = new Date(year, month, 1).getDay();
    const lastDay = new Date(year, month + 1, 0).getDate();
    const prevLastDay = new Date(year, month, 0).getDate();
    const today = new Date();
    const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;

    const cells: React.ReactNode[] = [];
    for (let x = firstDayIndex; x > 0; x--) {
      cells.push(
        <div key={`prev-${x}`} className="event-calendar-cell other-month">
          <div className="event-calendar-cell-daynum">{prevLastDay - x + 1}</div>
        </div>
      );
    }
    for (let i = 1; i <= lastDay; i++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(i).padStart(2, "0")}`;
      cells.push(
        <DayCell
          key={dateStr}
          dateStr={dateStr}
          dayNum={i}
          isToday={isCurrentMonth && today.getDate() === i}
          onOpenDay={goToDay}
          onQuickAdd={quickAdd}
          onEventClick={openEvent}
          onHover={onHover}
          onUnhover={onUnhover}
        />
      );
    }
    const totalCells = firstDayIndex + lastDay;
    const nextMonthPadding = (7 - (totalCells % 7)) % 7;
    for (let j = 1; j <= nextMonthPadding; j++) {
      cells.push(
        <div key={`next-${j}`} className="event-calendar-cell other-month">
          <div className="event-calendar-cell-daynum">{j}</div>
        </div>
      );
    }

    body = (
      <>
        {["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"].map(d => (
          <div key={d} className="event-calendar-day-header">
            {d}
          </div>
        ))}
        {cells}
      </>
    );
  } else if (viewMode === "week") {
    const weekStart = getWeekStart(refDate);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    monthLabel = `${weekStart.getDate()} ${MONTH_NAMES_FR[weekStart.getMonth()]} - ${weekEnd.getDate()} ${MONTH_NAMES_FR[weekEnd.getMonth()]} ${weekEnd.getFullYear()}`;
    const today = new Date();

    const headers: React.ReactNode[] = [];
    const cells: React.ReactNode[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      const dateStr = toDateStr(d);
      headers.push(
        <div key={dateStr} className="event-calendar-day-header">
          {DAY_NAMES_FR[d.getDay()].substring(0, 3)} {d.getDate()}
        </div>
      );
      cells.push(
        <DayCell
          key={dateStr}
          dateStr={dateStr}
          dayNum={null}
          isToday={toDateStr(today) === dateStr}
          tall
          onOpenDay={goToDay}
          onQuickAdd={quickAdd}
          onEventClick={openEvent}
          onHover={onHover}
          onUnhover={onUnhover}
        />
      );
    }
    body = (
      <>
        {headers}
        {cells}
      </>
    );
  } else {
    const dateStr = toDateStr(refDate);
    monthLabel = `${DAY_NAMES_FR[refDate.getDay()]} ${refDate.getDate()} ${MONTH_NAMES_FR[refDate.getMonth()]} ${refDate.getFullYear()}`;
    gridClass = "event-calendar-grid-day";
    const dayActivities = getActivitiesForDay(dateStr);

    body =
      dayActivities.length === 0 ? (
        <div className="event-calendar-day-empty">Aucune activité prévue cette journée.</div>
      ) : (
        dayActivities.map(act => {
          const color = getRoomColor(getReservationRoomLabel((act.reservations || [])[0]));
          const roomsLabel = (act.reservations || []).map(getReservationRoomLabel).join(", ") || "-";
          const timeLabel = act.start_time || act.end_time ? `${act.start_time || "?"} - ${act.end_time || "?"}` : "";
          return (
            <div
              key={act.id}
              className="event-calendar-day-item"
              style={{ borderLeftColor: color }}
              onClick={() => openEvent(act.id)}
              onMouseEnter={e => onHover(act, e)}
              onMouseLeave={onUnhover}
            >
              <div className="event-calendar-day-item-color" style={{ backgroundColor: color }} />
              <div className="event-calendar-day-item-info">
                <div className="event-calendar-day-item-name">{act.name}</div>
                <div className="event-calendar-day-item-meta">
                  {roomsLabel}
                  {timeLabel ? ` • ${timeLabel}` : ""}
                  {act.responsable ? ` • ${act.responsable}` : ""}
                </div>
              </div>
            </div>
          );
        })
      );
  }

  return (
    <>
      <div
        id="calendar-modal"
        className={`modal${isOpen ? " active" : ""}`}
        style={{ width: 980, maxWidth: "96vw" }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="calendar-modal-title"
      >
        <div className="modal-header">
          <h3 className="modal-title" id="calendar-modal-title">
            Calendrier des activités
          </h3>
          <button className="btn-icon" aria-label="Fermer" onClick={close}>
            <svg viewBox="0 0 24 24">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        </div>
        <div className="modal-content">
          <div className="event-calendar-toolbar">
            <div className="event-calendar-header">
              <button type="button" className="calendar-nav-btn" onClick={() => navigate(-1)}>
                &lt;
              </button>
              <span className="event-calendar-month-label">{monthLabel}</span>
              <button type="button" className="calendar-nav-btn" onClick={() => navigate(1)}>
                &gt;
              </button>
            </div>
            <div className="event-calendar-view-switch">
              {(["day", "week", "month"] as ViewMode[]).map(v => (
                <button
                  key={v}
                  type="button"
                  className={`event-calendar-view-btn${viewMode === v ? " active" : ""}`}
                  onClick={() => setViewMode(v)}
                >
                  {v === "day" ? "Jour" : v === "week" ? "Semaine" : "Mois"}
                </button>
              ))}
            </div>
          </div>
          <details className="event-calendar-legend-details" open={legendOpen} onToggle={e => setLegendOpen((e.target as HTMLDetailsElement).open)}>
            <summary className="event-calendar-legend-summary">
              <span className="legend-summary-title">Légende des salles</span>
              <span className="legend-summary-preview">
                {rooms.map((r: { name: string }) => (
                  <span key={r.name} className="room-color-dot" style={{ backgroundColor: getRoomColor(r.name) }} title={r.name} />
                ))}
              </span>
              <span className="legend-chevron">
                <svg viewBox="0 0 24 24" width="16" height="16">
                  <path fill="currentColor" d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" />
                </svg>
              </span>
            </summary>
            <div className="event-calendar-legend">
              {rooms.map((r: { name: string }) => (
                <span key={r.name} className="event-calendar-legend-item">
                  <span className="room-color-swatch" style={{ backgroundColor: getRoomColor(r.name) }} />
                  {r.name}
                </span>
              ))}
            </div>
          </details>
          <div className={`event-calendar-grid ${gridClass}`}>{body}</div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={close}>
            Fermer
          </button>
        </div>
        <EventHoverPreview hover={hover} />
      </div>
    </>
  );
}

let root: Root | null = null;
let pendingCommand: Command | null = null;
let seqCounter = 0;

function mount() {
  const container = document.getElementById("calendar-modal-root");
  if (!container) return;
  if (!root) root = createRoot(container);
  root.render(<CalendarModal command={pendingCommand} />);
}

function pushCommand(refDate: Date, viewMode: ViewMode) {
  pendingCommand = { seq: ++seqCounter, refDate, viewMode };
  mount();
}

function openCalendarModal() {
  pushCommand(new Date(), "month");
}

function openCalendarAtDate(dateStr: string) {
  const parsed = dateStr ? parseLocalDateStr(dateStr) : null;
  if (parsed && !isNaN(parsed.getTime())) {
    pushCommand(parsed, "day");
  } else {
    openCalendarModal();
  }
}

function reopenCalendarModal(calendarReturn: { refDate: string | Date; viewMode: ViewMode }) {
  pushCommand(new Date(calendarReturn.refDate), calendarReturn.viewMode);
}

// Wires the top-bar "open calendar" button. Kept as its own function (rather than inlined at
// module load) so it's called at the same point in the bootstrap sequence as before — see main.js.
function initCalendarModal() {
  document.getElementById("open-calendar-btn")?.addEventListener("click", openCalendarModal);
}

// Wires the "view in calendar" buttons placed next to date fields in the activity form.
// Delegated on the document so buttons added later (e.g. per-room schedule cards) work without
// needing to be individually re-wired — same as the original.
function initViewCalendarButtons() {
  document.addEventListener("click", e => {
    const btn = (e.target as HTMLElement).closest(".view-calendar-btn");
    if (!btn) return;
    const targetId = btn.getAttribute("data-target");
    const input = targetId ? (document.getElementById(targetId) as HTMLInputElement | null) : null;
    openCalendarAtDate(input ? input.value.trim() : "");
  });
}

export { initCalendarModal, initViewCalendarButtons, openCalendarModal, openCalendarAtDate, reopenCalendarModal };
if (typeof window !== "undefined") {
  window.initCalendarModal = initCalendarModal;
  window.initViewCalendarButtons = initViewCalendarButtons;
  window.openCalendarModal = openCalendarModal;
  window.openCalendarAtDate = openCalendarAtDate;
  window.reopenCalendarModal = reopenCalendarModal;
}
