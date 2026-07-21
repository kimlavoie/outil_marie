/**
 * searchable-select.ts - Text input + filtered popover control, styled like the global search
 * (buildSearchableSelectHtml/initSearchableSelectEl). Split out of utils.ts (see that file for
 * why it stays a barrel re-exporting this alongside the format/activity-helpers/dom-helpers/
 * select-helpers modules).
 */
import { debounce } from "./dom-helpers.ts";
import { escapeHtml } from "./format.ts";

// Builds the markup for one searchable-select instance: a text input (mirrors .search-input)
// plus a filtered results popover (mirrors .calendar-popover / .quick-access-item). The
// currently selected value is kept in a hidden input so callers can read it back like a <select>.
// A chevron makes it read as a dropdown rather than a free-text field, even though it's typeable.
function buildSearchableSelectHtml(wrapperClass: string, inputClass: string, placeholder: string, id = "") {
  return `
    <div class="${wrapperClass} searchable-select-wrapper" style="position: relative;">
      <input type="text" ${id ? `id="${id}"` : ""} class="form-input ${inputClass} searchable-select-input" placeholder="${placeholder}" autocomplete="off" style="padding-right: 34px; cursor: pointer;">
      <svg class="searchable-select-caret" viewBox="0 0 24 24" style="width: 18px; height: 18px; fill: var(--text-muted); position: absolute; right: 10px; top: 50%; transform: translateY(-50%); pointer-events: none;"><path d="M7 10l5 5 5-5z"/></svg>
      <input type="hidden" name="${id || inputClass}-value" class="searchable-select-value">
      <div class="calendar-popover searchable-select-results" style="left: 0; right: auto; width: 100%; max-height: 220px; overflow-y: auto;"></div>
    </div>
  `;
}

// Wires a searchable-select instance built by buildSearchableSelectHtml(). `items` is
// [{value, label}]. `onChange(value)` fires whenever the user picks an item. `initialValue`
// pre-selects and pre-fills the input's displayed text. Unlike a plain text field, the input
// always snaps back to the current selection's label once the list closes — typing only ever
// filters the dropdown, it can never leave behind text that isn't a real selection.
function initSearchableSelectEl(
  wrapper: HTMLElement | null,
  items: { value: string; label: string }[],
  onChange?: (value: string) => void,
  initialValue = ""
) {
  if (!wrapper) return;
  const input = wrapper.querySelector(".searchable-select-input") as HTMLInputElement;
  const valueInput = wrapper.querySelector(".searchable-select-value") as HTMLInputElement;
  const resultsPanel = wrapper.querySelector(".searchable-select-results") as HTMLElement;

  const selectedItem = items.find(i => i.value === initialValue);
  valueInput.value = initialValue || "";
  input.value = selectedItem ? selectedItem.label : "";

  let highlightedIndex = -1;

  function renderResults(query: string) {
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
      <div class="quick-access-item searchable-select-option" data-value="${escapeHtml(item.value)}" data-idx="${idx}"
           style="padding: 8px 12px; border-radius: var(--radius-sm); cursor: pointer; ${idx === 0 ? "background-color: var(--bg-main);" : ""}">
        ${escapeHtml(item.label)}
      </div>
    `
      )
      .join("");
    resultsPanel.classList.add("active");

    resultsPanel.querySelectorAll(".searchable-select-option").forEach(opt => {
      opt.addEventListener("mousedown", e => {
        e.preventDefault(); // keep focus so the ensuing click doesn't re-open the panel
        selectItem(filtered[parseInt((opt as HTMLElement).dataset.idx as string, 10)]);
      });
    });
  }

  function selectItem(item: { value: string; label: string }) {
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

  function setHighlight(idx: number) {
    highlightedIndex = idx;
    resultsPanel.querySelectorAll(".searchable-select-option").forEach((opt, i) => {
      (opt as HTMLElement).style.backgroundColor = i === idx ? "var(--bg-main)" : "";
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
    const options = Array.from(resultsPanel.querySelectorAll(".searchable-select-option")) as HTMLElement[];
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
      if (opt) {
        const found = items.find(i => i.value === opt.dataset.value);
        if (found) selectItem(found);
      }
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
    if (!wrapper.contains(e.target as Node)) resultsPanel.classList.remove("active");
  });
}

export { buildSearchableSelectHtml, initSearchableSelectEl };
