/**
 * navigation/global-search.ts - The top-bar global search box (activities/comptes GL/
 * départements, substring or fuzzy match). Split out of navigation.ts (see that file for why it
 * stays a barrel importing/re-exporting this alongside quick-access.ts/period-selector.ts).
 *
 * Imports switchToView back from navigation.ts (a real circular import: navigation.ts's
 * initNavigation() calls initGlobalSearch() from here) — safe since nothing runs during either
 * module's top-level evaluation, same as the other circular imports already in this codebase
 * (e.g. utils.ts <-> state.ts).
 */
import { appState } from "../state/state.ts";
import { escapeHtml, debounce } from "../utils/utils.ts";
import { textSimilarity } from "../utils/fuzzy-match.ts";
import { openActivityDrawer } from "../activities/financials.ts";
import { openSettingsPanel, openAccountModal, openDeptModal } from "../components/settings/mount.ts";
import { switchToView } from "../navigation.ts";

const GLOBAL_SEARCH_MAX_PER_CATEGORY = 5;
const GLOBAL_SEARCH_FUZZY_MIN_SCORE = 0.5;

// True if `query` is a substring of `text`, or fuzzy-similar enough to it (typo/word-order
// tolerant) using the same Dice-coefficient scoring as the reconciliation engine's suggestions.
function globalSearchMatches(text: string, query: string): boolean {
  const value = (text || "").toLowerCase();
  if (value.includes(query)) return true;
  if (query.length < 3) return false;
  return textSimilarity(value, query) >= GLOBAL_SEARCH_FUZZY_MIN_SCORE;
}

function initGlobalSearch() {
  const input = document.getElementById("global-search-input") as HTMLInputElement | null;
  const resultsPanel = document.getElementById("global-search-results");
  if (!input || !resultsPanel) return;

  input.addEventListener(
    "input",
    debounce(() => renderGlobalSearchResults(input.value.trim().toLowerCase()), 200)
  );

  input.addEventListener("focus", () => {
    if (input.value.trim()) resultsPanel.classList.add("active");
  });

  document.addEventListener("click", e => {
    if (resultsPanel.classList.contains("active") && !resultsPanel.contains(e.target as Node) && e.target !== input) {
      resultsPanel.classList.remove("active");
    }
  });

  window.addEventListener("keydown", e => {
    if (e.key === "Escape") resultsPanel.classList.remove("active");
  });
}

function buildGlobalSearchSectionHtml(label: string, itemsHtml: string): string {
  if (!itemsHtml) return "";
  return `
    <div class="quick-access-section">
      <div class="quick-access-section-label" style="font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; color: var(--text-muted); margin: 4px 0 2px;">${label}</div>
      ${itemsHtml}
    </div>
  `;
}

function buildGlobalSearchItemHtml({ type, id, title, subtitle }: { type: string; id: string; title: string; subtitle?: string }): string {
  return `
    <div class="quick-access-item global-search-result" data-type="${type}" data-id="${escapeHtml(id)}" style="display: flex; flex-direction: column; padding: 8px 12px; border: 1px solid var(--border-color); border-radius: var(--radius-sm); background-color: var(--bg-main); cursor: pointer; margin-bottom: 4px;">
      <span class="bold" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(title)}</span>
      ${subtitle ? `<span class="font-mono" style="font-size: 0.72rem; color: var(--text-muted);">${escapeHtml(subtitle)}</span>` : ""}
    </div>
  `;
}

function openGlobalSearchResult(type: string, id: string) {
  if (type === "activity") {
    switchToView("activities");
    openActivityDrawer(id);
  } else if (type === "account") {
    switchToView("settings");
    openSettingsPanel("accounts");
    openAccountModal(id);
  } else if (type === "department") {
    switchToView("settings");
    openSettingsPanel("departments");
    openDeptModal(id);
  }
}

function renderGlobalSearchResults(query: string) {
  const resultsPanel = document.getElementById("global-search-results");
  if (!resultsPanel) return;

  if (!query) {
    resultsPanel.classList.remove("active");
    resultsPanel.innerHTML = "";
    return;
  }

  const matchingActivities = appState.activities
    .filter(act => !act.deleted && act.name.trim() !== "")
    .filter(
      act => globalSearchMatches(act.id, query) || globalSearchMatches(act.name, query) || globalSearchMatches(act.responsable, query)
    )
    .slice(0, GLOBAL_SEARCH_MAX_PER_CATEGORY);

  const matchingAccounts = appState.settings.accounts
    .filter(acc => globalSearchMatches(acc.code, query) || globalSearchMatches(acc.description, query))
    .slice(0, GLOBAL_SEARCH_MAX_PER_CATEGORY);

  const matchingDepartments = appState.settings.departments
    .filter(dept => globalSearchMatches(dept, query))
    .slice(0, GLOBAL_SEARCH_MAX_PER_CATEGORY);

  const totalCount = matchingActivities.length + matchingAccounts.length + matchingDepartments.length;

  if (totalCount === 0) {
    resultsPanel.innerHTML = `<div style="color: var(--text-muted); font-size: 0.85rem; padding: 4px;">Aucun résultat.</div>`;
    resultsPanel.classList.add("active");
    return;
  }

  const activitiesHtml = matchingActivities
    .map(act =>
      buildGlobalSearchItemHtml({
        type: "activity",
        id: act.id,
        title: act.name,
        subtitle: `${act.id}${act.responsable ? ` · ${act.responsable}` : ""}`
      })
    )
    .join("");

  const accountsHtml = matchingAccounts
    .map(acc => buildGlobalSearchItemHtml({ type: "account", id: acc.code, title: acc.code, subtitle: acc.description }))
    .join("");

  const departmentsHtml = matchingDepartments
    .map(dept => buildGlobalSearchItemHtml({ type: "department", id: dept, title: dept }))
    .join("");

  resultsPanel.innerHTML =
    buildGlobalSearchSectionHtml("Activités", activitiesHtml) +
    buildGlobalSearchSectionHtml("Comptes GL", accountsHtml) +
    buildGlobalSearchSectionHtml("Départements", departmentsHtml);

  resultsPanel.classList.add("active");

  resultsPanel.querySelectorAll(".global-search-result").forEach(item => {
    item.addEventListener("click", () => {
      const type = item.getAttribute("data-type") || "";
      const id = item.getAttribute("data-id") || "";
      resultsPanel.classList.remove("active");
      const input = document.getElementById("global-search-input") as HTMLInputElement | null;
      if (input) input.value = "";
      openGlobalSearchResult(type, id);
    });
  });
}

export { initGlobalSearch, globalSearchMatches, renderGlobalSearchResults, openGlobalSearchResult };
