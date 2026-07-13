import test from "node:test";
import assert from "node:assert/strict";
import { dom } from "./dom-mock.ts";

test.after(() => dom.window.close());

import {
  activityHasTechnicalDirector,
  getTechnicalDirectorReservations,
  buildReservationWindow,
  buildTechnicalDirectorIcs,
  icsFileNameFor,
  sendActivityScheduleToTechnicalDirector
} from "../src/activities/technical-director-notice.ts";

function makeReservation(overrides: any = {}) {
  return {
    id: "resa-1",
    room_name: "Salle François-Brassard",
    install: { enabled: false, date: "", start_time: "", end_time: "" },
    dismantle: { enabled: false, date: "", start_time: "", end_time: "" },
    slots: [],
    staff: [],
    ...overrides
  };
}

function makeActivity(overrides: any = {}) {
  return {
    id: "act-1",
    name: "Gala annuel",
    reservations: [],
    ...overrides
  };
}

test("activityHasTechnicalDirector is false when no reservation has the technical-director salary", () => {
  const act = makeActivity({
    reservations: [makeReservation({ staff: [{ salary_id: "salary-tc", count: 1 }] })]
  });
  assert.equal(activityHasTechnicalDirector(act), false);
});

test("activityHasTechnicalDirector is true once any reservation lists the technical director in staff with hours booked", () => {
  const act = makeActivity({
    reservations: [
      makeReservation({ id: "r1", staff: [{ salary_id: "salary-tc" }] }),
      makeReservation({ id: "r2", staff: [{ salary_id: "salary-dt", hours: 4 }] })
    ]
  });
  assert.equal(activityHasTechnicalDirector(act), true);
  assert.deepEqual(getTechnicalDirectorReservations(act).map((r: any) => r.id), ["r2"]);
});

test("activityHasTechnicalDirector is false when the technical-director row has no hours booked yet", () => {
  const act = makeActivity({
    reservations: [
      makeReservation({ id: "r1", staff: [{ salary_id: "salary-dt", hours: 0 }] }),
      makeReservation({ id: "r2", staff: [{ salary_id: "salary-dt" }] }) // hours omitted entirely
    ]
  });
  assert.equal(activityHasTechnicalDirector(act), false);
  assert.deepEqual(getTechnicalDirectorReservations(act), []);
});

test("buildReservationWindow uses install start and dismantle end when both are enabled", () => {
  const reservation = makeReservation({
    install: { enabled: true, date: "2026-08-01", start_time: "08:00", end_time: "09:00" },
    slots: [{ date: "2026-08-01", start_time: "10:00", end_time: "17:00" }],
    dismantle: { enabled: true, date: "2026-08-01", start_time: "17:00", end_time: "19:00" }
  });

  const window = buildReservationWindow(reservation)!;
  assert.equal(window.start, "20260801T080000");
  assert.equal(window.end, "20260801T190000");
  assert.match(window.description, /Installation/);
  assert.match(window.description, /Démontage/);
});

test("buildReservationWindow falls back to the earliest/latest slot when install/dismantle aren't enabled", () => {
  const reservation = makeReservation({
    slots: [
      { date: "2026-08-02", start_time: "09:00", end_time: "12:00" },
      { date: "2026-08-01", start_time: "13:00", end_time: "18:00" }
    ]
  });

  const window = buildReservationWindow(reservation)!;
  assert.equal(window.start, "20260801T130000");
  assert.equal(window.end, "20260802T120000");
});

test("buildReservationWindow returns null when there's nothing to anchor a date on", () => {
  const reservation = makeReservation({ slots: [] });
  assert.equal(buildReservationWindow(reservation), null);
});

