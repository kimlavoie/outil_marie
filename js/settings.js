/**
 * settings.js - Settings view controller: CRUD for GL accounts, rooms
 * (pricing grids, linked rooms/staff/fees/tasks), departments, and salaries
 * (versioned rate history)
 */

// In-memory working copy of the room modal's pricing grid versions while the modal is open.
// A 2D grid (parameters x client types) is awkward to serialize purely from the DOM on every
// keystroke, so we keep a plain JS model here and only re-render the grid section when its
// shape changes (a parameter/client type is added or removed, or the active version changes).
let roomModalState = { grids: [], activeGridIndex: 0 };

// Activates a settings tab + its panel (e.g. "accounts", "departments"), used both by the tab
// buttons themselves and by the global search's "jump to this record" navigation.
function openSettingsPanel(panel) {
  document
    .querySelectorAll(".settings-tab-btn")
    .forEach(b => b.classList.toggle("active", b.getAttribute("data-settings-panel") === panel));
  document.querySelectorAll(".settings-panel").forEach(p => p.classList.toggle("active", p.id === `panel-${panel}`));
}

function initSettingsHandlers() {
  // Settings panels switcher
  document.querySelectorAll(".settings-tab-btn").forEach(btn => {
    btn.addEventListener("click", () => openSettingsPanel(btn.getAttribute("data-settings-panel")));
  });

  // Modals close buttons
  document.getElementById("account-modal-close").addEventListener("click", () => closeSettingsModal("account"));
  document.getElementById("account-modal-cancel").addEventListener("click", () => closeSettingsModal("account"));
  document.getElementById("room-modal-close").addEventListener("click", () => closeSettingsModal("room"));
  document.getElementById("room-modal-cancel").addEventListener("click", () => closeSettingsModal("room"));
  document.getElementById("dept-modal-close").addEventListener("click", () => closeSettingsModal("dept"));
  document.getElementById("dept-modal-cancel").addEventListener("click", () => closeSettingsModal("dept"));

  // Accounts CRUD modal launch
  document.getElementById("add-account-btn").addEventListener("click", () => openAccountModal());
  document.getElementById("account-modal-submit").addEventListener("click", submitAccountForm);

  // Rooms CRUD modal launch
  document.getElementById("add-room-btn").addEventListener("click", () => openRoomModal());
  document.getElementById("room-modal-submit").addEventListener("click", submitRoomForm);

  // Pricing grid editor buttons
  document.getElementById("room-grid-add-version-btn").addEventListener("click", addRoomGridVersion);
  document.getElementById("room-grid-delete-version-btn").addEventListener("click", deleteRoomGridVersion);
  document.getElementById("room-grid-add-param-btn").addEventListener("click", addRoomGridParameter);
  document.getElementById("room-grid-add-clienttype-btn").addEventListener("click", addRoomGridClientType);
  document.getElementById("room-grid-effective-date").addEventListener("input", e => {
    roomModalState.grids[roomModalState.activeGridIndex].effective_date = e.target.value.trim();
    renderRoomGridVersionTabs();
  });

  // Salles liées: delegated toggle listener (survives the pills being rebuilt on every open)
  document.getElementById("room-linked-rooms-group").addEventListener("click", e => {
    const btn = e.target.closest(".pill-toggle");
    if (!btn) return;
    btn.classList.toggle("active");
  });

  // Personnel/frais/tâches liés
  document.getElementById("room-add-linked-staff-btn").addEventListener("click", () => addLinkedStaffRow());
  document.getElementById("room-add-linked-fee-btn").addEventListener("click", () => addLinkedFeeRow());
  document.getElementById("room-add-linked-task-btn").addEventListener("click", () => addLinkedTaskRow());

  // Departments CRUD modal launch
  document.getElementById("add-dept-btn").addEventListener("click", () => openDeptModal());
  document.getElementById("dept-modal-submit").addEventListener("click", submitDeptForm);

  // Salaries CRUD modal handlers
  document.getElementById("salary-modal-close").addEventListener("click", () => closeSettingsModal("salary"));
  document.getElementById("salary-modal-cancel").addEventListener("click", () => closeSettingsModal("salary"));
  document.getElementById("add-salary-btn").addEventListener("click", () => openSalaryModal());
  document.getElementById("salary-modal-submit").addEventListener("click", submitSalaryForm);
  document.getElementById("form-add-salary-rate-btn").addEventListener("click", () => addSalaryRateRow());

  // Services CRUD modal handlers
  document.getElementById("service-modal-close").addEventListener("click", () => closeSettingsModal("service"));
  document.getElementById("service-modal-cancel").addEventListener("click", () => closeSettingsModal("service"));
  document.getElementById("add-service-btn").addEventListener("click", () => openServiceModal());
  document.getElementById("service-modal-submit").addEventListener("click", submitServiceForm);
  document.getElementById("form-add-service-rate-btn").addEventListener("click", () => addServiceRateRow());

  // Global tasks CRUD modal handlers
  document.getElementById("global-task-modal-close").addEventListener("click", () => closeSettingsModal("global-task"));
  document.getElementById("global-task-modal-cancel").addEventListener("click", () => closeSettingsModal("global-task"));
  document.getElementById("add-global-task-btn").addEventListener("click", () => openGlobalTaskModal());
  document.getElementById("global-task-modal-submit").addEventListener("click", submitGlobalTaskForm);
}

function renderSettings() {
  renderAccountsList();
  renderRoomsList();
  renderDepartmentsList();
  renderSalariesList();
  renderServicesList();
  renderGlobalTasksList();
}

function closeSettingsModal(type) {
  document.getElementById(`${type}-modal`).classList.remove("active");
  document.getElementById("modal-backdrop").classList.remove("active");
}

function openSettingsModal(type) {
  document.getElementById(`${type}-modal`).classList.add("active");
  document.getElementById("modal-backdrop").classList.add("active");
}

// Fills a <select> with every configured GL account, keeping `selectedCode` selected if given
function buildGlAccountOptionsHtml(selectedCode = "") {
  let html = '<option value="">Aucun</option>';
  appState.settings.accounts.forEach(acc => {
    html += `<option value="${acc.code}" ${acc.code === selectedCode ? "selected" : ""}>${acc.code} (${acc.description})</option>`;
  });
  return html;
}

