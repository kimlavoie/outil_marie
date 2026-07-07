/**
 * logger.js - Structured logging helper shared across modules.
 *
 * Every entry carries a module name, an action, and optional contextual data so
 * that a bug report ("ça a planté pendant l'export") can be traced back to
 * exactly what was happening, instead of a bare error message with no context.
 */

const LOG_HISTORY_LIMIT = 200;
const logHistory = [];

function pushHistory(level, module, action, details) {
  logHistory.push({ level, module, action, details, timestamp: new Date().toISOString() });
  if (logHistory.length > LOG_HISTORY_LIMIT) logHistory.shift();
}

// Formats the console line consistently: "[module] action — details"
function formatLine(module, action) {
  return `[${module}] ${action}`;
}

function logError(module, action, details) {
  pushHistory("error", module, action, details);
  console.error(formatLine(module, action), details !== undefined ? details : "");
}

function logWarn(module, action, details) {
  pushHistory("warn", module, action, details);
  console.warn(formatLine(module, action), details !== undefined ? details : "");
}

function logInfo(module, action, details) {
  pushHistory("info", module, action, details);
  console.info(formatLine(module, action), details !== undefined ? details : "");
}

// Returns a shallow copy of the recent log history (for diagnostics/export), most recent last.
function getLogHistory() {
  return logHistory.slice();
}

export { logError, logWarn, logInfo, getLogHistory };

if (typeof window !== "undefined") {
  window.logError = logError;
  window.logWarn = logWarn;
  window.logInfo = logInfo;
  window.getLogHistory = getLogHistory;
}
