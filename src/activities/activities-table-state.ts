import type { Activity } from "../types/activity.ts";

export interface CalendarReturn {
  refDate: string;
  viewMode: string;
}

export interface ActivitiesUIState {
  sortKey: string;
  sortOrder: "asc" | "desc";
  page: number;
  pageSize: number;
  draftActivityId: string | null;
  openedActivitySnapshot: Activity | null;
  selectedIds: Set<string>;
  undoStack: Activity[];
  redoStack: Activity[];
  calendarReturn: CalendarReturn | null;
}

export const activitiesState: ActivitiesUIState = {
  sortKey: "id",
  sortOrder: "asc",
  page: 1,
  pageSize: 10,
  draftActivityId: null,
  openedActivitySnapshot: null,
  selectedIds: new Set<string>(),
  undoStack: [],
  redoStack: [],
  calendarReturn: null
};

export const ACTIVITY_UNDO_HISTORY_LIMIT = 50;
