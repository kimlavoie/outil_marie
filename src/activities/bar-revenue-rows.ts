/**
 * activities-bar-revenue-rows.ts - Adds a bar revenue row to the activity form.
 * Handles row creation, deleting, values binding, and total calculation.
 */
import { appState } from "../state/state.ts";
import {
  escapeHtml,
  buildSearchableSelectHtml,
  initSearchableSelectEl,
  rejectNegativeAmountOnBlur,
  elById,
  formatCurrency
} from "../utils/utils.ts";
import { autoSaveActivityForm } from "./autosave.ts";

export function updateBarRevenueTotal() {
  const totalValEl = elById("form-bar-revenue-total-val");
  if (!totalValEl) return;

  let total = 0;
  document.querySelectorAll(".bar-amount-input").forEach(input => {
    const val = parseFloat((input as HTMLInputElement).value) || 0;
    total += val;
  });
  totalValEl.textContent = formatCurrency(total);
}

export function addBarRevenueRow(accountCode = "", amount = 0, receiptNumber = "", paymentMethod = "") {
  const container = elById("form-bar-revenue-list");
  if (!container) return;

  const rowId = "bar-row-" + Date.now() + Math.random().toString(36).substr(2, 5);

  const rowHtml = `
    <div id="${rowId}" class="bar-revenue-row distribution-row" style="grid-template-columns: 1.3fr 0.8fr 1fr 1.3fr auto; gap: 8px; align-items: center; margin-bottom: 8px;">
      ${buildSearchableSelectHtml("bar-account-select-wrapper", "bar-account-select", "Code budgétaire...", `${rowId}-account`)}
      <input type="number" id="${rowId}-amount" class="form-input bar-amount-input" min="0" step="0.01" value="${amount > 0 ? amount : ""}" placeholder="Montant $" style="padding: 8px 12px; font-size: 0.85rem;">
      <input type="text" id="${rowId}-receipt" class="form-input bar-receipt-input" value="${escapeHtml(receiptNumber)}" placeholder="N° d'encaissement" style="padding: 8px 12px; font-size: 0.85rem;">
      <select id="${rowId}-payment-method" class="form-input bar-payment-method-select" style="padding: 8px 12px; font-size: 0.85rem;">
        <option value="">Mode de paiement...</option>
        <option value="comptant" ${paymentMethod === "comptant" ? "selected" : ""}>Comptant</option>
        <option value="VISA" ${paymentMethod === "VISA" ? "selected" : ""}>VISA</option>
        <option value="Mastercard" ${paymentMethod === "Mastercard" ? "selected" : ""}>Mastercard</option>
        <option value="Paiement direct" ${paymentMethod === "Paiement direct" ? "selected" : ""}>Paiement direct</option>
      </select>
      <button type="button" class="btn-icon delete-bar-row-btn" data-row-id="${rowId}">
        <svg viewBox="0 0 24 24" style="width: 14px; height: 14px;"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
      </button>
    </div>
  `;

  container.insertAdjacentHTML("beforeend", rowHtml);

  const newRow = elById(rowId);
  if (!newRow) return;

  newRow.querySelector(".delete-bar-row-btn")!.addEventListener("click", () => {
    const amt = parseFloat(newRow.querySelector<HTMLInputElement>(".bar-amount-input")!.value) || 0;
    const acc = newRow.querySelector<HTMLInputElement>(".bar-account-select-wrapper .searchable-select-value")?.value || "";
    const receipt = newRow.querySelector<HTMLInputElement>(".bar-receipt-input")!.value.trim();
    const pay = newRow.querySelector<HTMLSelectElement>(".bar-payment-method-select")!.value;

    const hasContent = amt > 0 || !!acc || !!receipt || !!pay;
    if (hasContent && !confirm("Retirer cette ligne de revenus du bar ?")) return;

    newRow.remove();
    updateBarRevenueTotal();
    autoSaveActivityForm();
  });

  const glItems = appState.settings.accounts.map(acc => ({
    value: acc.code,
    label: `${acc.code} (${acc.description})`
  }));

  initSearchableSelectEl(
    newRow.querySelector<HTMLElement>(".bar-account-select-wrapper")!,
    glItems,
    value => {
      autoSaveActivityForm();
    },
    accountCode
  );

  newRow.querySelector(".bar-amount-input")!.addEventListener("input", () => {
    updateBarRevenueTotal();
  });
  newRow.querySelector(".bar-amount-input")!.addEventListener("change", () => {
    updateBarRevenueTotal();
    autoSaveActivityForm();
  });
  newRow.querySelector(".bar-receipt-input")!.addEventListener("change", () => {
    autoSaveActivityForm();
  });
  newRow.querySelector(".bar-payment-method-select")!.addEventListener("change", () => {
    autoSaveActivityForm();
  });

  rejectNegativeAmountOnBlur(newRow.querySelector<HTMLInputElement>(".bar-amount-input")!);

  updateBarRevenueTotal();
}
