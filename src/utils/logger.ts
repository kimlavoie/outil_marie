/**
 * logger.ts - Structured logging helper shared across modules.
 *
 * Every entry carries a module name, an action, and optional contextual data so
 * that a bug report ("ça a planté pendant l'export") can be traced back to
 * exactly what was happening, instead of a bare error message with no context.
 */

const LOG_HISTORY_LIMIT = 200;
const logHistory: any[] = [];

function pushHistory(level: string, module: string, action: string, details: any) {
  logHistory.push({ level, module, action, details, timestamp: new Date().toISOString() });
  if (logHistory.length > LOG_HISTORY_LIMIT) logHistory.shift();
}

// Formats the console line consistently: "[module] action — details"
function formatLine(module: string, action: string) {
  return `[${module}] ${action}`;
}

function logError(module: string, action: string, details?: any) {
  pushHistory("error", module, action, details);
  console.error(formatLine(module, action), details !== undefined ? details : "");
}

function logWarn(module: string, action: string, details?: any) {
  pushHistory("warn", module, action, details);
  console.warn(formatLine(module, action), details !== undefined ? details : "");
}

function logInfo(module: string, action: string, details?: any) {
  pushHistory("info", module, action, details);
  console.info(formatLine(module, action), details !== undefined ? details : "");
}

// Returns a shallow copy of the recent log history (for diagnostics/export), most recent last.
function getLogHistory() {
  return logHistory.slice();
}

export { logError, logWarn, logInfo, getLogHistory };
