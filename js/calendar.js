/**
 * calendar.js - Activities calendar modal: day/week/month views of
 * activities, colored by the room(s) they're booked in (see settings.js for
 * room color CRUD)
 */

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

let eventCalendarState = {
  refDate: new Date(), // Any date within the currently displayed day/week/month
  viewMode: "month" // "day" | "week" | "month"
};

function initCalendarModal() {
  document.getElementById("open-calendar-btn").addEventListener("click", openCalendarModal);
  document.getElementById("calendar-modal-close").addEventListener("click", closeCalendarModal);
  document.getElementById("calendar-modal-close-btn").addEventListener("click", closeCalendarModal);
  document.getElementById("modal-backdrop").addEventListener("click", closeCalendarModal);

  document.getElementById("event-calendar-prev-btn").addEventListener("click", () => {
    navigateEventCalendar(-1);
  });

  document.getElementById("event-calendar-next-btn").addEventListener("click", () => {
    navigateEventCalendar(1);
  });

  document.querySelectorAll(".event-calendar-view-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".event-calendar-view-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      eventCalendarState.viewMode = btn.getAttribute("data-view");
      renderEventCalendar();
    });
  });
}

function openCalendarModal() {
  eventCalendarState.refDate = new Date();
  eventCalendarState.viewMode = "month";
  document.querySelectorAll(".event-calendar-view-btn").forEach(b => b.classList.toggle("active", b.getAttribute("data-view") === "month"));
  initializeLegendState();
  renderEventCalendar();
  document.getElementById("calendar-modal").classList.add("active");
  document.getElementById("modal-backdrop").classList.add("active");
}

function closeCalendarModal() {
  document.getElementById("calendar-modal").classList.remove("active");
  document.getElementById("modal-backdrop").classList.remove("active");
}

function navigateEventCalendar(direction) {
  const d = eventCalendarState.refDate;
  if (eventCalendarState.viewMode === "month") {
    d.setMonth(d.getMonth() + direction);
  } else if (eventCalendarState.viewMode === "week") {
    d.setDate(d.getDate() + direction * 7);
  } else {
    d.setDate(d.getDate() + direction);
  }
  renderEventCalendar();
}

// Switches to the day view for a given "YYYY-MM-DD" string (used when a month/week cell is clicked)
function goToDayView(dateStr) {
  eventCalendarState.refDate = parseLocalDateStr(dateStr);
  eventCalendarState.viewMode = "day";
  document.querySelectorAll(".event-calendar-view-btn").forEach(b => b.classList.toggle("active", b.getAttribute("data-view") === "day"));
  renderEventCalendar();
}

// Opens the calendar modal on the day view for a "YYYY-MM-DD" string, or on
// today's month view if no valid date is provided (used by the "view in
// calendar" buttons next to date fields in the activity form)
function openCalendarAtDate(dateStr) {
  const parsed = dateStr ? parseLocalDateStr(dateStr) : null;
  if (parsed && !isNaN(parsed.getTime())) {
    initializeLegendState();
    document.getElementById("calendar-modal").classList.add("active");
    document.getElementById("modal-backdrop").classList.add("active");
    goToDayView(dateStr);
  } else {
    openCalendarModal();
  }
}

// Wires the "view in calendar" buttons placed next to date fields in the activity form.
// Delegated on the document so buttons added later (e.g. per-room schedule cards) work
// without needing to be individually re-wired.
function initViewCalendarButtons() {
  document.addEventListener("click", e => {
    const btn = e.target.closest(".view-calendar-btn");
    if (!btn) return;
    const targetId = btn.getAttribute("data-target");
    const input = document.getElementById(targetId);
    openCalendarAtDate(input ? input.value.trim() : "");
  });
}

// Returns the Sunday that starts the week containing `date`
function getWeekStart(date) {
  const start = new Date(date);
  start.setDate(start.getDate() - start.getDay());
  return start;
}

function toDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Returns the list of activities occupying a given "YYYY-MM-DD" day
function getActivitiesForDay(dateStr) {
  const day = parseLocalDateStr(dateStr);
  const matches = [];

  appState.activities.forEach(act => {
    if (act.deleted) return;
    if (!act.name || act.name.trim() === "" || !act.date_start) return;
    const start = parseLocalDateStr(act.date_start);
    const end = act.date_end ? parseLocalDateStr(act.date_end) : start;
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return;
    if (day >= start && day <= end) {
      matches.push(act);
    }
  });

  return matches;
}