// Accounts settings
function renderAccountsList() {
  const container = document.getElementById("settings-accounts-list");
  container.innerHTML = "";

  appState.settings.accounts.forEach(acc => {
    container.innerHTML += `
      <div class="settings-list-item">
        <div class="settings-list-item-info">
          <span class="settings-list-item-code">${acc.code}</span>
          <span class="settings-list-item-desc">${acc.description}</span>
        </div>
        <div class="flex gap-2">
          <button class="btn-icon edit-acc-btn" data-code="${acc.code}" title="Modifier">
            <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
          </button>
          <button class="btn-icon delete-acc-btn" data-code="${acc.code}" title="Supprimer" style="color: var(--danger);">
            <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
          </button>
        </div>
      </div>
    `;
  });

  // Attach listeners
  document.querySelectorAll(".edit-acc-btn").forEach(btn => {
    btn.addEventListener("click", () => openAccountModal(btn.getAttribute("data-code")));
  });
  document.querySelectorAll(".delete-acc-btn").forEach(btn => {
    btn.addEventListener("click", () => deleteAccount(btn.getAttribute("data-code")));
  });
}

function openAccountModal(code = null) {
  const form = document.getElementById("account-form");
  const title = document.getElementById("account-modal-title");
  form.reset();

  if (code) {
    title.textContent = "Modifier le compte GL";
    const acc = appState.settings.accounts.find(a => a.code === code);
    if (acc) {
      document.getElementById("form-account-original-code").value = acc.code;
      document.getElementById("form-account-code").value = acc.code;
      document.getElementById("form-account-desc").value = acc.description;
    }
  } else {
    title.textContent = "Ajouter un compte GL";
    document.getElementById("form-account-original-code").value = "";
  }
  openSettingsModal("account");
}

function submitAccountForm(e) {
  e.preventDefault();
  const originalCode = document.getElementById("form-account-original-code").value;
  const newCode = document.getElementById("form-account-code").value.trim();
  const desc = document.getElementById("form-account-desc").value.trim();

  if (!newCode.match(/^\d{3}-\d{4}-\d{2}-\d{3}$/)) {
    alert("Le code du compte doit respecter le format XXX-XXXX-XX-XXX (ex: 892-9020-00-849).");
    return;
  }

  if (!desc) {
    alert("Veuillez saisir un libellé.");
    return;
  }

  const payload = { code: newCode, description: desc };

  if (originalCode) {
    // Edit Mode
    const idx = appState.settings.accounts.findIndex(a => a.code === originalCode);
    if (idx !== -1) {
      appState.settings.accounts[idx] = payload;

      // Update existing activity distributions that used this code!
      appState.activities.forEach(act => {
        act.distributions.forEach(dist => {
          if (dist.account_code === originalCode) dist.account_code = newCode;
        });
      });
    }
  } else {
    // New Mode: Check duplicate code
    if (appState.settings.accounts.some(a => a.code === newCode)) {
      alert("Ce code de compte existe déjà.");
      return;
    }
    appState.settings.accounts.push(payload);
  }

  // Sort accounts by code
  appState.settings.accounts.sort((a, b) => a.code.localeCompare(b.code));

  saveDatabase();
  closeSettingsModal("account");
  populateDropdowns();
  renderSettings();
}

function deleteAccount(code) {
  if (confirm(`Voulez-vous vraiment supprimer le compte ${code} ? Les ventilations liées à ce compte seront effacées.`)) {
    appState.settings.accounts = appState.settings.accounts.filter(a => a.code !== code);

    // Remove account from all activity distributions
    appState.activities.forEach(act => {
      act.distributions = act.distributions.filter(d => d.account_code !== code);
    });

    saveDatabase();
    populateDropdowns();
    renderSettings();
  }
}

/* ==========================================================================
   ROOMS SETTINGS (pricing grid, linked rooms/staff/fees/tasks)
   ========================================================================== */

function renderRoomsList() {
  const container = document.getElementById("settings-rooms-list");
  container.innerHTML = "";

  appState.settings.rooms.forEach(r => {
    const tarifs = getFlattenedRoomTarifs(r, "");
    const tarifsDesc = tarifs.length
      ? tarifs.map(t => `${t.description}: ${formatCurrency(t.amount)}/jour`).join(" · ")
      : "Aucun tarif défini";
    const versionCount = (r.pricing_grids || []).length;
    const versionNote = versionCount > 1 ? ` (${versionCount} versions)` : "";
    container.innerHTML += `
      <div class="settings-list-item">
        <div class="settings-list-item-info">
          <span class="room-color-swatch" style="background-color: ${getRoomColor(r.name)};" title="Couleur de la salle"></span>
          <span class="settings-list-item-code">${r.name}</span>
          <span class="settings-list-item-desc">${tarifsDesc}${versionNote}</span>
        </div>
        <div class="flex gap-2">
          <button class="btn-icon edit-room-btn" data-name="${r.name}" title="Modifier">
            <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
          </button>
          <button class="btn-icon delete-room-btn" data-name="${r.name}" title="Supprimer" style="color: var(--danger);">
            <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
          </button>
        </div>
      </div>
    `;
  });

  // Attach listeners
  document.querySelectorAll(".edit-room-btn").forEach(btn => {
    btn.addEventListener("click", () => openRoomModal(btn.getAttribute("data-name")));
  });
  document.querySelectorAll(".delete-room-btn").forEach(btn => {
    btn.addEventListener("click", () => deleteRoom(btn.getAttribute("data-name")));
  });
}

