import { DeleteIcon } from "./common.tsx";
import { HelpIndicatorButton } from "./HelpIndicatorButton.tsx";
import type { GridClientType } from "../../state/store.ts";

/**
 * PricingGridClientTypesStep.tsx - Step 2 of PricingGridEditor: the room's client type categories
 * (the pricing matrix's columns).
 */
export function PricingGridClientTypesStep({
  clientTypes,
  isHelpOpen,
  onHelpEnter,
  onHelpLeave,
  onAdd,
  onUpdate,
  onDelete
}: {
  clientTypes: GridClientType[];
  isHelpOpen: boolean;
  onHelpEnter: () => void;
  onHelpLeave: () => void;
  onAdd: () => void;
  onUpdate: (i: number, patch: Partial<GridClientType>) => void;
  onDelete: (i: number) => void;
}) {
  return (
    <div
      className="form-group"
      style={{ position: "relative", padding: 14, border: "1px solid var(--border-color)", borderRadius: "var(--radius-md)", background: "var(--bg-card)" }}
    >
      <div className="distribution-header" style={{ marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
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
          <HelpIndicatorButton onMouseEnter={onHelpEnter} onMouseLeave={onHelpLeave} />
        </span>
        <button type="button" className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: "0.75rem" }} onClick={onAdd}>
          + Ajouter
        </button>
      </div>

      {isHelpOpen && (
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
            Catégories de locataires (ex: <em>Interne</em>, <em>Privé</em>, <em>OBNL</em>, <em>Partenaire</em>).
          </p>
        </div>
      )}

      {clientTypes.length === 0 ? (
        <div style={{ color: "var(--text-muted)", fontSize: "0.8rem", textAlign: "center", padding: "16px 0", border: "1px dashed var(--border-color)", borderRadius: "var(--radius-sm)" }}>
          Aucun type de client défini. Cliquez sur "+ Ajouter" (ex: Interne, Privé).
        </div>
      ) : (
        <div className="distribution-list" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {clientTypes.map((ct, i) => (
            <div key={ct.id} className="distribution-row room-tarif-row" style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center" }}>
              <input
                type="text"
                name={`${ct.id}-name`}
                className="form-input"
                value={ct.name}
                placeholder="Ex: Interne, Privé, OBNL..."
                style={{ padding: "8px 12px", fontSize: "0.85rem", width: "100%" }}
                onChange={e => onUpdate(i, { name: e.target.value })}
              />
              <button type="button" className="btn-icon" title="Supprimer" onClick={() => onDelete(i)}>
                <DeleteIcon />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
