// Evaluates a single condition of a "tâche programmable" (Configuration > Tâches programmables)
// against an activity. `room`, `technical_service` and `service` conditions match if ANY
// reservation on the activity satisfies them (an activity can book more than one room).
function evaluateTaskCondition(act: any, condition: any): boolean {
  const { field, operator, value } = condition;
  const reservations = act.reservations || [];

  switch (field) {
    case "event_type":
      return operator === "not_equals" ? act.event_type !== value : act.event_type === value;
    case "client_type":
      return operator === "not_equals" ? act.client_type !== value : act.client_type === value;
    case "department":
      return operator === "not_equals" ? act.department !== value : act.department === value;
    case "attendees_count": {
      const count = act.attendees_count || 0;
      const num = typeof value === "number" ? value : parseFloat(value);
      if (operator === "gte") return count >= num;
      if (operator === "lte") return count <= num;
      return count === num;
    }
    case "room": {
      const matches = reservations.some((r: any) => r.room_name === value);
      return operator === "not_equals" ? !matches : matches;
    }
    case "technical_service": {
      const matches = reservations.some((r: any) => (r.technical_services || []).includes(value));
      return operator === "not_equals" ? !matches : matches;
    }
    case "service": {
      const matches = reservations.some((r: any) => (r.services || []).some((s: any) => s.service_id === value));
      return operator === "not_equals" ? !matches : matches;
    }
    default:
      return false;
  }
}

// Evaluates a whole "tâche programmable" against an activity: conditions combine within each
// group per that group's `logic` (AND/OR), and groups combine with each other per `groups_logic`.
// A task with no groups (or a group with no conditions) never matches — an empty condition
// builder shouldn't silently behave like "always add this task".
export function activityMatchesTask(act: any, task: any): boolean {
  const groups = task.groups || [];
  if (groups.length === 0) return false;

  const groupResults = groups.map((group: any) => {
    const conditions = group.conditions || [];
    if (conditions.length === 0) return false;
    return group.logic === "OR"
      ? conditions.some((c: any) => evaluateTaskCondition(act, c))
      : conditions.every((c: any) => evaluateTaskCondition(act, c));
  });

  return task.groups_logic === "OR" ? groupResults.some(Boolean) : groupResults.every(Boolean);
}
