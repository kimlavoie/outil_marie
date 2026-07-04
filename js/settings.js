/**
 * settings.js - Settings view controller: CRUD for GL accounts, rooms, and
 * departments
 */

function initSettingsHandlers() {
  // Settings panels switcher
  document.querySelectorAll(".settings-tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".settings-tab-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      const panel = btn.getAttribute("data-settings-panel");
      document.querySelectorAll(".settings-panel").forEach(p => p.classList.remove("active"));
      document.getElementById(`panel-${panel}`).classList.add("active");
    });
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
  document.getElementById("form-add-room-tarif-btn").addEventListener("click", () => addRoomTarifRow());

  // Departments CRUD modal launch
  document.getElementById("add-dept-btn").addEventListener("click", () => openDeptModal());
  document.getElementById("dept-modal-submit").addEventListener("click", submitDeptForm);

  // Salaries CRUD modal handlers
  document.getElementById("salary-modal-close").addEventListener("click", () => closeSettingsModal("salary"));
  document.getElementById("salary-modal-cancel").addEventListener("click", () => closeSettingsModal("salary"));
  document.getElementById("add-salary-btn").addEventListener("click", () => openSalaryModal());
  document.getElementById("salary-modal-submit").addEventListener("click", submitSalaryForm);
}

function renderSettings() {
  renderAccountsList();
  renderRoomsList();
  renderDepartmentsList();
  renderSalariesList();
}

function closeSettingsModal(type) {
  document.getElementById(`${type}-modal`).classList.remove("active");
  document.getElementById("modal-backdrop").classList.remove("active");
}

