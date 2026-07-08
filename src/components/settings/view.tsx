import { useEffect, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useSharedBackdrop } from "./common.tsx";
import { AccountsPanel, AccountModal } from "./accounts.tsx";
import { RoomsPanel, RoomModal } from "./rooms.tsx";
import { DepartmentsPanel, DeptModal } from "./departments.tsx";
import { SalariesPanel, SalaryModal } from "./salaries.tsx";
import { ServicesPanel, ServiceModal } from "./services.tsx";
import { GlobalTasksPanel, GlobalTaskModal } from "./global-tasks.tsx";

type Command =
  | { type: "openPanel"; panel: string; seq: number }
  | { type: "openAccountModal"; code: string; seq: number }
  | { type: "openDeptModal"; name: string; seq: number }
  | { type: "closeAll"; seq: number }
  | null;

function SettingsView({ command }: { command: Command }) {
  const [, setVersion] = useState(0);
  const bump = () => setVersion(v => v + 1);

  const [activeTab, setActiveTab] = useState("accounts");
  const [accountModalCode, setAccountModalCode] = useState<string | null | undefined>(undefined);
  const [roomModalName, setRoomModalName] = useState<string | null | undefined>(undefined);
  const [deptModalName, setDeptModalName] = useState<string | null | undefined>(undefined);
  const [salaryModalId, setSalaryModalId] = useState<string | null | undefined>(undefined);
  const [serviceModalId, setServiceModalId] = useState<string | null | undefined>(undefined);
  const [globalTaskModalId, setGlobalTaskModalId] = useState<string | null | undefined>(undefined);

  const lastSeqRef = useRef(0);
  useEffect(() => {
    if (!command || command.seq === lastSeqRef.current) return;
    lastSeqRef.current = command.seq;
    if (command.type === "openPanel") {
      setActiveTab(command.panel);
    } else if (command.type === "openAccountModal") {
      setActiveTab("accounts");
      setAccountModalCode(command.code);
    } else if (command.type === "openDeptModal") {
      setActiveTab("departments");
      setDeptModalName(command.name);
    } else if (command.type === "closeAll") {
      setAccountModalCode(undefined);
      setRoomModalName(undefined);
      setDeptModalName(undefined);
      setSalaryModalId(undefined);
      setServiceModalId(undefined);
      setGlobalTaskModalId(undefined);
    }
  }, [command]);

  const anyModalOpen =
    accountModalCode !== undefined ||
    roomModalName !== undefined ||
    deptModalName !== undefined ||
    salaryModalId !== undefined ||
    serviceModalId !== undefined ||
    globalTaskModalId !== undefined;
  useSharedBackdrop(anyModalOpen);

  const tabs: { key: string; label: string }[] = [
    { key: "accounts", label: "Comptes GL" },
    { key: "rooms", label: "Salles & Tarifs" },
    { key: "departments", label: "Départements" },
    { key: "salaries", label: "Salaires" },
    { key: "services", label: "Équipements" },
    { key: "global-tasks", label: "Tâches globales" }
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
          <AccountsPanel active={activeTab === "accounts"} bump={bump} openModal={setAccountModalCode} />
          <RoomsPanel active={activeTab === "rooms"} openModal={setRoomModalName} bump={bump} />
          <DepartmentsPanel active={activeTab === "departments"} openModal={setDeptModalName} bump={bump} />
          <SalariesPanel active={activeTab === "salaries"} openModal={setSalaryModalId} bump={bump} />
          <ServicesPanel active={activeTab === "services"} openModal={setServiceModalId} bump={bump} />
          <GlobalTasksPanel active={activeTab === "global-tasks"} openModal={setGlobalTaskModalId} bump={bump} />
        </div>
      </div>

      <AccountModal code={accountModalCode} onClose={() => setAccountModalCode(undefined)} bump={bump} />
      <RoomModal name={roomModalName} onClose={() => setRoomModalName(undefined)} bump={bump} />
      <DeptModal name={deptModalName} onClose={() => setDeptModalName(undefined)} bump={bump} />
      <SalaryModal id={salaryModalId} onClose={() => setSalaryModalId(undefined)} bump={bump} />
      <ServiceModal id={serviceModalId} onClose={() => setServiceModalId(undefined)} bump={bump} />
      <GlobalTaskModal id={globalTaskModalId} onClose={() => setGlobalTaskModalId(undefined)} bump={bump} />
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