function openRoomModal(name = null) {
  const form = document.getElementById("room-form");
  const title = document.getElementById("room-modal-title");
  form.reset();

  const room = name ? appState.settings.rooms.find(r => r.name === name) : null;

  if (room) {
    title.textContent = "Modifier la salle";
    document.getElementById("form-room-original-name").value = room.name;
    document.getElementById("form-room-name").value = room.name;
    document.getElementById("form-room-color").value = getRoomColor(room.name);
    roomModalState.grids = JSON.parse(JSON.stringify(room.pricing_grids || []));
  } else {
    title.textContent = "Ajouter une salle";
    document.getElementById("form-room-original-name").value = "";
    document.getElementById("form-room-color").value = FALLBACK_ROOM_COLORS[appState.settings.rooms.length % FALLBACK_ROOM_COLORS.length];
    roomModalState.grids = [];
  }

  if (roomModalState.grids.length === 0) {
    roomModalState.grids.push({ id: generateUid("grid"), effective_date: "", parameters: [], client_types: [], cells: [] });
  }
  roomModalState.activeGridIndex = roomModalState.grids.length - 1;
  renderRoomGridEditor();

  // Salles liées: build one pill per other room
  const linkedRoomsContainer = document.getElementById("room-linked-rooms-group");
  const otherRooms = appState.settings.rooms.filter(r => !room || r.name !== room.name);
  linkedRoomsContainer.innerHTML = otherRooms
    .map(r => `<button type="button" class="pill-toggle" data-value="${r.name}">${r.name}</button>`)
    .join("");
  setPillGroupActive("room-linked-rooms-group", (room && room.linked_rooms) || []);

  // Personnel lié
  document.getElementById("room-linked-staff-list").innerHTML = "";
  ((room && room.linked_staff) || []).forEach(s => addLinkedStaffRow(s.salary_id, s.count));

  // Frais liés
  document.getElementById("room-linked-fees-list").innerHTML = "";
  ((room && room.linked_fees) || []).forEach(f => addLinkedFeeRow(f.description, f.amount, f.gl_account_code));

  // Tâches liées
  document.getElementById("room-linked-tasks-list").innerHTML = "";
  ((room && room.linked_tasks) || []).forEach(t => addLinkedTaskRow(t.description));

  openSettingsModal("room");
}

/* --- Pricing grid editor --- */

function renderRoomGridEditor() {
  renderRoomGridVersionTabs();
  document.getElementById("room-grid-effective-date").value = roomModalState.grids[roomModalState.activeGridIndex].effective_date || "";
  renderRoomGridParamsList();
  renderRoomGridClientTypesList();
  renderRoomGridCellsTable();
}

function renderRoomGridVersionTabs() {
  const container = document.getElementById("room-grid-version-tabs");
  container.innerHTML = roomModalState.grids
    .map(
      (g, i) => `
    <button type="button" class="pill-toggle grid-version-tab ${i === roomModalState.activeGridIndex ? "active" : ""}" data-index="${i}">
      ${g.effective_date ? g.effective_date : "Depuis toujours"}
    </button>
  `
    )
    .join("");
  container.querySelectorAll(".grid-version-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      roomModalState.activeGridIndex = parseInt(btn.getAttribute("data-index"), 10);
      renderRoomGridEditor();
    });
  });
}

function addRoomGridVersion() {
  const clone = JSON.parse(JSON.stringify(roomModalState.grids[roomModalState.activeGridIndex]));
  clone.id = generateUid("grid");
  clone.effective_date = "";
  roomModalState.grids.push(clone);
  roomModalState.activeGridIndex = roomModalState.grids.length - 1;
  renderRoomGridEditor();
}

function deleteRoomGridVersion() {
  if (roomModalState.grids.length <= 1) {
    alert("Une salle doit conserver au moins une version de grille tarifaire.");
    return;
  }
  if (!confirm("Supprimer cette version de la grille tarifaire ?")) return;
  roomModalState.grids.splice(roomModalState.activeGridIndex, 1);
  roomModalState.activeGridIndex = Math.max(0, roomModalState.activeGridIndex - 1);
  renderRoomGridEditor();
}

function renderRoomGridParamsList() {
  const grid = roomModalState.grids[roomModalState.activeGridIndex];
  const container = document.getElementById("room-grid-params-list");
  container.innerHTML = grid.parameters
    .map(
      (p, i) => `
    <div class="distribution-row room-tarif-row" data-param-id="${p.id}" style="grid-template-columns: 1fr 1fr auto;">
      <input type="text" class="form-input room-grid-param-name-input" value="${(p.name || "").replace(/"/g, "&quot;")}" placeholder="Ex: Journée" style="padding: 8px 12px; font-size: 0.85rem;">
      <select class="select-input room-grid-param-gl-select" style="padding: 8px 12px; font-size: 0.85rem;" title="Compte GL pour la facturation (optionnel)">
        ${buildGlAccountOptionsHtml(p.gl_account_code || "")}
      </select>
      <button type="button" class="btn-icon delete-room-grid-param-btn" data-index="${i}">
        <svg viewBox="0 0 24 24" style="width: 14px; height: 14px;"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
      </button>
    </div>
  `
    )
    .join("");

  container.querySelectorAll(".room-grid-param-name-input").forEach((input, i) => {
    input.addEventListener("input", () => {
      grid.parameters[i].name = input.value;
      renderRoomGridCellsTable();
    });
  });
  container.querySelectorAll(".room-grid-param-gl-select").forEach((select, i) => {
    select.addEventListener("change", () => {
      grid.parameters[i].gl_account_code = select.value;
    });
  });
  container.querySelectorAll(".delete-room-grid-param-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.getAttribute("data-index"), 10);
      const removedId = grid.parameters[idx].id;
      grid.parameters.splice(idx, 1);
      grid.cells = grid.cells.filter(c => c.parameter_id !== removedId);
      renderRoomGridParamsList();
      renderRoomGridCellsTable();
    });
  });
}

function addRoomGridParameter() {
  const grid = roomModalState.grids[roomModalState.activeGridIndex];
  grid.parameters.push({ id: generateUid("param"), name: "" });
  renderRoomGridParamsList();
  renderRoomGridCellsTable();
}

function renderRoomGridClientTypesList() {
  const grid = roomModalState.grids[roomModalState.activeGridIndex];
  const container = document.getElementById("room-grid-clienttypes-list");
  container.innerHTML = grid.client_types
    .map(
      (ct, i) => `
    <div class="distribution-row room-tarif-row" data-ct-id="${ct.id}" style="grid-template-columns: 1fr auto;">
      <input type="text" class="form-input room-grid-ct-name-input" value="${(ct.name || "").replace(/"/g, "&quot;")}" placeholder="Ex: Interne" style="padding: 8px 12px; font-size: 0.85rem;">
      <button type="button" class="btn-icon delete-room-grid-ct-btn" data-index="${i}">
        <svg viewBox="0 0 24 24" style="width: 14px; height: 14px;"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
      </button>
    </div>
  `
    )
    .join("");

  container.querySelectorAll(".room-grid-ct-name-input").forEach((input, i) => {
    input.addEventListener("input", () => {
      grid.client_types[i].name = input.value;
      renderRoomGridCellsTable();
    });
  });
  container.querySelectorAll(".delete-room-grid-ct-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.getAttribute("data-index"), 10);
      const removedId = grid.client_types[idx].id;
      grid.client_types.splice(idx, 1);
      grid.cells = grid.cells.filter(c => c.client_type_id !== removedId);
      renderRoomGridClientTypesList();
      renderRoomGridCellsTable();
    });
  });
}

