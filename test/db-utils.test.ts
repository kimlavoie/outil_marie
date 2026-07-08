import test from "node:test";
import assert from "node:assert/strict";
import "./indexeddb-mock.ts";
import { openVersionedDb } from "../src/state/db-utils.ts";

test("openVersionedDb opens a database and runs upgradeneeded callback", async () => {
  let upgradeCalled = false;
  let oldV = -1;
  let newV = -1;

  const db = await openVersionedDb("test-db-1", 1, (database: any, oldVersion: any, newVersion: any) => {
    upgradeCalled = true;
    oldV = oldVersion;
    newV = newVersion;
    database.createObjectStore("test-store");
  });

  assert.ok(db);
  assert.equal(db.name, "test-db-1");
  assert.equal(upgradeCalled, true);
  assert.equal(oldV, 0);
  assert.equal(newV, 1);

  // Re-open at version 2 to trigger another upgrade
  let upgradeCalled2 = false;
  let oldV2 = -1;
  let newV2 = -1;

  const db2 = await openVersionedDb("test-db-1", 2, (database: any, oldVersion: any, newVersion: any) => {
    upgradeCalled2 = true;
    oldV2 = oldVersion;
    newV2 = newVersion;
  });

  assert.ok(db2);
  assert.equal(upgradeCalled2, true);
  assert.equal(oldV2, 1);
  assert.equal(newV2, 2);
});

test("openVersionedDb handles upgrade errors by logging them and continuing", async () => {
  const db = await openVersionedDb("test-db-error", 1, () => {
    throw new Error("Simulated upgrade error");
  });
  assert.ok(db);
});
export {};
