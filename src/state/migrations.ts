import { calculateDaysCount, generateUid } from "../utils/utils.ts";
import { logWarn } from "../utils/logger.ts";
import { DEFAULT_CONFIG } from "./config-defaults.ts";
import { parseLocalDateStr, formatDateStrLocal } from "./date-helpers.ts";
import { getFlattenedRoomTarifs } from "./pricing.ts";

// Guards against a corrupted or partially-written database record crashing the whole app: list
// rendering, search and financial totals all assume every activity has these fields/arrays
// (e.g. act.name.toLowerCase(), act.distributions.some(...)) without their own fallback. Drops
// only entries that aren't recoverable objects (no id); everything else gets safe defaults.
export function sanitizeActivitiesList(rawActivities: any[]): any[] {
  if (!Array.isArray(rawActivities)) return [];
  return rawActivities
    .filter(act => act && typeof act === "object" && typeof act.id === "string" && act.id)
    .map(act => {
      if (typeof act.name !== "string") act.name = "";
      if (typeof act.responsable !== "string") act.responsable = "";
      if (typeof act.responsable_first_name !== "string") act.responsable_first_name = "";
      if (typeof act.responsable_last_name !== "string") act.responsable_last_name = "";
      if (!Array.isArray(act.distributions)) act.distributions = [];
      if (!Array.isArray(act.reservations)) act.reservations = [];
      act.distributions = act.distributions.filter((d: any) => d && typeof d === "object");
      act.reservations = act.reservations.filter((r: any) => r && typeof r === "object");
      return act;
    });
}

// Migrate legacy room config (price_internal/price_external) to a list of named tarifs per room,
// then migrate that flat tarifs[] list to a versioned pricing grid (paramètre x type de client),
// and ensure the linked_* configuration arrays exist.
export function migrateRoomsConfig(rooms: any[]) {
  (rooms || []).forEach(room => {
    if (!room.tarifs && !room.pricing_grids) {
      const tarifs = [{ id: generateUid("tarif"), description: "Interne", amount: room.price_internal || 0 }];
      if (room.price_external > 0) {
        tarifs.push({ id: generateUid("tarif"), description: "Externe", amount: room.price_external });
      }
      room.tarifs = tarifs;
      delete room.price_internal;
      delete room.price_external;
    }

    if (!room.pricing_grids) {
      const paramId = generateUid("param");
      const tarifs = room.tarifs || [];
      room.pricing_grids = [
        {
          id: generateUid("grid"),
          effective_date: "",
          parameters: [{ id: paramId, name: "Tarif" }],
          client_types: tarifs.map((t: any) => ({ id: t.id, name: t.description })),
          cells: tarifs.map((t: any) => ({ parameter_id: paramId, client_type_id: t.id, amount: t.amount }))
        }
      ];
    }
    delete room.tarifs;

    if (!room.linked_rooms) room.linked_rooms = [];
    if (!room.linked_staff) room.linked_staff = [];
    if (!room.linked_fees) room.linked_fees = [];
    if (!room.linked_tasks) room.linked_tasks = [];
  });
}

// Migrate salaries config to direct rate_versions history per job, discarding tarifs[]
// and their associated budget codes (which are now selected in the activity form directly).
export function migrateSalariesConfig(salaries: any[]) {
  (salaries || []).forEach(sal => {
    if (sal.tarifs) {
      const firstTarif = sal.tarifs[0];
      sal.rate_versions = firstTarif ? firstTarif.rate_versions : [];
      delete sal.tarifs;
    }
    if (!sal.rate_versions) {
      sal.rate_versions = [{ id: generateUid("rv"), effective_date: "", rate: sal.rate || 0 }];
      delete sal.rate;
      delete sal.gl_account_code;
    }
    sal.rate_versions.forEach((v: any) => {
      if (v.overtime_rate === undefined) v.overtime_rate = 0;
    });
  });
}

