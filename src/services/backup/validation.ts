/**
 * backup/validation.ts - Deep schema validation for a restored JSON backup, so a corrupted or
 * hand-edited file can't slip malformed data past validation and only fail later as a silent
 * rendering or billing crash.
 */
import { isPlainObject, isNonEmptyString, isFiniteNumber, validateRules } from "../../utils/validation.ts";

// True if `arr` isn't an array (an earlier rule already flags that) or every item satisfies
// `predicate` — lets the item-shape rules below stay no-ops instead of throwing when the
// collection itself is the wrong type (e.g. a string where an array was expected).
function arrayItemsMatch(arr: any, predicate: (item: any) => boolean): boolean {
  return !Array.isArray(arr) || arr.every(predicate);
}

// Deep-shape checks for a single reservation record within an activity. Catches the case of a
// hand-edited or corrupted backup where a reservation's slots/fees/tariff hold the wrong type
// (e.g. a string instead of a number) that would otherwise only surface as a silent NaN/crash
// later, in rendering or billing calculations.
function validateReservationShape(r: any): boolean {
  if (!isPlainObject(r)) return false;
  if (r.room_name !== undefined && typeof r.room_name !== "string") return false;
  if (r.tariff_amount !== undefined && !isFiniteNumber(r.tariff_amount)) return false;
  if (r.slots !== undefined && !Array.isArray(r.slots)) return false;
  if (
    !arrayItemsMatch(
      r.slots,
      (s: any) => isPlainObject(s) && typeof s.date === "string" && typeof s.start_time === "string" && typeof s.end_time === "string"
    )
  ) {
    return false;
  }
  if (r.fees !== undefined && !Array.isArray(r.fees)) return false;
  if (!arrayItemsMatch(r.fees, (f: any) => isPlainObject(f) && typeof f.description === "string" && isFiniteNumber(f.amount))) {
    return false;
  }
  if (r.staff !== undefined && !Array.isArray(r.staff)) return false;
  if (!arrayItemsMatch(r.staff, (s: any) => isPlainObject(s))) return false;
  if (r.services !== undefined && !Array.isArray(r.services)) return false;
  if (!arrayItemsMatch(r.services, (s: any) => isPlainObject(s))) return false;
  return true;
}

// A distribution ties a billed amount to a GL account code; both must have the right type or
// the reconciliation/export math (which sums `amount`) silently produces NaN/garbage totals.
function validateDistributionShape(d: any): boolean {
  return isPlainObject(d) && isNonEmptyString(d.account_code) && isFiniteNumber(d.amount);
}

// Inspects one activity's internal fields beyond just its `id`, so a corrupted or hand-edited
// backup can't slip malformed reservations/distributions/dates past validation and only fail
// later as a silent rendering or billing crash.
function validateActivityDeepShape(a: any): boolean {
  if (!isPlainObject(a)) return false;
  if (a.name !== undefined && typeof a.name !== "string") return false;
  if (a.date_start !== undefined && typeof a.date_start !== "string") return false;
  if (a.date_end !== undefined && typeof a.date_end !== "string") return false;
  if (a.attendees_count !== undefined && !isFiniteNumber(a.attendees_count)) return false;
  if (a.reservations !== undefined && !Array.isArray(a.reservations)) return false;
  if (!arrayItemsMatch(a.reservations, validateReservationShape)) return false;
  if (a.distributions !== undefined && !Array.isArray(a.distributions)) return false;
  if (!arrayItemsMatch(a.distributions, validateDistributionShape)) return false;
  return true;
}

