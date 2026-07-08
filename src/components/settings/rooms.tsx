import { useState, useEffect } from "react";
import { appState, saveDatabase, getFlattenedRoomTarifs } from "../../state/state.ts";
import { generateUid, formatCurrency, formatDateMask, getRoomColor, FALLBACK_ROOM_COLORS, showToast } from "../../utils/utils.ts";
import { populateDropdowns } from "../../navigation.ts";
import { EditIcon, DeleteIcon, Modal, GlAccountOptions } from "./common.tsx";

interface GridParam {
  id: string;
  name: string;
}
interface GridClientType {
  id: string;
  name: string;
  gl_account_code?: string;
}
interface GridCell {
  parameter_id: string;
  client_type_id: string;
  amount: number;
}
interface PricingGrid {
  id: string;
  effective_date: string;
  parameters: GridParam[];
  client_types: GridClientType[];
  cells: GridCell[];
}
interface LinkedStaffRow {
  key: string;
  salaryId: string;
  count: string;
}
interface LinkedFeeRow {
  key: string;
  desc: string;
  amount: string;
  glCode: string;
}
interface LinkedTaskRow {
  key: string;
  desc: string;
}

export function RoomsPanel({ active, openModal, bump }: { active: boolean; openModal: (name: string | null) => void; bump: () => void }) {
  const deleteRoom = (name: string) => {
    if (!confirm(`Voulez-vous vraiment supprimer la salle ${name} ?`)) return;
    appState.settings.rooms = appState.settings.rooms.filter((r: { name: string }) => r.name !== name);
    appState.settings.rooms.forEach((r: { linked_rooms?: string[] }) => {
      r.linked_rooms = (r.linked_rooms || []).filter((n: string) => n !== name);
    });
    saveDatabase();
    populateDropdowns();
    bump();
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
        {appState.settings.rooms.map((r: { name: string; pricing_grids?: unknown[] }) => {
          const tarifs = getFlattenedRoomTarifs(r, "");
          const tarifsDesc = tarifs.length
            ? tarifs.map((t: { description: string; amount: number }) => `${t.description}: ${formatCurrency(t.amount)}/jour`).join(" · ")
            : "Aucun tarif défini";
          const versionCount = (r.pricing_grids || []).length;
          const versionNote = versionCount > 1 ? ` (${versionCount} versions)` : "";
          return (
            <div key={r.name} className="settings-list-item">
              <div className="settings-list-item-info">
                <span className="room-color-swatch" style={{ backgroundColor: getRoomColor(r.name) }} title="Couleur de la salle" />
                <span className="settings-list-item-code">{r.name}</span>
                <span className="settings-list-item-desc">
                  {tarifsDesc}
                  {versionNote}
                </span>
              </div>
              <div className="flex gap-2">
                <button className="btn-icon" title="Modifier" onClick={() => openModal(r.name)}>
                  <EditIcon />
                </button>
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
  const [color, setColor] = useState("#4f46e5");
  const [grids, setGrids] = useState<PricingGrid[]>([]);
  const [activeGridIndex, setActiveGridIndex] = useState(0);
  const [linkedRooms, setLinkedRooms] = useState<string[]>([]);
  const [linkedStaff, setLinkedStaff] = useState<LinkedStaffRow[]>([]);
  const [linkedFees, setLinkedFees] = useState<LinkedFeeRow[]>([]);
  const [linkedTasks, setLinkedTasks] = useState<LinkedTaskRow[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    const room = originalName ? appState.settings.rooms.find((r: { name: string }) => r.name === originalName) : null;

    setRoomName(room ? room.name : "");
    setColor(room ? getRoomColor(room.name) : FALLBACK_ROOM_COLORS[appState.settings.rooms.length % FALLBACK_ROOM_COLORS.length]);

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
      ((room && room.linked_fees) || []).map((f: { description: string; amount: number; gl_account_code: string }) => ({
        key: generateUid("linked-fee-row"),
        desc: f.description,
        amount: String(f.amount),
        glCode: f.gl_account_code || ""
      }))
    );
    setLinkedTasks(
      ((room && room.linked_tasks) || []).map((t: { description: string }) => ({
        key: generateUid("linked-task-row"),
        desc: t.description
      }))
    );
  }, [isOpen, originalName]);

  const activeGrid = grids[activeGridIndex];

  const updateActiveGrid = (patch: Partial<PricingGrid>) => {
    setGrids(prev => prev.map((g, i) => (i === activeGridIndex ? { ...g, ...patch } : g)));
  };

  const addVersion = () => {
    const clone: PricingGrid = { ...JSON.parse(JSON.stringify(activeGrid)), id: generateUid("grid"), effective_date: "" };
    setGrids(prev => [...prev, clone]);
    setActiveGridIndex(grids.length);
  };

  const deleteVersion = () => {
    if (grids.length <= 1) {
      showToast("Une salle doit conserver au moins une version de grille tarifaire.", "warning");
      return;
    }
    if (!confirm("Supprimer cette version de la grille tarifaire ?")) return;
    setGrids(prev => prev.filter((_, i) => i !== activeGridIndex));
    setActiveGridIndex(prev => Math.max(0, prev - 1));
  };

  const addParameter = () => {
    updateActiveGrid({ parameters: [...activeGrid.parameters, { id: generateUid("param"), name: "" }] });
  };
  const updateParameter = (i: number, patch: Partial<GridParam>) => {
    updateActiveGrid({ parameters: activeGrid.parameters.map((p, idx) => (idx === i ? { ...p, ...patch } : p)) });
  };
  const deleteParameter = (i: number) => {
    const removedId = activeGrid.parameters[i].id;
    updateActiveGrid({
      parameters: activeGrid.parameters.filter((_, idx) => idx !== i),
      cells: activeGrid.cells.filter(c => c.parameter_id !== removedId)
    });
  };

  const addClientType = () => {
    updateActiveGrid({ client_types: [...activeGrid.client_types, { id: generateUid("ct"), name: "" }] });
  };
  const updateClientType = (i: number, patch: Partial<GridClientType>) => {
    updateActiveGrid({ client_types: activeGrid.client_types.map((ct, idx) => (idx === i ? { ...ct, ...patch } : ct)) });
  };
  const deleteClientType = (i: number) => {
    const removedId = activeGrid.client_types[i].id;
    updateActiveGrid({
      client_types: activeGrid.client_types.filter((_, idx) => idx !== i),
      cells: activeGrid.cells.filter(c => c.client_type_id !== removedId)
    });
  };

  const setCellAmount = (paramId: string, ctId: string, amount: number) => {
    const existing = activeGrid.cells.find(c => c.parameter_id === paramId && c.client_type_id === ctId);
    if (existing) {
      updateActiveGrid({ cells: activeGrid.cells.map(c => (c === existing ? { ...c, amount } : c)) });
    } else {
      updateActiveGrid({ cells: [...activeGrid.cells, { parameter_id: paramId, client_type_id: ctId, amount }] });
    }
  };

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
      if (g.parameters.length === 0 || g.client_types.length === 0) {
        gridErrorMsg = "Chaque version de la grille tarifaire doit avoir au moins un paramètre et un type de client.";
      } else if (g.parameters.some(p => !p.name.trim()) || g.client_types.some(ct => !ct.name.trim())) {
        gridErrorMsg = "Veuillez nommer chaque paramètre et chaque type de client de la grille tarifaire.";
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

    const linkedFeesPayload: { id: string; description: string; amount: number; gl_account_code: string }[] = [];
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
        linkedFeesPayload.push({ id: generateUid("linked-fee"), description: desc, amount: amt, gl_account_code: row.glCode });
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

    const payload = {
      name: newName,
      color,
      pricing_grids: grids,
      linked_rooms: linkedRooms,
      linked_staff: linkedStaffPayload,
      linked_fees: linkedFeesPayload,
      linked_tasks: linkedTasksPayload
    };

    if (originalName) {
      const idx = appState.settings.rooms.findIndex((r: { name: string }) => r.name === originalName);
      if (idx !== -1) {
        appState.settings.rooms[idx] = payload;
        appState.activities.forEach(act => {
          (act.reservations || []).forEach((r: { room_name: string }) => {
            if (r.room_name === originalName) r.room_name = newName;
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

    saveDatabase();
    onClose();
    populateDropdowns();
    bump();
  };

  if (!isOpen || !activeGrid) {
    return (
      <Modal
        id="room-modal"
        titleId="room-modal-title"
        title={originalName ? "Modifier la salle" : "Ajouter une salle"}
        isOpen={false}
        onClose={onClose}
        onSubmit={submit}
        width="760px"
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
      width="760px"
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
          <label htmlFor="form-room-color">Couleur</label>
          <input
            type="color"
            id="form-room-color"
            className="form-input"
            value={color}
            style={{ width: 56, padding: 4, cursor: "pointer" }}
            onChange={e => setColor(e.target.value)}
          />
        </div>
      </div>

      <div className="distribution-section">
        <div className="distribution-header">
          <span className="field-label">Grille tarifaire (paramètre × type de client)</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn btn-secondary" style={{ padding: "6px 12px", fontSize: "0.8rem" }} onClick={addVersion}>
              + Nouvelle version
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: "6px 12px", fontSize: "0.8rem", color: "var(--danger)" }}
              onClick={deleteVersion}
            >
              Supprimer la version
            </button>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          {grids.map((g, i) => (
            <button
              key={g.id}
              type="button"
              className={`pill-toggle grid-version-tab${i === activeGridIndex ? " active" : ""}`}
              onClick={() => setActiveGridIndex(i)}
            >
              {g.effective_date ? g.effective_date : "Depuis toujours"}
            </button>
          ))}
        </div>
        <div className="form-group" style={{ maxWidth: 260 }}>
          <label htmlFor="room-grid-effective-date">Date d'entrée en vigueur de cette version</label>
          <input
            type="text"
            id="room-grid-effective-date"
            className="form-input"
            placeholder="AAAA-MM-JJ (vide = depuis toujours)"
            value={activeGrid.effective_date}
            onChange={e => {
              const inputType = (e.nativeEvent as InputEvent).inputType;
              const value = inputType === "deleteContentBackward" ? e.target.value : formatDateMask(e.target.value);
              updateActiveGrid({ effective_date: value });
            }}
          />
        </div>
        <div className="form-group-row">
          <div className="form-group">
            <div className="distribution-header" style={{ marginBottom: 8 }}>
              <span className="field-label" style={{ fontSize: "0.8rem" }}>
                Paramètres (lignes)
              </span>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: "4px 10px", fontSize: "0.75rem" }}
                onClick={addParameter}
              >
                + Paramètre
              </button>
            </div>
            <div className="distribution-list">
              {activeGrid.parameters.map((p, i) => (
                <div key={p.id} className="distribution-row room-tarif-row" style={{ gridTemplateColumns: "1fr auto" }}>
                  <input
                    type="text"
                    name={`${p.id}-name`}
                    className="form-input"
                    value={p.name}
                    placeholder="Ex: Journée"
                    style={{ padding: "8px 12px", fontSize: "0.85rem" }}
                    onChange={e => updateParameter(i, { name: e.target.value })}
                  />
                  <button type="button" className="btn-icon" onClick={() => deleteParameter(i)}>
                    <DeleteIcon />
                  </button>
                </div>
              ))}
            </div>
          </div>
          <div className="form-group">
            <div className="distribution-header" style={{ marginBottom: 8 }}>
              <span className="field-label" style={{ fontSize: "0.8rem" }}>
                Types de client (colonnes)
              </span>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: "4px 10px", fontSize: "0.75rem" }}
                onClick={addClientType}
              >
                + Type de client
              </button>
            </div>
            <div className="distribution-list">
              {activeGrid.client_types.map((ct, i) => (
                <div key={ct.id} className="distribution-row room-tarif-row" style={{ gridTemplateColumns: "1fr 1fr auto" }}>
                  <input
                    type="text"
                    name={`${ct.id}-name`}
                    className="form-input"
                    value={ct.name}
                    placeholder="Ex: Interne"
                    style={{ padding: "8px 12px", fontSize: "0.85rem" }}
                    onChange={e => updateClientType(i, { name: e.target.value })}
                  />
                  <select
                    name={`${ct.id}-gl-account`}
                    className="select-input"
                    style={{ padding: "8px 12px", fontSize: "0.85rem" }}
                    title="Compte GL pour la facturation (optionnel)"
                    value={ct.gl_account_code || ""}
                    onChange={e => updateClientType(i, { gl_account_code: e.target.value })}
                  >
                    <GlAccountOptions />
                  </select>
                  <button type="button" className="btn-icon" onClick={() => deleteClientType(i)}>
                    <DeleteIcon />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div style={{ overflowX: "auto" }}>
          {activeGrid.parameters.length === 0 || activeGrid.client_types.length === 0 ? (
            <div style={{ color: "var(--text-muted)", fontSize: "0.85rem", padding: "12px 0" }}>
              Ajoutez au moins un paramètre et un type de client pour saisir les tarifs.
            </div>
          ) : (
            <table className="detail-dist-table">
              <thead>
                <tr>
                  <th></th>
                  {activeGrid.client_types.map(ct => (
                    <th key={ct.id}>{ct.name || "(sans nom)"}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeGrid.parameters.map(p => (
                  <tr key={p.id}>
                    <td className="bold" style={{ whiteSpace: "nowrap", paddingRight: 12 }}>
                      {p.name || "(sans nom)"}
                    </td>
                    {activeGrid.client_types.map(ct => {
                      const cell = activeGrid.cells.find(c => c.parameter_id === p.id && c.client_type_id === ct.id);
                      return (
                        <td key={ct.id}>
                          <input
                            type="number"
                            name={`cell-${p.id}-${ct.id}`}
                            min={0}
                            step={0.01}
                            className="form-input"
                            value={cell ? cell.amount : ""}
                            style={{ padding: "6px 10px", fontSize: "0.85rem", width: 100 }}
                            onChange={e => setCellAmount(p.id, ct.id, parseFloat(e.target.value) || 0)}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="distribution-section">
        <div className="distribution-header">
          <span className="field-label">Salles liées (réservées automatiquement avec cette salle)</span>
        </div>
        <div className="pill-toggle-group">
          {appState.settings.rooms
            .filter((r: { name: string }) => r.name !== originalName)
            .map((r: { name: string }) => (
              <button
                key={r.name}
                type="button"
                className={`pill-toggle${linkedRooms.includes(r.name) ? " active" : ""}`}
                onClick={() => toggleLinkedRoom(r.name)}
              >
                {r.name}
              </button>
            ))}
        </div>
      </div>

      <div className="distribution-section">
        <div className="distribution-header">
          <span className="field-label">Personnel lié (ajouté automatiquement à la réservation)</span>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: "6px 12px", fontSize: "0.8rem" }}
            onClick={() => setLinkedStaff([...linkedStaff, { key: generateUid("linked-staff-row"), salaryId: "", count: "1" }])}
          >
            + Ajouter
          </button>
        </div>
        <div className="distribution-list">
          {linkedStaff.map((row, i) => (
            <div key={row.key} className="distribution-row">
              <select
                name={`${row.key}-salary`}
                className="select-input"
                style={{ padding: "8px 12px", fontSize: "0.85rem" }}
                value={row.salaryId}
                onChange={e => setLinkedStaff(linkedStaff.map((r, idx) => (idx === i ? { ...r, salaryId: e.target.value } : r)))}
              >
                <option value="">Choisir un emploi...</option>
                {(appState.settings.salaries || []).map((s: { id: string; job: string }) => (
                  <option key={s.id} value={s.id}>
                    {s.job}
                  </option>
                ))}
              </select>
              <input
                type="number"
                name={`${row.key}-count`}
                className="form-input"
                min={1}
                step={1}
                value={row.count}
                placeholder="Quantité"
                style={{ padding: "8px 12px", fontSize: "0.85rem" }}
                onChange={e => setLinkedStaff(linkedStaff.map((r, idx) => (idx === i ? { ...r, count: e.target.value } : r)))}
              />
              <div></div>
              <button
                type="button"
                className="btn-icon"
                onClick={() => setLinkedStaff(linkedStaff.filter((_, idx) => idx !== i))}
              >
                <DeleteIcon />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="distribution-section">
        <div className="distribution-header">
          <span className="field-label">Frais liés (ajoutés automatiquement à la réservation)</span>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: "6px 12px", fontSize: "0.8rem" }}
            onClick={() => setLinkedFees([...linkedFees, { key: generateUid("linked-fee-row"), desc: "", amount: "", glCode: "" }])}
          >
            + Ajouter
          </button>
        </div>
        <div className="distribution-list">
          {linkedFees.map((row, i) => (
            <div key={row.key} className="distribution-row">
              <input
                type="text"
                name={`${row.key}-desc`}
                className="form-input"
                value={row.desc}
                placeholder="Ex: Montage et démontage"
                style={{ padding: "8px 12px", fontSize: "0.85rem" }}
                onChange={e => setLinkedFees(linkedFees.map((r, idx) => (idx === i ? { ...r, desc: e.target.value } : r)))}
              />
              <input
                type="number"
                name={`${row.key}-amount`}
                className="form-input"
                min={0}
                step={0.01}
                value={row.amount}
                placeholder="Montant $"
                style={{ padding: "8px 12px", fontSize: "0.85rem" }}
                onChange={e => setLinkedFees(linkedFees.map((r, idx) => (idx === i ? { ...r, amount: e.target.value } : r)))}
              />
              <select
                name={`${row.key}-gl`}
                className="select-input"
                style={{ padding: "8px 12px", fontSize: "0.85rem" }}
                value={row.glCode}
                onChange={e => setLinkedFees(linkedFees.map((r, idx) => (idx === i ? { ...r, glCode: e.target.value } : r)))}
              >
                <GlAccountOptions />
              </select>
              <button
                type="button"
                className="btn-icon"
                onClick={() => setLinkedFees(linkedFees.filter((_, idx) => idx !== i))}
              >
                <DeleteIcon />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="distribution-section">
        <div className="distribution-header">
          <span className="field-label">Tâches du gestionnaire liées (générées automatiquement en planification)</span>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: "6px 12px", fontSize: "0.8rem" }}
            onClick={() => setLinkedTasks([...linkedTasks, { key: generateUid("linked-task-row"), desc: "" }])}
          >
            + Ajouter
          </button>
        </div>
        <div className="distribution-list">
          {linkedTasks.map((row, i) => (
            <div key={row.key} className="distribution-row room-tarif-row" style={{ gridTemplateColumns: "1fr auto" }}>
              <input
                type="text"
                name={`${row.key}-desc`}
                className="form-input"
                value={row.desc}
                placeholder="Ex: Envoyer un courriel au responsable de la salle"
                style={{ padding: "8px 12px", fontSize: "0.85rem" }}
                onChange={e => setLinkedTasks(linkedTasks.map((r, idx) => (idx === i ? { ...r, desc: e.target.value } : r)))}
              />
              <button
                type="button"
                className="btn-icon"
                onClick={() => setLinkedTasks(linkedTasks.filter((_, idx) => idx !== i))}
              >
                <DeleteIcon />
              </button>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}