function addRoomGridClientType() {
  const grid = roomModalState.grids[roomModalState.activeGridIndex];
  grid.client_types.push({ id: generateUid("ct"), name: "" });
  renderRoomGridClientTypesList();
  renderRoomGridCellsTable();
}

function renderRoomGridCellsTable() {
  const grid = roomModalState.grids[roomModalState.activeGridIndex];
  const wrapper = document.getElementById("room-grid-cells-table-wrapper");

  if (grid.parameters.length === 0 || grid.client_types.length === 0) {
    wrapper.innerHTML = `<div style="color: var(--text-muted); font-size: 0.85rem; padding: 12px 0;">Ajoutez au moins un paramètre et un type de client pour saisir les tarifs.</div>`;
    return;
  }

  const headerCells = grid.client_types.map(ct => `<th>${ct.name || "(sans nom)"}</th>`).join("");
  const bodyRows = grid.parameters
    .map(p => {
      const cells = grid.client_types
        .map(ct => {
          const cell = grid.cells.find(c => c.parameter_id === p.id && c.client_type_id === ct.id);
          const amount = cell ? cell.amount : "";
          return `<td><input type="number" min="0" step="0.01" class="form-input room-grid-cell-input" data-param-id="${p.id}" data-ct-id="${ct.id}" value="${amount}" style="padding: 6px 10px; font-size: 0.85rem; width: 100px;"></td>`;
        })
        .join("");
      return `<tr><td class="bold" style="white-space: nowrap; padding-right: 12px;">${p.name || "(sans nom)"}</td>${cells}</tr>`;
    })
    .join("");

  wrapper.innerHTML = `
    <table class="detail-dist-table">
      <thead><tr><th></th>${headerCells}</tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>
  `;

  wrapper.querySelectorAll(".room-grid-cell-input").forEach(input => {
    input.addEventListener("input", () => {
      const paramId = input.getAttribute("data-param-id");
      const ctId = input.getAttribute("data-ct-id");
      const amount = parseFloat(input.value) || 0;
      let cell = grid.cells.find(c => c.parameter_id === paramId && c.client_type_id === ctId);
      if (!cell) {
        cell = { parameter_id: paramId, client_type_id: ctId, amount };
        grid.cells.push(cell);
      } else {
        cell.amount = amount;
      }
    });
  });
}

/* --- Salles liées: personnel --- */

function addLinkedStaffRow(salaryId = "", count = 1) {
  const container = document.getElementById("room-linked-staff-list");
  const rowId = generateUid("linked-staff-row");

  const salaryOptionsHtml = (appState.settings.salaries || [])
    .map(s => `<option value="${s.id}" ${s.id === salaryId ? "selected" : ""}>${s.job}</option>`)
    .join("");

  const rowHtml = `
    <div id="${rowId}" class="distribution-row">
      <select class="select-input linked-staff-select" style="padding: 8px 12px; font-size: 0.85rem;">
        <option value="">Choisir un emploi...</option>
        ${salaryOptionsHtml}
      </select>
      <input type="number" class="form-input linked-staff-count-input" min="1" step="1" value="${count || 1}" placeholder="Quantité" style="padding: 8px 12px; font-size: 0.85rem;">
      <div></div>
      <button type="button" class="btn-icon delete-linked-staff-row-btn" data-row-id="${rowId}">
        <svg viewBox="0 0 24 24" style="width: 14px; height: 14px;"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
      </button>
    </div>
  `;
  container.insertAdjacentHTML("beforeend", rowHtml);
  document
    .getElementById(rowId)
    .querySelector(".delete-linked-staff-row-btn")
    .addEventListener("click", () => {
      document.getElementById(rowId).remove();
    });
}

/* --- Salles liées: frais --- */

function addLinkedFeeRow(description = "", amount = "", glAccountCode = "") {
  const container = document.getElementById("room-linked-fees-list");
  const rowId = generateUid("linked-fee-row");

  const rowHtml = `
    <div id="${rowId}" class="distribution-row">
      <input type="text" class="form-input linked-fee-desc-input" value="${description ? description.replace(/"/g, "&quot;") : ""}" placeholder="Ex: Montage et démontage" style="padding: 8px 12px; font-size: 0.85rem;">
      <input type="number" class="form-input linked-fee-amount-input" min="0" step="0.01" value="${amount !== "" ? amount : ""}" placeholder="Montant $" style="padding: 8px 12px; font-size: 0.85rem;">
      <select class="select-input linked-fee-gl-select" style="padding: 8px 12px; font-size: 0.85rem;">
        ${buildGlAccountOptionsHtml(glAccountCode)}
      </select>
      <button type="button" class="btn-icon delete-linked-fee-row-btn" data-row-id="${rowId}">
        <svg viewBox="0 0 24 24" style="width: 14px; height: 14px;"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
      </button>
    </div>
  `;
  container.insertAdjacentHTML("beforeend", rowHtml);
  document
    .getElementById(rowId)
    .querySelector(".delete-linked-fee-row-btn")
    .addEventListener("click", () => {
      document.getElementById(rowId).remove();
    });
}

/* --- Salles liées: tâches gestionnaire --- */

function addLinkedTaskRow(description = "") {
  const container = document.getElementById("room-linked-tasks-list");
  const rowId = generateUid("linked-task-row");

  const rowHtml = `
    <div id="${rowId}" class="distribution-row room-tarif-row" style="grid-template-columns: 1fr auto;">
      <input type="text" class="form-input linked-task-desc-input" value="${description ? description.replace(/"/g, "&quot;") : ""}" placeholder="Ex: Envoyer un courriel au responsable de la salle" style="padding: 8px 12px; font-size: 0.85rem;">
      <button type="button" class="btn-icon delete-linked-task-row-btn" data-row-id="${rowId}">
        <svg viewBox="0 0 24 24" style="width: 14px; height: 14px;"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
      </button>
    </div>
  `;
  container.insertAdjacentHTML("beforeend", rowHtml);
  document
    .getElementById(rowId)
    .querySelector(".delete-linked-task-row-btn")
    .addEventListener("click", () => {
      document.getElementById(rowId).remove();
    });
}