function initializeLegendState() {
  const detailsEl = document.querySelector(".event-calendar-legend-details");
  if (detailsEl) {
    if (appState.settings.rooms.length > 5) {
      detailsEl.removeAttribute("open");
    } else {
      detailsEl.setAttribute("open", "");
    }
  }
}

function renderEventCalendarLegend() {
  const legendEl = document.getElementById("event-calendar-legend");
  const rooms = appState.settings.rooms;
  legendEl.innerHTML = rooms
    .map(
      r => `
    <span class="event-calendar-legend-item">
      <span class="room-color-swatch" style="background-color: ${getRoomColor(r.name)};"></span>${r.name}
    </span>
  `
    )
    .join("");

  const previewEl = document.getElementById("event-calendar-legend-preview");
  if (previewEl) {
    previewEl.innerHTML = rooms
      .map(
        r => `
      <span class="room-color-dot" style="background-color: ${getRoomColor(r.name)};" title="${r.name}"></span>
    `
      )
      .join("");
  }
}

function attachEventClickHandlers() {
  document.querySelectorAll("#event-calendar-grid [data-id]").forEach(el => {
    el.addEventListener("click", e => {
      e.stopPropagation();
      const id = el.getAttribute("data-id");
      const calendarReturn = { refDate: new Date(eventCalendarState.refDate), viewMode: eventCalendarState.viewMode };
      closeCalendarModal();
      openActivityDetailModal(id, calendarReturn);
    });
  });
}

// Reopens the calendar modal on a previously saved {refDate, viewMode} snapshot
// (used by the "back to calendar" button in the activity detail modal)
function reopenCalendarModal(calendarReturn) {
  eventCalendarState.refDate = new Date(calendarReturn.refDate);
  eventCalendarState.viewMode = calendarReturn.viewMode;
  document
    .querySelectorAll(".event-calendar-view-btn")
    .forEach(b => b.classList.toggle("active", b.getAttribute("data-view") === eventCalendarState.viewMode));
  initializeLegendState();
  renderEventCalendar();
  document.getElementById("calendar-modal").classList.add("active");
  document.getElementById("modal-backdrop").classList.add("active");
}

function renderEventCalendar() {
  renderEventCalendarLegend();

  if (eventCalendarState.viewMode === "week") {
    renderWeekView();
  } else if (eventCalendarState.viewMode === "day") {
    renderDayView();
  } else {
    renderMonthView();
  }
}

/* ---------------------------- Month view ---------------------------- */