// Adds the hardcoded technical service fees (location de projecteur, piano à queue, projecteur /
// équipement informatique) to existing databases that predate them, matched by id so it never
// duplicates or overwrites amounts the user has already customized.
export function migrateServicesConfig(services: any[]) {
  DEFAULT_CONFIG.services.forEach(defaultSvc => {
    if (!services.some(s => s.id === defaultSvc.id)) {
      services.push(JSON.parse(JSON.stringify(defaultSvc)));
    }
  });

  // Legacy: a service used to carry a single gl_account_code. That became a list of named
  // billing_accounts (one per client type) with a single rate_versions history shared by all of
  // them. Both are now merged into tarifs[]: each tarif carries its own budget account AND its
  // own rate history, so different client types can also have different price histories.
  services.forEach(svc => {
    if (!svc.tarifs) {
      if (svc.billing_accounts === undefined) {
        svc.billing_accounts = svc.gl_account_code ? [{ id: generateUid("billing"), label: "", gl_account_code: svc.gl_account_code }] : [];
      }
      const accounts =
        svc.billing_accounts.length > 0 ? svc.billing_accounts : [{ id: generateUid("billing"), label: "", gl_account_code: "" }];
      svc.tarifs = accounts.map((a: any) => ({
        id: a.id,
        label: a.label || "",
        gl_account_code: a.gl_account_code || "",
        rate_versions: JSON.parse(JSON.stringify(svc.rate_versions || []))
      }));
      delete svc.gl_account_code;
      delete svc.billing_accounts;
      delete svc.rate_versions;
    }
  });
}

