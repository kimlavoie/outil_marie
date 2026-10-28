import { HelpIndicatorButton } from "./HelpIndicatorButton.tsx";
import type { GridParameter, GridClientType, PricingGrid } from "../../state/store.ts";

/**
 * PricingGridMatrixStep.tsx - Step 3 of PricingGridEditor: the actual $ tariff matrix
 * (parameters x client types), once at least one of each exists.
 */
export function PricingGridMatrixStep({
  parameters,
  clientTypes,
  cells,
  rateType,
  isHelpOpen,
  onHelpEnter,
  onHelpLeave,
  onSetCellAmount
}: {
  parameters: GridParameter[];
  clientTypes: GridClientType[];
  cells: PricingGrid["cells"];
  rateType: "daily" | "hourly";
  isHelpOpen: boolean;
  onHelpEnter: () => void;
  onHelpLeave: () => void;
  onSetCellAmount: (paramId: string, ctId: string, amount: number) => void;
}) {
  return (
    <div style={{ position: "relative", padding: 14, border: "1px solid var(--border-color)", borderRadius: "var(--radius-md)", background: "var(--bg-card)" }}>
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
          <span>Grille des tarifs ($/{rateType === "hourly" ? "heure" : "jour"})</span>
          <HelpIndicatorButton onMouseEnter={onHelpEnter} onMouseLeave={onHelpLeave} />
        </span>
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
            <strong style={{ color: "var(--primary)" }}>💡 Aide : Grille des tarifs</strong>
          </div>
          <p style={{ margin: 0 }}>
            Saisissez le tarif {rateType === "hourly" ? "par heure" : "par jour"} en dollars ($) pour chaque combinaison (agencement de la
            salle × type de client).
          </p>
        </div>
      )}

      <div style={{ overflowX: "auto" }}>
        {parameters.length === 0 || clientTypes.length === 0 ? (
          <div style={{ color: "var(--text-muted)", fontSize: "0.8rem", textAlign: "center", padding: "20px 0", border: "1px dashed var(--border-color)", borderRadius: "var(--radius-sm)" }}>
            💡 Remplissez d'abord les étapes 1 (Configurations / Types d'événement) et 2 (Types de client) ci-dessus pour générer la
            grille des tarifs.
          </div>
        ) : (
          <div>
            <p style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginBottom: 12 }}>
              Saisissez les tarifs {rateType === "hourly" ? "par heure" : "par jour"} applicables pour chaque combinaison.
            </p>
            <table className="detail-dist-table" style={{ minWidth: 140 + clientTypes.length * 140 }}>
              <thead>
                <tr>
                  <th style={{ background: "transparent", borderBottom: "2px solid var(--border-color)" }}></th>
                  {clientTypes.map(ct => (
                    <th
                      key={ct.id}
                      style={{
                        textAlign: "center",
                        fontSize: "0.8rem",
                        fontWeight: 600,
                        color: "var(--text-primary)",
                        padding: "10px 8px",
                        borderBottom: "2px solid var(--border-color)",
                        background: "var(--bg-main)",
                        minWidth: 140
                      }}
                    >
                      {ct.name || "(Sans nom)"}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parameters.map(p => (
                  <tr key={p.id}>
                    <td
                      className="bold"
                      title={p.details || undefined}
                      style={{
                        whiteSpace: "nowrap",
                        padding: "12px 10px",
                        fontWeight: 600,
                        color: "var(--text-primary)",
                        borderBottom: "1px solid var(--border-color)",
                        cursor: p.details ? "help" : undefined
                      }}
                    >
                      {p.name || "(Sans nom)"}
                    </td>
                    {clientTypes.map(ct => {
                      const cell = cells.find(c => c.parameter_id === p.id && c.client_type_id === ct.id);
                      return (
                        <td key={ct.id} style={{ textAlign: "center", padding: "8px", borderBottom: "1px solid var(--border-color)" }}>
                          <div style={{ display: "inline-flex", alignItems: "center", position: "relative", width: "100%", minWidth: 100, maxWidth: 120 }}>
                            <span style={{ position: "absolute", left: 10, color: "var(--text-muted)", fontSize: "0.85rem", pointerEvents: "none" }}>$</span>
                            <input
                              type="number"
                              name={`cell-${p.id}-${ct.id}`}
                              min={0}
                              step={0.01}
                              className="form-input no-spinner"
                              value={cell ? cell.amount : ""}
                              placeholder="0.00"
                              style={{ padding: "8px 8px 8px 24px", fontSize: "0.85rem", textAlign: "right", width: "100%" }}
                              onChange={e => onSetCellAmount(p.id, ct.id, parseFloat(e.target.value) || 0)}
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
  );
}
