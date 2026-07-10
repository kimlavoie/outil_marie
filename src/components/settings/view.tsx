import { useEffect, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useSharedBackdrop } from "./common.tsx";
import { AccountsPanel, AccountModal } from "./accounts.tsx";
import { RoomsPanel, RoomModal } from "./rooms.tsx";
import { DepartmentsPanel, DeptModal } from "./departments.tsx";
import { SalariesPanel, SalaryModal } from "./salaries.tsx";
import { ServicesPanel, ServiceModal } from "./services.tsx";
import { GlobalTasksPanel, GlobalTaskModal } from "./global-tasks.tsx";
import { SchedulableTasksPanel, SchedulableTaskModal } from "./schedulable-tasks.tsx";

type Command =
  | { type: "openPanel"; panel: string; seq: number }
  | { type: "openAccountModal"; code: string; seq: number }
  | { type: "openDeptModal"; name: string; seq: number }
  | { type: "closeAll"; seq: number }
  | null;

// Remembers which settings tab (and, if any, which entity modal within it) the user had open, so
// reloading/reopening the app drops them back exactly where they left off — same intent as
// financials.ts's drawer UI persistence, kept local to this file since it's the only place that
// knows about settings tabs/modals.
const SETTINGS_UI_KEY = "outil_marie_settings_ui";

type SettingsModalPanel = "accounts" | "rooms" | "departments" | "salaries" | "services" | "global-tasks" | "schedulable-tasks";

function loadSavedSettingsUi(): { tab: string; modal: { panel: SettingsModalPanel; key: string | null } | null } {
  try {
    const raw = localStorage.getItem(SETTINGS_UI_KEY);
    if (!raw) return { tab: "accounts", modal: null };
    const parsed = JSON.parse(raw);
    return { tab: parsed.tab || "accounts", modal: parsed.modal || null };
  } catch {
    return { tab: "accounts", modal: null };
  }
}

function persistSettingsUi(tab: string, modal: { panel: SettingsModalPanel; key: string | null } | null) {
  localStorage.setItem(SETTINGS_UI_KEY, JSON.stringify({ tab, modal }));
}