function submitRoomForm(e) {
  e.preventDefault();
  const originalName = document.getElementById("form-room-original-name").value;
  const newName = document.getElementById("form-room-name").value.trim().toUpperCase();
  const color = document.getElementById("form-room-color").value;

  if (!newName) {
    alert("Le nom de la salle est obligatoire.");
    return;
  }

  // Validate every pricing grid version has at least one named parameter and client type
  let gridErrorMsg = "";
  roomModalState.grids.forEach(g => {
    if (g.parameters.length === 0 || g.client_types.length === 0) {
      gridErrorMsg = "Chaque version de la grille tarifaire doit avoir au moins un paramètre et un type de client.";
    } else if (g.parameters.some(p => !p.name.trim()) || g.client_types.some(ct => !ct.name.trim())) {
      gridErrorMsg = "Veuillez nommer chaque paramètre et chaque type de client de la grille tarifaire.";
    }
  });
  if (gridErrorMsg) {
    alert(gridErrorMsg);
    return;
  }

  // Salles liées
  const linkedRooms = Array.from(document.querySelectorAll("#room-linked-rooms-group .pill-toggle.active")).map(b => b.dataset.value);

  // Personnel lié
  const linkedStaff = [];
  let staffErrorMsg = "";
  document.querySelectorAll("#room-linked-staff-list .distribution-row").forEach(row => {
    const salaryId = row.querySelector(".linked-staff-select").value;
    const countStr = row.querySelector(".linked-staff-count-input").value.trim();
    const count = parseInt(countStr, 10);
    if (!salaryId && !countStr) return;
    if (!salaryId) {
      staffErrorMsg = "Veuillez sélectionner un emploi pour chaque ligne de personnel lié.";
    } else if (!countStr || isNaN(count) || count < 1) {
      staffErrorMsg = "Veuillez saisir une quantité valide (au moins 1) pour chaque personnel lié.";
    } else {
      linkedStaff.push({ id: generateUid("linked-staff"), salary_id: salaryId, count });
    }
  });
  if (staffErrorMsg) {
    alert(staffErrorMsg);
    return;
  }

  // Frais liés
  const linkedFees = [];
  let feeErrorMsg = "";
  document.querySelectorAll("#room-linked-fees-list .distribution-row").forEach(row => {
    const desc = row.querySelector(".linked-fee-desc-input").value.trim();
    const amtStr = row.querySelector(".linked-fee-amount-input").value.trim();
    const amt = parseFloat(amtStr);
    const glCode = row.querySelector(".linked-fee-gl-select").value;
    if (!desc && !amtStr) return;
    if (!desc) {
      feeErrorMsg = "Veuillez saisir une description pour chaque frais lié.";
    } else if (!amtStr || isNaN(amt) || amt < 0) {
      feeErrorMsg = "Veuillez saisir un montant valide pour chaque frais lié.";
    } else {
      linkedFees.push({ id: generateUid("linked-fee"), description: desc, amount: amt, gl_account_code: glCode });
    }
  });
  if (feeErrorMsg) {
    alert(feeErrorMsg);
    return;
  }

  // Tâches gestionnaire liées
  const linkedTasks = [];
  document.querySelectorAll("#room-linked-tasks-list .distribution-row").forEach(row => {
    const desc = row.querySelector(".linked-task-desc-input").value.trim();
    if (desc) linkedTasks.push({ id: generateUid("linked-task"), description: desc });
  });

  const payload = {
    name: newName,
    color,
    pricing_grids: roomModalState.grids,
    linked_rooms: linkedRooms,
    linked_staff: linkedStaff,
    linked_fees: linkedFees,
    linked_tasks: linkedTasks
  };

  if (originalName) {
    const idx = appState.settings.rooms.findIndex(r => r.name === originalName);
    if (idx !== -1) {
      appState.settings.rooms[idx] = payload;

      // Update existing activities room name reference!
      appState.activities.forEach(act => {
        (act.reservations || []).forEach(r => {
          if (r.room_name === originalName) r.room_name = newName;
        });
      });
      // Update other rooms' linked_rooms references
      appState.settings.rooms.forEach(r => {
        r.linked_rooms = (r.linked_rooms || []).map(n => (n === originalName ? newName : n));
      });
    }
  } else {
    if (appState.settings.rooms.some(r => r.name === newName)) {
      alert("Cette salle existe déjà.");
      return;
    }
    appState.settings.rooms.push(payload);
  }

  saveDatabase();
  closeSettingsModal("room");
  populateDropdowns();
  renderSettings();
}

function deleteRoom(name) {
  if (confirm(`Voulez-vous vraiment supprimer la salle ${name} ?`)) {
    appState.settings.rooms = appState.settings.rooms.filter(r => r.name !== name);
    appState.settings.rooms.forEach(r => {
      r.linked_rooms = (r.linked_rooms || []).filter(n => n !== name);
    });
    saveDatabase();
    populateDropdowns();
    renderSettings();
  }
}

// Departments settings
function renderDepartmentsList() {
  const container = document.getElementById("settings-depts-list");
  container.innerHTML = "";

  appState.settings.departments.forEach(dept => {
    container.innerHTML += `
      <div class="settings-list-item">
        <div class="settings-list-item-info">
          <span class="settings-list-item-code" style="font-family: inherit;">${dept}</span>
        </div>
        <div class="flex gap-2">
          <button class="btn-icon edit-dept-btn" data-name="${dept}" title="Modifier">
            <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
          </button>
          <button class="btn-icon delete-dept-btn" data-name="${dept}" title="Supprimer" style="color: var(--danger);">
            <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
          </button>
        </div>
      </div>
    `;
  });

  // Attach listeners
  document.querySelectorAll(".edit-dept-btn").forEach(btn => {
    btn.addEventListener("click", () => openDeptModal(btn.getAttribute("data-name")));
  });
  document.querySelectorAll(".delete-dept-btn").forEach(btn => {
    btn.addEventListener("click", () => deleteDept(btn.getAttribute("data-name")));
  });
}

