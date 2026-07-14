import test from "node:test";
import assert from "node:assert/strict";
import { calculateDaysCount, getRoomsTariffTotal, getActivityReferences, formatCurrency, escapeHtml, generateUid, getReservationRoomLabel, getRoomColor, buildGlAccountOptionsHtml, buildPaginationBarHtml, debounce, formatDateMask } from "../src/utils/utils.ts";
import { appState } from "../src/state/state.ts";

test("calculateDaysCount counts both endpoints inclusively", () => {
  assert.equal(calculateDaysCount("2025-01-01", "2025-01-05"), 5);
  assert.equal(calculateDaysCount("2025-01-01", "2025-01-01"), 1);
});

test("calculateDaysCount falls back to 1 day for missing or invalid input", () => {
  assert.equal(calculateDaysCount("", "2025-01-05"), 1);
  assert.equal(calculateDaysCount("2025-01-05", ""), 1);
  assert.equal(calculateDaysCount("not-a-date", "2025-01-05"), 1);
});

test("calculateDaysCount returns 0 (invalid range) when the end precedes the start", () => {
  assert.equal(calculateDaysCount("2025-01-05", "2025-01-01"), 0);
});

test("getRoomsTariffTotal sums tariff_amount x number of créneaux across every réservation", () => {
  const activity = {
    reservations: [
      { slots: [{ date: "2025-01-01" }, { date: "2025-01-02" }], tariff_amount: 100 }, // 2 slots x 100 = 200
      { slots: [{ date: "2025-02-01" }, { date: "2025-02-02" }, { date: "2025-02-03" }], tariff_amount: 50 } // 3 slots x 50 = 150
    ]
  };
  assert.equal(getRoomsTariffTotal(activity as any), 350);
});

test("getRoomsTariffTotal handles hourly room calculations", () => {
  const roomName = "SALLE HOURLY TEST";
  appState.settings.rooms.push({
    name: roomName,
    rate_type: "hourly",
    color: "#ff0000",
    pricing_grids: [],
    linked_rooms: [],
    linked_staff: [],
    linked_fees: [],
    linked_tasks: []
  });

  const activity = {
    reservations: [
      {
        room_name: roomName,
        slots: [
          { date: "2025-01-01", start_time: "09:00", end_time: "17:30" }, // 8.5 hours
          { date: "2025-01-02", start_time: "10:15", end_time: "12:45" }  // 2.5 hours
        ],
        tariff_amount: 100 // 100$/h
      }
    ]
  };

  try {
    const total = getRoomsTariffTotal(activity as any);
    assert.equal(total, 1100); // (8.5 + 2.5) * 100 = 1100
  } finally {
    appState.settings.rooms = appState.settings.rooms.filter(r => r.name !== roomName);
  }
});

test("getRoomsTariffTotal returns 0 when the activity has no reservations", () => {
  assert.equal(getRoomsTariffTotal({}), 0);
  assert.equal(getRoomsTariffTotal({ reservations: [] }), 0);
});

test("getActivityReferences joins distinct, non-empty references", () => {
  const activity = {
    distributions: [{ reference: "RI001" }, { reference: "RI001" }, { reference: "RI002" }, { reference: "" }]
  };
  assert.equal(getActivityReferences(activity as any), "RI001, RI002");
});

test("formatCurrency formats value into CAD in French CA style", () => {
  const formatted = formatCurrency(125.5).replace(/\u00a0/g, " ");
  assert.ok(formatted.includes("125,50"));
  assert.ok(formatted.includes("$"));
});

test("escapeHtml escapes HTML-sensitive characters", () => {
  assert.equal(escapeHtml("<div>Hello & 'welcome' \"world\"</div>"), "&lt;div&gt;Hello &amp; &#039;welcome&#039; &quot;world&quot;&lt;/div&gt;");
  assert.equal(escapeHtml(""), "");
  assert.equal(escapeHtml(null), "");
});

test("generateUid generates unique ids with the specified prefix", () => {
  const uid1 = generateUid("room");
  const uid2 = generateUid("room");
  assert.ok(uid1.startsWith("room-"));
  assert.ok(uid2.startsWith("room-"));
  assert.notEqual(uid1, uid2);
});

