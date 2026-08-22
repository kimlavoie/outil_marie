/**
 * backup/diff.ts - Computing structural & field-level differences between an uploaded
 * JSON backup file and the active application state (appState).
 */
import type { AppState } from "../../state/store.ts";
import type { Activity } from "../../types/activity.ts";

export interface FieldDiff {
  field: string;
  backupValue: string;
  currentValue: string;
}

export interface ActivityDiff {
  id: string;
  name: string;
  backupActivity?: Activity;
  currentActivity?: Activity;
  status: "added" | "modified" | "unchanged" | "app_only";
  changes: string[];
  fieldDiffs: FieldDiff[];
}

export interface ConfigCategoryDiff {
  key: string;
  label: string;
  isDifferent: boolean;
  currentCount: number;
  backupCount: number;
  details?: string;
  changesList: string[];
}

export interface BackupDiffResult {
  activities: {
    added: ActivityDiff[];
    modified: ActivityDiff[];
    unchanged: ActivityDiff[];
    appOnly: ActivityDiff[];
    all: ActivityDiff[];
    summary: {
      addedCount: number;
      modifiedCount: number;
      unchangedCount: number;
      appOnlyCount: number;
      totalBackup: number;
      totalCurrent: number;
    };
  };
  configs: {
    categories: Record<string, ConfigCategoryDiff>;
    modifiedCount: number;
    totalCategories: number;
  };
}

/**
 * Deep normalization helper to detect meaningful changes in complex nested structures
 * (reservations, distributions, staff, services) without failing on minor key ordering.
 */
function normalizeForComparison(obj: any): string {
  if (obj === null || obj === undefined) return "";
  if (typeof obj !== "object") return String(obj);
  
  if (Array.isArray(obj)) {
    return JSON.stringify(obj.map(item => normalizeForComparison(item)));
  }

  const sortedKeys = Object.keys(obj).sort();
  const sortedObj: Record<string, any> = {};
  for (const k of sortedKeys) {
    if (obj[k] !== undefined && obj[k] !== null && obj[k] !== "") {
      sortedObj[k] = obj[k];
    }
  }
  return JSON.stringify(sortedObj);
}

/**
 * Compare two activity objects and return a list of human-readable field change labels in French.
 */
export function detectActivityChanges(backupAct: Activity, currentAct: Activity): string[] {
  const changes: string[] = [];

  if ((backupAct.name || "").trim() !== (currentAct.name || "").trim()) {
    changes.push("Nom");
  }
  if ((backupAct.state || "brouillon") !== (currentAct.state || "brouillon")) {
    changes.push("Statut");
  }
  if ((backupAct.date_start || "") !== (currentAct.date_start || "") || (backupAct.date_end || "") !== (currentAct.date_end || "")) {
    changes.push("Dates");
  }
  if (Boolean(backupAct.deleted) !== Boolean(currentAct.deleted)) {
    changes.push(backupAct.deleted ? "Marqué supprimé dans le backup" : "Restaure de la corbeille");
  }
  if (normalizeForComparison(backupAct.reservations) !== normalizeForComparison(currentAct.reservations)) {
    changes.push("Réservations / Créneaux");
  }
  if (normalizeForComparison(backupAct.distributions) !== normalizeForComparison(currentAct.distributions)) {
    changes.push("Ventilation financière");
  }
  if (normalizeForComparison(backupAct.bar_revenue_lines) !== normalizeForComparison(currentAct.bar_revenue_lines)) {
    changes.push("Recettes de bar");
  }
  if (
    (backupAct.responsable || "") !== (currentAct.responsable || "") ||
    (backupAct.responsable_first_name || "") !== (currentAct.responsable_first_name || "") ||
    (backupAct.responsable_last_name || "") !== (currentAct.responsable_last_name || "") ||
    (backupAct.responsable_address || "") !== (currentAct.responsable_address || "") ||
    (backupAct.responsable_city || "") !== (currentAct.responsable_city || "") ||
    (backupAct.responsable_province || "") !== (currentAct.responsable_province || "") ||
    (backupAct.responsable_postal_code || "") !== (currentAct.responsable_postal_code || "")
  ) {
    changes.push("Responsable facturation");
  }
  if ((backupAct.notes || "").trim() !== (currentAct.notes || "").trim()) {
    changes.push("Notes / Détails");
  }

  // Fallback if generic differences exist in unlisted fields
  if (changes.length === 0 && normalizeForComparison(backupAct) !== normalizeForComparison(currentAct)) {
    changes.push("Détails secondaires");
  }

  return changes;
}

/**
 * Build explicit side-by-side field diffs between backup activity and current activity.
 */
