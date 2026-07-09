import { useState, useEffect } from "react";
import { appState, saveDatabase, EVENT_TYPES, TECHNICAL_SERVICES } from "../../state/state.ts";
import { showToast, generateUid } from "../../utils/utils.ts";
import { DeleteIcon, Modal } from "./common.tsx";

interface TaskCondition {
  id: string;
  field: string;
  operator: string;
  value: string | number;
}

interface ConditionGroup {
  id: string;
  logic: "AND" | "OR";
  conditions: TaskCondition[];
}

interface SchedulableTask {
  id: string;
  description: string;
  groups_logic: "AND" | "OR";
  groups: ConditionGroup[];
}

const CONDITION_FIELDS: { value: string; label: string; type: "select" | "number" }[] = [
  { value: "event_type", label: "Type d'événement", type: "select" },
  { value: "client_type", label: "Type de client", type: "select" },
  { value: "department", label: "Département", type: "select" },
  { value: "room", label: "Salle réservée", type: "select" },
  { value: "technical_service", label: "Service technique réservé", type: "select" },
  { value: "service", label: "Équipement réservé", type: "select" },
  { value: "attendees_count", label: "Nombre de participants", type: "number" }
];

function fieldDef(field: string) {
  return CONDITION_FIELDS.find(f => f.value === field) || CONDITION_FIELDS[0];
}

function fieldOptions(field: string): { value: string; label: string }[] {
  switch (field) {
    case "event_type":
      return EVENT_TYPES;
    case "client_type":
      return [
        { value: "interne", label: "Interne" },
        { value: "externe", label: "Externe" }
      ];
    case "department":
      return (appState.settings.departments || []).map((d: string) => ({ value: d, label: d }));
    case "room":
      return (appState.settings.rooms || []).map((r: any) => ({ value: r.name, label: r.name }));
    case "technical_service":
      return TECHNICAL_SERVICES.map(s => ({ value: s, label: s }));
    case "service":
      return (appState.settings.services || []).map((s: any) => ({ value: s.id, label: s.name }));
    default:
      return [];
  }
}

function operatorOptions(field: string): { value: string; label: string }[] {
  if (fieldDef(field).type === "number") {
    return [
      { value: "gte", label: "≥ (au moins)" },
      { value: "lte", label: "≤ (au plus)" },
      { value: "equals", label: "= (exactement)" }
    ];
  }
  return [
    { value: "equals", label: "est" },
    { value: "not_equals", label: "n'est pas" }
  ];
}

function operatorSymbol(operator: string) {
  if (operator === "not_equals") return "≠";
  if (operator === "gte") return "≥";
  if (operator === "lte") return "≤";
  return "=";
}

function conditionLabel(c: TaskCondition) {
  const field = fieldDef(c.field);
  const valueLabel = field.type === "number" ? String(c.value) : fieldOptions(c.field).find(o => o.value === c.value)?.label || c.value;
  return `${field.label} ${operatorSymbol(c.operator)} ${valueLabel}`;
}

function groupLabel(group: ConditionGroup) {
  const parts = (group.conditions || []).map(conditionLabel);
  if (parts.length === 0) return "(aucune condition)";
  const joiner = group.logic === "OR" ? " OU " : " ET ";
  const joined = parts.join(joiner);
  return parts.length > 1 ? `(${joined})` : joined;
}

function taskSummary(task: SchedulableTask) {
  const groups = task.groups || [];
  if (groups.length === 0) return "Aucune condition définie — cette tâche ne sera jamais ajoutée automatiquement.";
  const joiner = task.groups_logic === "OR" ? " OU " : " ET ";
  return "Si " + groups.map(groupLabel).join(joiner);
}

function newCondition(): TaskCondition {
  return { id: generateUid("cond"), field: "event_type", operator: "equals", value: EVENT_TYPES[0]?.value || "" };
}

function newGroup(): ConditionGroup {
  return { id: generateUid("group"), logic: "AND", conditions: [newCondition()] };
}

function AndOrToggle({ value, onChange }: { value: "AND" | "OR"; onChange: (v: "AND" | "OR") => void }) {
  const btnStyle = (active: boolean) => ({
    padding: "4px 10px",
    fontSize: "0.75rem",
    borderRadius: 4,
    border: "1px solid var(--border)",
    background: active ? "var(--accent, #4f46e5)" : "transparent",
    color: active ? "#fff" : "var(--text-secondary)",
    cursor: "pointer"
  });
  return (
    <div style={{ display: "inline-flex", gap: 4 }}>
      <button type="button" style={btnStyle(value === "AND")} onClick={() => onChange("AND")}>
        ET (toutes)
      </button>
      <button type="button" style={btnStyle(value === "OR")} onClick={() => onChange("OR")}>
        OU (au moins une)
      </button>
    </div>
  );
}

