/**
 * utils.js - Generic, stateless helpers shared across views
 * (depends on state.js for appState/parseLocalDateStr)
 */

// Helper: Format currencies in standard FR-CA format
function formatCurrency(val) {
  return new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" }).format(val);
}

// Escapes HTML-sensitive characters so free-text fields (names, notes, descriptions...) can be
// safely interpolated into innerHTML template literals without risking markup/script injection.
function escapeHtml(str) {
  if (!str) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
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

// Sum of tarif_amount × nombre de créneaux (chaque créneau = 1 jour) across all reservations
// booked for an activity
function getRoomsTariffTotal(act) {
  return (act.reservations || []).reduce((sum, r) => sum + (r.tariff_amount || 0) * (r.slots || []).length, 0);
}

// Sentinel room_name value for a reservation on a room outside the settings configuration
// (user-entered free text kept in reservation.room_other_details)
const OTHER_ROOM_VALUE = "__other__";

// Display label for a reservation's room: the free-text detail for "Autre", otherwise its name
function getReservationRoomLabel(reservation) {
  if (!reservation) return "";
  if (reservation.room_name === OTHER_ROOM_VALUE) return reservation.room_other_details || "Autre";
  return reservation.room_name || "";
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
  container.querySelector(".pagination-size-select").addEventListener("change", e => onPageSizeChange(parseInt(e.target.value, 10)));

  return clampedPage;
}

/* ==========================================================================
   PILL TOGGLE GROUP HELPERS
   ========================================================================== */

// Sets which pills are marked active within a pill-toggle group element, based on a list of values
function setPillGroupActiveEl(container, activeValues) {
  if (!container) return;
  container.querySelectorAll(".pill-toggle").forEach(btn => {
    btn.classList.toggle("active", activeValues.includes(btn.dataset.value));
  });
}

// Sets which pills are marked active within a pill-toggle group, based on a list of values
function setPillGroupActive(containerId, activeValues) {
  setPillGroupActiveEl(document.getElementById(containerId), activeValues);
}

// Delegated click handler for a pill-toggle container element (survives innerHTML rebuilds)
function initPillToggleEl(container) {
  if (!container) return;

  container.addEventListener("click", e => {
    const btn = e.target.closest(".pill-toggle");
    if (!btn || !container.contains(btn)) return;

    btn.classList.toggle("active");
  });
}

// Delegated click handler for a pill-toggle container (survives innerHTML rebuilds)
function initPillToggle(containerId) {
  initPillToggleEl(document.getElementById(containerId));
}

// Delegated click handler for a pill-toggle container element where only one pill can be active
// at a time (clicking the already-active pill deselects it). `onChange(value)` fires with the
// new value ("" if deselected) so callers can reveal/hide conditional fields.
function initExclusivePillToggleEl(container, onChange) {
  if (!container) return;

  container.addEventListener("click", e => {
    const btn = e.target.closest(".pill-toggle");
    if (!btn || !container.contains(btn)) return;

    const wasActive = btn.classList.contains("active");
    container.querySelectorAll(".pill-toggle").forEach(b => b.classList.remove("active"));
    if (!wasActive) btn.classList.add("active");
    if (onChange) onChange(wasActive ? "" : btn.dataset.value);
  });
}

// Delegated click handler for a pill-toggle container where only one pill can be active at a
// time (clicking the already-active pill deselects it). `onChange(value)` fires with the new
// value ("" if deselected) so callers can reveal/hide conditional fields.
function initExclusivePillToggle(containerId, onChange) {
  initExclusivePillToggleEl(document.getElementById(containerId), onChange);
}

function getExclusivePillValueEl(container) {
  const btn = container ? container.querySelector(".pill-toggle.active") : null;
  return btn ? btn.dataset.value : "";
}

function getExclusivePillValue(containerId) {
  return getExclusivePillValueEl(document.getElementById(containerId));
}

function setExclusivePillValueEl(container, value) {
  if (!container) return;
  container.querySelectorAll(".pill-toggle").forEach(b => b.classList.toggle("active", b.dataset.value === value));
}

function setExclusivePillValue(containerId, value) {
  setExclusivePillValueEl(document.getElementById(containerId), value);
}

/* ==========================================================================
   SEARCHABLE SELECT (text input + filtered popover, styled like the global search)
   ========================================================================== */

// Builds the markup for one searchable-select instance: a text input (mirrors .search-input)
// plus a filtered results popover (mirrors .calendar-popover / .quick-access-item). The
// currently selected value is kept in a hidden input so callers can read it back like a <select>.
// A chevron makes it read as a dropdown rather than a free-text field, even though it's typeable.
function buildSearchableSelectHtml(wrapperClass, inputClass, placeholder) {
  return `
    <div class="${wrapperClass} searchable-select-wrapper" style="position: relative;">
      <input type="text" class="form-input ${inputClass} searchable-select-input" placeholder="${placeholder}" autocomplete="off" style="padding-right: 34px; cursor: pointer;">
      <svg class="searchable-select-caret" viewBox="0 0 24 24" style="width: 18px; height: 18px; fill: var(--text-muted); position: absolute; right: 10px; top: 50%; transform: translateY(-50%); pointer-events: none;"><path d="M7 10l5 5 5-5z"/></svg>
      <input type="hidden" class="searchable-select-value">
      <div class="calendar-popover searchable-select-results" style="left: 0; right: auto; width: 100%; max-height: 220px; overflow-y: auto;"></div>
    </div>
  `;
}

// Wires a searchable-select instance built by buildSearchableSelectHtml(). `items` is
// [{value, label}]. `onChange(value)` fires whenever the user picks an item. `initialValue`
// pre-selects and pre-fills the input's displayed text. Unlike a plain text field, the input
// always snaps back to the current selection's label once the list closes — typing only ever
// filters the dropdown, it can never leave behind text that isn't a real selection.
function initSearchableSelectEl(wrapper, items, onChange, initialValue = "") {
  if (!wrapper) return;
  const input = wrapper.querySelector(".searchable-select-input");
  const valueInput = wrapper.querySelector(".searchable-select-value");
  const resultsPanel = wrapper.querySelector(".searchable-select-results");

  const selectedItem = items.find(i => i.value === initialValue);
  valueInput.value = initialValue || "";
  input.value = selectedItem ? selectedItem.label : "";

  let highlightedIndex = -1;

  function renderResults(query) {
    const filtered = query ? items.filter(i => i.label.toLowerCase().includes(query.toLowerCase())) : items;

    if (filtered.length === 0) {
      resultsPanel.innerHTML = `<div style="color: var(--text-muted); font-size: 0.85rem; padding: 4px;">Aucun résultat.</div>`;
      resultsPanel.classList.add("active");
      return;
    }

    highlightedIndex = 0;
    resultsPanel.innerHTML = filtered
      .map(
        (item, idx) => `
      <div class="quick-access-item searchable-select-option" data-value="${item.value}" data-idx="${idx}"
           style="padding: 8px 12px; border-radius: var(--radius-sm); cursor: pointer; ${idx === 0 ? "background-color: var(--bg-main);" : ""}">
        ${item.label}
      </div>
    `
      )
      .join("");
    resultsPanel.classList.add("active");

    resultsPanel.querySelectorAll(".searchable-select-option").forEach(opt => {
      opt.addEventListener("mousedown", e => {
        e.preventDefault(); // keep focus so the ensuing click doesn't re-open the panel
        selectItem(filtered[parseInt(opt.dataset.idx, 10)]);
      });
    });
  }

  function selectItem(item) {
    valueInput.value = item.value;
    input.value = item.label;
    resultsPanel.classList.remove("active");
    if (onChange) onChange(item.value);
  }

  // Reverts any typed-but-not-selected text back to the current selection's label (or clears
  // it if nothing is selected), so the field can never be left showing a non-option value.
  function snapToSelection() {
    const current = items.find(i => i.value === valueInput.value);
    input.value = current ? current.label : "";
  }

  function setHighlight(idx) {
    highlightedIndex = idx;
    resultsPanel.querySelectorAll(".searchable-select-option").forEach((opt, i) => {
      opt.style.backgroundColor = i === idx ? "var(--bg-main)" : "";
    });
  }

  // Selects the full current text so the very next keystroke replaces it outright (re-searching
  // from scratch) instead of inserting at whatever point the click happened to land. Deferred a
  // tick past the event so it isn't immediately undone by the browser's own default caret
  // placement on focus/click.
  function selectAllSoon() {
    setTimeout(() => input.select(), 0);
  }

  input.addEventListener("focus", () => {
    renderResults("");
    selectAllSoon();
  });
  input.addEventListener("click", () => {
    if (!resultsPanel.classList.contains("active")) renderResults("");
    selectAllSoon();
  });
  input.addEventListener(
    "input",
    debounce(() => renderResults(input.value.trim()), 150)
  );

  input.addEventListener("keydown", e => {
    const options = Array.from(resultsPanel.querySelectorAll(".searchable-select-option"));
    if (!resultsPanel.classList.contains("active") || options.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight(Math.min(highlightedIndex + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight(Math.max(highlightedIndex - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opt = options[highlightedIndex];
      if (opt) selectItem(items.find(i => i.value === opt.dataset.value));
    } else if (e.key === "Escape") {
      resultsPanel.classList.remove("active");
      snapToSelection();
    }
  });

  // On genuine blur (tabbing/clicking away without picking an option — option clicks use
  // mousedown+preventDefault above, so they never trigger this), close the panel and discard
  // any typed text that wasn't actually selected.
  input.addEventListener("blur", () => {
    resultsPanel.classList.remove("active");
    snapToSelection();
  });

  // Close on outside click; self-unregisters once the wrapper is removed from the DOM
  // (e.g. its reservation card was deleted), so repeatedly adding/removing cards doesn't
  // accumulate stale document-level listeners.
  document.addEventListener("click", function outsideClickHandler(e) {
    if (!wrapper.isConnected) {
      document.removeEventListener("click", outsideClickHandler);
      return;
    }
    if (!wrapper.contains(e.target)) resultsPanel.classList.remove("active");
  });
}

/* ==========================================================================
   INPUT MASKS
   ========================================================================== */

function maskDateInput(input) {
  input.addEventListener("input", e => {
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
  input.addEventListener("input", e => {
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

/* ==========================================================================
   LOADING OVERLAY (visual feedback for operations users would notice as slow:
   import/export Excel, export PDF, calcul de rapprochement)
   ========================================================================== */

// Shows the full-screen loading overlay with an optional message (e.g. "Import en cours...").
function showLoadingOverlay(message = "Veuillez patienter...") {
  const overlay = document.getElementById("loading-overlay");
  if (!overlay) return;
  overlay.querySelector(".loading-overlay-text").textContent = message;
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

const TOAST_ICONS = {
  success: '<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>',
  error: '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>',
  warning: '<path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>',
  info: '<path d="M11 7h2v2h-2V7zm0 4h2v6h-2v-6zm1-9C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>'
};

// Shows a temporary, non-blocking notification in the top-right corner (replaces alert() for
// informational messages). `type` is "info" | "success" | "error" | "warning".
function showToast(message, type = "info", duration = 4000) {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <svg class="toast-icon" viewBox="0 0 24 24">${TOAST_ICONS[type] || TOAST_ICONS.info}</svg>
    <div class="toast-message"></div>
    <button type="button" class="toast-close" aria-label="Fermer">&times;</button>
  `;
  toast.querySelector(".toast-message").textContent = message;

  const dismiss = () => {
    toast.classList.add("toast-leaving");
    toast.classList.remove("toast-visible");
    setTimeout(() => toast.remove(), 250);
  };

  toast.querySelector(".toast-close").addEventListener("click", dismiss);
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("toast-visible"));

  if (duration > 0) setTimeout(dismiss, duration);
}

export {
  formatCurrency,
  escapeHtml,
  generateUid,
  debounce,
  calculateDaysCount,
  getActivityReferences,
  getRoomsTariffTotal,
  OTHER_ROOM_VALUE,
  getReservationRoomLabel,
  getRoomColor,
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
  buildSearchableSelectHtml,
  initSearchableSelectEl,
  maskDateInput,
  maskPhoneInput,
  showToast,
  showLoadingOverlay,
  hideLoadingOverlay
};

if (typeof window !== "undefined") {
  window.formatCurrency = formatCurrency;
  window.escapeHtml = escapeHtml;
  window.generateUid = generateUid;
  window.debounce = debounce;
  window.calculateDaysCount = calculateDaysCount;
  window.getActivityReferences = getActivityReferences;
  window.getRoomsTariffTotal = getRoomsTariffTotal;
  window.OTHER_ROOM_VALUE = OTHER_ROOM_VALUE;
  window.getReservationRoomLabel = getReservationRoomLabel;
  window.getRoomColor = getRoomColor;
  window.buildPaginationBarHtml = buildPaginationBarHtml;
  window.renderPaginationBar = renderPaginationBar;
  window.setPillGroupActiveEl = setPillGroupActiveEl;
  window.setPillGroupActive = setPillGroupActive;
  window.initPillToggleEl = initPillToggleEl;
  window.initPillToggle = initPillToggle;
  window.initExclusivePillToggleEl = initExclusivePillToggleEl;
  window.initExclusivePillToggle = initExclusivePillToggle;
  window.getExclusivePillValueEl = getExclusivePillValueEl;
  window.getExclusivePillValue = getExclusivePillValue;
  window.setExclusivePillValueEl = setExclusivePillValueEl;
  window.setExclusivePillValue = setExclusivePillValue;
  window.buildSearchableSelectHtml = buildSearchableSelectHtml;
  window.initSearchableSelectEl = initSearchableSelectEl;
  window.maskDateInput = maskDateInput;
  window.maskPhoneInput = maskPhoneInput;
  window.showToast = showToast;
  window.showLoadingOverlay = showLoadingOverlay;
  window.hideLoadingOverlay = hideLoadingOverlay;
}
