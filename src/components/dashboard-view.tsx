/**
 * dashboard-view.tsx - The dashboard view's KPI stats and Chart.js visualizations.
 * Uses Chart.js configs rendered in React via JSX + refs (one Chart.js instance
 * created/destroyed per render via useEffect).
 *
 * Fully reactive via useAppState() below: any appState change anywhere in the app re-renders
 * this component and, since useChart()'s effect has no dependency array, redraws every chart too.
 * There used to be a separate dashboard-mount.ts with its own detached React root and imperative
 * renderDashboard()/renderDashboardCharts() functions for navigation.ts to call on view switch or
 * theme toggle, from before useAppState() was wired in here — but its root (#dashboard-root) was
 * never actually rendered anywhere in the DOM, so those calls were dead no-ops. Removed as part of
 * the React migration (see reconciliation-mount.ts and settings/mount.ts for the same pattern).
 *
 * Chart.js itself used to be a vendored public/lib/chart.umd.js loaded via a global <script> tag
 * (declare const Chart: any), rather than an npm dependency like every other third-party library
 * this app bundles (xlsx, pdfjs-dist, docx-preview, jszip). Switched to importing "chart.js/auto"
 * — the same auto-registering build the vendored UMD bundle was built from, so chart behavior is
 * unchanged — so it's bundled by Vite like everything else instead of needing its own <script> tag
 * and CSP allowance.
 */
import { useEffect, useRef, useState, type RefObject } from "react";
import { Chart, type ChartConfiguration } from "chart.js/auto";
import { appState, getFiscalYear, getQuarterNumber, getQuarter, useAppState } from "../state/state.ts";
import { getActivities } from "../state/activities-repository.ts";
import { getReservationRoomLabel, formatCurrency } from "../utils/utils.ts";
import { computeDashboardStats, computeEmployeeStats, computeJobsYearlyHours } from "../dashboard.ts";
import { reconciliationState } from "../services/reconciliation.ts";