export function SchedulableTasksPanel({
  active,
  openModal,
  bump
}: {
  active: boolean;
  openModal: (id: string | null) => void;
  bump: () => void;
}) {
  const tasks: SchedulableTask[] = appState.settings.schedulable_tasks || [];
  const deleteTask = (id: string) => {
    if (!confirm("Voulez-vous vraiment supprimer cette tâche programmable ?")) return;
    appState.settings.schedulable_tasks = tasks.filter(t => t.id !== id);
    saveDatabase();
    bump();
  };

  return (
    <div id="panel-schedulable-tasks" className={`settings-panel${active ? " active" : ""}`}>
      <div className="settings-panel-header">
        <h3 className="settings-panel-title">Tâches programmables</h3>
        <button
          className="btn btn-primary btn-secondary"
          style={{ padding: "6px 12px", fontSize: "0.8rem" }}
          onClick={() => openModal(null)}
        >
          + Ajouter une tâche programmable
        </button>
      </div>
      <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", margin: "0 0 12px" }}>
        Ces tâches sont ajoutées automatiquement à la liste de planification d'une activité, lors de l'insertion automatique des tâches,
        uniquement si les conditions définies ci-dessous sont respectées par cette activité.
      </p>
      <div className="settings-list">
        {tasks.map(t => (
          <div key={t.id} className="settings-list-item" onClick={() => openModal(t.id)}>
            <div className="settings-list-item-info">
              <span className="settings-list-item-desc">{t.description}</span>
              <span style={{ display: "block", fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: 2 }}>{taskSummary(t)}</span>
            </div>
            <div className="flex gap-2" onClick={e => e.stopPropagation()}>
              <button className="btn-icon" title="Supprimer" style={{ color: "var(--danger)" }} onClick={() => deleteTask(t.id)}>
                <DeleteIcon />
              </button>
            </div>
          </div>
        ))}
        {tasks.length === 0 && (
          <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>Aucune tâche programmable configurée.</p>
        )}
      </div>
    </div>
  );
}

