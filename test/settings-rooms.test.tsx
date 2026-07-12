import test from "node:test";
import assert from "node:assert/strict";
import { dom } from "./dom-mock.ts";
import "./indexeddb-mock.ts";

test.after(() => dom.window.close());

(globalThis as any).localStorage = {
  store: {} as Record<string, string>,
  getItem(key: string) { return this.store[key] || null; },
  setItem(key: string, value: string) { this.store[key] = String(value); },
  removeItem(key: string) { delete this.store[key]; },
  clear() { this.store = {}; }
};

import { render, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { setAppState, appState } from "../src/state/state.ts";
import { RoomsPanel, RoomModal } from "../src/components/settings/rooms.tsx";

function baseState(overrides: any = {}) {
  return {
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
      schedulable_tasks: []
    },
    activities: [],
    favorites: [],
    selected_year: "2025-2026",
    selected_quarters: [1, 2, 3, 4],
    ...overrides
  };
}

function room(overrides: any = {}) {
  return {
    name: "POLY",
    abbreviation: "P",
    pricing_grids: [
      {
        id: "grid-1",
        effective_date: "",
        parameters: [{ id: "p1", name: "Spectacle" }],
        client_types: [{ id: "ct1", name: "Interne", gl_account_code: "" }],
        cells: [{ parameter_id: "p1", client_type_id: "ct1", amount: 100 }]
      }
    ],
    linked_rooms: [],
    linked_staff: [],
    linked_fees: [],
    linked_tasks: [],
    ...overrides
  };
}

test.beforeEach(() => {
  setAppState(baseState());
  document.body.innerHTML = `<div id="toast-container"></div>`;
  (globalThis as any).confirm = () => true;
});

test.afterEach(() => cleanup());

test("RoomsPanel renders one row per room with its tarif summary", () => {
  setAppState(baseState({ settings: { ...appState.settings, rooms: [room()] } }));
  const { getByText } = render(<RoomsPanel active={true} openModal={() => {}} bump={() => {}} />);
  assert.ok(getByText(/POLY/));
  assert.ok(getByText(/100,00 \$\/jour/));
});

test("RoomsPanel opens the modal for a new room when + Ajouter une salle is clicked", () => {
  let openedWith: string | null | undefined = "not-called";
  const { getByText } = render(<RoomsPanel active={true} openModal={name => (openedWith = name)} bump={() => {}} />);
  fireEvent.click(getByText("+ Ajouter une salle"));
  assert.equal(openedWith, null);
});

test("clicking the delete icon asks for confirmation, then removes the room and saves", async () => {
  setAppState(baseState({ settings: { ...appState.settings, rooms: [room()] } }));
  let bumped = false;
  const { container } = render(<RoomsPanel active={true} openModal={() => {}} bump={() => (bumped = true)} />);

  fireEvent.click(container.querySelector(".btn-icon")!);

  await waitFor(() => assert.ok(bumped));
  assert.equal(appState.settings.rooms.length, 0);
});

test("declining the confirmation leaves the room list untouched", () => {
  setAppState(baseState({ settings: { ...appState.settings, rooms: [room()] } }));
  (globalThis as any).confirm = () => false;
  const { container } = render(<RoomsPanel active={true} openModal={() => {}} bump={() => {}} />);

  fireEvent.click(container.querySelector(".btn-icon")!);

  assert.equal(appState.settings.rooms.length, 1);
});

test("deleting a room also removes it from other rooms' linked_rooms", async () => {
  setAppState(
    baseState({
      settings: {
        ...appState.settings,
        rooms: [room(), room({ name: "AUDI", linked_rooms: ["POLY"] })]
      }
    })
  );
  let bumped = false;
  const { container } = render(<RoomsPanel active={true} openModal={() => {}} bump={() => (bumped = true)} />);
  const deleteButtons = container.querySelectorAll(".btn-icon");
  fireEvent.click(deleteButtons[0]);

  await waitFor(() => assert.ok(bumped));
  assert.equal(appState.settings.rooms.length, 1);
  assert.deepEqual(appState.settings.rooms[0].linked_rooms, []);
});

test("RoomModal pre-fills name, abbreviation and grid data when editing", () => {
  setAppState(baseState({ settings: { ...appState.settings, rooms: [room()] } }));
  const { container } = render(<RoomModal name="POLY" onClose={() => {}} bump={() => {}} />);
  const nameInput = container.querySelector("#form-room-name") as HTMLInputElement;
  const abbrInput = container.querySelector("#form-room-abbreviation") as HTMLInputElement;
  assert.equal(nameInput.value, "POLY");
  assert.equal(abbrInput.value, "P");
});

test("RoomModal starts blank with a single default grid version when adding", () => {
  const { container } = render(<RoomModal name={null} onClose={() => {}} bump={() => {}} />);
  const nameInput = container.querySelector("#form-room-name") as HTMLInputElement;
  assert.equal(nameInput.value, "");
  assert.ok(container.querySelector(".pricing-grid-help-container"));
});

