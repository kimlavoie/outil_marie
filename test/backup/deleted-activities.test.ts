import test from "node:test";
import assert from "node:assert/strict";
import "../indexeddb-mock.ts";
import { dom } from "../dom-mock.ts";
import {
  openDeletedActivitiesModal,
  closeDeletedActivitiesModal
} from "../../src/services/backup/reminder.ts";
import { setAppState } from "../../src/state/state.ts";

test.after(() => dom.window.close());

test("openDeletedActivitiesModal dynamically creates modal and displays deleted activities", () => {
  document.body.innerHTML = "";

  setAppState({
    settings: {
      theme: "dark",
      rooms: [],
      departments: [],
      accounts: [],
      last_backup_date: "",
      backup_reminder_days: 7,
      salaries: [],
      services: [],
      global_tasks: [],
      schedulable_tasks: [],
      tax_rates: { tps: 0.05, tvq: 0.09975 }
    },
    activities: [
      { id: "act-del-1", name: "Activité Supprimée 1", deleted: true },
      { id: "act-active-1", name: "Activité Active 1", deleted: false }
    ] as any,
    favorites: [],
    selected_year: "",
    selected_quarters: [1, 2, 3, 4]
  });

  openDeletedActivitiesModal();

  const modal = document.getElementById("deleted-activities-modal");
  const backdrop = document.getElementById("modal-backdrop");
  assert.ok(modal, "Modal element should exist in DOM");
  assert.ok(backdrop, "Backdrop element should exist in DOM");
  assert.equal(modal?.classList.contains("active"), true, "Modal should have active class");
  assert.equal(backdrop?.classList.contains("active"), true, "Backdrop should have active class");

  const list = document.getElementById("deleted-activities-modal-list");
  assert.ok(list, "List element should exist in DOM");
  assert.match(list?.textContent || "", /Activité Supprimée 1/);

  closeDeletedActivitiesModal();
  assert.equal(modal?.classList.contains("active"), false, "Modal should lose active class on close");
  assert.equal(backdrop?.classList.contains("active"), false, "Backdrop should lose active class on close");
});
