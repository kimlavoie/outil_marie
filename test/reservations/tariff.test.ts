import test from "node:test";
import assert from "node:assert/strict";
import { dom } from "../dom-mock.ts";

test.after(() => dom.window.close());

(globalThis as any).localStorage = {
  store: {} as Record<string, string>,
  getItem(key: string) { return this.store[key] || null; },
  setItem(key: string, value: string) { this.store[key] = String(value); },
  removeItem(key: string) { delete this.store[key]; },
  clear() { this.store = {}; }
};

import { setAppState } from "../../src/state/state.ts";
import {
  buildTariffParameterOptionsHtml,
  buildTariffClientTypeOptionsHtml,
  updateResolvedPriceDisplay,
  refreshReservationTariffSelect
} from "../../src/activities/reservations/tariff.ts";

const ROOM = {
  name: "Salle A",
  pricing_grids: [
    {
      effective_date: "",
      parameters: [
        { id: "param-1", name: "Journée complète" },
        { id: "param-2", name: "Demi-journée" }
      ],
      client_types: [
        { id: "ct-1", name: "Interne" },
        { id: "ct-2", name: "Externe" }
      ],
      cells: [
        { parameter_id: "param-1", client_type_id: "ct-1", amount: 100 },
        { parameter_id: "param-1", client_type_id: "ct-2", amount: 200 },
        { parameter_id: "param-2", client_type_id: "ct-1", amount: 50 },
        { parameter_id: "param-2", client_type_id: "ct-2", amount: 100 }
      ]
    }
  ]
};