test("submitting a blank room name shows a validation warning and doesn't save", () => {
  const { container } = render(<RoomModal name={null} onClose={() => {}} bump={() => {}} />);
  fireEvent.click(container.querySelector('.modal-footer button[type="button"].btn-primary')!);
  assert.equal(appState.settings.rooms.length, 0);
  const toast = document.querySelector("#toast-container .toast-message");
  assert.ok(toast);
  assert.match(toast!.textContent!, /nom de la salle est obligatoire/);
});

test("submitting a new room without any pricing-grid parameter/client-type shows a validation warning", () => {
  const { container } = render(<RoomModal name={null} onClose={() => {}} bump={() => {}} />);
  fireEvent.change(container.querySelector("#form-room-name")!, { target: { value: "NOUVELLE" } });
  fireEvent.click(container.querySelector('.modal-footer button[type="button"].btn-primary')!);
  assert.equal(appState.settings.rooms.length, 0);
  const toast = document.querySelector("#toast-container .toast-message");
  assert.ok(toast);
  assert.match(toast!.textContent!, /au moins une configuration/);
});

test("submitting a valid new room adds it (uppercased) to appState.settings.rooms and closes the modal", async () => {
  setAppState(baseState({ settings: { ...appState.settings, rooms: [room({ name: "ZETA" })] } }));
  let closed = false;
  const { container } = render(<RoomModal name={null} onClose={() => (closed = true)} bump={() => {}} />);

  fireEvent.change(container.querySelector("#form-room-name")!, { target: { value: "nouvelle salle" } });

  // Add one parameter and one client type through the pricing grid editor.
  const addButtons = Array.from(container.querySelectorAll("button")).filter(b => b.textContent === "+ Ajouter");
  fireEvent.click(addButtons[0]); // parameter
  fireEvent.click(addButtons[1]); // client type

  const paramInput = container.querySelector('input[placeholder^="Ex: Spectacle"]') as HTMLInputElement;
  fireEvent.change(paramInput, { target: { value: "Spectacle" } });
  const clientInput = container.querySelector('input[placeholder^="Ex: Interne"]') as HTMLInputElement;
  fireEvent.change(clientInput, { target: { value: "Interne" } });

  fireEvent.click(container.querySelector('.modal-footer button[type="button"].btn-primary')!);

  await waitFor(() => assert.ok(closed));
  assert.equal(appState.settings.rooms.length, 2);
  const added = appState.settings.rooms.find((r: any) => r.name === "NOUVELLE SALLE");
  assert.ok(added);
  assert.equal(added.pricing_grids[0].parameters[0].name, "Spectacle");
  assert.equal(added.pricing_grids[0].client_types[0].name, "Interne");
});

test("submitting a duplicate room name shows a warning and doesn't add a second entry", () => {
  setAppState(baseState({ settings: { ...appState.settings, rooms: [room()] } }));
  const { container } = render(<RoomModal name={null} onClose={() => {}} bump={() => {}} />);

  fireEvent.change(container.querySelector("#form-room-name")!, { target: { value: "poly" } });
  const addButtons = Array.from(container.querySelectorAll("button")).filter(b => b.textContent === "+ Ajouter");
  fireEvent.click(addButtons[0]);
  fireEvent.click(addButtons[1]);
  const paramInput = container.querySelector('input[placeholder^="Ex: Spectacle"]') as HTMLInputElement;
  fireEvent.change(paramInput, { target: { value: "Spectacle" } });
  const clientInput = container.querySelector('input[placeholder^="Ex: Interne"]') as HTMLInputElement;
  fireEvent.change(clientInput, { target: { value: "Interne" } });

  fireEvent.click(container.querySelector('.modal-footer button[type="button"].btn-primary')!);

  assert.equal(appState.settings.rooms.length, 1);
  const toast = document.querySelector("#toast-container .toast-message");
  assert.ok(toast);
  assert.match(toast!.textContent!, /existe déjà/);
});

test("editing an existing room's name propagates the rename to reservations referencing it", async () => {
  setAppState(
    baseState({
      settings: { ...appState.settings, rooms: [room()] },
      activities: [{ id: "act-1", reservations: [{ room_name: "POLY" }] }]
    })
  );
  let closed = false;
  const { container } = render(<RoomModal name="POLY" onClose={() => (closed = true)} bump={() => {}} />);

  fireEvent.change(container.querySelector("#form-room-name")!, { target: { value: "POLYVALENTE" } });
  fireEvent.click(container.querySelector('.modal-footer button[type="button"].btn-primary')!);

  await waitFor(() => assert.ok(closed));
  assert.equal(appState.settings.rooms[0].name, "POLYVALENTE");
  assert.equal(appState.activities[0].reservations[0].room_name, "POLYVALENTE");
});

test("toggling a linked room updates the linkedRooms selection", () => {
  setAppState(baseState({ settings: { ...appState.settings, rooms: [room(), room({ name: "AUDI" })] } }));
  const { container } = render(<RoomModal name="POLY" onClose={() => {}} bump={() => {}} />);
  const pillButtons = container.querySelectorAll(".pill-toggle-group .pill-toggle");
  assert.equal(pillButtons.length, 1); // AUDI only, POLY excluded (originalName)
  fireEvent.click(pillButtons[0]);
  assert.match(pillButtons[0].className, /active/);
});

export {};
