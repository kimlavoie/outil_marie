import { useState } from "react";
import { generateUid, formatDateMask, showToast } from "../../utils/utils.ts";
import { PricingGridGuideBanner } from "./PricingGridGuideBanner.tsx";
import { PricingGridParametersStep } from "./PricingGridParametersStep.tsx";
import { PricingGridClientTypesStep } from "./PricingGridClientTypesStep.tsx";
import { PricingGridMatrixStep } from "./PricingGridMatrixStep.tsx";
import { HelpIndicatorButton } from "./HelpIndicatorButton.tsx";
import type { GridParameter, GridClientType, PricingGrid } from "../../state/store.ts";

// Re-exported under this file's original names — GridParameter is the canonical (store.ts) name,
// GridParam is what rooms.tsx (this editor's only consumer) already imports.
export type { GridClientType, PricingGrid };
export type GridParam = GridParameter;

// The "Configuration des Tarifs" editor for a room: manages a versioned pricing grid (one
// version per effective_date), each version being a matrix of parameters (rows) x client types
// (columns) with a $ amount per cell. Fully controlled by the parent (RoomModal), which owns
// `grids`/`activeGridIndex` since it also needs them to build the save payload.
export function PricingGridEditor({
  grids,
  setGrids,
  activeGridIndex,
  setActiveGridIndex,
  rateType = "daily"
}: {
  grids: PricingGrid[];
  setGrids: React.Dispatch<React.SetStateAction<PricingGrid[]>>;
  activeGridIndex: number;
  setActiveGridIndex: React.Dispatch<React.SetStateAction<number>>;
  rateType?: "daily" | "hourly";
}) {
  const [activeHelpPopup, setActiveHelpPopup] = useState<string | null>(null);

  const activeGrid = grids[activeGridIndex];

  if (!activeGrid) return null;

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
    const clampedAmount = Math.max(0, amount);
    const existing = activeGrid.cells.find(c => c.parameter_id === paramId && c.client_type_id === ctId);
    if (existing) {
      updateActiveGrid({ cells: activeGrid.cells.map(c => (c === existing ? { ...c, amount: clampedAmount } : c)) });
    } else {
      updateActiveGrid({ cells: [...activeGrid.cells, { parameter_id: paramId, client_type_id: ctId, amount: clampedAmount }] });
    }
  };

  return (
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

      <PricingGridGuideBanner rateType={rateType} />

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
          <HelpIndicatorButton onMouseEnter={() => setActiveHelpPopup("versions")} onMouseLeave={() => setActiveHelpPopup(null)} />
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

      {/* Configuration pas à pas - Étapes 1, 2 & 3 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 16 }}>
        <PricingGridParametersStep
          parameters={activeGrid.parameters}
          isHelpOpen={activeHelpPopup === "configs"}
          onHelpEnter={() => setActiveHelpPopup("configs")}
          onHelpLeave={() => setActiveHelpPopup(null)}
          onAdd={addParameter}
          onUpdate={updateParameter}
          onDelete={deleteParameter}
        />

        <PricingGridClientTypesStep
          clientTypes={activeGrid.client_types}
          isHelpOpen={activeHelpPopup === "clients"}
          onHelpEnter={() => setActiveHelpPopup("clients")}
          onHelpLeave={() => setActiveHelpPopup(null)}
          onAdd={addClientType}
          onUpdate={updateClientType}
          onDelete={deleteClientType}
        />
      </div>

      <PricingGridMatrixStep
        parameters={activeGrid.parameters}
        clientTypes={activeGrid.client_types}
        cells={activeGrid.cells}
        rateType={rateType}
        isHelpOpen={activeHelpPopup === "tarifs"}
        onHelpEnter={() => setActiveHelpPopup("tarifs")}
        onHelpLeave={() => setActiveHelpPopup(null)}
        onSetCellAmount={setCellAmount}
      />
    </div>
  );
}
