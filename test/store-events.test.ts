import assert from "node:assert/strict";
import test from "node:test";
import "./dom-mock.ts";
import { appState, setAppState, subscribeAppState, notifyAppStateChange, saveDatabase } from "../src/state/state.ts";

test("subscribeAppState registers listener and unsubscribes cleanly", () => {
  let calledCount = 0;
  const unsubscribe = subscribeAppState(() => {
    calledCount++;
  });

  notifyAppStateChange();
  assert.equal(calledCount, 1);

  notifyAppStateChange();
  assert.equal(calledCount, 2);

  unsubscribe();
  notifyAppStateChange();
  assert.equal(calledCount, 2, "listener should not be called after unsubscribe");
});

test("setAppState triggers notifyAppStateChange subscribers", () => {
  let notified = false;
  const unsubscribe = subscribeAppState(() => {
    notified = true;
  });

  const nextState = { ...appState, selected_year: "2030-2031" };
  setAppState(nextState);

  assert.equal(notified, true);
  assert.equal(appState.selected_year, "2030-2031");
  unsubscribe();
});

test("saveDatabase triggers notifyAppStateChange subscribers on save attempt", async () => {
  let notified = false;
  const unsubscribe = subscribeAppState(() => {
    notified = true;
  });

  await saveDatabase();
  assert.equal(notified, true);
  unsubscribe();
});
