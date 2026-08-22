/**
 * tax-override.ts - The "Ajuster les taxes..." modal: lets a user replace the default TPS/TVQ
 * rate for a single activity with either a different rate (e.g. 0 for a fully exonerated
 * organization) or a flat dollar amount, each annotated with a note explaining why. Deliberately
 * kept out of the main form flow (a small icon next to the TPS/TVQ lines, not a form field) since
 * this is an exception path used rarely, not a routine input.
 */
import { appState } from "../state/state.ts";
import { commitActivityPatch } from "./form-state-bar.ts";
import { updateSubmissionFinancialSummary } from "./financial-summary.ts";
import type { TaxOverride } from "./financial-summary.ts";
import { trapFocus, type FocusTrapController } from "../utils/focus-trap.ts";

function safeEl<T extends Element = HTMLElement>(id: string): T | null {
  return (document.getElementById(id) as unknown as T) || null;
}

let currentActivityId: string | null = null;
let taxOverrideFocusTrap: FocusTrapController | null = null;

function fillTaxSection(tax: "tps" | "tvq", override: TaxOverride | undefined) {
  const modeEl = safeEl<HTMLSelectElement>(`tax-override-${tax}-mode`);
  const valueEl = safeEl<HTMLInputElement>(`tax-override-${tax}-value`);
  const noteEl = safeEl<HTMLTextAreaElement>(`tax-override-${tax}-note`);

  if (modeEl) modeEl.value = override ? override.mode : "default";
  if (valueEl) valueEl.value = override ? (override.mode === "rate" ? String(override.value * 100) : String(override.value)) : "";
  if (noteEl) noteEl.value = override ? override.note : "";
  if (modeEl) modeEl.dispatchEvent(new Event("change"));
}

function readTaxSection(tax: "tps" | "tvq"): TaxOverride | undefined {
  const modeEl = safeEl<HTMLSelectElement>(`tax-override-${tax}-mode`);
  const mode = modeEl ? modeEl.value : "default";
  if (mode === "default") return undefined;

  const valueEl = safeEl<HTMLInputElement>(`tax-override-${tax}-value`);
  const noteEl = safeEl<HTMLTextAreaElement>(`tax-override-${tax}-note`);

  const rawValue = Math.max(0, parseFloat(valueEl ? valueEl.value : "0") || 0);
  const note = noteEl ? noteEl.value.trim() : "";
  const value = mode === "rate" ? rawValue / 100 : rawValue;

  return { mode: mode as "rate" | "amount", value, note };
}

import { triggerOpenTaxOverrideModal, isTaxOverrideModalSubscribed } from "../components/modals/TaxOverrideModal.tsx";

export function openTaxOverrideModal(activityId: string) {
  if (isTaxOverrideModalSubscribed()) {
    triggerOpenTaxOverrideModal(activityId);
    return;
  }

  const act = appState.activities.find((a: any) => a.id === activityId);
  if (!act) return;

  currentActivityId = activityId;
  const overrides = act.tax_overrides || {};
  fillTaxSection("tps", overrides.tps as TaxOverride | undefined);
  fillTaxSection("tvq", overrides.tvq as TaxOverride | undefined);
  
  const warning = safeEl("tax-override-non-taxable-warning");
  if (warning) warning.style.display = act.non_taxable ? "block" : "none";

  const modal = safeEl("tax-override-modal");
  if (modal) {
    modal.classList.add("active");
    if (taxOverrideFocusTrap) taxOverrideFocusTrap.deactivate();
    taxOverrideFocusTrap = trapFocus(modal);
  }
  safeEl("modal-backdrop")?.classList.add("active");
}

export function closeTaxOverrideModal() {
  if (taxOverrideFocusTrap) {
    taxOverrideFocusTrap.deactivate();
    taxOverrideFocusTrap = null;
  }
  currentActivityId = null;
  safeEl("tax-override-modal")?.classList.remove("active");
  safeEl("modal-backdrop")?.classList.remove("active");
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

export function initTaxOverrideModal() {
  safeEl("tax-override-modal-close")?.addEventListener("click", closeTaxOverrideModal);
  safeEl("tax-override-modal-cancel")?.addEventListener("click", closeTaxOverrideModal);
  safeEl("tax-override-modal-save")?.addEventListener("click", saveTaxOverrides);

  (["tps", "tvq"] as const).forEach(tax => {
    const modeEl = safeEl<HTMLSelectElement>(`tax-override-${tax}-mode`);
    const valueEl = safeEl<HTMLInputElement>(`tax-override-${tax}-value`);
    if (modeEl && valueEl) {
      modeEl.addEventListener("change", () => {
        valueEl.disabled = modeEl.value === "default";
        valueEl.placeholder = modeEl.value === "amount" ? "Montant ($)" : "Ex: 0 pour une exonération complète (%)";
      });
    }
  });
}