function renderMonthView() {
  const year = eventCalendarState.refDate.getFullYear();
  const month = eventCalendarState.refDate.getMonth();

  document.getElementById("event-calendar-month-label").textContent = `${MONTH_NAMES_FR[month]} ${year}`;

  const grid = document.getElementById("event-calendar-grid");
  grid.classList.remove("event-calendar-grid-day");
  grid.classList.add("event-calendar-grid-month");

  const daysHeaderHtml = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"]
    .map(d => `<div class="event-calendar-day-header">${d}</div>`)
    .join("");

  const firstDayIndex = new Date(year, month, 1).getDay();
  const lastDay = new Date(year, month + 1, 0).getDate();
  const prevLastDay = new Date(year, month, 0).getDate();

  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;

  let cellsHtml = "";

  // Previous month padding
  for (let x = firstDayIndex; x > 0; x--) {
    cellsHtml += `<div class="event-calendar-cell other-month"><div class="event-calendar-cell-daynum">${prevLastDay - x + 1}</div></div>`;
  }

  // Current month days
  for (let i = 1; i <= lastDay; i++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(i).padStart(2, "0")}`;
    cellsHtml += buildDayCellHtml(dateStr, i, isCurrentMonth && today.getDate() === i);
  }

  // Next month padding to complete full weeks
  const totalCells = firstDayIndex + lastDay;
  const nextMonthPadding = (7 - (totalCells % 7)) % 7;
  for (let j = 1; j <= nextMonthPadding; j++) {
    cellsHtml += `<div class="event-calendar-cell other-month"><div class="event-calendar-cell-daynum">${j}</div></div>`;
  }

  grid.innerHTML = daysHeaderHtml + cellsHtml;
  attachDayCellClickHandlers();
  attachEventClickHandlers();
}

/* ---------------------------- Week view ---------------------------- */

function renderWeekView() {
  const weekStart = getWeekStart(eventCalendarState.refDate);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  const startLabel = `${weekStart.getDate()} ${MONTH_NAMES_FR[weekStart.getMonth()]}`;
  const endLabel = `${weekEnd.getDate()} ${MONTH_NAMES_FR[weekEnd.getMonth()]} ${weekEnd.getFullYear()}`;
  document.getElementById("event-calendar-month-label").textContent = `${startLabel} - ${endLabel}`;

  const grid = document.getElementById("event-calendar-grid");
  grid.classList.remove("event-calendar-grid-day");
  grid.classList.add("event-calendar-grid-month");

  const today = new Date();
  let headerHtml = "";
  let cellsHtml = "";

  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    const dateStr = toDateStr(d);
    const isToday = toDateStr(today) === dateStr;

    headerHtml += `<div class="event-calendar-day-header">${DAY_NAMES_FR[d.getDay()].substring(0, 3)} ${d.getDate()}</div>`;
    cellsHtml += buildDayCellHtml(dateStr, null, isToday, true);
  }

  grid.innerHTML = headerHtml + cellsHtml;
  attachDayCellClickHandlers();
  attachEventClickHandlers();
}

/* ---------------------------- Day view ---------------------------- */

function renderDayView() {
  const d = eventCalendarState.refDate;
  const dateStr = toDateStr(d);

  document.getElementById("event-calendar-month-label").textContent =
    `${DAY_NAMES_FR[d.getDay()]} ${d.getDate()} ${MONTH_NAMES_FR[d.getMonth()]} ${d.getFullYear()}`;

  const grid = document.getElementById("event-calendar-grid");
  grid.classList.remove("event-calendar-grid-month");
  grid.classList.add("event-calendar-grid-day");

  const dayActivities = getActivitiesForDay(dateStr);

  if (dayActivities.length === 0) {
    grid.innerHTML = `<div class="event-calendar-day-empty">Aucune activité prévue cette journée.</div>`;
    return;
  }

  grid.innerHTML = dayActivities
    .map(act => {
      const color = getRoomColor(getReservationRoomLabel((act.reservations || [])[0]));
      const roomsLabel = (act.reservations || []).map(getReservationRoomLabel).join(", ") || "-";
      const timeLabel = act.start_time || act.end_time ? `${act.start_time || "?"} - ${act.end_time || "?"}` : "";
      return `
      <div class="event-calendar-day-item" data-id="${act.id}" style="border-left-color: ${color};">
        <div class="event-calendar-day-item-color" style="background-color: ${color};"></div>
        <div class="event-calendar-day-item-info">
          <div class="event-calendar-day-item-name">${act.name}</div>
          <div class="event-calendar-day-item-meta">${roomsLabel}${timeLabel ? ` &bull; ${timeLabel}` : ""}${act.responsable ? ` &bull; ${act.responsable}` : ""}</div>
        </div>
      </div>
    `;
    })
    .join("");

  attachEventClickHandlers();
}

/* ---------------------------- Shared helpers ---------------------------- */

function buildDayCellHtml(dateStr, dayNum, isToday, tall = false) {
  const dayActivities = getActivitiesForDay(dateStr);
  const displayNum = dayNum !== null ? dayNum : parseLocalDateStr(dateStr).getDate();
  const maxVisible = tall ? MAX_EVENTS_PER_DAY + 2 : MAX_EVENTS_PER_DAY;

  let eventsHtml = "";
  dayActivities.slice(0, maxVisible).forEach(act => {
    const color = getRoomColor(getReservationRoomLabel((act.reservations || [])[0]));
    const roomsLabel = (act.reservations || []).map(getReservationRoomLabel).join(", ");
    eventsHtml += `<div class="event-calendar-event" data-id="${act.id}" style="background-color: ${color};" title="${act.name}${roomsLabel ? ` (${roomsLabel})` : ""}">${act.name}</div>`;
  });

  let moreHtml = "";
  if (dayActivities.length > maxVisible) {
    const remaining = dayActivities
      .slice(maxVisible)
      .map(a => a.name)
      .join(", ");
    moreHtml = `<div class="event-calendar-more" title="${remaining}">+${dayActivities.length - maxVisible} de plus</div>`;
  }

  return `
    <div class="event-calendar-cell${isToday ? " today" : ""}${tall ? " tall" : ""}" data-date="${dateStr}">
      <div class="event-calendar-cell-daynum">${displayNum}</div>
      ${eventsHtml}
      ${moreHtml}
    </div>
  `;
}

// Clicking anywhere in a day cell (but not directly on an event) opens the day view for that date
function attachDayCellClickHandlers() {
  document.querySelectorAll("#event-calendar-grid .event-calendar-cell[data-date]").forEach(cell => {
    cell.addEventListener("click", e => {
      if (e.target.closest(".event-calendar-event")) return;
      goToDayView(cell.getAttribute("data-date"));
    });
  });
}
