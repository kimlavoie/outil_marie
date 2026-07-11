/**
 * excel-export.ts - Generates the structured "ACTIVITÉS"/"SALLES" Excel export matching the
 * original template used before this app existed.
 */
import { logError } from "../utils/logger.ts";
import { appState, getFiscalYear, getQuarterNumber, getActivePricingGrid, getFlattenedRoomTarifs } from "../state/state.ts";
import { showToast, showLoadingOverlay, hideLoadingOverlay, getRoomsTariffTotal, getActivityReferences, getReservationRoomLabel } from "../utils/utils.ts";

// Generate structured excel matching the original template
function exportToExcel() {
  // Helper to convert column index to letter
  function getExcelColName(colIdx: number) {
    let temp,
      letter = "";
    while (colIdx > 0) {
      temp = (colIdx - 1) % 26;
      letter = String.fromCharCode(65 + temp) + letter;
      colIdx = (colIdx - temp - 1) / 26;
    }
    return letter;
  }

  showLoadingOverlay("Génération de l'export Excel...");
  // Deferred so the overlay actually paints before this synchronous, potentially long-running
  // workbook generation blocks the main thread.
  setTimeout(() => runExportToExcel(getExcelColName), 20);
}

function runExportToExcel(getExcelColName: (colIdx: number) => string) {
  try {
    if (typeof XLSX === "undefined" || !XLSX?.utils?.book_new) {
      throw new Error("La librairie Excel (XLSX) n'a pas pu être chargée.");
    }
    if (!appState.settings.accounts || appState.settings.accounts.length === 0) {
      showToast("Aucun compte configuré : ajoutez des comptes dans les paramètres avant d'exporter.", "error", 6000);
      return;
    }

    const wb = XLSX.utils.book_new();

    // Sheet 1: ACTIVITÉS
    // Define Headers
    const headers = [
      "NUMERO ACTIVITE",
      "RESPONSABLE FACTURATION",
      "NOM DE L'ACTIVITÉ",
      "DATE DÉBUT",
      "DATE FIN",
      "Nbre jour occupation (formule)",
      "Client interne ou externe",
      "CATÉGORIE (Rébecca)",
      "SALLE (menu déroulant)",
      "TEMPS RÉMI (en heure)",
      "DÉPARTEMENT (menu déroulant À VENIR)",
      "PRIX SALLE SANS FRAIS (formule) interne seulement",
      "NUMÉRO DE FACTURE, RÉQUISITION INTERNE OU ENCAISSEMENT"
    ];

    // Add all configured account codes as columns
    const accountsOrder = appState.settings.accounts.map(a => a.code);
    accountsOrder.forEach(code => {
      const label = appState.settings.accounts.find(a => a.code === code)?.description || "";
      headers.push(`${code}\n${label}`);
    });

    headers.push("REVENUS TOTAL RÉÈL");

    const sheetData = [headers];

    // Filter activities for active period
    const activeActivities = appState.activities.filter(act => {
      if (act.deleted) return false;
      if (act.name.trim() === "") return false;
      const actYear = getFiscalYear(act.date_start);
      const actQuarter = getQuarterNumber(act.date_start);
      return actYear === appState.selected_year && actQuarter !== null && appState.selected_quarters.includes(actQuarter);
    });

    // Add activities rows
    activeActivities.forEach((act, rIdx) => {
      const isFilled = act.name.trim() !== "";
      const row: any[] = [];

      row.push(act.id); // NUMERO ACTIVITE
      row.push(isFilled ? act.responsable : ""); // RESPONSABLE FACTURATION
      row.push(isFilled ? act.name : ""); // NOM DE L'ACTIVITÉ
      row.push(isFilled ? act.date_start : ""); // DATE DÉBUT
      row.push(isFilled ? act.date_end : ""); // DATE FIN

      // Nbre jour occupation (written as formula in row index rIdx + 2 since index 1 is headers)
      const excelRow = rIdx + 2;
      row.push({ t: "n", f: `E${excelRow}-D${excelRow}+1` });

      row.push(isFilled ? act.client_type : ""); // Client interne ou externe
      row.push(isFilled ? act.category || "" : ""); // CATÉGORIE
      row.push(isFilled ? (act.reservations || []).map(getReservationRoomLabel).join(", ") : ""); // SALLE
      row.push(0); // TEMPS RÉMI
      row.push(isFilled ? act.department : ""); // DÉPARTEMENT

      // PRIX SALLE SANS FRAIS
      row.push(isFilled && act.client_type === "interne" ? getRoomsTariffTotal(act) : 0);

      row.push(isFilled ? getActivityReferences(act) : ""); // NUMÉRO DE FACTURE...

      // Distribute amounts to matching account columns
      accountsOrder.forEach(code => {
        const dist = act.distributions.find((d: any) => d.account_code === code);
        row.push(dist ? dist.amount : 0);
      });

      // REVENUS TOTAL RÉÈL (written as formula summing distributions)
      const firstDistCol = getExcelColName(13 + 1); // 1-based index (N)
      const lastDistCol = getExcelColName(13 + accountsOrder.length); // End of accounts

      row.push({ t: "n", f: `SUM(${firstDistCol}${excelRow}:${lastDistCol}${excelRow})` });

      sheetData.push(row);
    });

    // Add Total sum row at the bottom
    const totalRowIdx = sheetData.length + 1;
    const totalRow = new Array(13).fill("");
    totalRow[0] = "TOTAUX COMPLETS";

    // Sum formula for each accounts column and total column
    const startRow = 2;
    const endRow = totalRowIdx - 1;

    accountsOrder.forEach((code, aIdx) => {
      const colLetter = getExcelColName(13 + aIdx + 1);
      totalRow.push({ t: "n", f: `SUM(${colLetter}${startRow}:${colLetter}${endRow})` });
    });

    const totalColLetter = getExcelColName(13 + accountsOrder.length + 1);
    totalRow.push({ t: "n", f: `SUM(${totalColLetter}${startRow}:${totalColLetter}${endRow})` });

    sheetData.push(totalRow);

    const ws = XLSX.utils.aoa_to_sheet(sheetData);

    // Adjust columns widths
    ws["!cols"] = [
      { wch: 15 }, // ID
      { wch: 20 }, // Responsable
      { wch: 25 }, // Nom
      { wch: 12 }, // Date D
      { wch: 12 }, // Date F
      { wch: 10 }, // Jours
      { wch: 12 }, // Client type
      { wch: 10 }, // Catégorie
      { wch: 15 }, // Salle
      { wch: 10 }, // Rémi
      { wch: 22 }, // Département
      { wch: 15 }, // Sans frais
      { wch: 20 } // Facture/RI
    ];

    // Push account columns sizes
    accountsOrder.forEach(() => ws["!cols"].push({ wch: 18 }));
    ws["!cols"].push({ wch: 20 }); // Total revenue

    XLSX.utils.book_append_sheet(wb, ws, "ACTIVITÉS");

    // Sheet 2: Configuration Salles (une ligne par cellule de la grille tarifaire active)
    const roomsData = [["SALLE", "GRILLE (ENTRÉE EN VIGUEUR)", "TARIF", "MONTANT ($/JOUR)"]];
    appState.settings.rooms.forEach(r => {
      const grid = getActivePricingGrid(r, "");
      const tarifs = grid ? getFlattenedRoomTarifs(r, "") : [];
      (tarifs.length ? tarifs : [{ description: "", amount: "" }]).forEach(t => {
        roomsData.push([r.name, grid ? grid.effective_date || "Depuis toujours" : "", t.description, t.amount]);
      });
    });
    const wsRooms = XLSX.utils.aoa_to_sheet(roomsData);
    XLSX.utils.book_append_sheet(wb, wsRooms, "SALLES");

    // Trigger download: includes selected period in filename
    const qStr = appState.selected_quarters
      .sort()
      .map(q => `T${q}`)
      .join("-");
    const filename = `compta_marie_rapport_${appState.selected_year}_${qStr || "aucun"}_${new Date().toISOString().split("T")[0]}.xlsx`;
    XLSX.writeFile(wb, filename);
    showToast("Export Excel terminé.", "success");
  } catch (err: any) {
    logError("backup", "export Excel", err);
    showToast("Erreur lors de l'export Excel : " + err.message, "error");
  } finally {
    hideLoadingOverlay();
  }
}

export { exportToExcel };