function openDeptModal(name = null) {
  const form = document.getElementById("dept-form");
  const title = document.getElementById("dept-modal-title");
  form.reset();

  if (name) {
    title.textContent = "Modifier le département";
    document.getElementById("form-dept-original-name").value = name;
    document.getElementById("form-dept-name").value = name;
  } else {
    title.textContent = "Ajouter un département";
    document.getElementById("form-dept-original-name").value = "";
  }
  openSettingsModal("dept");
}

function submitDeptForm(e) {
  e.preventDefault();
  const originalName = document.getElementById("form-dept-original-name").value;
  const name = document.getElementById("form-dept-name").value.trim();

  if (!name) {
    alert("Le nom du département est obligatoire.");
    return;
  }

  const duplicate = appState.settings.departments.some(
    d => d.toUpperCase() === name.toUpperCase() && d.toUpperCase() !== originalName.toUpperCase()
  );
  if (duplicate) {
    alert("Ce département existe déjà.");
    return;
  }

  if (originalName) {
    const idx = appState.settings.departments.findIndex(d => d === originalName);
    if (idx !== -1) {
      appState.settings.departments[idx] = name;

      // Update existing activities referencing the old department name
      appState.activities.forEach(act => {
        if (act.department === originalName) {
          act.department = name;
        }
      });
    }
  } else {
    appState.settings.departments.push(name);
  }

  appState.settings.departments.sort();

  saveDatabase();
  closeSettingsModal("dept");
  populateDropdowns();
  renderSettings();
}

function deleteDept(name) {
  if (confirm(`Voulez-vous vraiment supprimer le département "${name}" ?`)) {
    appState.settings.departments = appState.settings.departments.filter(d => d !== name);
    saveDatabase();
    populateDropdowns();
    renderSettings();
  }
}

/* ==========================================================================
   SALARIES SETTINGS (versioned rate history)
   ========================================================================== */

function renderSalariesList() {
  const container = document.getElementById("settings-salaries-list");
  if (!container) return;
  container.innerHTML = "";

  const salaries = appState.settings.salaries || [];
  salaries.forEach(sal => {
    const currentRate = getActiveSalaryRate(sal, "");
    const currentOvertimeRate = getActiveSalaryOvertimeRate(sal, "");
    const overtimeNote = currentOvertimeRate > 0 ? ` · ${parseFloat(currentOvertimeRate).toFixed(2)} $ / heure (temps sup.)` : "";
    const versionCount = (sal.rate_versions || []).length;
    const versionNote = versionCount > 1 ? ` (${versionCount} versions)` : "";
    container.innerHTML += `
      <div class="settings-list-item">
        <div class="settings-list-item-info">
          <span class="settings-list-item-code" style="font-family: inherit;">${sal.job}</span>
          <span class="settings-list-item-desc">${parseFloat(currentRate).toFixed(2)} $ / heure${overtimeNote}${versionNote}</span>
        </div>
        <div class="flex gap-2">
          <button class="btn-icon edit-salary-btn" data-id="${sal.id}" title="Modifier">
            <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
          </button>
          <button class="btn-icon delete-salary-btn" data-id="${sal.id}" title="Supprimer" style="color: var(--danger);">
            <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
          </button>
        </div>
      </div>
    `;
  });

  // Attach listeners
  document.querySelectorAll(".edit-salary-btn").forEach(btn => {
    btn.addEventListener("click", () => openSalaryModal(btn.getAttribute("data-id")));
  });
  document.querySelectorAll(".delete-salary-btn").forEach(btn => {
    btn.addEventListener("click", () => deleteSalary(btn.getAttribute("data-id")));
  });
}

function openSalaryModal(id = null) {
  const form = document.getElementById("salary-form");
  const title = document.getElementById("salary-modal-title");
  form.reset();
  document.getElementById("form-salary-rates-list").innerHTML = "";
  document.getElementById("form-salary-gl-account").innerHTML = buildGlAccountOptionsHtml();

  if (id) {
    title.textContent = "Modifier l'emploi";
    const salaries = appState.settings.salaries || [];
    const sal = salaries.find(s => s.id === id);
    if (sal) {
      document.getElementById("form-salary-original-id").value = sal.id;
      document.getElementById("form-salary-job").value = sal.job;
      document.getElementById("form-salary-gl-account").innerHTML = buildGlAccountOptionsHtml(sal.gl_account_code || "");
      (sal.rate_versions || []).forEach(v => addSalaryRateRow(v.effective_date, v.rate, v.overtime_rate));
    }
  } else {
    title.textContent = "Ajouter un emploi";
    document.getElementById("form-salary-original-id").value = "";
    addSalaryRateRow("", "", "");
  }
  openSettingsModal("salary");
}

function addSalaryRateRow(effectiveDate = "", rate = "", overtimeRate = "") {
  const container = document.getElementById("form-salary-rates-list");
  const rowId = generateUid("salary-rate-row");

  const rowHtml = `
    <div id="${rowId}" class="distribution-row" style="grid-template-columns: 1.4fr 1fr 1fr auto;">
      <input type="text" class="form-input salary-rate-date-input" value="${effectiveDate || ""}" placeholder="AAAA-MM-JJ (vide = depuis toujours)" style="padding: 8px 12px; font-size: 0.85rem;">
      <input type="number" class="form-input salary-rate-amount-input" min="0" step="0.01" value="${rate !== "" ? rate : ""}" placeholder="Taux régulier $/h" style="padding: 8px 12px; font-size: 0.85rem;">
      <input type="number" class="form-input salary-rate-overtime-input" min="0" step="0.01" value="${overtimeRate !== "" && overtimeRate !== undefined ? overtimeRate : ""}" placeholder="Taux temps sup. $/h" title="Taux horaire en temps supplémentaire (optionnel)" style="padding: 8px 12px; font-size: 0.85rem;">
      <button type="button" class="btn-icon delete-salary-rate-row-btn" data-row-id="${rowId}">
        <svg viewBox="0 0 24 24" style="width: 14px; height: 14px;"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
      </button>
    </div>
  `;
  container.insertAdjacentHTML("beforeend", rowHtml);
  document
    .getElementById(rowId)
    .querySelector(".delete-salary-rate-row-btn")
    .addEventListener("click", () => {
      document.getElementById(rowId).remove();
    });
}

