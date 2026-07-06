/**
 * utils.js - Generic, stateless helpers shared across views
 * (depends on state.js for appState/parseLocalDateStr)
 */

// Helper: Format currencies in standard FR-CA format
function formatCurrency(val) {
  return new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD' }).format(val);
}

// Short unique id for dynamically created rows/cards (tarifs, salles réservées, ventilations)
function generateUid(prefix) {
  return `${prefix}-${Date.now()}${Math.random().toString(36).substr(2, 5)}`;
}

// Returns a debounced wrapper that delays invoking fn until `delay` ms have
// passed since the last call (used on search inputs to avoid a full re-render
// on every keystroke).
function debounce(fn, delay = 250) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// Helper: Calculate days between dates (inclusive)
function calculateDaysCount(startStr, endStr) {
  if (!startStr || !endStr) return 1;
  const start = new Date(startStr);
  const end = new Date(endStr);
  if (isNaN(start) || isNaN(end)) return 1;
  const diffTime = end - start;
  if (diffTime < 0) return 1;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
}

// Joined list of distinct RI/Facture references across an activity's per-account distributions
function getActivityReferences(act) {
  const refs = (act.distributions || []).map(d => (d.reference || "").trim()).filter(Boolean);
  return [...new Set(refs)].join(", ");
}

// Sum of tarif_amount × jours (période propre à chaque salle) across all rooms booked for an activity
function getRoomsTariffTotal(act) {
  return (act.rooms || []).reduce((sum, r) => {
    const days = calculateDaysCount(r.date_start, r.date_end);
    return sum + (r.tariff_amount || 0) * days;
  }, 0);
}

// Room color, with a stable fallback for rooms saved before the color picker existed
const FALLBACK_ROOM_COLORS = ["#4f46e5", "#059669", "#d97706", "#db2777", "#0891b2", "#7c3aed", "#dc2626", "#65a30d"];
function getRoomColor(name) {
  const room = appState.settings.rooms.find(r => r.name === name);
  if (room && room.color) return room.color;
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return FALLBACK_ROOM_COLORS[Math.abs(hash) % FALLBACK_ROOM_COLORS.length];
}

/* ==========================================================================
   GENERIC TABLE PAGINATION HELPER
   ========================================================================== */

// Pure HTML builder for a pagination bar's contents. Buttons/select carry an
// optional data-attribute (extraAttr) so a delegated listener can identify
// which instance was interacted with when several bars share one ancestor.
function buildPaginationBarHtml({ page, pageSize, totalItems, extraAttr = "" }) {
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
        <select class="select-input pagination-size-select" ${extraAttr} title="Lignes par page">
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
function renderPaginationBar(container, { page, pageSize, totalItems, onPageChange, onPageSizeChange }) {
  if (!container) return page;

  if (totalItems === 0) {
    container.innerHTML = "";
    return page;
  }

  const { clampedPage, html } = buildPaginationBarHtml({ page, pageSize, totalItems });
  container.innerHTML = html;

  container.querySelector(".pagination-prev").addEventListener("click", () => onPageChange(clampedPage - 1));
  container.querySelector(".pagination-next").addEventListener("click", () => onPageChange(clampedPage + 1));
  container.querySelector(".pagination-size-select").addEventListener("change", (e) => onPageSizeChange(parseInt(e.target.value, 10)));

  return clampedPage;
}

/* ==========================================================================
   PILL TOGGLE GROUP HELPERS
   ========================================================================== */

// Sets which pills are marked active within a pill-toggle group, based on a list of values
function setPillGroupActive(containerId, activeValues) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.querySelectorAll(".pill-toggle").forEach(btn => {
    btn.classList.toggle("active", activeValues.includes(btn.dataset.value));
  });
}

// Delegated click handler for a pill-toggle container (survives innerHTML rebuilds)
function initPillToggle(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.addEventListener("click", (e) => {
    const btn = e.target.closest(".pill-toggle");
    if (!btn || !container.contains(btn)) return;

    btn.classList.toggle("active");
  });
}

/* ==========================================================================
   INPUT MASKS
   ========================================================================== */

function maskDateInput(input) {
  input.addEventListener("input", (e) => {
    // Let the user delete normally with backspace
    if (e.inputType === "deleteContentBackward") {
      return;
    }

    let value = input.value.replace(/\D/g, ""); // Keep only digits
    if (value.length > 8) {
      value = value.substring(0, 8);
    }

    let formatted = "";
    if (value.length > 0) {
      formatted += value.substring(0, 4); // YYYY
    }
    if (value.length > 4) {
      formatted += "-" + value.substring(4, 6); // -MM
    }
    if (value.length > 6) {
      formatted += "-" + value.substring(6, 8); // -DD
    }

    input.value = formatted;
  });
}

function maskPhoneInput(input) {
  if (!input) return;
  input.addEventListener("input", (e) => {
    // Let the user delete normally with backspace or delete key
    if (e.inputType === "deleteContentBackward" || e.inputType === "deleteContentForward") {
      return;
    }

    let value = input.value.replace(/\D/g, ""); // Keep only digits
    if (value.length > 10) {
      value = value.substring(0, 10);
    }

    let formatted = "";
    if (value.length > 0) {
      formatted += value.substring(0, 3); // XXX
    }
    if (value.length > 3) {
      formatted += "-" + value.substring(3, 6); // -XXX
    }
    if (value.length > 6) {
      formatted += "-" + value.substring(6, 10); // -XXXX
    }

    input.value = formatted;
  });
}

// Exposed to Node's test runner (test/*.test.js); no-op in the browser, where `module` is undefined.
if (typeof module !== "undefined") {
  module.exports = { formatCurrency, generateUid, debounce, calculateDaysCount, getActivityReferences, getRoomsTariffTotal };
}