export function buildActivityFieldDiffs(backupAct: Activity, currentAct: Activity): FieldDiff[] {
  const diffs: FieldDiff[] = [];

  const bName = (backupAct.name || "").trim();
  const cName = (currentAct.name || "").trim();
  if (bName !== cName) {
    diffs.push({ field: "Nom", backupValue: bName || "(vide)", currentValue: cName || "(vide)" });
  }

  const bState = backupAct.state || "brouillon";
  const cState = currentAct.state || "brouillon";
  if (bState !== cState) {
    diffs.push({ field: "Statut", backupValue: bState, currentValue: cState });
  }

  const bDateStart = backupAct.date_start || "";
  const cDateStart = currentAct.date_start || "";
  const bDateEnd = backupAct.date_end || "";
  const cDateEnd = currentAct.date_end || "";
  if (bDateStart !== cDateStart || bDateEnd !== cDateEnd) {
    diffs.push({
      field: "Dates",
      backupValue: `${bDateStart || "?"} au ${bDateEnd || "?"}`,
      currentValue: `${cDateStart || "?"} au ${cDateEnd || "?"}`
    });
  }

  if (Boolean(backupAct.deleted) !== Boolean(currentAct.deleted)) {
    diffs.push({
      field: "Corbeille",
      backupValue: backupAct.deleted ? "Supprimée" : "Active",
      currentValue: currentAct.deleted ? "Supprimée" : "Active"
    });
  }

  if (normalizeForComparison(backupAct.reservations) !== normalizeForComparison(currentAct.reservations)) {
    const bResCount = Array.isArray(backupAct.reservations) ? backupAct.reservations.length : 0;
    const cResCount = Array.isArray(currentAct.reservations) ? currentAct.reservations.length : 0;
    diffs.push({
      field: "Réservations",
      backupValue: `${bResCount} réservation(s)`,
      currentValue: `${cResCount} réservation(s)`
    });
  }

  if (normalizeForComparison(backupAct.distributions) !== normalizeForComparison(currentAct.distributions)) {
    const bDistCount = Array.isArray(backupAct.distributions) ? backupAct.distributions.length : 0;
    const cDistCount = Array.isArray(currentAct.distributions) ? currentAct.distributions.length : 0;
    diffs.push({
      field: "Ventilation financière",
      backupValue: `${bDistCount} compte(s)`,
      currentValue: `${cDistCount} compte(s)`
    });
  }

  if (normalizeForComparison(backupAct.bar_revenue_lines) !== normalizeForComparison(currentAct.bar_revenue_lines)) {
    const bBarCount = Array.isArray(backupAct.bar_revenue_lines) ? backupAct.bar_revenue_lines.length : 0;
    const cBarCount = Array.isArray(currentAct.bar_revenue_lines) ? currentAct.bar_revenue_lines.length : 0;
    diffs.push({
      field: "Recettes de bar",
      backupValue: `${bBarCount} ligne(s)`,
      currentValue: `${cBarCount} ligne(s)`
    });
  }

  const bRespName = [backupAct.responsable_first_name, backupAct.responsable_last_name].filter(Boolean).join(" ") || backupAct.responsable;
  const cRespName =
    [currentAct.responsable_first_name, currentAct.responsable_last_name].filter(Boolean).join(" ") || currentAct.responsable;
  const bRespAddress = [backupAct.responsable_address, backupAct.responsable_city].filter(Boolean).join(", ");
  const cRespAddress = [currentAct.responsable_address, currentAct.responsable_city].filter(Boolean).join(", ");
  if ((bRespName || "") !== (cRespName || "") || bRespAddress !== cRespAddress) {
    diffs.push({
      field: "Responsable facturation",
      backupValue: bRespName || "(aucun)",
      currentValue: cRespName || "(aucun)"
    });
  }

  if ((backupAct.notes || "").trim() !== (currentAct.notes || "").trim()) {
    diffs.push({
      field: "Notes",
      backupValue: (backupAct.notes || "").trim() || "(vide)",
      currentValue: (currentAct.notes || "").trim() || "(vide)"
    });
  }

  return diffs;
}

/**
 * Detailed item-by-item comparison for array-based configuration entities.
 */
function compareConfigArrayItems(
  backupArr: any[],
  currentArr: any[],
  idKey: string,
  nameKey: string
): string[] {
  const bArr = Array.isArray(backupArr) ? backupArr : [];
  const cArr = Array.isArray(currentArr) ? currentArr : [];
  const changes: string[] = [];

  const currentMap = new Map<string, any>();
  cArr.forEach(item => {
    const key = String(item[idKey] || item[nameKey] || "");
    if (key) currentMap.set(key, item);
  });

  const backupMap = new Map<string, any>();
  bArr.forEach(item => {
    const key = String(item[idKey] || item[nameKey] || "");
    if (key) backupMap.set(key, item);
  });

  // Check added or modified in backup
  bArr.forEach(item => {
    const key = String(item[idKey] || item[nameKey] || "");
    const name = item[nameKey] || item[idKey] || "Élément";
    if (!key || !currentMap.has(key)) {
      changes.push(`🟢 Nouveau dans le fichier : "${name}"`);
    } else {
      const currentItem = currentMap.get(key);
      if (normalizeForComparison(item) !== normalizeForComparison(currentItem)) {
        changes.push(`🟡 Modifié : "${name}"`);
      }
    }
  });

  // Check present in current app but missing in backup
  cArr.forEach(item => {
    const key = String(item[idKey] || item[nameKey] || "");
    const name = item[nameKey] || item[idKey] || "Élément";
    if (key && !backupMap.has(key)) {
      changes.push(`🔴 Dans l'app uniquement (non dans le fichier) : "${name}"`);
    }
  });

  return changes;
}

