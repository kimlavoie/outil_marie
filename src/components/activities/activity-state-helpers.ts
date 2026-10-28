/**
 * activity-state-helpers.ts - Activity state labels/badges and planning-progress/hostess-count
 * derivations shared by ActivitiesView.tsx's table and ActivityRow.tsx.
 */
import type { Activity } from "../../types/activity.ts";
import { HOSTESS_SALARY_ID } from "../../activities-dom/reservations/subrows.ts";

export const ACTIVITY_STATES = [
  { value: "brouillon", label: "Brouillon" },
  { value: "soumise", label: "Soumise au client" },
  { value: "approuvee", label: "Approuvée" },
  { value: "planifiee", label: "Planifiée" },
  { value: "facturee", label: "Facturée" },
  { value: "terminee", label: "Terminée" }
];

export function getActivityStateLabel(state: string) {
  return (ACTIVITY_STATES.find(s => s.value === state) || ACTIVITY_STATES[0]).label;
}

export function getActivityStateBadgeClass(state: string) {
  switch (state) {
    case "terminee":
      return "badge-success";
    case "facturee":
    case "planifiee":
      return "badge-info";
    case "approuvee":
    case "soumise":
      return "badge-warning";
    default:
      return "badge-danger";
  }
}

export function getPlanningProgress(act: Activity) {
  const tasks = act.planning_tasks || [];
  const done = tasks.filter((t: any) => t.done).length;
  const total = tasks.length;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  return { done, total, percent };
}

// Total hostesses for the "Hôtesse" column/sort: the bar service's manual hostess_count field,
// plus one per "Personnel requis" staff row using the "Hôte" salary (those are added separately,
// e.g. when hostesses are needed without a hostess bar service).
export function getTotalHostesses(act: Activity) {
  return (act.reservations || []).reduce(
    (sum: number, r: any) =>
      sum +
      (r.bar_service?.hostess_count || 0) +
      (r.staff || []).filter((s: any) => s.salary_id === HOSTESS_SALARY_ID).length,
    0
  );
}
