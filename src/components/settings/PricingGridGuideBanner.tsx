import { useState } from "react";

/**
 * PricingGridGuideBanner.tsx - The collapsible "Besoin d'aide ?" guide at the top of
 * PricingGridEditor. Fully self-contained (owns its own open/closed state) since nothing else in
 * the editor depends on whether it's expanded.
 */
export function PricingGridGuideBanner({ rateType }: { rateType: "daily" | "hourly" }) {
  const [showHelp, setShowHelp] = useState(false);

  return (
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
              <strong>1. Configurations / Types d'événement (Lignes) :</strong> Ce sont les agencements de la salle (ex: <em>Parterre</em>
              , <em>Demi-parterre</em>) ou les types d'activités (ex: <em>Spectacle</em>, <em>Réunion</em>, <em>Réception</em>).
            </li>
            <li>
              <strong>2. Types de client (Colonnes) :</strong> Catégories de locataires (ex: <em>Interne</em>, <em>Privé</em>,{" "}
              <em>OBNL</em>, <em>Partenaire</em>).
            </li>
            <li>
              <strong>3. Saisie des tarifs :</strong> Remplissez les tarifs ({rateType === "hourly" ? "horaires" : "journaliers"}) en
              dollars ($) dans la table générée à l'intersection de chaque ligne et colonne.
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
  );
}