function baseState(overrides: any = {}) {
  return {
    settings: {
      theme: "dark",
      rooms: [ROOM],
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

test.beforeEach(() => {
  setAppState(baseState());
  document.body.innerHTML = "";
});

test("buildTariffParameterOptionsHtml returns an empty string when no room name is given", () => {
  assert.equal(buildTariffParameterOptionsHtml("", "", ""), "");
});

test("buildTariffParameterOptionsHtml returns an empty string for the 'other room' sentinel", () => {
  assert.equal(buildTariffParameterOptionsHtml("__other__", "", ""), "");
});

test("buildTariffParameterOptionsHtml returns an empty string when the room has no pricing grid", () => {
  assert.equal(buildTariffParameterOptionsHtml("Unknown Room", "", ""), "");
});

test("buildTariffParameterOptionsHtml lists every grid parameter as an <option>", () => {
  const html = buildTariffParameterOptionsHtml("Salle A", "", "");
  assert.match(html, /<option value="param-1"[^>]*>Journée complète<\/option>/);
  assert.match(html, /<option value="param-2"[^>]*>Demi-journée<\/option>/);
});

test("buildTariffParameterOptionsHtml marks the option matching the parameter half of a composite tariff id as selected", () => {
  const html = buildTariffParameterOptionsHtml("Salle A", "", "param-2::ct-1");
  assert.match(html, /<option value="param-2" selected>/);
  assert.match(html, /<option value="param-1" >/);
});

test("buildTariffParameterOptionsHtml doesn't mark anything selected for the custom-amount sentinel", () => {
  const html = buildTariffParameterOptionsHtml("Salle A", "", "__custom__");
  assert.doesNotMatch(html, /selected/);
});

test("buildTariffClientTypeOptionsHtml returns an empty string when no room name is given", () => {
  assert.equal(buildTariffClientTypeOptionsHtml("", "", ""), "");
});

test("buildTariffClientTypeOptionsHtml lists every grid client type as an <option>", () => {
  const html = buildTariffClientTypeOptionsHtml("Salle A", "", "");
  assert.match(html, /<option value="ct-1"[^>]*>Interne<\/option>/);
  assert.match(html, /<option value="ct-2"[^>]*>Externe<\/option>/);
});

test("buildTariffClientTypeOptionsHtml appends the resolved $/day amount once a parameter is selected", () => {
  const html = buildTariffClientTypeOptionsHtml("Salle A", "", "", "param-1");
  assert.match(html, /Interne \(100\$\/jour\)/);
  assert.match(html, /Externe \(200\$\/jour\)/);
});

test("buildTariffClientTypeOptionsHtml derives the selected client type and parameter from a composite tariff id", () => {
  const html = buildTariffClientTypeOptionsHtml("Salle A", "", "param-2::ct-2");
  assert.match(html, /<option value="ct-2" selected>Externe \(100\$\/jour\)<\/option>/);
});

function makeCard() {
  const card = document.createElement("div");
  card.innerHTML = `
    <input class="searchable-select-value" value="Salle A">
    <select class="room-tariff-parameter">
      <option value="">Sélectionner...</option>
      <option value="param-1">Journée complète</option>
      <option value="param-2">Demi-journée</option>
      <option value="__custom__">Montant personnalisé...</option>
    </select>
    <select class="room-tariff-client-type">
      <option value="">Sélectionner...</option>
      <option value="ct-1">Interne</option>
      <option value="ct-2">Externe</option>
    </select>
    <div class="room-tariff-resolved-price-display" style="display: none;">
      <span class="resolved-price-val"></span>
    </div>
    <div class="room-tariff-stale-warning" style="display: none;"></div>
    <div class="room-tariff-client-type-group"></div>
    <div class="room-tariff-custom-group"></div>
    <div class="reservation-slots-list"></div>
  `;
  document.body.appendChild(card);
  return card;
}

test("updateResolvedPriceDisplay shows the resolved price once a room/parameter/client type are all selected", () => {
  const card = makeCard();
  (card.querySelector(".room-tariff-parameter") as HTMLSelectElement).value = "param-1";
  (card.querySelector(".room-tariff-client-type") as HTMLSelectElement).value = "ct-2";

  updateResolvedPriceDisplay(card);

  const display = card.querySelector(".room-tariff-resolved-price-display") as HTMLElement;
  assert.equal(display.style.display, "block");
  assert.match(card.querySelector(".resolved-price-val")!.textContent!, /200/);
});

test("updateResolvedPriceDisplay hides the display when the client type isn't selected yet", () => {
  const card = makeCard();
  (card.querySelector(".room-tariff-parameter") as HTMLSelectElement).value = "param-1";

  updateResolvedPriceDisplay(card);

  assert.equal((card.querySelector(".room-tariff-resolved-price-display") as HTMLElement).style.display, "none");
});

test("updateResolvedPriceDisplay hides the display when the parameter is the custom-amount sentinel", () => {
  const card = makeCard();
  (card.querySelector(".room-tariff-parameter") as HTMLSelectElement).value = "__custom__";
  (card.querySelector(".room-tariff-client-type") as HTMLSelectElement).value = "ct-1";

  updateResolvedPriceDisplay(card);

  assert.equal((card.querySelector(".room-tariff-resolved-price-display") as HTMLElement).style.display, "none");
});

test("updateResolvedPriceDisplay flags a stale tariff when the stored amount no longer matches the grid", () => {
  const card = makeCard();
  card.dataset.storedTariffId = "param-1::ct-1";
  card.dataset.storedTariffAmount = "75";
  (card.querySelector(".room-tariff-parameter") as HTMLSelectElement).value = "param-1";
  (card.querySelector(".room-tariff-client-type") as HTMLSelectElement).value = "ct-1";

  updateResolvedPriceDisplay(card);

  const staleEl = card.querySelector(".room-tariff-stale-warning") as HTMLElement;
  assert.equal(staleEl.style.display, "block");
  assert.match(staleEl.textContent!, /Tarif obsolète/);
  assert.match(staleEl.textContent!, /75/);
  assert.match(staleEl.textContent!, /100/);
});

test("updateResolvedPriceDisplay doesn't flag staleness when the stored amount still matches the grid", () => {
  const card = makeCard();
  card.dataset.storedTariffId = "param-1::ct-1";
  card.dataset.storedTariffAmount = "100";
  (card.querySelector(".room-tariff-parameter") as HTMLSelectElement).value = "param-1";
  (card.querySelector(".room-tariff-client-type") as HTMLSelectElement).value = "ct-1";

  updateResolvedPriceDisplay(card);

  assert.equal((card.querySelector(".room-tariff-stale-warning") as HTMLElement).style.display, "none");
});

test("refreshReservationTariffSelect populates both selects and keeps the client-type group visible for a non-custom tariff", () => {
  const card = makeCard();
  refreshReservationTariffSelect(card, "Salle A", "param-1::ct-2");

  const paramSelect = card.querySelector(".room-tariff-parameter") as HTMLSelectElement;
  const ctSelect = card.querySelector(".room-tariff-client-type") as HTMLSelectElement;
  assert.match(paramSelect.innerHTML, /param-1" selected/);
  assert.match(ctSelect.innerHTML, /ct-2" selected/);
  assert.equal((card.querySelector(".room-tariff-client-type-group") as HTMLElement).style.display, "flex");
  assert.equal((card.querySelector(".room-tariff-custom-group") as HTMLElement).style.display, "none");
});

test("refreshReservationTariffSelect shows the custom-amount group and hides the client-type group for the custom sentinel", () => {
  const card = makeCard();
  refreshReservationTariffSelect(card, "Salle A", "__custom__");

  assert.equal((card.querySelector(".room-tariff-client-type-group") as HTMLElement).style.display, "none");
  assert.equal((card.querySelector(".room-tariff-custom-group") as HTMLElement).style.display, "flex");
});

export {};