test("buildTechnicalDirectorIcs produces a VCALENDAR with one VEVENT per technical-director reservation", () => {
  const act = makeActivity({
    reservations: [
      makeReservation({
        id: "r1",
        room_name: "Salle Polyvalente",
        slots: [{ date: "2026-09-01", start_time: "18:00", end_time: "22:00" }],
        staff: [{ salary_id: "salary-dt", hours: 4 }]
      }),
      makeReservation({ id: "r2", room_name: "Salle A", slots: [{ date: "2026-09-02" }], staff: [{ salary_id: "salary-tc" }] })
    ]
  });

  const ics = buildTechnicalDirectorIcs(act);
  assert.match(ics, /BEGIN:VCALENDAR/);
  assert.match(ics, /END:VCALENDAR/);
  const eventCount = (ics.match(/BEGIN:VEVENT/g) || []).length;
  assert.equal(eventCount, 1, "only the reservation with a technical director should produce an event");
  assert.match(ics, /SUMMARY:DT — Gala annuel \(Salle Polyvalente\)/);
  assert.match(ics, /DTSTART:20260901T180000/);
  assert.match(ics, /UID:act-1-r1-dt@outil-marie/);
});

test("buildTechnicalDirectorIcs escapes commas and semicolons in text fields", () => {
  const act = makeActivity({
    name: "Soirée; spéciale, 2026",
    reservations: [
      makeReservation({
        id: "r1",
        room_name: "Salle A",
        slots: [{ date: "2026-09-01", start_time: "18:00", end_time: "22:00" }],
        staff: [{ salary_id: "salary-dt", hours: 4 }]
      })
    ]
  });

  const ics = buildTechnicalDirectorIcs(act);
  assert.match(ics, /Soir\\;e spéciale\\, 2026|Soirée\\; spéciale\\, 2026/);
});

test("icsFileNameFor slugifies the activity name and strips accents", () => {
  assert.equal(icsFileNameFor(makeActivity({ name: "Été à Montréal !" })), "directeur-technique-ete-a-montreal.ics");
  assert.equal(icsFileNameFor(makeActivity({ name: "" })), "directeur-technique-activite.ics");
});

// --- sendActivityScheduleToTechnicalDirector orchestration -----------------------------------

test("sendActivityScheduleToTechnicalDirector shares the .ics file directly when the Web Share API supports files", async () => {
  const act = makeActivity({
    reservations: [
      makeReservation({
        id: "r1",
        staff: [{ salary_id: "salary-dt", hours: 4 }],
        slots: [{ date: "2026-09-01", start_time: "18:00", end_time: "22:00" }]
      })
    ]
  });

  const shared: { files: any } = { files: null };
  (navigator as any).canShare = () => true;
  (navigator as any).share = async (data: any) => {
    shared.files = data.files;
  };

  await sendActivityScheduleToTechnicalDirector(act);

  assert.ok(shared.files);
  assert.equal(shared.files[0].name, "directeur-technique-gala-annuel.ics");
});

test("sendActivityScheduleToTechnicalDirector falls back to download + mailto when sharing files isn't supported", async () => {
  const act = makeActivity({
    reservations: [
      makeReservation({
        id: "r1",
        staff: [{ salary_id: "salary-dt", hours: 4 }],
        slots: [{ date: "2026-09-01", start_time: "18:00", end_time: "22:00" }]
      })
    ]
  });

  (navigator as any).canShare = undefined;
  (navigator as any).share = undefined;
  (window as any).location = { href: "" };

  await sendActivityScheduleToTechnicalDirector(act);

  assert.match((window as any).location.href, /^mailto:/);
  assert.match(decodeURIComponent((window as any).location.href), /Plage horaire à réserver — Gala annuel/);
});

test("sendActivityScheduleToTechnicalDirector does nothing harmful when no reservation has valid dates", async () => {
  const act = makeActivity({
    reservations: [makeReservation({ id: "r1", staff: [{ salary_id: "salary-dt", hours: 4 }], slots: [] })]
  });
  (navigator as any).canShare = undefined;
  (navigator as any).share = undefined;

  await assert.doesNotReject(sendActivityScheduleToTechnicalDirector(act));
});
