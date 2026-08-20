/**
 * tax-override.ts - The "Ajuster les taxes..." modal: lets a user replace the default TPS/TVQ
 * rate for a single activity with either a different rate (e.g. 0 for a fully exonerated
 * organization) or a flat dollar amount, each annotated with a note explaining why. Deliberately
 * kept out of the main form flow (a small icon next to the TPS/TVQ lines, not a form field) since
 * this is an exception path used rarely, not a routine input.
 */
import { appState } from "../state/state.ts";
import { elById } from "../utils/utils.ts";
import { commitActivityPatch } from "./form-state-bar.ts";
import { updateSubmissionFinancialSummary } from "./financial-summary.ts";
import type { TaxOverride } from "./financial-summary.ts";

import { trapFocus, type FocusTrapController } from "../utils/focus-trap.ts";

let currentActivityId: string | null = null;
let taxOverrideFocusTrap: FocusTrapController | null = null;

function fillTaxSection(tax: "tps" | "tvq", override: TaxOverride | undefined) {
  const modeEl = elById<HTMLSelectElement>(`tax-override-${tax}-mode`);
  const valueEl = elById<HTMLInputElement>(`tax-override-${tax}-value`);
  const noteEl = elById<HTMLTextAreaElement>(`tax-override-${tax}-note`);

  modeEl.value = override ? override.mode : "default";
  valueEl.value = override ? (override.mode === "rate" ? String(override.value * 100) : String(override.value)) : "";
  noteEl.value = override ? override.note : "";
  modeEl.dispatchEvent(new Event("change"));
}

function readTaxSection(tax: "tps" | "tvq"): TaxOverride | undefined {
  const mode = elById<HTMLSelectElement>(`tax-override-${tax}-mode`).value;
  if (mode === "default") return undefined;

  const rawValue = Math.max(0, parseFloat(elById<HTMLInputElement>(`tax-override-${tax}-value`).value) || 0);
  const note = elById<HTMLTextAreaElement>(`tax-override-${tax}-note`).value.trim();
  const value = mode === "rate" ? rawValue / 100 : rawValue;

  return { mode: mode as "rate" | "amount", value, note };
}

export function openTaxOverrideModal(activityId: string) {
  const act = appState.activities.find((a: any) => a.id === activityId);
  if (!act) return;

  currentActivityId = activityId;
  const overrides = act.tax_overrides || {};
  fillTaxSection("tps", overrides.tps as TaxOverride | undefined);
  fillTaxSection("tvq", overrides.tvq as TaxOverride | undefined);
  elById("tax-override-non-taxable-warning").style.display = act.non_taxable ? "block" : "none";

  const modal = elById("tax-override-modal");
  modal.classList.add("active");
  elById("modal-backdrop").classList.add("active");

  if (taxOverrideFocusTrap) taxOverrideFocusTrap.deactivate();
  taxOverrideFocusTrap = trapFocus(modal);
}

export function closeTaxOverrideModal() {
  if (taxOverrideFocusTrap) {
    taxOverrideFocusTrap.deactivate();
    taxOverrideFocusTrap = null;
  }
  currentActivityId = null;
  elById("tax-override-modal").classList.remove("active");
  elById("modal-backdrop").classList.remove("active");
}

function saveTaxOverrides() {
  if (!currentActivityId) return;
  const id = currentActivityId;

  const tps = readTaxSection("tps");
  const tvq = readTaxSection("tvq");
  const tax_overrides = tps || tvq ? { tps, tvq } : null;

  commitActivityPatch(id, (a: any) => {
    a.tax_overrides = tax_overrides;
  });

  closeTaxOverrideModal();
  updateSubmissionFinancialSummary();
}

// The "Ajuster les taxes..." icon itself lives inside #submission-financial-summary, which is
// fully re-rendered on every recompute (see updateSubmissionFinancialSummary()) — so it can't
// carry its own listener. form.ts's delegated click handler on the (stable) accordion element
// calls openTaxOverrideModal() directly instead.
export function initTaxOverrideModal() {
  elById("tax-override-modal-close").addEventListener("click", closeTaxOverrideModal);
  elById("tax-override-modal-cancel").addEventListener("click", closeTaxOverrideModal);
  elById("tax-override-modal-save").addEventListener("click", saveTaxOverrides);

  (["tps", "tvq"] as const).forEach(tax => {
    const modeEl = elById<HTMLSelectElement>(`tax-override-${tax}-mode`);
    const valueEl = elById<HTMLInputElement>(`tax-override-${tax}-value`);
    modeEl.addEventListener("change", () => {
      valueEl.disabled = modeEl.value === "default";
      valueEl.placeholder = modeEl.value === "amount" ? "Montant ($)" : "Ex: 0 pour une exonération complète (%)";
    });
  });
}