function submitSalaryForm(e) {
  e.preventDefault();
  const originalId = document.getElementById("form-salary-original-id").value;
  const job = document.getElementById("form-salary-job").value.trim();
  const glAccountCode = document.getElementById("form-salary-gl-account").value;

  if (!job) {
    alert("Le nom de l'emploi est obligatoire.");
    return;
  }

  const rateVersions = [];
  let rateErrorMsg = "";
  document.querySelectorAll("#form-salary-rates-list .distribution-row").forEach(row => {
    const dateStr = row.querySelector(".salary-rate-date-input").value.trim();
    const rateStr = row.querySelector(".salary-rate-amount-input").value.trim();
    const overtimeRateStr = row.querySelector(".salary-rate-overtime-input").value.trim();
    const rate = parseFloat(rateStr);
    const overtimeRate = overtimeRateStr ? parseFloat(overtimeRateStr) : 0;
    if (!dateStr && !rateStr && !overtimeRateStr) return;
    if (!rateStr || isNaN(rate) || rate < 0) {
      rateErrorMsg = "Veuillez saisir un taux horaire valide (supérieur ou égal à 0) pour chaque version.";
    } else if (overtimeRateStr && (isNaN(overtimeRate) || overtimeRate < 0)) {
      rateErrorMsg = "Veuillez saisir un taux de temps supplémentaire valide (supérieur ou égal à 0), ou le laisser vide.";
    } else if (dateStr && !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      rateErrorMsg = "La date d'entrée en vigueur doit être au format AAAA-MM-JJ, ou vide.";
    } else {
      rateVersions.push({ id: generateUid("rv"), effective_date: dateStr, rate, overtime_rate: overtimeRate });
    }
  });

  if (rateErrorMsg) {
    alert(rateErrorMsg);
    return;
  }
  if (rateVersions.length === 0) {
    alert("Veuillez saisir au moins un taux horaire.");
    return;
  }

  const salaries = appState.settings.salaries || [];

  // Check duplicate job name
  const duplicate = salaries.some(s => s.job.toUpperCase() === job.toUpperCase() && s.id !== originalId);
  if (duplicate) {
    alert("Cet emploi existe déjà.");
    return;
  }

  if (originalId) {
    // Edit Mode
    const idx = salaries.findIndex(s => s.id === originalId);
    if (idx !== -1) {
      salaries[idx] = { id: originalId, job, gl_account_code: glAccountCode, rate_versions: rateVersions };
    }
  } else {
    // New Mode
    const newId = generateUid("salary");
    salaries.push({ id: newId, job, gl_account_code: glAccountCode, rate_versions: rateVersions });
  }

  // Sort salaries by job name
  salaries.sort((a, b) => a.job.localeCompare(b.job));

  appState.settings.salaries = salaries;

  saveDatabase();
  closeSettingsModal("salary");
  renderSettings();
}

function deleteSalary(id) {
  const salaries = appState.settings.salaries || [];
  const sal = salaries.find(s => s.id === id);
  const jobName = sal ? sal.job : "";

  if (confirm(`Voulez-vous vraiment supprimer l'emploi "${jobName}" ?`)) {
    appState.settings.salaries = salaries.filter(s => s.id !== id);
    saveDatabase();
    renderSettings();
  }
}

/* ==========================================================================
   SERVICES SETTINGS (fixed or hourly fees, versioned rate history)
   ========================================================================== */

function renderServicesList() {
  const container = document.getElementById("settings-services-list");
  if (!container) return;
  container.innerHTML = "";

  const services = appState.settings.services || [];
  services.forEach(svc => {
    const currentRate = getActiveServiceRate(svc, "");
    const versionCount = (svc.rate_versions || []).length;
    const versionNote = versionCount > 1 ? ` (${versionCount} versions)` : "";
    const unit = svc.type === "hourly" ? "$ / heure" : "$";
    container.innerHTML += `
      <div class="settings-list-item">
        <div class="settings-list-item-info">
          <span class="settings-list-item-code" style="font-family: inherit;">${svc.name}</span>
          <span class="settings-list-item-desc">${parseFloat(currentRate).toFixed(2)} ${unit}${versionNote}</span>
        </div>
        <div class="flex gap-2">
          <button class="btn-icon edit-service-btn" data-id="${svc.id}" title="Modifier">
            <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
          </button>
          <button class="btn-icon delete-service-btn" data-id="${svc.id}" title="Supprimer" style="color: var(--danger);">
            <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
          </button>
        </div>
      </div>
    `;
  });

  document.querySelectorAll(".edit-service-btn").forEach(btn => {
    btn.addEventListener("click", () => openServiceModal(btn.getAttribute("data-id")));
  });
  document.querySelectorAll(".delete-service-btn").forEach(btn => {
    btn.addEventListener("click", () => deleteService(btn.getAttribute("data-id")));
  });
}

function openServiceModal(id = null) {
  const form = document.getElementById("service-form");
  const title = document.getElementById("service-modal-title");
  form.reset();
  document.getElementById("form-service-rates-list").innerHTML = "";
  document.getElementById("form-service-gl-account").innerHTML = buildGlAccountOptionsHtml();

  if (id) {
    title.textContent = "Modifier le service";
    const services = appState.settings.services || [];
    const svc = services.find(s => s.id === id);
    if (svc) {
      document.getElementById("form-service-original-id").value = svc.id;
      document.getElementById("form-service-name").value = svc.name;
      document.getElementById("form-service-type").value = svc.type || "fixed";
      document.getElementById("form-service-gl-account").innerHTML = buildGlAccountOptionsHtml(svc.gl_account_code || "");
      (svc.rate_versions || []).forEach(v => addServiceRateRow(v.effective_date, v.rate));
    }
  } else {
    title.textContent = "Ajouter un service";
    document.getElementById("form-service-original-id").value = "";
    addServiceRateRow("", "");
  }
  openSettingsModal("service");
}