export function SchedulableTaskModal({ id, onClose, bump }: { id: string | null | undefined; onClose: () => void; bump: () => void }) {
  const isOpen = id !== undefined;
  const originalId = id || "";
  const [desc, setDesc] = useState("");
  const [groupsLogic, setGroupsLogic] = useState<"AND" | "OR">("AND");
  const [groups, setGroups] = useState<ConditionGroup[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    const tasks: SchedulableTask[] = appState.settings.schedulable_tasks || [];
    const task = originalId ? tasks.find(t => t.id === originalId) : null;
    setDesc(task ? task.description : "");
    setGroupsLogic(task ? task.groups_logic : "AND");
    setGroups(task && task.groups.length ? task.groups.map(g => ({ ...g, conditions: g.conditions.map(c => ({ ...c })) })) : [newGroup()]);
  }, [isOpen, originalId]);

  const updateGroup = (groupId: string, patch: Partial<ConditionGroup>) => {
    setGroups(gs => gs.map(g => (g.id === groupId ? { ...g, ...patch } : g)));
  };
  const updateCondition = (groupId: string, condId: string, patch: Partial<TaskCondition>) => {
    setGroups(gs =>
      gs.map(g => (g.id === groupId ? { ...g, conditions: g.conditions.map(c => (c.id === condId ? { ...c, ...patch } : c)) } : g))
    );
  };
  const addCondition = (groupId: string) => {
    setGroups(gs => gs.map(g => (g.id === groupId ? { ...g, conditions: [...g.conditions, newCondition()] } : g)));
  };
  const removeCondition = (groupId: string, condId: string) => {
    setGroups(gs => gs.map(g => (g.id === groupId ? { ...g, conditions: g.conditions.filter(c => c.id !== condId) } : g)));
  };
  const addGroup = () => setGroups(gs => [...gs, newGroup()]);
  const removeGroup = (groupId: string) => setGroups(gs => gs.filter(g => g.id !== groupId));

  const onFieldChange = (groupId: string, condId: string, field: string) => {
    const options = fieldOptions(field);
    const isNumber = fieldDef(field).type === "number";
    updateCondition(groupId, condId, {
      field,
      operator: isNumber ? "gte" : "equals",
      value: isNumber ? 0 : options[0]?.value || ""
    });
  };

  const submit = () => {
    const description = desc.trim();
    if (!description) {
      showToast("Veuillez saisir une description.", "warning");
      return;
    }
    if (groups.length === 0 || groups.every(g => g.conditions.length === 0)) {
      showToast("Veuillez définir au moins une condition.", "warning");
      return;
    }

    const tasks: SchedulableTask[] = appState.settings.schedulable_tasks || [];
    const record: SchedulableTask = { id: originalId || generateUid("schedulable-task"), description, groups_logic: groupsLogic, groups };
    if (originalId) {
      const idx = tasks.findIndex(t => t.id === originalId);
      if (idx !== -1) tasks[idx] = record;
    } else {
      tasks.push(record);
    }
    appState.settings.schedulable_tasks = tasks;

    saveDatabase();
    onClose();
    bump();
  };

  return (
    <Modal
      id="schedulable-task-modal"
      titleId="schedulable-task-modal-title"
      title={originalId ? "Modifier la tâche programmable" : "Ajouter une tâche programmable"}
      isOpen={isOpen}
      onClose={onClose}
      onSubmit={submit}
      width="700px"
    >
      <div className="form-group">
        <label htmlFor="form-schedulable-task-desc">Description de la tâche</label>
        <input
          type="text"
          id="form-schedulable-task-desc"
          className="form-input"
          required
          placeholder="Ex: Réserver un interprète"
          value={desc}
          onChange={e => setDesc(e.target.value)}
        />
      </div>

      <div className="form-group">
        <label>Conditions</label>
        <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", margin: "0 0 8px" }}>
          Cette tâche est ajoutée automatiquement seulement si les conditions ci-dessous sont respectées par l'activité.
        </p>

        {groups.map((group, gi) => (
          <div key={group.id}>
            {gi > 0 && (
              <div style={{ display: "flex", justifyContent: "center", margin: "8px 0" }}>
                <AndOrToggle value={groupsLogic} onChange={setGroupsLogic} />
              </div>
            )}
            <div style={{ border: "1px solid var(--border)", borderRadius: 6, padding: 10, marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <AndOrToggle value={group.logic} onChange={logic => updateGroup(group.id, { logic })} />
                {groups.length > 1 && (
                  <button type="button" className="btn-icon" title="Supprimer ce groupe" onClick={() => removeGroup(group.id)}>
                    <DeleteIcon />
                  </button>
                )}
              </div>

              {group.conditions.map(cond => (
                <div
                  key={cond.id}
                  className="distribution-row"
                  style={{ gridTemplateColumns: "1.2fr 1fr 1.2fr auto", marginBottom: 6 }}
                >
                  <select
                    className="select-input"
                    style={{ padding: "8px 12px", fontSize: "0.85rem" }}
                    value={cond.field}
                    onChange={e => onFieldChange(group.id, cond.id, e.target.value)}
                  >
                    {CONDITION_FIELDS.map(f => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                  <select
                    className="select-input"
                    style={{ padding: "8px 12px", fontSize: "0.85rem" }}
                    value={cond.operator}
                    onChange={e => updateCondition(group.id, cond.id, { operator: e.target.value })}
                  >
                    {operatorOptions(cond.field).map(o => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  {fieldDef(cond.field).type === "number" ? (
                    <input
                      type="number"
                      className="form-input"
                      min={0}
                      style={{ padding: "8px 12px", fontSize: "0.85rem" }}
                      value={cond.value}
                      onChange={e => updateCondition(group.id, cond.id, { value: parseInt(e.target.value, 10) || 0 })}
                    />
                  ) : (
                    <select
                      className="select-input"
                      style={{ padding: "8px 12px", fontSize: "0.85rem" }}
                      value={cond.value}
                      onChange={e => updateCondition(group.id, cond.id, { value: e.target.value })}
                    >
                      {fieldOptions(cond.field).map(o => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  )}
                  <button
                    type="button"
                    className="btn-icon"
                    style={{ width: 14, height: 14 }}
                    onClick={() => removeCondition(group.id, cond.id)}
                  >
                    <DeleteIcon />
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: "4px 10px", fontSize: "0.75rem" }}
                onClick={() => addCondition(group.id)}
              >
                + Ajouter une condition
              </button>
            </div>
          </div>
        ))}

        <button type="button" className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: "0.75rem" }} onClick={addGroup}>
          + Ajouter un groupe de conditions
        </button>
      </div>
    </Modal>
  );
}