function buildQuarterlyRevenuesConfig(textColor: string, gridColor: string): ChartConfiguration<"bar"> {
  const quarterlySums: Record<string, number> = {
    "T1 (Jul-Sep)": 0,
    "T2 (Oct-Dec)": 0,
    "T3 (Jan-Mar)": 0,
    "T4 (Apr-Jun)": 0
  };

  getActivities().forEach(act => {
    if (act.deleted) return;
    if (act.name.trim() === "") return;
    if (getFiscalYear(act.date_start) !== appState.selected_year) return;

    const q = getQuarter(act.date_start);
    if (q && Object.prototype.hasOwnProperty.call(quarterlySums, q)) {
      const sumDist = act.distributions.reduce((sum: number, dist: { amount: number }) => sum + dist.amount, 0);
      quarterlySums[q] += sumDist;
    }
  });

  return {
    type: "bar",
    data: {
      labels: Object.keys(quarterlySums),
      datasets: [
        {
          label: "Revenus réels ($)",
          data: Object.values(quarterlySums),
          backgroundColor: "rgba(59, 130, 246, 0.75)",
          borderColor: "#3b82f6",
          borderWidth: 2,
          borderRadius: 6
        }
      ]
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
  };
}

function buildSalleShareConfig(isDark: boolean, textColor: string): ChartConfiguration<"doughnut"> {
  const roomSums: Record<string, number> = {};
  getActivities().forEach(act => {
    if (act.deleted) return;
    if (act.name.trim() === "") return;

    const actYear = getFiscalYear(act.date_start);
    const actQuarter = getQuarterNumber(act.date_start);
    if (actYear !== appState.selected_year || actQuarter === null || !appState.selected_quarters.includes(actQuarter)) {
      return;
    }

    const rName = act.reservations && act.reservations.length ? act.reservations.map(getReservationRoomLabel).join(", ") : "Inconnue";
    const sumDist = act.distributions.reduce((sum: number, dist: { amount: number }) => sum + dist.amount, 0);
    roomSums[rName] = (roomSums[rName] || 0) + sumDist;
  });

  const roomLabels = Object.keys(roomSums);
  const roomData = Object.values(roomSums);
  if (roomLabels.length === 0) {
    roomLabels.push("Aucune donnée");
    roomData.push(1);
  }

  return {
    type: "doughnut",
    data: {
      labels: roomLabels,
      datasets: [
        {
          data: roomData,
          backgroundColor: ["#3b82f6", "#10b981", "#8b5cf6", "#f59e0b", "#f43f5e", "#14b8a6"],
          borderWidth: isDark ? 2 : 1,
          borderColor: isDark ? "#111827" : "#ffffff"
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom", labels: { color: textColor, boxWidth: 12, padding: 16 } }
      }
    }
  };
}

function buildAccountsVolumeConfig(textColor: string, gridColor: string): ChartConfiguration<"bar"> {
  const accountSums: Record<string, number> = {};
  getActivities().forEach(act => {
    if (act.deleted) return;
    if (act.name.trim() === "") return;

    const actYear = getFiscalYear(act.date_start);
    const actQuarter = getQuarterNumber(act.date_start);
    if (actYear !== appState.selected_year || actQuarter === null || !appState.selected_quarters.includes(actQuarter)) {
      return;
    }

    act.distributions.forEach((dist: { account_code: string; amount: number }) => {
      if (dist.amount > 0) {
        accountSums[dist.account_code] = (accountSums[dist.account_code] || 0) + dist.amount;
      }
    });

    // Revenus du bar : exclus de la facturation client mais comptabilisés par code budgétaire,
    // comme dans le rapport "Grand Livre local" (account-report.ts).
    (act.bar_revenue_lines || []).forEach((b: { account_code: string; amount: number }) => {
      if (b.account_code && b.amount > 0) {
        accountSums[b.account_code] = (accountSums[b.account_code] || 0) + b.amount;
      }
    });
  });

  const sortedAccounts = Object.entries(accountSums)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  return {
    type: "bar",
    data: {
      labels: sortedAccounts.map(item => item[0]),
      datasets: [
        {
          label: "Revenus ($)",
          data: sortedAccounts.map(item => item[1]),
          backgroundColor: "rgba(139, 92, 246, 0.75)",
          borderColor: "#8b5cf6",
          borderWidth: 2,
          borderRadius: 4
        }
      ]
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
  };
}

// Creates a Chart.js instance on `canvasRef` from `buildConfig()` and destroys it on the next
// render/unmount. No dependency array on purpose: DashboardView re-renders on every appState
// change (see the file header), and each of those should fully recompute + redraw the chart.
function useChart(canvasRef: RefObject<HTMLCanvasElement | null>, buildConfig: () => ChartConfiguration) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const chart = new Chart(ctx, buildConfig());
    return () => chart.destroy();
  });
}