function validateBackupSchema(parsed: any): { valid: boolean; error?: string } {
  const settings = isPlainObject(parsed) ? parsed.settings : undefined;
  const activities = isPlainObject(parsed) ? parsed.activities : undefined;
  const activityIds = Array.isArray(activities)
    ? activities.filter((a: any) => isPlainObject(a) && isNonEmptyString(a.id)).map((a: any) => a.id)
    : [];

  return validateRules([
    [isPlainObject(parsed), "Le contenu du fichier n'est pas un objet JSON valide."],
    [isPlainObject(parsed) && Array.isArray(activities), "Le fichier de sauvegarde doit contenir une liste d'activités ('activities')."],
    [
      arrayItemsMatch(activities, (a: any) => isPlainObject(a) && isNonEmptyString(a.id)),
      "Chaque activité de la liste ('activities') doit être un objet avec un identifiant ('id') non vide."
    ],
    [
      new Set(activityIds).size === activityIds.length,
      "Le fichier contient des activités avec des identifiants ('id') en double."
    ],
    [
      arrayItemsMatch(activities, validateActivityDeepShape),
      "Une ou plusieurs activités contiennent des données invalides (réservations, distributions ou dates dont le type est incorrect)."
    ],
    [!settings || isPlainObject(settings), "La section de configuration ('settings') est invalide."],
    [!settings?.rooms || Array.isArray(settings.rooms), "La configuration des salles ('settings.rooms') doit être une liste."],
    [
      arrayItemsMatch(settings?.rooms, (r: any) => isPlainObject(r) && isNonEmptyString(r.name)),
      "Chaque salle ('settings.rooms') doit être un objet avec un nom ('name') non vide."
    ],
    [!settings?.salaries || Array.isArray(settings.salaries), "La configuration des salaires ('settings.salaries') doit être une liste."],
    [
      arrayItemsMatch(settings?.salaries, (s: any) => isPlainObject(s) && isNonEmptyString(s.id)),
      "Chaque emploi ('settings.salaries') doit être un objet avec un identifiant ('id') non vide."
    ],
    [!settings?.services || Array.isArray(settings.services), "La configuration des services ('settings.services') doit être une liste."],
    [
      arrayItemsMatch(settings?.services, (s: any) => isPlainObject(s) && isNonEmptyString(s.id)),
      "Chaque équipement ('settings.services') doit être un objet avec un identifiant ('id') non vide."
    ],
    [!settings?.accounts || Array.isArray(settings.accounts), "La configuration des comptes ('settings.accounts') doit être une liste."],
    [
      arrayItemsMatch(settings?.accounts, (a: any) => isPlainObject(a) && isNonEmptyString(a.code)),
      "Chaque compte ('settings.accounts') doit être un objet avec un code ('code') non vide."
    ],
    [
      !settings?.departments || Array.isArray(settings.departments),
      "La configuration des départements ('settings.departments') doit être une liste."
    ],
    [
      arrayItemsMatch(settings?.departments, (d: any) => isNonEmptyString(d)),
      "Chaque département ('settings.departments') doit être une chaîne de caractères non vide."
    ],
    [
      !settings?.global_tasks || Array.isArray(settings.global_tasks),
      "La configuration des tâches globales ('settings.global_tasks') doit être une liste."
    ],
    [
      arrayItemsMatch(settings?.global_tasks, (t: any) => isPlainObject(t) && isNonEmptyString(t.id)),
      "Chaque tâche globale ('settings.global_tasks') doit être un objet avec un identifiant ('id') non vide."
    ],
    [
      !settings?.schedulable_tasks || Array.isArray(settings.schedulable_tasks),
      "La configuration des tâches programmables ('settings.schedulable_tasks') doit être une liste."
    ],
    [
      arrayItemsMatch(settings?.schedulable_tasks, (t: any) => isPlainObject(t) && isNonEmptyString(t.id)),
      "Chaque tâche programmable ('settings.schedulable_tasks') doit être un objet avec un identifiant ('id') non vide."
    ],
    [!parsed?.favorites || Array.isArray(parsed.favorites), "La section des favoris ('favorites') doit être une liste."],
    [
      !parsed?.selected_quarters || Array.isArray(parsed.selected_quarters),
      "La section des trimestres sélectionnés ('selected_quarters') doit être une liste."
    ]
  ]);
}

export { validateBackupSchema };
