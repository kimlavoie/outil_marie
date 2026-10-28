import type { Account } from "../../../state/store.ts";
import type { ExcelExportOptions } from "../../../services/excel-export.ts";

export const COLUMN_OPTIONS: { key: keyof ExcelExportOptions["columns"]; label: string }[] = [
  { key: "id", label: "N° Activité (ID)" },
  { key: "responsable", label: "Responsable facturation" },
  { key: "name", label: "Nom de l'activité" },
  { key: "date_start", label: "Date de début" },
  { key: "date_end", label: "Date de fin" },
  { key: "days_count", label: "Nombre de jours d'occupation" },
  { key: "client_type", label: "Type de client (interne/externe)" },
  { key: "category", label: "Catégorie / Type d'événement" },
  { key: "rooms", label: "Salle(s) réservée(s)" },
  { key: "remi_time", label: "Temps Rémi" },
  { key: "department", label: "Département" },
  { key: "room_sans_frais", label: "Prix salle sans frais" },
  { key: "references", label: "Numéro de facture / Réquisition" },
  { key: "state", label: "Statut de l'activité" },
  { key: "attendees_count", label: "Nombre de participants" },
  { key: "manager_name", label: "Nom du gestionnaire / contact" },
  { key: "manager_company", label: "Entreprise du client" },
  { key: "manager_contact_info", label: "Courriel & Tél. du client" },
  { key: "description", label: "Description complète" },
  { key: "notes", label: "Notes internes" }
];

/**
 * ExcelExportColumnsTab.tsx - "Personnalisé" mode's second tab: which table columns to include,
 * which GL accounts get their own column, and workbook-level options (totals row, formulas,
 * extra sheets). Fully controlled by ExcelExportModal.tsx, which owns `options.columns`/`sheets`.
 */
export function ExcelExportColumnsTab({
  columns,
  sheets,
  accounts,
  onSetColumn,
  onSetAllColumns,
  onToggleAccount,
  onSetAllAccounts,
  onPatchSheets
}: {
  columns: ExcelExportOptions["columns"];
  sheets: ExcelExportOptions["sheets"];
  accounts: Account[];
  onSetColumn: (key: keyof ExcelExportOptions["columns"], value: boolean) => void;
  onSetAllColumns: (value: boolean) => void;
  onToggleAccount: (code: string) => void;
  onSetAllAccounts: (checked: boolean) => void;
  onPatchSheets: (patch: Partial<ExcelExportOptions["sheets"]>) => void;
}) {
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h4 className="excel-section-title" style={{ margin: 0 }}>📊 Sélection des colonnes du tableau</h4>
        <div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onSetAllColumns(true)}>Tout cocher</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onSetAllColumns(false)}>Tout décocher</button>
        </div>
      </div>

      <div className="excel-grid-3">
        {COLUMN_OPTIONS.map(col => (
          <label key={col.key} className="excel-chk-item">
            <input type="checkbox" checked={!!columns[col.key]} onChange={e => onSetColumn(col.key, e.target.checked)} />
            {col.label}
          </label>
        ))}
      </div>

      <div className="excel-form-section" style={{ marginTop: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h4 className="excel-section-title" style={{ margin: 0 }}>💰 Comptes GL à inclure</h4>
          <div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onSetAllAccounts(true)}>Tout cocher</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onSetAllAccounts(false)}>Tout décocher</button>
          </div>
        </div>
        <div className="excel-grid-2">
          {accounts.map(acc => (
            <label key={acc.code} className="excel-chk-item">
              <input type="checkbox" checked={columns.accounts.includes(acc.code)} onChange={() => onToggleAccount(acc.code)} />
              <strong>{acc.code}</strong> - {acc.description}
            </label>
          ))}
        </div>
        <div style={{ marginTop: 8 }}>
          <label className="excel-chk-item">
            <input type="checkbox" checked={columns.total_revenue} onChange={e => onSetColumn("total_revenue", e.target.checked)} />
            <strong>REVENUS TOTAL RÉÈL</strong> (Ligne de somme totale par activité)
          </label>
        </div>
      </div>

      <div className="excel-form-section" style={{ marginTop: 16 }}>
        <h4 className="excel-section-title">📁 Configuration du classeur</h4>
        <div className="excel-grid-2">
          <label className="excel-chk-item">
            <input type="checkbox" checked={sheets.includeTotalRow} onChange={e => onPatchSheets({ includeTotalRow: e.target.checked })} />
            Ligne de totaux généraux au bas du tableau
          </label>
          <label className="excel-chk-item">
            <input type="checkbox" checked={sheets.useExcelFormulas} onChange={e => onPatchSheets({ useExcelFormulas: e.target.checked })} />
            Utiliser des formules Excel (SUM, calcul de dates)
          </label>
          <label className="excel-chk-item">
            <input type="checkbox" checked={sheets.includeRoomsSheet} onChange={e => onPatchSheets({ includeRoomsSheet: e.target.checked })} />
            Inclure l'onglet "SALLES &amp; TARIFS"
          </label>
          <label className="excel-chk-item">
            <input type="checkbox" checked={sheets.includeSummarySheet} onChange={e => onPatchSheets({ includeSummarySheet: e.target.checked })} />
            Inclure l'onglet "SOMMAIRE SYNTHÉTIQUE"
          </label>
        </div>
      </div>
    </>
  );
}
