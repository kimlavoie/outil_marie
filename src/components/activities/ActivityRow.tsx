import type React from "react";
import { getActivityReferences, getReservationRoomAbbreviation, formatCurrency, calculateDaysCount } from "../../utils/utils.ts";
import { parseLocalDateStr } from "../../state/date-helpers.ts";
import { reconciliationState } from "../../services/reconciliation.ts";
import { TECHNICAL_DIRECTOR_SALARY_ID } from "../../activities-dom/reservations/subrows.ts";
import type { Activity } from "../../types/activity.ts";
import { getActivityStateLabel, getActivityStateBadgeClass, getPlanningProgress, getTotalHostesses } from "./activity-state-helpers.ts";

/**
 * ActivityRow.tsx - One row of the activities table: date range, COBA/name/salle/bar/hostess/
 * technical-director columns, the reconciliation badge, revenue total and the état/planning-
 * progress cell. Split out of ActivitiesView.tsx, which owns selection/sort/filter state and
 * passes down only what a single row needs to render and react to clicks.
 */
export function ActivityRow({
  act,
  isSelected,
  onOpen,
  onContextMenu,
  onToggleSelect
}: {
  act: Activity;
  isSelected: boolean;
  onOpen: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, id: string) => void;
  onToggleSelect: (e: React.MouseEvent, id: string) => void;
}) {
  const isFilled = act.name.trim() !== "";
  const totalRev = (act.distributions || []).reduce((sum: number, d: any) => sum + d.amount, 0);

  // Date formatting
  let datesText: React.ReactNode = "-";
  if (act.date_start || act.date_end) {
    if (act.date_start && act.date_end) {
      if (act.date_start === act.date_end) {
        datesText = parseLocalDateStr(act.date_start).toLocaleDateString("fr-CA", {
          weekday: "short",
          month: "short",
          day: "numeric"
        });
      } else {
        const daysCount = calculateDaysCount(act.date_start, act.date_end);
        const start = parseLocalDateStr(act.date_start).toLocaleDateString("fr-CA", {
          weekday: "short",
          month: "short",
          day: "numeric"
        });
        const end = parseLocalDateStr(act.date_end).toLocaleDateString("fr-CA", {
          weekday: "short",
          month: "short",
          day: "numeric"
        });
        datesText =
          daysCount > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "2px", lineHeight: "1.2" }}>
              <span>{start}</span>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>au {end}</span>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "2px", lineHeight: "1.2", color: "var(--danger)" }}>
              <span>⚠ {start}</span>
              <span style={{ fontSize: "0.75rem" }}>au {end}</span>
            </div>
          );
      }
    } else if (act.date_start) {
      const start = parseLocalDateStr(act.date_start).toLocaleDateString("fr-CA", {
        weekday: "short",
        month: "short",
        day: "numeric"
      });
      datesText = `À partir du ${start}`;
    } else if (act.date_end) {
      const end = parseLocalDateStr(act.date_end).toLocaleDateString("fr-CA", {
        weekday: "short",
        month: "short",
        day: "numeric"
      });
      datesText = `Jusqu'au ${end}`;
    }
  }

  const hasBarService = (act.reservations || []).some((r: any) => r.bar_service?.active);
  const hasTechnicalDirector = (act.reservations || []).some((r: any) =>
    (r.staff || []).some((s: any) => s.salary_id === TECHNICAL_DIRECTOR_SALARY_ID && (s.count === undefined || s.count > 0 || !!s.date))
  );
  const totalHostesses = getTotalHostesses(act);

  // Reconciliation badge
  const activityReferences = getActivityReferences(act);
  let statusBadge = null;
  if (reconciliationState.ledgerTransactions.length > 0 && isFilled && activityReferences) {
    const related = reconciliationState.results.filter(r => r.activityId === act.id);
    if (related.length > 0) {
      const hasDiff = related.some(r => r.status === "diff");
      const hasUnlogged = related.some(r => r.status === "unlogged");
      const allValid = related.every(r => r.status === "valid");

      if (allValid) {
        statusBadge = <span className="badge badge-success">Rapproché</span>;
      } else if (hasDiff) {
        statusBadge = <span className="badge badge-danger">Écart montant</span>;
      } else if (hasUnlogged) {
        statusBadge = <span className="badge badge-warning">Non dans GL</span>;
      }
    }
  }

  const progress = getPlanningProgress(act);

  return (
    <tr
      className={`activity-row ${isFilled ? "" : "row-empty"} ${isSelected ? "selected" : ""}`}
      onClick={() => onOpen(act.id)}
      onContextMenu={e => {
        e.preventDefault();
        onContextMenu(e, act.id);
      }}
      style={{ cursor: "pointer", opacity: isFilled ? 1 : 0.5, fontStyle: isFilled ? "normal" : "italic" }}
    >
      <td
        onClick={e => onToggleSelect(e, act.id)}
        style={{ textAlign: "center", verticalAlign: "middle", width: "22px", paddingLeft: "8px", paddingRight: "2px" }}
      >
        <label style={{ cursor: "pointer" }}>
          <span className="sr-only">Sélectionner l'activité {act.id}</span>
          <input type="checkbox" className="activity-select-checkbox" checked={isSelected} onChange={() => {}} style={{ cursor: "pointer" }} />
        </label>
      </td>
      <td>{datesText}</td>
      <td className="font-mono">{isFilled && act.coba ? act.coba : "-"}</td>
      <td>
        <span className="bold">{isFilled ? act.name : "Vierge"}</span> {statusBadge}
      </td>
      <td>{isFilled ? (act.reservations || []).map(getReservationRoomAbbreviation).join(", ") : "-"}</td>
      <td>{isFilled ? (hasBarService ? "Oui" : "") : "-"}</td>
      <td>{isFilled ? (totalHostesses > 0 ? totalHostesses : "") : "-"}</td>
      <td>{isFilled ? (hasTechnicalDirector ? "Oui" : "") : "-"}</td>
      <td className="font-mono">{isFilled && activityReferences ? activityReferences : "-"}</td>
      <td className="bold">{isFilled ? formatCurrency(totalRev) : "-"}</td>
      <td>
        {isFilled ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <span className={`badge ${getActivityStateBadgeClass(act.state)}`}>{getActivityStateLabel(act.state)}</span>
            {progress.total > 0 && (
              <>
                <div className="progress-bar" title={`${progress.percent}%`}>
                  <div className={`progress-bar-fill ${progress.percent >= 100 ? "complete" : ""}`} style={{ width: `${progress.percent}%` }} />
                </div>
                <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                  {progress.done}/{progress.total} tâches
                </span>
              </>
            )}
          </div>
        ) : (
          "-"
        )}
      </td>
    </tr>
  );
}
