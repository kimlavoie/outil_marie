/**
 * StaffServicesFeesFields.tsx - Personnel requis / Équipements / Autres frais for one reservation
 * card ("sous-tranche F", the last of the reservations React conversion — see card.tsx's header
 * comment and InstallDismantleFields.tsx/SlotsFields.tsx/RoomTariffFields.tsx/BarHostTechFields.tsx
 * for sous-tranches B/C/D/E's version of the same pattern).
 *
 * Mounted as its own React root into a .reservation-staff-services-fees-mount placeholder left by
 * card.tsx's addReservationCard(), same reasoning as the other four: the rest of the card is
 * still legacy HTML built via insertAdjacentHTML.
 *
 * Unlike the other four roots, this one does NOT own its row lists as React state/reconciled
 * children — the .room-staff-list/.room-services-list/.room-fees-list containers below are
 * rendered once as empty, "opaque" divs (via refs) and never touched by React again.
 * reservations/subrows.ts's addStaffRow()/addServiceRow()/addFeeRow() still do raw
 * insertAdjacentHTML into them exactly as before, unchanged. That's deliberate: other React
 * roots on this same card reach into these same containers directly —
 * BarHostTechFields.tsx's technical-services toggle (autoAddProjectorIfNeeded/
 * autoRemoveProjectorIfNeeded) and RoomTariffFields.tsx's room select
 * (autoAddLinkedStaffAndFees) — and none of those roots know about this one's state. If React
 * reconciled these lists from state here, those cross-root DOM insertions would be invisible to
 * it and could get silently wiped out on this component's next re-render (the same class of bug
 * fixed in bulk-actions.ts earlier, see its comment there). Keeping the three lists
 * imperative-only, exactly like the original code, sidesteps that architectural conflict
 * entirely — this component only owns the section shell (headers, "+ Ajouter" buttons) and the
 * one-time initial population from `initialData`.
 */
import { useEffect, useRef } from "react";
import { addStaffRow, addServiceRow, addFeeRow } from "../../activities/reservations/subrows.ts";

export function StaffServicesFeesFields({ card, initialData }: { card: HTMLElement; initialData: any }) {
  const staffListRef = useRef<HTMLDivElement>(null);
  const servicesListRef = useRef<HTMLDivElement>(null);
  const feesListRef = useRef<HTMLDivElement>(null);
  const wiredRef = useRef(false);

  useEffect(() => {
    if (wiredRef.current) return;
    wiredRef.current = true;

    const staffList = staffListRef.current!;
    const servicesList = servicesListRef.current!;
    const feesList = feesListRef.current!;

    if (initialData) {
      (initialData.staff || []).forEach((s: any) =>
        addStaffRow(
          staffList,
          s.salary_id,
          s.date || "",
          s.hours,
          s.overtime_hours,
          s.auto_generated,
          s.custom_rate || 0,
          s.custom_overtime_rate || 0,
          s.tarif_id === "__custom__",
          s.start_time || "",
          s.end_time || ""
        )
      );
      (initialData.services || []).forEach((s: any) =>
        addServiceRow(servicesList, s.service_id, s.hours, s.tarif_id, s.auto_generated, s.custom_rate || 0)
      );
      (initialData.fees || []).forEach((f: any) => addFeeRow(feesList, f.description, f.amount, f.auto_generated));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div className="distribution-section">
        <div className="distribution-header">
          <span className="field-label">Personnel requis</span>
          <button
            type="button"
            className="btn btn-secondary room-add-staff-btn"
            style={{ padding: "6px 12px", fontSize: "0.8rem" }}
            onClick={() => addStaffRow(staffListRef.current!)}
          >
            + Ajouter
          </button>
        </div>
        <div
          className="distribution-column-labels"
          style={{
            display: "grid",
            gridTemplateColumns: "1.2fr 110px 95px 95px 75px 75px 1fr 50px 100px 38px",
            gap: 12,
            fontSize: "0.72rem",
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.02em",
            marginBottom: 4
          }}
        >
          <span>Emploi</span>
          <span style={{ textAlign: "center" }}>Date</span>
          <span style={{ textAlign: "center" }}>Début</span>
          <span style={{ textAlign: "center" }}>Fin</span>
          <span style={{ textAlign: "center" }}>Heures</span>
          <span style={{ textAlign: "center" }} title="Taux horaire configuré pour cet emploi">
            Salaire
          </span>
          <span>Sous-total</span>
          <span />
          <span style={{ textAlign: "right", paddingRight: 8 }}>Options</span>
          <span />
        </div>
        <div className="distribution-list room-staff-list" ref={staffListRef} />
      </div>

      <div className="distribution-section">
        <div className="distribution-header">
          <span className="field-label">Équipements</span>
          <button
            type="button"
            className="btn btn-secondary room-add-service-btn"
            style={{ padding: "6px 12px", fontSize: "0.8rem" }}
            onClick={() => addServiceRow(servicesListRef.current!)}
          >
            + Ajouter
          </button>
        </div>
        <div
          className="distribution-column-labels"
          style={{
            display: "grid",
            gridTemplateColumns: "1.4fr 1fr 0.8fr 0.6fr 1fr 50px 38px",
            gap: 12,
            fontSize: "0.72rem",
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.02em",
            marginBottom: 4
          }}
        >
          <span>Équipement</span>
          <span>Tarif</span>
          <span style={{ textAlign: "center" }}>Montant</span>
          <span style={{ textAlign: "center" }} title="Utilisé seulement pour les équipements facturés à l'heure">
            Heures
          </span>
          <span>Sous-total</span>
          <span />
          <span />
        </div>
        <div className="distribution-list room-services-list" ref={servicesListRef} />
      </div>

      <div className="distribution-section">
        <div className="distribution-header">
          <span className="field-label">Autres frais</span>
          <button
            type="button"
            className="btn btn-secondary room-add-fee-btn"
            style={{ padding: "6px 12px", fontSize: "0.8rem" }}
            onClick={() => addFeeRow(feesListRef.current!)}
          >
            + Ajouter
          </button>
        </div>
        <div className="distribution-list room-fees-list" ref={feesListRef} />
      </div>
    </>
  );
}
