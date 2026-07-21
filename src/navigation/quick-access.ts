/**
 * navigation/quick-access.ts - The "Accès rapide" dropdown: pinned favorites, recently viewed,
 * and soon-upcoming activities, merged and de-duplicated. Split out of navigation.ts (see that
 * file for why it stays a barrel importing/re-exporting this alongside global-search.ts/
 * period-selector.ts).
 *
 * Imports switchToView back from navigation.ts (a real circular import, same as
 * global-search.ts) — safe since nothing runs during either module's top-level evaluation.
 */
import { appState, toggleFavoriteActivity, getRecentlyViewedActivityIds, parseLocalDateStr } from "../state/state.ts";
import { escapeHtml } from "../utils/utils.ts";
import { renderActivities } from "../activities/render.ts";
import { openActivityDrawer } from "../activities/financials.ts";
import { switchToView } from "../navigation.ts";

function initQuickAccessDropdown() {
  const toggleBtn = document.getElementById("quick-access-toggle-btn");
  const panel = document.getElementById("quick-access-dropdown-panel");
  if (!toggleBtn || !panel) return;

  toggleBtn.addEventListener("click", e => {
    e.stopPropagation();
    panel.classList.toggle("active");
  });

  document.addEventListener("click", e => {
    if (panel.classList.contains("active") && !panel.contains(e.target as Node) && e.target !== toggleBtn) {
      panel.classList.remove("active");
    }
  });

  window.addEventListener("keydown", e => {
    if (e.key === "Escape") panel.classList.remove("active");
  });
}

function closeQuickAccessDropdown() {
  const panel = document.getElementById("quick-access-dropdown-panel");
  if (panel) panel.classList.remove("active");
}

const UPCOMING_ACTIVITY_WINDOW_DAYS = 30;
const UPCOMING_ACTIVITY_LIMIT = 5;

function getUpcomingActivityIds(): string[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const windowEnd = new Date(today);
  windowEnd.setDate(windowEnd.getDate() + UPCOMING_ACTIVITY_WINDOW_DAYS);

  return appState.activities
    .filter(act => !act.deleted && act.name.trim() !== "" && act.date_start)
    .map(act => ({ id: act.id, date: parseLocalDateStr(act.date_start) }))
    .filter(entry => !isNaN(entry.date.getTime()) && entry.date >= today && entry.date <= windowEnd)
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(0, UPCOMING_ACTIVITY_LIMIT)
    .map(entry => entry.id);
}

// `category` controls the action button: pinned entries ("favorite") get an unpin (x) button,
// entries surfaced automatically ("recent"/"upcoming") get a pin (star) button so the user can
// promote them to the permanent list in one click.
function buildQuickAccessItemHtml(act: any, category: string): string {
  const actionBtnHtml =
    category === "favorite"
      ? `<button class="btn-icon remove-quick-access-btn" data-id="${escapeHtml(act.id)}" title="Retirer des accès rapides" style="flex: 0 0 auto;">
        <svg viewBox="0 0 24 24" style="width: 14px; height: 14px; fill: currentColor;"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
      </button>`
      : `<button class="btn-icon pin-quick-access-btn" data-id="${escapeHtml(act.id)}" title="Épingler dans l'accès rapide" style="flex: 0 0 auto;">
        <svg viewBox="0 0 24 24" style="width: 14px; height: 14px; fill: currentColor;"><path d="M12 15.39l-3.76 2.27 1-4.28-3.32-2.88 4.38-.38L12 6.09l1.71 4.04 4.38.38-3.32 2.88 1 4.28L12 15.39zM12 2L9.19 8.62 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.63-7.03L22 9.24l-7.19-.62L12 2z"/></svg>
      </button>`;

  const dateSuffix =
    category === "upcoming" && act.date_start
      ? ` · ${parseLocalDateStr(act.date_start).toLocaleDateString("fr-CA", { month: "short", day: "numeric" })}`
      : "";

  return `
    <div class="quick-access-item" data-id="${escapeHtml(act.id)}" style="display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 12px; border: 1px solid var(--border-color); border-radius: var(--radius-sm); background-color: var(--bg-main); cursor: pointer;">
      <span style="display: flex; flex-direction: column; overflow: hidden;">
        <span class="bold" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(act.name) || "Vierge"}</span>
        <span class="font-mono" style="font-size: 0.72rem; color: var(--text-muted);">${escapeHtml(act.id)}${act.responsable ? ` · ${escapeHtml(act.responsable)}` : ""}${dateSuffix}</span>
      </span>
      ${actionBtnHtml}
    </div>
  `;
}

function buildQuickAccessSectionHtml(label: string, items: any[], category: string): string {
  if (items.length === 0) return "";
  return `
    <div class="quick-access-section">
      <div class="quick-access-section-label" style="font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; color: var(--text-muted); margin: 4px 0 2px;">${label}</div>
      ${items.map(act => buildQuickAccessItemHtml(act, category)).join("")}
    </div>
  `;
}

function wireQuickAccessItemEvents(container: HTMLElement) {
  container.querySelectorAll(".quick-access-item").forEach(item => {
    item.addEventListener("click", e => {
      const target = e.target as HTMLElement;
      if (target.closest(".remove-quick-access-btn") || target.closest(".pin-quick-access-btn")) return;
      const id = item.getAttribute("data-id") || "";
      closeQuickAccessDropdown();
      switchToView("activities");
      openActivityDrawer(id);
    });
  });

  container.querySelectorAll(".remove-quick-access-btn, .pin-quick-access-btn").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const id = btn.getAttribute("data-id") || "";
      toggleFavoriteActivity(id);
      renderQuickAccessAll();
      if (document.getElementById("view-activities")?.classList.contains("active")) renderActivities();
    });
  });
}

// Merges three categories — user-pinned favorites, recently viewed, and activities starting soon
// — de-duplicating so an activity that qualifies for more than one only appears once, under the
// highest-priority category (favorites > recent > upcoming).
function renderQuickAccessAll() {
  const listContainer = document.getElementById("quick-access-list-global");
  const countBadge = document.getElementById("quick-access-count-badge");
  if (!listContainer) return;

  const categories = [
    { key: "favorite", label: "Épinglées", ids: appState.favorites || [] },
    { key: "recent", label: "Consultées récemment", ids: getRecentlyViewedActivityIds() },
    { key: "upcoming", label: "À venir bientôt", ids: getUpcomingActivityIds() }
  ];

  const seen = new Set();
  let totalCount = 0;
  const sectionsHtml = categories
    .map(cat => {
      const items = cat.ids.map(id => appState.activities.find(a => a.id === id)).filter(act => act && !act.deleted && !seen.has(act.id));
      items.forEach(act => seen.add(act.id));
      totalCount += items.length;
      return buildQuickAccessSectionHtml(cat.label, items, cat.key);
    })
    .join("");

  listContainer.innerHTML =
    totalCount > 0
      ? sectionsHtml
      : `<div style="color: var(--text-muted); font-size: 0.85rem; padding: 4px;">Aucune activité épinglée, consultée récemment ou à venir bientôt.</div>`;
  wireQuickAccessItemEvents(listContainer);

  if (countBadge) {
    countBadge.textContent = String(totalCount);
    countBadge.style.display = totalCount > 0 ? "inline-flex" : "none";
  }
}

export { initQuickAccessDropdown, closeQuickAccessDropdown, renderQuickAccessAll };
