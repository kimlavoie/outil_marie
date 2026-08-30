/**
 * settings-repository.ts - Single point of access to appState.settings' sub-collections (rooms,
 * salaries, services, accounts, departments, global_tasks, schedulable_tasks), mirroring
 * activities-repository.ts. Pure wrapper: no behavior change, no change to what gets persisted or
 * how. Each collection here maps naturally to its own Firestore collection later; this is the
 * first step towards that, so callers stop reaching into appState.settings.xxx directly.
 */
import { appState } from "./store.ts";
import type { Room, Salary, Service, Account, Tarif } from "./store.ts";

// Rooms (keyed by name — rooms have no separate id field)
function getRooms(): Room[] {
  return appState.settings.rooms;
}
function getRoomByName(name: string): Room | undefined {
  return appState.settings.rooms.find(r => r.name === name);
}

// Salaries (keyed by id)
function getSalaries(): Salary[] {
  return appState.settings.salaries;
}
function getSalaryById(id: string): Salary | undefined {
  return appState.settings.salaries.find(s => s.id === id);
}

// Services (keyed by id)
function getServices(): Service[] {
  return appState.settings.services;
}
function getServiceById(id: string): Service | undefined {
  return appState.settings.services.find(s => s.id === id);
}
function getServiceTarifById(service: Service, tarifId: string): Tarif | undefined {
  return service.tarifs.find(t => t.id === tarifId);
}

// Accounts (keyed by code)
function getAccounts(): Account[] {
  return appState.settings.accounts;
}
function getAccountByCode(code: string): Account | undefined {
  return appState.settings.accounts.find(a => a.code === code);
}

// Departments (plain string list, no id)
function getDepartments(): string[] {
  return appState.settings.departments;
}

// Global tasks (keyed by id)
function getGlobalTasks() {
  return appState.settings.global_tasks;
}

// Schedulable (auto-suggested planning) tasks (keyed by id)
function getSchedulableTasks() {
  return appState.settings.schedulable_tasks;
}

// Tax rates (singleton)
function getTaxRates() {
  return appState.settings.tax_rates;
}
function setTaxRates(rates: { tps: number; tvq: number }) {
  appState.settings.tax_rates = rates;
}

// --- Write-side (settings panels: add/edit/delete with saveDatabaseOrRollback) ---
// Each collection gets setXxx (wholesale replace, for rollback/sort), addXxx, replaceXxxAt (find
// by key, replace the whole record — used for edits, since the key itself can change, e.g.
// renaming a room/account/department) and removeXxx. Pure wrappers, same as the read side above.

function setRooms(rooms: Room[]) {
  appState.settings.rooms = rooms;
}
function addRoom(room: Room) {
  appState.settings.rooms.push(room);
}
function replaceRoomAt(originalName: string, room: Room): boolean {
  const idx = appState.settings.rooms.findIndex(r => r.name === originalName);
  if (idx === -1) return false;
  appState.settings.rooms[idx] = room;
  return true;
}
function removeRoomByName(name: string) {
  appState.settings.rooms = appState.settings.rooms.filter(r => r.name !== name);
}

function setSalaries(salaries: Salary[]) {
  appState.settings.salaries = salaries;
}
function addSalary(salary: Salary) {
  appState.settings.salaries.push(salary);
}
function replaceSalaryAt(originalId: string, salary: Salary): boolean {
  const idx = appState.settings.salaries.findIndex(s => s.id === originalId);
  if (idx === -1) return false;
  appState.settings.salaries[idx] = salary;
  return true;
}
function removeSalaryById(id: string) {
  appState.settings.salaries = appState.settings.salaries.filter(s => s.id !== id);
}

function setServices(services: Service[]) {
  appState.settings.services = services;
}
function addService(service: Service) {
  appState.settings.services.push(service);
}
function replaceServiceAt(originalId: string, service: Service): boolean {
  const idx = appState.settings.services.findIndex(s => s.id === originalId);
  if (idx === -1) return false;
  appState.settings.services[idx] = service;
  return true;
}
function removeServiceById(id: string) {
  appState.settings.services = appState.settings.services.filter(s => s.id !== id);
}

