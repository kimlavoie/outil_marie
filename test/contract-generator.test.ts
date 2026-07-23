import test from "node:test";
import assert from "node:assert/strict";

// buildSheetXml (and the helpers it calls) pull salary/service rates from appState.settings —
// same fixture pattern as activities-financials.test.ts.
import { appState } from "../src/state/state.ts";
import { xmlEscapeText, formatDateFr, wrapRowHeight, buildSheetXml } from "../src/services/contract-generator.ts";
import { S } from "../src/services/contract-generator/styles.ts";

appState.settings = {
  theme: "dark",
  rooms: [],
  departments: [],
  accounts: [],
  last_backup_date: "",
  backup_reminder_days: 7,
  salaries: [{ id: "sal1", job: "Technicien", tarifs: [], rate_versions: [{ effective_date: "", rate: 20, overtime_rate: 30 }] } as any],
  services: [{ id: "svc-hourly", name: "Projecteur", type: "hourly", rate_versions: [{ effective_date: "", rate: 10 }] } as any],
  global_tasks: [],
  schedulable_tasks: [],
  tax_rates: { tps: 0.05, tvq: 0.09975 }
};

function makeActivity(overrides: any = {}) {
  return {
    id: "act-1",
    name: "Activité test",
    description: "",
    attendees_count: 0,
    activity_manager: {},
    responsable_first_name: "",
    responsable_last_name: "",
    reservations: [],
    ...overrides
  };
}

test("xmlEscapeText escapes &, < and > but leaves quotes untouched", () => {
  assert.equal(xmlEscapeText("Tom & Jerry"), "Tom &amp; Jerry");
  assert.equal(xmlEscapeText("<script>"), "&lt;script&gt;");
  assert.equal(xmlEscapeText(`"quoted"`), `"quoted"`);
});

test("formatDateFr converts an ISO date to YYYY/MM/DD and returns empty string for missing input", () => {
  assert.equal(formatDateFr("2025-08-01"), "2025/08/01");
  assert.equal(formatDateFr(""), "");
  assert.equal(formatDateFr(undefined as any), "");
});

test("wrapRowHeight grows with text length and never goes below the 20 minimum", () => {
  const shortHeight = wrapRowHeight("Court", 132, 16);
  const longHeight = wrapRowHeight("Un texte beaucoup plus long qui devrait prendre plusieurs lignes une fois affiché. Et nous rajoutons encore du texte pour s'assurer que ça dépasse largement une seule ligne sous n'importe quelle configuration.", 132, 16);
  assert.ok(shortHeight >= 20);
  assert.ok(longHeight > shortHeight);
  assert.ok(wrapRowHeight("", 132, 16) >= 20);
});

test("buildSheetXml only embeds the header drawing for the 'contrat' variant", () => {
  const act = makeActivity();
  assert.match(buildSheetXml(act, "contrat"), /<drawing r:id="rId1"\/>/);
  assert.doesNotMatch(buildSheetXml(act, "soumission"), /<drawing/);
});

test("buildSheetXml only includes cancellation clause and signature sections for 'contrat'", () => {
  const act = makeActivity();
  const contrat = buildSheetXml(act, "contrat");
  const soumission = buildSheetXml(act, "soumission");
  assert.match(contrat, /Clause d.annulation et de paiement/);
  assert.match(contrat, /Annexe – Clauses de location/);
  assert.doesNotMatch(soumission, /Clause d.annulation et de paiement/);
  assert.doesNotMatch(soumission, /Annexe – Clauses de location/);
  assert.match(soumission, /Soumission/);
});

test("buildSheetXml XML-escapes activity name/description instead of emitting raw special characters", () => {
  const act = makeActivity({ name: "Fête & Cie <VIP>", description: "Ligne 1 & Ligne 2" });
  const xml = buildSheetXml(act, "contrat");
  assert.match(xml, /Fête &amp; Cie &lt;VIP&gt;/);
  assert.doesNotMatch(xml, /Fête & Cie <VIP>/);
});

test("buildSheetXml handles an activity with no reservations, no manager and zero attendees without throwing", () => {
  const act = makeActivity({ activity_manager: undefined, attendees_count: 0, reservations: [] });
  assert.doesNotThrow(() => buildSheetXml(act, "contrat"));
  assert.doesNotThrow(() => buildSheetXml(act, "soumission"));
});

test("buildSheetXml falls back to '(salle non définie)' when a reservation has no room name", () => {
  const act = makeActivity({
    reservations: [{ room_name: "", slots: [{ date: "2025-08-01", start_time: "09:00", end_time: "17:00" }], staff: [], services: [], fees: [] }]
  });
  assert.match(buildSheetXml(act, "contrat"), /\(salle non définie\)/);
});

