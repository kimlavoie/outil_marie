/**
 * activity-state.ts - Pure activity lifecycle-state helpers (labels/badges, planning progress,
 * state derivation, the progress-bar HTML snippet): no DOM, no appState. Split out of render.ts
 * so the several modules that only need these small derivations (billing-tab.ts, file-links/,
 * planning-tab.ts, print-sheet.ts, history/version-history.ts) don't have to import the much
 * larger render.ts — which itself still imports from bulk-actions.ts/context-menu.ts, two of
 * those modules' own siblings — just to reach them. render.ts re-exports everything here
 * unchanged, so existing imports from "./render.ts" keep working.
 */

// Activity lifecycle states, in order
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
      return "badge-warning";
    case "soumise":
      return "badge-warning";
    default:
      return "badge-danger";
  }
}

// {done, total, percent} of an activity's planning tasks
export function getPlanningProgress(act: any) {
  const tasks = act.planning_tasks || [];
  const done = tasks.filter((t: any) => t.done).length;
  const total = tasks.length;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  return { done, total, percent };
}

// Recomputes the lifecycle state from whichever stage markers are still established (submission
// sent, contract approved, planning complete, billed, completed) instead of trusting a stored
// value — so unchecking a later marker falls back to the highest earlier one still standing,
// rather than clearing the state outright.
export function deriveActivityState(act: any) {
  const progress = getPlanningProgress(act);
  const established = new Set(["brouillon"]);
  if (act.submission?.sent_at) established.add("soumise");
  if (act.contract?.approved_at) established.add("approuvee");
  if (progress.total > 0 && progress.done === progress.total && (act.submission?.sent_at || act.contract?.approved_at)) {
    established.add("planifiee");
  }
  if (act.billed_at) established.add("facturee");
  if (act.completed_at) established.add("terminee");

  let result = ACTIVITY_STATES[0].value;
  ACTIVITY_STATES.forEach(s => {
    if (established.has(s.value)) result = s.value;
  });
  return result;
}

// Small progress-bar HTML snippet reused in the activities list and the Planification tab
export function buildProgressBarHtml(percent: number) {
  return `
    <div class="progress-bar" title="${percent}%">
      <div class="progress-bar-fill ${percent >= 100 ? "complete" : ""}" style="width: ${percent}%;"></div>
    </div>
  `;
}
