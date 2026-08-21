/**
 * select-helpers.ts - Multi-select dropdown filters (toolbar buttons that open a checkbox list).
 * Split out of utils.ts (see that file for why it stays a barrel re-exporting this alongside the
 * format/activity-helpers/dom-helpers/searchable-select modules).
 */

// Reads the checked values out of a multi-select panel (empty array means "no filter applied")
function getMultiSelectValues(panelId: string): string[] {
  const panel = document.getElementById(panelId);
  if (!panel) return [];
  return Array.from(panel.querySelectorAll<HTMLInputElement>("input[type=checkbox]:checked")).map(cb => cb.value);
}

// Checks/unchecks the panel's checkboxes to match `values`, then refreshes the button label
function setMultiSelectValues(panelId: string, values: string[]) {
  const panel = document.getElementById(panelId);
  if (!panel) return;
  panel.querySelectorAll<HTMLInputElement>("input[type=checkbox]").forEach(cb => {
    cb.checked = values.includes(cb.value);
  });
  updateMultiSelectLabel(panelId);
}

// Updates the toggle button's label: the default label when nothing (or everything) is checked,
// the single option's text when exactly one is checked, otherwise a "N sélectionnés" summary
function updateMultiSelectLabel(panelId: string) {
  const panel = document.getElementById(panelId);
  const btn = document.getElementById(panelId.replace(/-panel$/, "-btn"));
  if (!panel || !btn) return;

  const checkboxes = Array.from(panel.querySelectorAll<HTMLInputElement>("input[type=checkbox]"));
  const checked = checkboxes.filter(cb => cb.checked);
  const defaultLabel = btn.dataset.defaultLabel || "";

  if (checked.length === 0 || checked.length === checkboxes.length) {
    btn.textContent = defaultLabel;
    btn.classList.remove("filter-active");
  } else {
    let suffix = "sélectionnés";
    if (panelId.includes("salle")) {
      suffix = "salles";
    } else if (panelId.includes("status")) {
      suffix = "états";
    } else if (panelId.includes("client-type")) {
      suffix = "types client";
    }

    if (checked.length === 1) {
      const text = (checked[0].closest("label")?.textContent || defaultLabel).trim();
      btn.textContent = text;
    } else {
      btn.textContent = `${checked.length} ${suffix}`;
    }
    btn.classList.add("filter-active");
  }
}

// Wires open/close (button click, outside click, only one panel open at a time) and change
// handling for a toolbar multi-select filter. Call once per filter after its markup exists.
function initMultiSelectDropdown(btnId: string, panelId: string, onChange: () => void) {
  const btn = document.getElementById(btnId);
  const panel = document.getElementById(panelId);
  if (!btn || !panel) return;

  btn.onclick = e => {
    e.stopPropagation();
    const wasHidden = panel.hidden;
    document.querySelectorAll<HTMLElement>(".multi-select-panel").forEach(p => {
      p.hidden = true;
      const b = document.getElementById(p.id.replace(/-panel$/, "-btn"));
      if (b) b.setAttribute("aria-expanded", "false");
    });
    panel.hidden = !wasHidden;
    btn.setAttribute("aria-expanded", String(!wasHidden));
  };

  panel.onchange = e => {
    if (!(e.target as HTMLElement).matches("input[type=checkbox]")) return;
    updateMultiSelectLabel(panelId);
    onChange();
  };

  if (!(window as any)._multiSelectGlobalClickListenerSet) {
    (window as any)._multiSelectGlobalClickListenerSet = true;
    document.addEventListener("click", e => {
      const target = e.target as Node;
      document.querySelectorAll<HTMLElement>(".multi-select-panel").forEach(p => {
        if (p.hidden) return;
        const b = document.getElementById(p.id.replace(/-panel$/, "-btn"));
        if (p.contains(target) || (b && b.contains(target))) return;
        p.hidden = true;
        if (b) b.setAttribute("aria-expanded", "false");
      });
    });
  }
}

export { getMultiSelectValues, setMultiSelectValues, updateMultiSelectLabel, initMultiSelectDropdown };
