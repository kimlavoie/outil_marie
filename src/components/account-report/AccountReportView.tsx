import React, { useState, useMemo } from "react";
import { useAppState, getFiscalYear, getQuarterNumber, parseLocalDateStr } from "../../state/state.ts";
import { formatCurrency } from "../../utils/utils.ts";
import { openActivityDrawer } from "../../activities/financials.ts";

interface Entry {
  activity: any;
  amount: number;
  reference?: string;
  details?: string;
}

interface AccountReportViewProps {
  onSelectView: (view: string) => void;
}

export const AccountReportView: React.FC<AccountReportViewProps> = ({ onSelectView }) => {
  const [selectedAccountFilter, setSelectedAccountFilter] = useState("");
  const [sortKey, setSortKey] = useState<string>("id");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [pages, setPages] = useState<Record<string, number>>({});
  const pageSize = 10;

  const activities = useAppState(s => s.activities);
  const accounts = useAppState(s => s.settings.accounts);
  const selectedYear = useAppState(s => s.selected_year);
  const selectedQuarters = useAppState(s => s.selected_quarters);

  // Group distributions & bar revenues by account code
  const accountEntries = useMemo(() => {
    const entriesMap: Record<string, Entry[]> = {};

    accounts.forEach(acc => {
      entriesMap[acc.code] = [];
    });

    activities.forEach(act => {
      if (act.deleted || !act.name.trim()) return;

      const actYear = getFiscalYear(act.date_start);
      const actQuarter = getQuarterNumber(act.date_start);
      if (actYear !== selectedYear || actQuarter === null || !selectedQuarters.includes(actQuarter)) {
        return;
      }

      (act.distributions || []).forEach((d: any) => {
        if (!d.account_code) return;
        const entry: Entry = {
          activity: act,
          amount: d.amount,
          reference: d.reference,
          details: d.details
        };
        if (entriesMap[d.account_code]) {
          entriesMap[d.account_code].push(entry);
        } else {
          entriesMap[d.account_code] = [entry];
        }
      });

      (act.bar_revenue_lines || []).forEach((b: any) => {
        if (!b.account_code || !(b.amount > 0)) return;
        const entry: Entry = {
          activity: act,
          amount: b.amount,
          reference: b.receipt_number,
          details: `Revenus du bar${b.payment_method ? ` - ${b.payment_method}` : ""}`
        };
        if (entriesMap[b.account_code]) {
          entriesMap[b.account_code].push(entry);
        } else {
          entriesMap[b.account_code] = [entry];
        }
      });
    });

    return entriesMap;
  }, [activities, accounts, selectedYear, selectedQuarters]);

  const configuredCodes = useMemo(() => new Set(accounts.map(a => a.code)), [accounts]);

  const orphanAccounts = useMemo(() => {
    return Object.keys(accountEntries)
      .filter(code => code && !configuredCodes.has(code) && accountEntries[code].length > 0)
      .map(code => ({ code, description: "Compte inconnu (compte supprimé ou introuvable)" }));
  }, [accountEntries, configuredCodes]);

  const accountsToRender = useMemo(() => {
    let list = [...accounts, ...orphanAccounts];
    if (selectedAccountFilter) {
      list = list.filter(a => a.code === selectedAccountFilter);
    } else {
      list = list.filter(acc => accountEntries[acc.code] && accountEntries[acc.code].length > 0);
    }
    return list;
  }, [accounts, orphanAccounts, selectedAccountFilter, accountEntries]);

  const handleSortClick = (key: string) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortOrder("asc");
    }
  };

  const handlePageChange = (accountCode: string, newPage: number) => {
    setPages(prev => ({ ...prev, [accountCode]: newPage }));
  };

  const handleOpenActivity = (id: string) => {
    onSelectView("activities");
    openActivityDrawer(id);
  };

  return (
    <div className="view-content" style={{ padding: "20px 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <div>
          <h2 style={{ margin: 0 }}>Grand Livre local</h2>
          <p style={{ margin: "4px 0 0", color: "var(--text-muted)", fontSize: "0.88rem" }}>
            Ventilation des montants par poste comptable pour la période sélectionnée.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <label htmlFor="filter-report-account" style={{ fontSize: "0.85rem", fontWeight: 600 }}>
            Filtrer par compte :
          </label>
          <select
            id="filter-report-account"
            className="form-control"
            value={selectedAccountFilter}
            onChange={e => setSelectedAccountFilter(e.target.value)}
            style={{ minWidth: "220px" }}
          >
            <option value="">Tous les comptes</option>
            {accounts.map(acc => (
              <option key={acc.code} value={acc.code}>
                {acc.code} ({acc.description})
              </option>
            ))}
          </select>
        </div>
      </div>

      {accountsToRender.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "48px",
            color: "var(--text-secondary)",
            backgroundColor: "var(--bg-main)",
            borderRadius: "var(--radius-lg)",
            border: "1px dashed var(--border-color)"
          }}
        >
          <h3>Aucune écriture comptable saisie</h3>
          <p style={{ marginTop: "8px", fontSize: "0.9rem" }}>
            Veuillez saisir des activités et ventiler des montants dans l'onglet <strong>Activités</strong> pour générer les fiches de compte.
          </p>
        </div>
      ) : (
        accountsToRender.map(acc => {
          const rawEntries = accountEntries[acc.code] || [];
          const totalAcc = rawEntries.reduce((sum, e) => sum + e.amount, 0);

          const sortedEntries = [...rawEntries].sort((a, b) => {
            let valA: any = "";
            let valB: any = "";

            switch (sortKey) {
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
              default:
                valA = a.activity.id;
                valB = b.activity.id;
            }

            if (typeof valA === "string" && typeof valB === "string") {
              return sortOrder === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
            } else {
              return sortOrder === "asc" ? valA - valB : valB - valA;
            }
          });

          const currentPage = pages[acc.code] || 1;
          const totalPages = Math.max(1, Math.ceil(sortedEntries.length / pageSize));
          const clampedPage = Math.min(Math.max(1, currentPage), totalPages);
          const startIdx = (clampedPage - 1) * pageSize;
          const pageEntries = sortedEntries.slice(startIdx, startIdx + pageSize);

          return (
            <div
              key={acc.code}
              className="card"
              style={{ marginBottom: "24px", padding: "20px", border: "1px solid var(--border-color)", borderRadius: "var(--radius-md)" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <div>
                  <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: "10px" }}>
                    <span className="badge badge-info font-mono" style={{ fontSize: "1rem" }}>
                      {acc.code}
                    </span>
                    <span>{acc.description}</span>
                  </h3>
                </div>
                <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--primary)" }}>
                  Total : {formatCurrency(totalAcc)}
                </div>
              </div>

              <div className="table-responsive">
                <table className="table">
                  <thead>
                    <tr>
                      <th onClick={() => handleSortClick("id")} style={{ cursor: "pointer" }}>
                        # ID {sortKey === "id" && (sortOrder === "asc" ? "▲" : "▼")}
                      </th>
                      <th onClick={() => handleSortClick("name")} style={{ cursor: "pointer" }}>
                        Activité {sortKey === "name" && (sortOrder === "asc" ? "▲" : "▼")}
                      </th>
                      <th onClick={() => handleSortClick("date_start")} style={{ cursor: "pointer" }}>
                        Dates {sortKey === "date_start" && (sortOrder === "asc" ? "▲" : "▼")}
                      </th>
                      <th onClick={() => handleSortClick("department")} style={{ cursor: "pointer" }}>
                        Département {sortKey === "department" && (sortOrder === "asc" ? "▲" : "▼")}
                      </th>
                      <th onClick={() => handleSortClick("reference")} style={{ cursor: "pointer" }}>
                        Référence / Reçu {sortKey === "reference" && (sortOrder === "asc" ? "▲" : "▼")}
                      </th>
                      <th>Détails</th>
                      <th onClick={() => handleSortClick("amount")} style={{ cursor: "pointer", textAlign: "right" }}>
                        Montant {sortKey === "amount" && (sortOrder === "asc" ? "▲" : "▼")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedEntries.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="text-center" style={{ color: "var(--text-muted)", padding: "24px" }}>
                          Aucune écriture enregistrée pour ce compte.
                        </td>
                      </tr>
                    ) : (
                      pageEntries.map((e, idx) => {
                        const act = e.activity;
                        let datesText = "-";
                        if (act.date_start && act.date_end) {
                          if (act.date_start === act.date_end) {
                            datesText = parseLocalDateStr(act.date_start).toLocaleDateString("fr-CA", { month: "short", day: "numeric" });
                          } else {
                            const start = parseLocalDateStr(act.date_start).toLocaleDateString("fr-CA", { month: "short", day: "numeric" });
                            const end = parseLocalDateStr(act.date_end).toLocaleDateString("fr-CA", { month: "short", day: "numeric" });
                            datesText = `${start} au ${end}`;
                          }
                        }

                        return (
                          <tr key={idx}>
                            <td className="font-mono bold">{act.id}</td>
                            <td>
                              <button
                                type="button"
                                className="btn-link"
                                onClick={() => handleOpenActivity(act.id)}
                                style={{ background: "none", border: "none", color: "var(--primary)", cursor: "pointer", padding: 0, textDecoration: "underline" }}
                              >
                                {act.name}
                              </button>
                            </td>
                            <td>{datesText}</td>
                            <td>{act.department || "-"}</td>
                            <td className="font-mono">{e.reference || "-"}</td>
                            <td style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>{e.details || "-"}</td>
                            <td className="text-right bold">{formatCurrency(e.amount)}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "16px" }}>
                  <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                    Affichage {startIdx + 1} à {Math.min(startIdx + pageSize, sortedEntries.length)} sur {sortedEntries.length} écritures
                  </span>
                  <div style={{ display: "flex", gap: "4px" }}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={clampedPage <= 1}
                      onClick={() => handlePageChange(acc.code, clampedPage - 1)}
                    >
                      Précédent
                    </button>
                    <span style={{ padding: "4px 12px", fontSize: "0.88rem" }}>
                      Page {clampedPage} / {totalPages}
                    </span>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={clampedPage >= totalPages}
                      onClick={() => handlePageChange(acc.code, clampedPage + 1)}
                    >
                      Suivant
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
};
