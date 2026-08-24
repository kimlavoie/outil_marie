/**
 * BarHostTechFields.tsx - Services techniques / Service de bar / Autres services (host duties)
 * pill-toggle groups for one reservation card ("sous-tranche E" of the reservations React
 * conversion — see card.tsx's header comment and InstallDismantleFields.tsx/SlotsFields.tsx/
 * RoomTariffFields.tsx for sous-tranches B/C/D's version of the same pattern).
 *
 * Mounted as its own React root into a .reservation-bar-host-tech-mount placeholder left by
 * card.tsx's addReservationCard(), same reasoning as the other three: the rest of the card is
 * still legacy HTML built via insertAdjacentHTML.
 *
 * The pill-toggle groups themselves stay exactly what they always were — reservations/dom-helpers.ts's
 * initPillToggleEl()/initExclusivePillToggleEl() delegated click handlers toggling a plain "active"
 * class directly on the buttons — wired via refs in a mount effect instead of a flat sequence of
 * addEventListener calls, not reimplemented as React state (nothing else needs to know a pill's
 * state reactively; collectReservationsFromForm() reads the "active" class straight off the DOM,
 * same as before). Visibility toggles (bar details, hostess-count fields) are likewise still plain
 * style.display writes from those same callbacks. Picking "Projecteur"/toggling technical services
 * reaches into the still-legacy .room-staff-list/.room-services-list (sous-tranche F) via `card`,
 * exactly like the original code did.
 */
import { useEffect, useRef } from "react";
import { TECHNICAL_SERVICES, BAR_DRINK_TYPES, BAR_SERVICE_TYPES, HOST_DUTY_OPTIONS } from "../../state/state.ts";
import { initPillToggleEl, initExclusivePillToggleEl, setExclusivePillValueEl, setPillGroupActiveEl } from "../../utils/utils.ts";
import { updateSubmissionFinancialSummary, autoSaveActivityForm } from "../../activities/financials.ts";
import { autoAddTechnicalDirectorIfNeeded, autoAddProjectorIfNeeded, autoRemoveProjectorIfNeeded } from "../../activities/reservations/subrows.ts";

interface BarService {
  active?: boolean;
  drink_type?: string;
  service_type?: string;
  hostess_count?: number;
  special_order?: string;
}

interface HostDuties {
  duties?: string[];
  hostess_count?: number;
}

const HOSTESS_SERVICE_TYPES = ["Service d'hôtesses", "Distribution de breuvages et nettoyage de coupes"];