/**
 * Compare a parsed JSON backup object with current app state to generate a full diff summary.
 */
export function computeBackupDiff(parsedBackup: any, currentAppState: AppState): BackupDiffResult {
  const backupActivities: Activity[] = Array.isArray(parsedBackup?.activities) ? parsedBackup.activities : [];
  const currentActivities: Activity[] = Array.isArray(currentAppState?.activities) ? currentAppState.activities : [];
  const backupSettings = parsedBackup?.settings || {};
  const currentSettings = currentAppState?.settings || {};

  // 1. Compare activities
  const currentMap = new Map<string, Activity>();
  for (const act of currentActivities) {
    if (act && act.id) {
      currentMap.set(act.id, act);
    }
  }

  const backupMap = new Map<string, Activity>();
  for (const act of backupActivities) {
    if (act && act.id) {
      backupMap.set(act.id, act);
    }
  }

  const added: ActivityDiff[] = [];
  const modified: ActivityDiff[] = [];
  const unchanged: ActivityDiff[] = [];
  const allBackupDiffs: ActivityDiff[] = [];

  for (const backupAct of backupActivities) {
    if (!backupAct || !backupAct.id) continue;
    const currentAct = currentMap.get(backupAct.id);

    if (!currentAct) {
      const diffItem: ActivityDiff = {
        id: backupAct.id,
        name: backupAct.name || "Sans nom",
        backupActivity: backupAct,
        status: "added",
        changes: ["Nouveau dans le fichier"],
        fieldDiffs: []
      };
      added.push(diffItem);
      allBackupDiffs.push(diffItem);
    } else {
      const changes = detectActivityChanges(backupAct, currentAct);
      const fieldDiffs = buildActivityFieldDiffs(backupAct, currentAct);
      if (changes.length > 0) {
        const diffItem: ActivityDiff = {
          id: backupAct.id,
          name: backupAct.name || currentAct.name || "Sans nom",
          backupActivity: backupAct,
          currentActivity: currentAct,
          status: "modified",
          changes,
          fieldDiffs
        };
        modified.push(diffItem);
        allBackupDiffs.push(diffItem);
      } else {
        const diffItem: ActivityDiff = {
          id: backupAct.id,
          name: backupAct.name || "Sans nom",
          backupActivity: backupAct,
          currentActivity: currentAct,
          status: "unchanged",
          changes: [],
          fieldDiffs: []
        };
        unchanged.push(diffItem);
        allBackupDiffs.push(diffItem);
      }
    }
  }

  const appOnly: ActivityDiff[] = [];
  for (const currentAct of currentActivities) {
    if (!currentAct || !currentAct.id) continue;
    if (!backupMap.has(currentAct.id)) {
      appOnly.push({
        id: currentAct.id,
        name: currentAct.name || "Sans nom",
        currentActivity: currentAct,
        status: "app_only",
        changes: ["Présent dans l'application, absent de la sauvegarde"],
        fieldDiffs: []
      });
    }
  }

  // 2. Compare config categories
  const compareRooms = (): ConfigCategoryDiff => {
    const b = backupSettings.rooms || [];
    const c = currentSettings.rooms || [];
    const changesList = compareConfigArrayItems(b, c, "id", "name");
    return {
      key: "rooms",
      label: "Salles et Tarifs",
      isDifferent: changesList.length > 0,
      currentCount: c.length,
      backupCount: b.length,
      changesList
    };
  };

  const compareSalaries = (): ConfigCategoryDiff => {
    const b = backupSettings.salaries || [];
    const c = currentSettings.salaries || [];
    const changesList = compareConfigArrayItems(b, c, "id", "title");
    return {
      key: "salaries",
      label: "Salaires et main d'œuvre",
      isDifferent: changesList.length > 0,
      currentCount: c.length,
      backupCount: b.length,
      changesList
    };
  };

  const compareServices = (): ConfigCategoryDiff => {
    const b = backupSettings.services || [];
    const c = currentSettings.services || [];
    const changesList = compareConfigArrayItems(b, c, "id", "title");
    return {
      key: "services",
      label: "Équipements et Services",
      isDifferent: changesList.length > 0,
      currentCount: c.length,
      backupCount: b.length,
      changesList
    };
  };

  const compareAccounts = (): ConfigCategoryDiff => {
    const b = backupSettings.accounts || [];
    const c = currentSettings.accounts || [];
    const changesList = compareConfigArrayItems(b, c, "code", "name");
    return {
      key: "accounts",
      label: "Comptes de Grand Livre",
      isDifferent: changesList.length > 0,
      currentCount: c.length,
      backupCount: b.length,
      changesList
    };
  };

  const compareDepartments = (): ConfigCategoryDiff => {
    const b: string[] = Array.isArray(backupSettings.departments) ? backupSettings.departments : [];
    const c: string[] = Array.isArray(currentSettings.departments) ? currentSettings.departments : [];
    const changesList: string[] = [];

    b.forEach(dep => {
      if (!c.includes(dep)) changesList.push(`🟢 Nouveau département : "${dep}"`);
    });
    c.forEach(dep => {
      if (!b.includes(dep)) changesList.push(`🔴 Département absent du fichier : "${dep}"`);
    });

    return {
      key: "departments",
      label: "Départements",
      isDifferent: changesList.length > 0,
      currentCount: c.length,
      backupCount: b.length,
      changesList
    };
  };

  const compareTasks = (): ConfigCategoryDiff => {
    const bGlobal = backupSettings.global_tasks || [];
    const cGlobal = currentSettings.global_tasks || [];
    const bSched = backupSettings.schedulable_tasks || [];
    const cSched = currentSettings.schedulable_tasks || [];

    const changesList = [
      ...compareConfigArrayItems(bGlobal, cGlobal, "id", "name"),
      ...compareConfigArrayItems(bSched, cSched, "id", "name")
    ];

    return {
      key: "tasks",
      label: "Tâches de planification",
      isDifferent: changesList.length > 0,
      currentCount: cGlobal.length + cSched.length,
      backupCount: bGlobal.length + bSched.length,
      changesList
    };
  };

  const compareTaxes = (): ConfigCategoryDiff => {
    const bTaxes = backupSettings.tax_rates || {};
    const cTaxes = currentSettings.tax_rates || {};
    const changesList: string[] = [];

    if (bTaxes.tps !== cTaxes.tps) {
      changesList.push(`🟡 Taux TPS : fichier (${bTaxes.tps ?? "0"}) vs actuel (${cTaxes.tps ?? "0"})`);
    }
    if (bTaxes.tvq !== cTaxes.tvq) {
      changesList.push(`🟡 Taux TVQ : fichier (${bTaxes.tvq ?? "0"}) vs actuel (${cTaxes.tvq ?? "0"})`);
    }

    return {
      key: "taxes",
      label: "Taxes",
      isDifferent: changesList.length > 0,
      currentCount: Object.keys(cTaxes).length,
      backupCount: Object.keys(bTaxes).length,
      changesList
    };
  };

  const comparePreferences = (): ConfigCategoryDiff => {
    const bTheme = backupSettings.theme || "dark";
    const cTheme = currentSettings.theme || "dark";
    const bDays = Number(backupSettings.backup_reminder_days || 7);
    const cDays = Number(currentSettings.backup_reminder_days || 7);

    const changesList: string[] = [];
    if (bTheme !== cTheme) {
      changesList.push(`🟡 Thème : fichier "${bTheme}" vs actuel "${cTheme}"`);
    }
    if (bDays !== cDays) {
      changesList.push(`🟡 Rappel de sauvegarde : fichier ${bDays} jours vs actuel ${cDays} jours`);
    }

    return {
      key: "preferences",
      label: "Préférences",
      isDifferent: changesList.length > 0,
      currentCount: 1,
      backupCount: 1,
      changesList
    };
  };

  const categories: Record<string, ConfigCategoryDiff> = {
    rooms: compareRooms(),
    salaries: compareSalaries(),
    services: compareServices(),
    accounts: compareAccounts(),
    departments: compareDepartments(),
    tasks: compareTasks(),
    taxes: compareTaxes(),
    preferences: comparePreferences()
  };

  let modifiedConfigCount = 0;
  for (const catKey of Object.keys(categories)) {
    if (categories[catKey].isDifferent) {
      modifiedConfigCount++;
    }
  }

  return {
    activities: {
      added,
      modified,
      unchanged,
      appOnly,
      all: allBackupDiffs,
      summary: {
        addedCount: added.length,
        modifiedCount: modified.length,
        unchangedCount: unchanged.length,
        appOnlyCount: appOnly.length,
        totalBackup: backupActivities.length,
        totalCurrent: currentActivities.length
      }
    },
    configs: {
      categories,
      modifiedCount: modifiedConfigCount,
      totalCategories: Object.keys(categories).length
    }
  };
}