function setAccounts(accounts: Account[]) {
  appState.settings.accounts = accounts;
}
function addAccount(account: Account) {
  appState.settings.accounts.push(account);
}
function replaceAccountAt(originalCode: string, account: Account): boolean {
  const idx = appState.settings.accounts.findIndex(a => a.code === originalCode);
  if (idx === -1) return false;
  appState.settings.accounts[idx] = account;
  return true;
}
function removeAccountByCode(code: string) {
  appState.settings.accounts = appState.settings.accounts.filter(a => a.code !== code);
}
function sortAccountsByCode() {
  appState.settings.accounts.sort((a, b) => a.code.localeCompare(b.code));
}

function setDepartments(departments: string[]) {
  appState.settings.departments = departments;
}
function addDepartment(name: string) {
  appState.settings.departments.push(name);
}
function replaceDepartmentAt(originalName: string, newName: string): boolean {
  const idx = appState.settings.departments.findIndex(d => d === originalName);
  if (idx === -1) return false;
  appState.settings.departments[idx] = newName;
  return true;
}
function removeDepartment(name: string) {
  appState.settings.departments = appState.settings.departments.filter(d => d !== name);
}

function setGlobalTasks(tasks: ReturnType<typeof getGlobalTasks>) {
  appState.settings.global_tasks = tasks;
}
function addGlobalTask(task: ReturnType<typeof getGlobalTasks>[number]) {
  appState.settings.global_tasks.push(task);
}
function replaceGlobalTaskAt(originalId: string, task: ReturnType<typeof getGlobalTasks>[number]): boolean {
  const idx = appState.settings.global_tasks.findIndex(t => t.id === originalId);
  if (idx === -1) return false;
  appState.settings.global_tasks[idx] = task;
  return true;
}
function removeGlobalTaskById(id: string) {
  appState.settings.global_tasks = appState.settings.global_tasks.filter(t => t.id !== id);
}

function setSchedulableTasks(tasks: ReturnType<typeof getSchedulableTasks>) {
  appState.settings.schedulable_tasks = tasks;
}
function addSchedulableTask(task: ReturnType<typeof getSchedulableTasks>[number]) {
  appState.settings.schedulable_tasks.push(task);
}
function replaceSchedulableTaskAt(originalId: string, task: ReturnType<typeof getSchedulableTasks>[number]): boolean {
  const idx = appState.settings.schedulable_tasks.findIndex(t => t.id === originalId);
  if (idx === -1) return false;
  appState.settings.schedulable_tasks[idx] = task;
  return true;
}
function removeSchedulableTaskById(id: string) {
  appState.settings.schedulable_tasks = appState.settings.schedulable_tasks.filter(t => t.id !== id);
}

export {
  getRooms,
  getRoomByName,
  getSalaries,
  getSalaryById,
  getServices,
  getServiceById,
  getServiceTarifById,
  getAccounts,
  getAccountByCode,
  getDepartments,
  getGlobalTasks,
  getSchedulableTasks,
  getTaxRates,
  setTaxRates,
  setRooms,
  addRoom,
  replaceRoomAt,
  removeRoomByName,
  setSalaries,
  addSalary,
  replaceSalaryAt,
  removeSalaryById,
  setServices,
  addService,
  replaceServiceAt,
  removeServiceById,
  setAccounts,
  addAccount,
  replaceAccountAt,
  removeAccountByCode,
  sortAccountsByCode,
  setDepartments,
  addDepartment,
  replaceDepartmentAt,
  removeDepartment,
  setGlobalTasks,
  addGlobalTask,
  replaceGlobalTaskAt,
  removeGlobalTaskById,
  setSchedulableTasks,
  addSchedulableTask,
  replaceSchedulableTaskAt,
  removeSchedulableTaskById
};