export function BarHostTechFields({ card, initialData }: { card: HTMLElement; initialData: any }) {
  const techGroupRef = useRef<HTMLDivElement>(null);
  const barToggleGroupRef = useRef<HTMLDivElement>(null);
  const barDetailsRef = useRef<HTMLDivElement>(null);
  const barDrinkGroupRef = useRef<HTMLDivElement>(null);
  const barServiceTypeGroupRef = useRef<HTMLDivElement>(null);
  const barHostessCountGroupRef = useRef<HTMLDivElement>(null);
  const barHostessCountInputRef = useRef<HTMLInputElement>(null);
  const barSpecialOrderRef = useRef<HTMLInputElement>(null);
  const hostDutiesGroupRef = useRef<HTMLDivElement>(null);
  const hostDutiesCountGroupRef = useRef<HTMLDivElement>(null);
  const hostDutiesCountInputRef = useRef<HTMLInputElement>(null);
  const wiredRef = useRef(false);

  useEffect(() => {
    if (wiredRef.current) return;
    wiredRef.current = true;

    initPillToggleEl(techGroupRef.current);
    techGroupRef.current?.addEventListener("click", e => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>(".pill-toggle");
      if (btn) {
        const isProjecteur = btn.dataset.value === "Projecteur";
        const isActive = btn.classList.contains("active");
        const staffList = card.querySelector<HTMLElement>(".room-staff-list");
        const servicesList = card.querySelector<HTMLElement>(".room-services-list");
        if (isActive) {
          if (staffList) autoAddTechnicalDirectorIfNeeded(staffList);
          if (isProjecteur && servicesList) {
            autoAddProjectorIfNeeded(servicesList);
          }
          updateSubmissionFinancialSummary();
        } else if (isProjecteur && servicesList) {
          autoRemoveProjectorIfNeeded(servicesList);
          updateSubmissionFinancialSummary();
        }
      }
      autoSaveActivityForm();
    });

    initPillToggleEl(barToggleGroupRef.current);
    barToggleGroupRef.current?.addEventListener("click", e => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>(".pill-toggle");
      if (!btn) return;
      const active = btn.classList.contains("active");
      if (barDetailsRef.current) barDetailsRef.current.style.display = active ? "block" : "none";
      if (!active) {
        setExclusivePillValueEl(barDrinkGroupRef.current, "");
        setExclusivePillValueEl(barServiceTypeGroupRef.current, "");
        if (barHostessCountGroupRef.current) barHostessCountGroupRef.current.style.display = "none";
        if (barSpecialOrderRef.current) barSpecialOrderRef.current.value = "";
      }
      autoSaveActivityForm();
    });
    initExclusivePillToggleEl(barDrinkGroupRef.current, () => {
      autoSaveActivityForm();
    });
    initExclusivePillToggleEl(barServiceTypeGroupRef.current, value => {
      if (barHostessCountGroupRef.current) {
        barHostessCountGroupRef.current.style.display = HOSTESS_SERVICE_TYPES.includes(value) ? "flex" : "none";
      }
      autoSaveActivityForm();
    });

    initPillToggleEl(hostDutiesGroupRef.current);
    hostDutiesGroupRef.current?.addEventListener("click", () => {
      const anyActive = (hostDutiesGroupRef.current?.querySelectorAll(".pill-toggle.active").length ?? 0) > 0;
      if (hostDutiesCountGroupRef.current) hostDutiesCountGroupRef.current.style.display = anyActive ? "flex" : "none";
      autoSaveActivityForm();
    });

    if (initialData) {
      setPillGroupActiveEl(techGroupRef.current, initialData.technical_services || []);

      const barService: BarService = initialData.bar_service || {};
      if (barService.active) {
        barToggleGroupRef.current?.querySelector<HTMLElement>(".pill-toggle")?.classList.add("active");
        if (barDetailsRef.current) barDetailsRef.current.style.display = "block";
      }
      setExclusivePillValueEl(barDrinkGroupRef.current, barService.drink_type || "");
      setExclusivePillValueEl(barServiceTypeGroupRef.current, barService.service_type || "");
      if (barHostessCountGroupRef.current) {
        barHostessCountGroupRef.current.style.display =
          barService.service_type && HOSTESS_SERVICE_TYPES.includes(barService.service_type) ? "flex" : "none";
      }
      if (barHostessCountInputRef.current) barHostessCountInputRef.current.value = String(barService.hostess_count || 1);
      if (barSpecialOrderRef.current) barSpecialOrderRef.current.value = barService.special_order || "";

      const hostDuties: HostDuties = initialData.host_duties || { duties: [], hostess_count: 0 };
      setPillGroupActiveEl(hostDutiesGroupRef.current, hostDuties.duties || []);
      if (hostDutiesCountGroupRef.current) {
        hostDutiesCountGroupRef.current.style.display = (hostDuties.duties || []).length > 0 ? "flex" : "none";
      }
      if (hostDutiesCountInputRef.current) hostDutiesCountInputRef.current.value = String(hostDuties.hostess_count || 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div className="form-group">
        <span className="field-label" id={`${card.id}-technical-services-label`}>
          Services techniques
        </span>
        <div ref={techGroupRef} className="pill-toggle-group room-technical-services-group" role="group" aria-labelledby={`${card.id}-technical-services-label`}>
          {TECHNICAL_SERVICES.map(s => (
            <button key={s} type="button" className="pill-toggle" data-value={s}>
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="form-group">
        <span className="field-label" id={`${card.id}-bar-toggle-label`}>
          Service de bar
        </span>
        <div ref={barToggleGroupRef} className="pill-toggle-group room-bar-toggle-group" role="group" aria-labelledby={`${card.id}-bar-toggle-label`}>
          <button type="button" className="pill-toggle" data-value="active">
            Activer le service de bar
          </button>
        </div>
      </div>
      <div ref={barDetailsRef} className="room-bar-details" style={{ display: "none" }}>
        <div className="form-group">
          <span className="field-label" id={`${card.id}-bar-drink-label`}>
            Type de boisson
          </span>
          <div
            ref={barDrinkGroupRef}
            className="pill-toggle-group room-bar-drink-group"
            role="group"
            aria-labelledby={`${card.id}-bar-drink-label`}
          >
            {BAR_DRINK_TYPES.map(s => (
              <button key={s} type="button" className="pill-toggle" data-value={s}>
                {s}
              </button>
            ))}
          </div>
        </div>
        <div className="form-group">
          <span className="field-label" id={`${card.id}-bar-service-type-label`}>
            Type de service
          </span>
          <div
            ref={barServiceTypeGroupRef}
            className="pill-toggle-group room-bar-service-type-group"
            role="group"
            aria-labelledby={`${card.id}-bar-service-type-label`}
          >
            {BAR_SERVICE_TYPES.map(s => (
              <button key={s} type="button" className="pill-toggle" data-value={s}>
                {s}
              </button>
            ))}
          </div>
        </div>
        <div ref={barHostessCountGroupRef} className="form-group room-bar-hostess-count-group" style={{ display: "none" }}>
          <label htmlFor={`${card.id}-room-bar-hostess-count`}>Nombre d'hôtesses</label>
          <input
            ref={barHostessCountInputRef}
            type="number"
            id={`${card.id}-room-bar-hostess-count`}
            className="form-input room-bar-hostess-count"
            min="1"
            step="1"
            defaultValue="1"
          />
        </div>
        <div className="form-group">
          <label htmlFor={`${card.id}-room-bar-special-order`}>Commande spéciale</label>
          <input
            ref={barSpecialOrderRef}
            type="text"
            id={`${card.id}-room-bar-special-order`}
            className="form-input room-bar-special-order"
            placeholder="Précisez la commande spéciale..."
          />
        </div>
      </div>

      <div className="form-group">
        <span className="field-label" id={`${card.id}-host-duties-label`}>
          Autres services
        </span>
        <div
          ref={hostDutiesGroupRef}
          className="pill-toggle-group room-host-duties-group"
          role="group"
          aria-labelledby={`${card.id}-host-duties-label`}
        >
          {HOST_DUTY_OPTIONS.map(s => (
            <button key={s} type="button" className="pill-toggle" data-value={s}>
              {s}
            </button>
          ))}
        </div>
      </div>
      <div ref={hostDutiesCountGroupRef} className="form-group room-host-duties-count-group" style={{ display: "none" }}>
        <label htmlFor={`${card.id}-room-host-duties-count`}>Nombre d'hôtesses</label>
        <input
          ref={hostDutiesCountInputRef}
          type="number"
          id={`${card.id}-room-host-duties-count`}
          className="form-input room-host-duties-count"
          min="1"
          step="1"
          defaultValue="1"
        />
      </div>
    </>
  );
}
