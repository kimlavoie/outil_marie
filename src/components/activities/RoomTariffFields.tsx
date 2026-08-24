/**
 * RoomTariffFields.tsx - Room selection (searchable combobox) + tariff (parameter/client-type
 * resolved against the room's pricing grid, or a custom amount) for one reservation card
 * ("sous-tranche D" of the reservations React conversion — see card.tsx's header comment and
 * InstallDismantleFields.tsx/SlotsFields.tsx for sous-tranches B/C's version of the same pattern).
 *
 * Mounted as its own React root into a .reservation-room-tariff-mount placeholder left by
 * card.tsx's addReservationCard(), same reasoning as the other two: the rest of the card is still
 * legacy HTML built via insertAdjacentHTML.
 *
 * This is the most data-dependent of the three: the tariff parameter/client-type <option> lists
 * come from the room's active pricing grid (reservations/tariff.ts's buildTariffParameterOptionsHtml/
 * buildTariffClientTypeOptionsHtml — pricing-grid resolution logic left untouched and reused as-is,
 * not reimplemented here), and picking a room can auto-add linked staff/fees into the *other*,
 * still-legacy parts of this same card (reservations/subrows.ts's autoAddLinkedStaffAndFees) — so
 * the parameter/client-type <select>s and the searchable room combobox stay uncontrolled, wired
 * imperatively via refs exactly like the original code did, just from React's lifecycle instead of
 * a flat sequence of addEventListener calls. React here owns visibility toggles (Autre room details,
 * custom vs. grid-resolved tariff) and the mount/rebuild sequencing, not the pricing math itself.
 */
import { useEffect, useRef, useState } from "react";
import { escapeHtml, OTHER_ROOM_VALUE, buildSearchableSelectHtml, initSearchableSelectEl, rejectNegativeAmountOnBlur } from "../../utils/utils.ts";
import { updateSubmissionFinancialSummary, autoSaveActivityForm } from "../../activities/financials.ts";
import { updateFormDatesHelper } from "../../activities/history/index.ts";
import { autoAddLinkedStaffAndFees } from "../../activities/reservations/subrows.ts";
import { buildTariffClientTypeOptionsHtml, updateResolvedPriceDisplay, refreshReservationTariffSelect } from "../../activities/reservations/tariff.ts";
import { buildRoomSelectItems } from "../../activities/reservations/card.tsx";

