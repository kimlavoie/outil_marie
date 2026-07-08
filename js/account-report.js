/**
 * account-report.js - "Grand Livre local" view: per-account ledger cards
 * built from activity distributions
 */
import { appState, getFiscalYear, getQuarterNumber, saveUiState } from "./state.js";
import { escapeHtml, formatCurrency, buildPaginationBarHtml } from "./utils.ts";

// Account report view state, grouped (sort/pagination are per-account since
// each account renders its own independently-paginated card)
const accountReportState = {
  sortKey: "id",
  sortOrder: "asc",
  pageSize: 10,
  pages: {} // { [accountCode]: pageNumber }
};

function renderAccountReport() {
  saveUiState();
  const container = document.getElementById("account-report-container");
  const filterAccount = document.getElementById("filter-report-account").value;

  container.innerHTML = "";

  // 1. Group activity distributions by account code
  // We want to map: accountCode -> array of { activity, distAmount }
  const accountEntries = {};

  // Initialize for all configured accounts
  appState.settings.accounts.forEach(acc => {
    accountEntries[acc.code] = [];
  });

  // Populate from activities
  appState.activities.forEach(act => {
    if (act.deleted) return;
    if (act.name.trim() === "") return; // Skip blank activities

    // Period filter
    const actYear = getFiscalYear(act.date_start);
    const actQuarter = getQuarterNumber(act.date_start);
    if (actYear !== appState.selected_year || !appState.selected_quarters.includes(actQuarter)) {
      return;
    }

    act.distributions.forEach(d => {
      if (accountEntries[d.account_code]) {
        accountEntries[d.account_code].push({
          activity: act,
          amount: d.amount,
          reference: d.reference
        });
      } else {
        // Fallback in case account code is not in configured settings list
        accountEntries[d.account_code] = [
          {
            activity: act,
            amount: d.amount,
            reference: d.reference
          }
        ];
      }
    });
  });

  // Determine which accounts to render
  let accountsToRender = appState.settings.accounts;
  if (filterAccount) {
    accountsToRender = appState.settings.accounts.filter(a => a.code === filterAccount);
  }

  // If we show "All", let's only display accounts that have at least one transaction entry.
  // If the user selected a specific account, we display it even if it has no entries.
  if (!filterAccount) {
    accountsToRender = accountsToRender.filter(acc => accountEntries[acc.code] && accountEntries[acc.code].length > 0);

    if (accountsToRender.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 48px; color: var(--text-secondary); background-color: var(--bg-main); border-radius: var(--radius-lg); border: 1px dashed var(--border-color);">
          <h3>Aucune écriture comptable saisie</h3>
          <p style="margin-top: 8px; font-size: 0.9rem;">Veuillez saisir des activités et ventiler des montants dans l'onglet <strong>Activités</strong> pour générer les fiches de compte.</p>
        </div>
      `;
      return;
    }
  }

  // Render tables
  accountsToRender.forEach(acc => {
    const entries = accountEntries[acc.code] || [];
    const totalAcc = entries.reduce((sum, e) => sum + e.amount, 0);

    // Sort entries according to the current account report sort state
    entries.sort((a, b) => {
      let valA = "";
      let valB = "";

      switch (accountReportState.sortKey) {
        case "id":
          valA = a.activity.id;
          valB = b.activity.id;
          break;
        case "name":
          valA = a.activity.name.toLowerCase();
          valB = b.activity.name.toLowerCase();
          break;
        case "date_start":
          valA = a.activity.date_start || "";
          valB = b.activity.date_start || "";
          break;
        case "department":
          valA = (a.activity.department || "").toLowerCase();
          valB = (b.activity.department || "").toLowerCase();
          break;
        case "reference":
          valA = (a.reference || "").toLowerCase();
          valB = (b.reference || "").toLowerCase();
          break;
        case "amount":
          valA = a.amount;
          valB = b.amount;
          break;
      }

      if (typeof valA === "string" && typeof valB === "string") {
        return accountReportState.sortOrder === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
      } else {
        return accountReportState.sortOrder === "asc" ? valA - valB : valB - valA;
      }
    });

    // Paginate this account's entries independently from the other fiches
    const accountPage = accountReportState.pages[acc.code] || 1;
    const totalPages = Math.max(1, Math.ceil(entries.length / accountReportState.pageSize));
    const clampedAccountPage = Math.min(Math.max(1, accountPage), totalPages);
    const pageStartIdx = (clampedAccountPage - 1) * accountReportState.pageSize;
    const pageEntries = entries.slice(pageStartIdx, pageStartIdx + accountReportState.pageSize);

    let tableRowsHtml = "";
    if (entries.length === 0) {
      tableRowsHtml = `
        <tr>
          <td colspan="6" class="text-center" style="color: var(--text-muted); padding: 24px;">
            Aucune écriture enregistrée pour ce compte.
          </td>
        </tr>
      `;
    } else {
      pageEntries.forEach(e => {
        const act = e.activity;
        let datesText = "-";
        if (act.date_start && act.date_end) {
          const start = new Date(act.date_start).toLocaleDateString("fr-CA", { month: "short", day: "numeric" });
          const end = new Date(act.date_end).toLocaleDateString("fr-CA", { month: "short", day: "numeric" });
          datesText = `${start} au ${end}`;
        }

        tableRowsHtml += `
          <tr>
            <td class="font-mono bold">${act.id}</td>
            <td>${escapeHtml(act.name)}</td>
            <td>${datesText}</td>
            <td>${escapeHtml(act.department)}</td>
            <td class="font-mono">${escapeHtml(e.reference) || "-"}</td>
            <td class="bold text-right font-mono" style="color: var(--success-text);">${formatCurrency(e.amount)}</td>
          </tr>
        `;
      });
    }

    container.innerHTML += `
      <div class="stat-card" style="padding: 0; display: flex; flex-direction: column; gap: 0;">
        <div style="padding: 16px 24px; border-bottom: 1px solid var(--border-color); background-color: var(--primary-light); display: flex; justify-content: space-between; align-items: center; border-radius: var(--radius-lg) var(--radius-lg) 0 0;">
          <div>
            <span class="font-mono bold" style="font-size: 1.05rem; color: var(--primary);">${acc.code}</span>
            <span class="bold" style="margin-left: 12px; font-size: 0.95rem; color: var(--text-primary);">${escapeHtml(acc.description)}</span>
          </div>
          <div style="font-size: 0.8rem; color: var(--text-muted); font-weight: 500;">
            ${entries.length} écriture(s)
          </div>
        </div>

        <div class="table-responsive">
          <table style="width: 100%; border-collapse: separate; border-spacing: 0;">
            <thead>
              <tr style="background-color: var(--bg-main);">
                <th data-sort="id" class="${accountReportState.sortKey === "id" ? (accountReportState.sortOrder === "asc" ? "sort-asc" : "sort-desc") : ""}" style="padding: 12px 24px; font-size: 0.8rem; font-weight: 700; text-transform: uppercase; color: var(--text-secondary);">N° Activité</th>
                <th data-sort="name" class="${accountReportState.sortKey === "name" ? (accountReportState.sortOrder === "asc" ? "sort-asc" : "sort-desc") : ""}" style="padding: 12px 24px; font-size: 0.8rem; font-weight: 700; text-transform: uppercase; color: var(--text-secondary);">Nom de l'Activité</th>
                <th data-sort="date_start" class="${accountReportState.sortKey === "date_start" ? (accountReportState.sortOrder === "asc" ? "sort-asc" : "sort-desc") : ""}" style="padding: 12px 24px; font-size: 0.8rem; font-weight: 700; text-transform: uppercase; color: var(--text-secondary);">Dates d'occupation</th>
                <th data-sort="department" class="${accountReportState.sortKey === "department" ? (accountReportState.sortOrder === "asc" ? "sort-asc" : "sort-desc") : ""}" style="padding: 12px 24px; font-size: 0.8rem; font-weight: 700; text-transform: uppercase; color: var(--text-secondary);">Département</th>
                <th data-sort="reference" class="${accountReportState.sortKey === "reference" ? (accountReportState.sortOrder === "asc" ? "sort-asc" : "sort-desc") : ""}" style="padding: 12px 24px; font-size: 0.8rem; font-weight: 700; text-transform: uppercase; color: var(--text-secondary);">RI / Facture Réf.</th>
                <th data-sort="amount" class="${accountReportState.sortKey === "amount" ? (accountReportState.sortOrder === "asc" ? "sort-asc" : "sort-desc") : ""}" style="padding: 12px 24px; font-size: 0.8rem; font-weight: 700; text-transform: uppercase; color: var(--text-secondary); text-align: right;">Montant</th>
              </tr>
            </thead>
            <tbody>
              ${tableRowsHtml}
              <tr style="background-color: var(--bg-main); border-top: 2px solid var(--border-color);">
                <td colspan="5" class="bold text-right" style="padding: 16px 24px; font-size: 0.92rem; text-transform: uppercase;">
                  Total pour le compte ${acc.code} :
                </td>
                <td class="bold text-right font-mono" style="padding: 16px 24px; font-size: 1.05rem; color: var(--primary);">
                  ${formatCurrency(totalAcc)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="pagination-bar">${
          entries.length > 0
            ? buildPaginationBarHtml({
                page: clampedAccountPage,
                pageSize: accountReportState.pageSize,
                totalItems: entries.length,
                extraAttr: `data-account="${acc.code}"`
              }).html
            : ""
        }</div>
      </div>
    `;
  });

  // Wire up sortable headers and pagination controls (delegated, since the
  // per-account cards are rebuilt via innerHTML += on every render, which
  // would otherwise tear down any directly-attached listeners)
  container.onclick = e => {
    const th = e.target.closest("th[data-sort]");
    if (th && container.contains(th)) {
      const sortKey = th.getAttribute("data-sort");
      if (accountReportState.sortKey === sortKey) {
        accountReportState.sortOrder = accountReportState.sortOrder === "asc" ? "desc" : "asc";
      } else {
        accountReportState.sortKey = sortKey;
        accountReportState.sortOrder = "asc";
      }
      renderAccountReport();
      return;
    }

    const pageBtn = e.target.closest(".pagination-prev, .pagination-next");
    if (pageBtn && container.contains(pageBtn)) {
      const code = pageBtn.getAttribute("data-account");
      const currentPage = accountReportState.pages[code] || 1;
      accountReportState.pages[code] = pageBtn.classList.contains("pagination-prev") ? currentPage - 1 : currentPage + 1;
      renderAccountReport();
    }
  };

  container.onchange = e => {
    const select = e.target.closest(".pagination-size-select");
    if (select && container.contains(select)) {
      accountReportState.pageSize = parseInt(select.value, 10);
      accountReportState.pages = {};
      renderAccountReport();
    }
  };
}

export { accountReportState, renderAccountReport };
