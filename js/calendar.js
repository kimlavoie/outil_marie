/**
 * calendar.js - Activities calendar modal: month view of activities, colored
 * by the room(s) they're booked in (see settings.js for room color CRUD)
 */

const MONTH_NAMES_FR = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
const MAX_EVENTS_PER_DAY = 3;

let eventCalendarState = {
  year: new Date().getFullYear(),
  month: new Date().getMonth() // 0-11
};

function initCalendarModal() {
  document.getElementById("open-calendar-btn").addEventListener("click", openCalendarModal);
  document.getElementById("calendar-modal-close").addEventListener("click", closeCalendarModal);
  document.getElementById("calendar-modal-close-btn").addEventListener("click", closeCalendarModal);
  document.getElementById("modal-backdrop").addEventListener("click", closeCalendarModal);

  document.getElementById("event-calendar-prev-btn").addEventListener("click", () => {
    eventCalendarState.month--;
    if (eventCalendarState.month < 0) {
      eventCalendarState.month = 11;
      eventCalendarState.year--;
    }
    renderEventCalendar();
  });

  document.getElementById("event-calendar-next-btn").addEventListener("click", () => {
    eventCalendarState.month++;
    if (eventCalendarState.month > 11) {
      eventCalendarState.month = 0;
      eventCalendarState.year++;
    }
    renderEventCalendar();
  });
}

function openCalendarModal() {
  const today = new Date();
  eventCalendarState.year = today.getFullYear();
  eventCalendarState.month = today.getMonth();
  renderEventCalendar();
  document.getElementById("calendar-modal").classList.add("active");
  document.getElementById("modal-backdrop").classList.add("active");
}

function closeCalendarModal() {
  document.getElementById("calendar-modal").classList.remove("active");
  document.getElementById("modal-backdrop").classList.remove("active");
}

// Returns the list of {act, room} activities occupying a given "YYYY-MM-DD" day
function getActivitiesForDay(dateStr) {
  const day = parseLocalDateStr(dateStr);
  const matches = [];

  appState.activities.forEach(act => {
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

function renderEventCalendar() {
  const { year, month } = eventCalendarState;

  document.getElementById("event-calendar-month-label").textContent = `${MONTH_NAMES_FR[month]} ${year}`;

  // Legend: every configured room and its color
  const legendEl = document.getElementById("event-calendar-legend");
  legendEl.innerHTML = appState.settings.rooms.map(r => `
    <span class="event-calendar-legend-item">
      <span class="room-color-swatch" style="background-color: ${getRoomColor(r.name)};"></span>${r.name}
    </span>
  `).join("");

  const daysHeaderHtml = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"]
    .map(d => `<div class="event-calendar-day-header">${d}</div>`).join("");

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
    const paddedMonth = String(month + 1).padStart(2, '0');
    const paddedDay = String(i).padStart(2, '0');
    const dateStr = `${year}-${paddedMonth}-${paddedDay}`;

    const dayActivities = getActivitiesForDay(dateStr);
    const isToday = isCurrentMonth && today.getDate() === i;

    let eventsHtml = "";
    dayActivities.slice(0, MAX_EVENTS_PER_DAY).forEach(act => {
      const color = getRoomColor((act.rooms || [])[0] || "");
      const roomsLabel = (act.rooms || []).join(", ");
      eventsHtml += `<div class="event-calendar-event" data-id="${act.id}" style="background-color: ${color};" title="${act.name}${roomsLabel ? ` (${roomsLabel})` : ''}">${act.name}</div>`;
    });

    let moreHtml = "";
    if (dayActivities.length > MAX_EVENTS_PER_DAY) {
      const remaining = dayActivities.slice(MAX_EVENTS_PER_DAY).map(a => a.name).join(", ");
      moreHtml = `<div class="event-calendar-more" title="${remaining}">+${dayActivities.length - MAX_EVENTS_PER_DAY} de plus</div>`;
    }

    cellsHtml += `
      <div class="event-calendar-cell${isToday ? ' today' : ''}">
        <div class="event-calendar-cell-daynum">${i}</div>
        ${eventsHtml}
        ${moreHtml}
      </div>
    `;
  }

  // Next month padding to complete full weeks
  const totalCells = firstDayIndex + lastDay;
  const nextMonthPadding = (7 - (totalCells % 7)) % 7;
  for (let j = 1; j <= nextMonthPadding; j++) {
    cellsHtml += `<div class="event-calendar-cell other-month"><div class="event-calendar-cell-daynum">${j}</div></div>`;
  }

  document.getElementById("event-calendar-grid").innerHTML = daysHeaderHtml + cellsHtml;

  // Clicking an event opens the read-only activity detail (closing the calendar first)
  document.querySelectorAll("#event-calendar-grid .event-calendar-event").forEach(el => {
    el.addEventListener("click", () => {
      const id = el.getAttribute("data-id");
      closeCalendarModal();
      openActivityDetailModal(id);
    });
  });
}