function addServiceRateRow(effectiveDate = "", rate = "") {
  const container = document.getElementById("form-service-rates-list");
  const rowId = generateUid("service-rate-row");

  const rowHtml = `
    <div id="${rowId}" class="distribution-row room-tarif-row">
      <input type="text" class="form-input service-rate-date-input" value="${effectiveDate || ""}" placeholder="AAAA-MM-JJ (vide = depuis toujours)" style="padding: 8px 12px; font-size: 0.85rem;">
      <input type="number" class="form-input service-rate-amount-input" min="0" step="0.01" value="${rate !== "" ? rate : ""}" placeholder="Montant $" style="padding: 8px 12px; font-size: 0.85rem;">
      <button type="button" class="btn-icon delete-service-rate-row-btn" data-row-id="${rowId}">
        <svg viewBox="0 0 24 24" style="width: 14px; height: 14px;"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
      </button>
    </div>
  `;
  container.insertAdjacentHTML("beforeend", rowHtml);
  document
    .getElementById(rowId)
    .querySelector(".delete-service-rate-row-btn")
    .addEventListener("click", () => {
      document.getElementById(rowId).remove();
    });
}

function submitServiceForm(e) {
  e.preventDefault();
  const originalId = document.getElementById("form-service-original-id").value;
  const name = document.getElementById("form-service-name").value.trim();
  const type = document.getElementById("form-service-type").value;
  const glAccountCode = document.getElementById("form-service-gl-account").value;

  if (!name) {
    alert("Le nom du service est obligatoire.");
    return;
  }

  const rateVersions = [];
  let rateErrorMsg = "";
  document.querySelectorAll("#form-service-rates-list .distribution-row").forEach(row => {
    const dateStr = row.querySelector(".service-rate-date-input").value.trim();
    const rateStr = row.querySelector(".service-rate-amount-input").value.trim();
    const rate = parseFloat(rateStr);
    if (!dateStr && !rateStr) return;
    if (!rateStr || isNaN(rate) || rate < 0) {
      rateErrorMsg = "Veuillez saisir un montant valide (supérieur ou égal à 0) pour chaque version.";
    } else if (dateStr && !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      rateErrorMsg = "La date d'entrée en vigueur doit être au format AAAA-MM-JJ, ou vide.";
    } else {
      rateVersions.push({ id: generateUid("rv"), effective_date: dateStr, rate });
    }
  });

  if (rateErrorMsg) {
    alert(rateErrorMsg);
    return;
  }
  if (rateVersions.length === 0) {
    alert("Veuillez saisir au moins un montant.");
    return;
  }

  const services = appState.settings.services || [];

  const duplicate = services.some(s => s.name.toUpperCase() === name.toUpperCase() && s.id !== originalId);
  if (duplicate) {
    alert("Ce service existe déjà.");
    return;
  }

  if (originalId) {
    const idx = services.findIndex(s => s.id === originalId);
    if (idx !== -1) {
      services[idx] = { id: originalId, name, type, gl_account_code: glAccountCode, rate_versions: rateVersions };
    }
  } else {
    const newId = generateUid("service");
    services.push({ id: newId, name, type, gl_account_code: glAccountCode, rate_versions: rateVersions });
  }

  services.sort((a, b) => a.name.localeCompare(b.name));

  appState.settings.services = services;

  saveDatabase();
  closeSettingsModal("service");
  renderSettings();
}

function deleteService(id) {
  const services = appState.settings.services || [];
  const svc = services.find(s => s.id === id);
  const serviceName = svc ? svc.name : "";

  if (confirm(`Voulez-vous vraiment supprimer le service "${serviceName}" ?`)) {
    appState.settings.services = services.filter(s => s.id !== id);
    saveDatabase();
    renderSettings();
  }
}

/* ==========================================================================
   GLOBAL TASKS SETTINGS (auto-inserted into every activity's planning checklist)
   ========================================================================== */

function renderGlobalTasksList() {
  const container = document.getElementById("settings-global-tasks-list");
  if (!container) return;
  container.innerHTML = "";

  const globalTasks = appState.settings.global_tasks || [];
  globalTasks.forEach(t => {
    container.innerHTML += `
      <div class="settings-list-item">
        <div class="settings-list-item-info">
          <span class="settings-list-item-desc">${t.description}</span>
        </div>
        <div class="flex gap-2">
          <button class="btn-icon edit-global-task-btn" data-id="${t.id}" title="Modifier">
            <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
          </button>
          <button class="btn-icon delete-global-task-btn" data-id="${t.id}" title="Supprimer" style="color: var(--danger);">
            <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
          </button>
        </div>
      </div>
    `;
  });

  document.querySelectorAll(".edit-global-task-btn").forEach(btn => {
    btn.addEventListener("click", () => openGlobalTaskModal(btn.getAttribute("data-id")));
  });
  document.querySelectorAll(".delete-global-task-btn").forEach(btn => {
    btn.addEventListener("click", () => deleteGlobalTask(btn.getAttribute("data-id")));
  });
}

function openGlobalTaskModal(id = null) {
  const form = document.getElementById("global-task-form");
  const title = document.getElementById("global-task-modal-title");
  form.reset();

  if (id) {
    title.textContent = "Modifier la tâche globale";
    const task = (appState.settings.global_tasks || []).find(t => t.id === id);
    if (task) {
      document.getElementById("form-global-task-original-id").value = task.id;
      document.getElementById("form-global-task-desc").value = task.description;
    }
  } else {
    title.textContent = "Ajouter une tâche globale";
    document.getElementById("form-global-task-original-id").value = "";
  }
  openSettingsModal("global-task");
}

function submitGlobalTaskForm(e) {
  e.preventDefault();
  const originalId = document.getElementById("form-global-task-original-id").value;
  const description = document.getElementById("form-global-task-desc").value.trim();

  if (!description) {
    alert("Veuillez saisir une description.");
    return;
  }

  const globalTasks = appState.settings.global_tasks || [];

  if (originalId) {
    const idx = globalTasks.findIndex(t => t.id === originalId);
    if (idx !== -1) globalTasks[idx].description = description;
  } else {
    globalTasks.push({ id: generateUid("global-task"), description });
  }

  appState.settings.global_tasks = globalTasks;

  saveDatabase();
  closeSettingsModal("global-task");
  renderSettings();
}

function deleteGlobalTask(id) {
  if (confirm("Voulez-vous vraiment supprimer cette tâche globale ?")) {
    appState.settings.global_tasks = (appState.settings.global_tasks || []).filter(t => t.id !== id);
    saveDatabase();
    renderSettings();
  }
}
