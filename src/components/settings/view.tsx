import { useCallback, useEffect, useRef, useState } from "react";
import { useSharedBackdrop } from "./common.tsx";
import { AccountsPanel, AccountModal } from "./accounts.tsx";
import { RoomsPanel, RoomModal } from "./rooms.tsx";
import { DepartmentsPanel, DeptModal } from "./departments.tsx";
import { SalariesPanel, SalaryModal } from "./salaries.tsx";
import { ServicesPanel, ServiceModal } from "./services.tsx";
import { GlobalTasksPanel, GlobalTaskModal } from "./global-tasks.tsx";
import { SchedulableTasksPanel, SchedulableTaskModal } from "./schedulable-tasks.tsx";
import { TaxesPanel } from "./taxes.tsx";

import type { Command } from "./mount.ts";

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

export function SettingsView({ command = null }: { command?: Command }) {
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

  const setActiveTab = (tab: string) => {
    setActiveTabRaw(tab);
    persistSettingsUi(tab, null);
  };

  const setModal = useCallback(
    (panel: SettingsModalPanel, setter: (v: string | null | undefined) => void, value: string | null | undefined) => {
      setter(value);
      persistSettingsUi(activeTab, value === undefined ? null : { panel, key: value });
    },
    [activeTab]
  );

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
  }, [command, activeTab, setModal]);

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
    { key: "salaries", label: "Main-d'oeuvre" },
    { key: "services", label: "Équipements" },
    { key: "global-tasks", label: "Tâches globales" },
    { key: "schedulable-tasks", label: "Tâches programmables" },
    { key: "taxes", label: "Taxes" }
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
          <DepartmentsPanel
            active={activeTab === "departments"}
            openModal={v => setModal("departments", setDeptModalName, v)}
            bump={bump}
          />
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
          <TaxesPanel active={activeTab === "taxes"} />
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