// Migrate legacy activity records to the current data shape (room_name -> rooms, new fields)
export function migrateActivities(activities: any[], settings: { rooms: any[]; services: any[]; salaries?: any[] }) {
  activities.forEach(act => {
    if (act.room_name !== undefined) {
      if (!act.rooms) act.rooms = act.room_name ? [act.room_name] : [];
      delete act.room_name;
    }
    if (!act.rooms) act.rooms = [];
    if (act.attendees_count === undefined) act.attendees_count = 0;
    if (act.install_date === undefined) act.install_date = "";
    if (act.install_time === undefined) act.install_time = "";
    if (act.dismantle_date === undefined) act.dismantle_date = "";
    if (act.dismantle_time === undefined) act.dismantle_time = "";
    if (act.start_time === undefined) act.start_time = "";
    if (act.end_time === undefined) act.end_time = "";

    // Legacy: rooms used to be a flat array of room name strings, with a single
    // shared install/dismantle/start/end schedule for the whole activity. Each
    // room now carries its own schedule and a snapshotted tariff.
    if (act.rooms.length > 0 && typeof act.rooms[0] === "string") {
      act.rooms = act.rooms.map((name: string) => {
        const roomConfig = (settings.rooms || []).find(r => r.name === name);
        const wantedTariffDesc = act.client_type === "interne" ? "Interne" : "Externe";
        const flatTarifs = roomConfig ? getFlattenedRoomTarifs(roomConfig, act.date_start) : [];
        const matchedTariff = flatTarifs.length ? flatTarifs.find(t => t.description === wantedTariffDesc) || flatTarifs[0] : null;
        if (!matchedTariff) {
          logWarn("state", "migration rooms->reservations : aucun tarif trouvé, montant remis à 0", {
            activityId: act.id,
            roomName: name,
            roomFound: !!roomConfig,
            date_start: act.date_start
          });
        }
        return {
          name,
          tariff_id: matchedTariff ? matchedTariff.id : "",
          tariff_description: matchedTariff ? matchedTariff.description : "",
          tariff_amount: matchedTariff ? matchedTariff.amount : 0,
          install_date: act.install_date || "",
          install_time: act.install_time || "",
          dismantle_date: act.dismantle_date || "",
          dismantle_time: act.dismantle_time || "",
          date_start: act.date_start || "",
          start_time: act.start_time || "",
          date_end: act.date_end || "",
          end_time: act.end_time || ""
        };
      });
    }
    delete act.install_date;
    delete act.install_time;
    delete act.dismantle_date;
    delete act.dismantle_time;
    delete act.start_time;
    delete act.end_time;

    // Legacy: "Services techniques", "Consommation" et "Service d'hôtes.ses" used to be a
    // single set of fields shared by the whole activity. An activity can book several rooms
    // with different technical/bar/hostess needs, so these now live per room instead. Any
    // pre-existing activity-level values (including the older flat consumption/host_services
    // pill lists) are folded into a single legacy bar_service/host_duties shape here, then
    // broadcast onto every already-booked room before being dropped from the activity itself.
    let legacyBarService = act.bar_service;
    if (!legacyBarService) {
      legacyBarService = {
        active: false,
        drink_type: "",
        service_type: "",
        hostess_count: 0,
        special_order: act.consumption_special_products || ""
      };
      if (Array.isArray(act.consumption) && act.consumption.length > 0) {
        legacyBarService.active = true;
        if (act.consumption.some((c: string) => c.includes("avec alcool"))) legacyBarService.drink_type = "Avec alcool";
        else if (act.consumption.some((c: string) => c.includes("sans alcool"))) legacyBarService.drink_type = "Sans alcool";
      }
      if (Array.isArray(act.host_services) && act.host_services.includes("Service de bar payant")) {
        legacyBarService.active = true;
        legacyBarService.service_type = "Service d'hôtesses";
      } else if (legacyBarService.active) {
        legacyBarService.service_type = "Service autonome";
      }
    }
    let legacyHostDuties = act.host_duties;
    if (!legacyHostDuties) {
      legacyHostDuties = { duties: [], hostess_count: 0 };
      if (Array.isArray(act.host_services)) {
        if (act.host_services.some((h: any) => h.startsWith("Distribution de breuvages"))) {
          legacyHostDuties.duties.push("Distribution de breuvages et nettoyage de coupes");
        }
        if (act.host_services.includes("Distribution de bouchées")) {
          legacyHostDuties.duties.push("Distribution de bouchées");
        }
      }
    }
    const legacyTechnicalServices = act.technical_services || [];

    // Legacy: "Personnel requis", "Services" et "Autres frais" were also shared by the whole
    // activity (each row tagged with a source_room only when auto-added from a room's linked
    // config). They now live per room too. Rows with a source_room matching a still-booked room
    // go there; anything else (manually added rows never carried a source_room) has no reliable
    // room to attribute to, so it's attached to the activity's first room.
    const legacyStaff = act.staff || [];
    const legacyServices = act.services || [];
    const legacyFees = act.fees || [];

    (act.rooms || []).forEach((r: any, idx: number) => {
      if (r.tariff_gl_account_code === undefined) r.tariff_gl_account_code = "";
      if (!r.technical_services) r.technical_services = [...legacyTechnicalServices];
      if (!r.bar_service) r.bar_service = JSON.parse(JSON.stringify(legacyBarService));
      if (!r.host_duties) r.host_duties = JSON.parse(JSON.stringify(legacyHostDuties));
      if (!r.staff) {
        r.staff = legacyStaff
          .filter((s: any) => s.source_room === r.name || (!s.source_room && idx === 0))
          .map((s: any) => {
            const c = { ...s };
            delete c.source_room;
            return c;
          });
      }
      if (!r.services) {
        r.services = legacyServices
          .filter((s: any) => s.source_room === r.name || (!s.source_room && idx === 0))
          .map((s: any) => {
            const c = { ...s };
            delete c.source_room;
            return c;
          });
      }
      if (!r.fees) {
        r.fees = legacyFees
          .filter((f: any) => f.source_room === r.name || (!f.source_room && idx === 0))
          .map((f: any) => {
            const c = { ...f };
            delete c.source_room;
            return c;
          });
      }
    });

    delete act.technical_services;
    delete act.bar_service;
    delete act.host_duties;
    delete act.consumption;
    delete act.consumption_special_products;
    delete act.host_services;
    delete act.staff;
    delete act.services;
    delete act.fees;
    delete act.remi_hours;

    if (act.description === undefined) act.description = "";
    if (act.coba === undefined) act.coba = "";

    // Legacy: "responsable" (billing responsable) was a single free-text name field, now split
    // into first/last name. Best-effort split on the first space so existing data isn't lost.
    if (act.responsable_first_name === undefined || act.responsable_last_name === undefined) {
      const legacyName = (act.responsable || "").trim();
      const spaceIdx = legacyName.indexOf(" ");
      act.responsable_first_name = spaceIdx === -1 ? legacyName : legacyName.slice(0, spaceIdx);
      act.responsable_last_name = spaceIdx === -1 ? "" : legacyName.slice(spaceIdx + 1);
    }

    if (!act.activity_manager) {
      act.activity_manager = {
        first_name: "",
        last_name: "",
        type: "employe",
        phone: "",
        email: "",
        company_name: "",
        coba_client_number: "",
        address: "",
        city: "",
        province: "",
        postal_code: ""
      };
    }
    if (act.activity_manager.company_name === undefined) act.activity_manager.company_name = "";
    if (act.activity_manager.coba_client_number === undefined) act.activity_manager.coba_client_number = "";
    if (act.activity_manager.address === undefined) act.activity_manager.address = "";
    if (act.activity_manager.city === undefined) act.activity_manager.city = "";
    if (act.activity_manager.province === undefined) act.activity_manager.province = "";
    if (act.activity_manager.postal_code === undefined) act.activity_manager.postal_code = "";

    if (act.event_type === undefined) act.event_type = "";
    if (act.event_type_other === undefined) act.event_type_other = "";

    // Legacy: reference was a single field on the activity. Move it onto each
    // distribution (per-account reference) since it is now defined per compte.
    if (act.reference !== undefined) {
      (act.distributions || []).forEach((d: any) => {
        if (d.reference === undefined) d.reference = act.reference;
      });
      delete act.reference;
    }
    (act.distributions || []).forEach((d: any) => {
      if (d.reference === undefined) d.reference = "";
      if (d.details === undefined) d.details = "";
    });

    // Activity lifecycle fields (state, client identification, planning tasks, submission/contract
    // file links, staff/fees for the cost calculation, billing dates)
    if (act.state === undefined) act.state = "brouillon";
    // Legacy activities predate the Estimation/Soumission mode toggle and already carry full
    // submission data, so they default to "soumission" rather than the lighter estimation mode.
    if (act.mode === undefined) act.mode = "soumission";
    delete act.client;
    (act.rooms || []).forEach((r: any) => {
      (r.staff || []).forEach((s: any) => {
        if (s.overtime_hours === undefined) s.overtime_hours = 0;
      });
    });
    if (!act.submission) act.submission = { file_link_id: "", generated_at: "", sent_at: "" };
    if (!act.contract) act.contract = { file_link_id: "", approved_at: "" };
    if (!act.form) act.form = { file_link_id: "", linked_at: "" };
    if (!act.supporting_docs) act.supporting_docs = { folder_link_id: "", linked_at: "" };
    if (!act.planning_tasks) act.planning_tasks = [];
    if (act.billed_at === undefined) act.billed_at = "";
    if (act.completed_at === undefined) act.completed_at = "";
    if (act.notes === undefined) act.notes = "";

    // Legacy: a booked room used to carry a single continuous date_start -> date_end
    // event span plus a single optional install/dismantle pair. A room can now be
    // booked several times (different services) with several non-contiguous slots,
    // so rooms[] becomes reservations[], with one slot generated per day of the old
    // span (same start_time/end_time on each) to keep the tariff total (days x tariff)
    // identical after migration.
    if (!act.reservations) {
      act.reservations = (act.rooms || []).map((r: any) => {
        const slots: any[] = [];
        if (r.date_start) {
          let dayCount = calculateDaysCount(r.date_start, r.date_end || r.date_start);
          // A reversed legacy date_start/date_end (corrupted historical data) yields 0 here —
          // generating 0 slots would silently drop the room's booking entirely during a migration
          // the user can't retry. Keep at least the start date so the booking survives, and log
          // the anomaly so it can be tracked down instead of disappearing unnoticed.
          if (dayCount === 0) {
            logWarn("state", "migration rooms->reservations : plage de dates inversée", {
              activityId: act.id,
              roomName: r.name,
              date_start: r.date_start,
              date_end: r.date_end
            });
            dayCount = 1;
          }
          const start = parseLocalDateStr(r.date_start);
          for (let i = 0; i < dayCount; i++) {
            const d = new Date(start);
            d.setDate(d.getDate() + i);
            slots.push({
              id: generateUid("slot"),
              date: formatDateStrLocal(d),
              start_time: r.start_time || "",
              end_time: r.end_time || ""
            });
          }
        }
        return {
          id: generateUid("res"),
          room_name: r.name,
          room_other_details: "",
          tariff_id: r.tariff_id || "",
          tariff_description: r.tariff_description || "",
          tariff_amount: r.tariff_amount || 0,
          tariff_gl_account_code: r.tariff_gl_account_code || "",
          install: { enabled: !!r.install_date, date: r.install_date || "", start_time: r.install_time || "", end_time: "" },
          dismantle: { enabled: !!r.dismantle_date, date: r.dismantle_date || "", start_time: r.dismantle_time || "", end_time: "" },
          slots,
          technical_services: r.technical_services || [],
          bar_service: r.bar_service || { active: false, drink_type: "", service_type: "", hostess_count: 0, special_order: "" },
          host_duties: r.host_duties || { duties: [], hostess_count: 0 },
          staff: r.staff || [],
          services: r.services || [],
          fees: r.fees || []
        };
      });
      delete act.rooms;
    }

    // Legacy: montage/démontage briefly had a full début/fin date range (two dates), and before
    // that a single moment (one date + one heure, field named `time`). Both collapse to a single
    // date with a start/end heure: the range's start_date becomes the date (end_date is dropped,
    // now meaningless), and the single moment's `time` becomes start_time with an empty end_time.
    (act.reservations || []).forEach((r: any) => {
      if (r.install) {
        if (r.install.start_date !== undefined) {
          r.install = {
            enabled: r.install.enabled,
            date: r.install.start_date || "",
            start_time: r.install.start_time || "",
            end_time: r.install.end_time || ""
          };
        } else if (r.install.time !== undefined) {
          r.install = { enabled: r.install.enabled, date: r.install.date || "", start_time: r.install.time || "", end_time: "" };
        }
      }
      if (r.dismantle) {
        if (r.dismantle.start_date !== undefined) {
          r.dismantle = {
            enabled: r.dismantle.enabled,
            date: r.dismantle.start_date || "",
            start_time: r.dismantle.start_time || "",
            end_time: r.dismantle.end_time || ""
          };
        } else if (r.dismantle.time !== undefined) {
          r.dismantle = { enabled: r.dismantle.enabled, date: r.dismantle.date || "", start_time: r.dismantle.time || "", end_time: "" };
        }
      }

      // Legacy: a reservation's service line used to carry the gl_account_code chosen directly
      // from the service's billing_accounts list. Since that list is now services[].tarifs (each
      // tarif owning both an account and its own rate history), the line now points at a tarif_id
      // instead; matched by gl_account_code against the service's already-migrated tarifs.
      (r.services || []).forEach((s: any) => {
        if (s.gl_account_code !== undefined) {
          const service = (settings.services || []).find((sv: any) => sv.id === s.service_id);
          const tarif = service && (service.tarifs || []).find((t: any) => t.gl_account_code === s.gl_account_code);
          s.tarif_id = tarif ? tarif.id : "";
          delete s.gl_account_code;
        }
      });

      // Migrate staff rows: ensure overtime_hours is defined and copy gl_account_code from tarif if missing
      (r.staff || []).forEach((s: any) => {
        if (s.overtime_hours === undefined) s.overtime_hours = 0;
        if (s.gl_account_code === undefined) {
          if (s.tarif_id === "__custom__") {
            s.gl_account_code = s.custom_gl_account_code || "";
          } else {
            const salary = (settings.salaries || []).find((sal: any) => sal.id === s.salary_id);
            const tarifs = (salary && salary.tarifs) || [];
            const tarif = tarifs.find((t: any) => t.id === s.tarif_id) || tarifs[0];
            s.gl_account_code = tarif ? tarif.gl_account_code : "";
          }
        }
      });
    });
  });
}