function openSettingsModal(type) {
  document.getElementById(`${type}-modal`).classList.add("active");
  document.getElementById("modal-backdrop").classList.add("active");
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

// Rooms settings
function renderRoomsList() {
  const container = document.getElementById("settings-rooms-list");
  container.innerHTML = "";

  appState.settings.rooms.forEach(r => {
    const tarifsDesc = (r.tarifs && r.tarifs.length)
      ? r.tarifs.map(t => `${t.description}: ${t.amount}$/jour`).join(" · ")
      : "Aucun tarif défini";
    container.innerHTML += `
      <div class="settings-list-item">
        <div class="settings-list-item-info">
          <span class="room-color-swatch" style="background-color: ${getRoomColor(r.name)};" title="Couleur de la salle"></span>
          <span class="settings-list-item-code">${r.name}</span>
          <span class="settings-list-item-desc">${tarifsDesc}</span>
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
  document.getElementById("form-room-tarifs-list").innerHTML = "";

  if (name) {
    title.textContent = "Modifier la salle";
    const r = appState.settings.rooms.find(room => room.name === name);
    if (r) {
      document.getElementById("form-room-original-name").value = r.name;
      document.getElementById("form-room-name").value = r.name;
      document.getElementById("form-room-color").value = getRoomColor(r.name);
      (r.tarifs || []).forEach(t => addRoomTarifRow(t.description, t.amount));
    }
  } else {
    title.textContent = "Ajouter une salle";
    document.getElementById("form-room-original-name").value = "";
    document.getElementById("form-room-color").value = FALLBACK_ROOM_COLORS[appState.settings.rooms.length % FALLBACK_ROOM_COLORS.length];
    addRoomTarifRow();
  }
  openSettingsModal("room");
}

// Adds one dynamic tarif row (description + montant/jour) to the room modal, mirrors addDistributionRow
function addRoomTarifRow(description = "", amount = "") {
  const container = document.getElementById("form-room-tarifs-list");
  const rowId = generateUid("room-tarif-row");

  const rowHtml = `
    <div id="${rowId}" class="distribution-row room-tarif-row">
      <input type="text" class="form-input room-tarif-desc-input" value="${description ? description.replace(/"/g, '&quot;') : ''}" placeholder="Description (ex: Interne)" style="padding: 8px 12px; font-size: 0.85rem;">
      <input type="number" class="form-input room-tarif-amount-input" min="0" step="0.01" value="${amount !== "" ? amount : ''}" placeholder="Montant $/jour" style="padding: 8px 12px; font-size: 0.85rem;">
      <button type="button" class="btn-icon delete-room-tarif-row-btn" data-row-id="${rowId}">
        <svg viewBox="0 0 24 24" style="width: 14px; height: 14px;"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
      </button>
    </div>
  `;

  container.insertAdjacentHTML("beforeend", rowHtml);

  const newRow = document.getElementById(rowId);
  newRow.querySelector(".delete-room-tarif-row-btn").addEventListener("click", () => {
    newRow.remove();
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

  // Build tarifs array, preserving existing ids where the room is being edited
  const originalRoom = originalName ? appState.settings.rooms.find(r => r.name === originalName) : null;
  const tarifs = [];
  let tarifErrorMsg = "";

  document.querySelectorAll("#form-room-tarifs-list .distribution-row").forEach((row, idx) => {
    const desc = row.querySelector(".room-tarif-desc-input").value.trim();
    const amtStr = row.querySelector(".room-tarif-amount-input").value.trim();
    const amt = parseFloat(amtStr);

    if (!desc && !amtStr) return; // skip fully empty rows
    if (!desc) {
      tarifErrorMsg = "Veuillez saisir une description pour chaque tarif.";
    } else if (!amtStr || isNaN(amt) || amt < 0) {
      tarifErrorMsg = "Veuillez saisir un montant valide pour chaque tarif.";
    } else {
      const existing = originalRoom && originalRoom.tarifs ? originalRoom.tarifs[idx] : null;
      tarifs.push({ id: existing ? existing.id : generateUid("tarif"), description: desc, amount: amt });
    }
  });

  if (tarifErrorMsg) {
    alert(tarifErrorMsg);
    return;
  }

  const payload = { name: newName, color, tarifs };

  if (originalName) {
    const idx = appState.settings.rooms.findIndex(r => r.name === originalName);
    if (idx !== -1) {
      appState.settings.rooms[idx] = payload;

      // Update existing activities room name reference!
      appState.activities.forEach(act => {
        (act.rooms || []).forEach(r => {
          if (r.name === originalName) r.name = newName;
        });
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

  const duplicate = appState.settings.departments.some(d =>
    d.toUpperCase() === name.toUpperCase() && d.toUpperCase() !== originalName.toUpperCase()
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

// Salaries settings
function renderSalariesList() {
  const container = document.getElementById("settings-salaries-list");
  if (!container) return;
  container.innerHTML = "";

  const salaries = appState.settings.salaries || [];
  salaries.forEach(sal => {
    container.innerHTML += `
      <div class="settings-list-item">
        <div class="settings-list-item-info">
          <span class="settings-list-item-code" style="font-family: inherit;">${sal.job}</span>
          <span class="settings-list-item-desc">${parseFloat(sal.rate).toFixed(2)} $ / heure</span>
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

  if (id) {
    title.textContent = "Modifier l'emploi";
    const salaries = appState.settings.salaries || [];
    const sal = salaries.find(s => s.id === id);
    if (sal) {
      document.getElementById("form-salary-original-id").value = sal.id;
      document.getElementById("form-salary-job").value = sal.job;
      document.getElementById("form-salary-rate").value = sal.rate;
    }
  } else {
    title.textContent = "Ajouter un emploi";
    document.getElementById("form-salary-original-id").value = "";
  }
  openSettingsModal("salary");
}

function submitSalaryForm(e) {
  e.preventDefault();
  const originalId = document.getElementById("form-salary-original-id").value;
  const job = document.getElementById("form-salary-job").value.trim();
  const rateStr = document.getElementById("form-salary-rate").value.trim();
  const rate = parseFloat(rateStr);

  if (!job) {
    alert("Le nom de l'emploi est obligatoire.");
    return;
  }

  if (isNaN(rate) || rate < 0) {
    alert("Veuillez saisir un taux horaire valide (supérieur ou égal à 0).");
    return;
  }

  const salaries = appState.settings.salaries || [];

  // Check duplicate job name
  const duplicate = salaries.some(s =>
    s.job.toUpperCase() === job.toUpperCase() && s.id !== originalId
  );
  if (duplicate) {
    alert("Cet emploi existe déjà.");
    return;
  }

  if (originalId) {
    // Edit Mode
    const idx = salaries.findIndex(s => s.id === originalId);
    if (idx !== -1) {
      salaries[idx] = { id: originalId, job, rate };
    }
  } else {
    // New Mode
    const newId = generateUid("salary");
    salaries.push({ id: newId, job, rate });
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
