import { useState, useEffect } from "react";
import { appState, saveDatabase, getFlattenedRoomTarifs } from "../../state/state.ts";
import { generateUid, formatCurrency, formatDateMask, getRoomColor, FALLBACK_ROOM_COLORS, showToast } from "../../utils/utils.ts";
import { populateDropdowns } from "../../navigation.ts";
import { DeleteIcon, Modal, GlAccountOptions } from "./common.tsx";

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
            <div key={r.name} className="settings-list-item" onClick={() => openModal(r.name)}>
              <div className="settings-list-item-info">
                <span className="room-color-swatch" style={{ backgroundColor: getRoomColor(r.name) }} title="Couleur de la salle" />
                <span className="settings-list-item-code">{r.name}</span>
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
  const [color, setColor] = useState("#4f46e5");
  const [grids, setGrids] = useState<PricingGrid[]>([]);
  const [activeGridIndex, setActiveGridIndex] = useState(0);
  const [linkedRooms, setLinkedRooms] = useState<string[]>([]);
  const [linkedStaff, setLinkedStaff] = useState<LinkedStaffRow[]>([]);
  const [linkedFees, setLinkedFees] = useState<LinkedFeeRow[]>([]);
  const [linkedTasks, setLinkedTasks] = useState<LinkedTaskRow[]>([]);
  const [showHelp, setShowHelp] = useState(false);
  const [activeHelpPopup, setActiveHelpPopup] = useState<string | null>(null);

  const renderHelpButton = (section: string) => (
    <button
      type="button"
      className="btn-help-indicator"
      style={{
        width: 16,
        height: 16,
        borderRadius: "50%",
        background: "var(--primary-light)",
        color: "var(--primary)",
        border: "none",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "0.7rem",
        fontWeight: "bold",
        cursor: "help",
        padding: 0,
        marginLeft: 6,
        verticalAlign: "middle"
      }}
      onMouseEnter={() => setActiveHelpPopup(section)}
      onMouseLeave={() => setActiveHelpPopup(null)}
    >
      ?
    </button>
  );

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
      width="780px"
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

      <div
        className="distribution-section"
        style={{
          border: "1px solid var(--border-color)",
          padding: 16,
          borderRadius: "var(--radius-md)",
          background: "var(--bg-main)",
          marginBottom: 20
        }}
      >
        <div
          className="distribution-header"
          style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}
        >
          <span className="field-label" style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--text-primary)" }}>
            ⚙️ Configuration des Tarifs
          </span>
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

        {/* Aide intégrée dépliable */}
        <div className="pricing-grid-help-container" style={{ marginBottom: 16 }}>
          <button
            type="button"
            className="btn btn-secondary-outline"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: "0.8rem",
              padding: "6px 12px",
              cursor: "pointer",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border-color)",
              background: "var(--bg-card)",
              color: "var(--text-secondary)"
            }}
            onClick={() => setShowHelp(!showHelp)}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style={{ color: "var(--primary)", flexShrink: 0 }}>
              <path d="M11 18h2v-6h-2v6zm1-16C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2V5h-2v2z" />
            </svg>
            <span>{showHelp ? "Masquer le guide d'utilisation" : "Besoin d'aide ? Comment configurer la grille tarifaire"}</span>
          </button>

          {showHelp && (
            <div
              className="pricing-help-content"
              style={{
                marginTop: 10,
                padding: 14,
                background: "var(--primary-light)",
                borderLeft: "4px solid var(--primary)",
                borderRadius: "var(--radius-sm)",
                fontSize: "0.8rem",
                color: "var(--text-secondary)",
                lineHeight: 1.5
              }}
            >
              <p style={{ fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>💡 Guide rapide pour la grille tarifaire :</p>
              <ul style={{ paddingLeft: 18, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                <li>
                  <strong>Gestion des versions :</strong> Les tarifs peuvent évoluer dans le temps. Le système sélectionne la version active
                  correspondant à la date de début de l'activité. Une version sans date sert de tarif par défaut (<em>Depuis toujours</em>).
                </li>
                <li>
                  <strong>1. Configurations / Types d'événement (Lignes) :</strong> Ce sont les agencements de la salle (ex:{" "}
                  <em>Parterre</em>, <em>Demi-parterre</em>) ou les types d'activités (ex: <em>Spectacle</em>, <em>Réunion</em>,{" "}
                  <em>Réception</em>).
                </li>
                <li>
                  <strong>2. Types de client (Colonnes) :</strong> Catégories de locataires (ex: <em>Interne</em>, <em>Privé</em>,{" "}
                  <em>OBNL</em>, <em>Partenaire</em>). Liez-y un compte GL de facturation pour comptabiliser automatiquement les revenus de
                  la salle.
                </li>
                <li>
                  <strong>3. Saisie des tarifs :</strong> Remplissez les prix journaliers en dollars ($) dans la table générée à
                  l'intersection de chaque ligne et colonne.
                </li>
              </ul>
              <div
                style={{
                  marginTop: 10,
                  paddingTop: 8,
                  borderTop: "1px solid var(--border-color)",
                  fontSize: "0.78rem",
                  color: "var(--text-muted)",
                  lineHeight: 1.4
                }}
              >
                💡 <strong>Recommandation :</strong> S'il n'y a pas de configuration ou de type d'événement particulier pour cette salle,
                nous vous recommandons de créer une seule ligne nommée <em>"Tarif unique"</em> ou <em>"Standard"</em>.
              </div>
            </div>
          )}
        </div>

        {/* Sélection des versions */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
          <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: 500 }}>Versions de tarif :</span>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {grids.map((g, i) => (
              <button
                key={g.id}
                type="button"
                className={`pill-toggle grid-version-tab${i === activeGridIndex ? " active" : ""}`}
                style={{
                  padding: "6px 12px",
                  fontSize: "0.8rem",
                  borderRadius: "var(--radius-sm)",
                  cursor: "pointer"
                }}
                onClick={() => setActiveGridIndex(i)}
              >
                {g.effective_date ? `Dès le ${g.effective_date}` : "Par défaut (Depuis toujours)"}
              </button>
            ))}
          </div>
        </div>

        {/* Date d'entrée en vigueur de la version active */}
        <div
          className="form-group"
          style={{
            position: "relative",
            background: "var(--bg-card)",
            padding: 12,
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border-color)",
            marginBottom: 16
          }}
        >
          <label
            htmlFor="room-grid-effective-date"
            style={{ fontWeight: 600, fontSize: "0.8rem", display: "flex", alignItems: "center", marginBottom: 6 }}
          >
            <span>Date d'entrée en vigueur de cette version</span>
            {renderHelpButton("versions")}
          </label>
          {activeHelpPopup === "versions" && (
            <div
              style={{
                position: "absolute",
                top: "44px",
                left: "12px",
                right: "12px",
                zIndex: 100,
                padding: 12,
                background: "var(--bg-card)",
                border: "1px solid var(--primary)",
                boxShadow: "var(--shadow-md)",
                borderRadius: "var(--radius-sm)",
                fontSize: "0.8rem",
                color: "var(--text-secondary)",
                lineHeight: 1.4,
                pointerEvents: "none"
              }}
            >
              <div style={{ marginBottom: 4 }}>
                <strong style={{ color: "var(--primary)" }}>📅 Aide : Gestion des versions</strong>
              </div>
              <p style={{ margin: 0 }}>
                Les tarifs peuvent changer avec le temps. Le système applique automatiquement la grille dont la date d'entrée en vigueur est
                la plus récente et antérieure ou égale à la date de début de l'activité. Une version sans date sert de tarif par défaut
                (toujours active).
              </p>
            </div>
          )}
          <input
            type="text"
            id="room-grid-effective-date"
            className="form-input"
            placeholder="AAAA-MM-JJ (laisser vide = toujours active)"
            value={activeGrid.effective_date}
            onChange={e => {
              const inputType = (e.nativeEvent as InputEvent).inputType;
              const value =
                inputType === "deleteContentBackward" || inputType === "deleteContentForward"
                  ? e.target.value
                  : formatDateMask(e.target.value);
              updateActiveGrid({ effective_date: value });
            }}
          />
          <small style={{ display: "block", color: "var(--text-muted)", fontSize: "0.75rem", marginTop: 4 }}>
            Format requis : AAAA-MM-JJ. Exemple : 2026-09-01. Vide pour le tarif par défaut.
          </small>
        </div>

        {/* Configuration pas à pas - Étapes 1 & 2 (empilées verticalement) */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 16 }}>
          {/* Étape 1 : Configurations / Types d'événement (Lignes) */}
          <div
            className="form-group"
            style={{
              position: "relative",
              padding: 14,
              border: "1px solid var(--border-color)",
              borderRadius: "var(--radius-md)",
              background: "var(--bg-card)"
            }}
          >
            <div
              className="distribution-header"
              style={{ marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}
            >
              <span className="field-label" style={{ fontSize: "0.85rem", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                <span
                  style={{
                    background: "var(--primary-light)",
                    color: "var(--primary)",
                    borderRadius: "50%",
                    width: 20,
                    height: 20,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "0.75rem",
                    fontWeight: "bold"
                  }}
                >
                  1
                </span>
                <span>Configurations / Types d'événement (Lignes)</span>
                {renderHelpButton("configs")}
              </span>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: "4px 10px", fontSize: "0.75rem" }}
                onClick={addParameter}
              >
                + Ajouter
              </button>
            </div>

            {activeHelpPopup === "configs" && (
              <div
                style={{
                  position: "absolute",
                  top: "40px",
                  left: "14px",
                  right: "14px",
                  zIndex: 100,
                  padding: 12,
                  background: "var(--bg-card)",
                  border: "1px solid var(--primary)",
                  boxShadow: "var(--shadow-md)",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "0.8rem",
                  color: "var(--text-secondary)",
                  lineHeight: 1.4,
                  pointerEvents: "none"
                }}
              >
                <div style={{ marginBottom: 4 }}>
                  <strong style={{ color: "var(--primary)" }}>💡 Aide : Configurations / Événements</strong>
                </div>
                <p style={{ margin: 0 }}>
                  Représentent l'usage ou l'agencement de la salle (ex: <em>Spectacle</em>, <em>Réunion</em>, <em>Réception</em>,{" "}
                  <em>Parterre</em>, <em>Demi-parterre</em>).
                </p>
                <p style={{ margin: "6px 0 0 0", fontSize: "0.75rem", color: "var(--text-muted)" }}>
                  <strong>Conseil :</strong> S'il n'y a pas d'agencement particulier pour cette salle, créez une seule ligne nommée{" "}
                  <em>"Tarif unique"</em>.
                </p>
              </div>
            )}

            {activeGrid.parameters.length === 0 ? (
              <div
                style={{
                  color: "var(--text-muted)",
                  fontSize: "0.8rem",
                  textAlign: "center",
                  padding: "16px 0",
                  border: "1px dashed var(--border-color)",
                  borderRadius: "var(--radius-sm)"
                }}
              >
                Aucun élément défini. Cliquez sur "+ Ajouter" (ex: Spectacle, Réunion, Demi-parterre).
              </div>
            ) : (
              <div className="distribution-list" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {activeGrid.parameters.map((p, i) => (
                  <div
                    key={p.id}
                    className="distribution-row room-tarif-row"
                    style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center" }}
                  >
                    <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                      <span
                        style={{ position: "absolute", left: 10, color: "var(--text-muted)", fontSize: "0.85rem", pointerEvents: "none" }}
                      >
                        ☰
                      </span>
                      <input
                        type="text"
                        name={`${p.id}-name`}
                        className="form-input"
                        value={p.name}
                        placeholder="Ex: Spectacle, Réunion, Demi-parterre..."
                        style={{ padding: "8px 12px 8px 24px", fontSize: "0.85rem", width: "100%" }}
                        onChange={e => updateParameter(i, { name: e.target.value })}
                      />
                    </div>
                    <button type="button" className="btn-icon" title="Supprimer" onClick={() => deleteParameter(i)}>
                      <DeleteIcon />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Étape 2 : Types de client (Colonnes) */}
          <div
            className="form-group"
            style={{
              position: "relative",
              padding: 14,
              border: "1px solid var(--border-color)",
              borderRadius: "var(--radius-md)",
              background: "var(--bg-card)"
            }}
          >
            <div
              className="distribution-header"
              style={{ marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}
            >
              <span className="field-label" style={{ fontSize: "0.85rem", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                <span
                  style={{
                    background: "var(--primary-light)",
                    color: "var(--primary)",
                    borderRadius: "50%",
                    width: 20,
                    height: 20,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "0.75rem",
                    fontWeight: "bold"
                  }}
                >
                  2
                </span>
                <span>Types de client (Colonnes)</span>
                {renderHelpButton("clients")}
              </span>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: "4px 10px", fontSize: "0.75rem" }}
                onClick={addClientType}
              >
                + Ajouter
              </button>
            </div>

            {activeHelpPopup === "clients" && (
              <div
                style={{
                  position: "absolute",
                  top: "40px",
                  left: "14px",
                  right: "14px",
                  zIndex: 100,
                  padding: 12,
                  background: "var(--bg-card)",
                  border: "1px solid var(--primary)",
                  boxShadow: "var(--shadow-md)",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "0.8rem",
                  color: "var(--text-secondary)",
                  lineHeight: 1.4,
                  pointerEvents: "none"
                }}
              >
                <div style={{ marginBottom: 4 }}>
                  <strong style={{ color: "var(--primary)" }}>💡 Aide : Types de client</strong>
                </div>
                <p style={{ margin: 0 }}>
                  Catégories de locataires (ex: <em>Interne</em>, <em>Privé</em>, <em>OBNL</em>, <em>Partenaire</em>). Liez-y un compte GL
                  de facturation pour comptabiliser automatiquement les revenus de la salle.
                </p>
              </div>
            )}

            {activeGrid.client_types.length === 0 ? (
              <div
                style={{
                  color: "var(--text-muted)",
                  fontSize: "0.8rem",
                  textAlign: "center",
                  padding: "16px 0",
                  border: "1px dashed var(--border-color)",
                  borderRadius: "var(--radius-sm)"
                }}
              >
                Aucun type de client défini. Cliquez sur "+ Ajouter" (ex: Interne, Privé).
              </div>
            ) : (
              <div className="distribution-list" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {activeGrid.client_types.map((ct, i) => (
                  <div
                    key={ct.id}
                    className="distribution-row room-tarif-row"
                    style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr auto", gap: 8, alignItems: "center" }}
                  >
                    <input
                      type="text"
                      name={`${ct.id}-name`}
                      className="form-input"
                      value={ct.name}
                      placeholder="Ex: Interne, Privé, OBNL..."
                      style={{ padding: "8px 12px", fontSize: "0.85rem", width: "100%" }}
                      onChange={e => updateClientType(i, { name: e.target.value })}
                    />
                    <select
                      name={`${ct.id}-gl-account`}
                      className="select-input"
                      style={{ padding: "8px 12px", fontSize: "0.85rem", width: "100%" }}
                      title="Compte GL pour la facturation (optionnel)"
                      value={ct.gl_account_code || ""}
                      onChange={e => updateClientType(i, { gl_account_code: e.target.value })}
                    >
                      <GlAccountOptions />
                    </select>
                    <button type="button" className="btn-icon" title="Supprimer" onClick={() => deleteClientType(i)}>
                      <DeleteIcon />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Étape 3 : Saisie des Tarifs (Matrice) */}
        <div
          style={{
            position: "relative",
            padding: 14,
            border: "1px solid var(--border-color)",
            borderRadius: "var(--radius-md)",
            background: "var(--bg-card)"
          }}
        >
          <div className="distribution-header" style={{ marginBottom: 10 }}>
            <span className="field-label" style={{ fontSize: "0.85rem", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
              <span
                style={{
                  background: "var(--primary-light)",
                  color: "var(--primary)",
                  borderRadius: "50%",
                  width: 20,
                  height: 20,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "0.75rem",
                  fontWeight: "bold"
                }}
              >
                3
              </span>
              <span>Grille des tarifs ($/jour)</span>
              {renderHelpButton("tarifs")}
            </span>
          </div>

          {activeHelpPopup === "tarifs" && (
            <div
              style={{
                position: "absolute",
                top: "40px",
                left: "14px",
                right: "14px",
                zIndex: 100,
                padding: 12,
                background: "var(--bg-card)",
                border: "1px solid var(--primary)",
                boxShadow: "var(--shadow-md)",
                borderRadius: "var(--radius-sm)",
                fontSize: "0.8rem",
                color: "var(--text-secondary)",
                lineHeight: 1.4,
                pointerEvents: "none"
              }}
            >
              <div style={{ marginBottom: 4 }}>
                <strong style={{ color: "var(--primary)" }}>💡 Aide : Grille des tarifs</strong>
              </div>
              <p style={{ margin: 0 }}>
                Saisissez le tarif par jour en dollars ($) pour chaque combinaison (agencement de la salle × type de client).
              </p>
            </div>
          )}

          <div style={{ overflowX: "auto" }}>
            {activeGrid.parameters.length === 0 || activeGrid.client_types.length === 0 ? (
              <div
                style={{
                  color: "var(--text-muted)",
                  fontSize: "0.8rem",
                  textAlign: "center",
                  padding: "20px 0",
                  border: "1px dashed var(--border-color)",
                  borderRadius: "var(--radius-sm)"
                }}
              >
                💡 Remplissez d'abord les étapes 1 (Configurations / Types d'événement) et 2 (Types de client) ci-dessus pour générer la
                grille des tarifs.
              </div>
            ) : (
              <div>
                <p style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginBottom: 12 }}>
                  Saisissez les tarifs par jour applicables pour chaque combinaison.
                </p>
                <table className="detail-dist-table">
                  <thead>
                    <tr>
                      <th style={{ background: "transparent", borderBottom: "2px solid var(--border-color)" }}></th>
                      {activeGrid.client_types.map(ct => (
                        <th
                          key={ct.id}
                          style={{
                            textAlign: "center",
                            fontSize: "0.8rem",
                            fontWeight: 600,
                            color: "var(--text-primary)",
                            padding: "10px 8px",
                            borderBottom: "2px solid var(--border-color)",
                            background: "var(--bg-main)"
                          }}
                        >
                          {ct.name || "(Sans nom)"}
                          {ct.gl_account_code && (
                            <span
                              style={{
                                display: "block",
                                fontSize: "0.7rem",
                                color: "var(--text-muted)",
                                fontWeight: "normal",
                                marginTop: 2
                              }}
                            >
                              GL: {ct.gl_account_code}
                            </span>
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {activeGrid.parameters.map(p => (
                      <tr key={p.id}>
                        <td
                          className="bold"
                          style={{
                            whiteSpace: "nowrap",
                            padding: "12px 10px",
                            fontWeight: 600,
                            color: "var(--text-primary)",
                            borderBottom: "1px solid var(--border-color)"
                          }}
                        >
                          {p.name || "(Sans nom)"}
                        </td>
                        {activeGrid.client_types.map(ct => {
                          const cell = activeGrid.cells.find(c => c.parameter_id === p.id && c.client_type_id === ct.id);
                          return (
                            <td
                              key={ct.id}
                              style={{
                                textAlign: "center",
                                padding: "8px",
                                borderBottom: "1px solid var(--border-color)"
                              }}
                            >
                              <div
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  position: "relative",
                                  width: "100%",
                                  maxWidth: 120
                                }}
                              >
                                <span
                                  style={{
                                    position: "absolute",
                                    left: 10,
                                    color: "var(--text-muted)",
                                    fontSize: "0.85rem",
                                    pointerEvents: "none"
                                  }}
                                >
                                  $
                                </span>
                                <input
                                  type="number"
                                  name={`cell-${p.id}-${ct.id}`}
                                  min={0}
                                  step={0.01}
                                  className="form-input"
                                  value={cell ? cell.amount : ""}
                                  placeholder="0.00"
                                  style={{
                                    padding: "8px 8px 8px 24px",
                                    fontSize: "0.85rem",
                                    textAlign: "right",
                                    width: "100%"
                                  }}
                                  onChange={e => setCellAmount(p.id, ct.id, parseFloat(e.target.value) || 0)}
                                />
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
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
              <button type="button" className="btn-icon" onClick={() => setLinkedStaff(linkedStaff.filter((_, idx) => idx !== i))}>
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
              <button type="button" className="btn-icon" onClick={() => setLinkedFees(linkedFees.filter((_, idx) => idx !== i))}>
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
              <button type="button" className="btn-icon" onClick={() => setLinkedTasks(linkedTasks.filter((_, idx) => idx !== i))}>
                <DeleteIcon />
              </button>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}
