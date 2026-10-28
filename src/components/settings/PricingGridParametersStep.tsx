import { DeleteIcon } from "./common.tsx";
import { HelpIndicatorButton } from "./HelpIndicatorButton.tsx";
import type { GridParameter } from "../../state/store.ts";

/**
 * PricingGridParametersStep.tsx - Step 1 of PricingGridEditor: the room's configurations/event
 * types (the pricing matrix's rows).
 */
export function PricingGridParametersStep({
  parameters,
  isHelpOpen,
  onHelpEnter,
  onHelpLeave,
  onAdd,
  onUpdate,
  onDelete
}: {
  parameters: GridParameter[];
  isHelpOpen: boolean;
  onHelpEnter: () => void;
  onHelpLeave: () => void;
  onAdd: () => void;
  onUpdate: (i: number, patch: Partial<GridParameter>) => void;
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
            1
          </span>
          <span>Configurations / Types d'événement (Lignes)</span>
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

      {parameters.length === 0 ? (
        <div style={{ color: "var(--text-muted)", fontSize: "0.8rem", textAlign: "center", padding: "16px 0", border: "1px dashed var(--border-color)", borderRadius: "var(--radius-sm)" }}>
          Aucun élément défini. Cliquez sur "+ Ajouter" (ex: Spectacle, Réunion, Demi-parterre).
        </div>
      ) : (
        <div className="distribution-list" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {parameters.map((p, i) => (
            <div key={p.id} className="distribution-row room-tarif-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, alignItems: "center" }}>
              <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <span style={{ position: "absolute", left: 10, color: "var(--text-muted)", fontSize: "0.85rem", pointerEvents: "none" }}>☰</span>
                <input
                  type="text"
                  name={`${p.id}-name`}
                  className="form-input"
                  value={p.name}
                  placeholder="Ex: Spectacle, Réunion, Demi-parterre..."
                  style={{ padding: "8px 12px 8px 24px", fontSize: "0.85rem", width: "100%" }}
                  onChange={e => onUpdate(i, { name: e.target.value })}
                />
              </div>
              <input
                type="text"
                name={`${p.id}-details`}
                className="form-input"
                value={p.details || ""}
                placeholder="Détails (optionnel, ex: max 200 places)"
                title="Affiché au survol dans le tableau et entre parenthèses dans le formulaire d'activité"
                style={{ padding: "8px 12px", fontSize: "0.85rem", width: "100%" }}
                onChange={e => onUpdate(i, { details: e.target.value })}
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
