import { useState } from "react";
import { generateUid, formatDateMask, showToast } from "../../utils/utils.ts";
import { DeleteIcon, GlAccountOptions } from "./common.tsx";
import type { GridParameter, GridClientType, GridCell, PricingGrid } from "../../state/store.ts";

// Re-exported under this file's original names — GridParameter is the canonical (store.ts) name,
// GridParam is what rooms.tsx (this editor's only consumer) already imports.
export type { GridClientType, GridCell, PricingGrid };
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
  const [showHelp, setShowHelp] = useState(false);
  const [activeHelpPopup, setActiveHelpPopup] = useState<string | null>(null);

  const activeGrid = grids[activeGridIndex];

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
      <div className="distribution-header" style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
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
                <strong>1. Configurations / Types d'événement (Lignes) :</strong> Ce sont les agencements de la salle (ex: <em>Parterre</em>,{" "}
                <em>Demi-parterre</em>) ou les types d'activités (ex: <em>Spectacle</em>, <em>Réunion</em>, <em>Réception</em>).
              </li>
              <li>
                <strong>2. Types de client (Colonnes) :</strong> Catégories de locataires (ex: <em>Interne</em>, <em>Privé</em>,{" "}
                <em>OBNL</em>, <em>Partenaire</em>). Liez-y un compte GL de facturation pour comptabiliser automatiquement les revenus de la
                salle.
              </li>
              <li>
                <strong>3. Saisie des tarifs :</strong> Remplissez les tarifs ({rateType === "hourly" ? "horaires" : "journaliers"}) en dollars ($) dans la table générée à l'intersection
                de chaque ligne et colonne.
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
              💡 <strong>Recommandation :</strong> S'il n'y a pas de configuration ou de type d'événement particulier pour cette salle, nous
              vous recommandons de créer une seule ligne nommée <em>"Tarif unique"</em> ou <em>"Standard"</em>.
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
        <label htmlFor="room-grid-effective-date" style={{ fontWeight: 600, fontSize: "0.8rem", display: "flex", alignItems: "center", marginBottom: 6 }}>
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
              Les tarifs peuvent changer avec le temps. Le système applique automatiquement la grille dont la date d'entrée en vigueur est la
              plus récente et antérieure ou égale à la date de début de l'activité. Une version sans date sert de tarif par défaut (toujours
              active).
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
              inputType === "deleteContentBackward" || inputType === "deleteContentForward" ? e.target.value : formatDateMask(e.target.value);
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
              {renderHelpButton("configs")}
            </span>
            <button type="button" className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: "0.75rem" }} onClick={addParameter}>
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
                      onChange={e => updateParameter(i, { name: e.target.value })}
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
                    onChange={e => updateParameter(i, { details: e.target.value })}
                  />
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
              {renderHelpButton("clients")}
            </span>
            <button type="button" className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: "0.75rem" }} onClick={addClientType}>
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
                Catégories de locataires (ex: <em>Interne</em>, <em>Privé</em>, <em>OBNL</em>, <em>Partenaire</em>). Liez-y un compte GL de
                facturation pour comptabiliser automatiquement les revenus de la salle.
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
                <div key={ct.id} className="distribution-row room-tarif-row" style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr auto", gap: 8, alignItems: "center" }}>
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
            <p style={{ margin: 0 }}>Saisissez le tarif {rateType === "hourly" ? "par heure" : "par jour"} en dollars ($) pour chaque combinaison (agencement de la salle × type de client).</p>
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
              💡 Remplissez d'abord les étapes 1 (Configurations / Types d'événement) et 2 (Types de client) ci-dessus pour générer la grille des
              tarifs.
            </div>
          ) : (
            <div>
              <p style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginBottom: 12 }}>Saisissez les tarifs {rateType === "hourly" ? "par heure" : "par jour"} applicables pour chaque combinaison.</p>
              <table className="detail-dist-table" style={{ minWidth: 140 + activeGrid.client_types.length * 140 }}>
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
                          background: "var(--bg-main)",
                          minWidth: 140
                        }}
                      >
                        {ct.name || "(Sans nom)"}
                        {ct.gl_account_code && (
                          <span style={{ display: "block", fontSize: "0.7rem", color: "var(--text-muted)", fontWeight: "normal", marginTop: 2 }}>
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
                        title={p.details || undefined}
                        style={{ whiteSpace: "nowrap", padding: "12px 10px", fontWeight: 600, color: "var(--text-primary)", borderBottom: "1px solid var(--border-color)", cursor: p.details ? "help" : undefined }}
                      >
                        {p.name || "(Sans nom)"}
                      </td>
                      {activeGrid.client_types.map(ct => {
                        const cell = activeGrid.cells.find(c => c.parameter_id === p.id && c.client_type_id === ct.id);
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
  );
}
