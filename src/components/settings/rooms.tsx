import { useState, useEffect } from "react";
import { appState, saveDatabaseOrRollback, getFlattenedRoomTarifs } from "../../state/state.ts";
import { generateUid, formatCurrency, getRoomColor, FALLBACK_ROOM_COLORS, showToast } from "../../utils/utils.ts";
import { populateDropdowns } from "../../navigation.ts";
import { DeleteIcon, Modal } from "./common.tsx";
import { PricingGridEditor, type PricingGrid } from "./pricing-grid-editor.tsx";
import {
  LinkedRoomsSection,
  LinkedStaffSection,
  LinkedFeesSection,
  LinkedTasksSection,
  type LinkedStaffRow,
  type LinkedFeeRow,
  type LinkedTaskRow
} from "./linked-sections.tsx";

export function RoomsPanel({ active, openModal, bump }: { active: boolean; openModal: (name: string | null) => void; bump: () => void }) {
  const deleteRoom = (name: string) => {
    if (!confirm(`Voulez-vous vraiment supprimer la salle ${name} ?`)) return;
    const prevRooms = appState.settings.rooms;
    const prevLinkedRooms = appState.settings.rooms.map((r: { linked_rooms?: string[] }) => ({ r, linked_rooms: r.linked_rooms }));
    appState.settings.rooms = appState.settings.rooms.filter((r: { name: string }) => r.name !== name);
    appState.settings.rooms.forEach((r: { linked_rooms?: string[] }) => {
      r.linked_rooms = (r.linked_rooms || []).filter((n: string) => n !== name);
    });
    saveDatabaseOrRollback(() => {
      appState.settings.rooms = prevRooms;
      prevLinkedRooms.forEach(({ r, linked_rooms }) => {
        r.linked_rooms = linked_rooms;
      });
    }, "La suppression n'a pas été enregistrée. Réessayez.").then(() => {
      populateDropdowns();
      bump();
    });
  };

  return (
    <div id="panel-rooms" className={`settings-panel${active ? " active" : ""}`}>
      <div className="settings-panel-header">
        <h3 className="settings-panel-title">Gestion des Salles</h3>
        <button
          className="btn btn-primary btn-secondary"
          style={{ padding: "6px 12px", fontSize: "0.8rem" }}
          onClick={() => openModal(null)}
        >
          + Ajouter une salle
        </button>
      </div>
      <div className="settings-list">
        {appState.settings.rooms.map((r: { name: string; abbreviation?: string; pricing_grids?: unknown[]; rate_type?: string; setup_fee?: number }) => {
          const tarifs = getFlattenedRoomTarifs(r, "");
          const unit = r.rate_type === "hourly" ? "h" : "jour";
          const setupDesc = r.setup_fee ? ` · Montage/démontage: ${formatCurrency(r.setup_fee)}` : "";
          const tarifsDesc = tarifs.length
            ? tarifs
                .map((t: { description: string; amount: number }) => `${t.description}: ${formatCurrency(t.amount)}/${unit}`)
                .join(" · ") + setupDesc
            : "Aucun tarif défini" + setupDesc;
          const versionCount = (r.pricing_grids || []).length;
          const versionNote = versionCount > 1 ? ` (${versionCount} versions)` : "";
          return (
            <div key={r.name} className="settings-list-item" onClick={() => openModal(r.name)}>
              <div className="settings-list-item-info">
                <span className="room-color-swatch" style={{ backgroundColor: getRoomColor(r.name) }} title="Couleur de la salle" />
                <span className="settings-list-item-code">
                  {r.name}
                  {r.abbreviation ? ` (${r.abbreviation})` : ""}
                </span>
                <span className="settings-list-item-desc">
                  {tarifsDesc}
                  {versionNote}
                </span>
              </div>
              <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                <button className="btn-icon" title="Supprimer" style={{ color: "var(--danger)" }} onClick={() => deleteRoom(r.name)}>
                  <DeleteIcon />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function RoomModal({ name, onClose, bump }: { name: string | null | undefined; onClose: () => void; bump: () => void }) {
  const isOpen = name !== undefined;
  const originalName = name || "";

  const [roomName, setRoomName] = useState("");
  const [abbreviation, setAbbreviation] = useState("");
  const [color, setColor] = useState("#4f46e5");
  const [rateType, setRateType] = useState<"daily" | "hourly">("daily");
  const [setupFee, setSetupFee] = useState<string>("0");
  const [grids, setGrids] = useState<PricingGrid[]>([]);
  const [activeGridIndex, setActiveGridIndex] = useState(0);
  const [linkedRooms, setLinkedRooms] = useState<string[]>([]);
  const [linkedStaff, setLinkedStaff] = useState<LinkedStaffRow[]>([]);
  const [linkedFees, setLinkedFees] = useState<LinkedFeeRow[]>([]);
  const [linkedTasks, setLinkedTasks] = useState<LinkedTaskRow[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    const room = originalName ? appState.settings.rooms.find((r: { name: string; setup_fee?: number }) => r.name === originalName) : null;

    setRoomName(room ? room.name : "");
    setAbbreviation((room && room.abbreviation) || "");
    setColor(room ? getRoomColor(room.name) : FALLBACK_ROOM_COLORS[appState.settings.rooms.length % FALLBACK_ROOM_COLORS.length]);
    setRateType(room && room.rate_type === "hourly" ? "hourly" : "daily");
    setSetupFee(room && room.setup_fee !== undefined ? String(room.setup_fee) : "0");

    let initialGrids: PricingGrid[] = room ? JSON.parse(JSON.stringify(room.pricing_grids || [])) : [];
    if (initialGrids.length === 0) {
      initialGrids = [{ id: generateUid("grid"), effective_date: "", parameters: [], client_types: [], cells: [] }];
    }
    setGrids(initialGrids);
    setActiveGridIndex(initialGrids.length - 1);

    setLinkedRooms((room && room.linked_rooms) || []);
    setLinkedStaff(
      ((room && room.linked_staff) || []).map((s: { salary_id: string; count: number }) => ({
        key: generateUid("linked-staff-row"),
        salaryId: s.salary_id,
        count: String(s.count)
      }))
    );
    setLinkedFees(
      ((room && room.linked_fees) || []).map((f: { description: string; amount: number }) => ({
        key: generateUid("linked-fee-row"),
        desc: f.description,
        amount: String(f.amount)
      }))
    );
    setLinkedTasks(
      ((room && room.linked_tasks) || []).map((t: { description: string }) => ({
        key: generateUid("linked-task-row"),
        desc: t.description
      }))
    );
  }, [isOpen, originalName]);

  const toggleLinkedRoom = (roomName: string) => {
    setLinkedRooms(prev => (prev.includes(roomName) ? prev.filter(n => n !== roomName) : [...prev, roomName]));
  };

  const submit = () => {
    const newName = roomName.trim().toUpperCase();
    if (!newName) {
      showToast("Le nom de la salle est obligatoire.", "warning");
      return;
    }

    let gridErrorMsg = "";
    grids.forEach(g => {
      const dateStr = (g.effective_date || "").trim();
      if (g.parameters.length === 0 || g.client_types.length === 0) {
        gridErrorMsg = "Chaque version de la grille tarifaire doit avoir au moins une configuration/type d'événement et un type de client.";
      } else if (g.parameters.some(p => !p.name.trim()) || g.client_types.some(ct => !ct.name.trim())) {
        gridErrorMsg = "Veuillez nommer chaque configuration/type d'événement et chaque type de client de la grille tarifaire.";
      } else if (dateStr && !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        gridErrorMsg = "La date d'entrée en vigueur de chaque version doit être au format AAAA-MM-JJ, ou vide.";
      }
    });
    if (gridErrorMsg) {
      showToast(gridErrorMsg, "warning");
      return;
    }

    const linkedStaffPayload: { id: string; salary_id: string; count: number }[] = [];
    let staffErrorMsg = "";
    linkedStaff.forEach(row => {
      const salaryId = row.salaryId;
      const countStr = row.count.trim();
      const count = parseInt(countStr, 10);
      if (!salaryId && !countStr) return;
      if (!salaryId) {
        staffErrorMsg = "Veuillez sélectionner un emploi pour chaque ligne de personnel lié.";
      } else if (!countStr || isNaN(count) || count < 1) {
        staffErrorMsg = "Veuillez saisir une quantité valide (au moins 1) pour chaque personnel lié.";
      } else {
        linkedStaffPayload.push({ id: generateUid("linked-staff"), salary_id: salaryId, count });
      }
    });
    if (staffErrorMsg) {
      showToast(staffErrorMsg, "warning");
      return;
    }

    const linkedFeesPayload: { id: string; description: string; amount: number }[] = [];
    let feeErrorMsg = "";
    linkedFees.forEach(row => {
      const desc = row.desc.trim();
      const amtStr = row.amount.trim();
      const amt = parseFloat(amtStr);
      if (!desc && !amtStr) return;
      if (!desc) {
        feeErrorMsg = "Veuillez saisir une description pour chaque frais lié.";
      } else if (!amtStr || isNaN(amt) || amt < 0) {
        feeErrorMsg = "Veuillez saisir un montant valide pour chaque frais lié.";
      } else {
        linkedFeesPayload.push({ id: generateUid("linked-fee"), description: desc, amount: amt });
      }
    });
    if (feeErrorMsg) {
      showToast(feeErrorMsg, "warning");
      return;
    }

    const linkedTasksPayload = linkedTasks
      .map(row => row.desc.trim())
      .filter(Boolean)
      .map(desc => ({ id: generateUid("linked-task"), description: desc }));

    const parsedSetupFee = parseFloat(setupFee);
    const validSetupFee = isNaN(parsedSetupFee) || parsedSetupFee < 0 ? 0 : parsedSetupFee;

    const payload = {
      name: newName,
      abbreviation: abbreviation.trim(),
      color,
      rate_type: rateType,
      setup_fee: validSetupFee,
      pricing_grids: grids,
      linked_rooms: linkedRooms,
      linked_staff: linkedStaffPayload,
      linked_fees: linkedFeesPayload,
      linked_tasks: linkedTasksPayload
    };

    const prevRooms = [...appState.settings.rooms];
    const touchedReservations: { r: { room_name: string }; prevRoomName: string }[] = [];
    const prevLinkedRooms = appState.settings.rooms.map((r: { linked_rooms?: string[] }) => ({ r, linked_rooms: r.linked_rooms }));

    if (originalName) {
      const idx = appState.settings.rooms.findIndex((r: { name: string }) => r.name === originalName);
      if (idx !== -1) {
        appState.settings.rooms[idx] = payload;
        appState.activities.forEach(act => {
          (act.reservations || []).forEach((r: { room_name: string }) => {
            if (r.room_name === originalName) {
              touchedReservations.push({ r, prevRoomName: r.room_name });
              r.room_name = newName;
            }
          });
        });
        appState.settings.rooms.forEach((r: { linked_rooms?: string[] }) => {
          r.linked_rooms = (r.linked_rooms || []).map((n: string) => (n === originalName ? newName : n));
        });
      }
    } else {
      if (appState.settings.rooms.some((r: { name: string }) => r.name === newName)) {
        showToast("Cette salle existe déjà.", "warning");
        return;
      }
      appState.settings.rooms.push(payload);
    }

    saveDatabaseOrRollback(() => {
      appState.settings.rooms = prevRooms;
      touchedReservations.forEach(({ r, prevRoomName }) => {
        r.room_name = prevRoomName;
      });
      prevLinkedRooms.forEach(({ r, linked_rooms }) => {
        r.linked_rooms = linked_rooms;
      });
    }, "L'enregistrement de la salle a échoué. Réessayez.").then(saved => {
      if (!saved) {
        bump();
        return;
      }
      onClose();
      populateDropdowns();
      bump();
    });
  };

  if (!isOpen || !grids[activeGridIndex]) {
    return (
      <Modal
        id="room-modal"
        titleId="room-modal-title"
        title={originalName ? "Modifier la salle" : "Ajouter une salle"}
        isOpen={false}
        onClose={onClose}
        onSubmit={submit}
        width="1000px"
      >
        <div />
      </Modal>
    );
  }

  return (
    <Modal
      id="room-modal"
      titleId="room-modal-title"
      title={originalName ? "Modifier la salle" : "Ajouter une salle"}
      isOpen={isOpen}
      onClose={onClose}
      onSubmit={submit}
      width="1000px"
    >
      <div className="form-group-row">
        <div className="form-group" style={{ flexGrow: 1 }}>
          <label htmlFor="form-room-name">Nom de la salle</label>
          <input
            type="text"
            id="form-room-name"
            className="form-input"
            required
            placeholder="Ex: POLY"
            value={roomName}
            onChange={e => setRoomName(e.target.value)}
          />
        </div>
        <div className="form-group" style={{ flexGrow: 0 }}>
          <label htmlFor="form-room-abbreviation">Diminutif</label>
          <input
            type="text"
            id="form-room-abbreviation"
            className="form-input"
            placeholder="Ex: POLY"
            title="Utilisé dans le tableau de la liste des activités à la place du nom complet"
            style={{ width: 100 }}
            value={abbreviation}
            onChange={e => setAbbreviation(e.target.value)}
          />
        </div>
        <div className="form-group" style={{ flexGrow: 0 }}>
          <label htmlFor="form-room-color">Couleur</label>
          <input
            type="color"
            id="ison-room-color"
            className="form-input"
            value={color}
            style={{ width: 56, padding: 4, cursor: "pointer" }}
            onChange={e => setColor(e.target.value)}
          />
        </div>
        <div className="form-group" style={{ flexGrow: 0 }}>
          <label htmlFor="form-room-rate-type">Facturation</label>
          <select
            id="form-room-rate-type"
            className="form-input"
            style={{ width: 130 }}
            value={rateType}
            onChange={e => setRateType(e.target.value as "daily" | "hourly")}
          >
            <option value="daily">À la journée</option>
            <option value="hourly">À l'heure</option>
          </select>
        </div>
        <div className="form-group" style={{ flexGrow: 0 }}>
          <label htmlFor="form-room-setup-fee">Montage/démontage ($)</label>
          <input
            type="number"
            id="form-room-setup-fee"
            className="form-input"
            min="0"
            step="0.01"
            placeholder="0.00"
            style={{ width: 140 }}
            value={setupFee}
            onChange={e => setSetupFee(e.target.value)}
          />
        </div>
      </div>

      <PricingGridEditor
        grids={grids}
        setGrids={setGrids}
        activeGridIndex={activeGridIndex}
        setActiveGridIndex={setActiveGridIndex}
        rateType={rateType}
      />

      <LinkedRoomsSection
        rooms={appState.settings.rooms}
        originalName={originalName}
        linkedRooms={linkedRooms}
        toggleLinkedRoom={toggleLinkedRoom}
      />

      <LinkedStaffSection linkedStaff={linkedStaff} setLinkedStaff={setLinkedStaff} salaries={appState.settings.salaries || []} />

      <LinkedFeesSection linkedFees={linkedFees} setLinkedFees={setLinkedFees} />

      <LinkedTasksSection linkedTasks={linkedTasks} setLinkedTasks={setLinkedTasks} />
    </Modal>
  );
}
