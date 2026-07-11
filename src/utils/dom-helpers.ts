/**
 * dom-helpers.ts - Generic DOM building blocks shared across the plain-DOM (non-React) views:
 * the getElementById cast shorthand, debounce, pagination bars, pill-toggle groups, the loading
 * overlay, toast notifications, and the negative-amount input guard. Split out of utils.ts (see
 * that file for why it stays a barrel re-exporting this alongside the format/activity-helpers/
 * select-helpers/searchable-select modules).
 */

// Typed shorthand for document.getElementById in the plain-DOM (non-React) views: getElementById
// returns plain Element, which lacks .value/.disabled/.style/.focus() etc. Casting to
// HTMLInputElement (a safe superset of the properties used across these views, including on
// <select>/<button> elements the real DOM doesn't strictly type that way) avoids one-off casts
// without changing any behavior.
function elById<T extends Element = HTMLInputElement>(id: string): T {
  return document.getElementById(id) as unknown as T;
}

// Returns a debounced wrapper that delays invoking fn until `delay` ms have
// passed since the last call (used on search inputs to avoid a full re-render
// on every keystroke).
function debounce(fn: (...args: any[]) => void, delay = 250) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: any[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

/* ==========================================================================
   GENERIC TABLE PAGINATION HELPER
   ========================================================================== */

// Pure HTML builder for a pagination bar's contents. Buttons/select carry an
// optional data-attribute (extraAttr) so a delegated listener can identify
// which instance was interacted with when several bars share one ancestor.
function buildPaginationBarHtml({
  page,
  pageSize,
  totalItems,
  extraAttr = ""
}: {
  page: number;
  pageSize: number;
  totalItems: number;
  extraAttr?: string;
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const clampedPage = Math.min(Math.max(1, page), totalPages);
  const startItem = (clampedPage - 1) * pageSize + 1;
  const endItem = Math.min(clampedPage * pageSize, totalItems);

  return {
    clampedPage,
    html: `
      <div class="pagination-info">${startItem}–${endItem} sur ${totalItems}</div>
      <div class="pagination-controls">
        <button type="button" class="btn-icon pagination-prev" ${extraAttr} ${clampedPage <= 1 ? "disabled" : ""} title="Page précédente">
          <svg viewBox="0 0 24 24" style="width: 16px; height: 16px; fill: currentColor;"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
        </button>
        <span class="pagination-page-label">Page ${clampedPage} / ${totalPages}</span>
        <button type="button" class="btn-icon pagination-next" ${extraAttr} ${clampedPage >= totalPages ? "disabled" : ""} title="Page suivante">
          <svg viewBox="0 0 24 24" style="width: 16px; height: 16px; fill: currentColor;"><path d="M8.59 16.59L10 18l6-6-6-6-1.41 1.41L13.17 12z"/></svg>
        </button>
        <select class="select-input pagination-size-select" name="pagination-size" ${extraAttr} title="Lignes par page">
          ${[5, 10, 25, 50, 100].map(n => `<option value="${n}" ${n === pageSize ? "selected" : ""}>${n} / page</option>`).join("")}
        </select>
      </div>
    `
  };
}

// Renders a pagination bar into the given container element, and wires up its
// controls directly. Only safe for containers whose innerHTML is replaced
// wholesale on each render (not appended to in a loop) — see
// buildPaginationBarHtml for the loop-safe, delegation-friendly alternative.
// Returns the (possibly clamped) current page, so callers can slice their
// data with the corrected value.
function renderPaginationBar(
  container: HTMLElement | null,
  {
    page,
    pageSize,
    totalItems,
    onPageChange,
    onPageSizeChange
  }: { page: number; pageSize: number; totalItems: number; onPageChange: (page: number) => void; onPageSizeChange: (size: number) => void }
) {
  if (!container) return page;

  if (totalItems === 0) {
    container.innerHTML = "";
    return page;
  }

  const { clampedPage, html } = buildPaginationBarHtml({ page, pageSize, totalItems });
  container.innerHTML = html;

  container.querySelector(".pagination-prev")!.addEventListener("click", () => onPageChange(clampedPage - 1));
  container.querySelector(".pagination-next")!.addEventListener("click", () => onPageChange(clampedPage + 1));
  container
    .querySelector(".pagination-size-select")!
    .addEventListener("change", e => onPageSizeChange(parseInt((e.target as HTMLSelectElement).value, 10)));

  return clampedPage;
}

/* ==========================================================================
   PILL TOGGLE GROUP HELPERS
   ========================================================================== */

// Sets which pills are marked active within a pill-toggle group element, based on a list of values
function setPillGroupActiveEl(container: HTMLElement | null, activeValues: string[]) {
  if (!container) return;
  container.querySelectorAll(".pill-toggle").forEach(btn => {
    btn.classList.toggle("active", activeValues.includes((btn as HTMLElement).dataset.value as string));
  });
}

// Sets which pills are marked active within a pill-toggle group, based on a list of values
function setPillGroupActive(containerId: string, activeValues: string[]) {
  setPillGroupActiveEl(document.getElementById(containerId), activeValues);
}

// Delegated click handler for a pill-toggle container element (survives innerHTML rebuilds)
function initPillToggleEl(container: HTMLElement | null) {
  if (!container) return;

  container.addEventListener("click", e => {
    const btn = (e.target as HTMLElement).closest(".pill-toggle");
    if (!btn || !container.contains(btn)) return;

    btn.classList.toggle("active");
  });
}

// Delegated click handler for a pill-toggle container (survives innerHTML rebuilds)
function initPillToggle(containerId: string) {
  initPillToggleEl(document.getElementById(containerId));
}

// Delegated click handler for a pill-toggle container element where only one pill can be active
// at a time (clicking the already-active pill deselects it). `onChange(value)` fires with the
// new value ("" if deselected) so callers can reveal/hide conditional fields.
function initExclusivePillToggleEl(container: HTMLElement | null, onChange?: (value: string) => void) {
  if (!container) return;

  container.addEventListener("click", e => {
    const btn = (e.target as HTMLElement).closest(".pill-toggle") as HTMLElement | null;
    if (!btn || !container.contains(btn)) return;

    const wasActive = btn.classList.contains("active");
    container.querySelectorAll(".pill-toggle").forEach(b => b.classList.remove("active"));
    if (!wasActive) btn.classList.add("active");
    if (onChange) onChange(wasActive ? "" : (btn.dataset.value as string));
  });
}

// Delegated click handler for a pill-toggle container where only one pill can be active at a
// time (clicking the already-active pill deselects it). `onChange(value)` fires with the new
// value ("" if deselected) so callers can reveal/hide conditional fields.
function initExclusivePillToggle(containerId: string, onChange?: (value: string) => void) {
  initExclusivePillToggleEl(document.getElementById(containerId), onChange);
}

function getExclusivePillValueEl(container: HTMLElement | null) {
  const btn = container ? container.querySelector(".pill-toggle.active") : null;
  return btn ? (btn as HTMLElement).dataset.value : "";
}

function getExclusivePillValue(containerId: string) {
  return getExclusivePillValueEl(document.getElementById(containerId));
}

function setExclusivePillValueEl(container: HTMLElement | null, value: string) {
  if (!container) return;
  container.querySelectorAll(".pill-toggle").forEach(b => b.classList.toggle("active", (b as HTMLElement).dataset.value === value));
}

function setExclusivePillValue(containerId: string, value: string) {
  setExclusivePillValueEl(document.getElementById(containerId), value);
}

/* ==========================================================================
   LOADING OVERLAY (visual feedback for operations users would notice as slow:
   import/export Excel, export PDF, calcul de rapprochement)
   ========================================================================== */

// Shows the full-screen loading overlay with an optional message (e.g. "Import en cours...").
function showLoadingOverlay(message = "Veuillez patienter...") {
  const overlay = document.getElementById("loading-overlay");
  if (!overlay) return;
  overlay.querySelector(".loading-overlay-text")!.textContent = message;
  overlay.classList.add("active");
}

// Hides the full-screen loading overlay shown by showLoadingOverlay().
function hideLoadingOverlay() {
  const overlay = document.getElementById("loading-overlay");
  if (!overlay) return;
  overlay.classList.remove("active");
}

/* ==========================================================================
   TOASTS (non-blocking notifications, replaces alert() for info/success/error)
   ========================================================================== */

const TOAST_ICONS: Record<string, string> = {
  success: '<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>',
  error: '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>',
  warning: '<path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>',
  info: '<path d="M11 7h2v2h-2V7zm0 4h2v6h-2v-6zm1-9C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>'
};

// Shows a temporary, non-blocking notification in the top-right corner (replaces alert() for
// informational messages). `type` is "info" | "success" | "error" | "warning".
function showToast(message: string, type = "info", duration = 4000) {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <svg class="toast-icon" viewBox="0 0 24 24">${TOAST_ICONS[type] || TOAST_ICONS.info}</svg>
    <div class="toast-message"></div>
    <button type="button" class="toast-close" aria-label="Fermer">&times;</button>
  `;
  toast.querySelector(".toast-message")!.textContent = message;

  const dismiss = () => {
    toast.classList.add("toast-leaving");
    toast.classList.remove("toast-visible");
    setTimeout(() => toast.remove(), 250);
  };

  toast.querySelector(".toast-close")!.addEventListener("click", dismiss);
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("toast-visible"));

  if (duration > 0) setTimeout(dismiss, duration);
}

// Guards a monetary <input type="number"> against negative values: `min="0"` on the element is
// only a soft hint (browsers still let you type "-25", it only affects the stepper arrows and
// :invalid styling), so a few rate/amount fields (frais, taux personnalisés) accepted negative
// numbers all the way into appState with no feedback. Wired on "blur" rather than every keystroke
// so a user isn't interrupted while still typing the number.
function rejectNegativeAmountOnBlur(input: HTMLInputElement) {
  input.addEventListener("blur", () => {
    const val = parseFloat(input.value);
    if (Number.isFinite(val) && val < 0) {
      input.value = "0";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      showToast("Un montant ne peut pas être négatif : corrigé à 0.", "warning");
    }
  });
}

export {
  elById,
  debounce,
  buildPaginationBarHtml,
  renderPaginationBar,
  setPillGroupActiveEl,
  setPillGroupActive,
  initPillToggleEl,
  initPillToggle,
  initExclusivePillToggleEl,
  initExclusivePillToggle,
  getExclusivePillValueEl,
  getExclusivePillValue,
  setExclusivePillValueEl,
  setExclusivePillValue,
  showLoadingOverlay,
  hideLoadingOverlay,
  showToast,
  rejectNegativeAmountOnBlur
};