export function RoomTariffFields({
  card,
  initialData,
  onRemoveCard
}: {
  card: HTMLElement;
  initialData: any;
  onRemoveCard: () => void;
}) {
  const roomName = initialData ? initialData.room_name : "";
  const isOther = roomName === OTHER_ROOM_VALUE;
  const isCustomTariffInitial = !!(initialData && !initialData.tariff_id && (initialData.tariff_description || initialData.tariff_amount));

  const [otherGroupVisible, setOtherGroupVisible] = useState(isOther);
  const [ctGroupVisible, setCtGroupVisible] = useState(!isCustomTariffInitial);
  const [customGroupVisible, setCustomGroupVisible] = useState(isCustomTariffInitial);

  const roomSelectRef = useRef<HTMLDivElement>(null);
  const paramSelectRef = useRef<HTMLSelectElement>(null);
  const ctSelectRef = useRef<HTMLSelectElement>(null);
  const customAmountRef = useRef<HTMLInputElement>(null);
  const hasAutoAddedLinkedRef = useRef(!!initialData);
  const wiredRef = useRef(false);

  useEffect(() => {
    if (wiredRef.current) return;
    wiredRef.current = true;

    // card.dataset.storedTariffId/storedTariffAmount are set by addReservationCard() itself
    // (card.tsx), before this root even mounts.

    initSearchableSelectEl(
      roomSelectRef.current,
      buildRoomSelectItems(),
      value => {
        setOtherGroupVisible(value === OTHER_ROOM_VALUE);
        refreshReservationTariffSelect(card, value);
        if (!hasAutoAddedLinkedRef.current && value && value !== OTHER_ROOM_VALUE) {
          hasAutoAddedLinkedRef.current = true;
          autoAddLinkedStaffAndFees(card, value);
        }
        updateFormDatesHelper();
        updateSubmissionFinancialSummary();
        autoSaveActivityForm();
      },
      roomName
    );

    const selectedTariffId = isCustomTariffInitial ? "__custom__" : initialData ? initialData.tariff_id : "";
    refreshReservationTariffSelect(card, roomName, selectedTariffId);

    paramSelectRef.current!.addEventListener("change", () => {
      const isCustom = paramSelectRef.current!.value === "__custom__";
      setCtGroupVisible(!isCustom);
      setCustomGroupVisible(isCustom);
      if (isCustom) {
        ctSelectRef.current!.value = "";
      } else {
        const roomVal = card.querySelector<HTMLInputElement>(".searchable-select-value")!.value;
        const currentCtVal = ctSelectRef.current!.value;
        ctSelectRef.current!.innerHTML = `
          <option value="">Sélectionner...</option>
          ${buildTariffClientTypeOptionsHtml(roomVal, "", currentCtVal, paramSelectRef.current!.value)}
        `;
        ctSelectRef.current!.value = currentCtVal;
      }
      updateResolvedPriceDisplay(card);
      updateSubmissionFinancialSummary();
      autoSaveActivityForm();
    });

    ctSelectRef.current!.addEventListener("change", () => {
      updateResolvedPriceDisplay(card);
      updateSubmissionFinancialSummary();
      autoSaveActivityForm();
    });

    if (customAmountRef.current) rejectNegativeAmountOnBlur(customAmountRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div className="reservation-card-header">
        <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
          <label htmlFor={`${card.id}-room-search-input`}>Salle</label>
          <div
            ref={roomSelectRef}
            className="room-select-group searchable-select-wrapper"
            style={{ position: "relative" }}
            dangerouslySetInnerHTML={{
              __html: buildSearchableSelectHtml("", "room-search-input", "Rechercher une salle...", `${card.id}-room-search-input`)
            }}
          />
        </div>
        <button type="button" className="btn-icon remove-reservation-btn" title="Retirer cette réservation" onClick={onRemoveCard}>
          <svg viewBox="0 0 24 24" style={{ width: 16, height: 16 }}>
            <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
          </svg>
        </button>
      </div>

      <div className="form-group room-other-details-group" style={{ display: otherGroupVisible ? "flex" : "none" }}>
        <label htmlFor={`${card.id}-room-other-details`}>Détails de la salle</label>
        <input
          type="text"
          id={`${card.id}-room-other-details`}
          className="form-input room-other-details-input"
          placeholder="Précisez la salle utilisée..."
          defaultValue={initialData && initialData.room_other_details ? escapeHtml(initialData.room_other_details) : ""}
        />
      </div>

      <div className="form-group-row room-tariff-fields-row" style={{ display: "flex", gap: 12, marginBottom: 12 }}>
        <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
          <label htmlFor={`${card.id}-room-tariff-parameter`}>
            Tarif - Paramètre{" "}
            <span
              className="help-tooltip-trigger"
              title="La grille tarifaire de cette salle (configurée dans Paramètres → Salles) peut avoir plusieurs versions selon la date ou la situation. Ce choix détermine laquelle s'applique ici."
            >
              ?
            </span>
          </label>
          <select
            ref={paramSelectRef}
            id={`${card.id}-room-tariff-parameter`}
            className="select-input room-tariff-parameter"
            style={{ padding: "10px 14px", width: "100%" }}
            defaultValue=""
          >
            <option value="">Sélectionner...</option>
          </select>
        </div>
        <div
          className="form-group room-tariff-client-type-group"
          style={{ flex: 1, marginBottom: 0, display: ctGroupVisible ? "flex" : "none", flexDirection: "column" }}
        >
          <label htmlFor={`${card.id}-room-tariff-client-type`}>
            Tarif - Type de client{" "}
            <span
              className="help-tooltip-trigger"
              title="Interne ou externe : le tarif facturé (et le compte budgétaire utilisé) peut différer selon le type de client sélectionné dans « Responsable de la facturation »."
            >
              ?
            </span>
          </label>
          <select
            ref={ctSelectRef}
            id={`${card.id}-room-tariff-client-type`}
            className="select-input room-tariff-client-type"
            style={{ padding: "10px 14px", width: "100%" }}
            defaultValue=""
          >
            <option value="">Sélectionner...</option>
          </select>
        </div>
      </div>

      <div
        className="room-tariff-resolved-price-display"
        style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: -6, marginBottom: 12, display: "none" }}
      >
        Tarif résolu : <strong className="resolved-price-val">0,00 $</strong> <span className="resolved-price-unit">/ jour</span>
      </div>
      <div
        className="room-tariff-stale-warning"
        style={{ fontSize: "0.85rem", color: "var(--warning-text)", marginTop: -6, marginBottom: 12, display: "none" }}
      />

      <div
        className="form-group-row room-tariff-custom-group"
        style={{ display: customGroupVisible ? "flex" : "none", gap: 12, marginBottom: 12 }}
      >
        <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
          <label htmlFor={`${card.id}-room-tariff-custom-desc`}>Description du tarif</label>
          <input
            type="text"
            id={`${card.id}-room-tariff-custom-desc`}
            className="form-input room-tariff-custom-desc"
            placeholder="Ex: Rabais ponctuel"
            defaultValue={isCustomTariffInitial ? escapeHtml(initialData.tariff_description || "") : ""}
          />
        </div>
        <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
          <label htmlFor={`${card.id}-room-tariff-custom-amount`} className="room-tariff-custom-amount-label">
            Montant ($ par jour)
          </label>
          <input
            ref={customAmountRef}
            type="number"
            id={`${card.id}-room-tariff-custom-amount`}
            className="form-input room-tariff-custom-amount"
            min="0"
            step="0.01"
            defaultValue={isCustomTariffInitial ? initialData.tariff_amount : ""}
          />
        </div>
      </div>
    </>
  );
}
