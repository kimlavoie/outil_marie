/**
 * dashboard.js - Dashboard view: KPI stats and Chart.js visualizations
 */

// Chart.js instances, grouped so they're easy to find/destroy together on re-render
let dashboardCharts = {
  quarterly: null,
  salle: null,
  accounts: null
};

// Pure KPI computation (no DOM) so it can be unit tested directly.
function computeDashboardStats(activities, selectedYear, selectedQuarters, reconciliationResults) {
  let totalRevenue = 0;
  let totalInternalFree = 0;
  let filledCount = 0;

  activities.forEach(act => {
    const isFilled = act.name.trim() !== "";
    if (!isFilled) return;

    // Period filter
    const actYear = getFiscalYear(act.date_start);
    const actQuarter = getQuarterNumber(act.date_start);
    if (actYear !== selectedYear || !selectedQuarters.includes(actQuarter)) {
      return;
    }

    filledCount++;

    // Revenue sum for this activity
    const activityRevenue = act.distributions.reduce((sum, dist) => sum + dist.amount, 0);
    totalRevenue += activityRevenue;

    // Internal free valuation: client is internal, and no actual charge (revenue is zero)
    if (act.client_type === "interne" && activityRevenue === 0) {
      totalInternalFree += getRoomsTariffTotal(act);
    }
  });

  // Reconciliation Rate
  let reconciliationRate = 0;
  if (reconciliationResults.length > 0) {
    const validCount = reconciliationResults.filter(r => r.status === "valid").length;
    // Rate is valid divided by total matched records in ledger/application
    // Let's filter records that are relevant (exclude ledger-only missing entries)
    const appRecordsCount = reconciliationResults.filter(r => r.status !== "unentered").length;
    if (appRecordsCount > 0) {
      reconciliationRate = Math.round((validCount / appRecordsCount) * 100);
    }
  }

  return { totalRevenue, totalInternalFree, filledCount, reconciliationRate };
}

function renderDashboard() {
  const stats = computeDashboardStats(
    appState.activities,
    appState.selected_year,
    appState.selected_quarters,
    reconciliationState.results
  );

  document.getElementById("stat-revenue-total").textContent = formatCurrency(stats.totalRevenue);
  document.getElementById("stat-revenue-internal-free").textContent = formatCurrency(stats.totalInternalFree);
  document.getElementById("stat-activities-count").textContent = stats.filledCount;
  document.getElementById("stat-reconciled-percent").textContent = `${stats.reconciliationRate}%`;

  // Render charts
  renderDashboardCharts();
}

function renderDashboardCharts() {
  const isDark = appState.settings.theme === "dark";
  const gridColor = isDark ? "#1f2937" : "#e2e8f0";
  const textColor = isDark ? "#9ca3af" : "#475569";

  // 1. Quarterly Revenues
  const quarterlySums = {
    "T1 (Jul-Sep)": 0,
    "T2 (Oct-Dec)": 0,
    "T3 (Jan-Mar)": 0,
    "T4 (Apr-Jun)": 0
  };

  appState.activities.forEach(act => {
    if (act.name.trim() === "") return;

    // Period filter (check fiscal year only for quarters breakdown)
    if (getFiscalYear(act.date_start) !== appState.selected_year) return;

    const q = getQuarter(act.date_start);
    if (q && quarterlySums.hasOwnProperty(q)) {
      const sumDist = act.distributions.reduce((sum, dist) => sum + dist.amount, 0);
      quarterlySums[q] += sumDist;
    }
  });

  if (dashboardCharts.quarterly) dashboardCharts.quarterly.destroy();
  const ctxQ = document.getElementById("chart-quarterly-revenues").getContext("2d");
  dashboardCharts.quarterly = new Chart(ctxQ, {
    type: "bar",
    data: {
      labels: Object.keys(quarterlySums),
      datasets: [{
        label: "Revenus réels ($)",
        data: Object.values(quarterlySums),
        backgroundColor: "rgba(59, 130, 246, 0.75)",
        borderColor: "#3b82f6",
        borderWidth: 2,
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: textColor } },
        y: { grid: { color: gridColor }, ticks: { color: textColor } }
      }
    }
  });

  // 2. Revenue share by Room (salle)
  const roomSums = {};
  appState.activities.forEach(act => {
    if (act.name.trim() === "") return;

    // Period filter
    const actYear = getFiscalYear(act.date_start);
    const actQuarter = getQuarterNumber(act.date_start);
    if (actYear !== appState.selected_year || !appState.selected_quarters.includes(actQuarter)) {
      return;
    }

    const rName = (act.rooms && act.rooms.length) ? act.rooms.map(r => r.name).join(", ") : "Inconnue";
    const sumDist = act.distributions.reduce((sum, dist) => sum + dist.amount, 0);
    roomSums[rName] = (roomSums[rName] || 0) + sumDist;
  });

  const roomLabels = Object.keys(roomSums);
  const roomData = Object.values(roomSums);

  if (dashboardCharts.salle) dashboardCharts.salle.destroy();
  const ctxS = document.getElementById("chart-salle-share").getContext("2d");

  if (roomLabels.length === 0) {
    roomLabels.push("Aucune donnée");
    roomData.push(1);
  }

  dashboardCharts.salle = new Chart(ctxS, {
    type: "doughnut",
    data: {
      labels: roomLabels,
      datasets: [{
        data: roomData,
        backgroundColor: [
          "#3b82f6", // Blue
          "#10b981", // Green
          "#8b5cf6", // Purple
          "#f59e0b", // Yellow/Orange
          "#f43f5e", // Pink/Red
          "#14b8a6", // Teal
        ],
        borderWidth: isDark ? 2 : 1,
        borderColor: isDark ? "#111827" : "#ffffff"
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom",
          labels: { color: textColor, boxWidth: 12, padding: 16 }
        }
      }
    }
  });

  // 3. Revenues by Account
  const accountSums = {};
  appState.activities.forEach(act => {
    if (act.name.trim() === "") return;

    // Period filter
    const actYear = getFiscalYear(act.date_start);
    const actQuarter = getQuarterNumber(act.date_start);
    if (actYear !== appState.selected_year || !appState.selected_quarters.includes(actQuarter)) {
      return;
    }

    act.distributions.forEach(dist => {
      if (dist.amount > 0) {
        accountSums[dist.account_code] = (accountSums[dist.account_code] || 0) + dist.amount;
      }
    });
  });

  // Sort accounts by amount descending
  const sortedAccounts = Object.entries(accountSums)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8); // Top 8 accounts

  const accLabels = sortedAccounts.map(item => item[0]);
  const accData = sortedAccounts.map(item => item[1]);

  if (dashboardCharts.accounts) dashboardCharts.accounts.destroy();
  const ctxA = document.getElementById("chart-accounts-volume").getContext("2d");
  dashboardCharts.accounts = new Chart(ctxA, {
    type: "bar",
    data: {
      labels: accLabels,
      datasets: [{
        label: "Revenus ($)",
        data: accData,
        backgroundColor: "rgba(139, 92, 246, 0.75)",
        borderColor: "#8b5cf6",
        borderWidth: 2,
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: textColor } },
        y: { grid: { color: gridColor }, ticks: { color: textColor } }
      }
    }
  });
}

// Exposed to Node's test runner (test/*.test.js); no-op in the browser, where `module` is undefined.
if (typeof module !== "undefined") {
  module.exports = { computeDashboardStats };
}