test("getReservationRoomLabel returns reservation room name or other details", () => {
  assert.equal(getReservationRoomLabel(null), "");
  assert.equal(getReservationRoomLabel({ room_name: "Salle A" }), "Salle A");
  assert.equal(getReservationRoomLabel({ room_name: "__other__", room_other_details: "Cafétéria" }), "Cafétéria");
  assert.equal(getReservationRoomLabel({ room_name: "__other__" }), "Autre");
  assert.equal(getReservationRoomLabel({}), "");
});

test("getRoomColor returns configured room color or stable fallback from hash", () => {
  appState.settings = {
    theme: "dark",
    rooms: [
      { name: "Salle Bleue", color: "#0000ff" },
      { name: "Salle Sans Couleur" }
    ] as any[],
    salaries: [],
    services: [],
    global_tasks: [],
    schedulable_tasks: [],
    departments: [],
    accounts: [],
    last_backup_date: "",
    backup_reminder_days: 7,
    tax_rates: { tps: 0.05, tvq: 0.09975 }
  };

  // Configured color
  assert.equal(getRoomColor("Salle Bleue"), "#0000ff");
  
  // Stable fallback color
  const color1 = getRoomColor("Salle Sans Couleur");
  const color2 = getRoomColor("Salle Sans Couleur");
  assert.ok(color1.startsWith("#"));
  assert.equal(color1, color2);
  
  // Fallback for non-existent room
  const color3 = getRoomColor("Non-existent Room");
  assert.ok(color3.startsWith("#"));
});

test("buildGlAccountOptionsHtml generates correct select options HTML with optional selection", () => {
  appState.settings = {
    theme: "dark",
    rooms: [],
    salaries: [],
    services: [],
    global_tasks: [],
    schedulable_tasks: [],
    departments: [],
    accounts: [
      { code: "101", description: "Caisse" },
      { code: "102", description: "Banque & Épargne" }
    ],
    last_backup_date: "",
    backup_reminder_days: 7,
    tax_rates: { tps: 0.05, tvq: 0.09975 }
  };

  const optionsHtml = buildGlAccountOptionsHtml();
  assert.ok(optionsHtml.includes('<option value="">Aucun</option>'));
  assert.ok(optionsHtml.includes('<option value="101" >101 (Caisse)</option>'));
  assert.ok(optionsHtml.includes('102 (Banque &amp; Épargne)')); // tests HTML escape of description
  
  const selectedHtml = buildGlAccountOptionsHtml("101");
  assert.ok(selectedHtml.includes('<option value="101" selected>101 (Caisse)</option>'));
});

test("buildPaginationBarHtml returns pagination components correctly", () => {
  // Page 1 of 3, page size 10, total 25
  const result = buildPaginationBarHtml({ page: 1, pageSize: 10, totalItems: 25, extraAttr: 'data-grid="g1"' });
  assert.equal(result.clampedPage, 1);
  assert.ok(result.html.includes("1–10 sur 25"));
  assert.ok(result.html.includes('class="btn-icon pagination-prev" data-grid="g1" disabled')); // prev is disabled on page 1
  assert.ok(result.html.includes('class="btn-icon pagination-next" data-grid="g1"  title="Page suivante"')); // next is enabled
  assert.ok(result.html.includes('Page 1 / 3'));
  assert.ok(result.html.includes('<option value="10" selected>10 / page</option>'));
  
  // Clamped page check (page 5 gets clamped to max page 3)
  const resultClamped = buildPaginationBarHtml({ page: 5, pageSize: 10, totalItems: 25 });
  assert.equal(resultClamped.clampedPage, 3);
  assert.ok(resultClamped.html.includes("21–25 sur 25"));
  assert.ok(resultClamped.html.includes('Page 3 / 3'));
});

test("debounce delays execution and only runs the last call in the delay period", async () => {
  let called = 0;
  const fn = debounce(() => { called++; }, 50);
  
  fn();
  fn();
  fn();
  
  assert.equal(called, 0);
  
  await new Promise(resolve => setTimeout(resolve, 80));
  assert.equal(called, 1);
});

test("formatDateMask formats digits to YYYY-MM-DD", () => {
  assert.equal(formatDateMask("2026"), "2026");
  assert.equal(formatDateMask("20260"), "2026-0");
  assert.equal(formatDateMask("202607"), "2026-07");
  assert.equal(formatDateMask("2026071"), "2026-07-1");
  assert.equal(formatDateMask("20260715"), "2026-07-15");
  assert.equal(formatDateMask("20260715999"), "2026-07-15");
  assert.equal(formatDateMask("abc2026def07ghi15"), "2026-07-15");
});

export {};
