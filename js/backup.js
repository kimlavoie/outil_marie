/**
 * backup.js - Backup/restore (JSON) and Excel export controllers
 */

// --- Automatic file backup (File System Access API) ---
// Keeps the localStorage database as the single source of truth; this only
// mirrors a JSON snapshot to a file the user picked, on every saveDatabase().
// The FileSystemFileHandle itself is persisted in a tiny IndexedDB store (not
// used for app data) so the connection survives page reloads.
const AUTO_BACKUP_DB_NAME = "outil_marie_autobackup";
const AUTO_BACKUP_STORE = "handles";
const AUTO_BACKUP_KEY = "backup_file";

let autoBackupHandle = null;
let autoBackupLastWrite = null;
let autoBackupWriteTimer = null;

function openAutoBackupDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(AUTO_BACKUP_DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(AUTO_BACKUP_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGetAutoBackupHandle() {
  const db = await openAutoBackupDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(AUTO_BACKUP_STORE, "readonly");
    const req = tx.objectStore(AUTO_BACKUP_STORE).get(AUTO_BACKUP_KEY);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function idbSetAutoBackupHandle(handle) {
  const db = await openAutoBackupDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(AUTO_BACKUP_STORE, "readwrite");
    tx.objectStore(AUTO_BACKUP_STORE).put(handle, AUTO_BACKUP_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbClearAutoBackupHandle() {
  const db = await openAutoBackupDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(AUTO_BACKUP_STORE, "readwrite");
    tx.objectStore(AUTO_BACKUP_STORE).delete(AUTO_BACKUP_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Builds the status widget with DOM APIs (not innerHTML) since the file name
// comes from the user's filesystem and shouldn't be interpolated as markup.
function renderAutoBackupStatus(status, filename) {
  updateAutoBackupBanner(status, filename);

  const container = document.getElementById("auto-backup-status");
  if (!container) return;
  container.innerHTML = "";

  if (status === "unsupported") {
    const span = document.createElement("span");
    span.style.color = "var(--text-secondary)";
    span.textContent = "Non disponible sur ce navigateur (Chrome ou Edge requis).";
    container.appendChild(span);
    return;
  }

  if (status === "disconnected") {
    const btn = document.createElement("button");
    btn.id = "auto-backup-connect-btn";
    btn.className = "btn btn-primary btn-secondary";
    btn.textContent = "Choisir un fichier de sauvegarde automatique";
    container.appendChild(btn);
    return;
  }

  const badge = document.createElement("span");
  badge.className = status === "connected" ? "badge badge-success" : "badge badge-warning";
  badge.textContent = status === "connected" ? "Actif" : "Permission requise";
  container.appendChild(badge);

  const info = document.createElement("span");
  let infoText = `Fichier : ${filename}`;
  if (status === "connected" && autoBackupLastWrite) {
    infoText += ` — dernière écriture : ${autoBackupLastWrite.toLocaleTimeString("fr-CA")}`;
  }
  info.textContent = infoText;
  container.appendChild(info);

  if (status === "needs-permission") {
    const reconnectBtn = document.createElement("button");
    reconnectBtn.id = "auto-backup-reconnect-btn";
    reconnectBtn.className = "btn btn-secondary";
    reconnectBtn.textContent = "Reconnecter";
    container.appendChild(reconnectBtn);
  }

  const disconnectBtn = document.createElement("button");
  disconnectBtn.id = "auto-backup-disconnect-btn";
  disconnectBtn.className = "btn btn-secondary btn-danger";
  disconnectBtn.textContent = "Désactiver";
  container.appendChild(disconnectBtn);
}

// Shows/hides the app-wide banner (visible on every view, not just the
// Sauvegarde & Export screen) so a lapsed permission doesn't go unnoticed.
function updateAutoBackupBanner(status, filename) {
  const banner = document.getElementById("auto-backup-reminder-banner");
  if (!banner) return;

  if (status === "needs-permission") {
    document.getElementById("auto-backup-reminder-filename").textContent = filename || "";
    banner.style.display = "flex";
  } else {
    banner.style.display = "none";
  }
}

async function initAutoBackup() {
  if (!window.showSaveFilePicker) {
    renderAutoBackupStatus("unsupported");
    return;
  }
  try {
    const stored = await idbGetAutoBackupHandle();
    if (!stored) {
      renderAutoBackupStatus("disconnected");
      return;
    }
    autoBackupHandle = stored;
    const perm = await stored.queryPermission({ mode: "readwrite" });
    renderAutoBackupStatus(perm === "granted" ? "connected" : "needs-permission", stored.name);
  } catch (e) {
    console.error("Erreur d'initialisation de la sauvegarde automatique", e);
    renderAutoBackupStatus("disconnected");
  }
}

async function connectAutoBackupFile() {
  try {
    const handle = await window.showSaveFilePicker({
      suggestedName: "compta_marie_autosave.json",
      types: [{ description: "Sauvegarde JSON", accept: { "application/json": [".json"] } }]
    });
    const perm = await handle.requestPermission({ mode: "readwrite" });
    if (perm !== "granted") {
      alert("Permission refusée : impossible d'activer la sauvegarde automatique.");
      return;
    }
    await idbSetAutoBackupHandle(handle);
    autoBackupHandle = handle;
    renderAutoBackupStatus("connected", handle.name);
    await writeAutoBackupNow();
  } catch (e) {
    if (e.name !== "AbortError") {
      console.error(e);
      alert("Erreur lors de la sélection du fichier : " + e.message);
    }
  }
}

async function reconnectAutoBackupPermission() {
  if (!autoBackupHandle) return;
  try {
    const perm = await autoBackupHandle.requestPermission({ mode: "readwrite" });
    if (perm === "granted") {
      renderAutoBackupStatus("connected", autoBackupHandle.name);
      await writeAutoBackupNow();
    } else {
      alert("Permission refusée.");
    }
  } catch (e) {
    console.error(e);
    alert("Erreur lors de la reconnexion : " + e.message);
  }
}

async function disconnectAutoBackup() {
  if (!confirm("Désactiver la sauvegarde automatique vers ce fichier ?")) return;
  await idbClearAutoBackupHandle();
  autoBackupHandle = null;
  autoBackupLastWrite = null;
  renderAutoBackupStatus("disconnected");
}

// Debounced so a burst of saveDatabase() calls (e.g. migrations) only
// triggers a single disk write.
function scheduleAutoBackupWrite() {
  if (!autoBackupHandle) return;
  clearTimeout(autoBackupWriteTimer);
  autoBackupWriteTimer = setTimeout(writeAutoBackupNow, 1500);
}

async function writeAutoBackupNow() {
  if (!autoBackupHandle) return;
  try {
    const perm = await autoBackupHandle.queryPermission({ mode: "readwrite" });
    if (perm !== "granted") {
      renderAutoBackupStatus("needs-permission", autoBackupHandle.name);
      return;
    }
    const writable = await autoBackupHandle.createWritable();
    await writable.write(JSON.stringify(appState, null, 2));
    await writable.close();
    autoBackupLastWrite = new Date();
    renderAutoBackupStatus("connected", autoBackupHandle.name);
  } catch (e) {
    console.error("Échec de l'écriture de la sauvegarde automatique", e);
  }
}

function initBackupHandlers() {
  // Export JSON Backup
  document.getElementById("backup-export-json").addEventListener("click", async () => {
    // Update last backup date to today before export
    appState.settings.last_backup_date = new Date().toISOString().split('T')[0];
    await saveDatabase();

    // Refresh banner and backup view
    checkBackupReminder();
    renderBackupView();

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(appState, null, 2));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href", dataStr);

    const timestamp = new Date().toISOString().split('T')[0];
    dlAnchorElem.setAttribute("download", `compta_marie_sauvegarde_${timestamp}.json`);
    dlAnchorElem.click();
  });

  // Backup file selection drag & drop
  const jsonDropZone = document.getElementById("json-drop-zone");
  const jsonFileInput = document.getElementById("json-file-input");

  jsonDropZone.addEventListener("click", () => jsonFileInput.click());

  jsonFileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) handleJsonBackupFile(file);
  });

  // Export Excel
  document.getElementById("backup-export-excel").addEventListener("click", () => {
    exportToExcel();
  });

  // Reset database button
  document.getElementById("backup-reset-db").addEventListener("click", async () => {
    if (confirm("ATTENTION : Cette action va supprimer définitivement toutes vos activités enregistrées. Les comptes, tarifs de salles et départements seront réinitialisés à leurs valeurs d'origine. Voulez-vous continuer ?")) {
      await seedDatabase();
      applyTheme("dark");
      renderAll();
      checkBackupReminder();
      alert("La base de données a été réinitialisée avec succès !");
    }
  });

  // Reminder days input event handler
  const reminderInput = document.getElementById("backup-reminder-days-input");
  if (reminderInput) {
    reminderInput.addEventListener("change", (e) => {
      let val = parseInt(e.target.value, 10);
      if (isNaN(val) || val < 1) {
        val = 7;
        e.target.value = 7;
      }
      appState.settings.backup_reminder_days = val;
      saveDatabase();
      checkBackupReminder();
      renderBackupView();
    });
  }

  // Backup banner action redirect
  const bannerActionBtn = document.getElementById("backup-banner-action-btn");
  if (bannerActionBtn) {
    bannerActionBtn.addEventListener("click", () => {
      switchToView("backup");
    });
  }

  // Automatic file backup controls (event delegation: buttons are re-rendered)
  const autoBackupContainer = document.getElementById("auto-backup-status");
  if (autoBackupContainer) {
    autoBackupContainer.addEventListener("click", (e) => {
      if (e.target.id === "auto-backup-connect-btn") connectAutoBackupFile();
      else if (e.target.id === "auto-backup-reconnect-btn") reconnectAutoBackupPermission();
      else if (e.target.id === "auto-backup-disconnect-btn") disconnectAutoBackup();
    });
  }
  initAutoBackup();

  // Global banner "Reconnecter" button (visible on every view)
  const autoBackupBannerBtn = document.getElementById("auto-backup-reminder-btn");
  if (autoBackupBannerBtn) {
    autoBackupBannerBtn.addEventListener("click", () => {
      reconnectAutoBackupPermission();
    });
  }
}

function handleJsonBackupFile(file) {
  const reader = new FileReader();

  reader.onload = async function(e) {
    try {
      const parsed = JSON.parse(e.target.result);
      if (parsed.settings && parsed.activities) {
        if (confirm("La restauration va écraser la base de données actuelle. Continuer ?")) {
          appState = parsed;

          // Sanitize settings on restoration
          if (!appState.settings) appState.settings = {};
          if (!appState.settings.rooms) appState.settings.rooms = [];
          if (!appState.settings.salaries) appState.settings.salaries = [];
          if (appState.settings.last_backup_date === undefined) appState.settings.last_backup_date = "";
          appState.settings.backup_reminder_days = parseInt(appState.settings.backup_reminder_days, 10);
          if (isNaN(appState.settings.backup_reminder_days)) {
            appState.settings.backup_reminder_days = 7;
          }

          // Sort accounts on restoration
          if (appState.settings && appState.settings.accounts) {
            appState.settings.accounts.sort((a, b) => a.code.localeCompare(b.code));
          }

          // Restored files may predate the pricing-grid/rate-versioning/activity migrations —
          // run the same migrations loadDatabase() applies on normal startup.
          migrateRoomsConfig();
          migrateSalariesConfig();
          migrateActivities();

          await saveDatabase();
          applyTheme(appState.settings.theme || "dark");
          renderAll();
          checkBackupReminder();
          alert("Base de données restaurée avec succès !");
        }
      } else {
        alert("Fichier de sauvegarde invalide (champs requis manquants).");
      }
    } catch (err) {
      alert("Erreur lors de la lecture du fichier JSON : " + err.message);
    }
  };

  reader.readAsText(file);
}

// Backup reminder helpers and views
function getDaysSinceLastBackup() {
  if (!appState.settings.last_backup_date) {
    return null;
  }
  const parts = appState.settings.last_backup_date.split('-');
  if (parts.length !== 3) return null;

  const lastBackupDate = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  const today = new Date();

  // Set both to midnight local time
  lastBackupDate.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);

  const diffMs = today.getTime() - lastBackupDate.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return diffDays;
}

function formatLocalDateToFrench(dateStr) {
  if (!dateStr) return "Aucune sauvegarde effectuée";
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const year = parseInt(parts[0], 10);
  const monthIdx = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);

  const months = [
    "janvier", "février", "mars", "avril", "mai", "juin",
    "juillet", "août", "septembre", "octobre", "novembre", "décembre"
  ];

  return `${day} ${months[monthIdx]} ${year}`;
}

function checkBackupReminder() {
  const banner = document.getElementById("backup-reminder-banner");
  if (!banner) return;

  if (appState.activities.length === 0) {
    banner.style.display = "none";
    return;
  }

  const lastBackup = appState.settings.last_backup_date;
  const reminderDays = appState.settings.backup_reminder_days || 7;

  if (!lastBackup) {
    document.getElementById("backup-alert-text").innerHTML = `
      <svg viewBox="0 0 24 24" class="alert-icon" style="fill: var(--warning-text); margin-right: 8px;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
      <span>Attention : Aucune sauvegarde de vos données n'a été effectuée.</span>
    `;
    banner.style.display = "flex";
  } else {
    const days = getDaysSinceLastBackup();
    if (days !== null && days >= reminderDays) {
      document.getElementById("backup-alert-text").innerHTML = `
        <svg viewBox="0 0 24 24" class="alert-icon" style="fill: var(--warning-text); margin-right: 8px;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
        <span>Attention : Votre dernière sauvegarde remonte à <strong>${days}</strong> ${days > 1 ? 'jours' : 'jour'} (limite configurée à ${reminderDays} jours).</span>
      `;
      banner.style.display = "flex";
    } else {
      banner.style.display = "none";
    }
  }
}

function renderBackupView() {
  const lastBackup = appState.settings.last_backup_date;
  const reminderDays = appState.settings.backup_reminder_days || 7;

  // Update date text
  const dateEl = document.getElementById("backup-status-date");
  if (dateEl) {
    dateEl.textContent = lastBackup ? `${formatLocalDateToFrench(lastBackup)} (${lastBackup})` : "Aucune sauvegarde effectuée";
  }

  // Update status badge
  const badgeContainer = document.getElementById("backup-status-badge-container");
  if (badgeContainer) {
    if (appState.activities.length === 0) {
      badgeContainer.innerHTML = `<span class="badge badge-info">Aucune donnée à sauvegarder</span>`;
    } else if (!lastBackup) {
      badgeContainer.innerHTML = `<span class="badge badge-danger">Non sauvegardé</span>`;
    } else {
      const days = getDaysSinceLastBackup();
      if (days !== null && days >= reminderDays) {
        badgeContainer.innerHTML = `<span class="badge badge-warning">Sauvegarde requise</span>`;
      } else {
        badgeContainer.innerHTML = `<span class="badge badge-success">À jour</span>`;
      }
    }
  }

  // Update reminder input value
  const inputEl = document.getElementById("backup-reminder-days-input");
  if (inputEl) {
    inputEl.value = reminderDays;
  }
}

// Generate structured excel matching the original template
function exportToExcel() {
  // Helper to convert column index to letter
  function getExcelColName(colIdx) {
    let temp, letter = "";
    while (colIdx > 0) {
      temp = (colIdx - 1) % 26;
      letter = String.fromCharCode(65 + temp) + letter;
      colIdx = (colIdx - temp - 1) / 26;
    }
    return letter;
  }

  try {
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
      if (act.name.trim() === "") return false;
      const actYear = getFiscalYear(act.date_start);
      const actQuarter = getQuarterNumber(act.date_start);
      return (actYear === appState.selected_year) && appState.selected_quarters.includes(actQuarter);
    });

    // Add activities rows
    activeActivities.forEach((act, rIdx) => {
      const isFilled = act.name.trim() !== "";
      const row = [];

      row.push(act.id); // NUMERO ACTIVITE
      row.push(isFilled ? act.responsable : ""); // RESPONSABLE FACTURATION
      row.push(isFilled ? act.name : ""); // NOM DE L'ACTIVITÉ
      row.push(isFilled ? act.date_start : ""); // DATE DÉBUT
      row.push(isFilled ? act.date_end : ""); // DATE FIN

      // Nbre jour occupation (written as formula in row index rIdx + 2 since index 1 is headers)
      const excelRow = rIdx + 2;
      row.push({ t: 'n', f: `E${excelRow}-D${excelRow}+1` });

      row.push(isFilled ? act.client_type : ""); // Client interne ou externe
      row.push(isFilled ? (act.category || "") : ""); // CATÉGORIE (champ retiré du formulaire, conservé vide pour ne pas décaler les colonnes)
      row.push(isFilled ? (act.rooms || []).map(r => r.name).join(", ") : ""); // SALLE
      row.push(isFilled ? act.remi_hours : 0); // TEMPS RÉMI
      row.push(isFilled ? act.department : ""); // DÉPARTEMENT

      // PRIX SALLE SANS FRAIS
      // Chaque salle a maintenant son propre tarif et sa propre période, donc ce
      // n'est plus un simple produit "jours × tarif fixe" exprimable en formule
      // Excel uniforme : on calcule directement la valeur en JS.
      row.push(isFilled && act.client_type === "interne" ? getRoomsTariffTotal(act) : 0);

      row.push(isFilled ? getActivityReferences(act) : ""); // NUMÉRO DE FACTURE... (regroupé par compte)

      // Distribute amounts to matching account columns
      accountsOrder.forEach(code => {
        const dist = act.distributions.find(d => d.account_code === code);
        row.push(dist ? dist.amount : 0);
      });

      // REVENUS TOTAL RÉÈL (written as formula summing distributions)
      // distributions columns start at column index 13 (N) and end at headers.length - 2
      // Let's convert column indices to Excel column letters!

      const firstDistCol = getExcelColName(13 + 1); // 1-based index (N)
      const lastDistCol = getExcelColName(13 + accountsOrder.length); // End of accounts

      row.push({ t: 'n', f: `SUM(${firstDistCol}${excelRow}:${lastDistCol}${excelRow})` });

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
      totalRow.push({ t: 'n', f: `SUM(${colLetter}${startRow}:${colLetter}${endRow})` });
    });

    const totalColLetter = getExcelColName(13 + accountsOrder.length + 1);
    totalRow.push({ t: 'n', f: `SUM(${totalColLetter}${startRow}:${totalColLetter}${endRow})` });

    sheetData.push(totalRow);

    const ws = XLSX.utils.aoa_to_sheet(sheetData);

    // Adjust columns widths
    ws['!cols'] = [
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
      { wch: 20 }  // Facture/RI
    ];

    // Push account columns sizes
    accountsOrder.forEach(() => ws['!cols'].push({ wch: 18 }));
    ws['!cols'].push({ wch: 20 }); // Total revenue

    XLSX.utils.book_append_sheet(wb, ws, "ACTIVITÉS");

    // Sheet 2: Configuration Salles (une ligne par cellule de la grille tarifaire active)
    const roomsData = [["SALLE", "GRILLE (ENTRÉE EN VIGUEUR)", "TARIF", "MONTANT ($/JOUR)"]];
    appState.settings.rooms.forEach(r => {
      const grid = getActivePricingGrid(r, "");
      const tarifs = grid ? getFlattenedRoomTarifs(r, "") : [];
      (tarifs.length ? tarifs : [{ description: "", amount: "" }]).forEach(t => {
        roomsData.push([r.name, grid ? (grid.effective_date || "Depuis toujours") : "", t.description, t.amount]);
      });
    });
    const wsRooms = XLSX.utils.aoa_to_sheet(roomsData);
    XLSX.utils.book_append_sheet(wb, wsRooms, "SALLES");

    // Trigger download: includes selected period in filename
    const qStr = appState.selected_quarters.sort().map(q => `T${q}`).join("-");
    const filename = `compta_marie_rapport_${appState.selected_year}_${qStr || 'aucun'}_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, filename);
  } catch (err) {
    console.error(err);
    alert("Erreur lors de l'export Excel : " + err.message);
  }
}