function SettingsView({ command }: { command: Command }) {
  const [, setVersion] = useState(0);
  const bump = () => setVersion(v => v + 1);

  const savedUiRef = useRef(loadSavedSettingsUi());
  const savedModal = savedUiRef.current.modal;

  const [activeTab, setActiveTabRaw] = useState(savedUiRef.current.tab);
  const [accountModalCode, setAccountModalCode] = useState<string | null | undefined>(
    savedModal?.panel === "accounts" ? savedModal.key : undefined
  );
  const [roomModalName, setRoomModalName] = useState<string | null | undefined>(savedModal?.panel === "rooms" ? savedModal.key : undefined);
  const [deptModalName, setDeptModalName] = useState<string | null | undefined>(
    savedModal?.panel === "departments" ? savedModal.key : undefined
  );
  const [salaryModalId, setSalaryModalId] = useState<string | null | undefined>(
    savedModal?.panel === "salaries" ? savedModal.key : undefined
  );
  const [serviceModalId, setServiceModalId] = useState<string | null | undefined>(
    savedModal?.panel === "services" ? savedModal.key : undefined
  );
  const [globalTaskModalId, setGlobalTaskModalId] = useState<string | null | undefined>(
    savedModal?.panel === "global-tasks" ? savedModal.key : undefined
  );
  const [schedulableTaskModalId, setSchedulableTaskModalId] = useState<string | null | undefined>(
    savedModal?.panel === "schedulable-tasks" ? savedModal.key : undefined
  );

  // Wraps setActiveTab so every tab switch is persisted immediately (any modal open on the
  // previous tab is dropped, since a modal is only ever opened from its own tab's panel).
  const setActiveTab = (tab: string) => {
    setActiveTabRaw(tab);
    persistSettingsUi(tab, null);
  };

  // Generic modal setter used by every panel/modal below: updates the given panel's modal state
  // and persists it (or clears the persisted modal when closed) in one place.
  function setModal(panel: SettingsModalPanel, setter: (v: string | null | undefined) => void, value: string | null | undefined) {
    setter(value);
    persistSettingsUi(activeTab, value === undefined ? null : { panel, key: value });
  }

  const lastSeqRef = useRef(0);
  useEffect(() => {
    if (!command || command.seq === lastSeqRef.current) return;
    lastSeqRef.current = command.seq;
    if (command.type === "openPanel") {
      setActiveTab(command.panel);
    } else if (command.type === "openAccountModal") {
      setActiveTabRaw("accounts");
      setModal("accounts", setAccountModalCode, command.code);
    } else if (command.type === "openDeptModal") {
      setActiveTabRaw("departments");
      setModal("departments", setDeptModalName, command.name);
    } else if (command.type === "closeAll") {
      setAccountModalCode(undefined);
      setRoomModalName(undefined);
      setDeptModalName(undefined);
      setSalaryModalId(undefined);
      setServiceModalId(undefined);
      setGlobalTaskModalId(undefined);
      setSchedulableTaskModalId(undefined);
      persistSettingsUi(activeTab, null);
    }
  }, [command]);

  const anyModalOpen =
    accountModalCode !== undefined ||
    roomModalName !== undefined ||
    deptModalName !== undefined ||
    salaryModalId !== undefined ||
    serviceModalId !== undefined ||
    globalTaskModalId !== undefined ||
    schedulableTaskModalId !== undefined;
  useSharedBackdrop(anyModalOpen);

  const tabs: { key: string; label: string }[] = [
    { key: "accounts", label: "Comptes GL" },
    { key: "rooms", label: "Salles & Tarifs" },
    { key: "departments", label: "Départements" },
    { key: "salaries", label: "Salaires" },
    { key: "services", label: "Équipements" },
    { key: "global-tasks", label: "Tâches globales" },
    { key: "schedulable-tasks", label: "Tâches programmables" }
  ];

  return (
    <>
      <div className="settings-container">
        <aside className="settings-tabs">
          {tabs.map(t => (
            <button key={t.key} className={`settings-tab-btn${activeTab === t.key ? " active" : ""}`} onClick={() => setActiveTab(t.key)}>
              {t.label}
            </button>
          ))}
        </aside>

        <div className="settings-content">
          <AccountsPanel active={activeTab === "accounts"} bump={bump} openModal={v => setModal("accounts", setAccountModalCode, v)} />
          <RoomsPanel active={activeTab === "rooms"} openModal={v => setModal("rooms", setRoomModalName, v)} bump={bump} />
          <DepartmentsPanel active={activeTab === "departments"} openModal={v => setModal("departments", setDeptModalName, v)} bump={bump} />
          <SalariesPanel active={activeTab === "salaries"} openModal={v => setModal("salaries", setSalaryModalId, v)} bump={bump} />
          <ServicesPanel active={activeTab === "services"} openModal={v => setModal("services", setServiceModalId, v)} bump={bump} />
          <GlobalTasksPanel
            active={activeTab === "global-tasks"}
            openModal={v => setModal("global-tasks", setGlobalTaskModalId, v)}
            bump={bump}
          />
          <SchedulableTasksPanel
            active={activeTab === "schedulable-tasks"}
            openModal={v => setModal("schedulable-tasks", setSchedulableTaskModalId, v)}
            bump={bump}
          />
        </div>
      </div>

      <AccountModal code={accountModalCode} onClose={() => setModal("accounts", setAccountModalCode, undefined)} bump={bump} />
      <RoomModal name={roomModalName} onClose={() => setModal("rooms", setRoomModalName, undefined)} bump={bump} />
      <DeptModal name={deptModalName} onClose={() => setModal("departments", setDeptModalName, undefined)} bump={bump} />
      <SalaryModal id={salaryModalId} onClose={() => setModal("salaries", setSalaryModalId, undefined)} bump={bump} />
      <ServiceModal id={serviceModalId} onClose={() => setModal("services", setServiceModalId, undefined)} bump={bump} />
      <GlobalTaskModal id={globalTaskModalId} onClose={() => setModal("global-tasks", setGlobalTaskModalId, undefined)} bump={bump} />
      <SchedulableTaskModal
        id={schedulableTaskModalId}
        onClose={() => setModal("schedulable-tasks", setSchedulableTaskModalId, undefined)}
        bump={bump}
      />
    </>
  );
}

let root: Root | null = null;
let pendingCommand: Command = null;
let seqCounter = 0;

function mount() {
  const container = document.getElementById("settings-root");
  if (!container) return;
  if (!root) root = createRoot(container);
  root.render(<SettingsView command={pendingCommand} />);
}

function renderSettings() {
  mount();
}

function openSettingsPanel(panel: string) {
  pendingCommand = { type: "openPanel", panel, seq: ++seqCounter };
  mount();
}

function openAccountModal(code: string) {
  pendingCommand = { type: "openAccountModal", code, seq: ++seqCounter };
  mount();
}

function openDeptModal(name: string) {
  pendingCommand = { type: "openDeptModal", name, seq: ++seqCounter };
  mount();
}

function closeAllSettingsModals() {
  pendingCommand = { type: "closeAll", seq: ++seqCounter };
  mount();
}

export { renderSettings, openSettingsPanel, openAccountModal, openDeptModal, closeAllSettingsModals };