export function DashboardView() {
  const state = useAppState();
  const stats = computeDashboardStats(state.activities, state.selected_year, state.selected_quarters, reconciliationState.results);
  const salaries = state.settings.salaries || [];
  const jobYearlyStats = computeJobsYearlyHours(state.activities, state.selected_year, salaries);
  const isDark = state.settings.theme === "dark";
  const gridColor = isDark ? "#1f2937" : "#e2e8f0";
  const textColor = isDark ? "#9ca3af" : "#475569";

  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>(() => {
    return salaries.length > 0 ? salaries[0].id : "";
  });

  const quarterlyRef = useRef<HTMLCanvasElement>(null);
  const salleRef = useRef<HTMLCanvasElement>(null);
  const accountsRef = useRef<HTMLCanvasElement>(null);

  useChart(quarterlyRef, () => buildQuarterlyRevenuesConfig(textColor, gridColor));
  useChart(salleRef, () => buildSalleShareConfig(isDark, textColor));
  useChart(accountsRef, () => buildAccountsVolumeConfig(textColor, gridColor));

  const empStats = selectedEmployeeId
    ? computeEmployeeStats(selectedEmployeeId, getActivities(), appState.selected_year, appState.selected_quarters, salaries)
    : null;

  return (
    <>
      <div className="stats-grid">
        <div className="stat-card">
          <span className="stat-label">Revenus totaux saisis</span>
          <span className="stat-value">{formatCurrency(stats.totalRevenue)}</span>
          <span className="stat-desc">Calculés sur toutes les activités</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Montant théorique interne</span>
          <span className="stat-value">{formatCurrency(stats.totalInternalFree)}</span>
          <span className="stat-desc">Valeur théorique des tarifs de salle</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Nombre d'activités</span>
          <span className="stat-value">{stats.filledCount}</span>
          <span className="stat-desc">Activités au trimestre courant</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Taux de rapprochement</span>
          <span className="stat-value">{stats.reconciliationRate}%</span>
          <span className="stat-desc">Conformité avec le Grand Livre</span>
        </div>
      </div>

      <div className="charts-grid">
        <div className="chart-card">
          <div className="chart-header">
            <span className="chart-title">Revenus trimestriels réels</span>
          </div>
          <div className="chart-container">
            <canvas ref={quarterlyRef} />
          </div>
        </div>
        <div className="chart-card">
          <div className="chart-header">
            <span className="chart-title">Répartition des revenus par salle</span>
          </div>
          <div className="chart-container">
            <canvas ref={salleRef} />
          </div>
        </div>
      </div>

      <div className="charts-grid" style={{ gridTemplateColumns: "1fr", marginTop: "20px" }}>
        <div className="chart-card" style={{ minHeight: 320 }}>
          <div className="chart-header">
            <span className="chart-title">Volume des revenus par compte de Grand Livre (Top Comptes)</span>
          </div>
          <div className="chart-container">
            <canvas ref={accountsRef} />
          </div>
        </div>
      </div>

      <div className="charts-grid" style={{ gridTemplateColumns: "1fr", marginTop: "20px" }}>
        <div className="chart-card" style={{ minHeight: "auto" }}>
          <div className="chart-header">
            <span className="chart-title">Heures totales par type d'emploi pour l'année financière {appState.selected_year}</span>
          </div>
          <div className="table-responsive">
            <table style={{ width: "100%", fontSize: "0.85rem" }}>
              <thead>
                <tr>
                  <th>Type d'emploi</th>
                  <th className="text-right">Heures Reg.</th>
                  <th className="text-right">Heures Sup.</th>
                  <th className="text-right">Total Heures</th>
                </tr>
              </thead>
              <tbody>
                {jobYearlyStats.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center" style={{ color: "var(--text-muted)", padding: "16px" }}>
                      Aucun type d'emploi configuré ou aucune heure enregistrée.
                    </td>
                  </tr>
                ) : (
                  jobYearlyStats.map(stat => (
                    <tr key={stat.jobId}>
                      <td style={{ fontWeight: 500 }}>{stat.jobName}</td>
                      <td className="text-right">{stat.normalHours.toFixed(1)} h</td>
                      <td className="text-right">{stat.overtimeHours.toFixed(1)} h</td>
                      <td className="text-right" style={{ fontWeight: 600 }}>
                        {stat.totalHours.toFixed(1)} h
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="charts-grid" style={{ gridTemplateColumns: "1fr", marginTop: "20px" }}>
        <div className="chart-card" style={{ minHeight: "auto" }}>
          <div
            className="chart-header"
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}
          >
            <span className="chart-title">Facturation et temps par employé / emploi</span>
            <select
              className="select-input"
              value={selectedEmployeeId}
              onChange={e => setSelectedEmployeeId(e.target.value)}
              style={{ minWidth: "240px" }}
            >
              <option value="">Choisir un employé / emploi...</option>
              {salaries.map((s: any) => (
                <option key={s.id} value={s.id}>
                  {s.job}
                </option>
              ))}
            </select>
          </div>

          {!selectedEmployeeId ? (
            <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--text-muted)" }}>
              Veuillez sélectionner un employé ou emploi pour afficher les statistiques correspondantes.
            </div>
          ) : empStats ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "24px", marginTop: "8px" }}>
              <div className="stats-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
                <div
                  className="stat-card"
                  style={{ padding: "16px", background: "rgba(59, 130, 246, 0.04)", borderColor: "rgba(59, 130, 246, 0.15)", gap: "4px" }}
                >
                  <span className="stat-label" style={{ fontSize: "0.75rem" }}>
                    Temps normal
                  </span>
                  <span className="stat-value" style={{ fontSize: "1.6rem", color: "var(--primary)" }}>
                    {empStats.totalNormalHours.toFixed(1)} h
                  </span>
                  <span className="stat-desc">Trimestres sélectionnés</span>
                </div>
                <div
                  className="stat-card"
                  style={{ padding: "16px", background: "rgba(16, 185, 129, 0.04)", borderColor: "rgba(16, 185, 129, 0.15)", gap: "4px" }}
                >
                  <span className="stat-label" style={{ fontSize: "0.75rem" }}>
                    Temps supplémentaire
                  </span>
                  <span className="stat-value" style={{ fontSize: "1.6rem", color: "var(--success)" }}>
                    {empStats.totalOvertimeHours.toFixed(1)} h
                  </span>
                  <span className="stat-desc">Heures supplémentaires</span>
                </div>
                <div
                  className="stat-card"
                  style={{ padding: "16px", background: "rgba(139, 92, 246, 0.04)", borderColor: "rgba(139, 92, 246, 0.15)", gap: "4px" }}
                >
                  <span className="stat-label" style={{ fontSize: "0.75rem" }}>
                    Total facturé
                  </span>
                  <span className="stat-value" style={{ fontSize: "1.6rem", color: "var(--info)" }}>
                    {formatCurrency(empStats.totalAmount)}
                  </span>
                  <span className="stat-desc">Normal + Supplémentaire</span>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "24px" }}>
                <div>
                  <h4
                    style={{
                      fontSize: "0.9rem",
                      fontWeight: 600,
                      color: "var(--text-primary)",
                      marginBottom: "12px",
                      borderBottom: "1px solid var(--border-color)",
                      paddingBottom: "6px"
                    }}
                  >
                    Répartition par trimestre
                  </h4>
                  <div className="table-responsive">
                    <table style={{ width: "100%", fontSize: "0.85rem" }}>
                      <thead>
                        <tr>
                          <th>Trimestre</th>
                          <th className="text-right">Heures Reg.</th>
                          <th className="text-right">Heures Sup.</th>
                          <th className="text-right">Total Facturé</th>
                        </tr>
                      </thead>
                      <tbody>
                        {appState.selected_quarters.map(qNum => {
                          const qData = empStats.quarterDetails[qNum] || { normalHours: 0, overtimeHours: 0, amount: 0 };
                          return (
                            <tr key={qNum}>
                              <td style={{ fontWeight: 500 }}>Trimestre {qNum}</td>
                              <td className="text-right">{qData.normalHours.toFixed(1)} h</td>
                              <td className="text-right">{qData.overtimeHours.toFixed(1)} h</td>
                              <td className="text-right" style={{ fontWeight: 600 }}>
                                {formatCurrency(qData.amount)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <h4
                    style={{
                      fontSize: "0.9rem",
                      fontWeight: 600,
                      color: "var(--text-primary)",
                      marginBottom: "12px",
                      borderBottom: "1px solid var(--border-color)",
                      paddingBottom: "6px"
                    }}
                  >
                    Détail des activités
                  </h4>
                  <div className="table-responsive" style={{ maxHeight: "200px", overflowY: "auto" }}>
                    <table style={{ width: "100%", fontSize: "0.85rem" }}>
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Activité</th>
                          <th className="text-right">H. Reg</th>
                          <th className="text-right">H. Sup</th>
                          <th className="text-right">Montant</th>
                        </tr>
                      </thead>
                      <tbody>
                        {empStats.contributingActivities.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="text-center" style={{ color: "var(--text-muted)", padding: "16px" }}>
                              Aucune activité facturée dans cette période.
                            </td>
                          </tr>
                        ) : (
                          empStats.contributingActivities.map((act, index) => (
                            <tr key={act.id || index}>
                              <td>{act.date}</td>
                              <td
                                style={{ maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                                title={act.name}
                              >
                                {act.name}
                              </td>
                              <td className="text-right">{act.normalHours.toFixed(1)} h</td>
                              <td className="text-right">{act.overtimeHours.toFixed(1)} h</td>
                              <td className="text-right" style={{ fontWeight: 600 }}>
                                {formatCurrency(act.amount)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