test("buildSheetXml includes the room name and totals a room's tariff across its slots", () => {
  const act = makeActivity({
    reservations: [
      {
        room_name: "Salle Polyvalente",
        tariff_amount: 100,
        slots: [{ date: "2025-08-01" }, { date: "2025-08-02" }],
        staff: [],
        services: [],
        fees: []
      }
    ]
  });
  const xml = buildSheetXml(act, "contrat");
  assert.match(xml, /Salle Polyvalente/);
  // 100/day x 2 days = 200 subtotal, plus it should surface again in the TOTAL row (taxes included)
  assert.match(xml, /<v>200<\/v>/);
});

test("buildSheetXml includes staff/service line items and the computed TOTAL with taxes", () => {
  const act = makeActivity({
    reservations: [
      {
        room_name: "Salle A",
        tariff_amount: 0,
        slots: [{ date: "2025-08-01" }],
        staff: [{ salary_id: "sal1", hours: 4, count: 1 }],
        services: [{ service_id: "svc-hourly", hours: 2, count: 1 }],
        fees: [{ description: "Frais de nettoyage", amount: 15 }]
      }
    ]
  });
  const xml = buildSheetXml(act, "contrat");
  // subtotal = staff(20*4) + services(10*2) + fees(15) = 80 + 20 + 15 = 115
  assert.match(xml, /<v>115<\/v>/);
  assert.match(xml, /Frais de nettoyage/);
  assert.match(xml, /Technicien/);
  assert.match(xml, /Projecteur/);
});

test("buildSheetXml formats a single-day reservation period as one date, a multi-day period as a range", () => {
  const singleDay = makeActivity({
    reservations: [{ room_name: "Salle A", slots: [{ date: "2025-08-01" }], staff: [], services: [], fees: [] }]
  });
  const multiDay = makeActivity({
    reservations: [{ room_name: "Salle A", slots: [{ date: "2025-08-01" }, { date: "2025-08-05" }], staff: [], services: [], fees: [] }]
  });
  assert.match(buildSheetXml(singleDay, "contrat"), /2025\/08\/01/);
  assert.doesNotMatch(buildSheetXml(singleDay, "contrat"), /2025\/08\/01 - /);
  assert.match(buildSheetXml(multiDay, "contrat"), /2025\/08\/01 - 2025\/08\/05/);
});

test("buildSheetXml uses top-aligned style IDs in the Annexe section", () => {
  const act = makeActivity();
  const xml = buildSheetXml(act, "contrat");
  assert.match(xml, new RegExp(`s="${S.annexeTitle}"`));
  assert.match(xml, new RegExp(`s="${S.annexeClauseGroup}"`));
  assert.match(xml, new RegExp(`s="${S.annexeClauseNum}"`));
  assert.match(xml, new RegExp(`s="${S.annexeClauseBody}"`));
});

test("buildSheetXml includes setup/teardown fees in detailed room section and billing summary", () => {
  const originalRooms = appState.settings.rooms;
  appState.settings.rooms = [
    { name: "Salle Polyvalente", setup_fee: 150, rate_type: "daily" } as any
  ];

  const act = makeActivity({
    client_type: "externe",
    reservations: [
      {
        room_name: "Salle Polyvalente",
        tariff_amount: 100,
        slots: [{ date: "2025-08-01" }],
        staff: [],
        services: [],
        fees: []
      }
    ]
  });

  const xml = buildSheetXml(act, "contrat");
  // The detailed room section should show "Montage/démontage" and the fee (150)
  assert.match(xml, /Montage\/démontage/);
  assert.match(xml, /<v>150<\/v>/);

  // The billing section should have a detailed breakdown
  assert.match(xml, /Location des salles/);
  assert.match(xml, /Montage\/démontage/);

  const matches = xml.match(/Montage\/démontage/g) || [];
  assert.equal(matches.length, 2);

  // Clean up
  appState.settings.rooms = originalRooms;
});

test("buildSheetXml does not include setup/teardown detailed row if client is internal", () => {
  const originalRooms = appState.settings.rooms;
  appState.settings.rooms = [
    { name: "Salle Polyvalente", setup_fee: 150, rate_type: "daily" } as any
  ];

  const act = makeActivity({
    client_type: "interne",
    reservations: [
      {
        room_name: "Salle Polyvalente",
        tariff_amount: 100,
        slots: [{ date: "2025-08-01" }],
        staff: [],
        services: [],
        fees: []
      }
    ]
  });

  const xml = buildSheetXml(act, "contrat");
  // Montage/démontage should only appear once (in the billing breakdown, not in the detailed room section)
  const matches = xml.match(/Montage\/démontage/g) || [];
  assert.equal(matches.length, 1);

  // Clean up
  appState.settings.rooms = originalRooms;
});

export {};
